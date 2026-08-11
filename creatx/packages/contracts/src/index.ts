export const CREATX_DESKTOP_API = "creatx:desktop"
export const CREATX_DESKTOP_EVENT = "creatx:event"
export const CHAT_IMAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_IMAGE_ATTACHMENTS_MAX_BYTES = 20 * 1024 * 1024

export { isPublicAddress } from "./network-address.ts"

export type {
  ProjectPackageCaseExportCommand,
  ProjectPackageCaseProjection,
  ProjectPackageExchangeProjection,
  ProjectPackageExclusionProjection,
  ProjectPackageExportResultProjection,
  ProjectPackageImportResultProjection,
  ProjectPackageJobEvent,
  ProjectPackageJobPhase,
  ProjectPackageJobProjection,
  ProjectPackageJobState,
  ProjectPackageOperation,
  ProjectPackageOverview,
  SaveProjectPackageOverviewCommand,
  SetProjectPackageCaseCommand,
  StartProjectPackageExportCommand,
  StartProjectPackageImportCommand,
} from "./project-package"

export type ProjectFileKind = "markdown" | "text" | "image" | "html" | "other"

export interface ProjectFile {
  id: string
  relativePath: string
  name: string
  kind: ProjectFileKind
  size: number
  modifiedAt: string
}

export interface ProjectSnapshot {
  id: string
  name: string
  displayPath: string
  files: ProjectFile[]
  refreshedAt: string
}

export type ProjectCatalogSource = "opened-folder" | "imported-package"
export type ProjectCatalogAvailability = "available" | "missing"

export interface ProjectCatalogEntryProjection {
  localProjectId: string
  forkedFromProjectId?: string
  rootPath: string
  displayName: string
  source: ProjectCatalogSource
  importedProjectId?: string
  importedPackageId?: string
  availability: ProjectCatalogAvailability
}

export interface FilePreview {
  file: ProjectFile
  content?: string
  dataUrl?: string
  assetUrl?: string
}

export interface SaveProjectTextCommand {
  projectId: string
  fileId: string
  content: string
  expectedModifiedAt: string
}

export interface WorkbenchEntry {
  kind: "directory" | "file"
  name: string
  relativePath: string
  fileId?: string
}

export interface WorkbenchHomeProjection {
  entry: string
  mode: "interactive"
  state: "ready" | "missing"
}

export interface WorkbenchProjection {
  id: string
  source: "builtin" | "registered"
  title: string
  folder: string
  state: "ready" | "missing"
  entries: WorkbenchEntry[]
  home?: WorkbenchHomeProjection
}

export interface ResolveWorkbenchPresentationCommand {
  projectId: string
  workbenchId: string
  entry: string
}

export interface WorkbenchPresentationProjection {
  workbenchId: string
  entry: string
  url: string
}

export type WorkbenchDiagnosticCode = "workbench_record_invalid" | "workbench_record_conflict"

export interface WorkbenchDiagnostic {
  code: WorkbenchDiagnosticCode
  recordPath?: string
  message: string
}

export interface WorkbenchSnapshot {
  projectId: string
  workbenches: WorkbenchProjection[]
  diagnostics: WorkbenchDiagnostic[]
  refreshedAt: string
}

export interface SessionSummary {
  id: string
  title: string
  projectId: string
  displayPath: string
  status: string
  startedAt: string
  updatedAt: string
  providerId: string
  modelId: string
  kind: SessionKind
  permission: SessionPermissionProjection
}

export type PortableConversationItemV1 =
  | {
      kind: "message"
      role: "user" | "assistant"
      text: string
      fileReferences: string[]
    }
  | {
      kind: "tool-activity"
      summary: string
      status: "succeeded" | "failed"
      fileReferences: string[]
    }

export interface PortableConversationV1 {
  schemaVersion: 1
  caseId: string
  title: string
  purpose: string
  conclusion: string
  continuationBrief: string
  items: PortableConversationItemV1[]
}

export type SessionKind = "personal" | "project"
export type SessionPermissionMode = "approval" | "free"

export interface SessionPermissionProjection {
  mode: SessionPermissionMode
  projectTools: boolean
  trustWarning: string
}

export interface SessionPermissionState {
  sessionId: string
  kind: SessionKind
  mode: SessionPermissionMode
}

export interface SessionPermissionPort {
  ensure(sessionId: string, kind: SessionKind): SessionPermissionState
  get(sessionId: string): SessionPermissionState | undefined
  setMode(sessionId: string, mode: SessionPermissionMode): SessionPermissionState
}

