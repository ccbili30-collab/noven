import { createServer } from "node:http"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-chat-image-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-chat-image-data-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "chat-image")
const imagePath = join(projectRoot, "对话参考图.png")
const imageBytes = await readFile(resolve(workspace, "apps", "desktop", "renderer", "src", "assets", "creatx-glass-buildings.png"))
const imageBase64 = imageBytes.toString("base64")
await writeFile(imagePath, imageBytes)
await mkdir(evidenceDir, { recursive: true })

const providerBodies: string[] = []
const provider = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
  request.on("end", () => {
    providerBodies.push(Buffer.concat(chunks).toString("utf8"))
    response.writeHead(200, { "content-type": "text/event-stream" })
    setTimeout(() => response.end(`data: ${JSON.stringify({ id: "chat-image", object: "chat.completion.chunk", created: 0, model: "gpt-5.6-luna", choices: [{ index: 0, delta: { role: "assistant", content: "我已经收到并看到了这张图片。" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`), 1_200)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Chat image Provider did not expose a port")

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
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const configured = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "视觉测试", providerId: "openai-compatible", modelId: "gpt-5.6-luna", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Chat image test has no project")
    const session = await window.creatx.createSession(bootstrap.value.project.id)
    if (!session.ok) throw new Error(session.error.message)
    return session.value.id
  }, `http://127.0.0.1:${address.port}/v1`)
  await page.reload()
  await page.locator(`[data-session-id="${configured}"]`).click()
  await app.evaluate(({ dialog }, filePaths) => {
    Object.defineProperty(dialog, "showOpenDialog", { configurable: true, value: async () => ({ canceled: false, filePaths }) })
  }, [imagePath])
  await page.getByTitle("添加").click()
  await page.getByRole("menuitem", { name: "添加附件" }).click()
  const pendingImage = page.locator('.wb-composer-attachments img[alt="对话参考图.png"]')
  await pendingImage.waitFor()
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.wb-composer-attachments img[alt="对话参考图.png"]')?.naturalWidth ?? 0) > 100)
  await page.locator(".composer textarea").fill("请看这张图片")
  await page.getByTitle("发送", { exact: true }).click()
  await page.locator(".wb-assistant-waiting", { hasText: "正在准备回复" }).waitFor({ timeout: 5_000 })
  if (await page.locator('.wb-context-message.user .wb-attachment-image').count() !== 1) throw new Error("Optimistic chat image preview is missing or duplicated")
  await page.screenshot({ path: join(evidenceDir, "chat-image-waiting.png") })
  await page.getByText("我已经收到并看到了这张图片。", { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator(".wb-assistant-waiting").waitFor({ state: "detached" })
  if (await page.locator('.wb-context-message.user').filter({ hasText: "请看这张图片" }).count() !== 1) throw new Error("Persisted image message was duplicated")
  await page.reload()
  await page.locator(`[data-session-id="${configured}"]`).click()
  await page.locator('.wb-context-message.user').filter({ hasText: "请看这张图片" }).waitFor()
  const historyImage = page.locator('.wb-context-message.user .wb-attachment-image img').first()
  await historyImage.waitFor()
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.wb-context-message.user .wb-attachment-image img')?.naturalWidth ?? 0) > 100, undefined, { timeout: 10_000 })
  await historyImage.click()
  await page.locator('.wb-attachment-lightbox[role="dialog"] img').waitFor()
  await page.screenshot({ path: join(evidenceDir, "chat-image-preview.png") })
  if (!providerBodies.some((body) => body.includes(imageBase64)) || providerBodies.some((body) => body.includes("Error fetching content"))) {
    throw new Error("Provider request did not contain a real image content block")
  }
  console.log(JSON.stringify({ status: "CHAT IMAGE PASS", requests: providerBodies.length, screenshots: [join(evidenceDir, "chat-image-waiting.png"), join(evidenceDir, "chat-image-preview.png")] }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}
