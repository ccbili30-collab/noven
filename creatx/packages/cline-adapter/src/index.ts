import { lstat, readFile, realpath, stat } from "node:fs/promises"
import { basename, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"
import {
  buildConnectionUpdate,
  ClineCore,
  CoreSessionService,
  createUserInstructionConfigService,
  createTool,
  formatDisplayUserInput,
  SqliteSessionStore,
  type AgentEvent,
  type AgentPlugin,
  type CoreSessionEvent,
  type Message,
  type MessageWithMetadata,
  type SessionHistoryRecord,
  type ToolExecutors,
  type ToolApprovalRequest,
  type ToolApprovalResult,
  type UserInstructionConfigService,
} from "@cline/sdk"
import {
  CHAT_IMAGE_ATTACHMENT_MAX_BYTES,
  CHAT_IMAGE_ATTACHMENTS_MAX_BYTES,
  CREATX_INTERNAL_GROWTH_STAGE,
  CREATX_INTERNAL_SKILL_SEQUENCE,
  CREATX_GROWTH_ACTIVATION_MARKER,
  classifyRuntimeError,
  type ApprovalRequest,
  type CreatXError,
  type CreatXEvent,
  type CreatXToolContribution,
  type CreatXToolAudience,
  type CreatXToolExecutionContext,
  type MessageProjection,
  type ImageTaskStatus,
  type RunState,
  type GrowthStageIdentity,
  type GrowthStageFailure,
  type GrowthStageRunCommand,
  type GrowthStageRunResult,
  type GrowthWorkerProfile,
  type SessionKind,
  type SessionPermissionMode,
  type SessionPermissionPort,
  type SessionPermissionState,
  type TimelineActivity,
  type TimelineItem,
} from "@creatx/contracts"
import { MACHINE_TRUST_WARNING } from "./contracts.ts"
import type { ClineModelConnection, ClineSessionRecord, ClineUserAttachments } from "./contracts.ts"
export { MACHINE_TRUST_WARNING } from "./contracts.ts"
export type { ClineModelConnection, ClineSessionRecord, ClineUserAttachments } from "./contracts.ts"
import { createCreatXShellExecutor } from "./windows-shell.ts"
import { readGrowthWorkerMessages } from "./history-recovery.ts"
import { ProviderQuotaCooldown, providerConnectionKey } from "./provider-quota-cooldown.ts"
import { GrowthWorkerRetention } from "./growth-worker-retention.ts"
import { createProjectReadMediaBudgetExtension, ProjectImageReadTurnBudget } from "./provider-media-budget.ts"
import { projectPortableConversationV1, type ProjectCaseExportInput } from "./project-case-export.ts"

export { promoteClineLiveArchive, type PromoteClineLiveArchiveInput, type PromoteClineLiveArchiveResult } from "./live-archive.ts"
export { projectPortableConversationV1, type ProjectCaseExportInput } from "./project-case-export.ts"

export const CLINE_VERSION = "0.0.65" as const
const OWNER_GROWTH_TURN_GUIDANCE = `Only when the current user message contains a ${CREATX_GROWTH_ACTIVATION_MARKER} marker and run_growth is available, call run_growth exactly once before answering. Never imitate Growth work in prose. Treat its result as trusted terminal evidence, then give a concise final report in the user's language. Report deliveryGoalStatus as the final user-visible Growth status, never the pre-delivery goalStatus. Summarize ownerSummary faithfully, including unfinished text or image work.`
const OWNER_GROWTH_ISSUE_TURN_GUIDANCE = `Only when the current user message contains a ${CREATX_GROWTH_ACTIVATION_MARKER} marker and resolve_growth_issue is available, use that tool when the answer safely authorizes retry, repair, acceptance of existing output, or bypass. Choose the least destructive action that keeps the Growth run moving. Otherwise ask for the single missing fact without calling a tool.`
const OWNER_GROWTH_DELIVERY_GUIDANCE = `When the current user message contains a ${CREATX_GROWTH_ACTIVATION_MARKER} marker and no tools are available, only summarize the trusted Growth result already present in conversation history. Report deliveryGoalStatus as the final user-visible Growth status, never the pre-delivery goalStatus. Summarize ownerSummary faithfully, including unfinished text or image work. Do not propose or imitate additional work.`
const CLINE_PROJECT_MUTATION_TOOLS = new Set(["editor", "apply_patch", "run_commands"])
const SKILL_SEQUENCE_MAX_SLICES = 4
const SKILL_SEQUENCE_REPORT_TOOL = "report_skill_sequence_step"
const SKILL_SEQUENCE_IMAGE_WAIT_TOOL = "wait_for_skill_sequence_images"
const SKILL_SEQUENCE_IMAGE_WAIT_TIMEOUT_MS = 30 * 60_000
const SKILL_SEQUENCE_IMAGE_WAIT_POLL_MS = 1_000
const IMAGE_DELIVERABLE_MINIMUMS = new Map([
  ["creatx-draw-map", 1],
  ["creatx-build-character-gallery", 6],
  ["creatx-draw-comic", 1],
])

type SkillSequenceStepStatus = "completed" | "partial" | "blocked"

interface SkillSequenceStepReceipt {
  status: SkillSequenceStepStatus
  summary: string
  artifactPaths: string[]
  requiredImageTaskIds: string[]
  unresolved: string[]
}

interface ActiveSkillSequenceStep {
  sequenceRunId: string
  skillName: string
  index: number
  synchronousImagePaths: Set<string>
  submittedImageTaskIds: Set<string>
  receipt?: SkillSequenceStepReceipt
}

export interface ClineAdapterOptions {
  dataDir: string
  profileId?: string
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
  resolveModelConnection?: (providerId: string, modelId: string, profileId?: string) => ClineModelConnection | undefined
  fetch?: typeof fetch
  tools?: readonly CreatXToolContribution[]
  systemGuidance?: readonly string[]
  skillDirectories?: readonly string[]
  skills?: readonly string[]
  workerSkills?: Partial<Record<GrowthWorkerProfile, readonly string[]>>
  resolveProjectId?: (projectRoot: string) => string | undefined
  imageTaskStatus?: (projectId: string, imageTaskId: string) => Promise<ImageTaskStatus | undefined>
  sessionPermissions: SessionPermissionPort
  onEvent: (event: CreatXEvent) => void
}

type ClineFinishReason = Extract<AgentEvent, { type: "done" }>["reason"]

interface PendingApproval {
  request: ApprovalRequest
  resolve: (result: ToolApprovalResult) => void
}

export class ClineAdapter {
  private defaultConnection: ClineModelConnection
  private readonly resolveModelConnection: ClineAdapterOptions["resolveModelConnection"]
  private readonly store: SqliteSessionStore
  private readonly sessionService: CoreSessionService
  private readonly core: ClineCore
  private readonly providerDispatcher: EnvHttpProxyAgent
  private readonly onEvent: (event: CreatXEvent) => void
  private readonly tools: readonly CreatXToolContribution[]
  private readonly systemGuidance: readonly string[]
  private readonly skills: readonly string[]
  private readonly workerSkills: Partial<Record<GrowthWorkerProfile, readonly string[]>>
  private readonly userInstructionService: UserInstructionConfigService | undefined
  private readonly resolveProjectId: ((projectRoot: string) => string | undefined) | undefined
  private readonly imageTaskStatus: ((projectId: string, imageTaskId: string) => Promise<ImageTaskStatus | undefined>) | undefined
  private readonly sessionPermissions: SessionPermissionPort
  private readonly activeSessionIds = new Set<string>()
  private readonly runningSessionIds = new Set<string>()
  private readonly activeSkillSequenceSessions = new Set<string>()
  private readonly activeSkillSequenceSteps = new Map<string, ActiveSkillSequenceStep>()
  private readonly runningTurnSettlements = new Map<string, Promise<void>>()
  private readonly activeProjectIds = new Map<string, string>()
  private readonly activeProjectRoots = new Map<string, string>()
  private readonly activeGrowthStages = new Map<string, GrowthStageIdentity>()
  private readonly activeAudiences = new Map<string, CreatXToolAudience>()
  private readonly activeOwnerActivationIds = new Map<string, string>()
  private readonly growthStageFailures = new Map<string, Map<string, GrowthStageFailure>>()
  private readonly growthStageFailureObservers = new Map<string, (failure: GrowthStageFailure) => void>()
  private readonly growthOwnerSessionIds = new Map<string, string>()
  private readonly activeGrowthWorkerIds = new Map<string, Set<string>>()
  private readonly growthCooldownControllers = new Map<string, AbortController>()
  private readonly providerQuotaCooldown = new ProviderQuotaCooldown()
  private readonly sessionToolPolicyControllers = new Map<string, SessionToolPolicyController>()
  private readonly pendingApprovals = new Map<string, PendingApproval>()
  private readonly timelineProjector = new ClineTimelineProjector()
  private readonly growthWorkerRetention: GrowthWorkerRetention
  private readonly projectImageReadBudget: ProjectImageReadTurnBudget
  private readonly maintenanceErrors: string[] = []
  private readonly unsubscribe: () => void
  private sessionListInFlight: Promise<ClineSessionRecord[]> | undefined
  private disposed = false

  private constructor(options: ClineAdapterOptions, store: SqliteSessionStore, sessionService: CoreSessionService, core: ClineCore, providerDispatcher: EnvHttpProxyAgent, projectImageReadBudget: ProjectImageReadTurnBudget, userInstructionService?: UserInstructionConfigService) {
    this.defaultConnection = {
      ...(options.profileId ? { profileId: options.profileId } : {}),
      providerId: options.providerId,
      modelId: options.modelId,
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    }
    this.resolveModelConnection = options.resolveModelConnection
    this.store = store
    this.sessionService = sessionService
    this.core = core
    this.providerDispatcher = providerDispatcher
    this.onEvent = options.onEvent
    this.tools = [...(options.tools ?? []), this.skillSequenceImageWaitTool(), this.skillSequenceReportTool()]
    validateCreatXToolContributions(this.tools)
    this.systemGuidance = options.systemGuidance ?? []
    this.skills = options.skills ?? []
    this.workerSkills = options.workerSkills ?? {}
    this.userInstructionService = userInstructionService
    this.resolveProjectId = options.resolveProjectId
    this.imageTaskStatus = options.imageTaskStatus
    this.sessionPermissions = options.sessionPermissions
    this.growthWorkerRetention = new GrowthWorkerRetention(options.dataDir, store, (sessionId) => core.delete(sessionId))
    this.projectImageReadBudget = projectImageReadBudget
    this.unsubscribe = core.subscribe((event) => {
      const sourceSessionId = event.type === "agent_event" ? event.payload.sessionId : undefined
      const ownerSessionId = sourceSessionId ? this.growthOwnerSessionIds.get(sourceSessionId) ?? sourceSessionId : undefined
      const stage = sourceSessionId ? this.activeGrowthStages.get(sourceSessionId) : undefined
      const isGrowthWorker = Boolean(sourceSessionId && ownerSessionId !== sourceSessionId)
      const activity = sourceSessionId && isGrowthWorker
        ? {
            kind: "growth-worker" as const,
            activityId: stage?.attemptId ?? sourceSessionId,
            ...(stage?.ownerActivationId ? { ownerActivationId: stage.ownerActivationId } : {}),
            workItemId: stage?.workItemId ?? `stage:${sourceSessionId}`,
            title: stage?.workItemTitle ?? stage?.workItemId ?? "Growth 阶段",
          }
        : undefined
      const exposeFinal = !isGrowthWorker
      const toolFailure = stage ? growthStageFailureFromEvent(event) : undefined
      if (sourceSessionId && toolFailure) this.recordGrowthStageFailure(sourceSessionId, toolFailure)
      if (sourceSessionId && this.activeSkillSequenceSessions.has(sourceSessionId) && isMaxIterationsEvent(event)) return
      for (const projected of this.timelineProjector.project(event, ownerSessionId, sourceSessionId, activity, exposeFinal)) {
        if (projected.type === "runtime.error" && sourceSessionId && stage) {
          const existing = this.growthStageFailures.get(sourceSessionId)
          if (!existing?.size || !isToolFailureSummary(projected.error)) {
            this.recordGrowthStageFailure(sourceSessionId, { source: "runtime", error: projected.error })
          }
          continue
        }
        if (projected.type === "runtime.error" && shouldSuppressGrowthRecoverableError(projected.error, this.activeGrowthStages.has(projected.sessionId ?? ""))) continue
        this.emitEvent(projected)
      }
      if (sourceSessionId && isSuccessfulProjectMutation(event)) {
        const projectId = this.activeProjectIds.get(sourceSessionId)
        if (projectId) this.emitEvent({ type: "project.projection.invalidated", projectId, areas: ["files"] })
      }
    })
  }

  get providerId() {
    return this.defaultConnection.providerId
  }

  get modelId() {
    return this.defaultConnection.modelId
  }

  get configured() {
    return Boolean(this.defaultConnection.apiKey?.trim())
  }

  setDefaultConnection(connection: ClineModelConnection) {
    this.defaultConnection = requireModelConnection(connection)
  }

  static async create(options: ClineAdapterOptions) {
    validateCreatXToolContributions(options.tools ?? [])
    const skillDirectories = options.skillDirectories ?? []
    const skills = [...new Set([...(options.skills ?? []), ...Object.values(options.workerSkills ?? {}).flat()])]
    if (Boolean(skillDirectories.length) !== Boolean(skills.length)) {
      throw new Error("compatibility: Cline Skill directories and allowlist must be configured together")
    }
    const store = new SqliteSessionStore({ sessionsDir: join(options.dataDir, "database") })
    store.init()
    const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(options.dataDir, "sessions") })
    await sessionService.reconcileDeadSessions()
    const providerDispatcher = new EnvHttpProxyAgent()
    const userInstructionService = skillDirectories.length
      ? createUserInstructionConfigService({ skills: { directories: [...skillDirectories] } })
      : undefined
    if (userInstructionService) {
      await userInstructionService.start()
      if (!userInstructionService.hasConfiguredSkills(skills)) {
        userInstructionService.stop()
        store.close()
        await disposeProviderDispatcher(providerDispatcher)
        throw new Error(`compatibility: no configured Cline Skill matches the allowlist: ${skills.join(", ")}`)
      }
    }
    let adapter: ClineAdapter | undefined
    try {
      const projectImageReadBudget = new ProjectImageReadTurnBudget()
      const core = await ClineCore.create({
        backendMode: "local",
        clientName: "creatx-desktop",
        distinctId: "creatx-desktop",
        sessionService,
        fetch: options.fetch ?? createProviderFetch(providerDispatcher),
        capabilities: {
          toolExecutors: {
            bash: createCreatXShellExecutor(),
            readFile: createProjectFileReadExecutor((sessionId) => adapter?.activeProjectRoots.get(sessionId), projectImageReadBudget),
            webFetch: createProxyAwareWebFetchExecutor(providerDispatcher),
          },
          requestToolApproval: (request) => {
            if (!adapter) return { approved: false, reason: "CreatX adapter is not ready" }
            return adapter.requestApproval(request)
          },
        },
      })
      adapter = new ClineAdapter(options, store, sessionService, core, providerDispatcher, projectImageReadBudget, userInstructionService)
      await adapter.replayGrowthWorkerCleanup()
      return adapter
    } catch (error) {
      userInstructionService?.stop()
      store.close()
      await disposeProviderDispatcher(providerDispatcher)
      throw error
    }
  }

  async createProjectSession(project: { projectId: string; projectRoot: string; title?: string }): Promise<ClineSessionRecord> {
    this.requireReady()
    const title = project.title === undefined ? "新会话" : requireText(project.title, "title").slice(0, 120)
    const result = await this.startSession({ projectId: project.projectId, projectRoot: project.projectRoot, title, kind: "project", permissionMode: "free" })
    try {
      if (!this.store.get(result.sessionId)) {
        // Cline normally persists a root session on its first send. Growth intercepts
        // that first prompt, so persist the idle owner without invoking a Provider.
        await this.sessionService.createRootSessionWithArtifacts({
          sessionId: result.sessionId,
          source: "desktop",
          pid: process.pid,
          interactive: true,
          provider: this.providerId,
          model: this.modelId,
          cwd: project.projectRoot,
          workspaceRoot: project.projectRoot,
          enableTools: true,
          enableSpawn: false,
          enableTeams: false,
          metadata: {
            title,
            creatxProjectId: project.projectId,
            creatxProviderId: this.defaultConnection.providerId,
            creatxModelId: this.defaultConnection.modelId,
            ...(this.defaultConnection.profileId ? { creatxTextProfileId: this.defaultConnection.profileId } : {}),
          },
        })
        this.store.updateStatus(result.sessionId, "completed", 0)
      }
      const record = await this.core.get(result.sessionId)
      if (!record) throw new Error("session_missing: Cline did not persist the new session")
      return toSessionSummary(record, this.sessionPermissions.ensure(record.sessionId, "project"))
    } catch (error) {
      this.activeSessionIds.delete(result.sessionId)
      this.activeProjectIds.delete(result.sessionId)
      this.activeProjectRoots.delete(result.sessionId)
      this.sessionToolPolicyControllers.delete(result.sessionId)
      await this.core.delete(result.sessionId)
      throw error
    }
  }

  private async startSession(input: { projectId?: string; projectRoot: string; sessionId?: string; initialMessages?: Message[]; title: string; kind: SessionKind; permissionMode: SessionPermissionMode; growthOwnerSessionId?: string; growthGoalId?: string; growthGoalVersion?: number; ownerActivationId?: string; growthAttemptId?: string; growthWorkItemId?: string; growthWorkItemTitle?: string; growthWorkRootPath?: string; maxIterations?: number; directFileMutation?: "enabled" | "disabled"; workerProfile?: GrowthWorkerProfile; audience?: CreatXToolAudience; turnTools?: readonly CreatXToolContribution[]; turnGuidance?: string; connection?: ClineModelConnection }) {
    const audience = input.audience ?? input.workerProfile ?? "ordinary"
    const tools = [...this.tools, ...(input.turnTools ?? [])]
    validateCreatXToolContributions(tools)
    const policyController = new SessionToolPolicyController(input.permissionMode, input.kind, tools, input.directFileMutation, input.workerProfile, audience)
    const connection = input.connection ?? this.defaultConnection
    const skills = audience === "ordinary" || audience === "skill-sequence" ? this.skills : input.workerProfile ? skillsForWorkerProfile(this.skills, this.workerSkills, input.workerProfile) : []
    const result = await this.core.start({
      source: "desktop",
      interactive: true,
      sessionMetadata: {
        title: input.title,
        creatxProviderId: connection.providerId,
        creatxModelId: connection.modelId,
        ...(connection.profileId ? { creatxTextProfileId: connection.profileId } : {}),
        ...(input.projectId ? { creatxProjectId: input.projectId } : {}),
        ...(input.growthOwnerSessionId ? {
          creatxInternalRole: "growth-stage",
          creatxGrowthOwnerSessionId: input.growthOwnerSessionId,
          creatxGrowthGoalId: input.growthGoalId,
          creatxGrowthGoalVersion: input.growthGoalVersion,
          ...(input.ownerActivationId ? { creatxGrowthOwnerActivationId: input.ownerActivationId } : {}),
          ...(input.growthAttemptId ? { creatxGrowthAttemptId: input.growthAttemptId } : {}),
          ...(input.growthWorkItemId ? { creatxGrowthWorkItemId: input.growthWorkItemId } : {}),
          ...(input.growthWorkItemTitle ? { creatxGrowthWorkItemTitle: input.growthWorkItemTitle } : {}),
          ...(input.growthWorkRootPath ? { creatxGrowthWorkRootPath: input.growthWorkRootPath } : {}),
        } : {}),
      },
      ...(input.initialMessages ? { initialMessages: input.initialMessages } : {}),
      config: {
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        providerId: connection.providerId,
        modelId: connection.modelId,
        ...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
        ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
        cwd: input.projectRoot,
        workspaceRoot: input.projectRoot,
         mode: "act",
         systemPrompt: creatXSystemPrompt(input.projectRoot, [...this.systemGuidance, OWNER_GROWTH_TURN_GUIDANCE, OWNER_GROWTH_ISSUE_TURN_GUIDANCE, OWNER_GROWTH_DELIVERY_GUIDANCE, ...(input.turnGuidance ? [input.turnGuidance] : [])]),
         ...(skills.length ? { skills: [...skills] } : {}),
        extensions: [createProjectReadMediaBudgetExtension(), createClineToolExtension(createClineTools(
          input.workerProfile ? creatXToolsForAudience(tools, audience, input.workerProfile) : tools,
          (sessionId) => this.activeProjectIds.get(sessionId),
          (sessionId) => this.activeGrowthStages.get(sessionId),
          (sessionId) => this.activeAudiences.get(sessionId),
          (sessionId) => this.activeOwnerActivationIds.get(sessionId),
          (sessionId, toolName, output) => this.recordSkillSequenceToolSuccess(sessionId, toolName, output),
        ))],
        maxIterations: input.maxIterations ?? maxIterationsForSession(input.growthOwnerSessionId),
        enableTools: true,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
      },
      toolPolicies: policyController.policies,
      ...(this.userInstructionService ? {
        localRuntime: {
          userInstructionService: this.userInstructionService,
          configExtensions: ["skills"],
        },
      } : {}),
    })
    this.activeSessionIds.add(result.sessionId)
    this.activeAudiences.set(result.sessionId, audience)
    this.sessionToolPolicyControllers.set(result.sessionId, policyController)
    if (input.projectId) {
      this.activeProjectIds.set(result.sessionId, input.projectId)
      this.activeProjectRoots.set(result.sessionId, resolve(input.projectRoot))
    }
    return result
  }

  async sendMessage(sessionId: string, prompt: string, input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    this.requireReady()
    if (!prompt.trim()) return
    await this.ensureSessionAudience(sessionId, "ordinary")
    const attachments = await requireUserAttachments(input)
    await this.runTurn(sessionId, prompt.trim(), attachments, onAdmitted)
  }

  async sendSkillSequence(sessionId: string, prompt: string, skillSequence: readonly string[], input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    this.requireReady()
    if (!prompt.trim()) throw new Error("skill_sequence_invalid: user request must not be empty")
    if (!skillSequence.length) throw new Error("skill_sequence_invalid: at least one Skill is required")
    await this.ensureSessionAudience(sessionId, "skill-sequence")
    const attachments = await requireUserAttachments(input)
    const sequenceRunId = `skill_sequence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const completedSkills: string[] = []
    this.activeSkillSequenceSessions.add(sessionId)
    try {
      for (const [index, skillName] of skillSequence.entries()) {
        const step: ActiveSkillSequenceStep = { sequenceRunId, skillName, index, synchronousImagePaths: new Set(), submittedImageTaskIds: new Set() }
        this.activeSkillSequenceSteps.set(sessionId, step)
        for (let sliceIndex = 0; sliceIndex < SKILL_SEQUENCE_MAX_SLICES; sliceIndex += 1) {
          const result = await this.runTurn(
            sessionId,
            sliceIndex === 0
              ? skillSequenceTurnPrompt(prompt, skillSequence, index, sequenceRunId)
              : skillSequenceContinuationPrompt(prompt, skillSequence, index, sliceIndex, sequenceRunId),
            index === 0 && sliceIndex === 0 ? attachments : {},
            index === 0 && sliceIndex === 0 ? onAdmitted : undefined,
            undefined,
            undefined,
            true,
          )
          const receipt = step.receipt
          if (result.state === "completed" && receipt?.status === "completed") {
            completedSkills.push(skillName)
            break
          }
          if (receipt?.status === "partial" || receipt?.status === "blocked") {
            const incomplete = skillSequenceIncompleteResult(sequenceRunId, skillSequence, completedSkills, index, sliceIndex + 1, result, receipt)
            this.emitEvent({ type: "run.state", sessionId, state: receipt.status === "blocked" ? "failed" : "unknown", reason: JSON.stringify(incomplete) })
            return incomplete
          }
          if (result.state === "completed") {
            if (sliceIndex < SKILL_SEQUENCE_MAX_SLICES - 1) continue
            const incomplete = skillSequenceIncompleteResult(sequenceRunId, skillSequence, completedSkills, index, sliceIndex + 1, result)
            this.emitEvent({ type: "run.state", sessionId, state: "unknown", reason: JSON.stringify(incomplete) })
            return incomplete
          }
          if (result.state === "unknown" && isMaxIterationsBoundary(result)) {
            if (sliceIndex < SKILL_SEQUENCE_MAX_SLICES - 1) continue
            const incomplete = skillSequenceIncompleteResult(sequenceRunId, skillSequence, completedSkills, index, sliceIndex + 1, result)
            this.emitEvent({ type: "run.state", sessionId, state: "unknown", reason: JSON.stringify(incomplete) })
            return incomplete
          }
          if (result.state === "cancelled") {
            this.emitEvent({ type: "run.state", sessionId, state: "cancelled", ...(result.reason ? { reason: result.reason } : {}) })
            return skillSequenceIncompleteResult(sequenceRunId, skillSequence, completedSkills, index, sliceIndex + 1, result)
          }
          const incomplete = skillSequenceIncompleteResult(sequenceRunId, skillSequence, completedSkills, index, sliceIndex + 1, result)
          this.emitEvent({ type: "run.state", sessionId, state: "failed", reason: JSON.stringify(incomplete) })
          return incomplete
        }
      }
      this.emitEvent({ type: "run.state", sessionId, state: "completed" })
      return { sequenceRunId, state: "completed" as const, completedSkills, currentSkill: undefined, pendingSkills: [] as string[], slicesUsed: SKILL_SEQUENCE_MAX_SLICES }
    } finally {
      this.activeSkillSequenceSteps.delete(sessionId)
      this.activeSkillSequenceSessions.delete(sessionId)
      if (!this.disposed) await this.ensureSessionAudience(sessionId, "ordinary")
    }
  }

  private skillSequenceReportTool(): CreatXToolContribution {
    return {
      name: SKILL_SEQUENCE_REPORT_TOOL,
      description: "Finish the current CreatX Skill Sequence step with trusted delivery evidence. Call exactly once after inspecting the real final artifacts and image tasks. Use completed only when the current Skill has fully delivered its required result; use partial or blocked when anything remains. A normal assistant reply does not advance the sequence without this report.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status", "summary", "artifactPaths", "requiredImageTaskIds", "unresolved"],
        properties: {
          status: { type: "string", enum: ["completed", "partial", "blocked"] },
          summary: { type: "string", minLength: 1 },
          artifactPaths: { type: "array", items: { type: "string", minLength: 1 } },
          requiredImageTaskIds: { type: "array", items: { type: "string", minLength: 1 } },
          unresolved: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
      audiences: ["skill-sequence"],
      scope: "project",
      approval: "automatic",
      execute: async (input, context) => {
        try {
          const step = this.activeSkillSequenceSteps.get(context.sessionId)
          if (!step) throw new Error("skill_sequence_conflict: no Skill Sequence step is active for this session")
          if (!context.projectId) throw new Error("skill_sequence_invalid: project identity is required")
          const receipt = requireSkillSequenceReceipt(input)
          if (step.receipt) {
            if (JSON.stringify(step.receipt) !== JSON.stringify(receipt)) throw new Error("skill_sequence_conflict: current step already has a different delivery report")
            return { ok: true, value: { sequenceRunId: step.sequenceRunId, skillName: step.skillName, index: step.index, ...step.receipt } }
          }
          if (receipt.status === "completed") {
            if (receipt.unresolved.length) throw new Error("skill_sequence_incomplete: completed delivery cannot contain unresolved work")
            if (!receipt.artifactPaths.length) throw new Error("skill_sequence_incomplete: completed delivery requires at least one real artifact")
            const projectRoot = this.activeProjectRoots.get(context.sessionId)
            if (!projectRoot) throw new Error("skill_sequence_invalid: active project root is unavailable")
            await Promise.all(receipt.artifactPaths.map((artifactPath) => requireSkillSequenceArtifact(projectRoot, artifactPath)))
            const minimumImages = IMAGE_DELIVERABLE_MINIMUMS.get(step.skillName) ?? 0
            const unrelatedTasks = receipt.requiredImageTaskIds.filter((imageTaskId) => !step.submittedImageTaskIds.has(imageTaskId))
            if (unrelatedTasks.length) throw new Error(`skill_sequence_incomplete: image tasks were not submitted by the current Skill step: ${unrelatedTasks.join(", ")}`)
            if (receipt.requiredImageTaskIds.length && !this.imageTaskStatus) throw new Error("skill_sequence_incomplete: image task evidence is unavailable")
            const statuses = await Promise.all(receipt.requiredImageTaskIds.map((imageTaskId) => this.imageTaskStatus!(context.projectId!, imageTaskId)))
            const unfinished = receipt.requiredImageTaskIds.filter((_imageTaskId, index) => statuses[index] !== "succeeded")
            if (unfinished.length) throw new Error(`skill_sequence_incomplete: required image tasks are not succeeded: ${unfinished.join(", ")}`)
            const synchronousImages = receipt.artifactPaths.map(normalizeSkillSequenceArtifactPath).filter((artifactPath) => step.synchronousImagePaths.has(artifactPath))
            if (receipt.requiredImageTaskIds.length + synchronousImages.length < minimumImages) {
              throw new Error(`skill_sequence_incomplete: ${step.skillName} requires at least ${minimumImages} succeeded image deliverable(s) from the image queue or synchronous generate_image results`)
            }
          }
          if (receipt.status !== "completed" && !receipt.unresolved.length) {
            throw new Error("skill_sequence_incomplete: partial or blocked delivery must explain unresolved work")
          }
          step.receipt = receipt
          return { ok: true, value: { sequenceRunId: step.sequenceRunId, skillName: step.skillName, index: step.index, ...receipt } }
        } catch (error) {
          return { ok: false, error: { code: "runtime", message: "Skill 步骤回执未通过完整性交付检查。", detail: messageOf(error) } }
        }
      },
    }
  }

  private skillSequenceImageWaitTool(): CreatXToolContribution {
    return {
      name: SKILL_SEQUENCE_IMAGE_WAIT_TOOL,
      description: "Wait once for every persistent image task submitted by the current CreatX Skill Sequence step. Use this after submitting the step's image tasks instead of polling files, sleeping in Shell, or repeatedly listing image tasks. The call returns only when every current-step task succeeded, one task reached a failed terminal state, the user cancelled, or the bounded wait timed out.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      audiences: ["skill-sequence"],
      scope: "project",
      approval: "automatic",
      timeoutMs: SKILL_SEQUENCE_IMAGE_WAIT_TIMEOUT_MS,
      execute: async (_input, context) => {
        const step = this.activeSkillSequenceSteps.get(context.sessionId)
        if (!step) return { ok: false, error: { code: "runtime", message: "当前没有正在执行的 Skill 步骤。", detail: "skill_sequence_conflict: no Skill Sequence step is active for this session" } }
        if (!context.projectId) return { ok: false, error: { code: "runtime", message: "当前 Skill 步骤缺少项目身份。", detail: "skill_sequence_invalid: project identity is required" } }
        if (!this.imageTaskStatus) return { ok: false, error: { code: "runtime", message: "当前无法读取图片任务状态。", detail: "skill_sequence_incomplete: image task evidence is unavailable" } }
        const imageTaskIds = [...step.submittedImageTaskIds]
        if (!imageTaskIds.length) return { ok: false, error: { code: "runtime", message: "当前 Skill 步骤还没有提交图片任务。", detail: "skill_sequence_incomplete: current Skill step has no submitted image tasks" } }

        while (true) {
          context.signal?.throwIfAborted()
          const statuses = await Promise.all(imageTaskIds.map((imageTaskId) => this.imageTaskStatus!(context.projectId!, imageTaskId)))
          const tasks = imageTaskIds.map((imageTaskId, index) => ({ imageTaskId, status: statuses[index] }))
          const terminalFailure = tasks.find((task) => task.status === "failed" || task.status === "interrupted" || task.status === "cancelled")
          if (terminalFailure) return { ok: true, value: { state: "incomplete", tasks } }
          if (tasks.every((task) => task.status === "succeeded")) return { ok: true, value: { state: "completed", tasks } }
          await abortableDelay(SKILL_SEQUENCE_IMAGE_WAIT_POLL_MS, context.signal)
        }
      },
    }
  }

  async sendGrowthMessage(
    sessionId: string,
    prompt: string,
    ownerActivationId: string,
    onAdmitted?: () => void,
    onOwnerReplyPersisted?: (reply: string, controllerResult: "success" | "error") => Promise<void>,
    signal?: AbortSignal,
  ) {
    this.requireReady()
    if (!prompt.trim()) throw new Error("growth_invalid: Growth command must not be empty")
    await this.ensureSessionAudience(sessionId, "owner-growth")
    this.beginOwnerActivation(sessionId, ownerActivationId, "owner-growth")
    try {
      const marker = ownerActivationPrompt(prompt.trim(), ownerActivationId)
      const turn = await this.runTurn(sessionId, marker, {}, onAdmitted, signal)
      throwIfOwnerTurnCancelled(turn, signal)
      const evidence = findUniqueOwnerControllerTurn(await this.core.readMessages(sessionId), ownerActivationId, "run_growth")
      if (!evidence) throw new Error("growth_conflict: Owner Growth history does not contain one globally unique run_growth call and result")
      const reply = evidence.reply
      if (!reply) throw new Error("session_persistence: Owner Growth turn has no persisted Assistant reply")
      await onOwnerReplyPersisted?.(reply, evidence.controllerResult)
      return reply
    } finally {
      this.endOwnerActivation(sessionId, ownerActivationId)
    }
  }

  async sendGrowthIssueMessage(
    sessionId: string,
    prompt: string,
    ownerActivationId: string,
    onAdmitted?: () => void,
    onOwnerReplyPersisted?: (reply: string, controllerCallCount: number, controllerResult: "none" | "success" | "error") => Promise<void>,
    signal?: AbortSignal,
  ) {
    this.requireReady()
    if (!prompt.trim()) throw new Error("growth_invalid: Growth issue reply must not be empty")
    await this.ensureSessionAudience(sessionId, "owner-growth-issue")
    this.beginOwnerActivation(sessionId, ownerActivationId, "owner-growth-issue")
    try {
      const turn = await this.runTurn(sessionId, ownerActivationPrompt(prompt.trim(), ownerActivationId), {}, onAdmitted, signal)
      throwIfOwnerTurnCancelled(turn, signal)
      const evidence = findOwnerActivationEvidence(await this.core.readMessages(sessionId), ownerActivationId, "resolve_growth_issue")
      if (!evidence) throw new Error("growth_conflict: Owner issue history does not contain one globally unique resolve_growth_issue call and result")
      if (!evidence.reply) throw new Error("session_persistence: Owner Growth issue turn has no persisted Assistant reply")
      await onOwnerReplyPersisted?.(evidence.reply, evidence.controllerCallCount, evidence.controllerResult)
      return evidence.reply
    } finally {
      this.endOwnerActivation(sessionId, ownerActivationId)
    }
  }

  async findPersistedOwnerGrowthReply(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    const evidence = findUniqueOwnerControllerTurn(await this.core.readMessages(sessionId), ownerActivationId, controllerToolName)
    return evidence?.controllerResult === "success" && evidence.reply
      ? { controllerCallCount: evidence.controllerCallCount, reply: evidence.reply }
      : undefined
  }

  async findPersistedOwnerTurn(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    return findOwnerActivationEvidence(await this.core.readMessages(sessionId), ownerActivationId, controllerToolName)
  }

  async hasPersistedOwnerControllerResult(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    return hasPersistedOwnerControllerResult(await this.core.readMessages(sessionId), ownerActivationId, controllerToolName)
  }

  async sendOwnerResultDelivery(sessionId: string, ownerActivationId: string, onOwnerReplyPersisted: (reply: string) => Promise<void>, signal?: AbortSignal) {
    this.requireReady()
    await this.ensureSessionAudience(sessionId, "owner-growth-delivery")
    this.beginOwnerActivation(sessionId, ownerActivationId, "owner-growth-delivery")
    try {
      const turn = await this.runTurn(sessionId, ownerActivationPrompt("继续整理并汇报 Growth 结果", ownerActivationId), {}, undefined, signal)
      throwIfOwnerTurnCancelled(turn, signal)
      const evidence = findOwnerActivationEvidence(await this.core.readMessages(sessionId), ownerActivationId, "run_growth")
      if (!evidence || evidence.controllerCallCount !== 0 || !evidence.reply) throw new Error("session_persistence: recovered Owner delivery has no persisted Assistant reply")
      await onOwnerReplyPersisted(evidence.reply)
      return evidence.reply
    } finally {
      this.endOwnerActivation(sessionId, ownerActivationId)
    }
  }

  async switchSessionConnection(sessionId: string, connection: ClineModelConnection) {
    if (this.disposed) throw new Error("runtime: Cline adapter is disposed")
    const nextConnection = requireModelConnection(connection)
    if (!nextConnection.apiKey) throw new Error("API key is missing for the selected Provider")
    if (this.runningSessionIds.has(sessionId)) throw new Error("session_conflict: cannot switch model during an active Run")
    await this.ensureActiveSession(sessionId)
    const previous = await this.core.get(sessionId)
    if (!previous) throw new Error("session_missing: Cline history does not contain this session")
    const previousProviderId = typeof previous.metadata?.creatxProviderId === "string" ? previous.metadata.creatxProviderId : previous.provider
    const previousModelId = typeof previous.metadata?.creatxModelId === "string" ? previous.metadata.creatxModelId : previous.model
    const previousProfileId = typeof previous.metadata?.creatxTextProfileId === "string" ? previous.metadata.creatxTextProfileId : undefined
    const previousConnection = this.resolveModelConnection?.(previousProviderId, previousModelId, previousProfileId)
      ?? (previousProviderId === this.providerId && previousModelId === this.modelId ? this.defaultConnection : { providerId: previousProviderId, modelId: previousModelId })
    const update = buildConnectionUpdate({
      providerId: nextConnection.providerId,
      modelId: nextConnection.modelId,
      apiKey: nextConnection.apiKey,
      ...(nextConnection.baseUrl !== undefined ? { baseUrl: nextConnection.baseUrl } : {}),
    })
    await this.core.updateSessionConnection(sessionId, update)
    try {
      await this.core.update(sessionId, {
        metadata: {
          ...previous.metadata,
          creatxProviderId: update.providerId,
          creatxModelId: update.modelId,
          creatxTextProfileId: nextConnection.profileId ?? null,
        },
      })
    } catch (error) {
      await this.core.updateSessionConnection(sessionId, buildConnectionUpdate({
        providerId: previousConnection.providerId,
        modelId: previousConnection.modelId,
        ...(previousConnection.apiKey ? { apiKey: previousConnection.apiKey } : {}),
        ...(previousConnection.baseUrl ? { baseUrl: previousConnection.baseUrl } : {}),
      })).catch(() => undefined)
      throw new Error(`session_persistence: model connection could not be saved: ${messageOf(error)}`, { cause: error })
    }
    const record = await this.core.get(sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    return toSessionSummary(record, this.sessionPermissions.ensure(sessionId, typeof record.metadata?.creatxProjectId === "string" ? "project" : "personal"))
  }

  async runGrowthStage(command: GrowthStageRunCommand, signal?: AbortSignal, onFailure?: (failure: GrowthStageFailure) => void): Promise<GrowthStageRunResult> {
    return (await this.runGrowthStageBatch([command], signal, [onFailure]))[0]!
  }

  async findCompletedGrowthStage(input: { sessionId: string; goalId: string; attemptId: string }) {
    const worker = this.store.list(10_000).findLast((record) => record.status === "completed"
      && record.metadata?.creatxInternalRole === "growth-stage"
      && record.metadata.creatxGrowthOwnerSessionId === input.sessionId
      && record.metadata.creatxGrowthGoalId === input.goalId
      && record.metadata.creatxGrowthAttemptId === input.attemptId)
    if (!worker) return undefined
    const reason = latestAssistantText(await this.core.readMessages(worker.sessionId))
    return reason ? { state: "completed" as const, reason } : undefined
  }

  async runGrowthStageBatch(commands: GrowthStageRunCommand[], signal?: AbortSignal, failureObservers: readonly (((failure: GrowthStageFailure) => void) | undefined)[] = []): Promise<GrowthStageRunResult[]> {
    this.requireReady()
    signal?.throwIfAborted()
    if (commands.length < 1 || commands.length > 3) throw new Error("growth_invalid: Growth batch must contain 1 to 3 stages")
    if (failureObservers.length && failureObservers.length !== commands.length) throw new Error("growth_invalid: Growth failure observers must align with stage commands")
    for (const command of commands) {
      if (!command.prompt.trim()) throw new Error("growth_invalid: Growth stage prompt must not be empty")
      if (command.maxIterations !== undefined && (!Number.isSafeInteger(command.maxIterations) || command.maxIterations < 1 || command.maxIterations > 100)) {
        throw new Error("growth_invalid: Growth stage maxIterations must be an integer from 1 to 100")
      }
    }
    const first = commands[0]!
    if (commands.some((command) => command.sessionId !== first.sessionId || command.projectId !== first.projectId || command.goalId !== first.goalId || command.expectedVersion !== first.expectedVersion)) {
      throw new Error("growth_invalid: Growth batch stages must share one owner, project, Goal, and version")
    }
    const workItemIds = commands.map((command) => command.workItemId).filter((value): value is string => Boolean(value))
    if (workItemIds.length && (workItemIds.length !== commands.length || new Set(workItemIds).size !== commands.length)) {
      throw new Error("growth_invalid: materialization batch requires one unique workItemId per stage")
    }
    await this.ensureActiveSession(first.sessionId)
    const projectId = this.activeProjectIds.get(first.sessionId)
    if (projectId !== first.projectId) throw new Error("growth_invalid: Growth stage project does not match the Cline session")
    if (this.activeGrowthWorkerIds.has(first.sessionId)) throw new Error("growth_conflict: Growth already has an active stage batch")
    const owner = await this.core.get(first.sessionId)
    if (!owner) throw new Error("session_missing: Cline history does not contain the Growth owner session")
    const permission = this.sessionPermissions.get(first.sessionId) ?? this.sessionPermissions.ensure(first.sessionId, "project")
    const workerIds = new Set<string>()
    const connection = this.defaultConnection
    const connectionKey = providerConnectionKey(connection)
    const cooldownController = new AbortController()
    this.activeGrowthWorkerIds.set(first.sessionId, workerIds)
    this.growthCooldownControllers.set(first.sessionId, cooldownController)
    try {
      await this.providerQuotaCooldown.wait(connectionKey, signal ? AbortSignal.any([signal, cooldownController.signal]) : cooldownController.signal)
      const workers: Array<{ command: GrowthStageRunCommand; worker: { sessionId: string }; onFailure?: (failure: GrowthStageFailure) => void }> = []
      for (const [index, command] of commands.entries()) {
        signal?.throwIfAborted()
        const worker = await this.startSession({
          projectId: command.projectId,
          projectRoot: owner.workspaceRoot || owner.cwd,
          title: command.workItemTitle ? `Growth 对象 ${command.workItemTitle}` : command.workItemId ? `Growth 对象 ${command.workItemId}` : `Growth 阶段 ${command.expectedVersion}`,
          kind: "project",
          permissionMode: permission.mode,
          growthOwnerSessionId: command.sessionId,
          growthGoalId: command.goalId,
          growthGoalVersion: command.expectedVersion,
          ...(command.ownerActivationId ? { ownerActivationId: command.ownerActivationId } : {}),
          ...(command.attemptId ? { growthAttemptId: command.attemptId } : {}),
          ...(command.workItemId ? { growthWorkItemId: command.workItemId } : {}),
          ...(command.workItemTitle ? { growthWorkItemTitle: command.workItemTitle } : {}),
          ...(command.workRootPath ? { growthWorkRootPath: command.workRootPath } : {}),
          ...(command.workerProfile ? { workerProfile: command.workerProfile } : {}),
          ...(command.maxIterations ? { maxIterations: command.maxIterations } : {}),
          ...(command.directFileMutation ? { directFileMutation: command.directFileMutation } : {}),
          connection,
        })
        workerIds.add(worker.sessionId)
        this.growthOwnerSessionIds.set(worker.sessionId, command.sessionId)
        workers.push({ command, worker, ...(failureObservers[index] ? { onFailure: failureObservers[index] } : {}) })
      }
      const settled = await Promise.allSettled(workers.map(({ command, worker, onFailure }) => executeGrowthStageBinding(
        { ...command, sessionId: worker.sessionId },
        (identity) => {
          if (identity) {
            this.bindGrowthStage(worker.sessionId, identity)
            return
          }
          const current = this.activeGrowthStages.get(worker.sessionId)
          if (current?.goalId === command.goalId && current.version === command.expectedVersion) this.bindGrowthStage(worker.sessionId, undefined)
        },
        () => this.runTurn(worker.sessionId, command.prompt.trim(), {}, undefined, signal, onFailure),
      )))
      const results = settledGrowthStageResults(settled)
      const quotaFailed = results.some((result) => result.failure?.code === "provider_quota" || result.failures?.some((failure) => failure.error.code === "provider_quota"))
      if (quotaFailed) this.providerQuotaCooldown.record(connectionKey)
      if (!quotaFailed && results.some((result) => result.state === "completed")) this.providerQuotaCooldown.clear(connectionKey)
      return results
    } finally {
      await Promise.all([...workerIds].map((workerSessionId) => this.stopGrowthWorker(first.sessionId, workerSessionId)))
      if (this.activeGrowthWorkerIds.get(first.sessionId) === workerIds && !workerIds.size) this.activeGrowthWorkerIds.delete(first.sessionId)
      if (this.growthCooldownControllers.get(first.sessionId) === cooldownController) this.growthCooldownControllers.delete(first.sessionId)
    }
  }

  private async runTurn(sessionId: string, prompt: string, attachments: ClineUserAttachments = {}, onAdmitted?: () => void, signal?: AbortSignal, onGrowthStageFailure?: (failure: GrowthStageFailure) => void, suppressTerminalState = false): Promise<GrowthStageRunResult> {
    signal?.throwIfAborted()
    if (this.runningSessionIds.has(sessionId)) throw new Error("session_conflict: session already has an active Run")
    this.runningSessionIds.add(sessionId)
    this.projectImageReadBudget.begin(sessionId)
    let settleTurn!: () => void
    const turnSettlement = new Promise<void>((resolve) => {
      settleTurn = resolve
    })
    this.runningTurnSettlements.set(sessionId, turnSettlement)
    this.growthStageFailures.delete(sessionId)
    if (onGrowthStageFailure) this.growthStageFailureObservers.set(sessionId, onGrowthStageFailure)
    this.emitEvent({ type: "run.state", sessionId, state: "running" })
    let signalAbort: Promise<void> | undefined
    const abortFromSignal = () => {
      signalAbort ??= Promise.resolve().then(() => this.core.abort(sessionId, signal?.reason))
      void signalAbort.catch(() => undefined)
    }
    signal?.addEventListener("abort", abortFromSignal, { once: true })
    if (signal?.aborted) abortFromSignal()
    try {
      signal?.throwIfAborted()
      onAdmitted?.()
      signal?.throwIfAborted()
      const result = await this.core.send({
        sessionId,
        prompt,
        ...(attachments.userFiles?.length ? { userFiles: [...attachments.userFiles] } : {}),
        ...(attachments.userImages?.length ? { userImages: [...attachments.userImages] } : {}),
      })
      const messages = await this.core.readMessages(sessionId)
      if (!this.growthOwnerSessionIds.has(sessionId)) {
        const items = projectClineTimeline(messages)
        this.timelineProjector.replace(sessionId, items)
        this.emitEvent({ type: "timeline.snapshot", sessionId, items })
      }
      const iterationBoundary = this.activeSkillSequenceSessions.has(sessionId) && isMaxIterationsAgentResult(result, maxIterationsForSession())
      const terminal = iterationBoundary ? "unknown" : terminalStateFromFinishReason(result?.finishReason)
      const failures = [...(this.growthStageFailures.get(sessionId)?.values() ?? [])]
      const failure = failures[0]?.error
      const reason = iterationBoundary ? "max_iterations" : failure?.detail ?? failure?.message ?? (this.growthOwnerSessionIds.has(sessionId) ? latestAssistantText(messages) : undefined) ?? result?.finishReason ?? "missing_finish_reason"
      if (!suppressTerminalState) this.emitEvent({ type: "run.state", sessionId, state: terminal, reason })
      return { state: terminal, reason, ...(failure ? { failure } : {}), ...(failures.length ? { failures } : {}) }
    } catch (error) {
      const classified = classifyRuntimeError(error)
      const growthWorker = this.growthOwnerSessionIds.has(sessionId)
      if (this.activeSkillSequenceSessions.has(sessionId) && isMaxIterationsError(classified)) {
        return { state: "unknown", reason: classified.detail ?? classified.message, failure: classified }
      }
      if (!growthWorker) this.emitEvent({ type: "runtime.error", sessionId, error: classified })
      this.emitEvent({ type: "run.state", sessionId, state: classified.code === "cancelled" ? "cancelled" : "failed", reason: classified.message })
      if (growthWorker) {
        this.recordGrowthStageFailure(sessionId, { source: "runtime", error: classified })
        const failures = [...(this.growthStageFailures.get(sessionId)?.values() ?? [])]
        return { state: classified.code === "cancelled" ? "cancelled" : "failed", reason: classified.detail ?? classified.message, failure: failures[0]!.error, failures }
      }
      throw error
    } finally {
      signal?.removeEventListener("abort", abortFromSignal)
      await signalAbort?.catch(() => undefined)
      this.runningSessionIds.delete(sessionId)
      if (this.runningTurnSettlements.get(sessionId) === turnSettlement) this.runningTurnSettlements.delete(sessionId)
      settleTurn()
      this.growthStageFailures.delete(sessionId)
      this.growthStageFailureObservers.delete(sessionId)
      this.projectImageReadBudget.end(sessionId)
    }
  }

  async cancel(sessionId: string) {
    this.growthCooldownControllers.get(sessionId)?.abort(new Error("User cancelled the run"))
    const targets = resolveGrowthAbortSessions(sessionId, this.activeGrowthWorkerIds.get(sessionId))
    for (const target of targets) this.rejectSessionApprovals(target, "User cancelled the run")
    await Promise.all(targets.map((target) => this.core.abort(target, new Error("User cancelled the run"))))
  }

  async steer(sessionId: string, prompt: string, input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    this.requireReady()
    await this.ensureActiveSession(sessionId)
    if (!this.runningSessionIds.has(sessionId)) throw new Error("session_conflict: cannot Steer an idle session")
    const attachments = await requireUserAttachments(input)
    onAdmitted?.()
    await executeSteerDelivery({ sessionId, prompt, ...attachments }, (input) => this.core.send(input))
  }

  async abortRun(sessionId: string, reason: string) {
    this.requireReady()
    const abortReason = new Error(requireText(reason, "abort reason"))
    this.growthCooldownControllers.get(sessionId)?.abort(abortReason)
    const targets = resolveGrowthAbortSessions(sessionId, this.activeGrowthWorkerIds.get(sessionId))
    await Promise.all(targets.map((target) => this.ensureActiveSession(target)))
    await Promise.all(targets.map((target) => this.core.abort(target, abortReason)))
  }

  async setSessionPermissionMode(sessionId: string, mode: SessionPermissionMode) {
    const permissionMode = requireSessionPermissionMode(mode)
    await this.ensureActiveSession(sessionId)
    const record = await this.core.get(sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    const controller = this.sessionToolPolicyControllers.get(sessionId)
    if (!controller) throw new Error("compatibility: active Cline session has no Tool Policy controller")
    const updated = this.sessionPermissions.setMode(sessionId, permissionMode)
    controller.setMode(permissionMode)
    return toSessionSummary(record, updated)
  }

  async renameSession(sessionId: string, title: string) {
    const nextTitle = requireText(title, "title").slice(0, 120)
    if (this.runningSessionIds.has(sessionId) || this.activeGrowthWorkerIds.has(sessionId) || this.growthOwnerSessionIds.has(sessionId)) {
      throw new Error("session_conflict: cannot rename a session while it is running")
    }
    await this.ensureActiveSession(sessionId)
    const record = await this.core.get(sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    await this.core.update(sessionId, { title: nextTitle })
    this.sessionListInFlight = undefined
    const updated = (await this.loadVisibleSessions()).find((candidate) => candidate.id === sessionId)
    if (!updated) throw new Error("session_missing: Cline history disappeared after rename")
    return updated
  }

  bindGrowthStage(sessionId: string, identity: GrowthStageIdentity | undefined) {
    if (!identity) {
      this.activeGrowthStages.delete(sessionId)
      return
    }
    this.activeGrowthStages.set(sessionId, normalizeGrowthStageIdentity(identity))
  }

  resolveApproval(approvalId: string, approved: boolean) {
    const pending = this.pendingApprovals.get(approvalId)
    if (!pending) throw new Error("runtime: approval is no longer pending")
    this.pendingApprovals.delete(approvalId)
    pending.resolve({ approved, ...(approved ? {} : { reason: "User denied tool execution" }) })
    this.emitEvent({ type: "approval.resolved", sessionId: pending.request.sessionId, approvalId, approved })
  }

  async listSessions(limit = 100) {
    return (await this.loadVisibleSessions()).slice(0, limit)
  }

  async setProjectCase(sessionId: string, included: boolean) {
    const target = requireText(sessionId, "sessionId")
    if (this.runningSessionIds.has(target) || this.activeGrowthWorkerIds.has(target) || this.growthOwnerSessionIds.has(target)) throw new Error("session_conflict: cannot change a project case while it is running")
    const record = this.store.get(target)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    if (record.isSubagent || record.metadata?.creatxInternalRole === "growth-stage") throw new Error("session_invalid: Growth Workers cannot become project cases")
    if (typeof record.metadata?.creatxProjectId !== "string" || !record.metadata.creatxProjectId.trim()) throw new Error("session_invalid: personal sessions cannot become project cases")
    const metadata = { ...record.metadata }
    if (included) metadata.creatxProjectCase = true
    else delete metadata.creatxProjectCase
    this.store.update({ sessionId: target, metadata })
    if (this.store.get(target)?.metadata?.creatxProjectCase !== (included ? true : undefined)) throw new Error("session_persistence: project case marker was not saved")
    this.sessionListInFlight = undefined
    return included
  }

  async listProjectCaseSessions(projectId: string) {
    const target = requireText(projectId, "projectId")
    return this.store.list(1_000)
      .filter((record) => !record.isSubagent && record.metadata?.creatxInternalRole !== "growth-stage" && record.metadata?.creatxProjectId === target && record.metadata.creatxProjectCase === true)
      .map((record) => toSessionSummary(record, this.sessionPermissions.ensure(record.sessionId, "project")))
  }

  async exportProjectCase(input: Omit<ProjectCaseExportInput, "caseId" | "projectRoot" | "messages"> & { projectId: string; sessionId: string }, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const sessionId = requireText(input.sessionId, "sessionId")
    const projectId = requireText(input.projectId, "projectId")
    if (this.runningSessionIds.has(sessionId) || this.activeGrowthWorkerIds.has(sessionId) || this.growthOwnerSessionIds.has(sessionId)) throw new Error("session_conflict: cannot export a project case while it is running")
    const record = this.store.get(sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    if (record.isSubagent || record.metadata?.creatxInternalRole === "growth-stage" || typeof record.metadata?.creatxProjectId !== "string") throw new Error("session_invalid: only project sessions can be exported as cases")
    if (record.metadata.creatxProjectId !== projectId) throw new Error("session_invalid: project case does not belong to the requested project")
    if (record.metadata.creatxProjectCase !== true) throw new Error("session_invalid: project session is not marked as a case")
    const messages = await this.core.readMessages(sessionId)
    signal?.throwIfAborted()
    const latest = this.store.get(sessionId)
    if (this.runningSessionIds.has(sessionId) || this.activeGrowthWorkerIds.has(sessionId) || this.growthOwnerSessionIds.has(sessionId) || latest?.updatedAt !== record.updatedAt || latest?.metadata?.creatxProjectCase !== true) {
      throw new Error("session_conflict: project case changed while it was being exported")
    }
    return projectPortableConversationV1({
      ...input,
      caseId: sessionId,
      projectRoot: record.workspaceRoot || record.cwd,
      messages,
    })
  }

  async deleteSession(sessionId: string) {
    await this.deleteSessions([sessionId])
  }

  async cleanupGrowthWorkers(ownerSessionId: string, goalId: string) {
    const result = await this.growthWorkerRetention.cleanup(ownerSessionId, goalId)
    if (result.deletedSessionIds.length) this.sessionListInFlight = undefined
    if (result.failedSessionIds.length) this.maintenanceErrors.push(`session_cleanup: ${result.failedSessionIds.length} Growth Worker(s) remain pending cleanup`)
    return result
  }

  async deleteSessions(sessionIds: readonly string[]) {
    const ids = [...new Set(sessionIds.map((sessionId) => requireText(sessionId, "sessionId")))]
    if (!ids.length) return []
    if (ids.some((id) => this.runningSessionIds.has(id) || this.activeGrowthWorkerIds.has(id) || this.growthOwnerSessionIds.has(id))) {
      throw new Error("session_conflict: cannot delete a session while it is running")
    }
    const visibleIds = new Set((await this.loadVisibleSessions()).map((session) => session.id))
    if (ids.some((id) => !visibleIds.has(id))) throw new Error("session_missing: Cline history does not contain this session")
    for (const id of ids) {
      const workerCleanup = await this.growthWorkerRetention.cleanupOwner(id)
      if (workerCleanup.deferredSessionIds.length || workerCleanup.failedSessionIds.length) {
        throw new Error("session_cleanup: related Growth Workers could not be safely deleted")
      }
      const deleted = await this.core.delete(id)
      if (!deleted) throw new Error("session_missing: Cline history does not contain this session")
      this.rejectSessionApprovals(id, "Session deleted")
      this.activeSessionIds.delete(id)
      this.activeProjectIds.delete(id)
      this.activeProjectRoots.delete(id)
      this.activeGrowthStages.delete(id)
      this.activeAudiences.delete(id)
      this.activeOwnerActivationIds.delete(id)
      this.sessionToolPolicyControllers.delete(id)
    }
    this.sessionListInFlight = undefined
    return ids
  }

  async readTimeline(sessionId: string) {
    const ownerItems = projectClineTimeline(await this.core.readMessages(sessionId))
    const workers = this.growthWorkerRetention.listActiveOwner(sessionId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.sessionId.localeCompare(right.sessionId))
    const workerItems = await mapWithConcurrency(workers, 8, async (worker) => {
      const metadata = worker.metadata ?? {}
      const activity: TimelineActivity = {
        kind: "growth-worker",
        activityId: typeof metadata.creatxGrowthAttemptId === "string" && metadata.creatxGrowthAttemptId.trim() ? metadata.creatxGrowthAttemptId : worker.sessionId,
        ...(typeof metadata.creatxGrowthOwnerActivationId === "string" && metadata.creatxGrowthOwnerActivationId.trim() ? { ownerActivationId: metadata.creatxGrowthOwnerActivationId.trim() } : {}),
        workItemId: typeof metadata.creatxGrowthWorkItemId === "string" && metadata.creatxGrowthWorkItemId.trim() ? metadata.creatxGrowthWorkItemId : `stage:${worker.sessionId}`,
        title: typeof metadata.creatxGrowthWorkItemTitle === "string" && metadata.creatxGrowthWorkItemTitle.trim()
          ? metadata.creatxGrowthWorkItemTitle.trim()
          : typeof metadata.creatxGrowthWorkItemId === "string" && metadata.creatxGrowthWorkItemId.trim()
            ? metadata.creatxGrowthWorkItemId
            : "Growth 阶段",
      }
      return projectGrowthWorkerTimeline(
        await readGrowthWorkerMessages(worker, (sessionId) => this.core.readMessages(sessionId)),
        activity,
      ).map((item) => ({
        ...item,
        itemId: `growth:${worker.sessionId}:${item.itemId}`,
      }))
    })
    const items = mergeOwnerAndWorkerTimeline(ownerItems, workerItems.flat())
    this.timelineProjector.replace(sessionId, items)
    return items
  }

  async readMessages(sessionId: string) {
    return projectClineMessages(await this.core.readMessages(sessionId))
  }

  async resolveMessageAttachment(sessionId: string, messageId: string, attachmentIndex: number) {
    await this.ensureActiveSession(sessionId)
    const message = resolveMessageByItemId(await this.core.readMessages(sessionId), messageId)
    if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0) throw new Error("attachment_invalid: invalid message attachment identity")
    const attachment = message ? messageAttachments(message)[attachmentIndex] : undefined
    const path = attachment?.kind === "file" ? attachment.path : undefined
    if (!path) throw new Error("attachment_invalid: message attachment does not exist")
    return (await requireReadableUserFiles([path]))[0]!
  }

  async resolveMessageImage(sessionId: string, messageId: string, attachmentIndex: number) {
    await this.ensureActiveSession(sessionId)
    const message = resolveMessageByItemId(await this.core.readMessages(sessionId), messageId)
    if (!message || !Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0) throw new Error("attachment_invalid: invalid message attachment identity")
    const attachment = messageAttachments(message)[attachmentIndex]
    if (attachment?.kind !== "image") throw new Error("attachment_invalid: message image does not exist")
    return { mediaType: attachment.mediaType, bytes: Buffer.from(attachment.data, "base64") }
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const [approvalId, pending] of this.pendingApprovals) {
      pending.resolve({ approved: false, reason: "CreatX is closing" })
      this.emitEvent({ type: "approval.resolved", sessionId: pending.request.sessionId, approvalId, approved: false })
    }
    this.pendingApprovals.clear()
    for (const controller of this.growthCooldownControllers.values()) controller.abort(new Error("CreatX is closing"))
    this.growthCooldownControllers.clear()
    const runningTurns = [...this.runningTurnSettlements.entries()]
    await Promise.allSettled(runningTurns.map(([sessionId]) => Promise.resolve().then(() => this.core.abort(sessionId, new Error("CreatX is closing")))))
    await Promise.allSettled(runningTurns.map(([, settlement]) => settlement))
    await Promise.allSettled(runningTurns.map(([sessionId]) => this.core.stop(sessionId)))
    this.activeSessionIds.clear()
    this.runningSessionIds.clear()
    this.activeSkillSequenceSteps.clear()
    this.activeProjectIds.clear()
    this.activeProjectRoots.clear()
    this.activeGrowthStages.clear()
    this.activeAudiences.clear()
    this.activeOwnerActivationIds.clear()
    this.growthStageFailures.clear()
    this.growthOwnerSessionIds.clear()
    this.activeGrowthWorkerIds.clear()
    this.sessionToolPolicyControllers.clear()
    this.timelineProjector.clear()
    this.projectImageReadBudget.clear()
    this.unsubscribe()
    try {
      await Promise.all([
        destroyProviderDispatcher(this.providerDispatcher),
        this.core.dispose("CreatX is closing"),
      ])
    } finally {
      this.userInstructionService?.stop()
      this.store.close()
    }
  }

  private async replayGrowthWorkerCleanup() {
    try {
      const results = await this.growthWorkerRetention.replay()
      const failed = results.flatMap((result) => result.failedSessionIds)
      if (failed.length) this.maintenanceErrors.push(`session_cleanup: ${failed.length} Growth Worker(s) remain pending cleanup`)
    } catch (error) {
      this.maintenanceErrors.push(`session_cleanup: ${messageOf(error)}`)
    }
  }

  private requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalResult> {
    if (this.disposed) return Promise.resolve({ approved: false, reason: "CreatX is closing" })
    const id = `${request.sessionId}:${request.toolCallId}`
    const approval = {
      id,
      sessionId: request.sessionId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      trustWarning: MACHINE_TRUST_WARNING,
    }
    return new Promise((resolve) => {
      this.pendingApprovals.set(id, { request: approval, resolve })
      this.emitEvent({ type: "approval.requested", approval })
    })
  }

  private async loadVisibleSessions() {
    if (this.sessionListInFlight) return this.sessionListInFlight
    const request = Promise.resolve(this.store.list(1_000)
      .filter((record) => !record.isSubagent && record.metadata?.creatxInternalRole !== "growth-stage")
      .map((record) => {
        const kind = typeof record.metadata?.creatxProjectId === "string" ? "project" : "personal"
        return toSessionSummary(record, this.sessionPermissions.ensure(record.sessionId, kind))
      }))
    this.sessionListInFlight = request
    try {
      return await request
    } finally {
      if (this.sessionListInFlight === request) this.sessionListInFlight = undefined
    }
  }

  private rejectSessionApprovals(sessionId: string, reason: string) {
    for (const [approvalId, pending] of this.pendingApprovals) {
      if (pending.request.sessionId !== sessionId) continue
      this.pendingApprovals.delete(approvalId)
      pending.resolve({ approved: false, reason })
      this.emitEvent({ type: "approval.resolved", sessionId, approvalId, approved: false })
    }
  }

  private emitEvent(event: CreatXEvent) {
    if (event.type === "image.task.changed" || event.type === "growth.goal.changed" || event.type === "project.projection.invalidated" || event.type === "art_library.changed") {
      this.onEvent(event)
      return
    }
    if (event.type === "approval.requested") {
      const sessionId = this.growthOwnerSessionIds.get(event.approval.sessionId) ?? event.approval.sessionId
      this.onEvent({ ...event, approval: { ...event.approval, sessionId } })
      return
    }
    const sessionId = event.sessionId ? this.growthOwnerSessionIds.get(event.sessionId) ?? event.sessionId : undefined
    this.onEvent({ ...event, ...(sessionId ? { sessionId } : {}) })
  }

  private async stopGrowthWorker(ownerSessionId: string, workerSessionId: string) {
    try {
      this.rejectSessionApprovals(workerSessionId, "Growth stage ended")
      await this.core.stop(workerSessionId)
    } finally {
      const workers = this.activeGrowthWorkerIds.get(ownerSessionId)
      workers?.delete(workerSessionId)
      if (!workers?.size) this.activeGrowthWorkerIds.delete(ownerSessionId)
      this.growthOwnerSessionIds.delete(workerSessionId)
      this.activeSessionIds.delete(workerSessionId)
      this.runningSessionIds.delete(workerSessionId)
      this.activeProjectIds.delete(workerSessionId)
      this.activeProjectRoots.delete(workerSessionId)
      this.activeGrowthStages.delete(workerSessionId)
      this.activeAudiences.delete(workerSessionId)
      this.sessionToolPolicyControllers.delete(workerSessionId)
    }
  }

  private recordGrowthStageFailure(sessionId: string, failure: GrowthStageFailure) {
    const failures = this.growthStageFailures.get(sessionId) ?? new Map<string, GrowthStageFailure>()
    const key = failure.toolCallId ? `tool:${failure.toolCallId}` : `runtime:${failure.error.code}:${failure.error.detail ?? failure.error.message}`
    if (!failures.has(key)) {
      failures.set(key, failure)
      try {
        this.growthStageFailureObservers.get(sessionId)?.(failure)
      } catch {
        // The terminal result retains the original failure so Scheduler reconciliation can persist it later.
      }
    }
    this.growthStageFailures.set(sessionId, failures)
  }

  private recordSkillSequenceToolSuccess(sessionId: string, toolName: string, output: unknown) {
    const step = this.activeSkillSequenceSteps.get(sessionId)
    if (!step || !output || typeof output !== "object" || Array.isArray(output)) return
    const value = output as Record<string, unknown>
    if (value.projectId !== this.activeProjectIds.get(sessionId)) return
    if (toolName === "generate_image" && typeof value.relativePath === "string") {
      step.synchronousImagePaths.add(normalizeSkillSequenceArtifactPath(value.relativePath))
    }
    if (toolName === "submit_image_generation" && typeof value.imageTaskId === "string" && value.imageTaskId.trim()) {
      step.submittedImageTaskIds.add(value.imageTaskId.trim())
    }
  }

  private requireReady() {
    if (this.disposed) throw new Error("runtime: Cline adapter is disposed")
    if (!this.configured) throw new Error("API key is missing for the configured Provider")
  }

  private beginOwnerActivation(sessionId: string, ownerActivationIdInput: string, audience: "owner-growth" | "owner-growth-issue" | "owner-growth-delivery") {
    const ownerActivationId = requireText(ownerActivationIdInput, "ownerActivationId")
    if (this.runningSessionIds.has(sessionId)) throw new Error("session_conflict: session already has an active Run")
    if (this.activeOwnerActivationIds.has(sessionId)) throw new Error("growth_conflict: Owner session already has an active Growth control turn")
    if (this.activeAudiences.get(sessionId) !== audience) throw new Error("compatibility: Owner session Runtime does not match the requested Growth audience")
    this.activeOwnerActivationIds.set(sessionId, ownerActivationId)
  }

  private endOwnerActivation(sessionId: string, ownerActivationId: string) {
    if (this.activeOwnerActivationIds.get(sessionId) === ownerActivationId) this.activeOwnerActivationIds.delete(sessionId)
  }

  private async deactivateSession(sessionId: string, reason: string) {
    this.rejectSessionApprovals(sessionId, reason)
    if (this.activeSessionIds.has(sessionId)) await this.core.stop(sessionId)
    this.activeSessionIds.delete(sessionId)
    this.runningSessionIds.delete(sessionId)
    this.activeProjectIds.delete(sessionId)
    this.activeProjectRoots.delete(sessionId)
    this.activeGrowthStages.delete(sessionId)
    this.activeAudiences.delete(sessionId)
    this.activeOwnerActivationIds.delete(sessionId)
    this.sessionToolPolicyControllers.delete(sessionId)
  }

  private async ensureActiveSession(sessionId: string) {
    if (this.activeSessionIds.has(sessionId)) return
    await this.activatePersistedSession(sessionId, "ordinary")
  }

  private async ensureSessionAudience(sessionId: string, audience: CreatXToolAudience) {
    await this.ensureActiveSession(sessionId)
    if (this.activeAudiences.get(sessionId) === audience) return
    if (this.runningSessionIds.has(sessionId)) throw new Error("session_conflict: cannot change Tool audience during an active Run")
    await this.core.stop(sessionId)
    this.activeSessionIds.delete(sessionId)
    this.activeAudiences.delete(sessionId)
    this.sessionToolPolicyControllers.delete(sessionId)
    await this.activatePersistedSession(sessionId, audience)
  }

  private async activatePersistedSession(sessionId: string, audience: CreatXToolAudience) {
    await claimPersistedSessionProcess(this.store, this.sessionService, sessionId)
    const record = await this.core.get(sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    const messages = await this.core.readMessages(sessionId)
    const projectRoot = record.workspaceRoot || record.cwd
    const storedProjectId = typeof record.metadata?.creatxProjectId === "string" ? record.metadata.creatxProjectId : undefined
    const projectId = storedProjectId ?? this.resolveProjectId?.(projectRoot)
    const permission = this.sessionPermissions.ensure(sessionId, projectId ? "project" : "personal")
    const providerId = typeof record.metadata?.creatxProviderId === "string" ? record.metadata.creatxProviderId : record.provider
    const modelId = typeof record.metadata?.creatxModelId === "string" ? record.metadata.creatxModelId : record.model
    const profileId = typeof record.metadata?.creatxTextProfileId === "string" ? record.metadata.creatxTextProfileId : undefined
    const persistedConnection = this.resolveModelConnection?.(providerId, modelId, profileId)
    const connection = persistedConnection?.apiKey ? persistedConnection : requireConfiguredDefaultConnection(this.defaultConnection)
    await this.startSession({
      ...(projectId ? { projectId } : {}),
      projectRoot,
      sessionId,
      initialMessages: messages,
      title: typeof record.metadata?.title === "string" ? record.metadata.title : record.prompt?.slice(0, 40) || "继续会话",
      kind: permission.kind,
      permissionMode: permission.mode,
      audience,
      connection,
    })
  }
}

export function normalizeGrowthStageIdentity(identity: GrowthStageIdentity): GrowthStageIdentity {
  if (!identity.goalId.trim() || !identity.stageKey.trim() || !Number.isSafeInteger(identity.version) || identity.version < 1) {
    throw new Error("growth_invalid: invalid Growth stage identity")
  }
  if (identity.ownerActivationId !== undefined && !identity.ownerActivationId.trim()) throw new Error("growth_invalid: invalid Owner activation identity")
  return {
    goalId: identity.goalId.trim(),
    ...(identity.ownerActivationId ? { ownerActivationId: identity.ownerActivationId.trim() } : {}),
    version: identity.version,
    stageKey: identity.stageKey.trim(),
    ...(identity.worldEntryMode ? { worldEntryMode: identity.worldEntryMode } : {}),
    ...(identity.worldEntryStage ? { worldEntryStage: identity.worldEntryStage } : {}),
    ...(identity.attemptId ? { attemptId: identity.attemptId } : {}),
    ...(identity.workItemId ? { workItemId: identity.workItemId } : {}),
    ...(identity.workItemTitle ? { workItemTitle: identity.workItemTitle } : {}),
    ...(identity.workRootPath ? { workRootPath: identity.workRootPath } : {}),
  }
}

export function growthStageFailureFromEvent(event: CoreSessionEvent): GrowthStageFailure | undefined {
  if (event.type !== "agent_event") return undefined
  const content = event.payload.event
  if (content.type !== "content_end" || content.contentType !== "tool" || !content.toolCallId || !content.toolName || !content.error) return undefined
  return {
    source: "tool",
    toolCallId: content.toolCallId,
    toolName: content.toolName,
    error: classifyRuntimeError(content.error),
  }
}

function isToolFailureSummary(error: CreatXError) {
  return /\d+ tool call\(s\) failed/iu.test(error.detail ?? "")
}

export function createProjectFileReadExecutor(
  resolveProjectRoot: (sessionId: string) => string | undefined,
  imageBudget = new ProjectImageReadTurnBudget(),
): NonNullable<ToolExecutors["readFile"]> {
  return async (request, context) => {
    const sessionId = context.sessionId
    if (!sessionId) throw new Error("file_invalid: read_files requires a project session")
    const projectRoot = resolveProjectRoot(sessionId)
    if (!projectRoot) throw new Error("file_invalid: read_files cannot resolve the active project root")
    if (!request.path.trim()) throw new Error("file_invalid: read_files requires a file path")

    const root = resolve(projectRoot)
    const requestedPath = isAbsolute(request.path) ? normalize(request.path) : resolve(root, request.path)
    requirePathInsideProject(root, requestedPath)
    const info = await lstat(requestedPath).catch((error: unknown) => {
      if (isFileNotFound(error)) throw new Error(`file_invalid: project file does not exist: ${request.path}`)
      throw error
    })
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`file_invalid: path is not a regular project file: ${request.path}`)
    }
    const canonicalPath = await realpath(requestedPath)
    requirePathInsideProject(root, canonicalPath)
    const bytes = await readFile(canonicalPath)
    const mediaType = PROJECT_IMAGE_MEDIA_TYPES.get(extname(canonicalPath).toLocaleLowerCase("en-US"))
    if (mediaType) {
      if (bytes.byteLength > PROJECT_READ_MAX_BYTES) throw new Error("file_invalid: project image is too large to read")
      if (context.metadata?.modelSupportsImages !== true) throw new Error("file_invalid: current model does not support image input")
      const reserved = imageBudget.reserve(sessionId, bytes.byteLength)
      try {
        return [
          { type: "text", text: "Successfully read image" },
          { type: "image", data: bytes.toString("base64"), mediaType },
        ]
      } catch (error) {
        imageBudget.release(sessionId, reserved)
        throw error
      }
    }
    if (bytes.byteLength > PROJECT_READ_MAX_BYTES) throw new Error("file_invalid: project text file is too large to read")
    return formatProjectTextWindow(decodeProjectUtf8(bytes, request.path), request.start_line, request.end_line)
  }
}

const PROJECT_READ_MAX_BYTES = 10_000_000
const PROJECT_READ_MAX_LINES = 1_000
const PROJECT_READ_MAX_CHARS = 50_000
const PROJECT_IMAGE_MEDIA_TYPES = new Map([
  [".gif", "image/gif"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
])

function decodeProjectUtf8(bytes: Uint8Array, requestedPath: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`file_invalid: project text is not valid UTF-8: ${requestedPath}`)
  }
}

function formatProjectTextWindow(content: string, requestedStart?: number | null, requestedEnd?: number | null) {
  const lines = content.split(/\r?\n/u)
  const start = requestedStart ?? 1
  const end = requestedEnd ?? lines.length
  if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < start) {
    throw new Error("file_invalid: invalid inclusive line range")
  }
  const selected: string[] = []
  let characters = 0
  const finalLine = Math.min(end, lines.length, start + PROJECT_READ_MAX_LINES - 1)
  for (let lineNumber = start; lineNumber <= finalLine; lineNumber += 1) {
    const text = lines[lineNumber - 1] ?? ""
    const rendered = `${lineNumber} | ${text}`
    if (characters + rendered.length + 1 > PROJECT_READ_MAX_CHARS && selected.length) break
    selected.push(rendered)
    characters += rendered.length + 1
  }
  const lastLine = start + selected.length - 1
  const suffix = lastLine < Math.min(end, lines.length)
    ? `\n\n[Showing lines ${start}-${lastLine} of ${lines.length}. Use start_line/end_line to read other sections.]`
    : ""
  return `${selected.join("\n")}${suffix}`
}

function requirePathInsideProject(projectRoot: string, path: string) {
  const relation = relative(projectRoot, path)
  if (isAbsolute(relation) || relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error("file_invalid: path escapes the active project root")
  }
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

export async function executeGrowthStageBinding(
  command: GrowthStageRunCommand,
  bind: (identity: GrowthStageIdentity | undefined) => void,
  run: () => Promise<GrowthStageRunResult>,
) {
  if (!command.goalId.trim() || !command.projectId.trim() || !command.sessionId.trim()) {
    throw new Error("growth_invalid: Growth stage identity is incomplete")
  }
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
    throw new Error("growth_invalid: Growth stage version must be a positive integer")
  }
  if (!command.stageKey.trim()) throw new Error("growth_invalid: Growth stage key must not be empty")
  if (command.ownerActivationId !== undefined && !command.ownerActivationId.trim()) throw new Error("growth_invalid: Growth Owner activation must not be empty")
  bind({
    goalId: command.goalId.trim(),
    ...(command.ownerActivationId ? { ownerActivationId: command.ownerActivationId.trim() } : {}),
    version: command.expectedVersion,
    stageKey: command.stageKey.trim(),
    ...(command.worldEntryMode ? { worldEntryMode: command.worldEntryMode } : {}),
    ...(command.worldEntryStage ? { worldEntryStage: command.worldEntryStage } : {}),
    ...(command.attemptId ? { attemptId: command.attemptId } : {}),
    ...(command.workItemId ? { workItemId: command.workItemId } : {}),
    ...(command.workItemTitle ? { workItemTitle: command.workItemTitle } : {}),
    ...(command.workRootPath ? { workRootPath: command.workRootPath } : {}),
  })
  try {
    return await run()
  } finally {
    bind(undefined)
  }
}

export function settledGrowthStageResults(results: readonly PromiseSettledResult<GrowthStageRunResult>[]): GrowthStageRunResult[] {
  return results.map((result) => result.status === "fulfilled"
    ? result.value
    : { state: "failed", reason: result.reason instanceof Error ? result.reason.message : String(result.reason) })
}

export function mergeOwnerAndWorkerTimeline(ownerItems: readonly TimelineItem[], workerItems: readonly TimelineItem[]) {
  const pendingWorkers = new Map<string, TimelineItem[]>()
  const detachedWorkers: TimelineItem[] = []
  workerItems.forEach((item) => {
    const ownerActivationId = item.ownerActivationId ?? item.activity?.ownerActivationId
    if (!ownerActivationId) {
      detachedWorkers.push(item)
      return
    }
    const items = pendingWorkers.get(ownerActivationId) ?? []
    items.push(item)
    pendingWorkers.set(ownerActivationId, items)
  })
  const insertionPoints = new Map<number, TimelineItem[]>()
  pendingWorkers.forEach((workers, ownerActivationId) => {
    const assistantIndex = ownerItems.findIndex((item) => item.ownerActivationId === ownerActivationId && item.kind === "message" && item.presentation === "assistant")
    const lastOwnerIndex = ownerItems.findLastIndex((item) => item.ownerActivationId === ownerActivationId)
    if (lastOwnerIndex < 0) {
      detachedWorkers.push(...workers)
      return
    }
    const insertionIndex = assistantIndex >= 0 ? assistantIndex : lastOwnerIndex + 1
    const items = insertionPoints.get(insertionIndex) ?? []
    items.push(...workers)
    insertionPoints.set(insertionIndex, items)
  })
  const merged = ownerItems.flatMap((item, index) => [...(insertionPoints.get(index) ?? []), item])
  return [...merged, ...(insertionPoints.get(ownerItems.length) ?? []), ...detachedWorkers].map((item, index) => ({ ...item, sequence: index + 1 }))
}

export function latestAssistantText(messages: readonly Message[]) {
  const message = messages.findLast((candidate) => candidate.role === "assistant")
  if (!message) return undefined
  const text = (typeof message.content === "string" ? [message.content.trim()] : message.content
    .flatMap((block) => block.type === "text" ? [block.text.trim()] : []))
    .filter(Boolean)
    .join("\n")
  return text ? text.slice(0, 1_000) : undefined
}

export function ownerActivationPrompt(prompt: string, ownerActivationId: string) {
  return `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:${requireText(ownerActivationId, "ownerActivationId")}\n</mode_notice>\n${requireText(prompt, "prompt")}`
}

export function skillSequenceTurnPrompt(promptInput: string, skillSequenceInput: readonly string[], indexInput: number, sequenceRunId?: string) {
  const prompt = requireText(promptInput, "Skill sequence user request")
  const skillSequence = skillSequenceInput.map((skillName) => requireText(skillName, "Skill sequence name"))
  if (!skillSequence.length) throw new Error("skill_sequence_invalid: at least one Skill is required")
  if (!Number.isSafeInteger(indexInput) || indexInput < 0 || indexInput >= skillSequence.length) throw new Error("skill_sequence_invalid: stage index is outside the sequence")
  const skillName = skillSequence[indexInput]!
  const finalInstruction = indexInput === skillSequence.length - 1
    ? "这是最后一轮。完成当前 Skill 的真实工作后，结合前面各轮已经完成和未完成的内容，给用户一份简洁、可理解的最终汇报。"
    : "这不是最后一轮。只完成当前 Skill 对用户任务负责的部分，清楚说明真实产物与未完成边界；不要提前执行后续 Skill。"
  const identity = sequenceRunId ? `\n序列执行 ID：${requireText(sequenceRunId, "Skill sequence run id")}；当前执行片段：1/${SKILL_SEQUENCE_MAX_SLICES}。` : ""
  const directive = `<mode_notice>\nCreatX Skill Sequence：第 ${indexInput + 1}/${skillSequence.length} 轮。${identity}\n当前唯一方法：${skillName}\nSkill 序列只规定方法与顺序，用户原话是唯一任务权威。第一项工具行动必须通过 Cline skills 加载 ${skillName}；不要只复述使用手册。读取同一会话上文与真实项目文件，承接前轮已经落盘的结果。\n当前任务结束前必须调用 ${SKILL_SEQUENCE_REPORT_TOOL}：只有真实成品、必需图片和验证都完整完成时才能报告 completed；任何缺失都报告 partial 或 blocked，并列出未完成项。地图、人物群像与漫画必须把每张同步 generate_image 成品路径列入 artifactPaths；通过持久图片队列生成的成品则同时提交对应 imageTaskId。提交完当前项的持久图片任务后，只调用一次 ${SKILL_SEQUENCE_IMAGE_WAIT_TOOL} 等待本步骤图片终态；禁止用 Shell 睡眠、反复查目录或反复列出图片任务轮询。不能把脚本、清单或失败图片当成完整成品。没有可信 completed 回执，系统不会进入下一项。\n${finalInstruction}\n完整顺序：${skillSequence.join(" -> ")}\n</mode_notice>`
  if (indexInput === 0) return `${directive}\n${prompt}`
  return `${CREATX_INTERNAL_SKILL_SEQUENCE}\n${directive}\n继续执行用户上一条正式任务：${prompt}`
}

export function skillSequenceContinuationPrompt(promptInput: string, skillSequenceInput: readonly string[], indexInput: number, sliceIndexInput: number, sequenceRunIdInput: string) {
  const prompt = requireText(promptInput, "Skill sequence user request")
  const skillSequence = skillSequenceInput.map((skillName) => requireText(skillName, "Skill sequence name"))
  if (!Number.isSafeInteger(indexInput) || indexInput < 0 || indexInput >= skillSequence.length) throw new Error("skill_sequence_invalid: stage index is outside the sequence")
  if (!Number.isSafeInteger(sliceIndexInput) || sliceIndexInput < 1 || sliceIndexInput >= SKILL_SEQUENCE_MAX_SLICES) throw new Error("skill_sequence_invalid: continuation slice is outside the budget")
  const skillName = skillSequence[indexInput]!
  return `${CREATX_INTERNAL_SKILL_SEQUENCE}\n<mode_notice>\nCreatX Skill Sequence 自动续跑。\n序列执行 ID：${requireText(sequenceRunIdInput, "Skill sequence run id")}；第 ${indexInput + 1}/${skillSequence.length} 个 Skill；执行片段 ${sliceIndexInput + 1}/${SKILL_SEQUENCE_MAX_SLICES}。\n当前唯一方法仍是：${skillName}。\n上个片段达到迭代预算，或正常结束但没有形成可信完整交付回执。先读取同一 Cline 历史、已成功工具结果和真实项目文件；继续未完成步骤，不要重复已经成功的写入、生图或其他副作用。持久图片仍在排队或生成时，只调用一次 ${SKILL_SEQUENCE_IMAGE_WAIT_TOOL}，不要用 Shell 睡眠或重复轮询。如果真实工作已完成，只验证产物并调用 ${SKILL_SEQUENCE_REPORT_TOOL}，不要重做。当前 Skill 完成后再给出正式完成回复；不得提前执行后续 Skill。\n</mode_notice>\n继续执行用户上一条正式任务：${prompt}`
}

export function isMaxIterationsBoundary(result: GrowthStageRunResult) {
  return isMaxIterationsText(result.reason) || Boolean(result.failure && isMaxIterationsError(result.failure))
}

export function isMaxIterationsAgentResult(result: { finishReason?: string; iterations?: number; toolCalls?: readonly unknown[] } | undefined, budget: number) {
  return result?.finishReason === "error"
    && Number.isSafeInteger(result.iterations)
    && result.iterations! >= budget
    && Array.isArray(result.toolCalls)
    && result.toolCalls.length >= result.iterations!
}

function isMaxIterationsEvent(event: CoreSessionEvent) {
  if (event.type !== "agent_event" || event.payload.event.type !== "error") return false
  return isMaxIterationsError(classifyRuntimeError(event.payload.event.error))
}

function isMaxIterationsError(error: CreatXError) {
  return isMaxIterationsText(error.detail ?? error.message)
}

function isMaxIterationsText(value: string | undefined) {
  const detail = value?.toLocaleLowerCase("en-US") ?? ""
  return detail.includes("maxiterations") || detail.includes("max_iterations") || detail.includes("max iterations")
}

function skillSequenceIncompleteResult(sequenceRunId: string, skillSequence: readonly string[], completedSkills: readonly string[], currentIndex: number, slicesUsed: number, result: GrowthStageRunResult, receipt?: SkillSequenceStepReceipt) {
  return {
    sequenceRunId,
    state: result.state === "cancelled" ? "cancelled" as const : "incomplete" as const,
    stepStatus: receipt?.status ?? "unknown" as const,
    completedSkills: [...completedSkills],
    currentSkill: skillSequence[currentIndex],
    pendingSkills: skillSequence.slice(currentIndex + 1),
    slicesUsed,
    reason: receipt?.unresolved.join("；") || result.reason || "missing_trusted_step_receipt",
    ...(receipt ? { receipt } : {}),
  }
}

function requireSkillSequenceReceipt(input: unknown): SkillSequenceStepReceipt {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("skill_sequence_invalid: step report must be an object")
  const value = input as Record<string, unknown>
  const status = value.status
  if (status !== "completed" && status !== "partial" && status !== "blocked") throw new Error("skill_sequence_invalid: unsupported step status")
  return {
    status,
    summary: requireText(value.summary, "Skill step summary"),
    artifactPaths: requireStringArray(value.artifactPaths, "artifactPaths"),
    requiredImageTaskIds: requireStringArray(value.requiredImageTaskIds, "requiredImageTaskIds"),
    unresolved: requireStringArray(value.unresolved, "unresolved"),
  }
}

function requireStringArray(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) throw new Error(`skill_sequence_invalid: ${name} must be an array of non-empty strings`)
  return [...new Set(value.map((entry) => entry.trim()))]
}

async function requireSkillSequenceArtifact(projectRoot: string, artifactPathInput: string) {
  const artifactPath = normalizeSkillSequenceArtifactPath(artifactPathInput)
  if (isAbsolute(artifactPath) || artifactPath.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) {
    throw new Error(`skill_sequence_invalid: unsafe artifact path ${artifactPathInput}`)
  }
  const candidate = resolve(projectRoot, artifactPath)
  const fromRoot = relative(resolve(projectRoot), candidate)
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) throw new Error(`skill_sequence_invalid: artifact escapes project ${artifactPathInput}`)
  await stat(candidate)
}

function normalizeSkillSequenceArtifactPath(value: string) {
  return value.replaceAll("\\", "/")
}

export function findOwnerActivationEvidence(messages: readonly Message[], ownerActivationIdInput: string, controllerToolName: string): {
  controllerCallCount: 0 | 1
  controllerResult: "none" | "success" | "error"
  reply: string | undefined
} | undefined {
  const ownerActivationId = requireText(ownerActivationIdInput, "ownerActivationId")
  const marker = `${CREATX_GROWTH_ACTIVATION_MARKER}:${ownerActivationId}`
  const turns = messages.flatMap((message, index) => {
    if (!isUserPromptMessage(message) || !ownerActivationMarkerMatches(rawMessageText(message), marker)) return []
    const nextUserOffset = messages.slice(index + 1).findIndex(isUserPromptMessage)
    const turnEnd = nextUserOffset < 0 ? messages.length : index + 1 + nextUserOffset
    return [messages.slice(index + 1, turnEnd)]
  })
  if (!turns.length) return undefined
  const calls = turns.flatMap((turn, turnIndex) => turn.flatMap((entry, messageIndex) => typeof entry.content === "string" ? [] : entry.content
    .flatMap((part) => part.type === "tool_use" && part.name === controllerToolName ? [{ id: part.id, turnIndex, messageIndex }] : [])))
  if (calls.length > 1) return undefined
  if (!calls.length) {
    if (turns.length !== 1 || turns[0]!.some((entry) => typeof entry.content !== "string" && entry.content.some((part) => part.type === "tool_result" && part.name === controllerToolName))) return undefined
    return { controllerCallCount: 0, controllerResult: "none", reply: latestAssistantText(turns[0]!) }
  }
  const call = calls[0]!
  const results = turns.flatMap((turn, turnIndex) => turn.flatMap((entry, messageIndex) => typeof entry.content === "string" ? [] : entry.content
    .flatMap((part) => part.type === "tool_result" && part.name === controllerToolName ? [{ part, turnIndex, messageIndex }] : [])))
  if (results.length !== 1) return undefined
  const result = results[0]!
  if (result.part.tool_use_id !== call.id || result.turnIndex !== call.turnIndex || result.messageIndex <= call.messageIndex) return undefined
  return {
    controllerCallCount: 1,
    controllerResult: !result.part.is_error && toolResultHasActivation(result.part.content, ownerActivationId) ? "success" : "error",
    reply: latestAssistantText(turns[call.turnIndex]!.slice(result.messageIndex + 1)),
  }
}

export function hasPersistedOwnerControllerResult(messages: readonly Message[], ownerActivationIdInput: string, controllerToolName: string) {
  return findUniqueOwnerControllerTurn(messages, ownerActivationIdInput, controllerToolName)?.controllerResult === "success"
}

export function findUniqueOwnerControllerTurn(messages: readonly Message[], ownerActivationIdInput: string, controllerToolName: string): {
  controllerCallCount: 1
  controllerResult: "success" | "error"
  reply: string | undefined
} | undefined {
  const evidence = findOwnerActivationEvidence(messages, ownerActivationIdInput, controllerToolName)
  return evidence?.controllerCallCount === 1 ? evidence as typeof evidence & { controllerCallCount: 1; controllerResult: "success" | "error" } : undefined
}

export function ownerActivationMarkerMatches(text: string, marker: string) {
  return text.split(/\r?\n/).some((line) => line.trim() === marker)
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return []
    const text = (part as { text?: unknown }).text
    return typeof text === "string" ? [text] : []
  }).join("\n")
}

function toolResultHasActivation(content: unknown, ownerActivationId: string) {
  const text = toolResultText(content)
  if (!text) return false
  try {
    return containsActivationId(JSON.parse(text), ownerActivationId)
  } catch {
    return false
  }
}

function containsActivationId(value: unknown, ownerActivationId: string): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((entry) => containsActivationId(entry, ownerActivationId))
  const record = value as Record<string, unknown>
  if (record.activationId === ownerActivationId) return true
  return Object.values(record).some((entry) => containsActivationId(entry, ownerActivationId))
}

export function maxIterationsForSession(growthOwnerSessionId?: string) {
  return growthOwnerSessionId ? 18 : 12
}

export async function claimPersistedSessionProcess(store: SqliteSessionStore, sessionService: CoreSessionService, sessionIdInput: string, currentPid = process.pid, isPidAlive = defaultIsPidAlive) {
  const sessionId = requireText(sessionIdInput, "sessionId")
  const initial = store.get(sessionId)
  if (!initial) throw new Error("session_missing: Cline history does not contain this session")
  const initialPid = initial.pid ?? 0
  if (initialPid === currentPid) return initial
  if (isPidAlive(initialPid)) throw new Error(`session_conflict: session is owned by live process ${initialPid}`)

  await sessionService.reconcileDeadSessions()
  const reconciled = store.get(sessionId)
  if (!reconciled) throw new Error("session_missing: Cline history disappeared during process takeover")
  const reconciledPid = reconciled.pid ?? 0
  if (reconciledPid === currentPid) return reconciled
  if (reconciledPid !== initialPid || isPidAlive(reconciledPid)) throw new Error(`session_conflict: session ownership changed to process ${reconciledPid}`)

  const claimed = store.run("UPDATE sessions SET pid = ?, updated_at = ? WHERE session_id = ? AND pid = ?", [currentPid, new Date().toISOString(), sessionId, reconciledPid])
  if (claimed.changes !== 1) throw new Error("session_conflict: session ownership changed during process takeover")
  const manifest = sessionService.readSessionManifest(sessionId)
  if (manifest) {
    sessionService.writeSessionManifest(join(sessionService.ensureSessionsDir(), sessionId, `${sessionId}.json`), { ...manifest, pid: currentPid })
  }
  const record = store.get(sessionId)
  if (!record || record.pid !== currentPid) throw new Error("session_persistence: session process takeover was not persisted")
  return record
}

function defaultIsPidAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM"
  }
}

export function skillsForWorkerProfile(
  ordinarySkills: readonly string[],
  workerSkills: Partial<Record<GrowthWorkerProfile, readonly string[]>>,
  profile?: GrowthWorkerProfile,
) {
  return profile ? [...(workerSkills[profile] ?? [])] : [...ordinarySkills]
}

export async function executeSteerDelivery(
  command: { sessionId: string; prompt: string; userFiles?: readonly string[]; userImages?: readonly string[] },
  send: (input: { sessionId: string; prompt: string; delivery: "steer"; userFiles?: string[]; userImages?: string[] }) => Promise<unknown>,
) {
  const sessionId = requireText(command.sessionId, "sessionId")
  const prompt = requireText(command.prompt, "Steer prompt")
  await send({
    sessionId,
    prompt,
    delivery: "steer",
    ...(command.userFiles?.length ? { userFiles: [...command.userFiles] } : {}),
    ...(command.userImages?.length ? { userImages: [...command.userImages] } : {}),
  })
}

async function requireUserAttachments(input: ClineUserAttachments) {
  return {
    userFiles: await requireReadableUserFiles(input.userFiles ?? []),
    userImages: requireUserImages(input.userImages ?? []),
  }
}

function requireUserImages(userImages: readonly string[]) {
  const images = [...new Set(userImages.map((image) => image.trim()).filter(Boolean))]
  const total = images.reduce((bytes, image) => {
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(image)
    if (!match || match[2]!.length % 4 !== 0) throw new Error("attachment_invalid: chat image must be a PNG or JPEG data URL")
    const size = Buffer.from(match[2]!, "base64").byteLength
    if (!size || size > CHAT_IMAGE_ATTACHMENT_MAX_BYTES) throw new Error("attachment_invalid: chat image exceeds the per-image size limit")
    return bytes + size
  }, 0)
  if (total > CHAT_IMAGE_ATTACHMENTS_MAX_BYTES) throw new Error("attachment_invalid: chat images exceed the total size limit")
  return images
}

async function requireReadableUserFiles(userFiles: readonly string[]) {
  return Promise.all([...new Set(userFiles.map((filePath) => filePath.trim()).filter(Boolean))].map(async (filePath) => {
    if (!isAbsolute(filePath)) throw new Error("attachment_invalid: attachment path must be absolute")
    try {
      if (!(await stat(filePath)).isFile()) throw new Error("attachment_unreadable: attachment is not a file")
      await readFile(filePath)
      return filePath
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("attachment_")) throw error
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("attachment_missing: selected file no longer exists")
      throw new Error(`attachment_unreadable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
}