export interface MessageProjection {
  id: string
  role: "user" | "assistant" | "system"
  text: string
  attachments: MessageAttachmentProjection[]
}

export interface AttachmentReference {
  id: string
  name: string
  displayPath: string
  size: number
  modifiedAt: string
  kind: "file" | "image"
  mediaType?: "image/png" | "image/jpeg"
  previewUrl?: string
}

export interface CaptureWorkbenchAnnotationCommand {
  projectId: string
  sourceId: string
  name: string
}

export interface SampleWorkbenchColorCommand {
  projectId: string
  sourceId: string
  x: number
  y: number
}

export interface MessageAttachmentProjection {
  name: string
  displayPath: string
  kind: "file" | "image"
  mediaType?: "image/png" | "image/jpeg"
  previewUrl?: string
}

export interface SendMessageCommand {
  requestId: string
  sessionId: string
  prompt: string
  attachmentIds: string[]
  skillSequence?: string[]
}

export interface ResumeGrowthCommand {
  requestId: string
  goalId: string
}

export type CreativeLibraryKind = "idea" | "heritage"
export type CreativeLibraryReactionKind = "liked" | "saved"

export interface ImportedIdeaLibraryItem {
  id: string
  sentence: string
  author: string
  category: string
  tags: string[]
  sourceUrl?: string
  sourceTitle?: string
  notes?: string
  importedAt: string
}

export interface ImportedHeritageLibraryItem {
  id: string
  title: string
  author: string
  platform: string
  category: string
  sourceUrl: string
  coverUrl?: string
  analysisPreview?: string
  skillDirection?: string
  importedAt: string
}

export interface CreativeLibraryReaction {
  kind: CreativeLibraryKind
  itemId: string
  liked: boolean
  saved: boolean
}

export interface CreativeLibrarySnapshot {
  ideaItems: ImportedIdeaLibraryItem[]
  heritageItems: ImportedHeritageLibraryItem[]
  reactions: CreativeLibraryReaction[]
  artChatSessions: Record<string, string>
  refreshedAt: string
}

export interface SetCreativeLibraryReactionCommand {
  kind: CreativeLibraryKind
  itemId: string
  reaction: CreativeLibraryReactionKind
  value: boolean
}

export interface BindArtChatSessionCommand {
  projectId: string
  sessionId: string
}

export type ArtLibraryItemState = "approval" | "approved"
export type ArtLibrarySourceKind = "web" | "chat-attachment" | "project-file" | "seed"

export interface ArtReversePrompt {
  style: string
  composition: string
  scene: string
  negative: string[]
}

export type ArtLibraryCurationProjection =
  | { status: "legacy-unverified"; promptDraft: string; negativeTags: string[] }
  | { status: "current"; method: "visual-curation-v1"; reversePrompt: ArtReversePrompt }

export interface ArtLibraryItemProjection {
  id: string
  state: ArtLibraryItemState
  title: string
  artist: string
  publishedDate?: string
  collectedAt: string
  styleAnalysis: string
  movementNote?: string
  palette: string[]
  patternTags: string[]
  compositionTags: string[]
  moodTags: string[]
  curation: ArtLibraryCurationProjection
  suggestedLibrary: { title: string; confidence: number }
  sourceKind: ArtLibrarySourceKind
  sourceLabel: string
  sourceUrl?: string
  projectRelativePath?: string
  imageUrl: string
  image: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; bytes: number; width: number; height: number; sha256: string }
  library?: string
}

export interface ArtLibraryCategoryProjection {
  title: string
  itemCount: number
  items: ArtLibraryItemProjection[]
}

export interface ArtLibrarySnapshot {
  revision: number
  incomingCount: number
  approvalItems: ArtLibraryItemProjection[]
  libraries: ArtLibraryCategoryProjection[]
  refreshedAt: string
}

export interface ArtApprovalEdits {
  title?: string
  styleAnalysis?: string
  palette?: string[]
  patternTags?: string[]
  compositionTags?: string[]
  moodTags?: string[]
  reversePrompt?: ArtReversePrompt
}

export interface ReviewArtApprovalCommand {
  itemId: string
  action: "approve" | "reject" | "hold"
  targetLibrary?: string
  edits?: ArtApprovalEdits
}

export interface ArtStyleKeywordExport {
  library: string
  itemCount: number
  keywords: string[]
  text: string
}

export interface ArtKeywordFrequency {
  keyword: string
  count: number
}

export interface ArtStyleRepresentative {
  id: string
  title: string
  library: string
  styleAnalysis: string
  patternTags: string[]
  compositionTags: string[]
  moodTags: string[]
  curationStatus: "legacy-unverified" | "current"
}

