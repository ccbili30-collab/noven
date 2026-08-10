import { createServer } from "node:http"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectA = await mkdtemp(join(tmpdir(), "creatx-session-switch-a-"))
const projectB = await mkdtemp(join(tmpdir(), "creatx-session-switch-b-"))
const userData = await mkdtemp(join(tmpdir(), "creatx-session-switch-data-"))
await Promise.all(Array.from({ length: 12 }, (_value, index) => mkdir(join(projectB, `区域-${index}`), { recursive: true })))
await Promise.all(Array.from({ length: 1_200 }, (_value, index) => writeFile(join(projectB, `区域-${Math.floor(index / 100)}`, `资料-${index}.md`), `# 资料 ${index}\n`)))

let providerRequests = 0
const provider = createServer((request, response) => {
  request.resume()
  request.on("end", () => {
    providerRequests += 1
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ id: `session-switch-${providerRequests}`, object: "chat.completion.chunk", created: 0, model: "switch-test", choices: [{ index: 0, delta: { role: "assistant", content: `切换测试回复 ${providerRequests}` }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Session switch Provider did not expose a port")

const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectA,
    DEEPSEEK_API_KEY: "unused-test-key",
  },
})

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1100, height: 720 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const projectAId = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "会话切换测试", providerId: "openai-compatible", modelId: "switch-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Session switch test has no first project")
    return bootstrap.value.project.id
  }, `http://127.0.0.1:${address.port}/v1`)
  const first = await createSession(page, projectAId)

  await app.evaluate(async ({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, projectB)
  const projectBId = await page.evaluate(async () => {
    const result = await window.creatx.chooseProject()
    if (!result.ok || !result.value) throw new Error("Session switch test could not choose second project")
    return result.value.id
  })
  const second = await createSession(page, projectBId)

  await page.reload()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  await page.getByTitle("展开项目导航", { exact: true }).click()
  await page.locator(`.wb-project-navigation [data-session-id="${first}"]`).waitFor({ timeout: 30_000 })
  await page.getByTitle(projectB, { exact: true }).click()
  await page.locator(`.wb-project-navigation [data-session-id="${second}"]`).waitFor({ timeout: 30_000 })
  await page.waitForFunction((sessionId) => document.querySelector(`.wb-project-navigation [data-session-id="${sessionId}"]`)?.classList.contains("is-active"), second)
  await page.locator(`.wb-project-navigation [data-session-id="${first}"]`).click()
  await page.waitForFunction((sessionId) => document.querySelector(`.wb-project-navigation [data-session-id="${sessionId}"]`)?.classList.contains("is-active"), first)
  await page.locator(".composer textarea").fill("A 会话旧消息")
  await page.getByTitle("发送", { exact: true }).click()
  await page.getByText("切换测试回复 1", { exact: true }).waitFor({ timeout: 30_000 })
  await page.getByTitle("发送", { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator(`.wb-project-navigation [data-session-id="${second}"]`).waitFor({ timeout: 30_000 })

  await page.locator(".composer textarea").fill("只允许进入 B 会话")
  const startedAt = Date.now()
  const immediate = await page.evaluate(async (sessionId) => {
    const target = document.querySelector<HTMLButtonElement>(`.wb-project-navigation [data-session-id="${sessionId}"]`)
    const send = document.querySelector<HTMLButtonElement>('[title="发送"]')
    if (!target || !send) throw new Error("Session switch controls are missing")
    target.click()
    send.click()
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
    const messages = Array.from(document.querySelectorAll<HTMLElement>(".conversation-stage .wb-context-message")).map((element) => element.textContent ?? "")
    return {
      active: target.classList.contains("is-active"),
      header: document.querySelector(".conversation-stage .wb-panel-heading strong")?.textContent,
      oldMessageVisible: messages.some((message) => message.includes("A 会话旧消息")),
      messages,
    }
  }, second)
  const visibleSwitchMs = Date.now() - startedAt
  await page.getByText("切换测试回复 2", { exact: true }).waitFor({ timeout: 30_000 })
  const timelines = await page.evaluate(async ({ first, second }) => {
    const firstTimeline = await window.creatx.readTimeline(first)
    const secondTimeline = await window.creatx.readTimeline(second)
    if (!firstTimeline.ok) throw new Error(firstTimeline.error.message)
    if (!secondTimeline.ok) throw new Error(secondTimeline.error.message)
    return { first: firstTimeline.value, second: secondTimeline.value }
  }, { first, second })
  const contains = (items: typeof timelines.first, text: string) => items.some((item) => item.kind === "message" && item.presentation === "user" && item.text === text)
  if (!immediate.active || immediate.header !== projectB.split(/[\\/]/).at(-1) || immediate.oldMessageVisible) throw new Error(`Session did not switch visibly in the next frame: ${JSON.stringify(immediate)}`)
  if (!contains(timelines.first, "A 会话旧消息") || contains(timelines.first, "只允许进入 B 会话") || !contains(timelines.second, "只允许进入 B 会话")) {
    throw new Error("Session switch routed a user message to the wrong Timeline")
  }

  console.log(JSON.stringify({ status: "SESSION SWITCH PASS", visibleSwitchMs, providerRequests, immediate, first, second }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([projectA, projectB, userData].map((path) => rm(path, { recursive: true, force: true })))
}

async function createSession(page: Awaited<ReturnType<typeof app.firstWindow>>, projectId: string) {
  return page.evaluate(async (targetProjectId) => {
    const result = await window.creatx.createSession(targetProjectId)
    if (!result.ok) throw new Error(result.error.message)
    return result.value.id
  }, projectId)
}
