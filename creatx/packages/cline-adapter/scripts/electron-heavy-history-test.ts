import { createServer } from "node:http"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"
import { CoreSessionService, SqliteSessionStore } from "@cline/sdk"
import { projectId } from "@creatx/project-files"

const sourcePath = process.argv[2]
if (!sourcePath) throw new Error("Usage: electron-heavy-history-test.ts <messages.json>")
const workspace = resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-heavy-history-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-heavy-history-data-"))
const sessionId = "heavy-history"
const dataDir = join(userData, "cline")
const messagesPath = join(dataDir, "sessions", sessionId, `${sessionId}.messages.json`)
const history = JSON.parse(await readFile(resolve(sourcePath), "utf8")) as { messages?: unknown[]; [key: string]: unknown }
if (!Array.isArray(history.messages) || history.messages.length < 1) throw new Error("Heavy history source has no messages")
await mkdir(dirname(messagesPath), { recursive: true })

const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
store.init()
const service = new CoreSessionService(store, { sessionArtifactsDir: join(dataDir, "sessions") })
await service.createRootSessionWithArtifacts({
  sessionId,
  source: "desktop",
  pid: 2_147_483_647,
  interactive: true,
  provider: "openai-compatible",
  model: "heavy-history-test",
  cwd: projectRoot,
  workspaceRoot: projectRoot,
  enableTools: true,
  enableSpawn: false,
  enableTeams: false,
  metadata: { title: "重型历史", creatxProjectId: projectId(projectRoot), creatxProviderId: "openai-compatible", creatxModelId: "heavy-history-test" },
})
await writeFile(messagesPath, JSON.stringify({ ...history, sessionId }), "utf8")
store.updateStatus(sessionId, "completed", 0)
store.close()

let providerBodyBytes = 0
const provider = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
  request.on("end", () => {
    providerBodyBytes = Buffer.concat(chunks).byteLength
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ id: "heavy-history", object: "chat.completion.chunk", created: 0, model: "heavy-history-test", choices: [{ index: 0, delta: { role: "assistant", content: "重型历史已恢复。" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Heavy history Provider did not expose a port")

const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    DEEPSEEK_API_KEY: "heavy-history-bootstrap-key",
  },
})
const mainPid = app.process().pid
if (!mainPid) throw new Error("Electron Main PID is unavailable")

try {
  const page = await app.firstWindow()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const before = await processMemory(mainPid)
  const result = await page.evaluate(async (input) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "重型历史测试", providerId: "openai-compatible", modelId: "heavy-history-test", baseUrl: input.baseUrl, apiKey: "test-key" })
    if (!saved.ok || !saved.value.selectedTextProfileId) throw new Error("Heavy history model profile was not saved")
    const selected = await window.creatx.selectSessionModel(input.sessionId, saved.value.selectedTextProfileId)
    if (!selected.ok) throw new Error(selected.error.message)
    return window.creatx.sendMessage({ requestId: "heavy-history-turn", sessionId: input.sessionId, prompt: "请只回复已恢复", attachmentIds: [] })
  }, { baseUrl: `http://127.0.0.1:${providerAddress.port}/v1`, sessionId })
  if (!result.ok) throw new Error(`Heavy history turn failed: ${result.error.detail ?? result.error.message}`)
  const after = await processMemory(mainPid)
  const mainGrowth = after.mainWorkingSet - before.mainWorkingSet
  if (mainGrowth > 128 * 1024 * 1024 || after.mainWorkingSet > 400 * 1024 * 1024) throw new Error(`Electron Main retained heavy Cline history: before=${before.mainWorkingSet} after=${after.mainWorkingSet}`)
  if (providerBodyBytes > 512 * 1024) throw new Error(`Provider projection retained historical image payloads: ${providerBodyBytes} bytes`)
  console.log(JSON.stringify({
    status: "HEAVY HISTORY PASS",
    sourceBytes: (await readFile(resolve(sourcePath))).byteLength,
    providerBodyBytes,
    before,
    after,
    mainGrowth,
  }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function processMemory(rootPid: number) {
  const processes = await import("node:child_process").then(({ execFile }) => new Promise<Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string; WorkingSet: number }>>((resolveRun, rejectRun) => {
    const script = `$all = Get-CimInstance Win32_Process; $ids = [System.Collections.Generic.HashSet[uint32]]::new(); [void]$ids.Add([uint32]${rootPid}); do { $before = $ids.Count; foreach ($process in $all) { if ($ids.Contains([uint32]$process.ParentProcessId)) { [void]$ids.Add([uint32]$process.ProcessId) } } } while ($ids.Count -ne $before); @($all | Where-Object { $ids.Contains([uint32]$_.ProcessId) } | ForEach-Object { [pscustomobject]@{ ProcessId=[int]$_.ProcessId; ParentProcessId=[int]$_.ParentProcessId; CommandLine=[string]$_.CommandLine; WorkingSet=[long]$_.WorkingSetSize } }) | ConvertTo-Json -Compress`
    execFile("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) rejectRun(error)
      else {
        const parsed = JSON.parse(stdout || "[]") as { ProcessId: number; ParentProcessId: number; CommandLine: string; WorkingSet: number } | Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string; WorkingSet: number }>
        resolveRun(Array.isArray(parsed) ? parsed : [parsed])
      }
    })
  }))
  const main = processes.find((process) => process.ProcessId === rootPid)
  const utility = processes.find((process) => process.CommandLine.includes("--type=utility") && process.CommandLine.includes("node.mojom.NodeService"))
  if (!main || !utility) throw new Error("Electron Main or Cline Utility Process is missing")
  return { mainWorkingSet: main.WorkingSet, utilityWorkingSet: utility.WorkingSet }
}