export interface ArtStyleEvidence {
  kind: "all" | "library"
  title?: string
  itemCount: number
  keywordFrequencies: { pattern: ArtKeywordFrequency[]; composition: ArtKeywordFrequency[]; mood: ArtKeywordFrequency[] }
  representatives: ArtStyleRepresentative[]
}

export interface ArtLibraryInspection {
  libraries: Array<ArtStyleEvidence & { kind: "library"; title: string }>
  styleScope: ArtStyleEvidence
  approvalIds: string[]
  incomingBatches: string[]
}

export type RunState = "idle" | "running" | "completed" | "cancelled" | "failed" | "unknown"

export type ImageGenerationModel = "gpt-image-2-cheap" | "gpt-image-2"
export type ImageTaskStatus = "queued" | "generating" | "succeeded" | "failed" | "interrupted" | "cancelled"
export type ImageTaskAction = "retry" | "skip" | "cancel"
export type ImageAttachmentPlacement = "end" | "after_heading" | "after_anchor"

export interface ImageAttachmentIntent {
  documentPath: string
  alt: string
  placement: ImageAttachmentPlacement
  anchor?: string
}

export interface ImageAttachmentProjection extends ImageAttachmentIntent {
  status: "pending" | "succeeded" | "failed"
  errorCode?: string
  errorMessage?: string
}

export interface TextModelProfileProjection {
  id: string
  name: string
  providerId: string
  modelId: string
  baseUrl?: string
  apiKeyConfigured: boolean
}

export interface ImageModelSettingsProjection {
  baseUrl?: string
  defaultModel: ImageGenerationModel
  apiKeyConfigured: boolean
  configured: boolean
}

export interface TranscriptionModelSettingsProjection {
  baseUrl?: string
  model?: string
  language?: string
  apiKeyConfigured: boolean
  configured: boolean
}

// "noven" means the app acquires 抖音's anti-bot cookies itself through a Chromium session of
// its own. It is the default because anonymous extraction is refused outright and Chromium
// App-Bound Encryption makes reading an external browser profile unreliable on Windows.
export type VideoCookieSourceSetting = "none" | "noven" | "edge" | "firefox" | "chrome"

export interface VideoSettingsProjection {
  cookieSource: VideoCookieSourceSetting
}

export interface ModelSettingsSnapshot {
  textProfiles: TextModelProfileProjection[]
  selectedTextProfileId?: string
  image: ImageModelSettingsProjection
  transcription: TranscriptionModelSettingsProjection
  video: VideoSettingsProjection
}

export interface SaveTextModelProfileCommand {
  id?: string
  name: string
  providerId: string
  modelId: string
  baseUrl?: string
  apiKey?: string
  clearApiKey?: boolean
}

export interface TextProviderOption {
  id: string
  label: string
}

// The bounded set of API Providers a text profile may use. The settings UI renders exactly these
// choices and both the main process and the settings store refuse anything else, so a model name
// can never end up in the provider slot again (Cline rejects unknown provider ids at run time).
export const TEXT_PROVIDER_OPTIONS: readonly TextProviderOption[] = [
  { id: "openai-compatible", label: "OpenAI 兼容接口" },
  { id: "openai-native", label: "OpenAI 官方接口" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "ollama", label: "Ollama" },
  { id: "lmstudio", label: "LM Studio" },
]

export function isKnownTextProviderId(providerId: string): boolean {
  return TEXT_PROVIDER_OPTIONS.some((option) => option.id === providerId)
}

export function textProviderLabel(providerId: string): string {
  return TEXT_PROVIDER_OPTIONS.find((option) => option.id === providerId)?.label ?? providerId
}

export interface SaveImageModelSettingsCommand {
  baseUrl: string
  defaultModel: ImageGenerationModel
  apiKey?: string
  clearApiKey?: boolean
}

export interface SaveTranscriptionModelSettingsCommand {
  baseUrl: string
  model: string
  language?: string
  apiKey?: string
  clearApiKey?: boolean
}

export interface SaveVideoSettingsCommand {
  cookieSource: VideoCookieSourceSetting
}

export interface SubmitImageTaskCommand {
  projectId: string
  idempotencyKey: string
  prompt: string
  relativePath: string
  model: ImageGenerationModel
  size?: string
  attachment?: ImageAttachmentIntent
}

