import { createHash } from "node:crypto"
import { posix } from "node:path"
import {
  isSilentImageAttachmentConflict,
  type CreatXError,
  type CreatXToolContribution,
  type GrowthGoalProjection,
  type GrowthIssueImpact,
  type GrowthIssueProjection,
  type GrowthProgressReport,
  type GrowthProgressProjection,
  type GrowthProgressResult,
  type GrowthStageRunCommand,
  type GrowthStageRunResult,
  type GrowthWorkerProfile,
} from "@creatx/contracts"
import type { ProjectFileQueryPort, ProjectInternalStatePort } from "@creatx/project-files"
import {
  parseJson,
  validateWorldBlueprintDocuments,
  WORLD_BLUEPRINT_LAYERS,
  type WorldBlueprintCausalRelation,
  type WorldBlueprintIndexDocument,
  type WorldBlueprintLayer,
  type WorldBlueprintLayerDocument,
  type WorldBlueprintObject,
  type WorldBlueprintRelationsDocument,
  type WorldBlueprintStateDocument,
} from "./schema.ts"
import type { WorldMaterializationResearchPacket } from "./materialization-research.ts"
import {
  projectMaterializationTerminal,
  type MaterializationObjectOutcome,
  type MaterializationTerminalDisposition,
} from "./materialization-terminal.ts"
import { planMaterializationIssueReconciliation } from "./materialization-issue-reconciliation.ts"
import { hashWritingContract, requireWritingContractSnapshot, resolveWritingContract, type WorldWritingContract } from "./writing-contract.ts"
import {
  blueprintIndexKey,
  blueprintLayerKey,
  blueprintReconciliationKey,
  blueprintRelationsKey,
  blueprintStateKey,
  GROWTH_INTERNAL_NAMESPACE,
  materializationBriefKey,
  materializationExtractionKey,
  materializationReceiptKey,
  materializationRelationsKey,
  materializationStateKey,
  migrationManifestKey,
} from "./internal-state.ts"
import { migrateLegacyWorldState, migrateWorldMaterializationV3ToV4 } from "./migration.ts"
import type { WorldReconciliationManifest } from "./reconciliation.ts"
import { requirePerformanceFirstBrief, validatePostWriteExtraction, validatePublicWorldBody, type PerformanceFirstBrief, type PostWriteExtraction } from "./performance-first.ts"

const decoder = new TextDecoder()
const MATERIALIZATION_SCHEMA_VERSION = 4
const MAX_PARALLEL_WORKERS = 3
const MAX_PARALLEL_FILE_READS = 4
const MAX_OBJECT_ATTEMPTS = 3

const researchActionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "purpose", "materialPaths", "lockedFacts", "genreSuggestions"],
  properties: {
    action: { const: "submit_research" },
    purpose: { type: "string", minLength: 1, maxLength: 2000 },
    materialPaths: { type: "array", maxItems: 12, uniqueItems: true, items: { type: "string", minLength: 1 } },
    lockedFacts: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "text", "sourcePaths"], properties: { id: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1 }, sourcePaths: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1 } } } } },
    genreSuggestions: { type: "object", additionalProperties: false, required: ["primary", "alternatives", "techniques", "avoid"], properties: { primary: { type: "string", minLength: 1 }, alternatives: { type: "array", maxItems: 8, items: { type: "string", minLength: 1 } }, techniques: { type: "array", maxItems: 12, items: { type: "string", minLength: 1 } }, avoid: { type: "array", maxItems: 12, items: { type: "string", minLength: 1 } } } },
  },
} satisfies Record<string, unknown>

const completionActionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "imageTaskId", "summary", "extraction"],
  properties: {
    action: { const: "complete_object" },
    imageTaskId: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    extraction: {
      type: "object",
      additionalProperties: false,
      required: ["facts", "relations", "contradictions", "lockedFactConflicts"],
      properties: {
        facts: { type: "array", maxItems: 80, items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1 } } } },
        relations: { type: "array", maxItems: 120, items: { type: "object", additionalProperties: false, required: ["fromFactId", "toFactId", "type", "reason"], properties: { fromFactId: { type: "string", minLength: 1 }, toFactId: { type: "string", minLength: 1 }, type: { type: "string", enum: ["supports", "causes", "located-in", "belongs-to", "related-to"] }, reason: { type: "string", minLength: 1 } } } },
        contradictions: { type: "array", maxItems: 20, items: { type: "string" } },
        lockedFactConflicts: { type: "array", maxItems: 20, items: { type: "string" } },
      },
    },
  },
} satisfies Record<string, unknown>

export type WorldMaterializationPhase = "research" | "writing" | "recovery"
export type WorldMaterializationObjectStatus = "pending" | "researching" | "ready" | "writing" | "completed" | "retryable" | "blocked" | "unknown"
export type WorldMaterializationResolutionAction = "retry" | "repair" | "accept"

export interface WorldMaterializationObjectState {
  objectId: string
  layer: WorldBlueprintLayer
  plannedPath: string
  status: WorldMaterializationObjectStatus
  writingContract: WorldWritingContract
  writingContractHash: string
  attempts: Record<WorldMaterializationPhase, number>
  lastAcceptedAttemptId?: string
  attempt?: {
    attemptId: string
    phase: WorldMaterializationPhase
    number: number
    startedAt: number
  }
  lastError?: {
    phase: WorldMaterializationPhase
    message: string
  }
  block?: {
    kind: "critical-gap" | "attempt-limit"
    reason: string
  }
  recoveryBodySha256?: string
}

export interface WorldMaterializationStateDocument {
  schemaVersion: 4
  root: string
  goalId: string
  objects: WorldMaterializationObjectState[]
}

export interface WorldMaterializationReceipt {
  schemaVersion: 4
  goalId: string
  goalVersion: number
  objectId: string
  attemptId: string
  phase: "writing" | "recovery"
  writingContractHash: string
  bodySha256: string
  artifactPath: string
  sourcePaths: string[]
  imageTaskId: string
  summary: string
  extractionSha256: string
}

export interface WorldMaterializationImageEvidence {
  status: "queued" | "generating" | "succeeded" | "failed" | "interrupted" | "cancelled"
  relativePath: string
  visualStyleApplied?: boolean
  errorCode?: string
  errorMessage?: string
  attachment?: {
    documentPath: string
    status: "pending" | "succeeded" | "failed"
    errorCode?: string
    errorMessage?: string
  }
}

export interface WorldMaterializationRecoveryImageEvidence extends WorldMaterializationImageEvidence {
  imageTaskId: string
}

export interface WorldMaterializationGoalImageEvidence extends WorldMaterializationImageEvidence {
  imageTaskId: string
  growthWorkItemId?: string
  growthAttemptId?: string
}

export interface WorldMaterializationAttachmentBinding {
  projectId: string
  imageTaskId: string
  documentPath: string
  alt: string
  placement: "after_heading"
  anchor: string
}

export interface WorldMaterializationGoalIdentity {
  projectId: string
  version: number
  status: string
  workRootPath?: string
}

export interface WorldMaterializationBatchRunner {
  runGrowthStageBatch(commands: GrowthStageRunCommand[]): Promise<GrowthStageRunResult[]>
  findCompletedGrowthStage?(input: { sessionId: string; goalId: string; attemptId: string }): Promise<GrowthStageRunResult | undefined>
}

export interface WorldMaterializationProgressPort {
  hasReport(goalId: string, reportId: string): boolean
  commit(
    report: GrowthProgressReport,
    context: { projectId: string; goalId: string; version: number },
    options?: { completionAuthority?: "world-materialization-final" },
  ): Promise<GrowthProgressResult>
}

export interface WorldMaterializationGoalPort {
  get(goalId: string): GrowthGoalProjection | undefined
  latestSteer?(goalId: string): string | undefined
}

export interface WorldMaterializationIssuePort {
  recordIssue(command: {
    issueId: string
    dedupeKey: string
    goalId: string
    workItemId?: string
    errorCode: string
    impact: GrowthIssueImpact
    summary: string
    detail?: string
    affectedObjectIds: string[]
  }): GrowthIssueProjection
  transitionIssue(command: {
    issueId: string
    expectedVersion: number
    status: "repairing" | "resolved" | "bypassed" | "needs_help"
    summary?: string
    detail?: string
    impact?: GrowthIssueImpact
    affectedObjectIds?: string[]
    attemptCount?: number
  }): GrowthIssueProjection
  listIssues(goalId: string): GrowthIssueProjection[]
  getIssueByDedupe(goalId: string, dedupeKey: string): GrowthIssueProjection | undefined
  blockForIssue(command: {
    goalId: string
    expectedGoalVersion: number
    issueId: string
    expectedIssueVersion: number
    reason: string
    affectedObjectIds?: string[]
  }): { goal: GrowthGoalProjection; issue: GrowthIssueProjection }
}

interface WorldMaterializationSourceCandidates {
  allowed: ReadonlySet<string>
  earlierBodyPaths: string[]
  directPredecessors: Array<{ path: string; reason: string }>
  mappedSourcePaths: string[]
  existingDraftPath?: string
  extractedFacts: Array<{ sourcePath: string; facts: Array<{ text: string; sourceLevel: "source" | "derived" | "created" }> }>
}

export class WorldMaterializationService {
  private readonly projectFiles: ProjectFileQueryPort
  private readonly internalState: ProjectInternalStatePort
  private readonly imageEvidence: (projectId: string, imageTaskId: string) => Promise<WorldMaterializationImageEvidence | undefined>
  private readonly goalIdentity: (goalId: string) => WorldMaterializationGoalIdentity | undefined
  private readonly recoveryImageEvidence: ((projectId: string, idempotencyKey: string) => Promise<WorldMaterializationRecoveryImageEvidence | undefined>) | undefined
  private readonly goalImageEvidence: ((projectId: string, goalId: string) => Promise<WorldMaterializationGoalImageEvidence[]>) | undefined
  private readonly terminalIssueEvidence: ((goalId: string) => readonly Pick<GrowthIssueProjection, "status" | "affectedObjectIds">[]) | undefined
  private readonly onProgressChanged: ((goalId: string) => void | Promise<void>) | undefined
  private readonly bindImageAttachment: ((binding: WorldMaterializationAttachmentBinding) => Promise<unknown>) | undefined
  private readonly queues = new Map<string, Promise<void>>()

  constructor(
    projectFiles: ProjectFileQueryPort,
    internalState: ProjectInternalStatePort,
    imageEvidence: (projectId: string, imageTaskId: string) => Promise<WorldMaterializationImageEvidence | undefined>,
    goalIdentity: (goalId: string) => WorldMaterializationGoalIdentity | undefined,
    recoveryImageEvidence?: (projectId: string, idempotencyKey: string) => Promise<WorldMaterializationRecoveryImageEvidence | undefined>,
    onProgressChanged?: (goalId: string) => void | Promise<void>,
    bindImageAttachment?: (binding: WorldMaterializationAttachmentBinding) => Promise<unknown>,
    goalImageEvidence?: (projectId: string, goalId: string) => Promise<WorldMaterializationGoalImageEvidence[]>,
    terminalIssueEvidence?: (goalId: string) => readonly Pick<GrowthIssueProjection, "status" | "affectedObjectIds">[],
  ) {
    this.projectFiles = projectFiles
    this.internalState = internalState
    this.imageEvidence = imageEvidence
    this.goalIdentity = goalIdentity
    this.recoveryImageEvidence = recoveryImageEvidence
    this.onProgressChanged = onProgressChanged
    this.bindImageAttachment = bindImageAttachment
    this.goalImageEvidence = goalImageEvidence
    this.terminalIssueEvidence = terminalIssueEvidence
  }

