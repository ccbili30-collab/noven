import { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, shell } from "electron"
import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { MACHINE_TRUST_WARNING, type ClineSessionRecord } from "@creatx/cline-adapter/contracts"
import { ART_LIBRARY_CORE_GUIDANCE, ArtLibraryService, createArtLibraryTools, materializeBundledArtAtlasSeed, requireReviewArtApprovalCommand } from "@creatx/art-library-runtime"
import { growthWorldProStagePolicy, installBuiltinCreativeSkills, isSlashCommandInput, normalizeCreativeSkillSequence, parseGrowthCommand, parseGrowthWorldCommand, parseGrowthWorldProCommand, resolveCreativeSlashCommand, WORKBENCH_CORE_GUIDANCE } from "@creatx/creative-skills"
import { GROWTH_WORLD_PRO_GOAL_PREFIX } from "@creatx/creative-skills/growth-goal-instruction"
import {
  CREATX_DESKTOP_API,
  CREATX_DESKTOP_EVENT,
  classifyRuntimeError,
  type ControlImageTaskCommand,
  type CreatXError,
  type CreatXEvent,
  type CreatXToolContribution,
  type BindArtChatSessionCommand,
  type CaptureWorkbenchAnnotationCommand,
  type CreativeLibraryKind,
  type DesktopBootstrapSelection,
  type DesktopResult,
  type GrowthGoalProjection,
  type ProjectSnapshot,
  type ResolveWorkbenchPresentationCommand,
  type SaveImageModelSettingsCommand,
  type SaveProjectTextCommand,
  type SaveTextModelProfileCommand,
  type SampleWorkbenchColorCommand,
  type SendMessageCommand,
  type SetCreativeLibraryReactionCommand,
  type SessionSummary,
  type RestartApplicationCommand,
} from "@creatx/contracts"
import { appendProjectRevisionContext, ProjectFileService } from "@creatx/project-files"
import { resolvePreloadPath } from "./preload-path.ts"
import { runBeforeDeadline } from "./shutdown-deadline.ts"
import { admitOwnerConversationTurn, assertOwnerConversationAvailable, completePersistedOwnerActivation, OwnerConversationMutationCoordinator, OwnerGrowthExecutionCoordinator, reuseOwnerActivation as reusePersistedOwnerActivation, settleOwnerReplyBeforeCancellation } from "./owner-growth-delivery.ts"
import { createGrowthOwnerControllerResult, GrowthGoalStore, GrowthIssueResolutionService, GrowthLifecycleController, GrowthProgressService, GrowthScheduler } from "@creatx/growth-runtime"
import { WorkbenchRegistryService } from "@creatx/workbench"
import { VISIBLE_PRODUCT_NAME } from "./product-brand.ts"
import { WorldBlueprintService, WorldEntryRecoveryService, WorldMaterializationCoordinator, WorldMaterializationService } from "@creatx/world-blueprint"
import { IMAGE_CORE_GUIDANCE, ImageAttachmentService, ImageRuntime } from "@creatx/image-runtime"
import { ImageTaskQueue, ImageTaskStore, promptUsesProjectVisualStyle } from "@creatx/image-runtime/queue"
import { UserModelSettingsStore } from "@creatx/model-settings"
import { AttachmentAuthorizationStore, type ResolvedAttachments } from "./attachments"
import { isReplaceableLegacyWorldGoal, resolveGrowthWorldEntry } from "./growth-world-entry.ts"
import { GrowthProjectionDispatcher } from "./growth-projection-dispatcher.ts"
import { reportableImageAttachmentFailures } from "./image-attachment-reconciliation.ts"
import { WorkbenchPreviewProtocol } from "./workbench-preview-protocol.ts"
import { CreativeLibraryStore } from "./creative-library-store.ts"
import { TimelineEventDispatcher } from "./timeline-event-dispatcher.ts"
import { configureSingleInstance } from "./single-instance.ts"
import { ConversationAttachmentProtocol } from "./conversation-attachment-protocol.ts"
import { waitForMessageAdmission } from "./message-admission.ts"
import { ClineRuntimeClient } from "./cline-runtime-client.ts"
import { captureWorkbenchRegion, type WorkbenchCaptureRect } from "./workbench-capture.ts"
import { ArtTurnSourceStore, withArtTurnSources } from "./art-turn-sources.ts"
import { ArtLibraryAssetProtocol } from "./art-library-asset-protocol.ts"
import { composeHeritageSkillRuntime, HERITAGE_SKILL_CORE_GUIDANCE, HeritageSkillService } from "./heritage-skill-service.ts"
import { ApplicationRestartCoordinator } from "./application-restart.ts"

