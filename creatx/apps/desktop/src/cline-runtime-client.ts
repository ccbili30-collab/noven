import { randomUUID } from "node:crypto"
import { utilityProcess } from "electron"
import type {
  ClineGrowthFailureCallback,
  ClineModelConnection,
  ClineRuntimeInitialization,
  ClineRuntimeInvoke,
  ClineRuntimeMessage,
  ClineRuntimeResponse,
  ClineSessionRecord,
  ClineToolDescriptor,
  ClineUserAttachments,
} from "@creatx/cline-adapter/contracts"
import type {
  CreatXEvent,
  CreatXToolContribution,
  GrowthStageFailure,
  GrowthStageRunCommand,
  GrowthStageRunResult,
  GrowthWorkerProfile,
  ImageTaskStatus,
  PortableConversationV1,
  SessionPermissionMode,
} from "@creatx/contracts"

interface ClineRuntimeClientOptions extends Omit<ClineRuntimeInitialization, "tools"> {
  entryPath: string
  tools: readonly CreatXToolContribution[]
  onEvent: (event: CreatXEvent) => void
  imageTaskStatus: (projectId: string, imageTaskId: string) => Promise<ImageTaskStatus | undefined>
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class ClineRuntimeClient {
  private readonly child: ReturnType<typeof utilityProcess.fork>
  private readonly tools: Map<string, CreatXToolContribution>
  private readonly onEvent: (event: CreatXEvent) => void
  private readonly imageTaskStatus: ClineRuntimeClientOptions["imageTaskStatus"]
  private readonly requests = new Map<string, PendingRequest>()
  private readonly callbacks = new Map<string, Map<string, (...args: never[]) => unknown | Promise<unknown>>>()
  private readonly toolControllers = new Map<string, AbortController>()
  private deadReason: string | undefined
  private defaultConnection: ClineModelConnection

  private constructor(options: ClineRuntimeClientOptions) {
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]))
    this.onEvent = options.onEvent
    this.imageTaskStatus = options.imageTaskStatus
    this.defaultConnection = options.defaultConnection
    this.child = utilityProcess.fork(options.entryPath, [], { serviceName: "CreatX Cline Runtime" })
    this.child.on("message", (message) => {
      void this.receive(message as ClineRuntimeResponse).catch((error) => this.failClosed(`runtime_unavailable: Cline Runtime IPC failed: ${messageOf(error)}`))
    })
    this.child.on("exit", (code) => this.failClosed(`runtime_unavailable: Cline Utility Process exited with code ${String(code)}`))
  }

  static async create(options: ClineRuntimeClientOptions) {
    const client = new ClineRuntimeClient(options)
    try {
      await client.request({
        type: "initialize",
        requestId: randomUUID(),
        options: {
          userDataDir: options.userDataDir,
          dataDir: options.dataDir,
          permissionStorePath: options.permissionStorePath,
          defaultConnection: options.defaultConnection,
          connections: options.connections,
          tools: options.tools.map(toolDescriptor),
          systemGuidance: options.systemGuidance,
          skillDirectories: options.skillDirectories,
          skills: options.skills,
          workerSkills: options.workerSkills,
        },
      })
      return client
    } catch (error) {
      client.child.kill()
      throw error
    }
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

  async setDefaultConnection(connection: ClineModelConnection) {
    await this.invoke({ method: "setDefaultConnection", args: [connection] })
    this.defaultConnection = connection
  }

  replaceConnections(connections: readonly ClineModelConnection[]) {
    return this.invoke<void>({ method: "replaceConnections", args: [connections] })
  }

  createProjectSession(project: { projectId: string; projectRoot: string; title?: string }) {
    return this.invoke<ClineSessionRecord>({ method: "createProjectSession", args: [project] })
  }

  sendMessage(sessionId: string, prompt: string, input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    return this.invoke<void>({ method: "sendMessage", args: [sessionId, prompt, input] }, { admitted: onAdmitted })
  }

  sendSkillSequence(sessionId: string, prompt: string, skillSequence: readonly string[], input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    return this.invoke({ method: "sendSkillSequence", args: [sessionId, prompt, skillSequence, input] }, { admitted: onAdmitted })
  }

  sendGrowthMessage(sessionId: string, prompt: string, ownerActivationId: string, onAdmitted?: () => void, onOwnerReplyPersisted?: (reply: string, result: "success" | "error") => Promise<void>, signal?: AbortSignal) {
    return this.invoke<string>({ method: "sendGrowthMessage", args: [sessionId, prompt, ownerActivationId], abortable: true }, { admitted: onAdmitted, ownerReplyPersisted: onOwnerReplyPersisted }, signal)
  }

  sendGrowthIssueMessage(sessionId: string, prompt: string, ownerActivationId: string, onAdmitted?: () => void, onOwnerReplyPersisted?: (reply: string, calls: number, result: "none" | "success" | "error") => Promise<void>, signal?: AbortSignal) {
    return this.invoke<string>({ method: "sendGrowthIssueMessage", args: [sessionId, prompt, ownerActivationId], abortable: true }, { admitted: onAdmitted, ownerReplyPersisted: onOwnerReplyPersisted }, signal)
  }

  sendOwnerResultDelivery(sessionId: string, ownerActivationId: string, onOwnerReplyPersisted: (reply: string) => Promise<void>, signal?: AbortSignal) {
    return this.invoke<string>({ method: "sendOwnerResultDelivery", args: [sessionId, ownerActivationId], callbacks: ["ownerReplyPersisted"], abortable: true }, { ownerReplyPersisted: onOwnerReplyPersisted }, signal)
  }

  findPersistedOwnerGrowthReply(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    return this.invoke<{ controllerCallCount: number; reply: string } | undefined>({ method: "findPersistedOwnerGrowthReply", args: [sessionId, ownerActivationId, controllerToolName] })
  }

  findPersistedOwnerTurn(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    return this.invoke<{ controllerCallCount: number; controllerResult: "none" | "success" | "error"; reply: string | undefined } | undefined>({ method: "findPersistedOwnerTurn", args: [sessionId, ownerActivationId, controllerToolName] })
  }

  hasPersistedOwnerControllerResult(sessionId: string, ownerActivationId: string, controllerToolName: string) {
    return this.invoke<boolean>({ method: "hasPersistedOwnerControllerResult", args: [sessionId, ownerActivationId, controllerToolName] })
  }

  switchSessionConnection(sessionId: string, connection: ClineModelConnection) {
    return this.invoke<ClineSessionRecord>({ method: "switchSessionConnection", args: [sessionId, connection] })
  }

  runGrowthStage(command: GrowthStageRunCommand, signal?: AbortSignal, onFailure?: ClineGrowthFailureCallback): Promise<GrowthStageRunResult> {
    return this.invoke({ method: "runGrowthStage", args: [command], abortable: true }, { failure: onFailure }, signal)
  }

  runGrowthStageBatch(commands: GrowthStageRunCommand[], signal?: AbortSignal, failureObservers: readonly (((failure: GrowthStageFailure) => void) | undefined)[] = []): Promise<GrowthStageRunResult[]> {
    return this.invoke({ method: "runGrowthStageBatch", args: [commands], abortable: true }, Object.fromEntries(failureObservers.flatMap((observer, index) => observer ? [[`failure:${index}`, observer]] : [])), signal)
  }

  findCompletedGrowthStage(input: { sessionId: string; goalId: string; attemptId: string }) {
    return this.invoke<{ state: "completed"; reason: string } | undefined>({ method: "findCompletedGrowthStage", args: [input] })
  }

  cancel(sessionId: string) {
    return this.invoke<void>({ method: "cancel", args: [sessionId] })
  }

  steer(sessionId: string, prompt: string, input: ClineUserAttachments = {}, onAdmitted?: () => void) {
    return this.invoke<void>({ method: "steer", args: [sessionId, prompt, input] }, { admitted: onAdmitted })
  }

  abortRun(sessionId: string, reason: string) {
    return this.invoke<void>({ method: "abortRun", args: [sessionId, reason] })
  }

  setSessionPermissionMode(sessionId: string, mode: SessionPermissionMode) {
    return this.invoke<ClineSessionRecord>({ method: "setSessionPermissionMode", args: [sessionId, mode] })
  }

  renameSession(sessionId: string, title: string) {
    return this.invoke<ClineSessionRecord>({ method: "renameSession", args: [sessionId, title] })
  }

  resolveApproval(approvalId: string, approved: boolean) {
    return this.invoke<void>({ method: "resolveApproval", args: [approvalId, approved] })
  }

  listSessions(limit = 100) {
    return this.invoke<ClineSessionRecord[]>({ method: "listSessions", args: [limit] })
  }

  setProjectCase(sessionId: string, included: boolean) {
    return this.invoke<boolean>({ method: "setProjectCase", args: [sessionId, included] })
  }

  listProjectCaseSessions(projectId: string) {
    return this.invoke<ClineSessionRecord[]>({ method: "listProjectCaseSessions", args: [projectId] })
  }

  exportProjectCase(input: { projectId: string; sessionId: string; title: string; purpose: string; conclusion: string; continuationBrief: string; exportedFilePaths: readonly string[] }, signal?: AbortSignal) {
    return this.invoke<PortableConversationV1>({ method: "exportProjectCase", args: [input] }, {}, signal)
  }

  deleteSession(sessionId: string) {
    return this.invoke<void>({ method: "deleteSession", args: [sessionId] })
  }

  cleanupGrowthWorkers(ownerSessionId: string, goalId: string) {
    return this.invoke<{ deletedSessionIds: string[]; deferredSessionIds: string[]; failedSessionIds: string[] }>({ method: "cleanupGrowthWorkers", args: [ownerSessionId, goalId] })
  }

  deleteSessions(sessionIds: readonly string[]) {
    return this.invoke<string[]>({ method: "deleteSessions", args: [sessionIds] })
  }

  readTimeline(sessionId: string) {
    return this.invoke({ method: "readTimeline", args: [sessionId] })
  }

  readMessages(sessionId: string) {
    return this.invoke({ method: "readMessages", args: [sessionId] })
  }

  resolveMessageAttachment(sessionId: string, messageId: string, attachmentIndex: number) {
    return this.invoke<string>({ method: "resolveMessageAttachment", args: [sessionId, messageId, attachmentIndex] })
  }

  resolveMessageImage(sessionId: string, messageId: string, attachmentIndex: number) {
    return this.invoke<{ mediaType: "image/png" | "image/jpeg"; bytes: Uint8Array }>({ method: "resolveMessageImage", args: [sessionId, messageId, attachmentIndex] })
  }

  allocateProjectConversationTitle(projectId: string) {
    return this.invoke<string>({ method: "allocateProjectConversationTitle", args: [projectId] })
  }

  getSessionPermissionMode(sessionId: string) {
    return this.invoke<SessionPermissionMode | undefined>({ method: "getSessionPermissionMode", args: [sessionId] })
  }

  async dispose() {
    if (this.deadReason) return
    await this.invoke<void>({ method: "dispose", args: [] }).catch(() => undefined)
    this.child.kill()
  }

  private invoke<T>(invocation: ClineRuntimeInvoke, callbacks: Record<string, ((...args: never[]) => unknown) | undefined> = {}, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const requestId = randomUUID()
    const invocationId = randomUUID()
    this.callbacks.set(invocationId, new Map(Object.entries(callbacks).filter((entry): entry is [string, (...args: never[]) => unknown] => Boolean(entry[1]))))
    const abort = () => this.post({ type: "abort", invocationId, reason: messageOf(signal?.reason ?? "Operation cancelled") })
    signal?.addEventListener("abort", abort, { once: true })
    return this.request<T>({ type: "invoke", requestId, invocationId, invocation }).finally(() => {
      signal?.removeEventListener("abort", abort)
      this.callbacks.delete(invocationId)
    })
  }

  private request<T>(message: Extract<ClineRuntimeMessage, { type: "initialize" | "invoke" }>) {
    if (this.deadReason) return Promise.reject(new Error(this.deadReason))
    const result = new Promise<T>((resolve, reject) => this.requests.set(message.requestId, { resolve: (value) => resolve(value as T), reject }))
    this.post(message)
    return result.finally(() => this.requests.delete(message.requestId))
  }

  private async receive(message: ClineRuntimeResponse) {
    if (message.type === "result") {
      const request = this.requests.get(message.requestId)
      if (!request) return
      if (message.ok) request.resolve(message.value)
      else request.reject(new Error(message.error))
      return
    }
    if (message.type === "event") {
      this.onEvent(message.event)
      return
    }
    if (message.type === "fatal") {
      this.failClosed(`runtime_unavailable: Cline Utility Process failed: ${message.error}`)
      return
    }
    if (message.type === "callback") {
      const callback = this.callbacks.get(message.invocationId)?.get(message.name)
      await this.respond(message.callbackId, async () => callback ? (callback as (...args: unknown[]) => unknown)(...message.args) : undefined)
      return
    }
    if (message.type === "tool.call") {
      await this.executeTool(message)
      return
    }
    if (message.type === "tool.cancel") {
      this.toolControllers.get(message.callId)?.abort(new Error(message.reason))
      return
    }
    if (message.type === "host.imageTaskStatus") await this.respondHost(message.requestId, () => this.imageTaskStatus(message.projectId, message.imageTaskId))
  }

  private async executeTool(message: Extract<ClineRuntimeResponse, { type: "tool.call" }>) {
    const tool = this.tools.get(message.name)
    if (!tool) {
      this.post({ type: "tool.result", callId: message.callId, ok: false, error: `compatibility: unknown remote tool ${message.name}` })
      return
    }
    const controller = new AbortController()
    this.toolControllers.set(message.callId, controller)
    try {
      const value = await tool.execute(message.input, {
        ...message.context,
        signal: controller.signal,
        emitUpdate: (update) => this.post({ type: "tool.update", callId: message.callId, update }),
      })
      this.post({ type: "tool.result", callId: message.callId, ok: true, value })
    } catch (error) {
      this.post({ type: "tool.result", callId: message.callId, ok: false, error: messageOf(error) })
    } finally {
      this.toolControllers.delete(message.callId)
    }
  }

  private async respond(callbackId: string, execute: () => unknown | Promise<unknown>) {
    try {
      this.post({ type: "callback.result", callbackId, ok: true, value: await execute() })
    } catch (error) {
      this.post({ type: "callback.result", callbackId, ok: false, error: messageOf(error) })
    }
  }

  private async respondHost(requestId: string, execute: () => unknown | Promise<unknown>) {
    try {
      this.post({ type: "host.result", requestId, ok: true, value: await execute() })
    } catch (error) {
      this.post({ type: "host.result", requestId, ok: false, error: messageOf(error) })
    }
  }

  private post(message: ClineRuntimeMessage) {
    if (this.deadReason) throw new Error(this.deadReason)
    this.child.postMessage(message)
  }

  private failClosed(reason: string) {
    if (this.deadReason) return
    this.deadReason = reason
    for (const request of this.requests.values()) request.reject(new Error(reason))
    for (const controller of this.toolControllers.values()) controller.abort(new Error(reason))
    this.onEvent({ type: "runtime.error", error: { code: "runtime", message: "AI 运行进程已停止，当前操作没有被标记为成功。", detail: reason } })
    this.child.kill()
  }
}

function toolDescriptor(tool: CreatXToolContribution): ClineToolDescriptor {
  const workerAudiences = tool.audiences.filter((audience): audience is GrowthWorkerProfile => !["ordinary", "skill-sequence", "owner-growth", "owner-growth-issue", "owner-growth-delivery"].includes(audience))
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    audiences: tool.audiences,
    ...(tool.inputSchemaForWorkerProfile && workerAudiences.length ? { inputSchemasByWorkerProfile: Object.fromEntries(workerAudiences.map((profile) => [profile, tool.inputSchemaForWorkerProfile!(profile)])) } : {}),
    scope: tool.scope,
    approval: tool.approval,
    ...(tool.timeoutMs ? { timeoutMs: tool.timeoutMs } : {}),
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
