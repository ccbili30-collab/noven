import { randomUUID } from "node:crypto"
import { ClineAdapter } from "@creatx/cline-adapter"
import type {
  ClineModelConnection,
  ClineRuntimeInitialization,
  ClineRuntimeInvoke,
  ClineRuntimeMessage,
  ClineRuntimeResponse,
  ClineToolDescriptor,
} from "@creatx/cline-adapter/contracts"
import type { CreatXResult, CreatXToolContribution, CreatXToolExecutionContext } from "@creatx/contracts"
import { projectId } from "@creatx/project-files"
import { SessionPermissionStore } from "@creatx/session-runtime"
import { promotePendingLiveArchives } from "@creatx/live-archive-runtime"

const port = process.parentPort
if (!port) throw new Error("runtime_unavailable: Cline Utility Process has no parent port")

let adapter: ClineAdapter | undefined
let permissions: SessionPermissionStore | undefined
let connections = new Map<string, ClineModelConnection>()
const invocations = new Map<string, AbortController>()
const pendingCallbacks = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
const pendingTools = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; emitUpdate?: (update: unknown) => void }>()
const pendingHostRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

port.on("message", (event) => {
  void receive(event.data as ClineRuntimeMessage).catch((error) => post({ type: "fatal", error: messageOf(error) }))
})

async function receive(message: ClineRuntimeMessage) {
  if (message.type === "initialize") {
    await respond(message.requestId, () => initialize(message.options))
    return
  }
  if (message.type === "invoke") {
    const controller = new AbortController()
    invocations.set(message.invocationId, controller)
    await respond(message.requestId, () => invoke(message.invocationId, message.invocation, controller.signal))
    invocations.delete(message.invocationId)
    return
  }
  if (message.type === "abort") {
    invocations.get(message.invocationId)?.abort(new Error(message.reason))
    return
  }
  if (message.type === "callback.result") {
    settlePending(pendingCallbacks, message.callbackId, message)
    return
  }
  if (message.type === "tool.result") {
    settlePending(pendingTools, message.callId, message)
    return
  }
  if (message.type === "tool.update") {
    pendingTools.get(message.callId)?.emitUpdate?.(message.update)
    return
  }
  if (message.type === "host.result") settlePending(pendingHostRequests, message.requestId, message)
}

async function initialize(options: ClineRuntimeInitialization) {
  if (adapter) throw new Error("runtime_conflict: Cline Utility Process is already initialized")
  const promotedArchives = await promotePendingLiveArchives(options.userDataDir)
  promotedArchives.forEach((archive) => console.info(`[live_archive_promoted] ${archive.archiveId} ${archive.projectRoot}`))
  permissions = new SessionPermissionStore(options.permissionStorePath)
  connections = new Map(options.connections.flatMap(connectionEntries))
  adapter = await ClineAdapter.create({
    dataDir: options.dataDir,
    ...options.defaultConnection,
    resolveModelConnection: (providerId, modelId, profileId) => connections.get(connectionKey({ providerId, modelId, ...(profileId ? { profileId } : {}) })),
    tools: options.tools.map(remoteTool),
    systemGuidance: options.systemGuidance,
    skillDirectories: options.skillDirectories,
    skills: options.skills,
    workerSkills: options.workerSkills,
    resolveProjectId: (root) => projectId(root),
    imageTaskStatus: (projectId, imageTaskId) => hostRequest("host.imageTaskStatus", { projectId, imageTaskId }),
    sessionPermissions: permissions,
    onEvent: (event) => post({ type: "event", event }),
  })
  return { providerId: adapter.providerId, modelId: adapter.modelId, configured: adapter.configured }
}

async function invoke(invocationId: string, invocation: ClineRuntimeInvoke, signal: AbortSignal): Promise<unknown> {
  if (!adapter || !permissions) throw new Error("runtime_unavailable: Cline Utility Process is not initialized")
  const callback = (name: string) => (...args: unknown[]) => callParent(invocationId, name, args)
  if (invocation.method === "sendMessage") return adapter.sendMessage(...invocation.args, () => { void callback("admitted")().catch(reportCallbackFailure) })
  if (invocation.method === "sendSkillSequence") return adapter.sendSkillSequence(...invocation.args, () => { void callback("admitted")().catch(reportCallbackFailure) })
  if (invocation.method === "sendGrowthMessage") return adapter.sendGrowthMessage(...invocation.args, () => { void callback("admitted")().catch(reportCallbackFailure) }, async (...args) => { await callback("ownerReplyPersisted")(...args) }, signal)
  if (invocation.method === "sendGrowthIssueMessage") return adapter.sendGrowthIssueMessage(...invocation.args, () => { void callback("admitted")().catch(reportCallbackFailure) }, async (...args) => { await callback("ownerReplyPersisted")(...args) }, signal)
  if (invocation.method === "sendOwnerResultDelivery") return adapter.sendOwnerResultDelivery(...invocation.args, async (...args) => { await callback("ownerReplyPersisted")(...args) }, signal)
  if (invocation.method === "steer") return adapter.steer(...invocation.args, () => { void callback("admitted")().catch(reportCallbackFailure) })
  if (invocation.method === "runGrowthStage") return adapter.runGrowthStage(invocation.args[0], signal, (failure) => { void callParent(invocationId, "failure", [failure]) })
  if (invocation.method === "runGrowthStageBatch") return adapter.runGrowthStageBatch(invocation.args[0], signal, invocation.args[0].map((_command, index) => (failure) => { void callParent(invocationId, `failure:${index}`, [failure]) }))
  if (invocation.method === "exportProjectCase") return adapter.exportProjectCase(invocation.args[0], signal)
  if (invocation.method === "setDefaultConnection") {
    adapter.setDefaultConnection(invocation.args[0])
    return undefined
  }
  if (invocation.method === "replaceConnections") {
    connections = new Map(invocation.args[0].flatMap(connectionEntries))
    return undefined
  }
  if (invocation.method === "allocateProjectConversationTitle") return permissions.allocateProjectConversationTitle(invocation.args[0])
  if (invocation.method === "getSessionPermissionMode") return permissions.get(invocation.args[0])?.mode
  if (invocation.method === "dispose") {
    await adapter.dispose()
    permissions.close()
    adapter = undefined
    permissions = undefined
    return undefined
  }
  if (invocation.method === "resolveApproval") {
    adapter.resolveApproval(...invocation.args)
    return undefined
  }
  const method = adapter[invocation.method]
  if (typeof method !== "function") throw new Error(`compatibility: unsupported Cline Utility Process method ${invocation.method}`)
  return Reflect.apply(method, adapter, invocation.args)
}