protocol.registerSchemesAsPrivileged([
  { scheme: "creatx-workbench", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: "creatx-attachment", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: "creatx-art-library", privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

let mainWindow: BrowserWindow | undefined
const isPrimaryInstance = configureSingleInstance(app, () => mainWindow)
let adapter: ClineRuntimeClient | undefined
let currentProject: ProjectSnapshot | undefined
const projectFiles = new ProjectFileService({
  onContentChanged: (projectId) => sendEvent({ type: "project.projection.invalidated", projectId, areas: ["files", "workbenches"] }),
})
const workbenches = new WorkbenchRegistryService(projectFiles.queries, projectFiles.internal, {
  onChanged: (projectId) => sendEvent({ type: "project.projection.invalidated", projectId, areas: ["workbenches"] }),
  onPresentationRequested: (request) => {
    sendEvent({ type: "project.projection.invalidated", projectId: request.projectId, areas: ["workbenches"] })
    sendEvent({ type: "workbench.presentation.requested", projectId: request.projectId, sessionId: request.sessionId, workbenchId: request.workbenchId, entry: request.entry })
  },
})
const workbenchPreviewProtocol = new WorkbenchPreviewProtocol(projectFiles.queries)
const worldBlueprints = new WorldBlueprintService(projectFiles.queries, projectFiles.commands, projectFiles.internal, workbenches.commands, workbenches.queries)
const worldEntryRecovery = new WorldEntryRecoveryService(projectFiles.internal)
const attachments = new AttachmentAuthorizationStore()
const artTurnSources = new ArtTurnSourceStore()
const conversationAttachmentProtocol = new ConversationAttachmentProtocol(attachments, async (sessionId, messageId, attachmentIndex) => {
  if (!adapter) throw new Error("runtime_unavailable: Cline Adapter is not ready")
  return adapter.resolveMessageImage(sessionId, messageId, attachmentIndex)
})
let modelSettings: UserModelSettingsStore | undefined
let artLibrary: ArtLibraryService | undefined
const artLibraryAssetProtocol = new ArtLibraryAssetProtocol({
  readOriginal: (id) => {
    if (!artLibrary) throw new Error("runtime_unavailable: art library is not ready")
    return artLibrary.readOriginal(id)
  },
})
let imageTasks: ImageTaskStore | undefined
let imageQueue: ImageTaskQueue | undefined
let growthGoals: GrowthGoalStore | undefined
let growthScheduler: GrowthScheduler | undefined
let growthLifecycle: GrowthLifecycleController | undefined
let creativeLibraries: CreativeLibraryStore | undefined
let heritageSkills: HeritageSkillService | undefined
let worldMaterialization: WorldMaterializationService | undefined
const ownerGrowthExecutions = new OwnerGrowthExecutionCoordinator()
const ownerConversationMutations = new OwnerConversationMutationCoordinator()
const applicationRestart = new ApplicationRestartCoordinator({
  defer: (action) => setTimeout(action, 100),
  relaunch: () => app.relaunch(),
  quit: () => app.quit(),
})
let quitting = false
let acceptingGrowthEvents = true
const SHUTDOWN_DEADLINE_MS = 8_000

function sendRendererEvent(event: CreatXEvent) {
  const window = mainWindow
  if (window && !window.isDestroyed()) window.webContents.send(CREATX_DESKTOP_EVENT, event)
}

const timelineEventDispatcher = new TimelineEventDispatcher(sendRendererEvent)

function sendEvent(event: CreatXEvent) {
  if (event.type === "timeline.upsert") {
    timelineEventDispatcher.enqueue(event)
    return
  }
  if ("sessionId" in event && event.sessionId) timelineEventDispatcher.flushSession(event.sessionId)
  sendRendererEvent(event)
}

async function projectGrowthGoal(goal: GrowthGoalProjection) {
  const issues = growthGoals?.listVisibleIssues(goal.goalId) ?? []
  const progress = await worldMaterialization?.progress(goal.projectId, goal.goalId)
  return { ...goal, ...(progress ? { progress } : {}), ...(issues.length ? { issues } : {}) }
}

function sendGrowthGoal(goal: GrowthGoalProjection) {
  if (!acceptingGrowthEvents) return
  growthProjectionDispatcher.enqueue(goal)
}

const growthProjectionDispatcher = new GrowthProjectionDispatcher<GrowthGoalProjection>(async (goal) => {
    const current = growthGoals?.get(goal.goalId)
    if (!current || current.version < goal.version) return
    sendEvent({ type: "growth.goal.changed", goal: await projectGrowthGoal(current) })
}, (error) => sendEvent({ type: "runtime.error", error: classifyDesktopError(error) }))

async function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#f4f2ed",
    title: VISIBLE_PRODUCT_NAME,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.once("ready-to-show", () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(__dirname, "../renderer/index.html"))
}

async function initializeRuntime() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("model_settings_persistence: secure credential storage is unavailable")
  modelSettings = new UserModelSettingsStore(join(app.getPath("userData"), "creatx", "models.json"), {
    encrypt: (value) => safeStorage.encryptString(value).toString("base64"),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
  })
  creativeLibraries = new CreativeLibraryStore(join(app.getPath("userData"), "creatx", "creative-libraries.json"))
  heritageSkills = new HeritageSkillService({ root: join(app.getPath("userData"), "creatx", "learned-skills", "v1") })
  growthGoals = new GrowthGoalStore(join(app.getPath("userData"), "creatx", "growth.sqlite"), {
    onChanged: sendGrowthGoal,
  })
  const creativeSkills = await installBuiltinCreativeSkills(app.getPath("userData"))
  const runtimeSkills = composeHeritageSkillRuntime(creativeSkills, await heritageSkills.installed())
  const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim()
  const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim()
  if (!modelSettings.snapshot().textProfiles.length) {
    modelSettings.saveTextProfile({
      name: process.env.CREATX_MODEL_NAME?.trim() || process.env.CREATX_MODEL_ID?.trim() || "DeepSeek",
      providerId: process.env.CREATX_PROVIDER_ID?.trim() || "deepseek",
      modelId: process.env.CREATX_MODEL_ID?.trim() || "deepseek-chat",
      ...(providerBaseUrl ? { baseUrl: providerBaseUrl } : {}),
      ...(providerApiKey ? { apiKey: providerApiKey } : {}),
    })
  }
  if (!modelSettings.snapshot().image.configured && process.env.CREATX_IMAGE_BASE_URL?.trim() && process.env.CREATX_IMAGE_API_KEY?.trim()) {
    modelSettings.saveImageSettings({
      baseUrl: process.env.CREATX_IMAGE_BASE_URL,
      apiKey: process.env.CREATX_IMAGE_API_KEY,
      defaultModel: "gpt-image-2-cheap",
    })
  }
  const selectedTextConnection = modelSettings.resolveSelectedTextConnection()
  if (!selectedTextConnection) throw new Error("model_settings_persistence: no selected text model profile exists")
  artLibrary = new ArtLibraryService({ root: join(app.getPath("userData"), "creatx", "art-library"), onChanged: (revision) => sendEvent({ type: "art_library.changed", revision }) })
  await artLibrary.initialize()
  const artLibrarySeed = await materializeBundledArtAtlasSeed(artLibrary, [
    join(__dirname, "../renderer/art-library"),
    join(app.getAppPath(), "apps", "art-library", "public", "art-library"),
    join(process.cwd(), "apps", "art-library", "public", "art-library"),
  ])
  console.info(`[art_library_seed] ${artLibrarySeed.status} approved=${artLibrarySeed.approved} moved=${artLibrarySeed.moved}`)
  const imageRuntime = new ImageRuntime({
    resolveConnection: () => modelSettings?.resolveImageConnection(),
    fileQueries: projectFiles.queries,
    fileCommands: projectFiles.commands,
  })
  const imageAttachments = new ImageAttachmentService(projectFiles.queries, projectFiles.commands)
  imageTasks = new ImageTaskStore(join(app.getPath("userData"), "creatx", "image-queue.sqlite"))
  imageQueue = new ImageTaskQueue(imageTasks, imageRuntime, {
    onEvent: sendEvent,
    defaultModel: () => modelSettings?.snapshot().image.defaultModel ?? "gpt-image-2-cheap",
    visualStyleSource: projectFiles.queries,
    attachments: imageAttachments,
    onWarning: (warning) => console.warn(`[${warning.code}] ${warning.projectId} ${warning.relativePath}`),
  })
  const growthStagePolicy = {
    beforeStage: (goal: GrowthGoalProjection, completedReports: number) => growthWorldProStagePolicy(goal.instruction, completedReports, goal.workRootPath, goal.worldEntryStage, goal.worldEntryMode),
  }
  const growthProgress = new GrowthProgressService(growthGoals, {
    artifactExists: async (projectId, relativePath) => (await projectFiles.queries.refreshProject(projectId)).files.some((file) => file.relativePath === relativePath.replaceAll("\\", "/")),
    artifactText: async (projectId, relativePath) => {
      const normalized = relativePath.replaceAll("\\", "/")
      const file = (await projectFiles.queries.refreshProject(projectId)).files.find((candidate) => candidate.relativePath === normalized)
      if (!file || (file.kind !== "markdown" && file.kind !== "text")) return undefined
      return (await projectFiles.queries.readFile(projectId, file.id)).content
    },
    registeredWorkbenchFolders: async (projectId) => (await workbenches.queries.snapshot(projectId)).workbenches.filter((workbench) => workbench.state === "ready").map((workbench) => workbench.folder),
    trustedStageArtifacts: async (projectId, goalId, source, workRootPath) => {
      if (source !== "world-blueprint") throw new Error(`growth_invalid: unsupported trusted artifact source ${String(source)}`)
      return worldBlueprints.progressEvidence(projectId, goalId, workRootPath)
    },
    imageTaskEvidence: async (projectId, imageTaskId) => imageTasks?.imageTaskEvidence(projectId, imageTaskId),
  }, growthStagePolicy)
  worldMaterialization = new WorldMaterializationService(
    projectFiles.queries,
    projectFiles.internal,
    async (projectId, imageTaskId) => {
      const task = imageTasks?.get(imageTaskId)
      if (!task || task.projectId !== projectId) return undefined
      return {
        status: task.status,
        relativePath: task.relativePath,
        visualStyleApplied: promptUsesProjectVisualStyle(task.prompt),
        ...(task.errorCode ? { errorCode: task.errorCode } : {}),
        ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
        ...(task.attachment ? { attachment: {
          documentPath: task.attachment.documentPath,
          status: task.attachment.status,
          ...(task.attachment.errorCode ? { errorCode: task.attachment.errorCode } : {}),
          ...(task.attachment.errorMessage ? { errorMessage: task.attachment.errorMessage } : {}),
        } } : {}),
      }
    },
    (goalId) => growthGoals?.get(goalId),
    async (projectId, idempotencyKey) => {
      const task = imageTasks?.findProjectByIdempotency(projectId, idempotencyKey)
      return task ? { imageTaskId: task.imageTaskId, status: task.status, relativePath: task.relativePath } : undefined
    },
    (goalId) => {
      const goal = growthGoals?.get(goalId)
      if (goal) sendGrowthGoal(goal)
    },
    (binding) => imageQueue!.reconcileAttachmentIntent(binding.projectId, binding.imageTaskId, {
      documentPath: binding.documentPath,
      alt: binding.alt,
      placement: binding.placement,
      anchor: binding.anchor,
    }),
    async (projectId, goalId) => imageTasks?.listGrowthGoal(projectId, goalId).map(({ task, source }) => ({
      imageTaskId: task.imageTaskId,
      status: task.status,
      relativePath: task.relativePath,
      visualStyleApplied: promptUsesProjectVisualStyle(task.prompt),
      ...(task.errorCode ? { errorCode: task.errorCode } : {}),
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
      ...(source.growthWorkItemId ? { growthWorkItemId: source.growthWorkItemId } : {}),
      ...(source.growthAttemptId ? { growthAttemptId: source.growthAttemptId } : {}),
      ...(task.attachment ? { attachment: {
        documentPath: task.attachment.documentPath,
        status: task.attachment.status,
        ...(task.attachment.errorCode ? { errorCode: task.attachment.errorCode } : {}),
        ...(task.attachment.errorMessage ? { errorMessage: task.attachment.errorMessage } : {}),
      } } : {}),
    })) ?? [],
    (goalId) => growthGoals?.listIssues(goalId) ?? [],
  )
  const growthIssueResolution = new GrowthIssueResolutionService(growthGoals, {
    prepare: async (issue, goal, resolution) => {
      if (resolution.action === "bypass") return
      if (!issue.workItemId || !goal.workRootPath) throw new Error("growth_conflict: blocking materialization issue has no recoverable object identity")
      await worldMaterialization!.resolveBlockedObject(goal.projectId, goal.goalId, goal.workRootPath, issue.workItemId, resolution.action, resolution.summary)
    },
    resumed: (goal, ownerActivationId) => growthScheduler!.run(goal.goalId, ownerActivationId),
  })
  const textConnections = modelSettings.snapshot().textProfiles.flatMap((profile) => {
    const connection = modelSettings!.resolveTextConnection(profile.id)
    return connection ? [connection] : []
  })
  adapter = await ClineRuntimeClient.create({
    entryPath: join(__dirname, "cline-runtime.js"),
    userDataDir: app.getPath("userData"),
    dataDir: join(app.getPath("userData"), "cline"),
    permissionStorePath: join(app.getPath("userData"), "creatx", "session.sqlite"),
    defaultConnection: selectedTextConnection,
    connections: textConnections,
    tools: [workbenches.tool(), workbenches.renameTool(), workbenches.unregisterTool(), workbenches.setHomeTool(), workbenches.setVisibilityTool(), workbenches.showTool(), worldBlueprints.tool(), worldMaterialization.tool(), growthProgress.tool(), growthController(), growthIssueResolution.tool(), imageRuntime.tool(), imageRuntime.editTool(), imageQueue.tool(), imageQueue.managementTool(), imageAttachments.tool(), ...heritageSkills.tools(), ...createArtLibraryTools(artLibrary, { projectFiles: projectFiles.queries, turnImages: artTurnSources })],
    systemGuidance: [WORKBENCH_CORE_GUIDANCE, IMAGE_CORE_GUIDANCE, ART_LIBRARY_CORE_GUIDANCE, HERITAGE_SKILL_CORE_GUIDANCE],
    skillDirectories: runtimeSkills.skillDirectories,
    skills: runtimeSkills.skills,
    workerSkills: creativeSkills.workerSkills,
    imageTaskStatus: (projectId, imageTaskId) => imageTasks!.imageTaskStatus(projectId, imageTaskId),
    onEvent: sendEvent,
  })
  for (const record of await adapter.listSessions()) projectFiles.rememberProjectRoot(record.projectRoot)
  const openActivations = growthGoals.listOpenOwnerActivations().sort((left, right) => Number(!left.deliverySourceActivationId) - Number(!right.deliverySourceActivationId))
  for (const snapshot of openActivations) {
    const activation = growthGoals.getOwnerActivation(snapshot.activationId)
    if (!activation || activation.status === "completed" || activation.status === "failed" || activation.status === "cancelled") continue
    try {
      if (await completePersistedOwnerActivation(growthGoals, adapter, activation)) continue
    } catch (error) {
      if (growthGoals.getOwnerActivation(activation.activationId)?.status === "failed") continue
      throw error
    }
    if (activation.status === "result_ready") {
      if (!await adapter.hasPersistedOwnerControllerResult(activation.sessionId, activation.activationId, activation.controllerToolName)) {
        growthGoals.failOwnerResultEvidence({
          activationId: activation.activationId,
          reason: "应用中断前未形成与 Owner Activation 匹配的可信 Tool Result。",
        })
      }
      continue
    }
    growthGoals.failOwnerActivation({
      activationId: activation.activationId,
      reason: activation.deliverySourceActivationId
        ? "应用中断了尚未形成持久回复的 Owner 结果交付回合。"
        : "应用中断了尚未形成可信 Tool Result 的 Owner 控制回合。",
    })
  }
  const worldMaterializationCoordinator = new WorldMaterializationCoordinator(worldMaterialization, adapter, growthProgress, growthGoals, growthGoals)
  growthScheduler = new GrowthScheduler(growthGoals, adapter, {
    fingerprint: async (goal) => growthFingerprint(goal),
    requiredImageStatuses: async (goal) => goal.requiredImageTaskIds.map((imageTaskId) => {
      const task = imageTasks?.get(imageTaskId)
      if (!task || task.projectId !== goal.projectId) return { imageTaskId, status: "unknown" as const }
      return {
        imageTaskId,
        status: task.status,
        relativePath: task.relativePath,
        ...(task.errorCode ? { errorCode: task.errorCode } : {}),
      }
    }),
  }, growthStagePolicy, worldMaterializationCoordinator)
  growthLifecycle = new GrowthLifecycleController(growthGoals, growthScheduler, {
    steer: (sessionId, prompt) => adapter!.steer(sessionId, prompt),
    abort: (sessionId, reason) => adapter!.abortRun(sessionId, reason),
  })
  growthLifecycle.recoverInterrupted()
  imageQueue?.start()
}

async function growthFingerprint(goal: GrowthGoalProjection) {
  const project = await projectFiles.queries.refreshProject(goal.projectId)
  const images = imageTasks?.listProject(goal.projectId) ?? []
  return createHash("sha256").update(JSON.stringify({
    planFileId: goal.planFileId ?? null,
    files: project.files.map((file) => [file.id, file.modifiedAt, file.size]),
    images: images.map((task) => [task.imageTaskId, task.status, task.updatedAt]),
  })).digest("hex")
}

function success<T>(value: T): DesktopResult<T> {
  return { ok: true, value }
}

function failure(error: unknown): DesktopResult<never> {
  const classified = classifyDesktopError(error)
  return { ok: false, error: classified }
}

function classifyDesktopError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("package_job_cancelled")) return { code: "package_cancelled", message: "项目包任务已取消。", detail }
  if (detail.startsWith("package_version_unsupported")) return { code: "package_version_unsupported", message: "这个项目包版本尚不受支持。", detail }
  if (detail.startsWith("package_job_conflict") || detail.startsWith("package_import_conflict") || detail.startsWith("package_destination_conflict") || detail.startsWith("package_identity_conflict") || detail.startsWith("project_catalog_conflict")) return { code: "package_conflict", message: "项目包与当前任务或已有项目发生冲突。", detail }
  if (detail.startsWith("package_persistence") || detail.startsWith("project_catalog_persistence")) return { code: "package_persistence", message: "项目包状态无法安全保存。", detail }
  if (detail.startsWith("package_") || detail.startsWith("project_catalog_")) return { code: "package_invalid", message: "项目包、保存位置或导入参数无效。", detail }
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "无法打开这个项目目录。", detail }
  if (detail.startsWith("file_invalid")) return { code: "file_invalid", message: "这个文件不属于当前项目或已不存在。", detail }
  if (detail.startsWith("file_conflict")) return { code: "file_conflict", message: "文件已在外部发生变化，请刷新后重试。", detail }
  if (detail.startsWith("workbench_conflict")) return { code: "workbench_conflict", message: "工作台记录与现有状态冲突。", detail }
  if (detail.startsWith("workbench_invalid")) return { code: "workbench_invalid", message: "工作台信息无效。", detail }
  if (detail.startsWith("session_missing")) return { code: "session_missing", message: "会话不存在或已经结束。", detail }
  if (detail.startsWith("command_invalid")) return { code: "command_invalid", message: "无法识别这个斜杠命令，请从命令列表中选择。", detail }
  if (detail.startsWith("growth_invalid")) return { code: "growth_invalid", message: "Growth 目标或操作无效。", detail }
  if (detail.startsWith("growth_conflict")) return { code: "growth_conflict", message: "Growth 当前状态不允许这个操作。", detail }
  if (detail.startsWith("growth_persistence")) return { code: "growth_persistence", message: "Growth 状态无法安全保存。", detail }
  if (detail.startsWith("world_entry_invalid")) return { code: "growth_invalid", message: "已有世界的恢复记录不完整，尚未启动模型或改写作品。", detail }
  if (detail.startsWith("world_entry_conflict")) return { code: "growth_conflict", message: "无法唯一确认要接管的世界，尚未启动模型或改写作品。", detail }
  return classifyRuntimeError(error)
}