function createProviderFetch(dispatcher: EnvHttpProxyAgent): typeof fetch {
  const providerFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])
    return response as unknown as Response
  }
  return Object.assign(providerFetch, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

export function defaultToolPolicies(tools: readonly CreatXToolContribution[] = []): Record<string, { enabled: boolean; autoApprove: boolean }> {
  return sessionToolPolicies("approval", "project", tools)
}

export function sessionToolPolicies(
  mode: SessionPermissionMode,
  kind: SessionKind,
  tools: readonly CreatXToolContribution[] = [],
  directFileMutation: "enabled" | "disabled" = "enabled",
  workerProfile?: GrowthWorkerProfile,
  audience: CreatXToolAudience = workerProfile ?? "ordinary",
): Record<string, { enabled: boolean; autoApprove: boolean }> {
  const permissionMode = requireSessionPermissionMode(mode)
  const sessionKind = requireSessionKind(kind)
  if (workerProfile) return growthWorkerToolPolicies(workerProfile, tools)
  const ordinaryTools = creatXToolsForAudience(tools, audience)
  const ordinaryToolNames = new Set(ordinaryTools.map((tool) => tool.name))
  const contributionPolicies = (enabled: boolean, autoApprove: (tool: CreatXToolContribution) => boolean) => Object.fromEntries(tools.map((tool) => [tool.name, ordinaryToolNames.has(tool.name) && enabled
    ? { enabled: true, autoApprove: autoApprove(tool) }
    : { enabled: false, autoApprove: false }]))
  if (sessionKind === "personal") {
    return {
      "*": { enabled: false, autoApprove: false },
      skills: { enabled: true, autoApprove: true },
      ...Object.fromEntries(tools.map((tool) => [tool.name, ordinaryToolNames.has(tool.name) && tool.scope !== "project"
        ? { enabled: true, autoApprove: permissionMode === "free" || tool.approval === "automatic" }
        : { enabled: false, autoApprove: false }])),
    }
  }
  if (permissionMode === "free") {
    const policies = {
      "*": { enabled: true, autoApprove: true },
      skills: { enabled: true, autoApprove: true },
      ...contributionPolicies(true, () => true),
    }
    if (directFileMutation === "enabled") return policies
    return {
      ...policies,
      editor: { enabled: false, autoApprove: false },
      apply_patch: { enabled: false, autoApprove: false },
      run_commands: { enabled: false, autoApprove: false },
    }
  }
  return {
    "*": { enabled: true, autoApprove: false },
    read_files: { enabled: true, autoApprove: true },
    search_codebase: { enabled: true, autoApprove: true },
    skills: { enabled: true, autoApprove: true },
    ...contributionPolicies(true, (tool) => tool.approval === "automatic"),
  }
}

export class SessionToolPolicyController {
  readonly policies: Record<string, { enabled: boolean; autoApprove: boolean }>
  private readonly kind: SessionKind
  private readonly tools: readonly CreatXToolContribution[]
  private readonly directFileMutation: "enabled" | "disabled"
  private readonly workerProfile: GrowthWorkerProfile | undefined
  private mode: SessionPermissionMode
  private audience: CreatXToolAudience

  constructor(mode: SessionPermissionMode, kind: SessionKind, tools: readonly CreatXToolContribution[], directFileMutation: "enabled" | "disabled" = "enabled", workerProfile?: GrowthWorkerProfile, audience: CreatXToolAudience = workerProfile ?? "ordinary") {
    this.kind = requireSessionKind(kind)
    this.mode = requireSessionPermissionMode(mode)
    this.tools = tools
    this.directFileMutation = directFileMutation
    this.workerProfile = workerProfile
    this.audience = audience
    this.policies = sessionToolPoliciesForAudience(this.mode, this.kind, tools, directFileMutation, workerProfile, audience)
  }

  setMode(mode: SessionPermissionMode) {
    this.mode = requireSessionPermissionMode(mode)
    this.replacePolicies()
  }

  setAudience(audience: CreatXToolAudience) {
    if (this.workerProfile && audience !== this.workerProfile) throw new Error("compatibility: Growth Worker audience cannot change")
    this.audience = audience
    this.replacePolicies()
  }

  private replacePolicies() {
    const next = sessionToolPoliciesForAudience(this.mode, this.kind, this.tools, this.directFileMutation, this.workerProfile, this.audience)
    for (const name of Object.keys(this.policies)) delete this.policies[name]
    Object.assign(this.policies, next)
  }
}

function sessionToolPoliciesForAudience(
  mode: SessionPermissionMode,
  kind: SessionKind,
  tools: readonly CreatXToolContribution[],
  directFileMutation: "enabled" | "disabled",
  workerProfile: GrowthWorkerProfile | undefined,
  audience: CreatXToolAudience,
) {
  if (audience === "ordinary" || audience === "skill-sequence" || workerProfile) return sessionToolPolicies(mode, kind, tools, directFileMutation, workerProfile, audience)
  const allowed = new Set(creatXToolsForAudience(tools, audience).map((tool) => tool.name))
  return {
    "*": { enabled: false, autoApprove: false },
    ...Object.fromEntries([...CLINE_BUILTIN_TOOL_NAMES].map((name) => [name, { enabled: false, autoApprove: false }])),
    ...Object.fromEntries(tools.map((tool) => [tool.name, allowed.has(tool.name)
      ? { enabled: true, autoApprove: true }
      : { enabled: false, autoApprove: false }])),
  }
}

const CLINE_BUILTIN_TOOL_NAMES = new Set([
  "read_files",
  "search_codebase",
  "run_commands",
  "fetch_web_content",
  "apply_patch",
  "editor",
  "skills",
  "ask_question",
  "submit_and_exit",
])

function growthWorkerToolPolicies(profile: GrowthWorkerProfile, tools: readonly CreatXToolContribution[]) {
  const disabled = { enabled: false, autoApprove: false }
  const enabled = { enabled: true, autoApprove: true }
  const allowed = growthWorkerToolAllowlist(profile)
  return {
    "*": disabled,
    ...Object.fromEntries([...CLINE_BUILTIN_TOOL_NAMES].map((name) => [name, allowed.has(name) ? enabled : disabled])),
    ...Object.fromEntries(tools.map((tool) => [tool.name, allowed.has(tool.name) ? enabled : disabled])),
  }
}

function growthWorkerToolAllowlist(profile: GrowthWorkerProfile) {
  if (profile === "growth-stage") return new Set(["read_files", "search_codebase", "fetch_web_content", "skills", "editor", "apply_patch", "submit_image_generation", "register_workbench", "rename_workbench", "report_growth_progress"])
  if (profile === "growth-recovery") return new Set(["read_files", "search_codebase", "skills", "report_growth_progress"])
  if (profile === "world-blueprint") return new Set(["read_files", "search_codebase", "fetch_web_content", "skills", "write_world_blueprint", "report_growth_progress"])
  if (profile === "world-research") return new Set(["read_files", "complete_world_materialization_object"])
  if (profile === "world-writer") return new Set(["read_files", "apply_patch", "editor", "submit_image_generation", "complete_world_materialization_object"])
  if (profile === "world-recovery") return new Set(["read_files", "submit_image_generation", "complete_world_materialization_object"])
  throw new Error(`compatibility: unsupported Growth Worker profile ${String(profile)}`)
}

export function creatXToolsForWorkerProfile(tools: readonly CreatXToolContribution[], profile?: GrowthWorkerProfile) {
  if (profile) growthWorkerToolAllowlist(profile)
  const audience: CreatXToolAudience = profile ?? "ordinary"
  return tools.filter((tool) => tool.audiences.includes(audience)).map((tool) => tool.inputSchemaForWorkerProfile && profile
    ? { ...tool, inputSchema: tool.inputSchemaForWorkerProfile(profile) }
    : tool)
}

export function creatXToolsForAudience(tools: readonly CreatXToolContribution[], audience: CreatXToolAudience, profile?: GrowthWorkerProfile) {
  if (profile) growthWorkerToolAllowlist(profile)
  return tools.filter((tool) => toolSupportsAudience(tool, audience)).map((tool) => tool.inputSchemaForWorkerProfile && profile
    ? { ...tool, inputSchema: tool.inputSchemaForWorkerProfile(profile) }
    : tool)
}

export function validateCreatXToolContributions(tools: readonly CreatXToolContribution[]) {
  const names = new Set<string>()
  for (const tool of tools) {
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(tool.name)) throw new Error(`compatibility: invalid CreatX tool name ${tool.name}`)
    if (CLINE_BUILTIN_TOOL_NAMES.has(tool.name)) throw new Error(`compatibility: CreatX tool collides with Cline built-in ${tool.name}`)
    if (names.has(tool.name)) throw new Error(`compatibility: duplicate CreatX tool name ${tool.name}`)
    if (!tool.description.trim()) throw new Error(`compatibility: CreatX tool ${tool.name} requires a description`)
    if (!tool.audiences.length || new Set(tool.audiences).size !== tool.audiences.length || tool.audiences.some((audience) => !CREATX_TOOL_AUDIENCES.has(audience))) {
      throw new Error(`compatibility: CreatX tool ${tool.name} requires valid unique audiences`)
    }
    if (tool.inputSchema.type !== "object") throw new Error(`compatibility: CreatX tool ${tool.name} requires an object input schema`)
    if (tool.timeoutMs !== undefined && (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0)) {
      throw new Error(`compatibility: CreatX tool ${tool.name} has an invalid timeout`)
    }
    names.add(tool.name)
  }
}

