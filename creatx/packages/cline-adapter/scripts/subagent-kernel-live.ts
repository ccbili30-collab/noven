import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  ClineCore,
  CoreSessionService,
  SqliteSessionStore,
  type AgentEvent,
  type CoreSessionEvent,
  type SessionHistoryRecord,
  type SessionUsageSummary,
} from "@cline/sdk"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const ROOT_PRIVATE_SENTINEL = "ROOT_PRIVATE_SENTINEL_7F3C"
const STAGE_CLEAN_SENTINEL = "STAGE_CLEAN_SENTINEL_42A1"
const LEAF_MARKERS = ["LEAF_GEOGRAPHY_OK", "LEAF_SOCIETY_OK", "LEAF_HISTORY_OK"] as const
const mode = process.argv[2] ?? "all"

if (!new Set(["all", "success", "cancel"]).has(mode)) {
  throw new Error("Usage: subagent-kernel-live.ts [all|success|cancel]")
}

const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const evidencePath = resolve(import.meta.dirname, "../../../../artifacts/growth-world-live/cline-subagent-kernel-live.json")
const previous = await readPreviousReport(evidencePath)
const report = {
  schemaVersion: 1,
  sdkVersion: "0.0.65",
  provider: "openai-compatible",
  model: "gpt-5.6-luna",
  startedAt: new Date().toISOString(),
  success: mode === "cancel" ? previous?.success : await runSuccessCase(),
  cancellation: mode === "success" ? previous?.cancellation : await runCancellationCase(),
  completedAt: new Date().toISOString(),
}
await mkdir(dirname(evidencePath), { recursive: true })
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
const fullyPassed = (report.success?.status ?? "passed") === "passed" && (report.cancellation?.status ?? "passed") === "passed"
console.log(JSON.stringify({ status: fullyPassed ? "CLINE SUBAGENT KERNEL LIVE PASS" : "CLINE SUBAGENT KERNEL LIVE PARTIAL", evidencePath, mode }))
if (!fullyPassed) process.exitCode = 2

async function runSuccessCase() {
  const lab = await createLab("success")
  try {
    const stageTask = successStageTask()
    const result = await runRoot(lab, leadSystemPrompt(), leadTask(stageTask))
    await waitFor(async () => (await lab.core.listHistory({ limit: 100, includeSubagents: true })).filter((record) => record.isSubagent).length >= 4, 10_000, "four persisted child sessions")
    const topology = analyzeTopology(await lab.core.listHistory({ limit: 100, includeSubagents: true }), lab.sessionId)
    const spawns = observedSpawns(lab.events)
    const stageSpawns = spawns.slice(1)
    const usage = await lab.core.getAccumulatedUsage(lab.sessionId)
    const usageIncludesDescendants = hasDescendantUsage(usage)

    requireEqual(topology.stageAgentIds.length, 1, "Lead must spawn exactly one stage editor")
    requireEqual(topology.leafAgentIds.length, 3, "Stage editor must spawn exactly three leaf agents")
    requireEqual(new Set(topology.leafAgentIds).size, 3, "Leaf agent IDs must be distinct")
    requireEqual(new Set(topology.leafConversationIds).size, 3, "Leaf conversation IDs must be distinct")
    requireEqual(stageSpawns.length, 3, "Stage editor must issue three spawn_agent calls")
    requireCondition(stageSpawns.every((spawn) => spawn.task.includes(STAGE_CLEAN_SENTINEL)), "Every leaf task must contain the clean stage sentinel")
    requireCondition(spawns.every((spawn) => !spawn.systemPrompt.includes(ROOT_PRIVATE_SENTINEL) && !spawn.task.includes(ROOT_PRIVATE_SENTINEL)), "Root-only sentinel leaked into child input")
    requireCondition(LEAF_MARKERS.every((marker) => result.text.includes(marker)), "Lead result does not contain all leaf markers")

    return {
      status: topology.parallelWindow.overlapped && usageIncludesDescendants ? "passed" : "partial",
      rootFinishReason: result.finishReason,
      rootAgentId: topology.rootAgentId,
      stageAgentId: topology.stageAgentId,
      leafAgentIds: topology.leafAgentIds,
      leafConversationIds: topology.leafConversationIds,
      spawnInputs: spawns.map((spawn) => ({
        systemPrompt: spawn.systemPrompt,
        task: spawn.task,
      })),
      parallelWindow: topology.parallelWindow,
      recursiveSuccess: true,
      parallelThroughputSuccess: topology.parallelWindow.overlapped,
      usageIncludesDescendants,
      rootOutput: result.text,
      usage,
    }
  } finally {
    await lab.dispose()
  }
}