function remoteTool(descriptor: ClineToolDescriptor): CreatXToolContribution {
  return {
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    audiences: descriptor.audiences,
    ...(descriptor.inputSchemasByWorkerProfile ? { inputSchemaForWorkerProfile: (profile) => descriptor.inputSchemasByWorkerProfile?.[profile] ?? descriptor.inputSchema } : {}),
    scope: descriptor.scope,
    approval: descriptor.approval,
    ...(descriptor.timeoutMs ? { timeoutMs: descriptor.timeoutMs } : {}),
    execute: (input, context) => executeRemoteTool(descriptor.name, input, context),
  }
}

async function executeRemoteTool(name: string, input: unknown, context: CreatXToolExecutionContext): Promise<CreatXResult<unknown>> {
  context.signal?.throwIfAborted()
  const callId = randomUUID()
  const result = new Promise<unknown>((resolve, reject) => pendingTools.set(callId, { resolve, reject, ...(context.emitUpdate ? { emitUpdate: context.emitUpdate } : {}) }))
  const abort = () => post({ type: "tool.cancel", callId, reason: messageOf(context.signal?.reason ?? "Tool execution cancelled") })
  context.signal?.addEventListener("abort", abort, { once: true })
  post({ type: "tool.call", callId, name, input, context: serializableToolContext(context) })
  try {
    return await result as CreatXResult<unknown>
  } finally {
    context.signal?.removeEventListener("abort", abort)
    pendingTools.delete(callId)
  }
}

function callParent(invocationId: string, name: string, args: unknown[]) {
  const callbackId = randomUUID()
  const result = new Promise<unknown>((resolve, reject) => pendingCallbacks.set(callbackId, { resolve, reject }))
  post({ type: "callback", callbackId, invocationId, name, args })
  return result.finally(() => pendingCallbacks.delete(callbackId))
}

function hostRequest<T>(type: "host.imageTaskStatus", input: { projectId: string; imageTaskId: string }) {
  const requestId = randomUUID()
  const result = new Promise<T>((resolve, reject) => pendingHostRequests.set(requestId, { resolve: (value) => resolve(value as T), reject }))
  post({ type, requestId, ...input })
  return result.finally(() => pendingHostRequests.delete(requestId))
}

async function respond(requestId: string, execute: () => unknown | Promise<unknown>) {
  try {
    post({ type: "result", requestId, ok: true, value: await execute() })
  } catch (error) {
    post({ type: "result", requestId, ok: false, error: messageOf(error) })
  }
}

function settlePending<T extends { resolve: (value: unknown) => void; reject: (error: Error) => void }>(pending: Map<string, T>, id: string, result: { ok: true; value: unknown } | { ok: false; error: string }) {
  const request = pending.get(id)
  if (!request) return
  if (result.ok) request.resolve(result.value)
  else request.reject(new Error(result.error))
}

function connectionKey(connection: Pick<ClineModelConnection, "providerId" | "modelId" | "profileId">) {
  return connection.profileId ? `profile:${connection.profileId}` : `model:${connection.providerId}\0${connection.modelId}`
}

function connectionEntries(connection: ClineModelConnection): Array<[string, ClineModelConnection]> {
  return connection.profileId
    ? [[connectionKey(connection), connection], [connectionKey({ providerId: connection.providerId, modelId: connection.modelId }), connection]]
    : [[connectionKey(connection), connection]]
}

function reportCallbackFailure(error: unknown) {
  post({ type: "fatal", error: `runtime_callback: ${messageOf(error)}` })
}

function serializableToolContext(context: CreatXToolExecutionContext) {
  return Object.fromEntries(Object.entries(context).filter(([key]) => key !== "signal" && key !== "emitUpdate")) as Omit<CreatXToolExecutionContext, "signal" | "emitUpdate">
}

function post(message: ClineRuntimeResponse | ClineRuntimeMessage) {
  port.postMessage(message)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

process.on("uncaughtException", (error) => post({ type: "fatal", error: messageOf(error) }))
process.on("unhandledRejection", (error) => post({ type: "fatal", error: messageOf(error) }))