const CREATX_TOOL_AUDIENCES = new Set<CreatXToolAudience>(["ordinary", "skill-sequence", "owner-growth", "owner-growth-issue", "owner-growth-delivery", "growth-stage", "growth-recovery", "world-blueprint", "world-research", "world-writer", "world-recovery"])

function toolSupportsAudience(tool: CreatXToolContribution, audience: CreatXToolAudience) {
  if (audience === "skill-sequence") return tool.audiences.includes("ordinary") || tool.audiences.includes("skill-sequence")
  return tool.audiences.includes(audience)
}

export async function runCreatXToolContribution(tool: CreatXToolContribution, input: unknown, context: CreatXToolExecutionContext) {
  if (!context.sessionId.trim()) throw new Error("session_missing: Cline did not identify the tool session")
  if (tool.scope === "project" && !context.projectId) throw new Error("project_invalid: project tool has no CreatX project identity")
  const result = await tool.execute(input, context)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}${result.error.detail ? ` (${result.error.detail})` : ""}`)
  return result.value
}

function createClineTools(
  tools: readonly CreatXToolContribution[],
  projectIdForSession: (sessionId: string) => string | undefined,
  growthStageForSession: (sessionId: string) => GrowthStageIdentity | undefined,
  audienceForSession: (sessionId: string) => CreatXToolAudience | undefined,
  ownerActivationIdForSession: (sessionId: string) => string | undefined,
  onToolSucceeded?: (sessionId: string, toolName: string, output: unknown) => void,
) {
  return tools.map((tool) => createTool<unknown, unknown>({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.timeoutMs === undefined ? {} : { timeoutMs: tool.timeoutMs }),
    retryable: false,
    execute: async (input, context) => {
      const sessionId = context.sessionId?.trim() ?? ""
      const projectId = projectIdForSession(sessionId)
      const growthStage = growthStageForSession(sessionId)
      const audience = audienceForSession(sessionId)
      if (!audience || !toolSupportsAudience(tool, audience)) throw new Error(`compatibility: ${tool.name} is not enabled for the active session audience`)
      const ownerActivationId = ownerActivationIdForSession(sessionId) ?? growthStage?.ownerActivationId
      const output = await runCreatXToolContribution(tool, input, createTrustedToolExecutionContext({
        sessionId,
        ...(ownerActivationId ? { ownerActivationId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(growthStage ? { growthStage } : {}),
        ...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
        modelSupportsImages: context.metadata?.modelSupportsImages === true,
        ...(context.signal ? { signal: context.signal } : {}),
        ...(context.emitUpdate ? { emitUpdate: context.emitUpdate } : {}),
      }))
      onToolSucceeded?.(sessionId, tool.name, output)
      return output
    },
  }))
}

function createClineToolExtension(tools: ReturnType<typeof createClineTools>): AgentPlugin {
  return {
    name: "creatx-tools",
    manifest: { capabilities: ["tools"] },
    setup(api) {
      tools.forEach((tool) => api.registerTool(tool))
    },
  }
}

export function createTrustedToolExecutionContext(input: {
  sessionId: string
  ownerActivationId?: string
  projectId?: string
  modelSupportsImages?: boolean
  growthStage?: GrowthStageIdentity
  toolCallId?: string
  signal?: AbortSignal
  emitUpdate?: (update: unknown) => void
}): CreatXToolExecutionContext {
  return {
    sessionId: input.sessionId,
    ...(input.modelSupportsImages === undefined ? {} : { modelSupportsImages: input.modelSupportsImages }),
    ...(input.ownerActivationId ? { ownerActivationId: input.ownerActivationId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.growthStage ? { growthGoalId: input.growthStage.goalId, growthGoalVersion: input.growthStage.version } : {}),
    ...(input.growthStage ? { growthStageKey: input.growthStage.stageKey } : {}),
    ...(input.growthStage?.worldEntryMode ? { growthWorldEntryMode: input.growthStage.worldEntryMode } : {}),
    ...(input.growthStage?.worldEntryStage ? { growthWorldEntryStage: input.growthStage.worldEntryStage } : {}),
    ...(input.growthStage?.attemptId ? { growthAttemptId: input.growthStage.attemptId } : {}),
    ...(input.growthStage?.workItemId ? { growthWorkItemId: input.growthStage.workItemId } : {}),
    ...(input.growthStage?.workRootPath ? { growthWorkRootPath: input.growthStage.workRootPath } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.emitUpdate ? { emitUpdate: input.emitUpdate } : {}),
  }
}

export class ClineTimelineProjector {
  private readonly states = new Map<string, { nextSequence: number; nextContent: number; active: Map<string, string>; lastText: Map<string, string>; items: Map<string, TimelineItem> }>()

  project(event: CoreSessionEvent, ownerSessionId?: string, sourceSessionId?: string, activity?: TimelineActivity, exposeFinal?: boolean): CreatXEvent[] {
    if (event.type !== "agent_event") return []
    const sessionId = ownerSessionId ?? event.payload.sessionId
    const sourceId = sourceSessionId ?? event.payload.sessionId
    return this.projectAgentEvent(sessionId, sourceId, event.payload.event, activity, exposeFinal ?? sourceId === sessionId)
  }

  replace(sessionId: string, items: readonly TimelineItem[]) {
    this.states.set(sessionId, {
      nextSequence: Math.max(0, ...items.map((item) => item.sequence)) + 1,
      nextContent: items.length + 1,
      active: new Map(),
      lastText: new Map(),
      items: new Map(items.map((item) => [item.itemId, { ...item }])),
    })
  }

  clear() {
    this.states.clear()
  }

  private projectAgentEvent(sessionId: string, sourceSessionId: string, event: AgentEvent, activity: TimelineActivity | undefined, exposeFinal: boolean): CreatXEvent[] {
    const state = this.state(sessionId)
    const sourcePrefix = sourceSessionId === sessionId ? "" : `growth:${sourceSessionId}:`
    if (event.type === "content_start" && (event.contentType === "text" || event.contentType === "reasoning")) {
      const activeKey = `${sourceSessionId}:${event.contentType}`
      const itemId = state.active.get(activeKey) ?? `${sourcePrefix}${event.contentType}:${state.nextContent++}`
      const previous = state.items.get(itemId)
      const text = event.contentType === "reasoning"
        ? `${previous?.text ?? ""}${event.reasoning ?? event.text ?? ""}`
        : event.accumulated ?? event.text
      const internal = event.contentType === "reasoning" || sourceSessionId !== sessionId
      const kind = event.contentType === "reasoning" || (sourceSessionId !== sessionId && !activity) ? "reasoning" : "message"
      const item: TimelineItem = {
        sequence: previous?.sequence ?? state.nextSequence++,
        itemId,
        kind,
        presentation: internal ? "internal" : "assistant",
        state: "streaming",
        ...(activity?.ownerActivationId ? { ownerActivationId: activity.ownerActivationId } : {}),
        ...(text === undefined ? {} : { text }),
        ...(activity ? { activity } : {}),
      }
      state.active.set(activeKey, itemId)
      if (event.contentType === "text") state.lastText.set(sourceSessionId, itemId)
      state.items.set(itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }]
    }
    if (event.type === "content_end" && (event.contentType === "text" || event.contentType === "reasoning")) {
      const activeKey = `${sourceSessionId}:${event.contentType}`
      const itemId = state.active.get(activeKey) ?? `${sourcePrefix}${event.contentType}:${state.nextContent++}`
      const previous = state.items.get(itemId)
      const text = event.contentType === "reasoning" ? event.reasoning : event.text
      const internal = event.contentType === "reasoning" || sourceSessionId !== sessionId
      const kind = event.contentType === "reasoning" || (sourceSessionId !== sessionId && !activity) ? "reasoning" : "message"
      const item: TimelineItem = {
        sequence: previous?.sequence ?? state.nextSequence++,
        itemId,
        kind,
        presentation: internal ? "internal" : "assistant",
        state: "completed",
        ...(activity?.ownerActivationId ? { ownerActivationId: activity.ownerActivationId } : previous?.ownerActivationId ? { ownerActivationId: previous.ownerActivationId } : {}),
        ...(text !== undefined ? { text } : previous?.text !== undefined ? { text: previous.text } : {}),
        ...(activity ?? previous?.activity ? { activity: activity ?? previous!.activity! } : {}),
      }
      state.active.delete(activeKey)
      if (event.contentType === "text") state.lastText.set(sourceSessionId, itemId)
      state.items.set(itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }]
    }
    if (event.type === "done") {
      if (!exposeFinal || activity || event.reason !== "completed" || !event.text.trim()) return []
      const itemId = state.lastText.get(sourceSessionId) ?? `${sourcePrefix}text:${state.nextContent++}`
      const previous = state.items.get(itemId)
      const item: TimelineItem = {
        sequence: previous?.sequence ?? state.nextSequence++,
        itemId,
        kind: "message",
        presentation: "assistant",
        state: "completed",
        text: event.text,
      }
      state.items.set(itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }]
    }
    if ((event.type === "content_start" || event.type === "content_update" || event.type === "content_end") && event.contentType === "tool" && event.toolCallId && event.toolName) {
      const itemId = `${sourcePrefix}tool:${event.toolCallId}`
      const previous = state.items.get(itemId)
      const staleGrowthReport = event.type === "content_end" && isStaleGrowthReportFailure(event.toolName, event.error)
      const item: TimelineItem = {
        sequence: previous?.sequence ?? state.nextSequence++,
        itemId,
        kind: "tool",
        presentation: "assistant",
        state: event.type === "content_end" ? staleGrowthReport ? "cancelled" : event.error ? "failed" : "completed" : "streaming",
        ...(activity?.ownerActivationId ? { ownerActivationId: activity.ownerActivationId } : previous?.ownerActivationId ? { ownerActivationId: previous.ownerActivationId } : {}),
        toolName: event.toolName,
        ...(event.type === "content_start" ? { input: event.input } : previous?.input === undefined ? {} : { input: previous.input }),
        ...(event.type === "content_update" ? { update: event.update } : previous?.update === undefined ? {} : { update: previous.update }),
        ...(staleGrowthReport ? { output: "目标状态已变化，迟到的阶段汇报已忽略。" } : event.type === "content_end" && event.output !== undefined ? { output: event.output } : previous?.output === undefined ? {} : { output: previous.output }),
        ...(event.type === "content_end" && event.error && !staleGrowthReport ? { error: event.error } : {}),
        ...(activity ?? previous?.activity ? { activity: activity ?? previous!.activity! } : {}),
      }
      state.items.set(itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }]
    }
    if (event.type === "notice") {
      const item: TimelineItem = {
        sequence: state.nextSequence++,
        itemId: `${sourcePrefix}notice:${state.nextContent++}`,
        kind: "notice",
        presentation: event.displayRole === "system" ? "system" : "internal",
        state: "completed",
        text: event.message,
        ...(activity ? { activity } : {}),
      }
      state.items.set(item.itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }]
    }
    if (event.type === "error") {
      const error = classifyRuntimeError(event.error)
      const item: TimelineItem = {
        sequence: state.nextSequence++,
        itemId: `${sourcePrefix}notice:${state.nextContent++}`,
        kind: "notice",
        presentation: "system",
        state: event.recoverable ? "completed" : "failed",
        text: error.message,
        ...(error.detail ? { error: error.detail } : {}),
        ...(activity ? { activity } : {}),
      }
      state.items.set(item.itemId, item)
      return [{ type: "timeline.upsert", sessionId, item }, { type: "runtime.error", sessionId, error }]
    }
    return []
  }

  private state(sessionId: string) {
    const existing = this.states.get(sessionId)
    if (existing) return existing
    const created = { nextSequence: 1, nextContent: 1, active: new Map<string, string>(), lastText: new Map<string, string>(), items: new Map<string, TimelineItem>() }
    this.states.set(sessionId, created)
    return created
  }
}

const standaloneTimelineProjector = new ClineTimelineProjector()

export function projectClineEvent(event: CoreSessionEvent): CreatXEvent[] {
  return standaloneTimelineProjector.project(event)
}

export function isSuccessfulProjectMutation(event: CoreSessionEvent) {
  if (event.type !== "agent_event") return false
  const content = event.payload.event
  return content.type === "content_end"
    && content.contentType === "tool"
    && !content.error
    && CLINE_PROJECT_MUTATION_TOOLS.has(content.toolName ?? "")
}

function throwIfOwnerTurnCancelled(turn: GrowthStageRunResult, signal?: AbortSignal) {
  if (turn.state !== "cancelled") return
  if (signal?.reason instanceof Error) throw signal.reason
  throw new Error(`cancelled: ${turn.reason ?? "Owner Growth turn was cancelled"}`)
}

export function terminalStateFromFinishReason(reason: ClineFinishReason | undefined): RunState {
  if (reason === "completed") return "completed"
  if (reason === "aborted") return "cancelled"
  if (reason === "error") return "failed"
  return "unknown"
}

export function shouldSuppressGrowthRecoverableError(error: CreatXError, hasActiveGrowthStage: boolean) {
  if (!hasActiveGrowthStage) return false
  const detail = error.detail?.toLocaleLowerCase("en-US") ?? ""
  return detail.includes("maxiterations")
    || detail.includes("max_iterations")
    || detail.includes("max iterations")
    || detail.includes("model returned empty response")
    || /\d+ tool call\(s\) failed/.test(detail)
}

export function isStaleGrowthReportFailure(toolName: string | undefined, error: string | undefined) {
  if (toolName !== "report_growth_progress" || !error) return false
  return /growth_conflict:[^\n]*expected(?: [a-z_]+)? version \d+[^\n]*current version is \d+/iu.test(error)
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<void>((resolveDelay, rejectDelay) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abortDelay)
      resolveDelay()
    }, milliseconds)
    const abortDelay = () => {
      clearTimeout(timeout)
      rejectDelay(signal?.reason ?? new Error("cancelled: Skill Sequence image wait was cancelled"))
    }
    signal?.addEventListener("abort", abortDelay, { once: true })
  })
}

const WEB_FETCH_TIMEOUT_MS = 30_000
const WEB_FETCH_MAX_RESPONSE_BYTES = 5_000_000

export function createProxyAwareWebFetchExecutor(dispatcher: EnvHttpProxyAgent): NonNullable<ToolExecutors["webFetch"]> {
  return async (url, prompt, context) => {
    const parsedUrl = requireWebUrl(url)
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, WEB_FETCH_TIMEOUT_MS)
    const abortFromContext = () => controller.abort()
    context.signal?.addEventListener("abort", abortFromContext)

    try {
      const response = await undiciFetch(parsedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
        dispatcher,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      const contentType = response.headers.get("content-type") ?? ""
      const bytes = await readWebResponse(response.body)
      const content = decodeWebContent(bytes, contentType)
      return [
        `URL: ${url}`,
        `Content-Type: ${contentType}`,
        `Size: ${bytes.byteLength} bytes`,
        "",
        "--- Content ---",
        content.slice(0, 50_000),
        ...(content.length > 50_000 ? [`\n[Content truncated: showing first 50000 of ${content.length} characters]`] : []),
        "",
        "--- Analysis Request ---",
        `Prompt: ${prompt}`,
      ].join("\n")
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(timedOut ? `Request timed out after ${WEB_FETCH_TIMEOUT_MS}ms` : "Request aborted")
      }
      throw error
    } finally {
      clearTimeout(timeout)
      context.signal?.removeEventListener("abort", abortFromContext)
    }
  }
}

function requireWebUrl(url: string) {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are supported.`)
  }
  return parsedUrl
}