async function runCancellationCase() {
  const cancelSentinel = `CREATX_SUBAGENT_CANCEL_${Date.now()}`
  const lab = await createLab("cancel")
  try {
    const send = runRoot(lab, leadSystemPrompt(), leadTask(cancellationStageTask(cancelSentinel)))
    await waitFor(() => toolStarts(lab.events, "run_commands").length >= 1, 120_000, "a cancellable leaf tool to start")
    await lab.core.abort(lab.sessionId, new Error("Kernel Lab cancellation probe"))
    const result = await send.catch((error: unknown) => error)
    await delay(1_000)
    const history = await lab.core.listHistory({ limit: 100, includeSubagents: true })
    const topology = analyzeTopology(history, lab.sessionId)
    const leaves = history.filter((record) => topology.leafAgentIds.includes(record.agentId ?? ""))
    const stage = history.find((record) => record.agentId === topology.stageAgentId)
    if (!stage) throw new Error("Cancellation case has no persisted stage editor")
    requireCondition(topology.leafAgentIds.length >= 1, "Cancellation case did not start a leaf agent")
    const abortPropagated = leaves.every((record) => record.status === "cancelled") && stage.status === "cancelled"

    await lab.dispose()
    await delay(750)
    const residualProcesses = await findProcesses(cancelSentinel)
    requireEqual(residualProcesses.length, 0, "Cancellation left a matching shell process behind")

    return {
      status: abortPropagated ? "passed" : "partial",
      rootResult: result instanceof Error
        ? { kind: "error", name: result.name, message: result.message }
        : { kind: "result", finishReason: requireAgentResult(result).finishReason },
      rootAgentId: topology.rootAgentId,
      stageAgentId: topology.stageAgentId,
      leafAgentIds: topology.leafAgentIds,
      stageStatus: stage.status,
      leafSessions: leaves.map((record) => ({ agentId: record.agentId, status: record.status, startedAt: record.startedAt, updatedAt: record.updatedAt })),
      abortPropagated,
      residualProcesses,
    }
  } finally {
    await lab.dispose()
  }
}

async function createLab(name: string) {
  const projectRoot = await mkdtemp(join(tmpdir(), `creatx-subagent-${name}-project-`))
  const dataDir = await mkdtemp(join(tmpdir(), `creatx-subagent-${name}-data-`))
  const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
  store.init()
  const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(dataDir, "sessions") })
  const dispatcher = new EnvHttpProxyAgent()
  const core = await ClineCore.create({
    backendMode: "local",
    clientName: "creatx-subagent-kernel-lab",
    distinctId: "creatx-subagent-kernel-lab",
    sessionService,
    fetch: createProviderFetch(dispatcher),
    capabilities: {
      requestToolApproval: () => ({ approved: true }),
    },
  })
  const events: ObservedAgentEvent[] = []
  const unsubscribe = core.subscribe((event) => captureAgentEvent(events, event))
  const started = await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title: `Subagent Kernel Lab ${name}` },
    config: {
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
      apiKey,
      baseUrl,
      cwd: projectRoot,
      workspaceRoot: projectRoot,
      mode: "act",
      systemPrompt: leadSystemPrompt(),
      maxIterations: 6,
      enableTools: true,
      enableSpawnAgent: true,
      enableAgentTeams: false,
      disableMcpSettingsTools: true,
      yolo: true,
    },
    toolPolicies: {
      "*": { enabled: true, autoApprove: true },
    },
  })
  let disposed = false
  return {
    core,
    events,
    sessionId: started.sessionId,
    dispose: async () => {
      if (disposed) return
      disposed = true
      unsubscribe()
      try {
        await core.dispose("Subagent Kernel Lab cleanup")
      } finally {
        store.close()
        await dispatcher.close()
        await Promise.all([
          rm(projectRoot, { recursive: true, force: true }),
          rm(dataDir, { recursive: true, force: true }),
        ])
      }
    },
  }
}