export interface ImageTaskProjection {
  imageTaskId: string
  projectId: string
  idempotencyKey: string
  prompt: string
  relativePath: string
  model: ImageGenerationModel
  size?: string
  status: ImageTaskStatus
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  attachment?: ImageAttachmentProjection
}

export function isSilentImageAttachmentConflict(value: string | undefined) {
  return value === "image_attachment_conflict" || value?.startsWith("image_attachment_conflict:") === true
}

export interface ControlImageTaskCommand {
  projectId: string
  imageTaskId: string
  action: ImageTaskAction
}

export type ImageTaskEvent = { type: "image.task.changed"; task: ImageTaskProjection }

export type GrowthGoalStatus = "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"

export type GrowthObjectProgressStatus = "active" | "retryable" | "blocked" | "unknown"

export type GrowthIssueImpact = "repairable" | "local" | "blocking"

export type GrowthIssueStatus = "detected" | "repairing" | "resolved" | "bypassed" | "needs_help" | "waiting_user"

export interface GrowthIssueProjection {
  issueId: string
  goalId: string
  stageAttemptId?: string
  workItemId?: string
  errorCode: string
  impact: GrowthIssueImpact
  status: GrowthIssueStatus
  summary: string
  detail?: string
  affectedObjectIds: string[]
  attemptCount: number
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  version: number
}

export interface GrowthProgressProjection {
  phase?: string
  total: number
  completed: number
  active: number
  retryable: number
  blocked: number
  unknown: number
  currentObjects: Array<{
    title: string
    layer: string
    status: GrowthObjectProgressStatus
  }>
  errorCategory?: "critical-gap" | "attempt-limit" | "worker-failure" | "unknown-result"
}

export interface GrowthGoalProjection {
  goalId: string
  projectId: string
  sessionId: string
  instruction: string
  status: GrowthGoalStatus
  statusReason?: string
  ownerReplyPending?: boolean
  planFileId?: string
  workRootPath?: string
  worldEntryMode?: GrowthWorldEntryMode
  worldEntryStage?: GrowthWorldEntryStage
  predecessorGoalId?: string
  requiredImageTaskIds: string[]
  createdAt: string
  updatedAt: string
  version: number
  progress?: GrowthProgressProjection
  issues?: GrowthIssueProjection[]
}

export type GrowthWorldEntryMode = "create" | "continue" | "reconcile"
export type GrowthWorldEntryStage = "blueprint-create" | "blueprint-review" | "materialization"

export interface CreateGrowthGoalCommand {
  requestId: string
  projectId: string
  sessionId: string
  instruction: string
  planFileId?: string
  workRootPath?: string
  worldEntryMode?: GrowthWorldEntryMode
  worldEntryStage?: GrowthWorldEntryStage
  predecessorGoalId?: string
  requiredImageTaskIds?: string[]
}

export interface TransitionGrowthGoalCommand {
  goalId: string
  expectedVersion: number
  status: GrowthGoalStatus
  reason?: string
  planFileId?: string
  requiredImageTaskIds?: string[]
}

export interface ReopenGrowthGoalCommand {
  goalId: string
  expectedVersion: number
  userInitiated: true
}

export type GrowthGoalEvent = { type: "growth.goal.changed"; goal: GrowthGoalProjection }

export type GrowthProgressOutcome = "continue" | "waiting" | "completed" | "failed"

export interface GrowthProgressReport {
  reportId: string
  outcome: GrowthProgressOutcome
  summary: string
  nextStep?: string
  artifactPaths: string[]
  imageTaskIds: string[]
  requiredImageTaskIds: string[]
  backgroundImageTaskIds?: string[]
}

export interface GrowthProgressResult {
  goal: GrowthGoalProjection
  outcome: GrowthProgressOutcome
  duplicate: boolean
}

export interface GrowthStageIdentity {
  goalId: string
  ownerActivationId?: string
  version: number
  stageKey: string
  worldEntryMode?: GrowthWorldEntryMode
  worldEntryStage?: GrowthWorldEntryStage
  attemptId?: string
  workItemId?: string
  workItemTitle?: string
  workRootPath?: string
}

export type GrowthWorkerProfile = "growth-stage" | "growth-recovery" | "world-blueprint" | "world-research" | "world-writer" | "world-recovery"

export interface GrowthStageRunCommand {
  goalId: string
  projectId: string
  sessionId: string
  ownerActivationId?: string
  expectedVersion: number
  stageKey: string
  worldEntryMode?: GrowthWorldEntryMode
  worldEntryStage?: GrowthWorldEntryStage
  attemptId?: string
  prompt: string
  maxIterations?: number
  workItemId?: string
  workItemTitle?: string
  workRootPath?: string
  directFileMutation?: "enabled" | "disabled"
  workerProfile?: GrowthWorkerProfile
}

