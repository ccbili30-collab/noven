import { createServer } from "node:http"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-heritage-links-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-heritage-links-data-"))
await Promise.all([
  mkdir(join(projectRoot, "图片"), { recursive: true }),
  mkdir(join(projectRoot, "小说"), { recursive: true }),
])
await Promise.all([
  writeFile(join(projectRoot, "图片", "sample.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")),
  writeFile(join(projectRoot, "小说", "正文.md"), `# 正文\n\n${Array.from({ length: 35 }, (_value, index) => `前置段落 ${index + 1}：用于验证标题定位不会停在文档顶部。`).join("\n\n")}\n\n## 第三章\n\n这是标题定位后的正文。`, "utf8"),
])

const reply = "这里是项目引用：\n\n![项目样图](图片/sample.png)\n\n[打开第三章](小说/正文.md#第三章)\n\n[外部资料](https://example.com/)\n\n[越界文件](../../secret.md)"
const provider = createServer((request, response) => {
  request.resume()
  request.on("end", () => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ id: "heritage-links", object: "chat.completion.chunk", created: 0, model: "heritage-links-test", choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Heritage links Provider did not expose a port")

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
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const sessionId = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "引用测试", providerId: "openai-compatible", modelId: "heritage-links-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Heritage links test has no project")
    const session = await window.creatx.createSession(bootstrap.value.project.id)
    if (!session.ok) throw new Error(session.error.message)
    return session.value.id
  }, `http://127.0.0.1:${address.port}/v1`)

  await page.reload()
  await page.locator(`.wb-conversation-session-strip [data-session-id="${sessionId}"]`).click()
  await page.locator(".composer textarea").fill("请给我项目图片和第三章链接")
  await page.getByTitle("发送", { exact: true }).click()
  const imageControl = page.getByTitle("在工作台打开：sample.png")
  await imageControl.waitFor({ timeout: 30_000 })
  await imageControl.click()
  await page.locator('.workbench-stage img[alt="sample.png"]').waitFor()

  const link = page.getByRole("link", { name: "打开第三章", exact: true })
  await link.click()
  const heading = page.locator('[data-markdown-heading="第三章"]')
  await heading.waitFor()
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLElement>(".wb-map-canvas")
    const target = document.querySelector<HTMLElement>('[data-markdown-heading="第三章"]')
    if (!canvas || !target) return false
    const canvasRect = canvas.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    return canvas.scrollTop > 0 && targetRect.top >= canvasRect.top && targetRect.top < canvasRect.bottom
  })
  if (await page.getByRole("link", { name: "外部资料", exact: true }).getAttribute("aria-disabled") !== "true" || await page.getByRole("link", { name: "越界文件", exact: true }).getAttribute("aria-disabled") !== "true") {
    throw new Error("Unsafe Markdown references were not failed closed")
  }

  const handle = page.locator('[data-separator="workbench-canvas"]')
  const before = await page.locator(".workbench-rail").evaluate((element) => element.getBoundingClientRect().width)
  await handle.focus()
  await handle.press("ArrowRight")
  const after = await page.locator(".workbench-rail").evaluate((element) => element.getBoundingClientRect().width)
  const canvasWidth = await page.locator(".workbench-stage").evaluate((element) => element.getBoundingClientRect().width)
  if (after >= before || canvasWidth < 300) throw new Error(`Workbench navigation resize failed: ${JSON.stringify({ before, after, canvasWidth })}`)

  await page.getByTitle("打开传承库").click()
  await page.locator("#heritage-library-title").waitFor()
  const categories = await page.locator('.wb-heritage-categories button').allTextContents()
  const count = await page.locator(".wb-heritage-card").count()
  if (JSON.stringify(categories) !== JSON.stringify(["全部", "OC创作", "艺术欣赏", "世界观", "图画创作"]) || count !== 20) {
    throw new Error(`Heritage catalog projection mismatch: ${JSON.stringify({ categories, count })}`)
  }

  console.log(JSON.stringify({ status: "HERITAGE WORKBENCH LINKS PASS", sessionId, navigationWidths: { before, after }, canvasWidth, categories, count }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}