  async progress(projectId: string, goalId: string, terminalDispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>): Promise<GrowthProgressProjection | undefined> {
    const state = await this.readInternalJsonIfExists<WorldMaterializationStateDocument>(projectId, materializationStateKey(goalId))
    if (!state) return undefined
    const dispositions = this.resolveTerminalDispositions(goalId, terminalDispositions)
    const deferredObjectIds = deferredMaterializationObjectIds(state, dispositions.keys())
    const terminal = await this.terminalEvidence(projectId, state, dispositions)
    const incompleteLayer = WORLD_BLUEPRINT_LAYERS.find((layer) => state.objects.some((object) => object.layer === layer && object.status !== "completed" && !deferredObjectIds.has(object.objectId)))
    const publicStatus = (object: WorldMaterializationObjectState): GrowthProgressProjection["currentObjects"][number]["status"] | undefined => {
      if (object.status === "researching" || object.status === "writing") return "active"
      if (object.status === "retryable") return "retryable"
      if (object.status === "blocked") return "blocked"
      if (object.status === "unknown") return "unknown"
      return undefined
    }
    const currentObjects = state.objects.flatMap((object) => {
      if (deferredObjectIds.has(object.objectId)) return []
      const status = publicStatus(object)
      if (!status || incompleteLayer && object.layer !== incompleteLayer) return []
      return [{ title: object.writingContract.object.title, layer: object.layer, status }]
    }).slice(0, 6)
    const blocked = state.objects.filter((object) => object.status === "blocked" && !deferredObjectIds.has(object.objectId))
    const retryable = state.objects.filter((object) => object.status === "retryable")
    return {
      ...(incompleteLayer ? { phase: incompleteLayer } : {}),
      total: state.objects.length,
      completed: terminal.trustedCompleted,
      active: state.objects.filter((object) => object.status === "researching" || object.status === "writing").length,
      retryable: retryable.length,
      blocked: blocked.length,
      unknown: state.objects.filter((object) => object.status === "unknown").length,
      currentObjects,
      ...(blocked.some((object) => object.block?.kind === "critical-gap")
        ? { errorCategory: "critical-gap" as const }
        : blocked.some((object) => object.block?.kind === "attempt-limit")
          ? { errorCategory: "attempt-limit" as const }
          : retryable.length
            ? { errorCategory: "worker-failure" as const }
            : state.objects.some((object) => object.status === "unknown")
              ? { errorCategory: "unknown-result" as const }
              : {}),
    }
  }

