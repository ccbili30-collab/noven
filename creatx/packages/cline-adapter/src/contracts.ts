import type {
  CreatXEvent,
  CreatXToolAudience,
  CreatXToolExecutionContext,
  CreatXToolScope,
  GrowthStageFailure,
  GrowthStageRunCommand,
  GrowthWorkerProfile,
  SessionKind,
  SessionPermissionMode,
} from "@creatx/contracts"

export const MACHINE_TRUST_WARNING = "批准后，Cline 的文件或命令工具可能访问这台电脑上的项目目录以外位置。请检查工具名称和输入。"

export interface ClineModelConnection {
  profileId?: string
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
}

export interface ClineSessionRecord {
  id: string
  title: string
  projectRoot: string
  status: string
  startedAt: string
  updatedAt: string
  providerId: string
  modelId: string
  kind: SessionKind
  permissionMode: SessionPermissionMode
}

export interface ClineUserAttachments {
  userFiles?: readonly string[]
  userImages?: readonly string[]
}

export interface ClineToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  audiences: readonly CreatXToolAudience[]
  inputSchemasByWorkerProfile?: Partial<Record<GrowthWorkerProfile, Record<string, unknown>>>
  scope: CreatXToolScope
  approval: "automatic" | "required"
  timeoutMs?: number
}

export interface ClineRuntimeInitialization {
  userDataDir: string
  dataDir: string
  permissionStorePath: string
  defaultConnection: ClineModelConnection
  connections: readonly ClineModelConnection[]
  tools: readonly ClineToolDescriptor[]
  systemGuidance: readonly string[]
  skillDirectories: readonly string[]
  skills: readonly string[]
  workerSkills: Partial<Record<GrowthWorkerProfile, readonly string[]>>
}

export type ClineRuntimeInvoke =
  | { method: "createProjectSession"; args: [{ projectId: string; projectRoot: string; title?: string }] }
  | { method: "sendMessage"; args: [string, string, ClineUserAttachments]; callbacks?: ["admitted"] }
  | { method: "sendSkillSequence"; args: [string, string, readonly string[], ClineUserAttachments]; callbacks?: ["admitted"] }
  | { method: "sendGrowthMessage"; args: [string, string, string]; callbacks?: ["admitted", "ownerReplyPersisted"]; abortable?: true }
  | { method: "sendGrowthIssueMessage"; args: [string, string, string]; callbacks?: ["admitted", "ownerReplyPersisted"]; abortable?: true }
  | { method: "sendOwnerResultDelivery"; args: [string, string]; callbacks: ["ownerReplyPersisted"]; abortable?: true }
  | { method: "findPersistedOwnerGrowthReply"; args: [string, string, string] }
  | { method: "findPersistedOwnerTurn"; args: [string, string, string] }
  | { method: "hasPersistedOwnerControllerResult"; args: [string, string, string] }
  | { method: "switchSessionConnection"; args: [string, ClineModelConnection] }
  | { method: "runGrowthStage"; args: [GrowthStageRunCommand]; callbacks?: ["failure"]; abortable?: true }
  | { method: "runGrowthStageBatch"; args: [GrowthStageRunCommand[]]; callbacks?: string[]; abortable?: true }
  | { method: "findCompletedGrowthStage"; args: [{ sessionId: string; goalId: string; attemptId: string }] }
  | { method: "cancel"; args: [string] }
  | { method: "steer"; args: [string, string, ClineUserAttachments]; callbacks?: ["admitted"] }
  | { method: "abortRun"; args: [string, string] }
  | { method: "setSessionPermissionMode"; args: [string, SessionPermissionMode] }
  | { method: "renameSession"; args: [string, string] }
  | { method: "resolveApproval"; args: [string, boolean] }
  | { method: "listSessions"; args: [number?] }
  | { method: "setProjectCase"; args: [string, boolean] }
  | { method: "listProjectCaseSessions"; args: [string] }
  | { method: "exportProjectCase"; args: [{ projectId: string; sessionId: string; title: string; purpose: string; conclusion: string; continuationBrief: string; exportedFilePaths: readonly string[] }]; abortable?: true }
  | { method: "deleteSession"; args: [string] }
  | { method: "cleanupGrowthWorkers"; args: [string, string] }
  | { method: "deleteSessions"; args: [readonly string[]] }
  | { method: "readTimeline"; args: [string] }
  | { method: "readMessages"; args: [string] }
  | { method: "resolveMessageAttachment"; args: [string, string, number] }
  | { method: "resolveMessageImage"; args: [string, string, number] }
  | { method: "setDefaultConnection"; args: [ClineModelConnection] }
  | { method: "replaceConnections"; args: [readonly ClineModelConnection[]] }
  | { method: "allocateProjectConversationTitle"; args: [string] }
  | { method: "getSessionPermissionMode"; args: [string] }
  | { method: "dispose"; args: [] }

export type ClineRuntimeMessage =
  | { type: "initialize"; requestId: string; options: ClineRuntimeInitialization }
  | { type: "invoke"; requestId: string; invocationId: string; invocation: ClineRuntimeInvoke }
  | { type: "abort"; invocationId: string; reason: string }
  | { type: "callback.result"; callbackId: string; ok: true; value: unknown }
  | { type: "callback.result"; callbackId: string; ok: false; error: string }
  | { type: "tool.result"; callId: string; ok: true; value: unknown }
  | { type: "tool.result"; callId: string; ok: false; error: string }
  | { type: "tool.update"; callId: string; update: unknown }
  | { type: "host.result"; requestId: string; ok: true; value: unknown }
  | { type: "host.result"; requestId: string; ok: false; error: string }

export type ClineRuntimeResponse =
  | { type: "result"; requestId: string; ok: true; value: unknown }
  | { type: "result"; requestId: string; ok: false; error: string }
  | { type: "event"; event: CreatXEvent }
  | { type: "callback"; callbackId: string; invocationId: string; name: string; args: unknown[] }
  | { type: "tool.call"; callId: string; name: string; input: unknown; context: Omit<CreatXToolExecutionContext, "signal" | "emitUpdate"> }
  | { type: "tool.cancel"; callId: string; reason: string }
  | { type: "host.imageTaskStatus"; requestId: string; projectId: string; imageTaskId: string }
  | { type: "fatal"; error: string }

export type ClineGrowthFailureCallback = (failure: GrowthStageFailure) => void
