import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ClineCore,
  CoreSessionService,
  createTool,
  SqliteSessionStore,
  type Message,
} from "@cline/sdk"

const ACTIVATION = "/growth_world_pro 创建一个完整世界"
const TOOL_NAME = "run_growth"
const TOOL_RESULT = "GROWTH_RESULT:正文 12/12 层完成，141/141 对象完成，图片队列独立继续。"
const FINAL_REPLY = "世界正文已经完成，十二层与全部对象均已写入工作台；图片队列会独立继续处理。"
const FOLLOW_UP = "完成了吗？"
const FOLLOW_UP_REPLY = "已经完成。刚才的正式汇报仍在当前会话中。"
const FAILURE = "GROWTH_BLOCKED:缺少用户必须决定的世界边界。"
const FAILURE_REPLY = "这次生长没有完成：还需要你决定世界边界。"
const CANCEL_PROMPT = "/growth_world_pro 创建一个随后取消的世界"
const CANCEL_FOLLOW_UP = "刚才取消了吗？"
const CANCEL_REPLY = "已经取消，原来的生长任务不会继续回写。"

const projectRoot = await mkdtemp(join(tmpdir(), "creatx-owner-growth-project-"))
const dataDir = await mkdtemp(join(tmpdir(), "creatx-owner-growth-data-"))
let sessionId = ""

try {
  const first = await createRuntime(dataDir, growthProviderFetch(), [growthTool()])
  try {
    const started = await first.core.start(sessionInput(projectRoot, [growthTool()]))
    sessionId = started.sessionId
    const result = await first.core.send({ sessionId, prompt: ACTIVATION, timeoutMs: 30_000 })
    requireText(result?.text, FINAL_REPLY, "Owner final reply")
    requireConversation(await first.core.readMessages(sessionId), [ACTIVATION, TOOL_RESULT, FINAL_REPLY])
  } finally {
    await first.dispose()
  }

  const second = await createRuntime(dataDir, followUpProviderFetch(), [])
  try {
    const messages = await second.core.readMessages(sessionId)
    requireConversation(messages, [ACTIVATION, TOOL_RESULT, FINAL_REPLY])
    await second.core.start({
      ...sessionInput(projectRoot, []),
      initialMessages: messages,
      config: {
        ...sessionInput(projectRoot, []).config,
        sessionId,
      },
    })
    const result = await second.core.send({ sessionId, prompt: FOLLOW_UP, timeoutMs: 30_000 })
    requireText(result?.text, FOLLOW_UP_REPLY, "follow-up reply")
    requireConversation(await second.core.readMessages(sessionId), [ACTIVATION, TOOL_RESULT, FINAL_REPLY, FOLLOW_UP, FOLLOW_UP_REPLY])
  } finally {
    await second.dispose()
  }

  const failurePassed = await runFailureCase()
  const cancellationPassed = await runCancellationCase()

  console.log(JSON.stringify({
    status: "OWNER GROWTH RESULT KERNEL PASS",
    sdkVersion: "0.0.65",
    activationPersisted: true,
    toolResultPersisted: true,
    ownerFinalPersisted: true,
    restartFollowUpReadFinal: true,
    failurePersisted: failurePassed,
    cancellationRecovered: cancellationPassed,
    secondMessageStore: false,
  }))
} finally {
  await Promise.all([
    rm(projectRoot, { recursive: true, force: true }),
    rm(dataDir, { recursive: true, force: true }),
  ])
}

function growthTool() {
  return createTool({
    name: TOOL_NAME,
    description: "Run the explicitly admitted Growth goal and return its trusted terminal evidence.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => TOOL_RESULT,
  })
}

type GrowthTool = ReturnType<typeof growthTool>

function sessionInput(project: string, tools: GrowthTool[]) {
  return {
    source: "desktop" as const,
    interactive: false,
    sessionMetadata: { title: "Owner Growth Result Kernel" },
    config: {
      providerId: "openai-compatible",
      modelId: "kernel-model",
      apiKey: "kernel-key",
      baseUrl: "https://kernel.invalid/v1",
      cwd: project,
      workspaceRoot: project,
      mode: "act" as const,
      systemPrompt: "Use run_growth only for an explicit Growth command. After its result, answer the user with a concise final report.",
      extraTools: tools,
      maxIterations: 4,
      enableTools: true,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      disableMcpSettingsTools: true,
    },
    toolPolicies: {
      "*": { enabled: false, autoApprove: false },
      ...(tools.length ? { [TOOL_NAME]: { enabled: true, autoApprove: true } } : {}),
    },
  }
}