async function readWebResponse(body: Awaited<ReturnType<typeof undiciFetch>>["body"]) {
  if (!body) throw new Error("Failed to read response body")
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    totalSize += chunk.value.length
    if (totalSize > WEB_FETCH_MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`Response too large: exceeded ${WEB_FETCH_MAX_RESPONSE_BYTES} bytes`)
    }
    chunks.push(chunk.value)
  }
  const buffer = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  return buffer
}

function decodeWebContent(bytes: Uint8Array, contentType: string) {
  const text = new TextDecoder("utf-8").decode(bytes)
  if (contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) return text
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(p|div|br|hr|h[1-6]|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number.parseInt(value, 10)))
    .replace(/\s+/g, " ")
    .trim()
}

export async function disposeProviderDispatcher(dispatcher: EnvHttpProxyAgent) {
  const close = Reflect.get(dispatcher, "close")
  if (typeof close === "function") {
    await Reflect.apply(close, dispatcher, [])
    return
  }
  const destroy = Reflect.get(dispatcher, "destroy")
  if (typeof destroy === "function") await Reflect.apply(destroy, dispatcher, [])
}

export async function destroyProviderDispatcher(dispatcher: EnvHttpProxyAgent) {
  const destroy = Reflect.get(dispatcher, "destroy")
  if (typeof destroy === "function") {
    await Reflect.apply(destroy, dispatcher, [])
    return
  }
  await disposeProviderDispatcher(dispatcher)
}