export interface GrowthStageRunResult {
  state: RunState
  reason?: string
  failure?: CreatXError
  failures?: GrowthStageFailure[]
}

export interface GrowthStageFailure {
  source: "tool" | "runtime"
  toolCallId?: string
  toolName?: string
  error: CreatXError
}

export const CREATX_INTERNAL_GROWTH_STAGE = "<creatx_internal_growth_stage>" as const
export const CREATX_INTERNAL_SKILL_SEQUENCE = "<creatx_internal_skill_sequence>" as const
export const CREATX_GROWTH_ACTIVATION_MARKER = "creatx_growth_activation" as const

export interface GrowthOwnerControllerResult {
  activationId: string
  goalId: string
  status: "ready_for_owner_reply"
  version: number
  goalStatus: GrowthGoalStatus
  deliveryGoalStatus?: GrowthGoalStatus
  ownerSummary?: string
  reason?: string
  workRootPath?: string
}

export type CreatXErrorCode =
  | "provider_missing_credentials"
  | "provider_unauthorized"
  | "provider_quota"
  | "provider_network"
  | "provider_model"
  | "model_settings_invalid"
  | "model_settings_conflict"
  | "model_settings_persistence"
  | "tool_failed"
  | "cancelled"
  | "command_invalid"
  | "project_invalid"
  | "file_invalid"
  | "file_conflict"
  | "attachment_invalid"
  | "attachment_missing"
  | "attachment_unreadable"
  | "workbench_invalid"
  | "workbench_conflict"
  | "blueprint_invalid"
  | "blueprint_conflict"
  | "growth_invalid"
  | "growth_conflict"
  | "growth_persistence"
  | "image_queue_invalid"
  | "image_queue_conflict"
  | "image_queue_persistence"
  | "image_attachment_invalid"
  | "image_attachment_conflict"
  | "session_invalid"
  | "session_conflict"
  | "session_persistence"
  | "session_missing"
  | "package_invalid"
  | "package_version_unsupported"
  | "package_conflict"
  | "package_persistence"
  | "package_cancelled"
  | "library_invalid"
  | "library_persistence"
  | "art_library_invalid"
  | "art_library_conflict"
  | "art_library_network"
  | "art_library_model"
  | "art_library_persistence"
  | "heritage_skill_invalid"
  | "heritage_skill_network"
  | "heritage_skill_conflict"
  | "heritage_skill_persistence"
  | "video_invalid"
  | "video_auth"
  | "video_network"
  | "video_binary"
  | "video_transcription"
  | "video_persistence"
  | "compatibility"
  | "runtime"

export interface CreatXError {
  code: CreatXErrorCode
  message: string
  detail?: string
}

export interface ApprovalRequest {
  id: string
  sessionId: string
  toolCallId: string
  toolName: string
  input: unknown
  trustWarning: string
}

export type TimelineItemKind = "message" | "reasoning" | "tool" | "notice"
export type TimelineItemState = "streaming" | "completed" | "failed" | "cancelled"
export type TimelinePresentation = "user" | "assistant" | "internal" | "system"

export interface TimelineActivity {
  kind: "growth-worker"
  activityId: string
  ownerActivationId?: string
  workItemId: string
  title: string
}

export interface TimelineItem {
  sequence: number
  itemId: string
  ownerActivationId?: string
  kind: TimelineItemKind
  presentation: TimelinePresentation
  state: TimelineItemState
  text?: string
  attachments?: MessageAttachmentProjection[]
  toolName?: string
  input?: unknown
  update?: unknown
  output?: unknown
  error?: string
  activity?: TimelineActivity
}

export type ProjectProjectionArea = "files" | "workbenches"

export type ProjectProjectionInvalidatedEvent = {
  type: "project.projection.invalidated"
  projectId: string
  areas: ProjectProjectionArea[]
}

export type CreatXEvent =
  | { type: "timeline.upsert"; sessionId: string; item: TimelineItem }
  | { type: "timeline.snapshot"; sessionId: string; items: TimelineItem[] }
  | { type: "approval.requested"; approval: ApprovalRequest }
  | { type: "approval.resolved"; sessionId: string; approvalId: string; approved: boolean }
  | { type: "run.state"; sessionId: string; state: RunState; reason?: string }
  | { type: "art_library.changed"; revision: number }
  | ProjectProjectionInvalidatedEvent
  | { type: "workbench.presentation.requested"; projectId: string; sessionId: string; workbenchId: string; entry: string }
  | ImageTaskEvent
  | GrowthGoalEvent
  | { type: "runtime.error"; sessionId?: string; error: CreatXError }