async function createRuntime(data: string, providerFetch: typeof fetch, tools: GrowthTool[]) {
  const store = new SqliteSessionStore({ sessionsDir: join(data, "database") })
  store.init()
  const core = await ClineCore.create({
    backendMode: "local",
    clientName: "creatx-owner-growth-kernel",
    distinctId: "creatx-owner-growth-kernel",
    sessionService: new CoreSessionService(store, { sessionArtifactsDir: join(data, "sessions") }),
    fetch: providerFetch,
    capabilities: { requestToolApproval: () => ({ approved: true }) },
  })
  return {
    core,
    dispose: async () => {
      await core.dispose("Owner Growth Result Kernel cleanup")
      store.close()
    },
    tools,
  }
}

async function runFailureCase() {
  const project = await mkdtemp(join(tmpdir(), "creatx-owner-growth-failure-project-"))
  const data = await mkdtemp(join(tmpdir(), "creatx-owner-growth-failure-data-"))
  const tool = failureTool()
  const runtime = await createRuntime(data, failureProviderFetch(), [tool])
  try {
    const started = await runtime.core.start(sessionInput(project, [tool]))
    const result = await runtime.core.send({ sessionId: started.sessionId, prompt: ACTIVATION, timeoutMs: 30_000 })
    requireText(result?.text, FAILURE_REPLY, "failed Growth Owner reply")
    requireConversation(await runtime.core.readMessages(started.sessionId), [ACTIVATION, FAILURE, FAILURE_REPLY])
    return true
  } finally {
    await runtime.dispose()
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(data, { recursive: true, force: true }),
    ])
  }
}

async function runCancellationCase() {
  const project = await mkdtemp(join(tmpdir(), "creatx-owner-growth-cancel-project-"))
  const data = await mkdtemp(join(tmpdir(), "creatx-owner-growth-cancel-data-"))
  let markStarted: (() => void) | undefined
  const startedTool = new Promise<void>((resolveStarted) => {
    markStarted = resolveStarted
  })
  const tool = cancellationTool(() => markStarted?.())
  let cancelledSessionId = ""
  const runtime = await createRuntime(data, cancellationProviderFetch(), [tool])
  try {
    const started = await runtime.core.start(sessionInput(project, [tool]))
    cancelledSessionId = started.sessionId
    const send = runtime.core.send({ sessionId: started.sessionId, prompt: CANCEL_PROMPT, timeoutMs: 30_000 })
    await Promise.race([
      startedTool,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Timed out waiting for cancellable Growth tool")), 5_000)),
    ])
    await runtime.core.abort(started.sessionId, new Error("Kernel cancellation"))
    const result = await send
    if (result?.finishReason !== "aborted") throw new Error(`Cancelled Growth finished as ${result?.finishReason ?? "missing"}`)
    requireConversation(await runtime.core.readMessages(started.sessionId), [CANCEL_PROMPT])
  } finally {
    await runtime.dispose()
  }

  const restored = await createRuntime(data, cancellationFollowUpProviderFetch(), [])
  try {
    const messages = await restored.core.readMessages(cancelledSessionId)
    requireConversation(messages, [CANCEL_PROMPT])
    await restored.core.start({
      ...sessionInput(project, []),
      initialMessages: messages,
      config: { ...sessionInput(project, []).config, sessionId: cancelledSessionId },
    })
    const result = await restored.core.send({ sessionId: cancelledSessionId, prompt: CANCEL_FOLLOW_UP, timeoutMs: 30_000 })
    requireText(result?.text, CANCEL_REPLY, "cancelled Growth follow-up")
    requireConversation(await restored.core.readMessages(cancelledSessionId), [CANCEL_PROMPT, CANCEL_FOLLOW_UP, CANCEL_REPLY])
    return true
  } finally {
    await restored.dispose()
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(data, { recursive: true, force: true }),
    ])
  }
}

function failureTool(): GrowthTool {
  return createTool({
    name: TOOL_NAME,
    description: "Return a controlled Growth failure.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      throw new Error(FAILURE)
    },
  })
}

function cancellationTool(onStarted: () => void): GrowthTool {
  return createTool({
    name: TOOL_NAME,
    description: "Wait for cancellation of a controlled Growth run.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_input, context) => {
      onStarted()
      return await new Promise<string>((_resolve, reject) => {
        if (!context.signal) {
          reject(new Error("Cline did not provide a cancellation signal"))
          return
        }
        if (context.signal.aborted) {
          reject(new Error("Growth tool was already cancelled"))
          return
        }
        context.signal.addEventListener("abort", () => reject(new Error("Growth tool cancelled")), { once: true })
      })
    },
  })
}