function toSessionSummary(record: SessionHistoryRecord, permission: SessionPermissionState): ClineSessionRecord {
  const title = typeof record.metadata?.title === "string" && record.metadata.title.trim()
    ? record.metadata.title.trim()
    : record.prompt?.trim().slice(0, 40) || "新会话"
  return {
    id: record.sessionId,
    title,
    projectRoot: record.workspaceRoot || record.cwd,
    status: record.status,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    providerId: typeof record.metadata?.creatxProviderId === "string" ? record.metadata.creatxProviderId : record.provider,
    modelId: typeof record.metadata?.creatxModelId === "string" ? record.metadata.creatxModelId : record.model,
    kind: permission.kind,
    permissionMode: permission.mode,
  }
}

function requireSessionPermissionMode(value: unknown): SessionPermissionMode {
  if (value === "approval" || value === "free") return value
  throw new Error(`compatibility: unknown session permission mode ${String(value)}`)
}

function requireSessionKind(value: unknown): SessionKind {
  if (value === "personal" || value === "project") return value
  throw new Error(`compatibility: unknown session kind ${String(value)}`)
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`session_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function requireModelConnection(connection: ClineModelConnection): ClineModelConnection {
  return {
    ...(connection.profileId ? { profileId: requireText(connection.profileId, "profileId") } : {}),
    providerId: requireText(connection.providerId, "providerId"),
    modelId: requireText(connection.modelId, "modelId"),
    ...(connection.apiKey ? { apiKey: requireText(connection.apiKey, "apiKey") } : {}),
    ...(connection.baseUrl ? { baseUrl: requireText(connection.baseUrl, "baseUrl") } : {}),
  }
}

function requireConfiguredDefaultConnection(connection: ClineModelConnection) {
  const configured = requireModelConnection(connection)
  if (!configured.apiKey) throw new Error("model_settings_persistence: selected global text model has no configured API key")
  return configured
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function resolveGrowthAbortSessions(ownerSessionId: string, workerSessionIds?: ReadonlySet<string>) {
  return [...new Set([ownerSessionId, ...(workerSessionIds ?? [])])]
}

export function projectClineTimeline(messages: MessageWithMetadata[]): TimelineItem[] {
  return projectPersistedTimeline(messages, false)
}

export function projectGrowthWorkerTimeline(messages: MessageWithMetadata[], activity: TimelineActivity): TimelineItem[] {
  const items = projectPersistedTimeline(messages, true)
  return items.map((item) => ({
    ...item,
    ...(activity.ownerActivationId ? { ownerActivationId: activity.ownerActivationId } : {}),
    ...(item.kind === "message" ? { presentation: "internal" as const } : {}),
    activity,
  }))
}

function projectPersistedTimeline(messages: MessageWithMetadata[], hideUserText: boolean): TimelineItem[] {
  const items: TimelineItem[] = []
  const tools = new Map<string, number>()
  const legacySegments = resolveLegacyGrowthSegments(messages)
  let sequence = 1
  let ownerActivationId: string | undefined
  messages.forEach((message, messageIndex) => {
    const rawText = messageText(message)
    if (isUserPromptMessage(message)) ownerActivationId = ownerActivationIdFromPrompt(rawMessageText(message))
    const legacySegment = legacySegments.get(messageIndex)
    const push = (item: TimelineItem) => items.push(projectLegacyGrowthItem({ ...item, ...(ownerActivationId ? { ownerActivationId } : {}) }, messageIndex, legacySegment))
    if (legacySegment && message.role === "user" && isLegacyGrowthProtocol(rawText)) return
    if (message.role === "user" && rawText.startsWith(`/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n`)) return
    if (message.role === "user" && rawText.startsWith(CREATX_INTERNAL_SKILL_SEQUENCE)) return
    if (typeof message.content === "string") {
      if (hideUserText && message.role === "user") return
      if (!rawText) return
      push({
        sequence: sequence++,
        itemId: persistedMessageItemId(message, messageIndex),
        kind: "message",
        presentation: message.role,
        state: "completed",
        text: rawText,
        attachments: [],
      })
      return
    }
    message.content.forEach((part, blockIndex) => {
      if (part.type === "text" && part.text) {
        if (hideUserText && message.role === "user") return
        push({
          sequence: sequence++,
          itemId: persistedMessageItemId(message, messageIndex, blockIndex),
          kind: "message",
          presentation: message.role,
          state: "completed",
          text: message.role === "user" ? formatDisplayUserInput(part.text) : part.text,
          attachments: message.role === "user" ? messageAttachmentProjections(message) : [],
        })
        return
      }
      if (part.type === "thinking") {
        push({ sequence: sequence++, itemId: persistedReasoningItemId(message, messageIndex, blockIndex), kind: "reasoning", presentation: "internal", state: "completed", text: part.thinking })
        return
      }
      if (part.type === "redacted_thinking") {
        push({ sequence: sequence++, itemId: persistedReasoningItemId(message, messageIndex, blockIndex), kind: "reasoning", presentation: "internal", state: "completed", text: "思考内容已由模型隐藏。" })
        return
      }
      if (part.type === "tool_use") {
        const item = projectLegacyGrowthItem(
          { sequence: sequence++, itemId: `tool:${part.id}`, kind: "tool", presentation: "assistant", state: "streaming", toolName: part.name, input: part.input, ...(ownerActivationId ? { ownerActivationId } : {}) },
          messageIndex,
          legacySegment,
        )
        tools.set(part.id, items.length)
        items.push(item)
        return
      }
      if (part.type === "tool_result") {
        const toolIndex = tools.get(part.tool_use_id)
        if (toolIndex === undefined) return
        const previous = items[toolIndex]!
        const output = typeof part.content === "string" ? part.content : part.content.flatMap((content) => content.type === "text" ? [content.text] : []).join("\n")
        const staleGrowthReport = part.is_error && isStaleGrowthReportFailure(previous.toolName, output)
        items[toolIndex] = {
          ...previous,
          state: staleGrowthReport ? "cancelled" : part.is_error ? "failed" : "completed",
          output: staleGrowthReport ? "目标状态已变化，迟到的阶段汇报已忽略。" : output,
          ...(part.is_error && !staleGrowthReport ? { error: output || "工具调用失败" } : {}),
        }
      }
    })
  })
  return items.sort((left, right) => left.sequence - right.sequence)
}

function persistedMessageItemId(message: MessageWithMetadata, messageIndex: number, blockIndex = 0) {
  const persistedId = message.id?.trim()
  if (persistedId) return blockIndex === 0 ? `message:${persistedId}` : `message:${persistedId}:${blockIndex}`
  return blockIndex === 0 ? `message-${messageIndex}` : `message-${messageIndex}-${blockIndex}`
}

function persistedReasoningItemId(message: MessageWithMetadata, messageIndex: number, blockIndex: number) {
  const persistedId = message.id?.trim()
  return persistedId ? `reasoning:${persistedId}:${blockIndex}` : `reasoning:${messageIndex}:${blockIndex}`
}

function ownerActivationIdFromPrompt(prompt: string) {
  const match = prompt.match(new RegExp(`<mode_notice>\\s*${CREATX_GROWTH_ACTIVATION_MARKER}:([^\\s<]+)`, "u"))
  return match?.[1]?.trim() || undefined
}

interface LegacyGrowthSegment {
  startMessageIndex: number
  finalAssistantMessageIndex?: number
  activity: TimelineActivity
}

function resolveLegacyGrowthSegments(messages: Message[]) {
  const result = new Map<number, LegacyGrowthSegment>()
  let active: LegacyGrowthSegment | undefined
  messages.forEach((message, messageIndex) => {
    if (isUserPromptMessage(message)) {
      active = isLegacyGrowthProtocol(messageText(message))
        ? {
            startMessageIndex: messageIndex,
            activity: {
              kind: "growth-worker",
              activityId: `legacy-growth:${messageIndex}`,
              workItemId: `legacy-stage:${messageIndex}`,
              title: "Growth 阶段",
            },
          }
        : undefined
    }
    if (!active) return
    result.set(messageIndex, active)
    if (message.role === "assistant" && messageText(message).trim()) active.finalAssistantMessageIndex = messageIndex
  })
  return result
}

function projectLegacyGrowthItem(item: TimelineItem, messageIndex: number, segment: LegacyGrowthSegment | undefined): TimelineItem {
  if (!segment) return item
  const projected = { ...item, itemId: `growth:legacy-${segment.startMessageIndex}:${item.itemId}` }
  if (messageIndex === segment.finalAssistantMessageIndex && item.kind === "message" && item.presentation === "assistant") return projected
  return {
    ...projected,
    ...(projected.kind === "message" ? { presentation: "internal" as const } : {}),
    activity: segment.activity,
  }
}

function isUserPromptMessage(message: Message) {
  if (message.role !== "user") return false
  if (typeof message.content === "string") return true
  return message.content.some((part) => part.type === "text")
}

function isLegacyGrowthProtocol(text: string) {
  return text.startsWith("/growth")
    && text.includes("Growth World Pro 专用目标：")
    && text.includes("阶段策略：这是 Growth World Pro 的全世界蓝图 Run")
}

export function projectClineMessages(messages: Message[]): MessageProjection[] {
  return projectClineTimeline(messages).flatMap((item) => item.kind === "message" && (item.presentation === "user" || item.presentation === "assistant")
    ? [{ id: item.itemId, role: item.presentation, text: item.text ?? "", attachments: item.attachments ?? [] }]
    : [])
}

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, transform: (value: T, index: number) => Promise<R>) {
  const results = new Array<R>(values.length)
  const cursor = { value: 0 }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor.value < values.length) {
      const index = cursor.value++
      results[index] = await transform(values[index]!, index)
    }
  }))
  return results
}

type PersistedMessageAttachment =
  | { kind: "file"; path: string }
  | { kind: "image"; data: string; mediaType: "image/png" | "image/jpeg" }

function messageAttachments(message: Message): PersistedMessageAttachment[] {
  if (typeof message.content === "string") return []
  const attachments: PersistedMessageAttachment[] = []
  message.content.forEach((part) => {
    if (part.type === "file" && typeof part.path === "string") attachments.push({ kind: "file", path: part.path })
    if (part.type === "image" && typeof part.data === "string" && (part.mediaType === "image/png" || part.mediaType === "image/jpeg")) {
      attachments.push({ kind: "image", data: part.data, mediaType: part.mediaType })
    }
  })
  return attachments
}

function messageAttachmentPaths(message: Message) {
  return messageAttachments(message).flatMap((attachment) => attachment.kind === "file" ? [attachment.path] : [])
}

function messageAttachmentProjections(message: Message) {
  let imageIndex = 0
  return messageAttachments(message).map((attachment) => {
    if (attachment.kind === "file") return { name: basename(attachment.path), displayPath: normalize(attachment.path), kind: "file" as const }
    const index = imageIndex++
    const extension = attachment.mediaType === "image/png" ? "png" : "jpg"
    return { name: `图片 ${index + 1}.${extension}`, displayPath: `image:${index}`, kind: "image" as const, mediaType: attachment.mediaType }
  })
}

function resolveMessageByItemId(messages: MessageWithMetadata[], itemId: string) {
  return messages.find((message, messageIndex) => {
    if (typeof message.content === "string") return persistedMessageItemId(message, messageIndex) === itemId
    return message.content.some((_part, blockIndex) => persistedMessageItemId(message, messageIndex, blockIndex) === itemId)
  })
}

function messageText(message: Message) {
  const content = rawMessageText(message)
  return message.role === "user" ? formatDisplayUserInput(content) : content
}

function rawMessageText(message: Message) {
  return typeof message.content === "string" ? message.content : message.content.flatMap((part) => {
    if (part.type === "text") return [part.text]
    if (part.type === "tool_result") return part.is_error ? [`工具失败：${typeof part.content === "string" ? part.content : "未知错误"}`] : []
    return []
  }).join("\n")
}

function creatXSystemPrompt(projectRoot: string, systemGuidance: readonly string[]) {
  return `You are Tbird, the creative coding agent inside CreatX.
Work with the user on creative projects using the files in the current project directory.
The exact current project root is: ${projectRoot}
For file tools, use paths relative to this project root unless an absolute path is explicitly required.
Use Cline's native tools when the task requires reading or changing files.
Never claim a file was changed until the tool result confirms it.
The current project root is context, not a security sandbox. Tool execution follows the current session permission mode; free mode may automatically approve enabled tools that can access the whole machine.
Use the user's current language for every user-visible output, including reasoning, progress narration, tool explanations, error explanations, and final responses. When the user writes in Chinese, use Simplified Chinese for all of them. Preserve code, paths, proper nouns, and quoted source text as needed. Change languages only when the user explicitly asks. Keep progress concrete.${systemGuidance.length ? `\n\n${systemGuidance.join("\n\n")}` : ""}`
}