  tool(): CreatXToolContribution {
    return {
      name: "complete_world_materialization_object",
      audiences: ["world-research", "world-writer", "world-recovery"],
      description: "Prepare or complete one Growth World Pro V4 materialization object. Research submits a short performance-first brief; Writer creates the body, then extracts actual facts and relations. Every submission is bound to one trusted object attempt.",
      inputSchema: { type: "object", oneOf: [researchActionSchema, completionActionSchema] },
      inputSchemaForWorkerProfile: materializationInputSchema,
      scope: "project",
      approval: "automatic",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: materializationError("project_invalid: project identity is required") }
        if (!context.growthGoalId || context.growthGoalVersion === undefined || !context.growthAttemptId || !context.growthWorkItemId || !context.growthWorkRootPath) {
          return { ok: false, error: materializationError("growth_invalid: trusted materialization identity is required") }
        }
        try {
          const action = requireMaterializationAction(input)
          const identity = {
            projectId: context.projectId!,
            goalId: context.growthGoalId!,
            goalVersion: context.growthGoalVersion!,
            attemptId: context.growthAttemptId!,
            root: context.growthWorkRootPath!,
            objectId: context.growthWorkItemId!,
          }
          const value = await this.serialize<unknown>(`${context.projectId}\0${context.growthWorkRootPath}`, async () => {
            await this.requireAttemptAction(identity, action.action)
            return action.action === "submit_research"
              ? this.submitResearch({ ...identity, research: { schemaVersion: 4, objectId: identity.objectId, ...action.research } })
              : this.completeObject({ ...identity, imageTaskId: action.imageTaskId, summary: action.summary, extraction: action.extraction })
          })
          return { ok: true, value }
        } catch (error) {
          return { ok: false, error: materializationError(error) }
        }
      },
    }
  }

  async prepare(projectId: string, goalId: string, root: string) {
    return this.serialize(`${projectId}\0${root}`, async () => {
      const [blueprintState, migration] = await Promise.all([
        this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, blueprintStateKey(goalId)),
        this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, migrationManifestKey(goalId)),
      ])
      if (!blueprintState || migration) await migrateLegacyWorldState({ projectFiles: this.projectFiles, internalState: this.internalState, projectId, goalId, root })
      const blueprint = await this.requireFrozenBlueprint(projectId, goalId, root)
      const stateKey = materializationStateKey(goalId)
      const stateRecord = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, stateKey)
      const persisted = stateRecord ? parseJson<{ schemaVersion: 3 | 4; root: string; goalId: string; objects: WorldMaterializationObjectState[] }>(decoder.decode(stateRecord.bytes)) : undefined
      const existing: WorldMaterializationStateDocument | undefined = !persisted
        ? undefined
        : persisted.schemaVersion === 3
          ? migrateWorldMaterializationV3ToV4(persisted)
          : { ...persisted, schemaVersion: 4 }
      if (persisted?.schemaVersion === 3 && existing && stateRecord) await this.writeInternalJson(projectId, stateKey, existing, stateRecord.modifiedAt)
      if (existing) {
        if (existing.schemaVersion !== MATERIALIZATION_SCHEMA_VERSION) throw new Error("growth_conflict: unsupported materialization state cannot be resumed as V4")
        if (existing.root !== root || existing.goalId !== goalId) {
          throw new Error("growth_conflict: materialization state belongs to another Goal or work root")
        }
        const blueprintEntries = new Map(blueprint.layers.flatMap((layer) => layer.objects.filter(isEntry).map((object) => [object.id, object] as const)))
        const invalidContract = existing.objects.find((object) => !materializationContractMatchesBlueprint(object, blueprintEntries.get(object.objectId), blueprint.state))
        if (invalidContract || existing.objects.length !== blueprintEntries.size) {
          throw new Error("growth_conflict: frozen blueprint no longer matches materialization state")
        }
        return this.reconcile(projectId, existing)
      }
      const objects = blueprint.layers.flatMap((layer) => layer.objects.filter(isEntry).map((object) => {
        const writingContract = resolveWritingContract({ topicProfileKey: blueprint.state.topicProfileKey, worldStyleProfile: blueprint.state.worldStyleProfile, object })
        return {
          objectId: object.id,
          layer: object.layer,
          plannedPath: object.plannedPath,
          status: "pending" as const,
          writingContract,
          writingContractHash: hashWritingContract(writingContract),
          attempts: { research: 0, writing: 0, recovery: 0 },
        }
      }))
      const state: WorldMaterializationStateDocument = { schemaVersion: 4, root, goalId, objects }
      await this.writeInternalJson(projectId, materializationStateKey(goalId), state, null)
      await this.writeInternalJson(projectId, materializationRelationsKey(goalId), buildRelationIndex(root, blueprint.layers, blueprint.relations.relations, []), null)
      return state
    })
  }

  async currentLayer(projectId: string, goalId: string, root: string, deferredObjectIds: ReadonlySet<string> = new Set()) {
    const state = await this.prepare(projectId, goalId, root)
    const deferred = deferredMaterializationObjectIds(state, deferredObjectIds)
    return WORLD_BLUEPRINT_LAYERS.find((layer) => state.objects.some((object) => object.layer === layer && object.status !== "completed" && !deferred.has(object.objectId)))
  }

  async completedLayers(projectId: string, goalId: string, root: string, deferredObjectIds: ReadonlySet<string> = new Set()) {
    const stateRecord = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, materializationStateKey(goalId))
    const state = stateRecord ? await this.requireState(projectId, root, goalId) : await this.prepare(projectId, goalId, root)
    const deferred = deferredMaterializationObjectIds(state, deferredObjectIds)
    return {
      layers: WORLD_BLUEPRINT_LAYERS.filter((layer) => {
        const objects = state.objects.filter((object) => object.layer === layer)
        return objects.length > 0 && objects.every((object) => object.status === "completed" || deferred.has(object.objectId))
      }),
      complete: state.objects.every((object) => object.status === "completed" || deferred.has(object.objectId)),
    }
  }

  async dispatchBatch(input: {
    projectId: string
    sessionId: string
    goalId: string
    expectedVersion: number
    root: string
    latestSteer?: string
    deferredObjectIds?: ReadonlySet<string>
  }) {
    await this.prepare(input.projectId, input.goalId, input.root)
    return this.serialize(`${input.projectId}\0${input.root}`, async () => {
      const blueprint = await this.requireFrozenBlueprint(input.projectId, input.goalId, input.root)
      const state = await this.reconcile(input.projectId, await this.requireState(input.projectId, input.root, input.goalId), { recoverInFlight: true })
      const deferredObjectIds = deferredMaterializationObjectIds(state, input.deferredObjectIds ?? new Set<string>())
      const layer = WORLD_BLUEPRINT_LAYERS.find((candidate) => state.objects.some((object) => object.layer === candidate && object.status !== "completed" && !deferredObjectIds.has(object.objectId)))
      if (!layer) return { layer: undefined, commands: [] }
      const earlierIncomplete = WORLD_BLUEPRINT_LAYERS.slice(0, WORLD_BLUEPRINT_LAYERS.indexOf(layer)).some((candidate) => state.objects.some((object) => object.layer === candidate && object.status !== "completed" && !deferredObjectIds.has(object.objectId)))
      if (earlierIncomplete) throw new Error("growth_conflict: a later materialization layer cannot start before all earlier layers complete")
      const entries = blueprint.layers[WORLD_BLUEPRINT_LAYERS.indexOf(layer)]!.objects
        .filter(isEntry)
        .filter((entry) => !deferredObjectIds.has(entry.id))
        .sort((left, right) => left.order - right.order)
      const recovering = entries.filter((entry) => isDispatchable(state.objects.find((object) => object.objectId === entry.id), "recovery")).slice(0, MAX_PARALLEL_WORKERS)
      const writing = entries.filter((entry) => isDispatchable(state.objects.find((object) => object.objectId === entry.id), "writing")).slice(0, MAX_PARALLEL_WORKERS)
      const phase = recovering.length ? "recovery" as const : writing.length ? "writing" as const : "research" as const
      const selected = recovering.length
        ? recovering
        : writing.length
          ? writing
          : entries.filter((entry) => isDispatchable(state.objects.find((object) => object.objectId === entry.id), "research")).slice(0, MAX_PARALLEL_WORKERS)
      if (!selected.length) return { layer, phase, commands: [] }
      const selectedIds = new Set(selected.map((entry) => entry.id))
      const recoveryHashes = new Map(phase === "recovery"
        ? await Promise.all(selected.map(async (entry) => [entry.id, sha256(await this.projectFiles.readBytes(input.projectId, entry.plannedPath))] as const))
        : [])
      const startedAt = Date.now()
      const next = {
        ...state,
        objects: state.objects.map((object) => {
          if (!selectedIds.has(object.objectId)) return object
          const number = object.attempts[phase] + 1
          const attemptId = materializationAttemptId(input.goalId, input.expectedVersion, object.objectId, phase, number)
          const base = {
            ...object,
            status: phase === "research" ? "researching" as const : phase === "writing" ? "writing" as const : "unknown" as const,
            attempts: { ...object.attempts, [phase]: number },
            attempt: { attemptId, phase, number, startedAt },
          }
          return phase === "recovery" ? { ...base, recoveryBodySha256: recoveryHashes.get(object.objectId)! } : base
        }),
      }
      await this.writeInternalJson(input.projectId, materializationStateKey(input.goalId), next)
      const receipts = await this.receipts(input.projectId, next)
      const extractions = (await mapWithConcurrency(receipts, MAX_PARALLEL_FILE_READS, async (receipt) => ({ receipt, extraction: await this.readInternalJsonIfExists<PostWriteExtraction>(input.projectId, materializationExtractionKey(input.goalId, receipt.objectId)) }))).filter((value): value is { receipt: WorldMaterializationReceipt; extraction: PostWriteExtraction } => Boolean(value.extraction))
      const declaredSources = await this.declaredProjectSources(input.projectId, input.root)
      const reconciliationSources = await this.reconciliationSources(input.projectId, input.goalId, input.root)
      await Promise.all(selected.flatMap((entry) => reconciliationSources.get(entry.id) ?? []).map((path) => this.projectFiles.readBytes(input.projectId, path)))
      const materializationByObjectId = new Map(next.objects.map((object) => [object.objectId, object]))
      const existingDrafts = new Set(phase === "research"
        ? (await Promise.all(selected.map(async (entry) => [entry.id, await this.exists(input.projectId, entry.plannedPath)] as const))).filter(([, exists]) => exists).map(([objectId]) => objectId)
        : [])
      const sourceCandidatesByObject = new Map(selected.map((entry) => [entry.id, materializationSourceCandidates(input.root, entry, blueprint.layers, blueprint.relations.relations, receipts, declaredSources, reconciliationSources.get(entry.id) ?? [], existingDrafts.has(entry.id) ? entry.plannedPath : undefined, extractions)]))
      const existingImages = new Map(phase !== "research"
        ? await Promise.all(selected.map(async (entry) => {
            const image = await this.recoveryImageEvidence?.(input.projectId, imageIdempotencyKey(entry.id))
            if (image && normalizePath(image.relativePath) !== imagePath(entry.plannedPath)) {
              throw new Error(`growth_conflict: existing image task must target ${imagePath(entry.plannedPath)}`)
            }
            return [entry.id, image] as const
          }))
        : [])
      return {
        layer,
        phase,
        commands: await Promise.all(selected.map(async (entry) => ({
          goalId: input.goalId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          expectedVersion: input.expectedVersion,
          stageKey: "free-materialization",
          attemptId: materializationByObjectId.get(entry.id)!.attempt!.attemptId,
          workItemId: entry.id,
          workItemTitle: entry.title,
          workRootPath: input.root,
          maxIterations: 18,
          workerProfile: phase === "research" ? "world-research" : phase === "recovery" ? "world-recovery" : "world-writer",
          ...(phase === "recovery" ? { directFileMutation: "disabled" as const } : {}),
          prompt: phase === "research"
            ? researchPrompt(input.root, entry, sourceCandidatesByObject.get(entry.id)!, blueprint.state.route, materializationByObjectId.get(entry.id)!.writingContract, input.latestSteer, materializationByObjectId.get(entry.id)!.lastError?.message)
            : phase === "recovery"
              ? recoveryPrompt(input.root, entry, await this.requireResearchPacket(input.projectId, input.goalId, input.root, entry, materializationByObjectId.get(entry.id)!, sourceCandidatesByObject.get(entry.id)!.allowed, blueprint.state.route), existingImages.get(entry.id))
              : buildWorldMaterializationWritingPrompt(input.root, entry, await this.requireResearchPacket(input.projectId, input.goalId, input.root, entry, materializationByObjectId.get(entry.id)!, sourceCandidatesByObject.get(entry.id)!.allowed, blueprint.state.route), materializationByObjectId.get(entry.id)!.writingContract, writingCompletionInstruction(entry, existingImages.get(entry.id)), blueprint.state.route, materializationByObjectId.get(entry.id)!.lastError?.message),
        } satisfies GrowthStageRunCommand))),
      }
    })
  }

  async settleBatch(projectId: string, goalId: string, root: string, objectIds: readonly string[], results: readonly GrowthStageRunResult[] = objectIds.map(() => ({ state: "completed" as const }))) {
    return this.serialize(`${projectId}\0${root}`, async () => {
      if (results.length !== objectIds.length) throw new Error("growth_invalid: Worker result count does not match the dispatched object count")
      const state = await this.reconcile(projectId, await this.requireState(projectId, root, goalId))
      const resultByObjectId = new Map(objectIds.map((objectId, index) => [objectId, results[index]!] as const))
      const bodies = new Set((await Promise.all(state.objects.filter((object) => resultByObjectId.has(object.objectId)).map(async (object) => [object.objectId, await this.exists(projectId, object.plannedPath)] as const))).filter(([, exists]) => exists).map(([objectId]) => objectId))
      const objects = state.objects.map((object) => {
        const result = resultByObjectId.get(object.objectId)
        if (!result || !object.attempt || !["researching", "writing", "unknown", "retryable"].includes(object.status)) return object
        if (object.status === "unknown" && object.attempt.phase === "writing") return object
        if (object.status === "writing" && bodies.has(object.objectId) && result.state === "completed" && !result.failure && !result.reason) {
          return withoutAttempt({ ...object, status: "unknown" as const })
        }
        const message = result.failure?.detail?.trim() || result.failure?.message.trim() || result.reason?.trim() || `Worker ended as ${result.state} without durable ${object.attempt.phase} evidence`
        if (object.attempt.number >= MAX_OBJECT_ATTEMPTS) {
          return withoutAttempt({ ...object, status: "blocked" as const, lastError: { phase: object.attempt.phase, message }, block: { kind: "attempt-limit" as const, reason: message } })
        }
        return withoutAttempt({ ...object, status: "retryable" as const, lastError: { phase: object.attempt.phase, message } })
      })
      const next = { ...state, objects }
      if (canonicalJson(next) !== canonicalJson(state)) await this.writeInternalJson(projectId, materializationStateKey(goalId), next)
      return next
    })
  }

  async layerReport(projectId: string, goalId: string, root: string, layer: WorldBlueprintLayer, terminalDispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>): Promise<GrowthProgressReport> {
    const state = await this.requireState(projectId, root, goalId)
    const dispositions = this.resolveTerminalDispositions(goalId, terminalDispositions)
    const deferredObjectIds = deferredMaterializationObjectIds(state, dispositions.keys())
    const layerObjects = state.objects.filter((object) => object.layer === layer)
    const terminal = await this.terminalEvidence(projectId, state, dispositions)
    const outcomes = new Map(terminal.outcomes.map((outcome) => [outcome.objectId, outcome]))
    const layerIsPartial = layerObjects.some((object) => !isTrustedMaterializationOutcome(outcomes.get(object.objectId)))
    const incomplete = layerObjects.find((object) => !isTrustedMaterializationOutcome(outcomes.get(object.objectId)) && !deferredObjectIds.has(object.objectId))
    if (incomplete) throw new Error(`growth_conflict: ${layer} is incomplete at ${incomplete.plannedPath} (${incomplete.status})`)
    const receipts = await this.receipts(projectId, { ...state, objects: layerObjects })
    const isLast = layer === WORLD_BLUEPRINT_LAYERS.at(-1)
    return {
      reportId: layerReportId(layer),
      outcome: "continue",
      summary: layerIsPartial
        ? isLast ? "十二层物化调度已经完成，仍有局部对象保留为待返工；接下来生成最终汇报。" : `${layer}调度已经完成，局部待返工对象已保留。`
        : isLast ? "十二层世界正文已经全部物化；接下来生成最终汇报。" : `${layer}正文已经全部物化。`,
      nextStep: isLast ? "汇总正文和图片任务状态，向用户报告结果。" : `继续物化${WORLD_BLUEPRINT_LAYERS[WORLD_BLUEPRINT_LAYERS.indexOf(layer) + 1]}。`,
      artifactPaths: receipts.map((receipt) => receipt.artifactPath),
      imageTaskIds: receipts.map((receipt) => receipt.imageTaskId),
      requiredImageTaskIds: [],
    }
  }

  async finalSummaryEvidence(projectId: string, goalId: string, root: string, terminalDispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>) {
    const state = await this.requireState(projectId, root, goalId)
    const dispositions = this.resolveTerminalDispositions(goalId, terminalDispositions)
    const receipts = await this.receipts(projectId, state)
    const terminal = await this.terminalEvidence(projectId, state, dispositions, receipts)
    const images = await mapWithConcurrency(receipts, MAX_PARALLEL_FILE_READS, async (receipt) => ({
      imageTaskId: receipt.imageTaskId,
      artifactPath: receipt.artifactPath,
      evidence: await this.imageEvidence(projectId, receipt.imageTaskId),
    }))
    const receiptedImageTaskIds = new Set(receipts.map((receipt) => receipt.imageTaskId))
    const objectPaths = new Map(state.objects.map((object) => [object.objectId, object.plannedPath]))
    const unboundImages = (await this.goalImageEvidence?.(projectId, goalId) ?? [])
      .filter((image) => !receiptedImageTaskIds.has(image.imageTaskId))
      .map((image) => ({
        ...image,
        artifactPath: image.growthWorkItemId ? objectPaths.get(image.growthWorkItemId) ?? "" : "",
        bindingStatus: "unbound-to-receipt" as const,
      }))
    return {
      totalObjects: state.objects.length,
      completedObjects: terminal.trustedCompleted,
      deferredObjects: terminal.outcomes.filter((outcome) => !isTrustedMaterializationOutcome(outcome)).map((outcome) => ({ title: outcome.title, path: outcome.path, reason: outcome.status })),
      terminal,
      artifactPaths: receipts.map((receipt) => receipt.artifactPath),
      images: [...images.map((image) => image.evidence
        ? { imageTaskId: image.imageTaskId, artifactPath: image.artifactPath, ...image.evidence }
        : { imageTaskId: image.imageTaskId, artifactPath: image.artifactPath, status: "unknown" as const, relativePath: imagePath(image.artifactPath), errorCode: "image_task_missing", errorMessage: "图片任务记录不存在或不属于当前项目" }), ...unboundImages],
    }
  }

  async finalSummary(projectId: string, goalId: string, root: string, terminalDispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>) {
    const evidence = await this.finalSummaryEvidence(projectId, goalId, root, terminalDispositions)
    return { evidence, summary: finalSummaryEvidence(root, evidence) }
  }

  async materializationTerminalEvidence(projectId: string, goalId: string, root: string, terminalDispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>) {
    const state = await this.requireState(projectId, root, goalId)
    return this.terminalEvidence(projectId, state, this.resolveTerminalDispositions(goalId, terminalDispositions))
  }

  private async terminalEvidence(
    projectId: string,
    state: WorldMaterializationStateDocument,
    dispositions: ReadonlyMap<string, MaterializationTerminalDisposition>,
    receipts?: readonly WorldMaterializationReceipt[],
  ) {
    const project = await this.projectFiles.refreshProject(projectId)
    const deferredObjectIds = deferredMaterializationObjectIds(state, dispositions.keys())
    return projectMaterializationTerminal({
      state,
      receipts: receipts ?? await this.receipts(projectId, state),
      existingPaths: new Set(project.files.map((file) => normalizePath(file.relativePath))),
      dispositions: new Map([...dispositions].filter(([objectId]) => deferredObjectIds.has(objectId))),
    })
  }

  private resolveTerminalDispositions(goalId: string, input?: ReadonlyMap<string, MaterializationTerminalDisposition>) {
    if (input) return input
    return new Map(this.terminalIssueEvidence?.(goalId)
      .filter((issue) => issue.status === "needs_help" || issue.status === "bypassed")
      .flatMap((issue) => issue.affectedObjectIds.map((objectId) => [objectId, issue.status === "bypassed" ? "bypassed" as const : "needs_help" as const])) ?? [])
  }

  private async submitResearch(input: {
    projectId: string
    goalId: string
    goalVersion: number
    attemptId: string
    root: string
    objectId: string
    research: unknown
  }) {
    this.requireActiveGoal(input)
    const state = await this.requireState(input.projectId, input.root, input.goalId)
    const blueprint = await this.requireFrozenBlueprint(input.projectId, input.goalId, input.root)
    const entry = blueprint.layers.flatMap((layer) => layer.objects).find((object): object is WorldBlueprintObject & { kind: "entry"; plannedPath: string } => object.id === input.objectId && isEntry(object))
    if (!entry) throw new Error("growth_invalid: assigned blueprint object does not exist")
    const object = state.objects.find((candidate) => candidate.objectId === input.objectId)
    if (!object) throw new Error("growth_invalid: assigned materialization object does not exist")
    const receipts = await this.receipts(input.projectId, state)
    const mappedSources = (await this.reconciliationSources(input.projectId, input.goalId, input.root)).get(entry.id) ?? []
    const allowedSources = materializationSourceCandidates(input.root, entry, blueprint.layers, blueprint.relations.relations, receipts, await this.declaredProjectSources(input.projectId, input.root), mappedSources).allowed
    const research = requirePerformanceFirstBrief(input.research, allowedSources)
    if (research.objectId !== entry.id) throw new Error("growth_invalid: writing brief object identity is invalid")
    if (mappedSources.length && !research.materialPaths.some((path) => mappedSources.includes(path))) throw new Error("growth_invalid: reconcile writing brief must adopt at least one mapped source")
    const existing = await this.readInternalJsonIfExists<unknown>(input.projectId, materializationBriefKey(input.goalId, input.objectId))
    if (existing) {
      const validated = requirePerformanceFirstBrief(existing, allowedSources)
      if (canonicalJson(validated) !== canonicalJson(research)) throw new Error("growth_conflict: object writing brief already exists with different evidence")
      if (object.lastAcceptedAttemptId !== input.attemptId) throw new Error(`growth_conflict: materialization attempt is stale for ${object.objectId}`)
      return { objectId: entry.id, researchStored: true, replayed: true }
    }
    requireCurrentAttempt(object, input.attemptId, "research")
    await Promise.all([...new Set([...research.materialPaths, ...research.lockedFacts.flatMap((fact) => fact.sourcePaths)])].map((path) => this.projectFiles.readBytes(input.projectId, path)))
    if (object.status !== "researching") throw new Error(`growth_conflict: object is ${object.status}, not researching`)
    await this.writeInternalJson(input.projectId, materializationBriefKey(input.goalId, input.objectId), research, null)
    await this.writeInternalJson(input.projectId, materializationStateKey(input.goalId), {
      ...state,
      objects: state.objects.map((candidate) => candidate.objectId === input.objectId
        ? withoutAttempt(clearFailureMetadata({ ...candidate, status: "ready" as const, lastAcceptedAttemptId: input.attemptId }))
        : candidate),
    })
    return { objectId: entry.id, researchStored: true, status: "ready", replayed: false }
  }

  async downstreamObjectIds(projectId: string, goalId: string, root: string, objectId: string) {
    const blueprint = await this.requireFrozenBlueprint(projectId, goalId, root)
    const entries = new Set(blueprint.layers.flatMap((layer) => layer.objects.filter(isEntry).map((object) => object.id)))
    const outgoing = new Map<string, string[]>()
    for (const relation of blueprint.relations.relations) outgoing.set(relation.from, [...outgoing.get(relation.from) ?? [], relation.to])
    const visited = new Set<string>()
    const queue = [...outgoing.get(objectId) ?? []]
    while (queue.length) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      queue.push(...outgoing.get(current) ?? [])
    }
    return [...visited].filter((id) => entries.has(id))
  }

  async retryBlockedObject(projectId: string, goalId: string, root: string, objectId: string) {
    return this.resolveBlockedObject(projectId, goalId, root, objectId, "retry", "按原目标重新尝试。")
  }

  async resolveBlockedObject(projectId: string, goalId: string, root: string, objectId: string, action: WorldMaterializationResolutionAction, instruction: string) {
    return this.serialize(`${projectId}\0${root}`, async () => {
      const state = await this.reconcile(projectId, await this.requireState(projectId, root, goalId))
      const object = state.objects.find((candidate) => candidate.objectId === objectId)
      if (!object) throw new Error("growth_invalid: blocking materialization object does not exist")
      if (object.status === "completed") return state
      if (!object.lastError || object.status !== "retryable" && object.status !== "blocked" && !(object.status === "unknown" && object.block)) {
        throw new Error(`growth_conflict: ${objectId} is not a retryable blocked object`)
      }
      if (action === "accept" && !await this.exists(projectId, object.plannedPath)) throw new Error("growth_conflict: existing output cannot be accepted because its body is missing")
      const phase = action === "repair" ? "writing" as const : action === "accept" ? "recovery" as const : object.lastError.phase
      const next = {
        ...state,
        objects: state.objects.map((candidate) => candidate.objectId === objectId
          ? rearmMaterializationObject(candidate, phase, action, instruction)
          : candidate),
      }
      await this.writeInternalJson(projectId, materializationStateKey(goalId), next)
      await this.onProgressChanged?.(goalId)
      return next
    })
  }

  private async completeObject(input: {
    projectId: string
    goalId: string
    goalVersion: number
    attemptId: string
    root: string
    objectId: string
    imageTaskId: string
    summary: string
    extraction: unknown
  }) {
    this.requireActiveGoal(input)
    const state = await this.requireState(input.projectId, input.root, input.goalId)
    const object = state.objects.find((candidate) => candidate.objectId === input.objectId)
    if (!object) throw new Error("growth_invalid: assigned blueprint object does not exist")
    const blueprint = await this.requireFrozenBlueprint(input.projectId, input.goalId, input.root)
    const entry = blueprint.layers.flatMap((layer) => layer.objects).find((candidate): candidate is WorldBlueprintObject & { kind: "entry"; plannedPath: string } => candidate.id === input.objectId && isEntry(candidate))
    if (!entry) throw new Error("growth_invalid: assigned blueprint entry does not exist")
    const receipts = await this.receipts(input.projectId, state)
    const existingReceipt = receipts.find((receipt) => receipt.objectId === input.objectId)
    if (existingReceipt) {
      if (existingReceipt.attemptId !== input.attemptId) throw new Error(`growth_conflict: materialization attempt is stale for ${object.objectId}`)
      if (existingReceipt.imageTaskId !== input.imageTaskId.trim() || existingReceipt.summary !== input.summary.trim()) {
        throw new Error("growth_conflict: object receipt already exists with different evidence")
      }
      const extraction = await this.requireInternalJson<PostWriteExtraction>(input.projectId, materializationExtractionKey(input.goalId, input.objectId))
      if (canonicalJson(modelPostWriteExtraction(extraction)) !== canonicalJson(input.extraction)) throw new Error("growth_conflict: object extraction already exists with different evidence")
      await this.bindReceiptAttachment(input.projectId, existingReceipt, object).catch(() => undefined)
      return { objectId: object.objectId, artifactPath: object.plannedPath, replayed: true }
    }
    requireCurrentAttempt(object, input.attemptId, object.status === "unknown" ? "recovery" : "writing")
    const completionPhase = object.attempt!.phase
    const mappedSources = (await this.reconciliationSources(input.projectId, input.goalId, input.root)).get(entry.id) ?? []
    const research = await this.requireResearchPacket(input.projectId, input.goalId, input.root, entry, object, materializationSourceCandidates(input.root, entry, blueprint.layers, blueprint.relations.relations, receipts, await this.declaredProjectSources(input.projectId, input.root), mappedSources).allowed, blueprint.state.route)
    if (mappedSources.length && !research.materialPaths.some((path) => mappedSources.includes(path))) throw new Error("growth_invalid: reconcile writing brief must adopt at least one mapped source")
    const sourcePaths = normalizePaths([...research.materialPaths, ...research.lockedFacts.flatMap((fact) => fact.sourcePaths)])
    const body = decoder.decode(await this.projectFiles.readBytes(input.projectId, object.plannedPath))
    if (body.replace(/\s/gu, "").length < 600) throw new Error("growth_invalid: assigned Markdown body is too short to stand as a complete world entry")
    if (object.status === "unknown" && (!object.recoveryBodySha256 || sha256(new TextEncoder().encode(body)) !== object.recoveryBodySha256)) {
      throw new Error("growth_conflict: recovery body changed after its preserved hash was recorded")
    }
    validatePublicWorldBody(body)
    const bodySha256 = sha256(new TextEncoder().encode(body))
    const extraction = validatePostWriteExtraction(input.extraction, { objectId: input.objectId, bodySha256, body })
    const extractionSha256 = sha256(new TextEncoder().encode(canonicalJson(extraction)))
    const receipt: WorldMaterializationReceipt = {
      schemaVersion: 4,
      goalId: input.goalId,
      goalVersion: input.goalVersion,
      objectId: input.objectId,
      attemptId: input.attemptId,
      phase: completionPhase === "recovery" ? "recovery" : "writing",
      writingContractHash: object.writingContractHash,
      bodySha256,
      artifactPath: object.plannedPath,
      sourcePaths,
      imageTaskId: input.imageTaskId.trim(),
      summary: input.summary.trim(),
      extractionSha256,
    }
    if (object.status !== "writing" && object.status !== "unknown") throw new Error(`growth_conflict: object is ${object.status}, not writing or recovering`)
    const image = await this.imageEvidence(input.projectId, receipt.imageTaskId)
    if (!image) throw new Error("growth_invalid: image task is unknown or belongs to another project")
    const expectedImagePath = `${posix.dirname(object.plannedPath)}/图片/${posix.basename(object.plannedPath, ".md")}.png`
    if (normalizePath(image.relativePath) !== expectedImagePath) throw new Error(`growth_invalid: image task must target ${expectedImagePath}`)
    await this.writeInternalJson(input.projectId, materializationExtractionKey(input.goalId, input.objectId), extraction)
    await this.writeInternalJson(input.projectId, materializationReceiptKey(input.goalId, object.objectId), receipt, null)
    const next = { ...state, objects: state.objects.map((candidate) => candidate.objectId === object.objectId ? markCompleted(candidate, receipt.attemptId) : candidate) }
    await this.writeInternalJson(input.projectId, materializationStateKey(input.goalId), next)
    await this.rebuildRelationIndex(input.projectId, next)
    await this.bindReceiptAttachment(input.projectId, receipt, object).catch(() => undefined)
    return { objectId: object.objectId, artifactPath: object.plannedPath, imageTaskId: receipt.imageTaskId, replayed: false }
  }

  async reconcileImageAttachments(projectId: string, goalId: string, root: string) {
    const state = await this.requireState(projectId, root, goalId)
    const receipts = await this.receipts(projectId, state)
    const objects = new Map(state.objects.map((object) => [object.objectId, object]))
    const outcomes = await mapWithConcurrency(receipts, MAX_PARALLEL_FILE_READS, async (receipt) => {
      const object = objects.get(receipt.objectId)
      if (!object) return { receipt, error: `growth_invalid: materialization object ${receipt.objectId} is missing` }
      try {
        await this.bindReceiptAttachment(projectId, receipt, object)
        return { receipt }
      } catch (error) {
        return { receipt, error: error instanceof Error ? error.message : String(error) }
      }
    })
    return {
      checked: receipts.length,
      bound: outcomes.filter((outcome) => !outcome.error).length,
      failed: outcomes.flatMap((outcome) => outcome.error ? [{ imageTaskId: outcome.receipt.imageTaskId, artifactPath: outcome.receipt.artifactPath, error: outcome.error }] : []),
    }
  }

  private async bindReceiptAttachment(projectId: string, receipt: WorldMaterializationReceipt, object: WorldMaterializationObjectState) {
    if (!this.bindImageAttachment) throw new Error("image_attachment_unavailable: materialization attachment binding is not configured")
    return this.bindImageAttachment({
      projectId,
      imageTaskId: receipt.imageTaskId,
      documentPath: receipt.artifactPath,
      alt: object.writingContract.object.title,
      placement: "after_heading",
      anchor: object.writingContract.object.title,
    })
  }

  private async reconcile(projectId: string, state: WorldMaterializationStateDocument, options: { recoverInFlight?: boolean } = {}) {
    const blueprint = await this.requireFrozenBlueprint(projectId, state.goalId, state.root)
    const entries = new Map(blueprint.layers.flatMap((layer) => layer.objects).filter(isEntry).map((entry) => [entry.id, entry]))
    const receipts = await this.receipts(projectId, state)
    const declaredSources = await this.declaredProjectSources(projectId, state.root)
    const reconciliationSources = await this.reconciliationSources(projectId, state.goalId, state.root)
    const receiptsByObjectId = new Map(receipts.map((receipt) => [receipt.objectId, receipt]))
    const objects = await mapWithConcurrency(state.objects, MAX_PARALLEL_FILE_READS, async (object) => {
      const entry = entries.get(object.objectId)
      if (!entry) throw new Error(`growth_invalid: materialization object ${object.objectId} is absent from the frozen blueprint`)
      const receipt = receiptsByObjectId.get(object.objectId)
      if (receipt) {
        const allowed = materializationSourceCandidates(state.root, entry, blueprint.layers, blueprint.relations.relations, receipts, declaredSources, reconciliationSources.get(entry.id) ?? []).allowed
        const brief = requirePerformanceFirstBrief(await this.requireInternalJson<unknown>(projectId, materializationBriefKey(state.goalId, object.objectId)), allowed)
        if (brief.objectId !== object.objectId) throw new Error("growth_invalid: completed writing brief identity is invalid")
        const extraction = await this.requireInternalJson<PostWriteExtraction>(projectId, materializationExtractionKey(state.goalId, object.objectId))
        if (sha256(new TextEncoder().encode(canonicalJson(extraction))) !== receipt.extractionSha256) throw new Error("growth_invalid: completed extraction hash is invalid")
        return markCompleted(object, receipt.attemptId)
      }
      if (object.status === "blocked" || object.status === "retryable") return object
      const bodyExists = await this.exists(projectId, object.plannedPath)
      const research = await this.readInternalJsonIfExists<unknown>(projectId, materializationBriefKey(state.goalId, object.objectId))
      if (options.recoverInFlight && object.status === "writing") {
        if (bodyExists) return withoutAttempt({ ...object, status: "unknown" as const })
        return withoutAttempt({ ...object, status: "retryable" as const, lastError: { phase: "writing" as const, message: "Writer was interrupted before durable writing evidence" } })
      }
      if (object.status === "writing") return object
      if (bodyExists && !research) {
        return withoutAttempt({ ...object, status: "pending" as const })
      }
      if (bodyExists) return { ...object, status: "unknown" as const }
      if (research) {
        const mappedSources = reconciliationSources.get(entry.id) ?? []
        const packet = requirePerformanceFirstBrief(research, materializationSourceCandidates(state.root, entry, blueprint.layers, blueprint.relations.relations, receipts, declaredSources, mappedSources).allowed)
        if (packet.objectId !== object.objectId) throw new Error("growth_invalid: writing brief identity is invalid")
        if (mappedSources.length && !packet.materialPaths.some((path) => mappedSources.includes(path))) throw new Error("growth_invalid: reconcile writing brief must adopt at least one mapped source")
        return withoutAttempt({ ...object, status: "ready" as const })
      }
      if (["ready", "writing"].includes(object.status)) throw new Error(`growth_invalid: ${object.objectId} is ${object.status} without a durable V4 writing brief`)
      if (["researching"].includes(object.status) && object.attempt) return { ...object, status: "retryable" as const, lastError: { phase: object.attempt.phase, message: "Worker ended without durable phase evidence" } }
      return object
    })
    const next = { ...state, objects }
    if (canonicalJson(next) !== canonicalJson(state)) await this.writeInternalJson(projectId, materializationStateKey(state.goalId), next)
    await this.rebuildRelationIndex(projectId, next)
    return next
  }

  private async declaredProjectSources(projectId: string, root: string) {
    const indexPath = `${root}/资料索引.md`
    const text = decoder.decode(await this.projectFiles.readBytes(projectId, indexPath))
    const project = await this.projectFiles.refreshProject(projectId)
    const available = new Set(project.files.map((file) => file.relativePath.replaceAll("\\", "/")))
    const declared = text.split(/^##\s+/mu).flatMap((section) => {
      if (!/^-\s*类型：project\s*$/mu.test(section)) return []
      const location = section.match(/^-\s*定位：([^\r\n]+)\s*$/mu)?.[1]?.trim()
      if (!location) return []
      const candidate = location.replaceAll("\\", "/").replace(/^\.\//u, "")
      return available.has(candidate) ? [normalizePath(candidate)] : []
    })
    const paths = [...new Set(declared)]
    await Promise.all(paths.map((path) => this.projectFiles.readBytes(projectId, path)))
    return paths
  }

  private async reconciliationSources(projectId: string, goalId: string, root: string) {
    const manifest = await this.readInternalJsonIfExists<WorldReconciliationManifest>(projectId, blueprintReconciliationKey(goalId))
    if (!manifest) return new Map<string, string[]>()
    if (manifest.schemaVersion !== 1 || manifest.goalId !== goalId || manifest.root !== root) throw new Error("growth_invalid: reconcile manifest identity is invalid")
    return new Map(manifest.mappings.map((mapping) => [mapping.objectId, normalizePaths(mapping.sourcePaths)]))
  }

  private async rebuildRelationIndex(projectId: string, state: WorldMaterializationStateDocument) {
    const blueprint = await this.requireFrozenBlueprint(projectId, state.goalId, state.root)
    const receipts = await this.receipts(projectId, state)
    const extractions = (await mapWithConcurrency(receipts, MAX_PARALLEL_FILE_READS, (receipt) => this.readInternalJsonIfExists<PostWriteExtraction>(projectId, materializationExtractionKey(state.goalId, receipt.objectId)))).filter((value): value is PostWriteExtraction => Boolean(value))
    await this.writeInternalJson(projectId, materializationRelationsKey(state.goalId), buildRelationIndex(state.root, blueprint.layers, blueprint.relations.relations, receipts, extractions))
  }

  private async receipts(projectId: string, state: WorldMaterializationStateDocument) {
    const values = await mapWithConcurrency(state.objects, MAX_PARALLEL_FILE_READS, (object) => this.receiptIfExists(projectId, state, object))
    return values.filter((value): value is WorldMaterializationReceipt => Boolean(value))
  }

  private async receiptIfExists(projectId: string, state: WorldMaterializationStateDocument, object: WorldMaterializationObjectState) {
    const receiptKey = materializationReceiptKey(state.goalId, object.objectId)
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, receiptKey)
    if (!record) return undefined
    const persisted = parseJson<(Omit<WorldMaterializationReceipt, "schemaVersion" | "extractionSha256"> & { schemaVersion: 3 }) | WorldMaterializationReceipt>(decoder.decode(record.bytes))
    if (!persisted) throw new Error(`growth_invalid: materialization receipt ${object.objectId} is corrupt`)
    const receipt = persisted.schemaVersion === 3 ? await this.migrateCompletedV3Receipt(projectId, state, object, persisted, receiptKey, record.modifiedAt) : persisted as WorldMaterializationReceipt
    if (receipt.schemaVersion !== 4
      || receipt.goalId !== state.goalId
      || receipt.objectId !== object.objectId
      || typeof receipt.attemptId !== "string"
      || !receipt.attemptId
      || !["writing", "recovery"].includes(receipt.phase)
      || receipt.writingContractHash !== object.writingContractHash
      || typeof receipt.bodySha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(receipt.bodySha256)
      || receipt.artifactPath !== object.plannedPath
      || !Number.isSafeInteger(receipt.goalVersion)
      || receipt.goalVersion < 1
      || !Array.isArray(receipt.sourcePaths)
      || receipt.sourcePaths.some((path) => typeof path !== "string")
      || typeof receipt.imageTaskId !== "string"
      || !receipt.imageTaskId
      || typeof receipt.summary !== "string"
      || !receipt.summary
      || typeof receipt.extractionSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(receipt.extractionSha256)) {
      throw new Error(`growth_invalid: materialization receipt ${object.objectId} is corrupt`)
    }
    return receipt
  }

  private async migrateCompletedV3Receipt(
    projectId: string,
    state: WorldMaterializationStateDocument,
    object: WorldMaterializationObjectState,
    legacy: Omit<WorldMaterializationReceipt, "schemaVersion" | "extractionSha256"> & { schemaVersion: 3 },
    receiptKey: string,
    expectedModifiedAt: string,
  ) {
    const body = await this.projectFiles.readBytes(projectId, object.plannedPath)
    if (sha256(body) !== legacy.bodySha256) throw new Error("growth_migration_conflict: completed V3 body changed before V4 migration")
    const extraction: PostWriteExtraction = { schemaVersion: 4, objectId: object.objectId, bodySha256: legacy.bodySha256, facts: [], relations: [], contradictions: [], lockedFactConflicts: [] }
    const extractionSha256 = sha256(new TextEncoder().encode(canonicalJson(extraction)))
    const brief: PerformanceFirstBrief = {
      schemaVersion: 4,
      objectId: object.objectId,
      purpose: `保留 V3 已完成正文：${object.writingContract.object.title}`,
      materialPaths: normalizePaths(legacy.sourcePaths),
      lockedFacts: [],
      genreSuggestions: {
        primary: object.writingContract.genreLabel,
        alternatives: [],
        techniques: [...object.writingContract.language],
        avoid: [...object.writingContract.forbidden],
      },
    }
    const existingBrief = await this.readInternalJsonIfExists<PerformanceFirstBrief>(projectId, materializationBriefKey(state.goalId, object.objectId))
    if (existingBrief && canonicalJson(existingBrief) !== canonicalJson(brief)) throw new Error("growth_migration_conflict: migrated V4 brief differs")
    if (!existingBrief) await this.writeInternalJson(projectId, materializationBriefKey(state.goalId, object.objectId), brief, null)
    const existingExtraction = await this.readInternalJsonIfExists<PostWriteExtraction>(projectId, materializationExtractionKey(state.goalId, object.objectId))
    if (existingExtraction && canonicalJson(existingExtraction) !== canonicalJson(extraction)) throw new Error("growth_migration_conflict: migrated V4 extraction differs")
    if (!existingExtraction) await this.writeInternalJson(projectId, materializationExtractionKey(state.goalId, object.objectId), extraction, null)
    const receipt: WorldMaterializationReceipt = { ...legacy, schemaVersion: 4, extractionSha256 }
    await this.writeInternalJson(projectId, receiptKey, receipt, expectedModifiedAt)
    return receipt
  }

  private async requireFrozenBlueprint(projectId: string, goalId: string, root: string) {
    const state = await this.requireInternalJson<WorldBlueprintStateDocument>(projectId, blueprintStateKey(goalId))
    if (state.schemaVersion !== 3 || state.root !== root || state.status !== "frozen") throw new Error("growth_invalid: Growth World Pro requires a confirmed frozen V3 blueprint")
    const layers = await mapWithConcurrency(WORLD_BLUEPRINT_LAYERS, MAX_PARALLEL_FILE_READS, (layer) => this.requireInternalJson<WorldBlueprintLayerDocument>(projectId, blueprintLayerKey(goalId, layer)))
    const [relations, index] = await Promise.all([
      this.requireInternalJson<WorldBlueprintRelationsDocument>(projectId, blueprintRelationsKey(goalId)),
      this.requireInternalJson<WorldBlueprintIndexDocument>(projectId, blueprintIndexKey(goalId)),
    ])
    const validation = index.status === "frozen" ? validateWorldBlueprintDocuments(root, layers, relations, index, false) : "世界蓝图/index.json 未冻结"
    if (validation) throw new Error(`growth_invalid: Growth World Pro requires a confirmed frozen V3 blueprint: ${validation}`)
    return { state, layers, relations }
  }

  private async requireState(projectId: string, root: string, goalId: string) {
    const state = await this.requireInternalJson<WorldMaterializationStateDocument>(projectId, materializationStateKey(goalId))
    if (state.schemaVersion !== 4 || state.root !== root || state.goalId !== goalId) throw new Error("growth_conflict: invalid materialization state identity")
    for (const object of state.objects) {
      const contract = requireWritingContractSnapshot(object.writingContract)
      if (hashWritingContract(contract) !== object.writingContractHash || contract.object.id !== object.objectId || contract.object.layer !== object.layer) {
        throw new Error(`growth_invalid: materialization writing contract ${object.objectId} is corrupt`)
      }
      if (!object.attempts || !["research", "writing", "recovery"].every((phase) => Number.isSafeInteger(object.attempts[phase as WorldMaterializationPhase]) && object.attempts[phase as WorldMaterializationPhase] >= 0)) {
        throw new Error(`growth_invalid: materialization attempt counters ${object.objectId} are corrupt`)
      }
      if (object.attempt && (!/^[0-9a-f]{64}$/u.test(object.attempt.attemptId)
        || !["research", "writing", "recovery"].includes(object.attempt.phase)
        || !Number.isSafeInteger(object.attempt.number)
        || object.attempt.number < 1
        || object.attempt.number !== object.attempts[object.attempt.phase]
        || !Number.isSafeInteger(object.attempt.startedAt)
        || object.attempt.startedAt < 1)) {
        throw new Error(`growth_invalid: materialization active attempt ${object.objectId} is corrupt`)
      }
      if (object.lastAcceptedAttemptId && !/^[0-9a-f]{64}$/u.test(object.lastAcceptedAttemptId)) {
        throw new Error(`growth_invalid: materialization accepted attempt ${object.objectId} is corrupt`)
      }
    }
    return state
  }

  private async requireResearchPacket(
    projectId: string,
    goalId: string,
    root: string,
    object: WorldBlueprintObject,
    state: WorldMaterializationObjectState,
    allowedSources: ReadonlySet<string>,
    _route: WorldBlueprintStateDocument["route"],
  ) {
    const packet = await this.requireInternalJson<unknown>(projectId, materializationBriefKey(goalId, object.id))
    const brief = requirePerformanceFirstBrief(packet, allowedSources)
    if (brief.objectId !== object.id || state.writingContract.object.id !== object.id) throw new Error("growth_invalid: writing brief identity is invalid")
    return brief
  }

  private requireActiveGoal(input: { projectId: string; goalId: string; goalVersion: number; root: string }) {
    const goal = this.goalIdentity(input.goalId)
    if (!goal || goal.projectId !== input.projectId || goal.workRootPath !== input.root) throw new Error("growth_conflict: materialization Goal identity no longer matches the project and work root")
    if (goal.status !== "active" || goal.version !== input.goalVersion) throw new Error(`growth_conflict: materialization Goal is ${goal.status} v${goal.version}, Worker expected active v${input.goalVersion}`)
  }

  private async requireAttemptAction(input: { projectId: string; goalId: string; root: string; objectId: string; attemptId: string }, action: "submit_research" | "complete_object") {
    const state = await this.requireState(input.projectId, input.root, input.goalId)
    const object = state.objects.find((candidate) => candidate.objectId === input.objectId)
    if (!object) throw new Error("growth_invalid: assigned materialization object does not exist")
    if (!object.attempt && object.lastAcceptedAttemptId === input.attemptId) return
    if (!object.attempt || object.attempt.attemptId !== input.attemptId) throw new Error(`growth_conflict: materialization attempt is stale for ${object.objectId}`)
    const expected = object.attempt.phase === "research" ? "submit_research" : "complete_object"
    if (action !== expected) throw new Error(`growth_invalid: trusted ${object.attempt.phase} attempt only accepts ${expected}`)
  }

  private async requireInternalJson<T>(projectId: string, key: string) {
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (!record) throw new Error(`growth_invalid: required internal materialization input ${key} does not exist`)
    const value = parseJson<T>(decoder.decode(record.bytes))
    if (!value) throw new Error(`growth_invalid: ${key} is not a valid JSON document`)
    return value
  }

  private async readInternalJsonIfExists<T>(projectId: string, key: string) {
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (!record) return undefined
    return parseJson<T>(decoder.decode(record.bytes))
  }

  private async exists(projectId: string, relativePath: string) {
    try {
      await this.projectFiles.readBytes(projectId, relativePath)
      return true
    } catch (error) {
      if (error instanceof Error && error.message.includes("file does not exist")) return false
      throw error
    }
  }

  private async writeInternalJson(projectId: string, key: string, value: unknown, expectedModifiedAt?: string | null) {
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content: `${JSON.stringify(value, undefined, 2)}\n`, ...(expectedModifiedAt === undefined ? {} : { expectedModifiedAt }) })
    const goal = key.match(/^goals\/([^/]+)\/world\/materialization\/state\.json$/u)?.[1]
    if (goal && this.onProgressChanged) await Promise.resolve(this.onProgressChanged(decodeURIComponent(goal))).catch(() => undefined)
  }

  private async serialize<T>(key: string, operation: () => Promise<T>) {
    const previous = this.queues.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    this.queues.set(key, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(key) === tail) this.queues.delete(key)
    }
  }
}

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, operation: (value: T, index: number) => Promise<R>) {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await operation(values[index]!, index)
    }
  }))
  return results
}

