import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 交互工作台 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-workbench-data-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "project-chat-controls")
const workbenchId = "wb_550e8400-e29b-41d4-a716-446655440000"
const electronExecutable = process.env.CREATX_ELECTRON_EXECUTABLE?.trim() || resolve(workspace, "node_modules", "electron", "dist", "electron.exe")
const provider = createServer((request, response) => {
  request.resume()
  request.on("end", () => {
    const event = { id: "workbench-message-controls", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content: "已收到这条界面验收消息。" }, finish_reason: "stop" }] }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Workbench Provider did not expose a TCP port")

await mkdir(join(projectRoot, "世界", "图谱"), { recursive: true })
await mkdir(join(projectRoot, ".creatx", "workbenches"), { recursive: true })
await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "世界", "图谱", "index.html"), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><main id="graph">载入中</main><img src="mark.svg" alt="节点"><script src="app.js"></script></body></html>`, "utf8")
await writeFile(join(projectRoot, "世界", "图谱", "style.css"), "body{background:rgb(251,250,246)}#graph{color:rgb(46,42,34)}", "utf8")
await writeFile(join(projectRoot, "世界", "图谱", "mark.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"><circle cx=\"4\" cy=\"4\" r=\"3\"/></svg>", "utf8")
await writeFile(join(projectRoot, "世界", "图谱", "data.json"), JSON.stringify({ nodes: 12 }), "utf8")
await writeFile(join(projectRoot, "世界", "图谱", "app.js"), `Promise.all([fetch("data.json").then(r=>r.json()),fetch("https://example.com/blocked").then(()=>"unexpected",()=>"blocked")]).then(([data,network])=>{document.querySelector("#graph").textContent=data.nodes+" 个节点";document.body.dataset.network=network;document.body.dataset.bridge=String("creatx" in window)})`, "utf8")
await writeFile(join(projectRoot, ".creatx", "workbenches", `${workbenchId}.json`), `${JSON.stringify({ schemaVersion: 2, id: workbenchId, folder: "世界/图谱", title: "世界因果图", home: { entry: "index.html", mode: "interactive" } }, undefined, 2)}\n`, "utf8")

const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const app = await electron.launch({
  executablePath: electronExecutable,
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: { ...inheritedEnvironment, CREATX_DESKTOP_TEST: "1", CREATX_PROJECT_ROOT: projectRoot, DEEPSEEK_API_KEY: "desktop-invalid-key", CREATX_PROVIDER_BASE_URL: `http://127.0.0.1:${providerAddress.port}/v1` },
})

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const naming = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Project bootstrap is unavailable")
    const named = await window.creatx.createSession(bootstrap.value.project.id, "艺术库 Chat")
    const first = await window.creatx.createSession(bootstrap.value.project.id)
    if (!named.ok || !first.ok) throw new Error("Session naming probe failed")
    const renamed = await window.creatx.renameSession(first.value.id, "手动标题")
    const deleted = await window.creatx.deleteSession(first.value.id)
    const second = await window.creatx.createSession(bootstrap.value.project.id)
    if (!renamed.ok || !deleted.ok || !second.ok) throw new Error("Session mutation probe failed")
    return { projectName: bootstrap.value.project.name, named: named.value.title, first: first.value.title, second: second.value.title }
  })
  if (naming.named !== "艺术库 Chat" || naming.first !== "创作（1）" || naming.second !== "创作（2）") throw new Error(`Session naming mismatch: ${JSON.stringify(naming)}`)
  const composer = page.getByLabel("发送消息")
  const initialPrompts = ["准备删除的消息", "准备修改的消息", "准备重发的消息", "准备成功修改的消息", "准备成功重发的消息"]
  for (const prompt of initialPrompts) {
    await composer.fill(prompt)
    await composer.press("Enter")
    await page.locator(".wb-message-actions").nth(initialPrompts.indexOf(prompt)).waitFor({ timeout: 30_000 })
  }
  const messageActions = page.locator(".wb-message-actions")
  await messageActions.first().getByRole("button", { name: "删除" }).click()
  const deletionDialog = page.getByRole("alertdialog", { name: "从你的界面删除这条消息？" })
  await deletionDialog.getByText("AI 仍保留原消息", { exact: false }).waitFor()
  await deletionDialog.getByRole("button", { name: "只删除我这边" }).click()
  await page.waitForFunction(() => document.querySelectorAll(".wb-message-actions").length === 4)
  await page.reload()
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  const deletionPersistence = {
    actionCount: await page.locator(".wb-message-actions").count(),
    visibleUserMessages: await page.locator(".wb-context-message.user").allTextContents(),
  }
  if (deletionPersistence.actionCount !== 4 || deletionPersistence.visibleUserMessages.some((message) => message.includes("准备删除的消息"))) throw new Error(`Local message deletion did not persist across reload: ${JSON.stringify(deletionPersistence)}`)
  const editableMessage = page.locator(".wb-context-message.user", { hasText: "准备修改的消息" })
  await editableMessage.getByRole("button", { name: "修改" }).click()
  if (await composer.inputValue() !== "准备修改的消息") throw new Error("Message edit did not populate the Composer")
  await page.getByRole("button", { name: "取消修改" }).click()
  if (await composer.inputValue() !== "" || !await editableMessage.isVisible()) throw new Error("Cancelling a message edit changed local visibility")
  const successfulEdit = page.locator(".wb-context-message.user", { hasText: "准备成功修改的消息" })
  await successfulEdit.getByRole("button", { name: "修改" }).click()
  await composer.fill("修改成功的新消息")
  await composer.press("Enter")
  await page.waitForFunction(() => {
    const messages = Array.from(document.querySelectorAll<HTMLElement>(".wb-context-message.user")).map((message) => message.textContent ?? "")
    return !messages.some((message) => message.includes("准备成功修改的消息")) && messages.some((message) => message.includes("修改成功的新消息")) && !document.querySelector(".wb-message-editing")
  }, undefined, { timeout: 30_000 })
  const successfulResend = page.locator(".wb-context-message.user", { hasText: "准备成功重发的消息" })
  const hiddenBeforeSuccessfulResend = await page.evaluate(() => window.localStorage.getItem("creatx.message-visibility.v1"))
  await successfulResend.getByRole("button", { name: "重发" }).click()
  await page.waitForFunction((before) => window.localStorage.getItem("creatx.message-visibility.v1") !== before && Array.from(document.querySelectorAll<HTMLElement>(".wb-context-message.user")).some((message) => message.textContent?.includes("准备成功重发的消息")), hiddenBeforeSuccessfulResend, { timeout: 30_000 })
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await editableMessage.getByRole("button", { name: "修改" }).click()
  await composer.fill("修改失败后应恢复")
  await composer.press("Enter")
  await page.locator(".wb-error-banner").waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => {
    const original = Array.from(document.querySelectorAll<HTMLElement>(".wb-context-message.user")).some((message) => message.textContent?.includes("准备修改的消息"))
    const draft = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.value
    return original && draft === "修改失败后应恢复" && Boolean(document.querySelector(".wb-message-editing"))
  }, undefined, { timeout: 5_000 }).catch(() => undefined)
  const failedEdit = {
    originalVisible: await editableMessage.isVisible(),
    draft: await composer.inputValue(),
    cancelVisible: await page.getByRole("button", { name: "取消修改" }).isVisible(),
    error: await page.locator(".wb-error-banner").textContent(),
  }
  if (!failedEdit.originalVisible || failedEdit.draft !== "修改失败后应恢复" || !failedEdit.cancelVisible) throw new Error(`Failed message edit did not restore the original row and draft: ${JSON.stringify(failedEdit)}`)
  await page.getByRole("button", { name: "取消修改" }).click()
  await page.locator(".wb-error-banner").getByRole("button").click()
  const resendMessage = page.locator(".wb-context-message.user", { hasText: "准备重发的消息" })
  const hiddenBeforeFailedResend = await page.evaluate(() => window.localStorage.getItem("creatx.message-visibility.v1"))
  await resendMessage.getByRole("button", { name: "重发" }).click()
  await page.locator(".wb-error-banner").waitFor({ timeout: 30_000 })
  const hiddenAfterFailedResend = await page.evaluate(() => window.localStorage.getItem("creatx.message-visibility.v1"))
  if (!await resendMessage.count() || hiddenAfterFailedResend !== hiddenBeforeFailedResend) throw new Error(`Failed message resend hid the original row: ${JSON.stringify({ visibleRows: await resendMessage.count(), hiddenBeforeFailedResend, hiddenAfterFailedResend })}`)
  const transfer = await page.evaluateHandle(() => {
    const value = new DataTransfer()
    value.items.add(new File(["preview"], "preview.txt", { type: "text/plain" }))
    return value
  })
  await page.dispatchEvent('[data-surface="conversation"]', "dragenter", { dataTransfer: transfer })
  await page.getByText("松开以添加到对话", { exact: true }).waitFor()
  await page.keyboard.press("Escape")
  await page.getByText("松开以添加到对话", { exact: true }).waitFor({ state: "detached" })
  await page.locator(".wb-workbench-switcher").click()
  await page.getByRole("menuitem", { name: "世界因果图" }).click()
  await page.locator('.workspace-shell[data-layout-mode="workbench"]').waitFor()
  await page.waitForTimeout(350)
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const value = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
      return value ? { x: value.x, right: value.right, width: value.width } : undefined
    }
    return {
      project: rect('[data-surface="session-tree"]'),
      conversation: rect('[data-surface="conversation"]'),
      canvas: rect('[data-surface="workbench-stage"]'),
      workbenchNavigation: rect('[data-surface="registered-workbench-rail"]'),
      conversationHeading: document.querySelector<HTMLElement>('.conversation-stage > .wb-panel-heading strong')?.textContent,
    }
  })
  if (!layout.project || !layout.conversation || !layout.canvas || !layout.workbenchNavigation
    || layout.project.right > layout.conversation.x + 2
    || layout.conversation.right > layout.canvas.x + 2
    || layout.canvas.right > layout.workbenchNavigation.x + 2
    || [layout.project, layout.conversation, layout.canvas, layout.workbenchNavigation].some((surface) => surface.width < 50)
    || layout.conversationHeading !== naming.projectName) {
    throw new Error(`Four-column layout mismatch: ${JSON.stringify(layout)}`)
  }
  await page.getByRole("button", { name: "向右收起工作台导航" }).click()
  await page.waitForTimeout(300)
  const collapsedRightWidth = await page.locator('[data-surface="registered-workbench-rail"]').evaluate((element) => element.getBoundingClientRect().width)
  if (Math.abs(collapsedRightWidth - 52) > 1) throw new Error(`Collapsed workbench navigation width mismatch: ${collapsedRightWidth}`)
  await page.getByRole("button", { name: "向左展开工作台导航" }).click()
  await page.waitForTimeout(300)
  const expandedProjectWidth = await page.locator('[data-surface="session-tree"]').evaluate((element) => element.getBoundingClientRect().width)
  const projectSeparator = page.locator('[data-separator="project-conversation"]')
  for (let index = 0; index < 24 && !await page.locator(".workspace-shell.project-nav-collapsed").count(); index += 1) await projectSeparator.press("ArrowLeft")
  await page.locator(".workspace-shell.project-nav-collapsed").waitFor()
  await page.getByRole("button", { name: "展开项目导航" }).click()
  await page.waitForTimeout(300)
  const restoredProjectWidth = await page.locator('[data-surface="session-tree"]').evaluate((element) => element.getBoundingClientRect().width)
  if (Math.abs(restoredProjectWidth - expandedProjectWidth) > 1) throw new Error(`Project navigation width was not restored: ${JSON.stringify({ expandedProjectWidth, restoredProjectWidth })}`)
  await page.screenshot({ path: join(evidenceDir, "four-column-workspace.png") })
  await page.setViewportSize({ width: 900, height: 700 })
  await page.waitForTimeout(350)
  const narrowClasses = await page.locator(".workspace-shell").getAttribute("class")
  if (!narrowClasses?.includes("project-nav-collapsed") || !narrowClasses.includes("workbench-navigation-collapsed")) throw new Error(`Narrow collapse priority mismatch: ${narrowClasses}`)
  await page.setViewportSize({ width: 860, height: 620 })
  await page.waitForTimeout(350)
  const compact = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, classes: document.querySelector(".workspace-shell")?.className }))
  if (compact.width !== 860 || compact.scrollWidth > 860 || !compact.classes?.includes("project-nav-collapsed") || !compact.classes.includes("workbench-navigation-collapsed")) throw new Error(`Compact workspace mismatch: ${JSON.stringify(compact)}`)
  const frame = page.frameLocator("iframe.wb-interactive-workbench")
  await frame.locator("#graph").getByText("12 个节点").waitFor({ timeout: 15_000 })
  const result = await frame.locator("body").evaluate((body) => ({
    network: body.dataset.network,
    bridge: body.dataset.bridge,
    background: getComputedStyle(body).backgroundColor,
    imageWidth: body.querySelector("img")?.naturalWidth,
  }))
  if (result.network !== "blocked" || result.bridge !== "false" || result.background !== "rgb(251, 250, 246)" || result.imageWidth !== 8) {
    throw new Error(`Interactive workbench boundary mismatch: ${JSON.stringify(result)}`)
  }
  console.log(`interactive-workbench: PASS ${JSON.stringify({ ...result, naming, layout, collapsedRightWidth, expandedProjectWidth, restoredProjectWidth, narrowClasses, compact })}`)
} finally {
  await app.close().catch(() => undefined)
  if (provider.listening) await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}