async function loadProject(root: string) {
  const project = await projectFiles.openProject(root)
  scheduleProjectImageReconciliation(project.id)
  return project
}

async function reconcileProjectImageAttachments(projectId: string) {
  if (!worldMaterialization) return
  const worlds = await worldEntryRecovery.inspectAuthoritativeWorlds(projectId)
  for (const world of worlds.filter((candidate) => candidate.materializationObjectCount > 0)) {
    try {
      const result = await worldMaterialization.reconcileImageAttachments(projectId, world.goalId, world.root)
      reportableImageAttachmentFailures(result.failed)
        .forEach((failure) => sendEvent({ type: "runtime.error", error: classifyDesktopError(new Error(`${failure.error}: ${failure.imageTaskId} -> ${failure.artifactPath}`)) }))
    } catch (error) {
      sendEvent({ type: "runtime.error", error: classifyDesktopError(error) })
    }
  }
}

function scheduleProjectImageReconciliation(projectId: string) {
  void reconcileProjectImageAttachments(projectId).catch((error) => sendEvent({ type: "runtime.error", error: classifyDesktopError(error) }))
}

function toSessionSummary(record: ClineSessionRecord): SessionSummary {
  return {
    id: record.id,
    title: record.title,
    projectId: projectFiles.rememberProjectRoot(record.projectRoot),
    displayPath: record.projectRoot,
    status: record.status,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    providerId: record.providerId,
    modelId: record.modelId,
    kind: record.kind,
    permission: {
      mode: record.permissionMode,
      projectTools: record.kind === "project",
      trustWarning: MACHINE_TRUST_WARNING,
    },
  }
}

function userAttachmentCount(attachments: ResolvedAttachments) {
  return attachments.userFiles.length + attachments.userImages.length
}

function emptyUserAttachments(): ResolvedAttachments {
  return { userFiles: [], userImages: [], imageSnapshots: [] }
}