export class WorldMaterializationCoordinator {
  private readonly materialization: WorldMaterializationService
  private readonly runner: WorldMaterializationBatchRunner
  private readonly progress: WorldMaterializationProgressPort
  private readonly goals: WorldMaterializationGoalPort
  private readonly issues: WorldMaterializationIssuePort | undefined

  constructor(
    materialization: WorldMaterializationService,
    runner: WorldMaterializationBatchRunner,
    progress: WorldMaterializationProgressPort,
    goals: WorldMaterializationGoalPort,
    issues?: WorldMaterializationIssuePort,
  ) {
    this.materialization = materialization
    this.runner = runner
    this.progress = progress
    this.goals = goals
    this.issues = issues
  }

  async run(goal: GrowthGoalProjection, _executionMode?: "world-materialization", ownerActivationId?: string) {
    if (!goal.workRootPath) throw new Error("growth_invalid: materialization requires a verified work root")
    const terminalDispositions = this.terminalDispositions(goal.goalId)
    const deferredObjectIds = new Set(terminalDispositions.keys())
    const completed = await this.materialization.completedLayers(goal.projectId, goal.goalId, goal.workRootPath, deferredObjectIds)
    const missingLayer = completed.layers.find((candidate) => !this.progress.hasReport(goal.goalId, layerReportId(candidate)))
    if (missingLayer) {
      const report = await this.materialization.layerReport(goal.projectId, goal.goalId, goal.workRootPath, missingLayer, terminalDispositions)
      await this.progress.commit(report, {
        projectId: goal.projectId,
        goalId: goal.goalId,
        version: goal.version,
      })
      return { state: "completed", reason: `${missingLayer} materialization report recovered` } satisfies GrowthStageRunResult
    }
    const layer = await this.materialization.currentLayer(goal.projectId, goal.goalId, goal.workRootPath, deferredObjectIds)
    if (!layer) return this.finalize(goal, terminalDispositions)
    while (true) {
      const current = this.goals.get(goal.goalId)
      if (!current || current.status !== "active" || current.version !== goal.version) return { state: "cancelled", reason: "Growth changed while materializing the layer" } satisfies GrowthStageRunResult
      const latestSteer = this.goals.latestSteer?.(goal.goalId)
      const deferredObjectIds = this.deferredObjectIds(goal.goalId)
      const batch = await this.materialization.dispatchBatch({
        projectId: goal.projectId,
        sessionId: goal.sessionId,
        goalId: goal.goalId,
        expectedVersion: goal.version,
        root: goal.workRootPath,
        ...(latestSteer ? { latestSteer } : {}),
        ...(deferredObjectIds.size ? { deferredObjectIds } : {}),
      })
      if (!batch.commands.length) {
        return { state: "unknown", reason: `${batch.layer} has no runnable object; blocked or exhausted objects require user action` } satisfies GrowthStageRunResult
      }
      let results: GrowthStageRunResult[]
      try {
        results = await this.runner.runGrowthStageBatch(batch.commands.map((command) => ({
          ...command,
          ...(ownerActivationId ? { ownerActivationId } : {}),
        })))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        results = batch.commands.map(() => ({ state: "failed", reason }))
      }
      const batchObjectIds = batch.commands.map((command) => command.workItemId!)
      const settled = await this.materialization.settleBatch(goal.projectId, goal.goalId, goal.workRootPath, batchObjectIds, results)
      await this.updateIssues(goal, batch.commands, results, settled)
      await this.reconcileIssues(goal, false)
      // Durable research and object receipts remain authoritative when the model
      // fails only while producing its final conversational response.
      if (await this.materialization.currentLayer(goal.projectId, goal.goalId, goal.workRootPath, this.deferredObjectIds(goal.goalId)) !== layer) break
    }
    const report = await this.materialization.layerReport(goal.projectId, goal.goalId, goal.workRootPath, layer, this.terminalDispositions(goal.goalId))
    const reportId = this.progress.hasReport(goal.goalId, report.reportId) ? `${report.reportId}-recovery-${goal.version}` : report.reportId
    await this.progress.commit({ ...report, reportId }, {
      projectId: goal.projectId,
      goalId: goal.goalId,
      version: goal.version,
    })
    return { state: "completed", reason: `${layer} materialized` } satisfies GrowthStageRunResult
  }