async function runRoot(lab: Awaited<ReturnType<typeof createLab>>, systemPrompt: string, task: string) {
  requireCondition(systemPrompt === leadSystemPrompt(), "Unexpected lead system prompt")
  const result = await lab.core.send({ sessionId: lab.sessionId, prompt: task, timeoutMs: 300_000 })
  if (!result) throw new Error("Cline returned no root Agent result")
  return result
}

function leadSystemPrompt() {
  return [
    "You are the lead editor in a controlled Cline subagent kernel lab.",
    "You must delegate the supplied stage brief by calling spawn_agent exactly once.",
    "Copy the supplied STAGE SYSTEM PROMPT and STAGE TASK exactly into that tool call.",
    "Do not solve any leaf task yourself and do not call any other tool.",
    "Never include ROOT_PRIVATE_SENTINEL values in any child system prompt, child task, or final answer.",
    "After the stage editor returns, answer with LEAD_AGGREGATE followed by the stage output only.",
  ].join("\n")
}

function leadTask(stageTask: string) {
  return [
    `Private lead-only control value: ${ROOT_PRIVATE_SENTINEL}`,
    "STAGE SYSTEM PROMPT:",
    "You are a stage editor. Follow the task literally. Delegate leaf work; do not perform leaf work yourself.",
    "END STAGE SYSTEM PROMPT",
    "STAGE TASK:",
    stageTask,
    "END STAGE TASK",
  ].join("\n")
}

function successStageTask() {
  return [
    `Clean inherited fact: ${STAGE_CLEAN_SENTINEL}`,
    "PARALLELISM IS THE SUBJECT OF THIS TEST. Your very next assistant message must contain exactly three spawn_agent tool calls at once.",
    "Do not emit one call and wait for its result. Do not write prose before the calls. A turn containing fewer than three calls is invalid.",
    "The calls are independent. Do not call any other tool. Use these exact leaf briefs:",
    leafBrief("geography", LEAF_MARKERS[0], "Describe one grounded geographic dependency in one sentence."),
    leafBrief("society", LEAF_MARKERS[1], "Describe one grounded social dependency in one sentence."),
    leafBrief("history", LEAF_MARKERS[2], "Describe one grounded historical dependency in one sentence."),
    `After all three return, output STAGE_AGGREGATE and include exactly these markers: ${LEAF_MARKERS.join(", ")}.`,
  ].join("\n")
}

function cancellationStageTask(cancelSentinel: string) {
  return [
    `Clean inherited fact: ${STAGE_CLEAN_SENTINEL}`,
    "Immediately issue exactly one spawn_agent call. Do not call any other tool and do not perform the leaf task yourself.",
    leafBrief(
      "cancel",
      LEAF_MARKERS[0],
      `Immediately call run_commands with exactly this PowerShell command: $env:CREATX_SUBAGENT_CANCEL='${cancelSentinel}'; Start-Sleep -Seconds 20. After it finishes, return ${LEAF_MARKERS[0]}.`,
    ),
    "After the leaf returns, output STAGE_CANCEL_UNEXPECTED_COMPLETION.",
  ].join("\n")
}

function leafBrief(role: string, marker: string, task: string) {
  return [
    `LEAF ${role} SYSTEM PROMPT: You are the ${role} leaf. Follow only the explicit task.`,
    `LEAF ${role} TASK: ${STAGE_CLEAN_SENTINEL}. ${task} End with ${marker}.`,
  ].join("\n")
}

interface ObservedAgentEvent {
  at: number
  event: AgentEvent
}

function captureAgentEvent(events: ObservedAgentEvent[], event: CoreSessionEvent) {
  if (event.type !== "agent_event") return
  events.push({ at: Date.now(), event: event.payload.event })
}