async function sendPrompt(command: SendMessageCommand, userAttachments: ResolvedAttachments, onAdmitted?: () => void) {
  const sessionId = command.sessionId
  const skillSequence = normalizeCreativeSkillSequence(command.skillSequence)
  if (skillSequence.length && isSlashCommandInput(command.prompt)) throw new Error("skill_sequence_invalid: Skill sequences require one ordinary user request, not a slash command")
  const prompt = requireKnownSlashCommand(command.prompt)
  const growthWorldPro = parseGrowthWorldProCommand(prompt)
  const growthWorld = parseGrowthWorldCommand(prompt)
  const growth = growthWorldPro ?? growthWorld ?? parseGrowthCommand(prompt)
  if (!growth) {
    const record = (await adapter!.listSessions()).find((session) => session.id === sessionId)
    if (!record) throw new Error("session_missing: Cline history does not contain this session")
    const projectId = record.kind === "project" ? projectFiles.rememberProjectRoot(record.projectRoot) : undefined
    const priorActivation = growthGoals!.getOwnerActivation(`activation_${command.requestId}`)
    if (priorActivation) {
      if (!projectId
        || priorActivation.sessionId !== sessionId
        || priorActivation.projectId !== projectId
        || priorActivation.promptHash !== createHash("sha256").update(prompt).digest("hex")
        || priorActivation.instruction !== prompt) {
        throw new Error("growth_conflict: requestId was already used for different Owner input")
      }
      await executeExistingOwnerActivation(priorActivation)
      return
    }
    const revisionContext = projectId ? await projectFiles.projectRevisionContext(projectId) : undefined
    const pendingOwnerReply = projectId ? growthGoals!.findOwnerReplyPendingGoal(projectId, sessionId) : undefined
    if (pendingOwnerReply) assertOwnerConversationAvailable(growthGoals!, pendingOwnerReply)
    const existing = projectId ? growthGoals!.findUnterminated(projectId) : undefined
    if (skillSequence.length && existing) throw new Error("skill_sequence_conflict: finish or cancel the current Growth Goal before starting a Skill sequence")
    const waitingIssue = existing?.status === "waiting" && existing.sessionId === sessionId ? growthGoals!.getWaitingIssue(existing.goalId) : undefined
    const issueContext = waitingIssue
      ? `当前项目有一个阻塞 Growth 问题。问题：${waitingIssue.summary}\n错误码：${waitingIssue.errorCode}\n受影响对象：${waitingIssue.affectedObjectIds.join("、")}\n用户这句话是对该问题的补充。你拥有四种恢复选择：retry 按原方案重试，repair 修改当前分配产物后重试，accept 接受已有产物并重建未完成回执，bypass 如实记录缺失并绕过受影响对象继续。若信息足够，先说明选择及影响，再调用 resolve_growth_issue；若仍不足，不要调用工具，只追问缺失的一个关键信息。不得要求用户再点击继续。`
      : undefined
    const ownerPrompt = appendProjectRevisionContext(prompt, [revisionContext, issueContext].filter(Boolean).join("\n\n") || undefined)
    if (waitingIssue) {
      if (userAttachmentCount(userAttachments)) throw new Error("attachment_invalid: Growth issue recovery does not yet support ephemeral attachments")
      if (record.kind !== "project" || !projectId || !existing) throw new Error("growth_invalid: Growth issue recovery requires a project Goal")
      const activation = await ownerConversationMutations.run(async () => {
        ownerConversationMutations.assertSessionIdle(sessionId)
        const currentRecord = (await adapter!.listSessions()).find((session) => session.id === sessionId)
        if (!currentRecord || currentRecord.kind !== "project" || projectFiles.rememberProjectRoot(currentRecord.projectRoot) !== projectId) {
          throw new Error("session_missing: Cline history was deleted before Owner activation admission")
        }
        return growthGoals!.createOwnerActivation({
          activationId: `activation_${command.requestId}`,
          kind: "issue",
          sessionId,
          projectId,
          goalId: existing.goalId,
          promptHash: createHash("sha256").update(prompt).digest("hex"),
          instruction: prompt,
          controllerToolName: "resolve_growth_issue",
        })
      })
      return executeOwnerActivation(activation, async (signal) => {
        try {
          return await adapter!.sendGrowthIssueMessage(sessionId, ownerPrompt, activation.activationId, onAdmitted, async (reply, controllerCallCount, controllerResult) => {
            if (controllerCallCount === 0) {
              growthGoals!.completeOwnerActivationWithoutController({ activationId: activation.activationId, reply })
              return
            }
            if (controllerResult === "error") {
              growthGoals!.failOwnerActivation({ activationId: activation.activationId, reason: "Owner 问题控制器未形成可信结果；错误已由同一对话回合说明。" })
              return
            }
            completeOwnerActivationAndCleanup(activation.activationId, reply)
          }, signal)
        } catch (error) {
          failOpenOwnerActivation(activation.activationId, error)
          throw error
        }
      })
    }
    return admitOwnerConversationTurn(ownerConversationMutations, sessionId, async (onTurnAdmitted) => {
      const currentRecord = (await adapter!.listSessions()).find((session) => session.id === sessionId)
      if (!currentRecord) throw new Error("session_missing: Cline history was deleted before Owner message admission")
      const currentProjectId = currentRecord.kind === "project" ? projectFiles.rememberProjectRoot(currentRecord.projectRoot) : undefined
      if (currentProjectId) {
        const currentGoal = growthGoals!.findUnterminated(currentProjectId)
        if (currentGoal?.sessionId === sessionId) assertOwnerConversationAvailable(growthGoals!, currentGoal)
        if (growthGoals!.findOpenOwnerActivationForSession(sessionId)) {
          throw new Error("growth_conflict: an Owner Growth turn must finish admission before ordinary conversation continues")
        }
      }
      const modelAttachments = { userFiles: userAttachments.userFiles, userImages: userAttachments.userImages }
      const send = skillSequence.length
        ? adapter!.sendSkillSequence(sessionId, ownerPrompt, skillSequence, modelAttachments, () => {
            onAdmitted?.()
            onTurnAdmitted()
          })
        : adapter!.sendMessage(sessionId, ownerPrompt, modelAttachments, () => {
            onAdmitted?.()
            onTurnAdmitted()
          })
      return send
    })
  }
  if (userAttachmentCount(userAttachments)) throw new Error("attachment_invalid: Growth does not yet support ephemeral attachments")
  const record = (await adapter!.listSessions()).find((session) => session.id === sessionId)
  if (!record || record.kind !== "project") throw new Error("growth_invalid: Growth requires a project session")
  const route = growthWorldPro ? "growth-world-pro" : growthWorld ? "growth-world" : "growth"
  const projectId = projectFiles.rememberProjectRoot(record.projectRoot)
  const activeGoal = growthGoals!.findUnterminated(projectId)
  if (activeGoal?.sessionId === sessionId && activeGoal.status === "active" && !activeGoal.ownerReplyPending) {
    const steered = await growthLifecycle!.steerWithDelivery(activeGoal.goalId, prompt)
    if (steered.deliveredToActiveRun) {
      onAdmitted?.()
      return
    }
  }
  const activation = await ownerConversationMutations.run(async () => {
    ownerConversationMutations.assertSessionIdle(sessionId)
    const currentRecord = (await adapter!.listSessions()).find((session) => session.id === sessionId)
    if (!currentRecord || currentRecord.kind !== "project" || projectFiles.rememberProjectRoot(currentRecord.projectRoot) !== projectId) {
      throw new Error("session_missing: Cline history was deleted before Owner activation admission")
    }
    const currentGoal = growthGoals!.findUnterminated(projectId)
    return growthGoals!.createOwnerActivation({
      activationId: `activation_${command.requestId}`,
      kind: "start",
      route,
      sessionId,
      projectId,
      ...(currentGoal ? { goalId: currentGoal.goalId } : {}),
      promptHash: createHash("sha256").update(prompt).digest("hex"),
      instruction: prompt,
      controllerToolName: "run_growth",
    })
  })
  return executeOwnerActivation(activation, async (signal) => {
    try {
      return await adapter!.sendGrowthMessage(sessionId, prompt, activation.activationId, onAdmitted, async (reply, controllerResult) => {
        if (controllerResult === "error") {
          growthGoals!.failOwnerActivation({ activationId: activation.activationId, reason: "Owner 控制器未形成可信结果；错误已由同一对话回合说明。" })
          return
        }
        completeOwnerActivationAndCleanup(activation.activationId, reply)
      }, signal)
    } catch (error) {
      failOpenOwnerActivation(activation.activationId, error)
      throw error
    }
  })
}

async function executeOwnerActivation<T>(activation: NonNullable<ReturnType<GrowthGoalStore["getOwnerActivation"]>>, execute: (signal: AbortSignal) => Promise<T>) {
  return ownerGrowthExecutions.run(activation.activationId, async (signal) => {
    signal.throwIfAborted()
    if (await reusePersistedOwnerActivation(growthGoals!, adapter!, growthGoals!.getOwnerActivation(activation.activationId) ?? activation, signal, scheduleGrowthWorkerCleanup)) return undefined
    signal.throwIfAborted()
    return execute(signal)
  })
}

async function executeExistingOwnerActivation(activation: NonNullable<ReturnType<GrowthGoalStore["getOwnerActivation"]>>) {
  return ownerGrowthExecutions.run(activation.activationId, async (signal) => {
    try {
      signal.throwIfAborted()
      if (!await reusePersistedOwnerActivation(growthGoals!, adapter!, growthGoals!.getOwnerActivation(activation.activationId) ?? activation, signal, scheduleGrowthWorkerCleanup)) {
        throw new Error("growth_persistence: persisted Owner activation has no recoverable execution")
      }
    } catch (error) {
      failOpenOwnerActivation(activation.activationId, error)
      throw error
    }
  })
}

function growthController(): CreatXToolContribution {
  return {
    name: "run_growth",
    description: "Execute the explicit CreatX Growth command from this Owner turn, wait for its trusted terminal state, and return structured evidence for the final user report. Call exactly once.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    audiences: ["owner-growth"],
    scope: "project",
    approval: "automatic",
    execute: async (_input, context) => {
      try {
        if (!context.ownerActivationId || !context.toolCallId) throw new Error("growth_invalid: trusted Owner activation identity is missing")
        const claimed = growthGoals!.claimOwnerActivation({ activationId: context.ownerActivationId, sessionId: context.sessionId, toolName: "run_growth", toolCallId: context.toolCallId })
        if (claimed.duplicate) {
          if (!claimed.activation.result) throw new Error("growth_conflict: duplicate Growth controller call has no persisted result")
          return { ok: true, value: claimed.activation.result }
        }
        const activation = claimed.activation
        if (activation.kind === "resume" && (!activation.goalId || activation.instruction !== activation.goalId)) {
          throw new Error("growth_persistence: Resume activation is not prebound to its Goal")
        }
        if (activation.goalId) growthGoals!.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: context.toolCallId, goalId: activation.goalId })
        const prepared = activation.kind === "resume"
          ? { goal: await prepareGrowthResume(activation.goalId!), acceptedDirection: false }
          : await prepareGrowthCommand(context.sessionId, activation.instruction ?? "", activation.activationId, context.toolCallId)
        const bound = growthGoals!.getOwnerActivation(activation.activationId)
        if (bound?.goalId !== prepared.goal.goalId) throw new Error("growth_persistence: Owner activation was not atomically bound to the prepared Goal")
        const goal = prepared.acceptedDirection || prepared.goal.ownerReplyPending
          ? prepared.goal
          : await growthScheduler!.run(prepared.goal.goalId, activation.activationId, context.signal)
        const ownerSummary = goal.ownerReplyPending && goal.workRootPath && goal.instruction.startsWith(GROWTH_WORLD_PRO_GOAL_PREFIX)
          ? (await worldMaterialization!.finalSummary(goal.projectId, goal.goalId, goal.workRootPath)).summary
          : undefined
        const result = createGrowthOwnerControllerResult(activation.activationId, goal, ownerSummary)
        growthGoals!.recordOwnerActivationResult({ activationId: activation.activationId, toolCallId: context.toolCallId, result })
        return { ok: true, value: result }
      } catch (error) {
        return { ok: false, error: classifyRuntimeError(error) }
      }
    },
  }
}

async function prepareGrowthCommand(sessionId: string, prompt: string, requestId: string, toolCallId: string) {
  const growthWorldPro = parseGrowthWorldProCommand(prompt)
  const growthWorld = parseGrowthWorldCommand(prompt)
  const growth = growthWorldPro ?? growthWorld ?? parseGrowthCommand(prompt)
  if (!growth) throw new Error("growth_invalid: explicit Growth command could not be parsed")
  const record = (await adapter!.listSessions()).find((session) => session.id === sessionId)
  if (!record) throw new Error("session_missing: Cline history does not contain this session")
  if (record.kind !== "project") throw new Error("growth_invalid: Growth requires a project session")
  if (record.permissionMode !== "free") throw new Error("growth_conflict: Growth requires free session permission")
  const projectId = projectFiles.rememberProjectRoot(record.projectRoot)
  const existing = growthGoals!.findUnterminated(projectId)
  const worlds = growthWorldPro ? await worldEntryRecovery.inspectAuthoritativeWorlds(projectId) : []
  const ownerGoal = worlds.length === 1 ? growthGoals!.get(worlds[0]!.goalId) : undefined
  const replaceLegacyGoal = Boolean(growthWorldPro && existing && isReplaceableLegacyWorldGoal({
    current: existing,
    worlds,
    ...(ownerGoal ? { ownerGoal } : {}),
  }))
  if (existing && !replaceLegacyGoal) {
    if (existing.sessionId !== sessionId) throw new Error("growth_conflict: the project already has a Growth Goal in another session")
    if (existing.status !== "active") throw new Error(`growth_conflict: ${existing.status} Goal must be continued before it can accept a new direction`)
    growthGoals!.bindOwnerActivationGoal({ activationId: requestId, toolCallId, goalId: existing.goalId })
    growthGoals!.recordLatestSteer(existing.goalId, growthWorldPro?.goalInstruction ?? growthWorld?.goalInstruction ?? growth.instruction)
    return { goal: existing, acceptedDirection: false }
  }
  if (growthWorldPro) {
    return { goal: await startGrowthWorldProGoal(projectId, sessionId, growthWorldPro.goalInstruction, worlds, ownerGoal, requestId, {
      activationId: requestId,
      toolCallId,
      ...(replaceLegacyGoal && existing ? { replaceGoalId: existing.goalId } : {}),
    }), acceptedDirection: false }
  }
  return { goal: growthGoals!.createAndBindStartGoal({
    activationId: requestId,
    toolCallId,
    goal: {
      requestId,
      projectId,
      sessionId,
      instruction: growthWorld?.goalInstruction ?? growth.instruction,
    },
  }), acceptedDirection: false }
}

