import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const project = await mkdtemp(join(tmpdir(), "creatx-workbench-annotation-project-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-workbench-annotation-data-"))
const imagePath = join(project, "参考图.png")
await writeFile(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"))
const markdownPath = join(project, "长文.md")
const htmlPath = join(project, "交互图.html")
await writeFile(markdownPath, Array.from({ length: 80 }, (_value, index) => `## 段落 ${index + 1}\n\n这是用于滚动批注验证的正文。`).join("\n\n"), "utf8")
await writeFile(htmlPath, "<!doctype html><style>html,body{margin:0;height:100%;background:#17324d;color:#fff}main{display:grid;place-items:center;height:100%;font:32px sans-serif}</style><main>隔离 HTML 作品</main>", "utf8")
const sourceHashes = new Map(await Promise.all([imagePath, markdownPath, htmlPath].map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")] as const)))
const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1.25"],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: project,
  },
})

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1200, height: 760 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Annotation test project did not bootstrap")
    const created = await window.creatx.createSession(bootstrap.value.project.id)
    if (!created.ok) throw new Error(created.error.message)
  })
  await page.reload()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const annotations: Array<{ name: string; dimensions: { width: number; height: number } }> = []
  let sampledColor = ""
  const annotate = async (name: string, options: { failOnce?: boolean; guardOnce?: boolean; sample?: boolean; scroll?: boolean } = {}) => {
    await page.locator('.wb-workspace-file-pane [role="treeitem"]', { hasText: name }).click()
    await page.getByTitle("视觉批注", { exact: true }).waitFor()
    if (options.scroll) await page.locator(".wb-map-canvas").evaluate((element) => { element.scrollTop = 360 })
    await page.getByTitle("视觉批注", { exact: true }).click()
    const canvas = page.getByLabel("视觉批注蒙版", { exact: true })
    const [box, surfaceBox] = await Promise.all([canvas.boundingBox(), page.locator(".wb-map-canvas").boundingBox()])
    if (!box || !surfaceBox || box.width < 100 || box.height < 100 || Math.abs(box.x - surfaceBox.x) > 1 || Math.abs(box.y - surfaceBox.y) > 1 || Math.abs(box.width - surfaceBox.width) > 1 || Math.abs(box.height - surfaceBox.height) > 1) {
      throw new Error(`Annotation canvas does not cover the visible workbench after scrolling: ${JSON.stringify({ name, box, surfaceBox })}`)
    }
    await page.mouse.move(box.x + box.width * .25, box.y + box.height * .35)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .75, box.y + box.height * .65, { steps: 12 })
    await page.mouse.up()
    await page.getByTitle("撤销", { exact: true }).click()
    await page.getByTitle("重做", { exact: true }).click()
    if (options.guardOnce) {
      page.once("dialog", (dialog) => dialog.dismiss())
      await page.locator('.wb-secondary-nav button[title="设置"]').click()
      if (!await canvas.isVisible()) throw new Error("Annotation draft was discarded after navigation cancellation")
    }
    if (options.sample) {
      await page.getByTitle("选择颜色", { exact: true }).click()
      await page.getByTitle("从作品取色", { exact: true }).click()
      await page.mouse.click(box.x + box.width * .5, box.y + box.height * .5)
      await page.getByTitle("选择颜色", { exact: true }).click()
      sampledColor = await page.getByLabel("十六进制颜色", { exact: true }).inputValue()
      await page.getByTitle("选择颜色", { exact: true }).click()
    }
    if (options.failOnce) {
      const sourceId = await page.locator(".wb-map-canvas").getAttribute("data-annotation-source-id")
      await page.locator(".wb-map-canvas").evaluate((element) => element.setAttribute("data-annotation-source-id", "mismatched-source"))
      await page.getByRole("button", { name: "加入对话", exact: true }).click()
      await page.locator(".wb-annotation-error").filter({ hasText: "workbench_capture_invalid" }).waitFor()
      if (!await canvas.isVisible() || await page.getByTitle("撤销", { exact: true }).isDisabled()) throw new Error("Annotation draft was lost after a failed capture")
      if (!sourceId) throw new Error("Annotation source identity disappeared")
      await page.locator(".wb-map-canvas").evaluate((element, value) => element.setAttribute("data-annotation-source-id", value), sourceId)
    }
    await page.getByRole("button", { name: "加入对话", exact: true }).click()
    const attachment = page.locator(".wb-composer-attachments .attachment-chip.image").nth(annotations.length)
    await attachment.waitFor({ timeout: 5_000 }).catch(async () => {
      const annotationError = await page.locator(".wb-annotation-error").textContent().catch(() => undefined)
      const surface = await page.locator(".wb-map-canvas").evaluate((element) => ({ projectId: element.getAttribute("data-annotation-project-id"), sourceId: element.getAttribute("data-annotation-source-id"), rect: element.getBoundingClientRect().toJSON() })).catch(() => undefined)
      throw new Error(`Annotation attachment was not registered: ${JSON.stringify({ name, annotationError, surface })}`)
    })
    const preview = attachment.locator("img")
    await preview.waitFor()
    const dimensions = await preview.evaluate(async (image: HTMLImageElement) => {
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight }
    })
    annotations.push({ name, dimensions })
  }
  await annotate("参考图.png", { sample: true })
  await annotate("长文.md", { failOnce: true, scroll: true })
  await annotate("交互图.html", { guardOnce: true })
  const changedSources = (await Promise.all([...sourceHashes].map(async ([path, hash]) => createHash("sha256").update(await readFile(path)).digest("hex") === hash))).filter((unchanged) => !unchanged).length
  const timeline = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    const session = bootstrap.ok ? bootstrap.value.sessions[0] : undefined
    if (!session) return []
    const result = await window.creatx.readTimeline(session.id)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
  const focused = await page.locator(".composer textarea").evaluate((element) => document.activeElement === element)
  if (changedSources !== 0 || timeline.length !== 0 || !focused || annotations.some((annotation) => annotation.dimensions.width < 100 || annotation.dimensions.height < 100) || sampledColor === "#FF3B30") {
    throw new Error(`Annotation vertical path failed: ${JSON.stringify({ changedSources, timelineItems: timeline.length, focused, annotations, sampledColor })}`)
  }
  console.log(JSON.stringify({ status: "WORKBENCH ANNOTATION PASS", changedSources, timelineItems: timeline.length, focused, annotations, sampledColor }))
} finally {
  await app.close().catch(() => undefined)
  await Promise.all([project, userData].map((path) => rm(path, { recursive: true, force: true })))
}