  private async finalize(goal: GrowthGoalProjection, terminalDispositions: ReadonlyMap<string, MaterializationTerminalDisposition>) {
    if (!goal.workRootPath) throw new Error("growth_invalid: materialization requires a verified work root")
    await this.reconcileIssues(goal, true)
    const reconciledDispositions = this.terminalDispositions(goal.goalId)
    const { evidence, summary } = await this.materialization.finalSummary(goal.projectId, goal.goalId, goal.workRootPath, reconciledDispositions)
    const reportId = this.progress.hasReport(goal.goalId, "world-materialization-owner-ready-v3")
      ? `world-materialization-owner-ready-v3-recovery-${goal.version}`
      : "world-materialization-owner-ready-v3"
    await this.progress.commit({
      reportId,
      outcome: "completed",
      summary,
      artifactPaths: [],
      imageTaskIds: evidence.images.map((image) => image.imageTaskId),
      requiredImageTaskIds: [],
      backgroundImageTaskIds: evidence.images.map((image) => image.imageTaskId),
    }, { projectId: goal.projectId, goalId: goal.goalId, version: goal.version }, { completionAuthority: "world-materialization-final" })
    return { state: "completed", reason: summary } satisfies GrowthStageRunResult
  }

  private deferredObjectIds(goalId: string) {
    return new Set(this.terminalDispositions(goalId).keys())
  }