async function prepareGrowthResume(goalId: string) {
  const current = growthGoals!.get(goalId)
  if (!current) throw new Error("growth_invalid: Goal does not exist")
  if (current.ownerReplyPending) return current
  if (current.status !== "paused" && current.status !== "waiting") throw new Error(`growth_conflict: ${current.status} Goal cannot be resumed`)
  if (current.instruction.startsWith(GROWTH_WORLD_PRO_GOAL_PREFIX)) {
    const worlds = await worldEntryRecovery.inspectAuthoritativeWorlds(current.projectId)
    if (current.worldEntryMode === "continue" && current.predecessorGoalId && current.workRootPath && current.worldEntryStage) {
      const adopted = await worldEntryRecovery.adoptSuccessor({
        projectId: current.projectId,
        predecessorGoalId: current.predecessorGoalId,
        successorGoalId: current.goalId,
        successorGoalVersion: 1,
        root: current.workRootPath,
      })
      const expectedStage = adopted.blueprintStatus === "draft" ? "blueprint-create" : adopted.blueprintStatus === "review" ? "blueprint-review" : "materialization"
      if (expectedStage !== current.worldEntryStage) throw new Error("world_entry_conflict: persisted successor stage disagrees with the adopted blueprint")
    }
  }
  return growthGoals!.transition({ goalId: current.goalId, expectedVersion: current.version, status: "active" })
}

function failOpenOwnerActivation(activationId: string, error: unknown) {
  if (classifyRuntimeError(error).code === "cancelled") return
  const activation = growthGoals?.getOwnerActivation(activationId)
  if (!activation || activation.status === "completed" || activation.status === "cancelled" || activation.status === "failed" || activation.status === "result_ready") return
  growthGoals!.failOwnerActivation({ activationId, reason: error instanceof Error ? error.message : String(error) })
}

function completeOwnerActivationAndCleanup(activationId: string, reply: string) {
  const completed = growthGoals!.completeOwnerActivation({ activationId, reply })
  scheduleGrowthWorkerCleanup(completed.goal)
  return completed
}

function scheduleGrowthWorkerCleanup(goal: GrowthGoalProjection) {
  if (goal.status !== "completed" && goal.status !== "cancelled" && goal.status !== "failed") return
  void adapter!.cleanupGrowthWorkers(goal.sessionId, goal.goalId).catch(() => undefined)
}

async function startGrowthWorldProGoal(projectId: string, sessionId: string, instruction: string, worldsInput: Awaited<ReturnType<WorldEntryRecoveryService["inspectAuthoritativeWorlds"]>>, ownerGoalInput: GrowthGoalProjection | undefined, requestId: string, binding: { activationId: string; toolCallId: string; replaceGoalId?: string }) {
  const entry = await resolveGrowthWorldProEntry(projectId, worldsInput, ownerGoalInput)
  const command = {
    requestId,
    projectId,
    sessionId,
    instruction,
    worldEntryMode: entry.mode,
    worldEntryStage: entry.stage,
    ...(entry.workRootPath ? { workRootPath: entry.workRootPath } : {}),
    ...(entry.predecessorGoalId ? { predecessorGoalId: entry.predecessorGoalId } : {}),
  }
  const goal = growthGoals!.createAndBindStartGoal({ activationId: binding.activationId, toolCallId: binding.toolCallId, goal: command, ...(binding.replaceGoalId ? { replaceGoalId: binding.replaceGoalId } : {}) })
  if (entry.mode === "continue") {
    try {
      const adopted = await worldEntryRecovery.adoptSuccessor({
        projectId,
        predecessorGoalId: entry.predecessorGoalId!,
        successorGoalId: goal.goalId,
        successorGoalVersion: goal.version,
        root: entry.workRootPath!,
      })
      const expectedStage = adopted.blueprintStatus === "draft" ? "blueprint-create" : adopted.blueprintStatus === "review" ? "blueprint-review" : "materialization"
      if (expectedStage !== entry.stage) throw new Error("world_entry_conflict: adopted blueprint phase changed during successor creation")
    } catch (error) {
      growthGoals!.transition({
        goalId: goal.goalId,
        expectedVersion: goal.version,
        status: "waiting",
        reason: "已有世界状态交接失败，尚未启动模型或写入作品文件。",
      })
      throw error
    }
  }
  return goal
}

async function resolveGrowthWorldProEntry(projectId: string, worldsInput?: Awaited<ReturnType<WorldEntryRecoveryService["inspectAuthoritativeWorlds"]>>, ownerGoalInput?: GrowthGoalProjection) {
  const worlds = worldsInput ?? await worldEntryRecovery.inspectAuthoritativeWorlds(projectId)
  const project = await projectFiles.queries.refreshProject(projectId)
  const ownerGoal = ownerGoalInput ?? (worlds.length === 1 ? growthGoals!.get(worlds[0]!.goalId) : undefined)
  return resolveGrowthWorldEntry({
    projectId,
    worlds,
    hasProjectContent: project.files.length > 0,
    ...(ownerGoal ? { ownerGoal } : {}),
  })
}

async function legacyWorldProReplacementPrompt(current: GrowthGoalProjection) {
  if (!current.instruction.startsWith(GROWTH_WORLD_PRO_GOAL_PREFIX) || current.status !== "waiting") return undefined
  const worlds = await worldEntryRecovery.inspectAuthoritativeWorlds(current.projectId)
  const ownerGoal = worlds.length === 1 ? growthGoals!.get(worlds[0]!.goalId) : undefined
  if (!isReplaceableLegacyWorldGoal({ current, worlds, ...(ownerGoal ? { ownerGoal } : {}) })) return undefined
  return legacyWorldProCommand(current)
}

function legacyWorldProCommand(current: GrowthGoalProjection) {
  if (!current.instruction.startsWith(GROWTH_WORLD_PRO_GOAL_PREFIX)) return undefined
  const instruction = current.instruction.slice(GROWTH_WORLD_PRO_GOAL_PREFIX.length).trim()
  return instruction ? `/growth_world_pro ${instruction}` : "/growth_world_pro"
}

function requireKnownSlashCommand(prompt: string) {
  const resolved = resolveCreativeSlashCommand(prompt)
  if (resolved) return resolved.canonicalMessage
  if (isSlashCommandInput(prompt)) throw new Error(`command_invalid: unknown slash command ${prompt.split(/\s/, 1)[0]}`)
  return prompt
}