function growthProviderFetch(): typeof fetch {
  let request = 0
  return providerFetch((body) => {
    request += 1
    const serialized = JSON.stringify(body)
    if (request === 1) {
      requireIncludes(serialized, ACTIVATION, "first Provider request user message")
      requireIncludes(serialized, TOOL_NAME, "first Provider request tool catalog")
      return toolCallResponse()
    }
    if (request === 2) {
      requireIncludes(serialized, ACTIVATION, "second Provider request user message")
      requireIncludes(serialized, TOOL_RESULT, "second Provider request persisted tool result")
      return textResponse(FINAL_REPLY, "owner-final")
    }
    throw new Error(`Unexpected Growth Provider request ${request}`)
  })
}

function followUpProviderFetch(): typeof fetch {
  let request = 0
  return providerFetch((body) => {
    request += 1
    if (request !== 1) throw new Error(`Unexpected follow-up Provider request ${request}`)
    const serialized = JSON.stringify(body)
    for (const expected of [ACTIVATION, TOOL_RESULT, FINAL_REPLY, FOLLOW_UP]) {
      requireIncludes(serialized, expected, "follow-up Provider history")
    }
    const tools = body && typeof body === "object" && "tools" in body ? (body as { tools?: unknown }).tools : undefined
    if (JSON.stringify(tools ?? []).includes(`\"name\":\"${TOOL_NAME}\"`)) {
      throw new Error("Growth controller remained in the ordinary follow-up tool catalog")
    }
    return textResponse(FOLLOW_UP_REPLY, "owner-follow-up")
  })
}

function failureProviderFetch(): typeof fetch {
  let request = 0
  return providerFetch((body) => {
    request += 1
    const serialized = JSON.stringify(body)
    if (request === 1) return toolCallResponse()
    if (request === 2) {
      requireIncludes(serialized, FAILURE, "failed Growth tool result")
      return textResponse(FAILURE_REPLY, "owner-growth-failure")
    }
    throw new Error(`Unexpected failed Growth Provider request ${request}`)
  })
}

function cancellationProviderFetch(): typeof fetch {
  let request = 0
  return providerFetch((_body) => {
    request += 1
    if (request === 1) return toolCallResponse()
    throw new Error(`Cancelled Growth unexpectedly reached Provider request ${request}`)
  })
}

function cancellationFollowUpProviderFetch(): typeof fetch {
  let request = 0
  return providerFetch((body) => {
    request += 1
    if (request !== 1) throw new Error(`Unexpected cancellation follow-up Provider request ${request}`)
    const serialized = JSON.stringify(body)
    for (const expected of [CANCEL_PROMPT, CANCEL_FOLLOW_UP]) {
      requireIncludes(serialized, expected, "cancelled Growth follow-up history")
    }
    return textResponse(CANCEL_REPLY, "owner-growth-cancel-follow-up")
  })
}

function providerFetch(responseFor: (body: unknown) => Response): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    return responseFor(JSON.parse(String(init?.body ?? "{}")))
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function toolCallResponse() {
  return eventStream({
    id: "owner-growth-tool",
    object: "chat.completion.chunk",
    created: 0,
    model: "kernel-model",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        tool_calls: [{
          index: 0,
          id: "call-owner-growth",
          type: "function",
          function: { name: TOOL_NAME, arguments: "{}" },
        }],
      },
      finish_reason: "tool_calls",
    }],
  })
}

function textResponse(text: string, id: string) {
  return eventStream({
    id,
    object: "chat.completion.chunk",
    created: 0,
    model: "kernel-model",
    choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: "stop" }],
  })
}

function eventStream(chunk: unknown) {
  return new Response([
    `data: ${JSON.stringify(chunk)}`,
    "data: [DONE]",
    "",
  ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
}

function requireConversation(messages: Message[], expected: string[]) {
  const serialized = JSON.stringify(messages)
  for (const value of expected) requireIncludes(serialized, value, "Cline persisted conversation")
}

function requireText(actual: string | undefined, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual ?? "<missing>"}`)
}

function requireIncludes(actual: string, expected: string, label: string) {
  if (!actual.includes(expected)) throw new Error(`${label} does not contain ${expected}`)
}
