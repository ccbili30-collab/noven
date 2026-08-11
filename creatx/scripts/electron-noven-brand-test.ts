import { createServer } from "node:http"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "noven-brand-project-"))
const userData = await mkdtemp(join(tmpdir(), "noven-brand-data-"))
const packagedExecutable = process.env.CREATX_TEST_EXECUTABLE?.trim()
const electronExecutable = process.env.CREATX_TEST_ELECTRON_EXECUTABLE?.trim()
await writeFile(join(projectRoot, "preview.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"))
let providerRequests = 0
const provider = createServer((request, response) => {
  request.resume()
  request.on("end", () => {
    providerRequests += 1
    response.writeHead(200, { "content-type": "text/event-stream" })
    if (providerRequests === 1) {
      response.end(`data: ${JSON.stringify({ id: "noven-brand", object: "chat.completion.chunk", created: 0, model: "noven-test", choices: [{ index: 0, delta: { role: "assistant", content: "![圆角测试](preview.png)" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
      return
    }
    response.write(`data: ${JSON.stringify({ id: "noven-brand-running", object: "chat.completion.chunk", created: 0, model: "noven-test", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] })}\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Noven brand Provider did not expose a port")

const app = await electron.launch({
  executablePath: packagedExecutable || electronExecutable || resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [...(packagedExecutable ? [] : [workspace]), `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
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
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  if (await page.title() !== "诺文") throw new Error(`Unexpected window title: ${await page.title()}`)
  await page.getByLabel("诺文", { exact: true }).waitFor()
  if (await page.locator(".wb-onboarding-layer").count()) await page.getByRole("button", { name: "跳过" }).click()
  await page.getByText("灵感库", { exact: true }).waitFor()
  if (await page.getByText("点子库", { exact: true }).count()) throw new Error("Legacy visible library name remains")

  const layout = await page.evaluate(async () => {
    await document.fonts.ready
    const permission = document.querySelector<HTMLElement>(".wb-permission-switch")
    const skill = document.querySelector<HTMLElement>(".wb-skill-basket")
    const arm = document.querySelector<HTMLElement>(".wb-skill-basket-arm")
    if (!permission || !skill || !arm) throw new Error("Composer controls are missing")
    const permissionRect = permission.getBoundingClientRect()
    const skillRect = skill.getBoundingClientRect()
    const armRect = arm.getBoundingClientRect()
    return {
      fontLoaded: document.fonts.check('13px "JetBrains Mono"'),
      fontFamily: getComputedStyle(document.querySelector(".worldbuilder-app")!).fontFamily,
      sameToolbar: permission.parentElement === skill.parentElement && skill.parentElement?.classList.contains("wb-composer-tools-left"),
      skillFollowsPermission: skillRect.left >= permissionRect.right - 1 && skillRect.left - permissionRect.right <= 8,
      arm: { width: armRect.width, height: armRect.height },
    }
  })
  if (!layout.fontLoaded || !layout.fontFamily.includes("JetBrains Mono")) throw new Error(`JetBrains Mono did not load: ${JSON.stringify(layout)}`)
  if (!layout.sameToolbar || !layout.skillFollowsPermission) throw new Error(`Skill control is not adjacent to permission: ${JSON.stringify(layout)}`)
  if (layout.arm.width !== 14 || layout.arm.height !== 14) throw new Error(`Skill arm is not compact: ${JSON.stringify(layout.arm)}`)

  await page.locator(".wb-library-actions").getByText("艺术库", { exact: true }).click()
  const artPage = page.locator(".wb-art-library")
  await artPage.waitFor({ timeout: 10_000 })
  await page.locator(".wb-art-library-list").waitFor({ timeout: 10_000 })
  if (await page.locator('iframe[title="诺文艺术库"]').count()) throw new Error("Legacy art-library iframe remains")
  const artFont = await artPage.evaluate(async (element) => {
    await document.fonts.ready
    return { loaded: document.fonts.check('13px "JetBrains Mono"'), family: getComputedStyle(element).fontFamily }
  })
  if (!artFont.loaded || !artFont.family.includes("JetBrains Mono")) throw new Error(`Art library font did not load: ${JSON.stringify(artFont)}`)

  const sessionId = await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "诺文界面验收", providerId: "openai-compatible", modelId: "noven-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Noven brand test has no project")
    const session = await window.creatx.createSession(bootstrap.value.project.id)
    if (!session.ok) throw new Error(session.error.message)
    return session.value.id
  }, `http://127.0.0.1:${address.port}/v1`)

  await page.reload()
  await page.locator(`.wb-project-navigation [data-session-id="${sessionId}"]`).click()
  await page.locator(".composer textarea").fill("验证消息按钮与图片")
  await page.getByTitle("发送", { exact: true }).click()

  const userMessage = page.locator(".wb-context-message.user").last()
  await userMessage.waitFor({ timeout: 10_000 })
  if (await userMessage.locator(":scope > span").count()) throw new Error("User bubble still renders the 你 label")
  const actions = userMessage.locator(".wb-message-actions")
  await actions.waitFor({ timeout: 10_000 })
  const collapsedAction = await actions.locator("button").first().locator("span").evaluate((label) => ({ opacity: getComputedStyle(label).opacity, maxWidth: getComputedStyle(label).maxWidth }))
  if (collapsedAction.opacity !== "0" || collapsedAction.maxWidth !== "0px") throw new Error(`Message action text is visible before hover: ${JSON.stringify(collapsedAction)}`)
  await actions.locator("button").first().hover()
  await page.waitForTimeout(180)
  const expandedAction = await actions.locator("button").first().locator("span").evaluate((label) => ({ opacity: getComputedStyle(label).opacity, maxWidth: getComputedStyle(label).maxWidth }))
  if (expandedAction.opacity !== "1" || Number.parseFloat(expandedAction.maxWidth) <= 0) throw new Error(`Message action text did not appear on hover: ${JSON.stringify(expandedAction)}`)

  const image = page.locator(".wb-context-message.assistant .markdown-image img")
  await image.waitFor({ timeout: 10_000 })
  const imageRadius = await image.evaluate((element) => getComputedStyle(element).borderRadius)
  if (imageRadius !== "10px") throw new Error(`Conversation image is not rounded: ${imageRadius}`)
  const scrollbarTrack = await page.locator(".wb-context-scroll").evaluate((element) => getComputedStyle(element, "::-webkit-scrollbar-track").backgroundColor)
  if (scrollbarTrack !== "rgba(0, 0, 0, 0)") throw new Error(`Conversation scrollbar track is not transparent: ${scrollbarTrack}`)

  await page.locator(".composer textarea").fill("验证停止按钮")
  const sendRect = await page.locator(".wb-send").boundingBox()
  if (!sendRect) throw new Error("Send button is missing")
  await page.getByTitle("发送", { exact: true }).click()
  const stop = page.getByRole("button", { name: "停止当前回复" })
  await stop.waitFor({ timeout: 10_000 })
  const stopState = await stop.evaluate((button) => {
    const rect = button.getBoundingClientRect()
    return {
      className: button.className,
      text: button.textContent,
      color: getComputedStyle(button).color,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      sendCount: document.querySelectorAll(".wb-send").length,
      oldStopCount: document.querySelectorAll(".wb-stop-run").length,
    }
  })
  if (stopState.className !== "wb-send is-stop" || stopState.text?.trim()) throw new Error(`Run did not replace the send icon in place: ${JSON.stringify(stopState)}`)
  if (stopState.sendCount !== 1 || stopState.oldStopCount !== 0) throw new Error(`Duplicate stop/send controls remain: ${JSON.stringify(stopState)}`)
  if (Math.abs(stopState.rect.x - sendRect.x) > 1 || Math.abs(stopState.rect.y - sendRect.y) > 1 || stopState.rect.width !== sendRect.width || stopState.rect.height !== sendRect.height) throw new Error(`Stop control moved away from send position: ${JSON.stringify({ sendRect, stopState })}`)
  await stop.click()

  console.log(JSON.stringify({ status: "NOVEN BRAND PASS", layout, artFont, stopState, collapsedAction, expandedAction, imageRadius, scrollbarTrack }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}