async function handleCommand(command: string, ...args: unknown[]): Promise<DesktopResult<unknown>> {
  if (!adapter) return failure(new Error("runtime: Cline adapter is not ready"))
  if (quitting) return failure(new Error("runtime: CreatX is shutting down"))
  try {
    if (command === "bootstrap") {
      const records = await adapter.listSessions()
      const sessions = records.map(toSessionSummary)
      const selection = requireDesktopBootstrapSelection(args[0])
      const selectedSessionIndex = sessions.findIndex((session) => session.id === selection?.sessionId && (!selection.projectId || session.projectId === selection.projectId))
      const selectedProjectIndex = selectedSessionIndex >= 0 ? selectedSessionIndex : sessions.findIndex((session) => session.projectId === selection?.projectId)
      const root = records[selectedProjectIndex]?.projectRoot ?? process.env.CREATX_PROJECT_ROOT ?? records[0]?.projectRoot
      if (root) currentProject = await loadProject(root).catch(() => undefined)
      const growth = currentProject ? growthGoals?.findLatest(currentProject.id) : undefined
      return success({
        harness: { name: "cline" as const, version: "0.0.65" as const, providerId: adapter.providerId, modelId: adapter.modelId, configured: adapter.configured },
        modelSettings: modelSettings!.snapshot(),
        sessions,
        ...(currentProject ? { project: currentProject } : {}),
        ...(growth ? { growth: await projectGrowthGoal(growth) } : {}),
      })
    }
    if (command === "restartApplication") {
      const activity = {
        conversation: ownerConversationMutations.activeTurnCount > 0,
        growth: ownerGrowthExecutions.activeExecutionCount > 0 || Boolean(growthGoals?.listActive().length),
        imageGeneration: imageTasks?.hasGenerating() ?? false,
      }
      return success(applicationRestart.request(requireRestartApplicationCommand(args[0]), activity))
    }
    if (command === "readModelSettings") return success(modelSettings!.snapshot())
    if (command === "saveTextModelProfile") {
      const snapshot = modelSettings!.saveTextProfile(requireSaveTextModelProfileCommand(args[0]))
      const selected = modelSettings!.resolveSelectedTextConnection()
      if (selected) {
        await adapter.replaceConnections(modelSettings!.snapshot().textProfiles.flatMap((profile) => {
          const connection = modelSettings!.resolveTextConnection(profile.id)
          return connection ? [connection] : []
        }))
        await adapter.setDefaultConnection(selected)
      }
      return success(snapshot)
    }
    if (command === "selectSessionModel") {
      const sessionId = String(args[0] ?? "")
      const profileId = String(args[1] ?? "")
      const activeGoal = growthGoals?.listActive().find((goal) => goal.sessionId === sessionId)
      if (activeGoal) throw new Error("model_settings_conflict: pause Growth before switching its conversation model")
      const next = modelSettings!.resolveTextConnection(profileId)
      if (!next) throw new Error("model_settings_invalid: selected text profile does not exist")
      const record = await adapter.switchSessionConnection(sessionId, next)
      return success(toSessionSummary(record))
    }
    if (command === "saveImageModelSettings") return success(modelSettings!.saveImageSettings(requireSaveImageModelSettingsCommand(args[0])))
    if (command === "readImageTasks") return success(imageTasks!.listProject(requireProjectId(args[0])))
    if (command === "controlImageTask") {
      const input = requireControlImageTaskCommand(args[0])
      return success(imageQueue!.control(input.projectId, input.imageTaskId, input.action))
    }
    if (command === "chooseProject") {
      const selected = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"], title: `选择${VISIBLE_PRODUCT_NAME}项目文件夹` })
      if (selected.canceled || !selected.filePaths[0]) return success(undefined)
      currentProject = await loadProject(selected.filePaths[0])
      return success(currentProject)
    }
    if (command === "chooseAttachments") {
      const selected = await dialog.showOpenDialog(mainWindow!, { properties: ["openFile", "multiSelections"], title: "选择要交给旅鸽阅读的文件" })
      if (selected.canceled) return success([])
      if (selected.filePaths.length > 20) throw new Error("attachment_invalid: at most 20 attachments may be selected")
      return success(await attachments.authorize(selected.filePaths))
    }
    if (command === "authorizeDroppedAttachments") {
      const paths = args[0]
      if (!Array.isArray(paths) || !paths.length || paths.length > 20 || paths.some((path) => typeof path !== "string" || !path.trim())) {
        throw new Error("attachment_invalid: dropped attachment paths are invalid")
      }
      return success(await attachments.authorize(paths))
    }
    if (command === "captureWorkbenchAnnotation") {
      const input = requireCaptureWorkbenchAnnotationCommand(args[0])
      requireCurrentWorkbenchSource(input.projectId, input.sourceId)
      const surface = await readVisibleWorkbenchCaptureSurface(input.projectId, input.sourceId)
      const image = await captureWorkbenchRegion((rect) => mainWindow!.webContents.capturePage(rect), surface.rect, surface.bounds)
      return success(attachments.authorizeGeneratedPng(image.toPNG(), input.name))
    }
    if (command === "sampleWorkbenchColor") {
      const input = requireSampleWorkbenchColorCommand(args[0])
      requireCurrentWorkbenchSource(input.projectId, input.sourceId)
      const surface = await readVisibleWorkbenchCaptureSurface(input.projectId, input.sourceId)
      const x = Math.min(surface.rect.x + surface.rect.width - 2, Math.max(surface.rect.x, surface.rect.x + input.x * surface.rect.width - 1))
      const y = Math.min(surface.rect.y + surface.rect.height - 2, Math.max(surface.rect.y, surface.rect.y + input.y * surface.rect.height - 1))
      const image = await captureWorkbenchRegion((rect) => mainWindow!.webContents.capturePage(rect), { x, y, width: 2, height: 2 }, surface.bounds)
      return success(image.toDataURL())
    }
    if (command === "openProject" || command === "refreshFiles") {
      currentProject = await projectFiles.queries.refreshProject(String(args[0] ?? ""))
      if (command === "openProject") scheduleProjectImageReconciliation(currentProject.id)
      return success(currentProject)
    }
    if (command === "revealProject") {
      const error = await shell.openPath(projectFiles.projectRoot(String(args[0] ?? "")))
      if (error) throw new Error(`project_invalid: ${error}`)
      return success(undefined)
    }
    if (command === "createSession") {
      const projectId = String(args[0] ?? "")
      const explicitTitle = typeof args[1] === "string" && args[1].trim() ? args[1].trim() : undefined
      const title = explicitTitle ?? await adapter.allocateProjectConversationTitle(projectId)
      return success(toSessionSummary(await adapter.createProjectSession({ projectId, projectRoot: projectFiles.projectRoot(projectId), title })))
    }
    if (command === "renameSession") {
      const sessionId = String(args[0] ?? "")
      return success(toSessionSummary(await adapter.renameSession(sessionId, String(args[1] ?? ""))))
    }
    if (command === "deleteSession") {
      const sessionId = String(args[0] ?? "")
      await ownerConversationMutations.run(async () => {
        ownerConversationMutations.assertSessionIdle(sessionId)
        if (growthGoals?.hasUnsettledOwnerWorkForSession(sessionId)) throw new Error("session_conflict: finish or end Growth before deleting its conversation")
        await adapter!.deleteSession(sessionId)
        artTurnSources.clear(sessionId)
      })
      return success(undefined)
    }
    if (command === "deleteProjectSessions") {
      const projectId = String(args[0] ?? "")
      return success(await ownerConversationMutations.run(async () => {
        if (growthGoals?.hasUnsettledOwnerWorkForProject(projectId)) throw new Error("session_conflict: finish or end every Growth Goal before deleting project conversations")
        const sessionIds = (await adapter!.listSessions()).filter((session) => projectFiles.rememberProjectRoot(session.projectRoot) === projectId).map((session) => session.id)
        for (const sessionId of sessionIds) ownerConversationMutations.assertSessionIdle(sessionId)
        if (growthGoals?.hasUnsettledOwnerWorkForProject(projectId)) throw new Error("session_conflict: Growth started while project conversations were being selected for deletion")
        const deleted = await adapter!.deleteSessions(sessionIds)
        deleted.forEach((sessionId) => artTurnSources.clear(sessionId))
        return deleted
      }))
    }
    if (command === "readTimeline") return success(await adapter.readTimeline(String(args[0] ?? "")))
    if (command === "readCreativeLibrary") return success(await creativeLibraries!.snapshot())
    if (command === "chooseCreativeLibraryImport") {
      const kind = String(args[0] ?? "") as CreativeLibraryKind
      if (kind !== "idea" && kind !== "heritage") throw new Error("library_invalid: unknown library kind")
      const selected = await dialog.showOpenDialog(mainWindow!, {
        title: kind === "idea" ? "导入点子" : "导入传承资料",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      })
      if (selected.canceled || !selected.filePaths[0]) return success(undefined)
      const input = parseCreativeLibraryImport(await readFile(selected.filePaths[0], "utf8"))
      return success(await creativeLibraries!.import(kind, input))
    }
    if (command === "setCreativeLibraryReaction") return success(await creativeLibraries!.setReaction(args[0] as SetCreativeLibraryReactionCommand))
    if (command === "bindArtChatSession") return success(await creativeLibraries!.bindArtChat(args[0] as BindArtChatSessionCommand))
    if (command === "readArtLibrary") return success(await artLibrary!.projection())
    if (command === "reviewArtApproval") {
      await artLibrary!.review(requireReviewArtApprovalCommand(args[0]))
      return success(await artLibrary!.projection())
    }
    if (command === "exportArtStyleKeywords") return success(await artLibrary!.exportStyleKeywords(String(args[0] ?? "")))
    if (command === "setSessionPermissionMode") {
      const sessionId = String(args[0] ?? "")
      const mode = String(args[1] ?? "") as "approval" | "free"
      const activeGoal = growthGoals?.listActive().find((goal) => goal.sessionId === sessionId)
      if (activeGoal && mode !== "free") throw new Error("growth_conflict: pause or end Growth before leaving free mode")
      return success(toSessionSummary(await adapter.setSessionPermissionMode(
        sessionId,
        mode,
      )))
    }
    if (command === "sendMessage") {
      const input = requireSendMessageCommand(args[0])
      const userAttachments = await attachments.resolve(input.attachmentIds)
      await withArtTurnSources(artTurnSources, input.sessionId, userAttachments.imageSnapshots, () => sendPrompt(input, userAttachments))
      attachments.consume(input.attachmentIds)
      return success(undefined)
    }
    if (command === "admitSharedMessage") {
      const input = requireSendMessageCommand(args[0])
      const delivery = String(args[1] ?? "")
      if (delivery !== "send" && delivery !== "steer") throw new Error("message_admission_invalid: shared message delivery must be send or steer")
      const userAttachments = await attachments.resolve(input.attachmentIds)
      await waitForMessageAdmission(async (onAdmitted) => {
        return withArtTurnSources(artTurnSources, input.sessionId, userAttachments.imageSnapshots, async () => {
          if (delivery === "send") return sendPrompt(input, userAttachments, onAdmitted)
          const prompt = requireKnownSlashCommand(input.prompt)
          const activeGoal = growthGoals?.listActive().find((goal) => goal.sessionId === input.sessionId)
          if (activeGoal) {
            if (input.attachmentIds.length) throw new Error("attachment_invalid: Growth does not yet support ephemeral attachments")
            const steered = await growthLifecycle!.steerWithDelivery(activeGoal.goalId, prompt)
            if (steered.deliveredToActiveRun) {
              onAdmitted()
              return
            }
            return sendPrompt(input, emptyUserAttachments(), onAdmitted)
          }
          return adapter!.steer(input.sessionId, prompt, { userFiles: userAttachments.userFiles, userImages: userAttachments.userImages }, onAdmitted)
        })
      }, (error) => {
        if (delivery === "steer") sendEvent({ type: "runtime.error", sessionId: input.sessionId, error: classifyDesktopError(error) })
      })
      attachments.consume(input.attachmentIds)
      return success(undefined)
    }
    if (command === "steerMessage") {
      const input = requireSendMessageCommand(args[0])
      const prompt = requireKnownSlashCommand(input.prompt)
      const activeGoal = growthGoals?.listActive().find((goal) => goal.sessionId === input.sessionId)
      if (activeGoal) {
        if (input.attachmentIds.length) throw new Error("attachment_invalid: Growth does not yet support ephemeral attachments")
        const steered = await growthLifecycle!.steerWithDelivery(activeGoal.goalId, prompt)
        if (!steered.deliveredToActiveRun) await sendPrompt(input, emptyUserAttachments())
        return success(undefined)
      }
      const userAttachments = await attachments.resolve(input.attachmentIds)
      await withArtTurnSources(artTurnSources, input.sessionId, userAttachments.imageSnapshots, () => adapter!.steer(input.sessionId, prompt, { userFiles: userAttachments.userFiles, userImages: userAttachments.userImages }))
      attachments.consume(input.attachmentIds)
      return success(undefined)
    }
    if (command === "openMessageAttachment") {
      const path = await adapter.resolveMessageAttachment(String(args[0] ?? ""), String(args[1] ?? ""), Number(args[2]))
      const error = await shell.openPath(path)
      if (error) throw new Error(`attachment_unreadable: ${error}`)
      return success(undefined)
    }
    if (command === "cancelRun") {
      await adapter.cancel(String(args[0] ?? ""))
      return success(undefined)
    }
    if (command === "respondApproval") {
      await adapter.resolveApproval(String(args[0] ?? ""), args[1] === true)
      return success(undefined)
    }
    if (command === "readFile") {
      const projectId = String(args[0] ?? "")
      const fileId = String(args[1] ?? "")
      const project = await projectFiles.queries.refreshProject(projectId)
      const file = project.files.find((candidate) => candidate.id === fileId)
      if (file?.kind === "image") return success(await workbenchPreviewProtocol.issueProjectImage(projectId, fileId, file))
      return success(await projectFiles.queries.readFile(projectId, fileId))
    }
    if (command === "saveTextFile") return success(await projectFiles.saveTextFile(requireSaveProjectTextCommand(args[0])))
    if (command === "readWorkbenches") return success(await workbenches.queries.snapshot(String(args[0] ?? "")))
    if (command === "resolveWorkbenchPresentation") {
      const input = requireResolveWorkbenchPresentationCommand(args[0])
      const resolved = await workbenches.queries.resolvePresentation(input)
      return success(workbenchPreviewProtocol.issue(resolved))
    }
    if (command === "resolveHtmlPresentation") return success(await workbenchPreviewProtocol.issueProjectHtml(String(args[0] ?? ""), String(args[1] ?? "")))
    if (command === "readGrowthGoal") {
      const goal = growthGoals?.findLatest(String(args[0] ?? ""))
      return success(goal ? await projectGrowthGoal(goal) : undefined)
    }
    if (command === "pauseGrowth") {
      const goalId = String(args[0] ?? "")
      const executions = requestOwnerExecutionCancellation(goalId, "用户暂停了 Growth。")
      const paused = await growthLifecycle!.pause(goalId)
      await Promise.all(executions.map((execution) => execution.catch(() => undefined)))
      return success(await projectGrowthGoal(paused))
    }
    if (command === "resumeGrowth") {
      const commandInput = requireResumeGrowthCommand(args[0])
      const goalId = commandInput.goalId
      const current = growthGoals!.get(goalId)
      if (!current) throw new Error("growth_invalid: Goal does not exist")
      const legacyReplacementInstruction = legacyWorldProCommand(current)
      const legacyReplacementPrompt = await legacyWorldProReplacementPrompt(current)
      const retryActivation = growthGoals!.getOwnerActivation(`activation_${commandInput.requestId}`)
      if (retryActivation) {
        const exactResume = retryActivation.kind === "resume" && retryActivation.instruction === goalId
        const exactLegacyReplacement = retryActivation.kind === "start"
          && retryActivation.route === "growth-world-pro"
          && legacyReplacementInstruction === retryActivation.instruction
        if ((!exactResume && !exactLegacyReplacement) || retryActivation.sessionId !== current.sessionId || retryActivation.projectId !== current.projectId) {
          throw new Error("growth_conflict: requestId was already used for different Growth control input")
        }
        await executeExistingOwnerActivation(retryActivation)
        return success(await projectGrowthGoal(growthGoals!.findLatest(current.projectId) ?? current))
      }
      if (current.status !== "paused" && current.status !== "waiting" && !current.ownerReplyPending) throw new Error("growth_conflict: only paused, waiting, or reply-pending Growth can continue")
      if (await adapter.getSessionPermissionMode(current.sessionId) !== "free") {
        throw new Error("growth_conflict: Growth requires free session permission before it can continue")
      }
      const pendingDelivery = growthGoals!.findResultReadyOwnerActivationForGoal(goalId)
      if (pendingDelivery) {
        const deliveryActivation = await ownerConversationMutations.run(() => {
          ownerConversationMutations.assertSessionIdle(current.sessionId)
          return growthGoals!.createOwnerDeliveryActivation({
            activationId: `activation_${commandInput.requestId}`,
            sourceActivationId: pendingDelivery.activationId,
            promptHash: createHash("sha256").update(goalId).digest("hex"),
          })
        })
        await executeExistingOwnerActivation(deliveryActivation)
        return success(await projectGrowthGoal(growthGoals!.get(goalId) ?? current))
      }
      if (legacyReplacementPrompt) {
        const visiblePrompt = "继续 Growth"
        const activation = await ownerConversationMutations.run(() => {
          ownerConversationMutations.assertSessionIdle(current.sessionId)
          return growthGoals!.createOwnerActivation({
            activationId: `activation_${commandInput.requestId}`,
            kind: "start",
            route: "growth-world-pro",
            sessionId: current.sessionId,
            projectId: current.projectId,
            goalId: current.goalId,
            promptHash: createHash("sha256").update(visiblePrompt).digest("hex"),
            instruction: legacyReplacementPrompt,
            controllerToolName: "run_growth",
          })
        })
        await executeOwnerActivation(activation, async (signal) => {
          try {
            await adapter!.sendGrowthMessage(current.sessionId, visiblePrompt, activation.activationId, undefined, async (reply) => {
              completeOwnerActivationAndCleanup(activation.activationId, reply)
            }, signal)
          } catch (error) {
            failOpenOwnerActivation(activation.activationId, error)
            throw error
          }
        })
        return success(await projectGrowthGoal(growthGoals!.findLatest(current.projectId) ?? current))
      }
      const visiblePrompt = "继续 Growth"
      const activation = await ownerConversationMutations.run(() => {
        ownerConversationMutations.assertSessionIdle(current.sessionId)
        return growthGoals!.createOwnerActivation({
          activationId: `activation_${commandInput.requestId}`,
          kind: "resume",
          sessionId: current.sessionId,
          projectId: current.projectId,
          goalId: current.goalId,
          promptHash: createHash("sha256").update(visiblePrompt).digest("hex"),
          instruction: goalId,
          controllerToolName: "run_growth",
        })
      })
      await executeOwnerActivation(activation, async (signal) => {
        try {
          await adapter!.sendGrowthMessage(current.sessionId, visiblePrompt, activation.activationId, undefined, async (reply) => {
            completeOwnerActivationAndCleanup(activation.activationId, reply)
          }, signal)
        } catch (error) {
          failOpenOwnerActivation(activation.activationId, error)
          throw error
        }
      })
      return success(await projectGrowthGoal(growthGoals!.get(goalId) ?? current))
    }
    if (command === "cancelGrowth") {
      const goalId = String(args[0] ?? "")
      const goal = growthGoals!.get(goalId)
      if (!goal) throw new Error("growth_invalid: Goal does not exist")
      const executions = requestOwnerExecutionCancellation(goalId, "用户结束了 Growth。")
      if (executions.length) {
        await adapter.cancel(goal.sessionId)
        await Promise.all(executions.map((execution) => execution.catch(() => undefined)))
      }
      const completed = await settleOwnerReplyBeforeCancellation(growthGoals!, adapter!, goalId, scheduleGrowthWorkerCleanup)
      return success(await projectGrowthGoal(completed ?? await growthLifecycle!.cancel(goalId)))
    }
    return failure(new Error(`compatibility: unknown desktop command ${command}`))
  } catch (error) {
    return failure(error)
  }
}