function analyzeTopology(history: SessionHistoryRecord[], rootSessionId: string) {
  const subagents = history.filter((record) => record.isSubagent && record.parentSessionId === rootSessionId)
  const childAgentIds = new Set(subagents.flatMap((record) => record.agentId ? [record.agentId] : []))
  const rootAgentIds = [...new Set(subagents.flatMap((record) => record.parentAgentId && !childAgentIds.has(record.parentAgentId) ? [record.parentAgentId] : []))]
  const rootAgentId = requireText(rootAgentIds[0], "root agent ID inferred from child session lineage")
  const stages = subagents.filter((record) => record.parentAgentId === rootAgentId)
  const stageAgentIds = [...new Set(stages.map((record) => requireText(record.agentId ?? undefined, "stage agent ID")))]
  const stageAgentId = stageAgentIds[0] ?? ""
  const leaves = subagents.filter((record) => record.parentAgentId === stageAgentId)
  const leafAgentIds = [...new Set(leaves.map((record) => requireText(record.agentId ?? undefined, "leaf agent ID")))]
  const leafConversationIds = [...new Set(leaves.map((record) => requireText(record.conversationId ?? undefined, "leaf conversation ID")))]
  const leafStarts = leaves.map((record) => Date.parse(record.startedAt))
  const leafEnds = leaves.map((record) => Date.parse(record.updatedAt))
  const latestStart = Math.max(...leafStarts)
  const earliestEnd = Math.min(...leafEnds)
  return {
    rootAgentId,
    stageAgentIds,
    stageAgentId,
    leafAgentIds,
    leafConversationIds,
    parallelWindow: {
      leafStarts,
      leafEnds,
      latestStart,
      earliestEnd,
      overlapMs: earliestEnd - latestStart,
      overlapped: leafStarts.length === 3 && leafEnds.length === 3 && latestStart < earliestEnd,
    },
  }
}

function observedSpawns(events: ObservedAgentEvent[]) {
  return events.flatMap((entry) => {
    const event = entry.event
    if (event.type !== "content_start" || event.contentType !== "tool" || event.toolName !== "spawn_agent") return []
    const input = spawnInput(event.input)
    if (!input) return []
    return [{
      at: entry.at,
      systemPrompt: input.systemPrompt,
      task: input.task,
    }]
  })
}

function spawnInput(input: unknown) {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  if (typeof record.systemPrompt !== "string" || typeof record.task !== "string") return undefined
  return { systemPrompt: record.systemPrompt, task: record.task }
}

function toolStarts(events: ObservedAgentEvent[], toolName: string) {
  return events.filter((entry) => entry.event.type === "content_start"
    && entry.event.contentType === "tool"
    && entry.event.toolName === toolName)
}

function hasDescendantUsage(usage: SessionUsageSummary | undefined) {
  return Boolean(usage?.usage
    && usage.aggregateUsage
    && usage.aggregateUsage.inputTokens > usage.usage.inputTokens
    && usage.aggregateUsage.outputTokens > usage.usage.outputTokens)
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number, description: string) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function findProcesses(sentinel: string) {
  const script = [
    `$needle = '${sentinel}'`,
    "@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($needle) } | Select-Object ProcessId, Name, CommandLine) | ConvertTo-Json -Compress",
  ].join("; ")
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true })
  const text = stdout.trim()
  if (!text) return []
  const parsed: unknown = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
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

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`CLINE SUBAGENT KERNEL LIVE FAIL: ${name} is not configured`)
  return value
}

interface StoredReport {
  success?: { status: string }
  cancellation?: { status: string }
}

async function readPreviousReport(path: string) {
  return await readFile(path, "utf8").then(
    (text) => JSON.parse(text) as StoredReport,
    () => undefined,
  )
}

function requireText(value: string | undefined, label: string) {
  if (!value) throw new Error(`Missing ${label}`)
  return value
}

function requireEqual(actual: number, expected: number, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`)
}

function requireCondition(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function requireAgentResult(value: unknown) {
  if (!value || typeof value !== "object" || !("finishReason" in value) || typeof value.finishReason !== "string") {
    throw new Error("Cline returned neither an Agent result nor an Error after cancellation")
  }
  return value
}

function delay(ms: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}
