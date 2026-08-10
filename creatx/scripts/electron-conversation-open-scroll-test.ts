import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-conversation-scroll-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-conversation-scroll-data-"))
const reply = Array.from({ length: 80 }, (_value, index) => `第 ${index + 1} 段：这是用于验证长对话打开位置的真实渲染文本。`).join("\n\n")
const provider = createServer((request, response) => {
  request.resume()
  request.on("end", () => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ id: "conversation-scroll", object: "chat.completion.chunk", created: 0, model: "scroll-test", choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Conversation scroll Provider did not expose a port")

const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    DEEPSEEK_API_KEY: "unused-test-key",
  },
})

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1100, height: 720 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const sessions = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "滚动测试", providerId: "openai-compatible", modelId: "scroll-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Conversation scroll test has no project")
    const first = await window.creatx.createSession(bootstrap.value.project.id)
    const second = await window.creatx.createSession(bootstrap.value.project.id)
    if (!first.ok) throw new Error(first.error.message)
    if (!second.ok) throw new Error(second.error.message)
    return { first: first.value.id, second: second.value.id }
  }, `http://127.0.0.1:${address.port}/v1`)

  await page.reload()
  await page.locator(`[data-session-id="${sessions.first}"]`).click()
  await page.locator(".composer textarea").fill("生成一段足以产生滚动条的测试回复")
  await page.getByTitle("发送", { exact: true }).click()
  await page.getByText("第 80 段：这是用于验证长对话打开位置的真实渲染文本。", { exact: true }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => {
    const viewport = document.querySelector<HTMLElement>(".wb-context-scroll")
    return Boolean(viewport && viewport.scrollHeight > viewport.clientHeight && viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 8)
  })

  await page.locator(`[data-session-id="${sessions.second}"]`).click()
  await page.locator(`[data-session-id="${sessions.first}"]`).click()
  await page.waitForFunction(() => {
    const viewport = document.querySelector<HTMLElement>(".wb-context-scroll")
    return Boolean(viewport && viewport.scrollHeight > viewport.clientHeight && viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 8)
  })

  await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".wb-context-scroll")
    if (!viewport) throw new Error("Conversation viewport is missing")
    viewport.scrollTop = 120
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await page.locator(`[data-session-id="${sessions.first}"]`).click()
  await page.setViewportSize({ width: 1080, height: 700 })
  await page.waitForTimeout(100)
  const repeatedPosition = await page.locator(".wb-context-scroll").evaluate((viewport) => viewport.scrollTop)
  if (Math.abs(repeatedPosition - 120) > 1) throw new Error(`Same-session render repeated the open position: ${repeatedPosition}`)

  console.log(JSON.stringify({ status: "CONVERSATION OPEN SCROLL PASS", firstSession: sessions.first, secondSession: sessions.second, repeatedPosition }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}
