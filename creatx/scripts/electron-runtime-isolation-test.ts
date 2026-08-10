import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const configuredExecutable = process.env.CREATX_RUNTIME_ISOLATION_EXECUTABLE?.trim()
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-runtime-isolation-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-runtime-isolation-data-"))
await mkdir(join(projectRoot, "作品"))
const provider = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
  request.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { messages?: Array<{ role?: string }> }
    const hasToolResult = body.messages?.some((message) => message.role === "tool") ?? false
    const event = hasToolResult
      ? { id: "runtime-tool-result", object: "chat.completion.chunk", created: 0, model: "runtime-test", choices: [{ index: 0, delta: { role: "assistant", content: "工作台已登记。" }, finish_reason: "stop" }] }
      : { id: "runtime-tool-call", object: "chat.completion.chunk", created: 0, model: "runtime-test", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "runtime-register-workbench", type: "function", function: { name: "register_workbench", arguments: JSON.stringify({ folder: "作品", title: "作品" }) } }] }, finish_reason: "tool_calls" }] }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Runtime isolation Provider did not expose a port")
const app = await electron.launch({
  executablePath: configuredExecutable || resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [...(configuredExecutable ? [] : [workspace]), `--user-data-dir=${userData}`],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    DEEPSEEK_API_KEY: "runtime-isolation-test-key",
  },
})

const mainPid = app.process().pid
if (!mainPid) throw new Error("Electron Main PID is unavailable")
let utilityPid: number | undefined

try {
  const page = await app.firstWindow()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const created = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "Runtime 隔离测试", providerId: "openai-compatible", modelId: "runtime-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Runtime isolation test has no project")
    return window.creatx.createSession(bootstrap.value.project.id)
  }, `http://127.0.0.1:${providerAddress.port}/v1`)
  if (!created.ok || created.value.title !== "创作（1）") throw new Error(`Utility Process did not create a real session: ${JSON.stringify(created)}`)
  const toolRoundTrip = await page.evaluate(async (sessionId) => {
    let resolveApproval!: (approvalId: string) => void
    const approval = new Promise<string>((resolve) => { resolveApproval = resolve })
    const unsubscribe = window.creatx.onEvent((event) => {
      if (event.type === "approval.requested" && event.approval.toolName === "register_workbench") resolveApproval(event.approval.id)
    })
    const sending = window.creatx.sendMessage({ requestId: "runtime-tool-round-trip", sessionId, prompt: "请登记作品工作台", attachmentIds: [] })
    const first = await Promise.race([
      approval.then((approvalId) => ({ kind: "approval" as const, approvalId })),
      sending.then((sent) => ({ kind: "sent" as const, sent })),
    ])
    if (first.kind === "approval") {
      const approved = await window.creatx.respondApproval(first.approvalId, true)
      if (!approved.ok) throw new Error(approved.error.message)
    }
    const sent = first.kind === "sent" ? first.sent : await sending
    unsubscribe()
    if (!sent.ok) throw new Error(sent.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Project disappeared after remote tool execution")
    return window.creatx.readWorkbenches(bootstrap.value.project.id)
  }, created.value.id)
  if (!toolRoundTrip.ok || !toolRoundTrip.value.workbenches.some((workbench) => workbench.folder === "作品")) throw new Error(`Remote tool round trip did not persist: ${JSON.stringify(toolRoundTrip)}`)

  const descendants = await processTree(mainPid)
  const utility = descendants.find((process) => process.commandLine.includes("--type=utility") && process.commandLine.includes("node.mojom.NodeService"))
  if (!utility) throw new Error(`Cline Utility Process was not found under Electron Main: ${JSON.stringify(descendants)}`)
  utilityPid = utility.processId

  await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${utilityPid} -Force`])
  await page.waitForTimeout(500)
  const failedClosed = await page.evaluate(() => window.creatx.bootstrap())
  if (failedClosed.ok || failedClosed.error.code !== "runtime") throw new Error(`Cline crash did not fail closed: ${JSON.stringify(failedClosed)}`)
  if (app.process().killed || await page.title() !== "CreatX") throw new Error("Electron Main or Renderer stopped with the Cline Utility Process")

  console.log(JSON.stringify({
    status: "RUNTIME ISOLATION PASS",
    mainPid,
    utilityPid,
    mainWorkingSet: descendants.find((process) => process.processId === mainPid)?.workingSet,
    utilityWorkingSet: utility.workingSet,
    remoteTool: "register_workbench",
    failure: failedClosed.error.detail,
  }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function processTree(rootPid: number) {
  const script = `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,WorkingSetSize; $ids = [System.Collections.Generic.HashSet[uint32]]::new(); [void]$ids.Add([uint32]${rootPid}); do { $before = $ids.Count; foreach ($process in $all) { if ($ids.Contains([uint32]$process.ParentProcessId)) { [void]$ids.Add([uint32]$process.ProcessId) } } } while ($ids.Count -ne $before); @($all | Where-Object { $ids.Contains([uint32]$_.ProcessId) } | ForEach-Object { [pscustomobject]@{ processId=[int]$_.ProcessId; parentProcessId=[int]$_.ParentProcessId; commandLine=[string]$_.CommandLine; workingSet=[long]$_.WorkingSetSize } }) | ConvertTo-Json -Compress`
  const result = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 1024 * 1024 })
  const parsed = JSON.parse(result.stdout || "[]") as ProcessRecord | ProcessRecord[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

interface ProcessRecord {
  processId: number
  parentProcessId: number
  commandLine: string
  workingSet: number
}
