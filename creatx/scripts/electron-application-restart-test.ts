import { createServer } from "node:http"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron, chromium } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const electronExecutable = process.env.CREATX_TEST_ELECTRON_EXECUTABLE?.trim() || resolve(workspace, "node_modules", "electron", "dist", "electron.exe")
const userData = await mkdtemp(join(tmpdir(), "noven-application-restart-data-"))
const projectRoot = await mkdtemp(join(tmpdir(), "noven-application-restart-project-"))
const port = await reservePort()
let providerRequests = 0
let holdProvider = false
const provider = createServer((request, response) => {
  providerRequests += 1
  request.resume()
  if (holdProvider) return
  response.writeHead(500, { "content-type": "application/json" })
  response.end(JSON.stringify({ error: "Application restart must not call the Provider." }))
})

await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Restart test Provider did not expose a port")

try {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [workspace, `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, "--force-device-scale-factor=1"],
    cwd: workspace,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CREATX_DESKTOP_TEST: "1",
      CREATX_PROJECT_ROOT: projectRoot,
      CREATX_PROVIDER_API_KEY: "restart-test-key",
      CREATX_PROVIDER_BASE_URL: `http://127.0.0.1:${providerAddress.port}/v1`,
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  if (await page.locator(".wb-onboarding-layer").count()) await page.getByRole("button", { name: "跳过" }).click()
  await page.getByTitle("新会话").first().click()
  const activeSession = page.locator(".wb-session-row button.is-active")
  await activeSession.waitFor()
  const sessionId = await activeSession.getAttribute("data-session-id")
  if (!sessionId) throw new Error("Restart test could not identify the active session")

  const closed = app.waitForEvent("close")
  await page.locator(".wb-secondary-nav").getByText("恢复诺文", { exact: true }).click()
  await closed
  await waitFor(async () => fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok, () => false), 30_000)
  await waitFor(async () => fetch(`http://127.0.0.1:${port}/json/list`).then(async (response) => {
    if (!response.ok) return false
    const targets = await response.json() as Array<{ type?: string; url?: string }>
    return targets.some((target) => target.type === "page" && !target.url?.startsWith("devtools:"))
  }, () => false), 30_000)

  const relaunched = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const relaunchedPage = relaunched.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.url().startsWith("devtools:"))
  if (!relaunchedPage) throw new Error("Relaunched Electron window was not exposed through CDP")
  await relaunchedPage.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const restoredSession = relaunchedPage.locator(`[data-session-id="${sessionId}"]`)
  await restoredSession.first().waitFor()
  if (!await restoredSession.evaluateAll((elements) => elements.some((element) => element.classList.contains("is-active")))) {
    throw new Error("Relaunched application did not restore the selected session")
  }
  if (await relaunchedPage.evaluate(() => window.localStorage.getItem("creatx.application-restart-selection.v1") !== null)) {
    throw new Error("Relaunched application did not consume the one-time restart selection")
  }
  if (providerRequests !== 0) throw new Error(`Application restart called the Provider ${providerRequests} time(s)`)

  holdProvider = true
  await relaunchedPage.getByRole("textbox", { name: "发送消息" }).fill("保持这个回复运行，验证恢复确认。")
  await relaunchedPage.getByRole("button", { name: "发送", exact: true }).click()
  await waitFor(async () => readProviderRequests() === 1, 10_000)
  await relaunchedPage.locator(".wb-secondary-nav").getByText("恢复诺文", { exact: true }).click()
  const confirmation = relaunchedPage.getByRole("alertdialog", { name: "恢复诺文并中断当前工作？" })
  await confirmation.waitFor()
  await confirmation.getByRole("button", { name: "取消" }).click()
  await confirmation.waitFor({ state: "detached" })
  await relaunchedPage.locator(".wb-secondary-nav").getByText("恢复诺文", { exact: true }).click()
  await confirmation.waitFor()
  const disconnected = new Promise<void>((resolveDisconnect) => relaunched.once("disconnected", () => resolveDisconnect()))
  await confirmation.getByRole("button", { name: "确认恢复" }).click()
  await disconnected
  await waitFor(async () => fetch(`http://127.0.0.1:${port}/json/list`).then(async (response) => {
    if (!response.ok) return false
    const targets = await response.json() as Array<{ type?: string; url?: string }>
    return targets.some((target) => target.type === "page" && !target.url?.startsWith("devtools:"))
  }, () => false), 30_000)
  const confirmedRestart = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const confirmedPage = confirmedRestart.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.url().startsWith("devtools:"))
  if (!confirmedPage) throw new Error("Confirmed restart did not expose a relaunched window")
  await confirmedPage.waitForSelector(".workspace-shell", { timeout: 30_000 })
  await new Promise((resolveWait) => setTimeout(resolveWait, 750))
  if (readProviderRequests() !== 1) throw new Error(`Confirmed restart replayed the Provider request; observed ${readProviderRequests()} requests`)

  console.log(JSON.stringify({
    status: "APPLICATION RESTART ELECTRON PASS",
    projectRestored: true,
    sessionRestored: sessionId,
    providerRequests,
    automaticReplay: false,
    activeConversationConfirmation: "cancelled once, then confirmed",
  }))
  await confirmedRestart.close()
} finally {
  provider.closeAllConnections()
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await stopProfileProcesses(userData)
  await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  await Promise.all([removeTemporary(projectRoot), removeTemporary(userData)])
}

async function reservePort() {
  const server = createServer()
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(0, "127.0.0.1", resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Could not reserve a CDP port")
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  return address.port
}

function readProviderRequests() {
  return providerRequests
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (!await condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
}

async function stopProfileProcesses(profile: string) {
  const escaped = profile.replaceAll("'", "''")
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*${escaped}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, stdio: "ignore" })
}

async function removeTemporary(path: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 19) throw error
      await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    }
  }
}