  private terminalDispositions(goalId: string) {
    return new Map(this.issues?.listIssues(goalId)
      .filter((issue) => issue.status === "needs_help" || issue.status === "bypassed")
      .flatMap((issue) => issue.affectedObjectIds.map((objectId) => [objectId, issue.status === "bypassed" ? "bypassed" as const : "needs_help" as const])) ?? [])
  }

  private async reconcileIssues(goal: GrowthGoalProjection, terminalizing: boolean) {
    if (!this.issues || !goal.workRootPath) return
    const terminal = await this.materialization.materializationTerminalEvidence(goal.projectId, goal.goalId, goal.workRootPath, this.terminalDispositions(goal.goalId))
    for (const transition of planMaterializationIssueReconciliation({
      issues: this.issues.listIssues(goal.goalId),
      outcomes: terminal.outcomes,
      terminalizing,
    })) {
      this.issues.transitionIssue(transition)
    }
  }

  private async updateIssues(goal: GrowthGoalProjection, commands: GrowthStageRunCommand[], results: GrowthStageRunResult[], state: WorldMaterializationStateDocument) {
    if (!this.issues || !goal.workRootPath) return
    for (const [index, command] of commands.entries()) {
      const objectId = command.workItemId!
      const object = state.objects.find((candidate) => candidate.objectId === objectId)!
      const phase = materializationCommandPhase(command)
      const dedupeKey = `materialization:${objectId}:${phase}`
      const existing = this.issues.getIssueByDedupe(goal.goalId, dedupeKey)
      if (object.status === "completed" || object.status === "ready") {
        const result = results[index]!
        if (!existing && (result.failure || result.state === "failed" || result.state === "unknown")) {
          const failure = classifyMaterializationFailure(result, object)
          const detected = this.issues.recordIssue({ issueId: materializationIssueId(goal.goalId, dedupeKey), dedupeKey, goalId: goal.goalId, workItemId: objectId, errorCode: failure.errorCode, impact: "repairable", summary: failure.summary, detail: failure.detail, affectedObjectIds: [objectId] })
          this.issues.transitionIssue({ issueId: detected.issueId, expectedVersion: detected.version, status: "bypassed", summary: `${command.workItemTitle ?? objectId} 已留下有效持久证据，尾声错误不影响结果，已自动绕过。`, attemptCount: object.attempts[phase] })
          continue
        }
        if (existing?.status === "repairing" || existing?.status === "detected") {
          this.issues.transitionIssue({ issueId: existing.issueId, expectedVersion: existing.version, status: "resolved", summary: `${command.workItemTitle ?? objectId} 已自动修复并通过持久证据校验。`, attemptCount: object.attempts[phase] })
        }
        continue
      }
      if (object.status !== "retryable" && object.status !== "blocked") continue
      const failure = classifyMaterializationFailure(results[index]!, object)
      const issue = existing ?? this.issues.recordIssue({
        issueId: materializationIssueId(goal.goalId, dedupeKey),
        dedupeKey,
        goalId: goal.goalId,
        workItemId: objectId,
        errorCode: failure.errorCode,
        impact: "repairable",
        summary: failure.summary,
        detail: failure.detail,
        affectedObjectIds: [objectId],
      })
      if (object.status === "retryable") {
        if (issue.status === "detected") this.issues.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "repairing", summary: failure.repairInstruction, attemptCount: object.attempts[phase] })
        continue
      }
      const downstream = await this.materialization.downstreamObjectIds(goal.projectId, goal.goalId, goal.workRootPath, objectId)
      if (!downstream.length) {
        if (issue.status === "detected" || issue.status === "repairing") this.issues.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "bypassed", impact: "local", summary: `${command.workItemTitle ?? objectId} 自动修复已耗尽，已安全绕过并保留缺失记录；其余世界对象继续生成。`, affectedObjectIds: [objectId], attemptCount: object.attempts[phase] })
        continue
      }
      if (issue.status === "detected" || issue.status === "repairing") this.issues.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "bypassed", impact: "local", summary: `${command.workItemTitle ?? objectId} 自动修复已耗尽，已连同 ${downstream.length} 个依赖对象安全绕过；最终汇报会列出缺失范围。`, affectedObjectIds: [objectId, ...downstream], attemptCount: object.attempts[phase] })
    }
  }
}