function requestOwnerExecutionCancellation(goalId: string, reason: string) {
  return growthGoals!.listOpenOwnerActivations()
    .filter((activation) => activation.goalId === goalId)
    .flatMap((activation) => {
      const execution = ownerGrowthExecutions.requestCancellation(activation.activationId, reason)
      return execution ? [execution] : []
    })
}

function requestAllOwnerExecutionCancellations(reason: string) {
  const activations = growthGoals!.listOpenOwnerActivations()
  return {
    executions: activations.flatMap((activation) => {
      const execution = ownerGrowthExecutions.requestCancellation(activation.activationId, reason)
      return execution ? [execution] : []
    }),
    sessionIds: [...new Set(activations.map((activation) => activation.sessionId))],
  }
}

function requireSaveProjectTextCommand(value: unknown): SaveProjectTextCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("file_invalid: save command must be an object")
  const input = value as Partial<SaveProjectTextCommand>
  if (typeof input.projectId !== "string" || !input.projectId.trim()) throw new Error("project_invalid: projectId is required")
  if (typeof input.fileId !== "string" || !input.fileId.trim()) throw new Error("file_invalid: fileId is required")
  if (typeof input.content !== "string") throw new Error("file_invalid: text content is required")
  if (typeof input.expectedModifiedAt !== "string" || !input.expectedModifiedAt.trim()) throw new Error("file_invalid: expectedModifiedAt is required")
  return { projectId: input.projectId.trim(), fileId: input.fileId.trim(), content: input.content, expectedModifiedAt: input.expectedModifiedAt.trim() }
}

function requireCaptureWorkbenchAnnotationCommand(value: unknown): CaptureWorkbenchAnnotationCommand {
  if (!value || typeof value !== "object") throw new Error("workbench_capture_invalid: command must be an object")
  const input = value as Record<string, unknown>
  if (typeof input.projectId !== "string" || !input.projectId.trim() || typeof input.sourceId !== "string" || !input.sourceId.trim() || typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("workbench_capture_invalid: command fields are invalid")
  }
  return { projectId: input.projectId, sourceId: input.sourceId, name: input.name }
}

function requireSampleWorkbenchColorCommand(value: unknown): SampleWorkbenchColorCommand {
  if (!value || typeof value !== "object") throw new Error("workbench_capture_invalid: sample command must be an object")
  const input = value as Record<string, unknown>
  if (typeof input.projectId !== "string" || !input.projectId.trim() || typeof input.sourceId !== "string" || !input.sourceId.trim() || typeof input.x !== "number" || typeof input.y !== "number" || !Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) {
    throw new Error("workbench_capture_invalid: sample command fields are invalid")
  }
  return { projectId: input.projectId, sourceId: input.sourceId, x: input.x, y: input.y }
}

function requireCurrentWorkbenchSource(projectId: string, sourceId: string) {
  if (!currentProject || currentProject.id !== projectId || !currentProject.files.some((file) => file.id === sourceId)) {
    throw new Error("workbench_capture_invalid: current project source does not match")
  }
}