export interface DesktopBootstrap {
  harness: { name: "cline"; version: "0.0.65"; providerId: string; modelId: string; configured: boolean }
  modelSettings: ModelSettingsSnapshot
  sessions: SessionSummary[]
  project?: ProjectSnapshot
  growth?: GrowthGoalProjection
}

export type CreatXResult<T> = { ok: true; value: T } | { ok: false; error: CreatXError }
export type DesktopResult<T> = CreatXResult<T>

export type CreatXToolScope = "application" | "project"
export type CreatXToolApproval = "automatic" | "required"
export type CreatXToolAudience = "ordinary" | "skill-sequence" | "owner-growth" | "owner-growth-issue" | "owner-growth-delivery" | GrowthWorkerProfile

export interface CreatXToolExecutionContext {
  sessionId: string
  modelSupportsImages?: boolean
  ownerActivationId?: string
  projectId?: string
  growthGoalId?: string
  growthGoalVersion?: number
  growthStageKey?: string
  growthWorldEntryMode?: GrowthWorldEntryMode
  growthWorldEntryStage?: GrowthWorldEntryStage
  growthAttemptId?: string
  growthWorkItemId?: string
  growthWorkRootPath?: string
  toolCallId?: string
  signal?: AbortSignal
  emitUpdate?: (update: unknown) => void
}

export interface CreatXToolContribution {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  audiences: readonly CreatXToolAudience[]
  inputSchemaForWorkerProfile?(profile: GrowthWorkerProfile): Record<string, unknown>
  scope: CreatXToolScope
  approval: CreatXToolApproval
  timeoutMs?: number
  execute(input: unknown, context: CreatXToolExecutionContext): Promise<CreatXResult<unknown>>
}

export interface CreatXDesktopApi {
  bootstrap(): Promise<DesktopResult<DesktopBootstrap>>
  readModelSettings(): Promise<DesktopResult<ModelSettingsSnapshot>>
  saveTextModelProfile(command: SaveTextModelProfileCommand): Promise<DesktopResult<ModelSettingsSnapshot>>
  selectSessionModel(sessionId: string, profileId: string): Promise<DesktopResult<SessionSummary>>
  saveImageModelSettings(command: SaveImageModelSettingsCommand): Promise<DesktopResult<ModelSettingsSnapshot>>
  saveTranscriptionModelSettings(command: SaveTranscriptionModelSettingsCommand): Promise<DesktopResult<ModelSettingsSnapshot>>
  saveVideoSettings(command: SaveVideoSettingsCommand): Promise<DesktopResult<ModelSettingsSnapshot>>
  readImageTasks(projectId: string): Promise<DesktopResult<ImageTaskProjection[]>>
  controlImageTask(command: ControlImageTaskCommand): Promise<DesktopResult<ImageTaskProjection>>
  chooseProject(): Promise<DesktopResult<ProjectSnapshot | undefined>>
  openProject(projectId: string): Promise<DesktopResult<ProjectSnapshot>>
  revealProject(projectId: string): Promise<DesktopResult<void>>
  createSession(projectId: string, title?: string): Promise<DesktopResult<SessionSummary>>
  renameSession(sessionId: string, title: string): Promise<DesktopResult<SessionSummary>>
  deleteSession(sessionId: string): Promise<DesktopResult<void>>
  deleteProjectSessions(projectId: string): Promise<DesktopResult<string[]>>
  setSessionPermissionMode(sessionId: string, mode: SessionPermissionMode): Promise<DesktopResult<SessionSummary>>
  readTimeline(sessionId: string): Promise<DesktopResult<TimelineItem[]>>
  sendMessage(command: SendMessageCommand): Promise<DesktopResult<void>>
  steerMessage(command: SendMessageCommand): Promise<DesktopResult<void>>
  admitSharedMessage(command: SendMessageCommand, delivery: "send" | "steer"): Promise<DesktopResult<void>>
  readCreativeLibrary(): Promise<DesktopResult<CreativeLibrarySnapshot>>
  chooseCreativeLibraryImport(kind: CreativeLibraryKind): Promise<DesktopResult<CreativeLibrarySnapshot | undefined>>
  setCreativeLibraryReaction(command: SetCreativeLibraryReactionCommand): Promise<DesktopResult<CreativeLibrarySnapshot>>
  bindArtChatSession(command: BindArtChatSessionCommand): Promise<DesktopResult<CreativeLibrarySnapshot>>
  readArtLibrary(): Promise<DesktopResult<ArtLibrarySnapshot>>
  reviewArtApproval(command: ReviewArtApprovalCommand): Promise<DesktopResult<ArtLibrarySnapshot>>
  exportArtStyleKeywords(library: string): Promise<DesktopResult<ArtStyleKeywordExport>>
  chooseAttachments(): Promise<DesktopResult<AttachmentReference[]>>
  authorizeDroppedAttachments(files: readonly File[]): Promise<DesktopResult<AttachmentReference[]>>
  captureWorkbenchAnnotation(command: CaptureWorkbenchAnnotationCommand): Promise<DesktopResult<AttachmentReference>>
  sampleWorkbenchColor(command: SampleWorkbenchColorCommand): Promise<DesktopResult<string>>
  openMessageAttachment(sessionId: string, messageId: string, attachmentIndex: number): Promise<DesktopResult<void>>
  cancelRun(sessionId: string): Promise<DesktopResult<void>>
  respondApproval(approvalId: string, approved: boolean): Promise<DesktopResult<void>>
  refreshFiles(projectId: string): Promise<DesktopResult<ProjectSnapshot>>
  readFile(projectId: string, fileId: string): Promise<DesktopResult<FilePreview>>
  saveTextFile(command: SaveProjectTextCommand): Promise<DesktopResult<FilePreview>>
  readWorkbenches(projectId: string): Promise<DesktopResult<WorkbenchSnapshot>>
  resolveWorkbenchPresentation(command: ResolveWorkbenchPresentationCommand): Promise<DesktopResult<WorkbenchPresentationProjection>>
  resolveHtmlPresentation(projectId: string, fileId: string): Promise<DesktopResult<WorkbenchPresentationProjection>>
  readGrowthGoal(projectId: string): Promise<DesktopResult<GrowthGoalProjection | undefined>>
  pauseGrowth(goalId: string): Promise<DesktopResult<GrowthGoalProjection>>
  resumeGrowth(command: ResumeGrowthCommand): Promise<DesktopResult<GrowthGoalProjection>>
  cancelGrowth(goalId: string): Promise<DesktopResult<GrowthGoalProjection>>
  onEvent(listener: (event: CreatXEvent) => void): () => void
}