function finalSummaryEvidence(root: string, evidence: Awaited<ReturnType<WorldMaterializationService["finalSummaryEvidence"]>>) {
  const counts = Object.fromEntries(["succeeded", "failed", "interrupted", "cancelled", "queued", "generating", "unknown"].map((status) => [status, evidence.images.filter((image) => image.status === status).length]))
  const unfinished = evidence.images.filter((image) => image.status !== "succeeded").map((image) => ({
    path: image.relativePath,
    status: image.status,
    ...(image.errorCode ? { errorCode: image.errorCode } : {}),
    ...(image.errorMessage ? { errorMessage: image.errorMessage } : {}),
  }))
  const withoutVisualStyle = evidence.images.filter((image) => !("visualStyleApplied" in image) || image.visualStyleApplied !== true).map((image) => image.relativePath)
  const unboundToReceipt = evidence.images.filter((image) => "bindingStatus" in image && image.bindingStatus === "unbound-to-receipt").map((image) => ({
    imageTaskId: image.imageTaskId,
    path: image.relativePath,
    workItemId: "growthWorkItemId" in image ? image.growthWorkItemId : undefined,
  }))
  const unattached = evidence.images.flatMap((image) => {
    if (image.status !== "succeeded" || (image.attachment?.status === "succeeded" && image.attachment.documentPath === image.artifactPath)) return []
    if (image.attachment?.status === "failed" && isSilentImageAttachmentConflict(image.attachment.errorCode)) return []
    return [{
      imagePath: image.relativePath,
      documentPath: image.artifactPath,
      ...(image.attachment?.documentPath && image.attachment.documentPath !== image.artifactPath ? { boundDocumentPath: image.attachment.documentPath } : {}),
      ...(image.attachment?.errorCode ? { errorCode: image.attachment.errorCode } : {}),
      ...(image.attachment?.errorMessage ? { errorMessage: image.attachment.errorMessage } : {}),
    }]
  })
  const unfinishedObjects = evidence.terminal.outcomes.filter((outcome) => !isTrustedMaterializationOutcome(outcome)).map((outcome) => ({
    title: outcome.title,
    path: outcome.path,
    reason: outcome.status,
  }))
  return `可信完成信息：
- 作品根：${root}
- 交付结果：${evidence.terminal.isPartial ? "部分完成" : "全部可信完成"}
- 可信正文：${evidence.completedObjects}/${evidence.totalObjects}
- 未可信完成：${evidence.terminal.untrusted}
- 未可信完成清单：${JSON.stringify(unfinishedObjects)}
- 图片状态：${JSON.stringify(counts)}
- 失败、中断或仍在处理的图片：${JSON.stringify(unfinished)}${unboundToReceipt.length ? `
- 已提交但尚未绑定正文回执的图片：${JSON.stringify(unboundToReceipt)}` : ""}${withoutVisualStyle.length ? `
- 未应用项目统一画风的图片：${JSON.stringify(withoutVisualStyle)}` : ""}${unattached.length ? `
- 图片已生成但未插入文章：${JSON.stringify(unattached)}` : ""}`
}

function isTrustedMaterializationOutcome(outcome: MaterializationObjectOutcome | undefined) {
  return outcome?.status === "completed" || outcome?.status === "accepted-existing"
}

function layerReportId(layer: WorldBlueprintLayer) {
  return `world-materialization-layer-${WORLD_BLUEPRINT_LAYERS.indexOf(layer) + 1}`
}

function researchPrompt(
  root: string,
  object: WorldBlueprintObject & { plannedPath: string },
  candidates: WorldMaterializationSourceCandidates,
  route: WorldBlueprintStateDocument["route"],
  contract: WorldWritingContract,
  latestSteer?: string,
  lastError?: string,
) {
  const extractedFacts = candidates.extractedFacts.length
    ? candidates.extractedFacts.map((item) => `- ${item.sourcePath}\n${item.facts.map((fact) => `  - [${fact.sourceLevel}] ${fact.text}`).join("\n")}`).join("\n")
    : "- 当前没有更早正文的抽取事实。"
  const repair = lastError ? `\n\n上次尝试未形成合法持久简报：${lastError}\n只修正简报，不重复文件或图片副作用。` : ""
  const mapped = candidates.mappedSourcePaths.length ? `\n\n整理阶段已匹配到当前对象的原始资料，必须实际读取并在 materialPaths 至少采用一份：\n${candidates.mappedSourcePaths.map((path) => `- ${path}`).join("\n")}` : ""
  const draft = candidates.existingDraftPath ? `\n\n未审正文草稿：\n- ${candidates.existingDraftPath}\n必须读取但不得作为自己的 source 路径；简报通过后进入只读恢复。` : ""
  return `/growth\n<creatx_internal_growth_stage>\n你是 Growth World Pro V4 的一次性资料 Worker。只形成短小写作简报，不写正文、不提交图片。\n\n作品根：${root}\n对象：${object.title}\n目的：${object.locator}\n路线：${route}${latestSteer ? `\n最新用户修正：${latestSteer}` : ""}\n\n可选真实材料路径（必须逐字选择，不得填写 URL、资料 ID 或路径缩写）：\n${[...candidates.allowed].map((path) => `- ${path}`).join("\n")}${mapped}${draft}\n\n更早正文完成后抽取的实际事实：\n${extractedFacts}\n\n按相关性读取少量材料。资料不足、未知细节、普通语义缺口或未覆盖文类建议都不得产生 criticalGap；只需缩短 materialPaths，并允许 Writer 创造。锁定事实最多 12 条，只保存若被直接否定就会破坏人物身份、时间、结果或世界核心规则的事实，不要把全部材料穷举成 lockedFacts。\n\n最后调用 complete_world_materialization_object。顶层只提交 action=submit_research、purpose、materialPaths、lockedFacts、genreSuggestions；禁止提交 schemaVersion 或 objectId，它们由 Runtime 从可信 Worker 身份补齐。主建议可参考 ${contract.genreLabel}，但 primary、alternatives、techniques 和 avoid 都只是建议，Writer 可以更换、混合、省略或调整顺序。不得提交 claims、contentCards、consistencyGuard 或 criticalGaps。${repair}`
}

export function buildWorldMaterializationWritingPrompt(
  _root: string,
  object: WorldBlueprintObject & { plannedPath: string },
  packet: PerformanceFirstBrief | WorldMaterializationResearchPacket,
  _contract: WorldWritingContract,
  completionInstruction = writingCompletionInstruction(object),
  _route: WorldBlueprintStateDocument["route"] = "original",
  lastError?: string,
) {
  if (packet.schemaVersion !== 4) throw new Error("growth_invalid: legacy research packets cannot build a V4 Writer prompt")
  const lockedFacts = packet.lockedFacts.length ? packet.lockedFacts.map((fact) => `- ${fact.text}`).join("\n") : "- 当前没有额外锁定事实。"
  const repair = lastError ? `\n\n上次正文或完成回执失败：${lastError}\n读取并修改现有正文，只修正触发错误的内容或回执，不要重写已经合格的部分，也不要重复图片副作用。` : ""
  return `/growth\n<creatx_internal_growth_stage>\n你是 Growth World Pro V4 的正文 Writer。只写被分配路径 ${object.plannedPath}，不得修改其他正式正文。\n\n对象：${object.title}\n正文目的：${packet.purpose}${repair}\n\n少量锁定事实（可以省略，但不得直接否定）：\n${lockedFacts}\n\n候选文类与文风建议：\n- 主建议：${packet.genreSuggestions.primary}\n- 备选：${packet.genreSuggestions.alternatives.join("；") || "无"}\n- 技巧：${packet.genreSuggestions.techniques.join("；") || "无"}\n- 避免：${packet.genreSuggestions.avoid.join("；") || "无"}\n\n这些只提供建议。你可以更换文类、混合建议、改变顺序或忽略不适用技巧；在不直接否定锁定事实的前提下，自由创造完整、丰富、可读且符合题材气质的正文。正文必须独立成篇，首行使用唯一一级标题“# ${object.title}”；不得用提纲、摘要、问答清单或数百字速写代替。直接进入世界内容，不要解释写作任务、资料状态、检索过程或即将采用的结构。不要预声明将创造的事实。公开正文不得出现 source、derived、created、criticalGap、contentCards、consistencyGuard、检索过程、来源标签、内部 JSON 或制作术语。\n\n第一步必须调用当前可用的正文写入工具：GPT/Codex 模型通常使用 apply_patch，其他模型可能使用 editor。用它把完整 Markdown 成稿创建或完整写入 ${object.plannedPath}；不要先读取尚不存在的目标文件，也不要只在回复中展示正文。写入后必须调用 read_files 重新读取该路径，确认文件真实存在且内容完整。\n\n成稿后检查篇内明显矛盾与锁定事实冲突；发现时先用当前可用的正文写入工具重写。随后只抽取正文中实际出现的少量关键事实和事实间关系。事实项只含 id 与 text；不要提交 schemaVersion、objectId、bodySha256、sourceLevel 或 sourcePaths，这些身份和来源字段由 Runtime 从可信上下文补齐。若篇内仍有明显矛盾或直接否定锁定事实，分别填入 contradictions 或 lockedFactConflicts，工具将失败关闭。\n\n${completionInstruction}`
}

function writingCompletionInstruction(object: WorldBlueprintObject & { plannedPath: string }, existingImage?: WorldMaterializationRecoveryImageEvidence) {
  const imageInstruction = existingImage
    ? `已有真实图片任务 ${existingImage.imageTaskId}（状态：${existingImage.status}）。禁止再次调用 submit_image_generation，直接复用这个 imageTaskId。`
    : `调用 submit_image_generation 提交恰好一个持久图片任务，relativePath 必须逐字使用 ${imagePath(object.plannedPath)}，idempotencyKey 必须逐字使用 ${imageIdempotencyKey(object.id)}。不要提交 attachment；Runtime 会从物化回执绑定对应正文。不要等待图片完成，保存工具返回的真实 imageTaskId。`
  return `${imageInstruction}\n\n最后调用 complete_world_materialization_object。顶层只提交 action=complete_object、imageTaskId、summary、extraction，禁止在顶层提交 objectId 或 schemaVersion。extraction 只包含 facts、relations、contradictions、lockedFactConflicts；facts 每项只包含 id 和 text。工具成功后立即结束。`
}


function isDispatchable(object: WorldMaterializationObjectState | undefined, phase: WorldMaterializationPhase) {
  if (!object || object.status === "blocked" || object.status === "completed") return false
  if (phase === "research") return object.status === "pending" || (object.status === "retryable" && object.lastError?.phase === "research")
  if (phase === "writing") return object.status === "ready" || (object.status === "retryable" && object.lastError?.phase === "writing")
  return object.status === "unknown" || (object.status === "retryable" && object.lastError?.phase === "recovery")
}

function deferredMaterializationObjectIds(state: WorldMaterializationStateDocument, objectIds: Iterable<string>) {
  const candidates = new Set(objectIds)
  return new Set(state.objects.filter((object) => object.status === "blocked" && candidates.has(object.objectId)).map((object) => object.objectId))
}

function materializationInputSchema(profile: GrowthWorkerProfile) {
  if (profile === "world-research") return researchActionSchema
  if (profile === "world-writer" || profile === "world-recovery") return completionActionSchema
  return { type: "object", oneOf: [researchActionSchema, completionActionSchema] }
}

function materializationAttemptId(goalId: string, version: number, objectId: string, phase: WorldMaterializationPhase, number: number) {
  return createHash("sha256").update(`${goalId}\0${version}\0${objectId}\0${phase}\0${number}`).digest("hex")
}

function requireCurrentAttempt(object: WorldMaterializationObjectState, attemptId: string, phase: WorldMaterializationPhase) {
  if (!object.attempt || object.attempt.attemptId !== attemptId || object.attempt.phase !== phase) {
    throw new Error(`growth_conflict: materialization attempt is stale for ${object.objectId}`)
  }
}

function withoutAttempt(object: WorldMaterializationObjectState): WorldMaterializationObjectState {
  const { attempt: _attempt, ...persisted } = object
  return persisted
}

function clearFailureMetadata(object: WorldMaterializationObjectState): WorldMaterializationObjectState {
  const { lastError: _lastError, block: _block, ...persisted } = object
  return persisted
}

function clearBlock(object: WorldMaterializationObjectState): WorldMaterializationObjectState {
  const { block: _block, ...persisted } = object
  return persisted
}

function rearmMaterializationObject(object: WorldMaterializationObjectState, phase: WorldMaterializationPhase, action: WorldMaterializationResolutionAction, instruction: string) {
  const retryable = clearBlock(withoutAttempt({
    ...object,
    status: "retryable",
    lastError: { phase, message: `${object.lastError?.message ?? "Previous attempt did not complete"}\nOwner resolution (${action}): ${instruction.trim()}` },
  }))
  if (action !== "repair") return retryable
  const { recoveryBodySha256: _recoveryBodySha256, ...editable } = retryable
  return editable
}