async function readVisibleWorkbenchCaptureSurface(projectId: string, sourceId: string) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("workbench_capture_unavailable: main window is unavailable")
  const surface = requireWorkbenchCaptureSurface(await mainWindow.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('.wb-map-canvas[data-annotation-project-id][data-annotation-source-id]')
    if (!(element instanceof HTMLElement)) return undefined
    const rect = element.getBoundingClientRect()
    return {
      projectId: element.dataset.annotationProjectId,
      sourceId: element.dataset.annotationSourceId,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      bounds: { width: window.innerWidth, height: window.innerHeight },
    }
  })()`))
  if (surface.projectId !== projectId || surface.sourceId !== sourceId) throw new Error("workbench_capture_invalid: visible source does not match")
  return surface
}

function requireWorkbenchCaptureSurface(value: unknown): { projectId: string; sourceId: string; rect: WorkbenchCaptureRect; bounds: { width: number; height: number } } {
  if (!value || typeof value !== "object") throw new Error("workbench_capture_invalid: visible surface is missing")
  const surface = value as Record<string, unknown>
  if (typeof surface.projectId !== "string" || typeof surface.sourceId !== "string" || !surface.rect || typeof surface.rect !== "object" || !surface.bounds || typeof surface.bounds !== "object") {
    throw new Error("workbench_capture_invalid: visible surface identity is invalid")
  }
  const rect = surface.rect as Record<string, unknown>
  const bounds = surface.bounds as Record<string, unknown>
  return {
    projectId: surface.projectId,
    sourceId: surface.sourceId,
    rect: { x: Number(rect.x), y: Number(rect.y), width: Number(rect.width), height: Number(rect.height) },
    bounds: { width: Number(bounds.width), height: Number(bounds.height) },
  }
}

function requireProjectId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("image_queue_invalid: projectId is required")
  return value.trim()
}

function requireControlImageTaskCommand(value: unknown): ControlImageTaskCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("image_queue_invalid: control command must be an object")
  const input = value as Partial<ControlImageTaskCommand>
  if (Object.keys(value).some((key) => !["projectId", "imageTaskId", "action"].includes(key))) {
    throw new Error("image_queue_invalid: control command contains unknown fields")
  }
  if (typeof input.imageTaskId !== "string" || !input.imageTaskId.trim()) throw new Error("image_queue_invalid: imageTaskId is required")
  if (input.action !== "retry" && input.action !== "skip" && input.action !== "cancel") throw new Error("image_queue_invalid: unsupported image task action")
  return { projectId: requireProjectId(input.projectId), imageTaskId: input.imageTaskId.trim(), action: input.action }
}

function requireDesktopBootstrapSelection(value: unknown): DesktopBootstrapSelection | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("command_invalid: bootstrap selection must be an object")
  const input = value as Partial<DesktopBootstrapSelection>
  if (Object.keys(value).some((key) => key !== "projectId" && key !== "sessionId")) throw new Error("command_invalid: bootstrap selection contains unknown fields")
  if (input.projectId !== undefined && (typeof input.projectId !== "string" || !input.projectId.trim())) throw new Error("project_invalid: projectId must be a non-empty string")
  if (input.sessionId !== undefined && (typeof input.sessionId !== "string" || !input.sessionId.trim())) throw new Error("session_invalid: sessionId must be a non-empty string")
  return {
    ...(input.projectId ? { projectId: input.projectId.trim() } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId.trim() } : {}),
  }
}

function requireRestartApplicationCommand(value: unknown): RestartApplicationCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("command_invalid: restart command must be an object")
  const input = value as Partial<RestartApplicationCommand>
  if (Object.keys(value).some((key) => key !== "confirmed")) throw new Error("command_invalid: restart command contains unknown fields")
  if (typeof input.confirmed !== "boolean") throw new Error("command_invalid: restart confirmation must be boolean")
  return { confirmed: input.confirmed }
}

function requireResolveWorkbenchPresentationCommand(value: unknown): ResolveWorkbenchPresentationCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workbench_invalid: presentation command must be an object")
  const input = value as Partial<ResolveWorkbenchPresentationCommand>
  if (typeof input.projectId !== "string" || !input.projectId.trim()) throw new Error("project_invalid: projectId is required")
  if (typeof input.workbenchId !== "string" || !input.workbenchId.trim()) throw new Error("workbench_invalid: workbenchId is required")
  if (typeof input.entry !== "string" || !input.entry.trim()) throw new Error("workbench_invalid: entry is required")
  return { projectId: input.projectId.trim(), workbenchId: input.workbenchId.trim(), entry: input.entry.trim() }
}

function requireSendMessageCommand(value: unknown): SendMessageCommand {
  if (!value || typeof value !== "object") throw new Error("attachment_invalid: message command must be an object")
  const input = value as Partial<SendMessageCommand>
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestId)) throw new Error("session_invalid: requestId must be a stable ASCII message identity")
  if (typeof input.sessionId !== "string" || !input.sessionId.trim()) throw new Error("session_invalid: sessionId must be a non-empty string")
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("session_invalid: prompt must be a non-empty string")
  if (!Array.isArray(input.attachmentIds) || input.attachmentIds.some((id) => typeof id !== "string" || !id.trim()) || input.attachmentIds.length > 20) {
    throw new Error("attachment_invalid: attachmentIds must contain at most 20 non-empty IDs")
  }
  if (input.skillSequence !== undefined && (!Array.isArray(input.skillSequence) || input.skillSequence.some((name) => typeof name !== "string") || input.skillSequence.length > 12)) {
    throw new Error("skill_sequence_invalid: skillSequence must contain at most 12 Skill names")
  }
  return {
    requestId: input.requestId,
    sessionId: input.sessionId.trim(),
    prompt: input.prompt.trim(),
    attachmentIds: input.attachmentIds,
    ...(input.skillSequence?.length ? { skillSequence: input.skillSequence } : {}),
  }
}

function requireResumeGrowthCommand(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("growth_invalid: resume command must be an object")
  const input = value as { requestId?: unknown; goalId?: unknown }
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestId)) throw new Error("growth_invalid: requestId must be a stable ASCII message identity")
  if (typeof input.goalId !== "string" || !input.goalId.trim()) throw new Error("growth_invalid: goalId must be a non-empty string")
  return { requestId: input.requestId, goalId: input.goalId.trim() }
}

function requireSaveTextModelProfileCommand(value: unknown): SaveTextModelProfileCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("model_settings_invalid: text model command must be an object")
  const input = value as Partial<SaveTextModelProfileCommand>
  if (typeof input.name !== "string" || typeof input.providerId !== "string" || typeof input.modelId !== "string") {
    throw new Error("model_settings_invalid: name, providerId and modelId are required")
  }
  if (input.id !== undefined && typeof input.id !== "string") throw new Error("model_settings_invalid: id must be a string")
  if (input.baseUrl !== undefined && typeof input.baseUrl !== "string") throw new Error("model_settings_invalid: baseUrl must be a string")
  if (input.apiKey !== undefined && typeof input.apiKey !== "string") throw new Error("model_settings_invalid: apiKey must be a string")
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") throw new Error("model_settings_invalid: clearApiKey must be boolean")
  return {
    ...(input.id !== undefined ? { id: input.id } : {}),
    name: input.name,
    providerId: input.providerId,
    modelId: input.modelId,
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
    ...(input.clearApiKey !== undefined ? { clearApiKey: input.clearApiKey } : {}),
  }
}

function requireSaveImageModelSettingsCommand(value: unknown): SaveImageModelSettingsCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("model_settings_invalid: image model command must be an object")
  const input = value as Partial<SaveImageModelSettingsCommand>
  if (typeof input.baseUrl !== "string") throw new Error("model_settings_invalid: image baseUrl is required")
  if (input.defaultModel !== "gpt-image-2-cheap" && input.defaultModel !== "gpt-image-2") throw new Error("model_settings_invalid: unsupported image model")
  if (input.apiKey !== undefined && typeof input.apiKey !== "string") throw new Error("model_settings_invalid: apiKey must be a string")
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") throw new Error("model_settings_invalid: clearApiKey must be boolean")
  return {
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
    ...(input.clearApiKey !== undefined ? { clearApiKey: input.clearApiKey } : {}),
  }
}

ipcMain.handle(CREATX_DESKTOP_API, (_event, command: string, ...args: unknown[]) => handleCommand(command, ...args))

function parseCreativeLibraryImport(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw new Error("library_invalid: selected file is not valid JSON")
  }
}

app.on("before-quit", (event) => {
  if (quitting || !adapter) return
  event.preventDefault()
  quitting = true
  acceptingGrowthEvents = false
  const ownerCancellation = growthGoals
    ? requestAllOwnerExecutionCancellations("应用正在退出，Growth 已暂停。")
    : { executions: [], sessionIds: [] }
  const ownerAborts = ownerCancellation.sessionIds.map((sessionId) => adapter!.abortRun(sessionId, "应用正在退出，Growth 已暂停。"))
  void runBeforeDeadline(async () => {
    const growthResults = await Promise.allSettled([growthLifecycle?.shutdown(), ownerGrowthExecutions.shutdown("应用正在退出，Growth 已暂停。"), ...ownerAborts])
    for (const result of growthResults) if (result.status === "rejected") console.error("CreatX Growth shutdown failed", result.reason)
    const eventResults = await growthProjectionDispatcher.settle()
    for (const result of eventResults) if (result.status === "rejected") console.error("CreatX Growth projection shutdown failed", result.reason)
    const results = await Promise.allSettled([imageQueue?.shutdown(), adapter!.dispose(), heritageSkills?.dispose()])
    for (const result of results) if (result.status === "rejected") console.error("CreatX shutdown failed", result.reason)
  }, SHUTDOWN_DEADLINE_MS).then((result) => {
    if (result.timedOut) {
      console.error(`CreatX shutdown exceeded ${SHUTDOWN_DEADLINE_MS}ms; forcing process exit after persistent Growth pause and cancellation requests.`)
      app.exit(0)
      return
    }
    imageTasks?.close()
    imageTasks = undefined
    imageQueue = undefined
    heritageSkills = undefined
    growthGoals?.close()
    growthGoals = undefined
    growthScheduler = undefined
    growthLifecycle = undefined
    worldMaterialization = undefined
    growthProjectionDispatcher.clear()
    timelineEventDispatcher.clear()
    attachments.clear()
    artTurnSources.clearAll()
    app.quit()
  })
})

if (isPrimaryInstance) {
  app.whenReady().then(async () => {
    protocol.handle("creatx-workbench", (request) => workbenchPreviewProtocol.handle(request))
    protocol.handle("creatx-attachment", (request) => conversationAttachmentProtocol.handle(request))
    protocol.handle("creatx-art-library", (request) => artLibraryAssetProtocol.handle(request))
    await initializeRuntime()
    await createWindow()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  }).catch((error) => {
    console.error("CreatX startup failed", error)
    if (process.env.CREATX_DESKTOP_TEST !== "1") dialog.showErrorBox(`${VISIBLE_PRODUCT_NAME}无法启动`, classifyRuntimeError(error).message)
    app.exit(1)
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