export function classifyRuntimeError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  const message = detail.toLowerCase()
  if (message.startsWith("model_settings_invalid")) {
    return { code: "model_settings_invalid", message: "模型配置信息无效。", detail }
  }
  if (message.startsWith("model_settings_conflict")) {
    return { code: "model_settings_conflict", message: "当前运行状态不允许切换模型。", detail }
  }
  if (message.startsWith("model_settings_persistence")) {
    return { code: "model_settings_persistence", message: "模型配置无法安全读取或保存。", detail }
  }
  if (message.startsWith("runtime_unavailable")) {
    return { code: "runtime", message: "AI 运行进程当前不可用。", detail }
  }
  // Video codes are matched by prefix before the generic includes() rules below, otherwise
  // "video_network: request timed out" would be claimed by provider_network and reported as
  // a model outage instead of a download failure.
  if (message.startsWith("video_auth")) {
    return { code: "video_auth", message: "这条视频需要登录态才能读取。", detail }
  }
  if (message.startsWith("video_binary")) {
    return { code: "video_binary", message: "视频处理组件不可用。", detail }
  }
  if (message.startsWith("video_transcription")) {
    return { code: "video_transcription", message: "语音转写服务无法完成这次转写。", detail }
  }
  if (message.startsWith("video_network")) {
    return { code: "video_network", message: "无法安全取得这条视频。", detail }
  }
  if (message.startsWith("video_persistence")) {
    return { code: "video_persistence", message: "视频分析结果无法安全保存。", detail }
  }
  if (message.startsWith("video_invalid")) {
    return { code: "video_invalid", message: "这条视频链接或分析请求无效。", detail }
  }
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("authentication") || message.includes("invalid api key") || message.includes("api key is invalid")) {
    return { code: "provider_unauthorized", message: "模型凭据未通过验证。", detail }
  }
  if (message.includes("api key") || message.includes("credential") || message.includes("missing key")) {
    return { code: "provider_missing_credentials", message: "尚未配置模型凭据。", detail }
  }
  if (message.includes("quota") || message.includes("insufficient balance") || message.includes("402") || message.includes("429")) {
    return { code: "provider_quota", message: "模型额度或请求频率受限。", detail }
  }
  if (message.includes("network") || message.includes("fetch failed") || message.includes("econn") || message.includes("timeout")) {
    return { code: "provider_network", message: "无法连接模型服务。", detail }
  }
  if (message.includes("model") && (message.includes("not found") || message.includes("invalid"))) {
    return { code: "provider_model", message: "当前模型不可用。", detail }
  }
  if (message.includes("abort") || message.includes("cancel")) {
    return { code: "cancelled", message: "本轮已取消。", detail }
  }
  if (message.includes("file_conflict")) {
    return { code: "file_conflict", message: "文件已在外部发生变化，请刷新后重试。", detail }
  }
  if (message.startsWith("attachment_invalid")) {
    return { code: "attachment_invalid", message: "附件引用无效或已经失效。", detail }
  }
  if (message.includes("attachment_missing")) {
    return { code: "attachment_missing", message: "选择的附件已经不存在。", detail }
  }
  if (message.includes("attachment_unreadable")) {
    return { code: "attachment_unreadable", message: "无法读取选择的附件。", detail }
  }
  if (message.includes("workbench_conflict")) {
    return { code: "workbench_conflict", message: "工作台记录与现有状态冲突。", detail }
  }
  if (message.includes("workbench_invalid")) {
    return { code: "workbench_invalid", message: "工作台信息无效。", detail }
  }
  if (message.includes("blueprint_conflict")) {
    return { code: "blueprint_conflict", message: "世界蓝图与现有状态冲突。", detail }
  }
  if (message.includes("blueprint_invalid")) {
    return { code: "blueprint_invalid", message: "世界蓝图输入或持久状态无效。", detail }
  }
  if (message.includes("growth_conflict")) {
    return { code: "growth_conflict", message: "Growth 目标已发生变化，请刷新后重试。", detail }
  }
  if (message.includes("growth_invalid")) {
    return { code: "growth_invalid", message: "Growth 目标操作无效。", detail }
  }
  if (message.includes("growth_persistence")) {
    return { code: "growth_persistence", message: "Growth 目标状态无法安全读取或保存。", detail }
  }
  if (message.includes("image_queue_conflict")) {
    return { code: "image_queue_conflict", message: "图片任务与现有队列状态冲突。", detail }
  }
  if (message.includes("image_queue_invalid")) {
    return { code: "image_queue_invalid", message: "图片任务请求无效。", detail }
  }
  if (message.includes("image_queue_persistence")) {
    return { code: "image_queue_persistence", message: "图片队列无法安全读取或保存。", detail }
  }
  if (message.includes("image_attachment_conflict")) {
    return { code: "image_attachment_conflict", message: "文章在挂接图片前发生变化或锚点不唯一。", detail }
  }
  if (message.includes("image_attachment_invalid")) {
    return { code: "image_attachment_invalid", message: "文章图片挂接请求无效。", detail }
  }
  if (message.includes("session is owned by live process") || message.includes("session ownership changed to process")) {
    return { code: "session_conflict", message: "此会话正在另一个诺文窗口中使用。", detail }
  }
  if (message.includes("session_conflict")) {
    return { code: "session_conflict", message: "会话配置已经发生变化。", detail }
  }
  if (message.includes("session_invalid")) {
    return { code: "session_invalid", message: "会话配置无效。", detail }
  }
  if (message.includes("session_persistence")) {
    return { code: "session_persistence", message: "会话配置无法安全读取或保存。", detail }
  }
  if (message.includes("library_invalid")) {
    return { code: "library_invalid", message: "创作资料库导入内容无效。", detail }
  }
  if (message.includes("library_persistence")) {
    return { code: "library_persistence", message: "创作资料库无法安全读取或保存。", detail }
  }
  if (message.includes("art_library_conflict")) {
    return { code: "art_library_conflict", message: "艺术库条目与现有状态冲突。", detail }
  }
  if (message.includes("art_library_network") || message.includes("art_network")) {
    return { code: "art_library_network", message: "艺术库无法安全读取网络图片。", detail }
  }
  if (message.includes("art_library_model") || message.includes("provider_capability")) {
    return { code: "art_library_model", message: "当前模型不支持图片识读。", detail }
  }
  if (message.includes("art_library_invalid") || message.includes("art_library_missing") || message.includes("art_image")) {
    return { code: "art_library_invalid", message: "艺术库请求或图片无效。", detail }
  }
  if (message.includes("art_library_persistence")) {
    return { code: "art_library_persistence", message: "个人艺术库无法安全读取或保存。", detail }
  }
  return { code: "runtime", message: "运行时发生错误。", detail }
}