function materializationCommandPhase(command: GrowthStageRunCommand): WorldMaterializationPhase {
  if (command.workerProfile === "world-writer") return "writing"
  if (command.workerProfile === "world-recovery") return "recovery"
  return "research"
}

function materializationIssueId(goalId: string, dedupeKey: string) {
  return `issue_${createHash("sha256").update(`${goalId}\0${dedupeKey}`).digest("hex").slice(0, 24)}`
}

function classifyMaterializationFailure(result: GrowthStageRunResult, object: WorldMaterializationObjectState) {
  const detail = result.failure?.detail?.trim() || result.failure?.message.trim() || result.reason?.trim() || object.lastError?.message || "Worker ended without durable evidence"
  if (/consistencyGuard\.invariants must contain 0 to 30 objects/iu.test(detail)) return {
    errorCode: "materialization_contract_overflow",
    summary: "一致性约束超过合同上限，正在自动合并后重试。",
    detail,
    repairInstruction: "正在合并重复约束并把回执收敛到最多 30 条。",
  }
  if (result.failure?.code === "provider_network" || /provider_network|UND_ERR_SOCKET|network|empty response|maxIterations/iu.test(detail)) return {
    errorCode: result.failure?.code ?? "materialization_transient_worker_failure",
    summary: "模型回合临时中断，正在从持久证据继续。",
    detail,
    repairInstruction: "正在从上次持久状态重试，不会重复已完成副作用。",
  }
  return {
    errorCode: result.failure?.code ?? "materialization_worker_failure",
    summary: "对象生成未形成有效持久证据，正在进行有界修复。",
    detail,
    repairInstruction: "正在依据原始错误进行有界修复。",
  }
}

function recoveryPrompt(root: string, object: WorldBlueprintObject & { plannedPath: string }, _packet: PerformanceFirstBrief, existingImage?: WorldMaterializationRecoveryImageEvidence) {
  const imageInstruction = existingImage
    ? `上一次运行已经留下真实图片任务 ${existingImage.imageTaskId}（当前状态：${existingImage.status}）。禁止再次调用 submit_image_generation；直接把这个 imageTaskId 用于完成回执。`
    : `调用 submit_image_generation 提交恰好一个持久图片任务，路径必须逐字使用上面的唯一图片路径，幂等键使用 ${imageIdempotencyKey(object.id)}。不要提交 attachment；Runtime 会从物化回执绑定对应正文。不要等待图片完成，并使用工具返回的真实 imageTaskId。`
  return `/growth\n<creatx_internal_growth_stage>\n你是 Growth World Pro 的一次性正文接管 Worker。上一次 Provider 中断前已经写完正文，但尚未提交物化回执。正文是需要保留的正式产物。\n\n作品根：${root}\n对象：${object.title}\n层：${object.layer}\n必须读取且绝不能修改的正文：${object.plannedPath}\n唯一图片路径：${imagePath(object.plannedPath)}\n\n使用 read_files 读取现有正文，确认它与对象“${object.title}”一致。禁止创建、修改、移动或删除任何正文、蓝图、研究包或关系文件；直接文件修改工具已经由 Runtime 禁用。\n\n${imageInstruction}\n\n从现有正文抽取少量关键事实与事实间关系。最后调用 complete_world_materialization_object；顶层只提交 action=complete_object、imageTaskId、summary、extraction，禁止在顶层提交 objectId 或 schemaVersion。extraction 只包含 facts、relations、contradictions、lockedFactConflicts；facts 每项只包含 id 和 text。篇内矛盾和锁定事实冲突必须如实报告并失败关闭。Runtime 会补齐抽取身份、正文哈希和来源级别，并校验图片路径。工具成功后立即结束。`
}

function imageIdempotencyKey(objectId: string) {
  return `world-pro:${objectId}:illustration`
}

function imagePath(plannedPath: string) {
  return `${posix.dirname(plannedPath)}/图片/${posix.basename(plannedPath, ".md")}.png`
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function buildRelationIndex(root: string, layers: WorldBlueprintLayerDocument[], causes: WorldBlueprintCausalRelation[], receipts: WorldMaterializationReceipt[], extractions: PostWriteExtraction[] = []) {
  const objects = layers.flatMap((layer) => layer.objects)
  const knownSourceEntries = [
    [`${root}/世界基准.md`, "source:world-baseline"],
    [`${root}/资料索引.md`, "source:source-index"],
    ...objects.filter(isEntry).map((object) => [object.plannedPath, object.id] as const),
  ] as const
  const knownSourceIds = new Map<string, string>(knownSourceEntries)
  const projectSources = [...new Set(receipts.flatMap((receipt) => receipt.sourcePaths))]
    .filter((sourcePath) => !knownSourceIds.has(sourcePath))
    .map((sourcePath) => ({ id: `source:project:${createHash("sha256").update(sourcePath).digest("hex")}`, path: sourcePath }))
  const sourceIds = new Map<string, string>([
    ...knownSourceEntries,
    ...projectSources.map((source) => [source.path, source.id] as const),
  ])
  return {
    schemaVersion: 1,
    nodes: [
      { id: "source:world-baseline", layer: "世界基准", title: "世界基准", path: `${root}/世界基准.md` },
      { id: "source:source-index", layer: "资料索引", title: "资料索引", path: `${root}/资料索引.md` },
      ...projectSources.map((source) => ({ id: source.id, layer: "项目来源", title: posix.basename(source.path), path: source.path })),
      ...objects.map((object) => ({
        id: object.id,
        layer: object.layer,
        title: object.title,
        path: object.plannedPath ?? `${root}/${object.layer}/蓝图.json`,
      })),
      ...extractions.flatMap((extraction) => extraction.facts.map((fact) => ({ id: `${extraction.objectId}:${fact.id}`, layer: "正文事实", title: fact.text, path: objects.find((object) => object.id === extraction.objectId)?.plannedPath }))),
    ],
    relations: [
      ...causes,
      ...receipts.flatMap((receipt) => receipt.sourcePaths.map((sourcePath) => ({
        from: receipt.objectId,
        to: sourceIds.get(sourcePath)!,
        type: "adopts" as const,
        note: receipt.summary,
      }))),
      ...extractions.flatMap((extraction) => extraction.relations.map((relation) => ({
        from: `${extraction.objectId}:${relation.fromFactId}`,
        to: `${extraction.objectId}:${relation.toFactId}`,
        type: relation.type,
        note: relation.reason,
      }))),
    ],
  }
}

function requireMaterializationAction(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: materialization action must be an object")
  const value = input as Record<string, unknown>
  if (value.action === "submit_research") {
    const allowed = new Set(["action", "purpose", "materialPaths", "lockedFacts", "genreSuggestions"])
    if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("growth_invalid: research action contains completion or unknown fields")
    return {
      action: "submit_research" as const,
      research: {
        purpose: value.purpose,
        materialPaths: value.materialPaths,
        lockedFacts: value.lockedFacts,
        genreSuggestions: value.genreSuggestions,
      },
    }
  }
  if (value.action !== "complete_object") throw new Error("growth_invalid: action must be submit_research or complete_object")
  const unknownFields = Object.keys(value).filter((key) => !["action", "imageTaskId", "summary", "extraction"].includes(key))
  if (unknownFields.length) throw new Error(`growth_invalid: completion action contains unknown top-level fields: ${unknownFields.join(", ")}`)
  if (typeof value.imageTaskId !== "string" || !value.imageTaskId.trim()) throw new Error("growth_invalid: imageTaskId is required")
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 1000) throw new Error("growth_invalid: summary must contain 1 to 1000 characters")
  return { action: "complete_object" as const, imageTaskId: value.imageTaskId.trim(), summary: value.summary.trim(), extraction: value.extraction }
}

function materializationSourceCandidates(
  root: string,
  object: WorldBlueprintObject,
  layers: readonly WorldBlueprintLayerDocument[],
  relations: readonly WorldBlueprintCausalRelation[],
  receipts: readonly WorldMaterializationReceipt[],
  declaredProjectSources: readonly string[] = [],
  mappedSourcePaths: readonly string[] = [],
  existingDraftPath?: string,
  extractions: ReadonlyArray<{ receipt: WorldMaterializationReceipt; extraction: PostWriteExtraction }> = [],
) {
  const layerIndex = WORLD_BLUEPRINT_LAYERS.indexOf(object.layer)
  const objectsById = new Map(layers.flatMap((layer) => layer.objects).map((candidate) => [candidate.id, candidate]))
  const completedEarlier = receipts.filter((receipt) => {
    const source = objectsById.get(receipt.objectId)
    return source && WORLD_BLUEPRINT_LAYERS.indexOf(source.layer) < layerIndex
  })
  const completedByObject = new Map(completedEarlier.map((receipt) => [receipt.objectId, receipt.artifactPath]))
  const earlierBodyPaths = completedEarlier.map((receipt) => receipt.artifactPath)
  const directPredecessors = relations
    .filter((relation) => relation.to === object.id && completedByObject.has(relation.from))
    .map((relation) => ({ path: completedByObject.get(relation.from)!, reason: relation.reason }))
  const completedEarlierIds = new Set(completedEarlier.map((receipt) => receipt.objectId))
  return {
    allowed: new Set([`${root}/世界基准.md`, `${root}/资料索引.md`, ...declaredProjectSources, ...mappedSourcePaths, ...earlierBodyPaths]),
    earlierBodyPaths,
    directPredecessors,
    mappedSourcePaths: [...mappedSourcePaths],
    ...(existingDraftPath ? { existingDraftPath } : {}),
    extractedFacts: extractions.filter((item) => completedEarlierIds.has(item.receipt.objectId)).map((item) => ({
      sourcePath: item.receipt.artifactPath,
      facts: item.extraction.facts.map((fact) => ({ text: fact.text, sourceLevel: fact.sourceLevel })),
    })),
  }
}

function normalizePaths(paths: string[]) {
  return [...new Set(paths.map(normalizePath))]
}

function normalizePath(path: string) {
  const normalized = path.trim().replaceAll("\\", "/").replace(/^\.\//u, "")
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("growth_invalid: evidence paths must be project-relative")
  }
  return normalized
}

function isEntry(object: WorldBlueprintObject): object is WorldBlueprintObject & { kind: "entry"; plannedPath: string; genreKey: string } {
  return object.kind === "entry" && typeof object.plannedPath === "string" && typeof object.genreKey === "string" && Boolean(object.genreKey)
}

function materializationContractMatchesBlueprint(
  object: WorldMaterializationObjectState,
  blueprintObject: (WorldBlueprintObject & { kind: "entry"; plannedPath: string; genreKey: string }) | undefined,
  blueprintState: WorldBlueprintStateDocument,
) {
  if (!blueprintObject) return false
  try {
    const contract = requireWritingContractSnapshot(object.writingContract)
    return hashWritingContract(contract) === object.writingContractHash
      && object.objectId === blueprintObject.id
      && object.layer === blueprintObject.layer
      && object.plannedPath === blueprintObject.plannedPath
      && contract.topicProfileKey === blueprintState.topicProfileKey
      && contract.topicProfileVersion === blueprintState.topicProfileVersion
      && canonicalJson(contract.worldStyle) === canonicalJson(blueprintState.worldStyleProfile)
      && contract.genreKey === blueprintObject.genreKey
      && contract.object.id === blueprintObject.id
      && contract.object.key === blueprintObject.key
      && contract.object.title === blueprintObject.title
      && contract.object.layer === blueprintObject.layer
      && contract.object.locator === blueprintObject.locator
  } catch {
    return false
  }
}

function markCompleted(object: WorldMaterializationObjectState, lastAcceptedAttemptId: string): WorldMaterializationObjectState {
  const { recoveryBodySha256: _recoveryBodySha256, attempt: _attempt, lastError: _lastError, block: _block, ...persisted } = object
  return { ...persisted, status: "completed", lastAcceptedAttemptId }
}

function canonicalJson(value: unknown) {
  return JSON.stringify(value)
}

function modelPostWriteExtraction(extraction: PostWriteExtraction) {
  return {
    facts: extraction.facts.map((fact) => ({ id: fact.id, text: fact.text })),
    relations: extraction.relations,
    contradictions: extraction.contradictions,
    lockedFactConflicts: extraction.lockedFactConflicts,
  }
}

function materializationError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前正文对象没有有效项目。", detail }
  if (detail.startsWith("growth_conflict")) return { code: "growth_conflict", message: "正文物化状态已变化或结果未知。", detail }
  return { code: "growth_invalid", message: "正文对象回执无效。", detail }
}
