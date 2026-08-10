import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { createServer } from "node:http"
import { _electron as electron } from "@playwright/test"
import type { Page } from "@playwright/test"
import { imageQueueSchemaVersion } from "../packages/image-runtime/src/queue-schema.ts"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 中文项目 "))
const externalRoot = await mkdtemp(join(tmpdir(), "CreatX 外部附件 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-electron-data-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "frontend-redesign", "desktop-test")
const packagedExecutable = process.env.CREATX_PACKAGED_EXE?.trim()
const electronExecutable = process.env.CREATX_TEST_ELECTRON_EXECUTABLE?.trim()
const provider = createDesktopProvider()
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Desktop Provider did not expose a TCP port")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const desktopEnvironment = {
  ...inheritedEnvironment,
  CREATX_DESKTOP_TEST: "1",
  CREATX_PROJECT_ROOT: projectRoot,
  DEEPSEEK_API_KEY: "desktop-invalid-key",
  CREATX_PROVIDER_BASE_URL: `http://127.0.0.1:${providerAddress.port}/v1`,
  CREATX_IMAGE_BASE_URL: "https://images.example/v1",
  CREATX_IMAGE_API_KEY: "desktop-test-key",
}
await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "创作笔记.md"), "# 创作笔记\n\n这是来自真实项目目录的内容。", "utf8")
await mkdir(join(projectRoot, "地图源"), { recursive: true })
await writeFile(join(projectRoot, "地图源", "生成掩码.mjs"), "export const mask = 'desktop-interaction-probe'\n", "utf8")
await copyFile(resolve(workspace, "apps", "desktop", "renderer", "src", "assets", "creatx-glass-buildings.png"), join(projectRoot, "对话图片.png"))
const externalFirst = join(externalRoot, "外部参考一.md")
const externalSecond = join(externalRoot, "外部参考二.txt")
await writeFile(externalFirst, "来自项目外部的第一份参考。", "utf8")
await writeFile(externalSecond, "来自项目外部的第二份参考。", "utf8")

const electronApp = await electron.launch({
  executablePath: packagedExecutable ? resolve(packagedExecutable) : electronExecutable || resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [...(packagedExecutable ? [] : [workspace]), `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: desktopEnvironment,
})

const pid = electronApp.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")
electronApp.process().stdout?.on("data", (chunk) => process.stdout.write(`electron: ${String(chunk)}`))
electronApp.process().stderr?.on("data", (chunk) => process.stderr.write(`electron: ${String(chunk)}`))
console.log(`desktop: launched pid=${pid}`)
const pageErrors: string[] = []
const consoleErrors: string[] = []
const failedRequests: string[] = []
let shutdownGoalId: string | undefined

try {
  const page = await electronApp.firstWindow()
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged)
  if (Boolean(packagedExecutable) !== isPackaged) throw new Error(`Desktop packaging mode mismatch: ${JSON.stringify({ packagedExecutable, isPackaged })}`)
  await page.setViewportSize({ width: 1355, height: 898 })
  console.log(`desktop: first window url=${page.url()}`)
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  console.log("desktop: shell visible")
  const structure = await page.evaluate(() => ({
    conversationIndex: document.querySelectorAll(".conversation-index-panel[data-surface='session-tree']").length,
    conversationStage: document.querySelectorAll(".conversation-stage[data-surface='conversation']").length,
    workbenchStage: document.querySelectorAll(".workbench-stage[data-surface='workbench-stage']").length,
    registeredRail: document.querySelectorAll(".workbench-rail[data-surface='registered-workbench-rail']").length,
    legacySessionPanel: document.querySelectorAll(".session-panel").length,
    legacyToolRail: document.querySelectorAll(".tool-rail").length,
  }))
  if (structure.conversationIndex !== 1 || structure.conversationStage !== 1 || structure.workbenchStage !== 1 || structure.registeredRail !== 1 || structure.legacySessionPanel !== 0 || structure.legacyToolRail !== 0) {
    throw new Error(`Desktop prototype component structure mismatch: ${JSON.stringify(structure)}`)
  }
  console.log("desktop: production worldbuilder component structure verified")
  const paper = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".workspace-shell")
    const surfaces = ["session-tree", "conversation", "registered-workbench-rail", "workbench-stage"].map((name) => {
      const element = document.querySelector<HTMLElement>(`[data-surface="${name}"]`)
      const style = element ? getComputedStyle(element) : undefined
      return { name, found: Boolean(element), visible: Boolean(element && element.getBoundingClientRect().width && element.getBoundingClientRect().height), background: style?.backgroundColor }
    })
    const conversation = document.querySelector<HTMLElement>('[data-surface="conversation"]')?.getBoundingClientRect()
    const canvas = document.querySelector<HTMLElement>('[data-surface="workbench-stage"]')?.getBoundingClientRect()
    return {
      mode: shell?.dataset.surfaceMode,
      layoutMode: shell?.dataset.layoutMode,
      columns: shell ? getComputedStyle(shell).gridTemplateColumns : "",
      conversationWidth: conversation?.width,
      canvasWidth: canvas?.width,
      inspectorCount: document.querySelectorAll(".wb-inspector").length,
      surfaces,
    }
  })
  const visibleChatSurfaces = paper.surfaces.filter((surface) => surface.name === "session-tree" || surface.name === "conversation")
  const hiddenChatSurfaces = paper.surfaces.filter((surface) => surface.name === "registered-workbench-rail" || surface.name === "workbench-stage")
  if (paper.mode !== "paper" || paper.layoutMode !== "chat" || paper.columns.split(" ").length < 4 || visibleChatSurfaces.some((surface) => !surface.found || !surface.visible) || hiddenChatSurfaces.some((surface) => !surface.found || surface.visible) || !paper.conversationWidth || paper.conversationWidth <= 1355 / 2 || (paper.canvasWidth ?? 2) > 1 || paper.inspectorCount !== 0) {
    throw new Error(`Desktop paper workspace contract mismatch: ${JSON.stringify(paper)}`)
  }
  console.log("desktop: Chat mode owns the primary workspace while the workbench canvas and inspector stay collapsed")
  const brand = page.locator(".wb-brand")
  if (await brand.getByText("CreatX", { exact: true }).count() !== 1 || await brand.locator("img.wb-bird-mark").count() !== 1 || await page.locator(".wb-project-tree").count() !== 1 || await page.locator(".wb-project-switcher").count() !== 0) {
    throw new Error("Desktop global navigation did not render the supplied CreatX SVG asset and project/session hierarchy")
  }
  for (const library of ["艺术库", "点子库", "传承库"]) {
    if (await page.getByRole("button", { name: library, exact: true }).count() !== 1) throw new Error(`Desktop global navigation is missing ${library}`)
  }
  await page.getByRole("button", { name: "传承库", exact: true }).click()
  await page.locator(".wb-heritage-library").waitFor()
  await page.getByRole("button", { name: "返回创作", exact: true }).click()
  await page.locator('[data-surface="conversation"]').waitFor()
  const navigationActions = await page.evaluate(async () => {
    const heading = document.querySelector<HTMLElement>(".wb-project-group-heading")?.getBoundingClientRect()
    const navigation = document.querySelector<HTMLElement>(".wb-project-navigation")?.getBoundingClientRect()
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Navigation deletion probe has no project")
    const disposable = await window.creatx.createSession(bootstrap.value.project.id)
    if (!disposable.ok) throw new Error(disposable.error.message)
    const renamed = await window.creatx.renameSession(disposable.value.id, "桌面改名验收")
    if (!renamed.ok || renamed.value.title !== "桌面改名验收") throw new Error(renamed.ok ? `Rename returned ${renamed.value.title}` : renamed.error.message)
    const deleted = await window.creatx.deleteSession(disposable.value.id)
    if (!deleted.ok) throw new Error(deleted.error.message)
    const after = await window.creatx.bootstrap()
    if (!after.ok) throw new Error(after.error.message)
    return {
      headingOffset: heading && navigation ? heading.x - navigation.x : undefined,
      renamedTitle: renamed.value.title,
      disposableSessionAbsent: !after.value.sessions.some((session) => session.id === disposable.value.id),
    }
  })
  if (navigationActions.headingOffset === undefined || navigationActions.headingOffset > 32 || navigationActions.renamedTitle !== "桌面改名验收" || !navigationActions.disposableSessionAbsent) {
    throw new Error(`Desktop project heading or permanent session deletion failed: ${JSON.stringify(navigationActions)}`)
  }
  await page.locator(".wb-project-row").hover()
  const projectMenuButton = page.getByTitle(/项目菜单$/).first()
  if (!await projectMenuButton.isVisible() || await page.getByTitle(/中新建会话$/).count() || !await page.locator(".wb-workbench-launcher-list").isVisible()) throw new Error("Desktop project navigation did not replace sessions with workbenches")
  await projectMenuButton.click()
  for (const item of ["置顶项目", "在资源管理器中打开", "编辑项目名称", "删除聊天", "从列表移除"]) {
    if (!await page.getByRole("menuitem", { name: item, exact: true }).isVisible()) throw new Error(`Desktop project menu is missing ${item}`)
  }
  await page.keyboard.press("ArrowDown")
  if (!await page.getByRole("menuitem", { name: "在资源管理器中打开", exact: true }).evaluate((element) => element === document.activeElement)) throw new Error("Desktop project menu did not support arrow-key navigation")
  await page.keyboard.press("Escape")
  if (!await projectMenuButton.evaluate((element) => element === document.activeElement)) throw new Error("Desktop project menu did not return focus on Escape")
  await projectMenuButton.click()
  await page.getByRole("menuitem", { name: "编辑项目名称", exact: true }).click()
  const renameDialog = page.getByRole("dialog", { name: "编辑项目名称" })
  await renameDialog.waitFor()
  if (!await renameDialog.getByLabel("项目显示名称").evaluate((element) => element === document.activeElement)) throw new Error("Desktop dialog did not move focus to its initial field")
  await renameDialog.press("Escape")
  await renameDialog.waitFor({ state: "detached" })
  if (!await projectMenuButton.evaluate((element) => element === document.activeElement)) throw new Error("Desktop dialog did not restore focus to its project-menu trigger")
  await projectMenuButton.click()
  await page.getByRole("menuitem", { name: "删除聊天", exact: true }).click()
  const deleteDialog = page.getByRole("alertdialog")
  await deleteDialog.waitFor()
  if (!await deleteDialog.getByText("永久删除", { exact: false }).count()) throw new Error("Desktop project chat deletion is not presented as permanent")
  if (!await deleteDialog.getByRole("button", { name: "取消", exact: true }).evaluate((element) => element === document.activeElement)) throw new Error("Desktop destructive dialog did not prefer the safe action")
  await deleteDialog.press("Escape")
  await deleteDialog.waitFor({ state: "detached" })
  if (!await projectMenuButton.evaluate((element) => element === document.activeElement)) throw new Error("Desktop destructive dialog did not restore trigger focus")
  const separatorIds = ["project-conversation", "conversation-workbench", "workbench-canvas"]
  const chatSeparatorIds = ["project-conversation"]
  const separatorProbe = await page.locator('[role="separator"]').evaluateAll((elements) => ({
    total: elements.length,
    visible: elements.filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none"
    }).length,
    ids: elements.map((element) => ({
      id: element.getAttribute("data-separator"),
      rect: element.getBoundingClientRect().toJSON(),
      display: getComputedStyle(element).display,
      orientation: element.getAttribute("aria-orientation"),
      value: element.getAttribute("aria-valuenow"),
      tabIndex: (element as HTMLElement).tabIndex,
    })),
  }))
  const canvasSeparator = separatorProbe.ids.find((separator) => separator.id === "workbench-canvas")
  const chatSeparators = separatorProbe.ids.filter((separator) => chatSeparatorIds.includes(separator.id ?? ""))
  if (separatorProbe.total !== separatorIds.length || chatSeparators.some((separator) => separator.orientation !== "vertical" || !separator.value || separator.tabIndex !== 0) || canvasSeparator?.tabIndex !== -1) {
    throw new Error(`Desktop Chat mode separator contract mismatch: ${JSON.stringify(separatorProbe)}`)
  }
  const readPanelWidths = () => page.locator(".worldbuilder-app").evaluate((shell) => ({
    project: shell.style.getPropertyValue("--wb-project-nav-width"),
    conversation: shell.style.getPropertyValue("--wb-conversation-width"),
    workbench: shell.style.getPropertyValue("--wb-workbench-width"),
  }))
  for (const separatorId of chatSeparatorIds) {
    const handle = page.locator(`[data-separator="${separatorId}"]`)
    const before = await readPanelWidths()
    const box = await handle.boundingBox()
    if (!box) throw new Error(`Desktop separator is not visible: ${separatorId}`)
    if (separatorId === "project-conversation") await page.evaluate(() => {
      document.documentElement.dataset.panelLayoutWrites = "0"
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function(key, value) {
        if (key === "creatx.workspace.panel-widths.v3") document.documentElement.dataset.panelLayoutWrites = String(Number(document.documentElement.dataset.panelLayoutWrites ?? 0) + 1)
        return original.call(this, key, value)
      }
      window.addEventListener("creatx:test:restore-storage", () => { Storage.prototype.setItem = original }, { once: true })
    })
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, { steps: separatorId === "project-conversation" ? 12 : 1 })
    if (separatorId === "project-conversation") {
      const writesDuringDrag = await page.locator("html").getAttribute("data-panel-layout-writes")
      if (writesDuringDrag !== "0") throw new Error(`Desktop persisted panel layout during pointer movement: ${writesDuringDrag}`)
    }
    await page.mouse.up()
    if (separatorId === "project-conversation") {
      await page.waitForTimeout(50)
      const writesAfterDrag = await page.locator("html").getAttribute("data-panel-layout-writes")
      await page.evaluate(() => window.dispatchEvent(new Event("creatx:test:restore-storage")))
      if (writesAfterDrag !== "1") throw new Error(`Desktop did not persist panel layout exactly once after pointer release: ${writesAfterDrag}`)
    }
    const after = await readPanelWidths()
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error(`Desktop separator did not resize its panels: ${separatorId}`)
  }
  const keyboardBefore = await readPanelWidths()
  await page.locator('[data-separator="project-conversation"]').focus()
  await page.keyboard.press("ArrowLeft")
  const keyboardAfter = await readPanelWidths()
  if (JSON.stringify(keyboardBefore) === JSON.stringify(keyboardAfter)) throw new Error("Desktop separator did not support keyboard resizing")
  const expectedPersistentPanelWidths = keyboardAfter
  console.log("desktop: CreatX supplied SVG brand, global project hierarchy, and Chat mode separators verified")
  const openProjectActions = await page.getByRole("button", { name: "打开项目", exact: true }).count()
  const misleadingProjectActions = await page.getByRole("button", { name: /新建项目|创建项目/ }).count()
  const deferredActions = await page.getByRole("button", { name: /回收站|侧聊/ }).count()
  if (openProjectActions < 1 || misleadingProjectActions !== 0 || deferredActions !== 0) {
    throw new Error(`Desktop command mapping mismatch: ${JSON.stringify({ openProjectActions, misleadingProjectActions, deferredActions })}`)
  }
  console.log("desktop: open-project semantics and deferred-action hiding verified")
  const composerModel = page.getByTitle(/切换交流模型/)
  if (!await composerModel.textContent() || await page.getByTitle(/语音/).count() !== 0) {
    throw new Error("Desktop composer did not expose the text model or rendered the deferred voice control")
  }
  const modelProjection = await page.evaluate(async () => {
    const result = await window.creatx.readModelSettings()
    if (!result.ok) throw new Error(result.error.message)
    return { snapshot: result.value, serialized: JSON.stringify(result.value) }
  })
  if (!modelProjection.snapshot.textProfiles.length || !modelProjection.snapshot.image.configured || /desktop-invalid-key|desktop-test-key/.test(modelProjection.serialized)) {
    throw new Error(`Desktop model settings projection mismatch: ${modelProjection.serialized}`)
  }
  await composerModel.click()
  await page.getByRole("menuitem", { name: "模型配置" }).click()
  const settingsPage = page.locator(".wb-settings-page")
  await settingsPage.waitFor()
  if (!await settingsPage.getByRole("heading", { name: "模型", exact: true }).isVisible() || await page.locator(".dialog-backdrop").count()) throw new Error("Desktop settings did not open as a full workspace page")
  if (await settingsPage.locator('input[type="password"]').evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value.length > 0))) {
    throw new Error("Desktop model settings exposed a saved secret to the Renderer")
  }
  await settingsPage.getByRole("button", { name: "生图", exact: true }).click()
  const imageSettingsForm = settingsPage.locator(".wb-settings-form")
  await imageSettingsForm.locator("input").first().fill("https://images-updated.example/v1")
  await imageSettingsForm.locator("select").selectOption("gpt-image-2")
  await imageSettingsForm.getByRole("button", { name: "保存", exact: true }).click()
  const updatedImageSettings = await page.evaluate(async () => {
    const result = await window.creatx.readModelSettings()
    if (!result.ok) throw new Error(result.error.message)
    return result.value.image
  })
  if (updatedImageSettings.baseUrl !== "https://images-updated.example/v1" || updatedImageSettings.defaultModel !== "gpt-image-2" || !updatedImageSettings.configured) {
    throw new Error(`Desktop image model settings did not save: ${JSON.stringify(updatedImageSettings)}`)
  }
  const storedModelSettings = await readFile(join(userData, "creatx", "models.json"), "utf8")
  if (storedModelSettings.includes("desktop-invalid-key") || storedModelSettings.includes("desktop-test-key")) {
    throw new Error("Desktop persisted a model credential as plaintext")
  }
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-model-settings.png"))
  await settingsPage.getByRole("button", { name: "外观", exact: true }).click()
  const appearanceSettings = settingsPage.locator(".wb-appearance-settings")
  await appearanceSettings.getByLabel("字体").selectOption("serif")
  await appearanceSettings.getByLabel("界面字号").selectOption("16")
  await appearanceSettings.getByLabel("阅读字号").selectOption("18")
  const appearanceProjection = await page.locator(".worldbuilder-app").evaluate((element) => ({
    fontFamily: getComputedStyle(element).fontFamily,
    fontSize: getComputedStyle(element).fontSize,
    readingFontSize: getComputedStyle(element).getPropertyValue("--wb-reading-font-size").trim(),
    stored: window.localStorage.getItem("creatx.appearance.v1"),
  }))
  if (!/serif|SimSun|Songti/u.test(appearanceProjection.fontFamily) || appearanceProjection.fontSize !== "16px" || appearanceProjection.readingFontSize !== "18px" || !appearanceProjection.stored?.includes('"interfaceFontSize":16') || !appearanceProjection.stored.includes('"readingFontSize":18')) {
    throw new Error(`Desktop appearance settings did not apply and persist: ${JSON.stringify(appearanceProjection)}`)
  }
  await appearanceSettings.getByRole("button", { name: "恢复默认" }).click()
  if (await page.locator(".worldbuilder-app").evaluate((element) => getComputedStyle(element).fontSize) !== "13px") throw new Error("Desktop appearance reset did not apply")
  await appearanceSettings.getByLabel("字体").selectOption("serif")
  await appearanceSettings.getByLabel("界面字号").selectOption("16")
  await appearanceSettings.getByLabel("阅读字号").selectOption("18")
  await page.reload()
  await page.locator(".worldbuilder-app").waitFor()
  const reloadedAppearance = await page.evaluate(() => ({
    root: getComputedStyle(document.querySelector(".worldbuilder-app")!).fontSize,
    tree: getComputedStyle(document.querySelector(".wb-tree-scroll")!).fontSize,
    reading: getComputedStyle(document.querySelector(".wb-context-composer textarea")!).fontSize,
  }))
  if (reloadedAppearance.root !== "16px" || reloadedAppearance.tree !== "15.5px" || reloadedAppearance.reading !== "18px") throw new Error(`Desktop independent appearance sizes did not survive reload: ${JSON.stringify(reloadedAppearance)}`)
  await page.evaluate(() => window.localStorage.setItem("creatx.appearance.v1", JSON.stringify({ font: "system", interfaceFontSize: 13, readingFontSize: 15 })))
  await page.reload()
  await page.locator(".worldbuilder-app").waitFor()
  await page.getByTitle("添加").click()
  await page.getByRole("menuitem", { name: "添加附件" }).waitFor()
  console.log("desktop: composer plus menu, model switcher, redacted settings, and separate image configuration verified")
  await electronApp.evaluate(({ dialog }) => {
    Object.defineProperty(dialog, "showOpenDialog", { configurable: true, value: async () => ({ canceled: true, filePaths: [] }) })
  })
  await page.getByRole("menuitem", { name: "添加附件" }).click()
  if (await page.locator(".attachment-chip").count() !== 0) throw new Error("Cancelled attachment selection created a chip")
  await electronApp.evaluate(({ dialog }, filePaths) => {
    Object.defineProperty(dialog, "showOpenDialog", { configurable: true, value: async () => ({ canceled: false, filePaths }) })
  }, Array.from({ length: 21 }, () => externalFirst))
  const overflowSelection = await page.evaluate(() => window.creatx.chooseAttachments())
  if (overflowSelection.ok || overflowSelection.error.code !== "attachment_invalid") throw new Error("Attachment selection accepted more than 20 files")
  await electronApp.evaluate(({ dialog }, filePaths) => {
    Object.defineProperty(dialog, "showOpenDialog", { configurable: true, value: async () => ({ canceled: false, filePaths }) })
  }, [externalFirst, externalSecond])
  await page.getByTitle("添加").click()
  await page.getByRole("menuitem", { name: "添加附件" }).click()
  await page.locator(".attachment-chip").filter({ hasText: "外部参考一.md" }).waitFor()
  await page.locator(".attachment-chip").filter({ hasText: "外部参考二.txt" }).waitFor()
  if (await page.locator(".attachment-chip").count() !== 2) throw new Error("Multi-select attachment chips were not rendered")
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-attachments.png"))
  await page.getByTitle("移除附件：外部参考二.txt").click()
  if (await page.locator(".attachment-chip").count() !== 1) throw new Error("Attachment removal did not update the composer")
  await electronApp.evaluate(({ shell }) => {
    Object.defineProperty(shell, "openPath", {
      configurable: true,
      value: async (path: string) => {
        process.env.CREATX_TEST_OPENED_ATTACHMENT = path
        return ""
      },
    })
  })
  await page.locator(".composer textarea").fill("## Markdown 验收\n\n**请阅读附件。**\n\n- 项目图片\n- 禁止远程图片\n\n![项目图片](对话图片.png)\n\n![禁止远程](https://example.com/tracker.png)")
  await page.getByTitle("发送", { exact: true }).click()
  await page.getByRole("button", { name: "外部参考一.md", exact: true }).waitFor({ timeout: 30_000 })
  await page.locator(".message-markdown h2", { hasText: "Markdown 验收" }).waitFor()
  const markdownImage = page.locator('.markdown-image img[alt="项目图片"]')
  await markdownImage.waitFor()
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.markdown-image img[alt="项目图片"]')
    return Boolean(image?.complete && image.naturalWidth > 0)
  })
  if (await page.locator('.markdown-image img[alt="禁止远程"]').count() !== 0) throw new Error("Remote Markdown image was rendered")
  if (!await page.locator(".markdown-image-unavailable", { hasText: "禁止远程" }).count()) throw new Error("Blocked Markdown image did not show a closed failure state")
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-markdown-image.png"))
  console.log("desktop: Markdown and project image rendered without remote image access")
  await page.getByRole("button", { name: "外部参考一.md", exact: true }).click()
  let openedAttachment: string | undefined
  for (let attempt = 0; attempt < 40 && !openedAttachment; attempt += 1) {
    openedAttachment = await electronApp.evaluate(() => process.env.CREATX_TEST_OPENED_ATTACHMENT)
    if (!openedAttachment) await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
  if (!openedAttachment || resolve(openedAttachment) !== resolve(externalFirst)) {
    const attachmentDiagnostic = await page.evaluate(() => ({
      errors: Array.from(document.querySelectorAll(".wb-error-banner, .error-banner")).map((element) => element.textContent),
      buttons: Array.from(document.querySelectorAll("button")).filter((button) => button.textContent?.includes("外部参考一.md")).map((button) => ({ text: button.textContent, title: button.title })),
    }))
    throw new Error(`Desktop opened an unverified attachment path: ${openedAttachment ?? "missing"}; ${JSON.stringify(attachmentDiagnostic)}`)
  }
  const forgedOpenProbe = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    const sessionId = bootstrap.ok ? bootstrap.value.sessions[0]?.id : undefined
    if (!sessionId) throw new Error("Attachment open probe session is missing")
    const forgedMessage = await window.creatx.openMessageAttachment(sessionId, "message-forged", 0)
    const forgedIndex = await window.creatx.openMessageAttachment(sessionId, "message-0", 99)
    return [forgedMessage, forgedIndex].map((result) => result.ok ? "unexpected-success" : result.error.code)
  })
  if (forgedOpenProbe.some((code) => code !== "attachment_invalid")) {
    throw new Error(`Forged history attachment was not rejected: ${JSON.stringify(forgedOpenProbe)}`)
  }
  const forgedProbe = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    const sessionId = bootstrap.ok ? bootstrap.value.sessions[0]?.id : undefined
    if (!sessionId) throw new Error("Attachment probe session is missing")
    const runStates: string[] = []
    const unsubscribe = window.creatx.onEvent((event) => {
      if (event.type === "run.state" && event.sessionId === sessionId) runStates.push(event.state)
    })
    const result = await window.creatx.sendMessage({ requestId: "desktop-forged-attachment", sessionId, prompt: "不应发送", attachmentIds: ["forged-token"] })
    unsubscribe()
    return { code: result.ok ? "unexpected-success" : result.error.code, runStates }
  })
  if (forgedProbe.code !== "attachment_invalid" || forgedProbe.runStates.length !== 0) {
    throw new Error(`Forged attachment crossed the admission gate: ${JSON.stringify(forgedProbe)}`)
  }
  await electronApp.evaluate(({ dialog }, filePaths) => {
    Object.defineProperty(dialog, "showOpenDialog", { configurable: true, value: async () => ({ canceled: false, filePaths }) })
  }, [externalSecond])
  const changedReference = await page.evaluate(async () => {
    const result = await window.creatx.chooseAttachments()
    if (!result.ok || !result.value[0]) throw new Error("Changed-file probe could not select its attachment")
    return result.value[0]
  })
  await writeFile(externalSecond, "文件在选择后发生了变化。", "utf8")
  const changedProbe = await page.evaluate(async ({ attachmentId }) => {
    const bootstrap = await window.creatx.bootstrap()
    const sessionId = bootstrap.ok ? bootstrap.value.sessions[0]?.id : undefined
    if (!sessionId) throw new Error("Changed-file probe session is missing")
    const runStates: string[] = []
    const unsubscribe = window.creatx.onEvent((event) => {
      if (event.type === "run.state" && event.sessionId === sessionId) runStates.push(event.state)
    })
    const result = await window.creatx.sendMessage({ requestId: "desktop-changed-attachment", sessionId, prompt: "不应发送变化后的文件", attachmentIds: [attachmentId] })
    unsubscribe()
    return { code: result.ok ? "unexpected-success" : result.error.code, runStates }
  }, { attachmentId: changedReference.id })
  if (changedProbe.code !== "attachment_invalid" || changedProbe.runStates.length !== 0) {
    throw new Error(`Changed attachment crossed the admission gate: ${JSON.stringify(changedProbe)}`)
  }
  console.log("desktop: external attachment selection, history restore, verified open, and admission gates verified")
  const imageQueueDatabase = new DatabaseSync(join(userData, "creatx", "image-queue.sqlite"), { readOnly: true })
  const imageQueueVersion = (imageQueueDatabase.prepare("PRAGMA user_version").get() as { user_version: number }).user_version
  imageQueueDatabase.close()
  if (imageQueueVersion !== imageQueueSchemaVersion) throw new Error(`Desktop image queue schema mismatch: ${imageQueueVersion}`)
  console.log(`desktop: image queue V${imageQueueSchemaVersion} initialized`)
  const initialGrowthVisible = await page.locator("[data-growth-status]").count()
  if (initialGrowthVisible !== 0) throw new Error("Desktop rendered Growth before a Goal existed")
  const permissionProbe = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Desktop permission probe has no project")
    const created = await window.creatx.createSession(bootstrap.value.project.id)
    if (!created.ok) throw new Error(`${created.error.message} ${created.error.detail ?? "missing detail"}`)
    const changed = await window.creatx.setSessionPermissionMode(created.value.id, "approval")
    if (!changed.ok) throw new Error(`${changed.error.message} ${changed.error.detail ?? "missing detail"}`)
    const unknownSlash = await window.creatx.sendMessage({ requestId: "desktop-unknown-slash", sessionId: created.value.id, prompt: "/growth-world-prototype 创建世界", attachmentIds: [] })
    const aliasRejected = await window.creatx.sendMessage({ requestId: "desktop-alias-rejected", sessionId: created.value.id, prompt: "/growth-world-pro 创建一个大型世界", attachmentIds: [] })
    const rejected = await window.creatx.sendMessage({ requestId: "desktop-growth-rejected", sessionId: created.value.id, prompt: "/growth 创建一个长期世界", attachmentIds: [] })
    const afterRejected = await window.creatx.readGrowthGoal(bootstrap.value.project.id)
    if (!afterRejected.ok) throw new Error(afterRejected.error.message)
    const free = await window.creatx.setSessionPermissionMode(created.value.id, "free")
    if (!free.ok) throw new Error(`${free.error.message} ${free.error.detail ?? "missing detail"}`)
    const statuses: string[] = []
    const unsubscribe = window.creatx.onEvent((event) => {
      if (event.type === "growth.goal.changed") statuses.push(event.goal.status)
    })
    const started = await window.creatx.sendMessage({ requestId: "desktop-growth-started", sessionId: created.value.id, prompt: "/growth-world-pro 创建一个大型世界", attachmentIds: [] })
    if (!started.ok) throw new Error(`${started.error.message} ${started.error.detail ?? "missing detail"}`)
    let goal = await window.creatx.readGrowthGoal(bootstrap.value.project.id)
    for (let attempt = 0; attempt < 100 && goal.ok && goal.value?.status === "active"; attempt += 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
      goal = await window.creatx.readGrowthGoal(bootstrap.value.project.id)
    }
    if (!goal.ok || !goal.value) throw new Error("Desktop Growth did not leave a durable Goal")
    const beforeRetry = { goalId: goal.value.goalId, version: goal.value.version, status: goal.value.status }
    const exactRetry = await window.creatx.sendMessage({ requestId: "desktop-growth-started", sessionId: created.value.id, prompt: "/growth-world-pro 创建一个大型世界", attachmentIds: [] })
    const conflictingRetry = await window.creatx.sendMessage({ requestId: "desktop-growth-started", sessionId: created.value.id, prompt: "/growth-world-pro 创建另一个世界", attachmentIds: [] })
    const afterRetry = await window.creatx.readGrowthGoal(bootstrap.value.project.id)
    const deleteWaitingSession = await window.creatx.deleteSession(created.value.id)
    const deleteWaitingProject = await window.creatx.deleteProjectSessions(bootstrap.value.project.id)
    unsubscribe()
    if (!afterRetry.ok || !afterRetry.value) throw new Error("Desktop Growth exact retry lost its Goal")
    return {
      sessionId: created.value.id,
      defaultMode: created.value.permission.mode,
      changedMode: changed.value.permission.mode,
      projectTools: changed.value.permission.projectTools,
      trustWarning: changed.value.permission.trustWarning,
      steerAvailable: typeof window.creatx.steerMessage === "function",
      unknownSlashRejected: !unknownSlash.ok && unknownSlash.error.code === "command_invalid",
      aliasHandledByOwner: aliasRejected.ok,
      approvalHandledByOwner: rejected.ok,
      goalAfterRejected: afterRejected.value,
      goalStatus: goal.value?.status,
      goalReason: goal.value?.statusReason,
      exactRetryStable: exactRetry.ok
        && !conflictingRetry.ok
        && conflictingRetry.error.code === "growth_conflict"
        && beforeRetry.goalId === afterRetry.value.goalId
        && beforeRetry.version === afterRetry.value.version
        && beforeRetry.status === afterRetry.value.status,
      waitingHistoryProtected: !deleteWaitingSession.ok
        && deleteWaitingSession.error.code === "session_conflict"
        && !deleteWaitingProject.ok
        && deleteWaitingProject.error.code === "session_conflict",
      exactRetryDiagnostic: {
        exactRetry,
        conflictingRetry,
        beforeRetry,
        afterRetry: { goalId: afterRetry.value.goalId, version: afterRetry.value.version, status: afterRetry.value.status },
      },
      statuses,
    }
  })
  if (permissionProbe.defaultMode !== "free" || permissionProbe.changedMode !== "approval" || !permissionProbe.projectTools || !permissionProbe.trustWarning.includes("项目目录以外") || !permissionProbe.steerAvailable || !permissionProbe.unknownSlashRejected || !permissionProbe.aliasHandledByOwner || !permissionProbe.approvalHandledByOwner || permissionProbe.goalAfterRejected !== undefined || permissionProbe.goalStatus !== "waiting" || !permissionProbe.goalReason || !permissionProbe.exactRetryStable || !permissionProbe.waitingHistoryProtected || !permissionProbe.statuses.includes("active")) {
    throw new Error(`Desktop permission projection mismatch: ${JSON.stringify(permissionProbe)}`)
  }
  console.log("desktop: Growth permission gate, active event, and waiting projection verified")
  await page.evaluate(({ sessionId }) => {
    window.localStorage.setItem("creatx.pending-owner-command.v1", JSON.stringify({
      kind: "growth-message",
      command: { requestId: "desktop-growth-started", sessionId, prompt: "/growth-world-pro 创建一个大型世界", attachmentIds: [] },
    }))
  }, { sessionId: permissionProbe.sessionId })
  await page.reload()
  await page.waitForSelector('[data-growth-status="waiting"]')
  await page.waitForFunction(() => window.localStorage.getItem("creatx.pending-owner-command.v1") === null)
  const recoveredIdentity = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.growth) throw new Error("Growth disappeared after Renderer request recovery")
    return { goalId: bootstrap.value.growth.goalId, version: bootstrap.value.growth.version, status: bootstrap.value.growth.status }
  })
  if (recoveredIdentity.goalId !== permissionProbe.exactRetryDiagnostic.afterRetry.goalId
    || recoveredIdentity.version !== permissionProbe.exactRetryDiagnostic.afterRetry.version
    || recoveredIdentity.status !== permissionProbe.exactRetryDiagnostic.afterRetry.status) {
    throw new Error(`Renderer request recovery duplicated Growth: ${JSON.stringify(recoveredIdentity)}`)
  }
  console.log("desktop: Renderer recovered the exact pending Owner request identity without duplicating Growth")
  if (JSON.stringify(await readPanelWidths()) !== JSON.stringify(expectedPersistentPanelWidths)) throw new Error("Desktop panel widths did not persist across reload")
  console.log("desktop: resized panel widths persisted across reload")
  const collapseGrowthBox = await page.getByTitle("收起 Growth 进度").boundingBox()
  if (!collapseGrowthBox) throw new Error("Desktop Growth collapse control is not visible")
  await page.mouse.dblclick(collapseGrowthBox.x + collapseGrowthBox.width / 2, collapseGrowthBox.y + collapseGrowthBox.height / 2, { delay: 100 })
  await page.getByTitle("收起 Growth 进度").waitFor()
  const goalAfterGrowthToggle = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok) throw new Error(bootstrap.error.message)
    return bootstrap.value.growth?.status
  })
  if (goalAfterGrowthToggle !== "waiting") throw new Error(`Desktop Growth toggle double-click changed Goal state: ${goalAfterGrowthToggle ?? "missing"}`)
  console.log("desktop: Growth expand/collapse keeps a stable non-destructive click target")
  await page.getByTitle("选择会话权限").click()
  await page.getByRole("menuitemradio", { name: "审批", exact: true }).click()
  await page.getByTitle("选择会话权限").getByText("审批", { exact: true }).waitFor()
  const blockedResume = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.growth) throw new Error("Growth disappeared before resume gate probe")
    const session = bootstrap.value.sessions.find((candidate) => candidate.id === bootstrap.value.growth?.sessionId)
    const result = await window.creatx.resumeGrowth({ requestId: "desktop-growth-resume", goalId: bootstrap.value.growth.goalId })
    return { outcome: result.ok ? "unexpected-success" : result.error.code, mode: session?.permission.mode }
  })
  if (blockedResume.outcome !== "growth_conflict" || !await page.getByTitle("切换为自由后继续").isDisabled()) {
    throw new Error(`Desktop Growth resume gate mismatch: ${JSON.stringify(blockedResume)}`)
  }
  await page.getByTitle("选择会话权限").click()
  await page.getByRole("menuitemradio", { name: "自由", exact: true }).click()
  await page.getByTitle("选择会话权限").getByText("自由", { exact: true }).waitFor()
  const returnToLatest = page.getByRole("button", { name: "回到最新", exact: true })
  if (await returnToLatest.count()) {
    const returnBox = await returnToLatest.boundingBox()
    const resumeBox = await page.getByTitle("继续 Growth").boundingBox()
    if (returnBox && resumeBox && returnBox.x < resumeBox.x + resumeBox.width && returnBox.x + returnBox.width > resumeBox.x && returnBox.y < resumeBox.y + resumeBox.height && returnBox.y + returnBox.height > resumeBox.y) {
      throw new Error(`Desktop return-to-latest control overlaps Growth resume: ${JSON.stringify({ returnBox, resumeBox })}`)
    }
  }
  await page.getByTitle("继续 Growth").click()
  await page.waitForSelector('[data-growth-status="waiting"]')
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-growth-waiting.png"))
  await page.getByTitle("结束 Growth").click()
  await page.waitForSelector('[data-growth-status="cancelled"]')
  await page.waitForSelector("[data-growth-status]", { state: "detached", timeout: 4_000 })
  console.log("desktop: Growth continue, waiting reason, cancel controls, and three-second terminal dismissal verified")
  await assertNoOverflow(page, "default")
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-worldbuilder-conversation.png"))
  const conversationNode = await page.locator(".conversation-stage").elementHandle()
  if (!conversationNode) throw new Error("Desktop conversation surface is missing")
  const composer = page.getByLabel("发送消息")
  await composer.fill("这是一份切换工作台时必须保留的草稿。")
  const chatStateBeforeWorkbench = await page.evaluate(() => ({
    runState: document.querySelector<HTMLElement>(".worldbuilder-app")?.dataset.runState,
    scrollTop: document.querySelector<HTMLElement>(".wb-context-scroll")?.scrollTop,
  }))
  await page.locator(".wb-workbench-launcher > button", { hasText: "文件" }).click()
  await page.locator(".wb-workbench-file-expansion .wb-workbench-file-item", { hasText: "创作笔记.md" }).click()
  await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').waitFor()
  await page.locator(".wb-document-page", { hasText: "这是来自真实项目目录的内容。" }).waitFor()
  await page.waitForFunction(() => {
    const navigation = document.querySelector<HTMLElement>(".wb-project-navigation")?.getBoundingClientRect()
    const rail = document.querySelector<HTMLElement>(".workbench-rail")?.getBoundingClientRect()
    const canvas = document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect()
    return Boolean(navigation && rail && canvas && rail.width <= 1 && Math.abs(canvas.left - navigation.right - 1) <= 2 && canvas.width >= 300)
  })
  const navigationFolder = page.locator(".wb-workbench-file-expansion .wb-workbench-file-folder", { hasText: "地图源" })
  const nestedFile = page.locator(".wb-workbench-file-expansion .wb-workbench-file-item", { hasText: "生成掩码.mjs" })
  await navigationFolder.waitFor()
  await nestedFile.waitFor()
  await navigationFolder.click()
  await nestedFile.waitFor({ state: "detached" })
  if (await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').count() !== 1 || !await page.locator(".wb-document-page", { hasText: "这是来自真实项目目录的内容。" }).count()) throw new Error("Desktop directory collapse changed the active Workbench file")
  await navigationFolder.press("ArrowRight")
  await nestedFile.waitFor()
  const workbenchModeProbe = await page.evaluate(() => ({
    navigation: document.querySelector<HTMLElement>(".wb-project-navigation")?.getBoundingClientRect().toJSON(),
    canvas: document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect().toJSON(),
    conversation: document.querySelector<HTMLElement>(".conversation-stage")?.getBoundingClientRect().toJSON(),
    canvasWidth: document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect().width,
    resourceRailVisible: (document.querySelector<HTMLElement>(".workbench-rail")?.getBoundingClientRect().width ?? 0) > 1,
    inspectorCount: document.querySelectorAll(".wb-inspector").length,
    canvasSeparatorTabIndex: document.querySelector<HTMLElement>('[data-separator="workbench-canvas"]')?.tabIndex,
    runState: document.querySelector<HTMLElement>(".worldbuilder-app")?.dataset.runState,
    scrollTop: document.querySelector<HTMLElement>(".wb-context-scroll")?.scrollTop,
  }))
  if (!workbenchModeProbe.canvasWidth || workbenchModeProbe.canvasWidth < 300 || !workbenchModeProbe.navigation || !workbenchModeProbe.canvas || !workbenchModeProbe.conversation || workbenchModeProbe.navigation.right > workbenchModeProbe.canvas.left + 2 || workbenchModeProbe.canvas.right > workbenchModeProbe.conversation.left + 2 || workbenchModeProbe.conversation.width < 210 || workbenchModeProbe.resourceRailVisible || workbenchModeProbe.inspectorCount !== 0 || workbenchModeProbe.canvasSeparatorTabIndex !== 0 || workbenchModeProbe.runState !== chatStateBeforeWorkbench.runState || workbenchModeProbe.scrollTop !== chatStateBeforeWorkbench.scrollTop || await composer.inputValue() !== "这是一份切换工作台时必须保留的草稿。") {
    throw new Error(`Desktop Workbench mode did not preserve Chat state or expose its full surfaces: ${JSON.stringify({ chatStateBeforeWorkbench, workbenchModeProbe, draft: await composer.inputValue() })}`)
  }
  const workbenchNavigationHandle = page.locator('[data-separator="workbench-canvas"]')
  const workbenchNavigationBefore = await page.locator(".workbench-rail").evaluate((element) => element.getBoundingClientRect().width)
  await workbenchNavigationHandle.focus()
  await workbenchNavigationHandle.press("ArrowRight")
  const workbenchNavigationAfterKey = await page.locator(".workbench-rail").evaluate((element) => element.getBoundingClientRect().width)
  if (workbenchNavigationAfterKey >= workbenchNavigationBefore) throw new Error(`Desktop workbench navigation separator ignored keyboard resize: ${JSON.stringify({ workbenchNavigationBefore, workbenchNavigationAfterKey })}`)
  const workbenchNavigationBox = await workbenchNavigationHandle.boundingBox()
  if (!workbenchNavigationBox) throw new Error("Desktop workbench navigation separator is not visible")
  await page.mouse.move(workbenchNavigationBox.x + workbenchNavigationBox.width / 2, workbenchNavigationBox.y + workbenchNavigationBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(workbenchNavigationBox.x + workbenchNavigationBox.width / 2 - 36, workbenchNavigationBox.y + workbenchNavigationBox.height / 2)
  await page.mouse.up()
  const workbenchNavigationAfterPointer = await page.locator(".workbench-rail").evaluate((element) => element.getBoundingClientRect().width)
  const workbenchCanvasAfterNavigationResize = await page.locator(".workbench-stage").evaluate((element) => element.getBoundingClientRect().width)
  if (workbenchNavigationAfterPointer <= workbenchNavigationAfterKey || workbenchCanvasAfterNavigationResize < 300) throw new Error(`Desktop workbench navigation pointer resize violated its geometry: ${JSON.stringify({ workbenchNavigationAfterKey, workbenchNavigationAfterPointer, workbenchCanvasAfterNavigationResize })}`)
  await page.getByTitle("查看当前详情").click()
  await page.locator('.wb-floating-inspector[aria-label="当前详情"]').waitFor()
  if (await page.locator(".wb-inspector").count() !== 1) throw new Error("Desktop details drawer did not open on demand")
  await page.locator('.wb-floating-inspector').getByTitle("关闭详情").click()
  await page.locator(".wb-inspector").waitFor({ state: "detached" })
  const canvasGuardHandle = page.locator('[data-separator="conversation-workbench"]')
  const canvasGuardBox = await canvasGuardHandle.boundingBox()
  if (!canvasGuardBox) throw new Error("Desktop canvas and AI separator is not visible in Workbench mode")
  await page.mouse.move(canvasGuardBox.x + canvasGuardBox.width / 2, canvasGuardBox.y + canvasGuardBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvasGuardBox.x + canvasGuardBox.width / 2 + 1_000, canvasGuardBox.y + canvasGuardBox.height / 2)
  await page.mouse.up()
  const guardedCanvasWidth = await page.locator(".wb-map-stage").evaluate((canvas) => canvas.getBoundingClientRect().width)
  if (guardedCanvasWidth < 300) throw new Error(`Desktop separator compressed the creation canvas below its minimum: ${guardedCanvasWidth}`)
  await page.getByTitle("编辑文件").click()
  const editor = page.locator(".wb-document-editor")
  await editor.waitFor()
  if (!await editor.inputValue().then((content) => content.includes("这是来自真实项目目录的内容。"))) throw new Error("Desktop text editor did not open the real file content")
  if (!await page.getByTitle("撤销（Ctrl+Z）").isDisabled() || !await page.getByTitle("重做（Ctrl+Y）").isDisabled()) throw new Error("Desktop editor history controls should start disabled")
  await editor.fill("这是第一份未保存草稿。")
  await editor.fill("这是第二份未保存草稿。")
  await page.getByTitle("撤销（Ctrl+Z）").click()
  if (await editor.inputValue() !== "这是第一份未保存草稿。") throw new Error("Desktop editor undo button did not restore the previous draft")
  await page.getByTitle("重做（Ctrl+Y）").click()
  if (await editor.inputValue() !== "这是第二份未保存草稿。") throw new Error("Desktop editor redo button did not restore the newer draft")
  await editor.press("Control+z")
  if (await editor.inputValue() !== "这是第一份未保存草稿。") throw new Error("Desktop editor Ctrl+Z did not share the visible undo history")
  await editor.press("Control+y")
  if (await editor.inputValue() !== "这是第二份未保存草稿。") throw new Error("Desktop editor Ctrl+Y did not share the visible redo history")
  await editor.fill("这是通过编辑按钮再次点击保存的内容。")
  await page.getByTitle("保存并返回预览").click()
  await page.locator(".wb-document-page", { hasText: "这是通过编辑按钮再次点击保存的内容。" }).waitFor()
  await page.getByTitle("编辑文件").click()
  await editor.fill("这是通过编辑器失焦保存的内容。")
  await page.locator(".wb-map-title strong").click()
  await page.locator(".wb-document-page", { hasText: "这是通过编辑器失焦保存的内容。" }).waitFor()
  await page.getByTitle("编辑文件").click()
  await editor.fill("这是用户在工作台编辑并保存的最终内容。")
  await editor.press("Control+s")
  await page.locator(".wb-document-page", { hasText: "这是用户在工作台编辑并保存的最终内容。" }).waitFor()
  const savedText = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Project disappeared during editor save probe")
    const file = bootstrap.value.project.files.find((candidate) => candidate.name === "创作笔记.md")
    if (!file) throw new Error("Edited file disappeared")
    const preview = await window.creatx.readFile(bootstrap.value.project.id, file.id)
    if (!preview.ok) throw new Error(preview.error.message)
    return preview.value.content
  })
  if (savedText !== "这是用户在工作台编辑并保存的最终内容。") throw new Error(`Desktop editor save mismatch: ${savedText}`)
  await page.getByRole("button", { name: "展览", exact: true }).click()
  await page.locator(".wb-exhibition", { hasText: "作品展览" }).waitFor()
  const stageModeChrome = await page.locator(".wb-stage-mode").evaluate((element) => ({
    border: getComputedStyle(element).borderTopWidth,
    buttonBorder: getComputedStyle(element.querySelector("button")!).borderTopWidth,
  }))
  if (stageModeChrome.border !== "0px" || stageModeChrome.buttonBorder !== "0px") throw new Error(`Desktop stage mode retained framed controls: ${JSON.stringify(stageModeChrome)}`)
  const collapseGeometry = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".wb-map-toolbar")?.getBoundingClientRect()
    const button = document.querySelector<HTMLElement>('.wb-collapse-workbench[title="收起工作台"]')?.getBoundingClientRect()
    return toolbar && button ? { visible: button.left >= toolbar.left && button.right <= toolbar.right, rightInset: toolbar.right - button.right } : undefined
  })
  if (!collapseGeometry?.visible || collapseGeometry.rightInset < 8 || collapseGeometry.rightInset > 12) throw new Error(`Desktop workbench collapse control is not anchored to the visible right edge: ${JSON.stringify(collapseGeometry)}`)
  if (!await page.locator(".worldbuilder-app").evaluate((element) => getComputedStyle(element).transitionDuration.split(",").some((duration) => Number.parseFloat(duration) > 0))) throw new Error("Desktop workbench canvas has no collapse transition")
  const conversationBeforeCollapse = await page.locator(".conversation-stage").evaluate((element) => element.getBoundingClientRect().width)
  await page.getByTitle("收起工作台").click()
  await page.locator(".worldbuilder-app.workbench-canvas-collapsed").waitFor()
  await page.waitForTimeout(90)
  const conversationDuringCollapse = await page.locator(".conversation-stage").evaluate((element) => element.getBoundingClientRect().width)
  await page.locator(".workbench-rail").waitFor({ state: "hidden" })
  if (await page.locator(".workbench-stage").getAttribute("aria-hidden") !== "true") throw new Error("Desktop workbench canvas remained accessible after collapse")
  await page.waitForFunction(() => (document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect().width ?? 2) <= 1)
  const conversationAfterCollapse = await page.locator(".conversation-stage").evaluate((element) => element.getBoundingClientRect().width)
  if (!(conversationDuringCollapse > conversationBeforeCollapse && conversationDuringCollapse < conversationAfterCollapse)) {
    throw new Error(`Desktop workbench collapse jumped instead of interpolating: ${JSON.stringify({ conversationBeforeCollapse, conversationDuringCollapse, conversationAfterCollapse })}`)
  }
  const thinSeparatorProbe = await page.locator('[role="separator"]').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }).map((element) => ({ orientation: element.getAttribute("aria-orientation"), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, background: getComputedStyle(element).backgroundColor })))
  if (!thinSeparatorProbe.length || thinSeparatorProbe.some((separator) => (separator.orientation === "horizontal" ? separator.height : separator.width) !== 1 || separator.background === "rgba(0, 0, 0, 0)")) {
    throw new Error(`Desktop separators are not uniform visible 1px lines: ${JSON.stringify(thinSeparatorProbe)}`)
  }
  const navigationWidthBeforeOpen = await page.locator(".wb-project-navigation").evaluate((element) => element.getBoundingClientRect().width)
  await page.locator(".wb-workbench-file-expansion .wb-workbench-file-item", { hasText: "创作笔记.md" }).click()
  await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').waitFor()
  await page.locator(".wb-document-page", { hasText: "这是用户在工作台编辑并保存的最终内容。" }).waitFor()
  await page.waitForFunction(() => (document.querySelector<HTMLElement>(".workbench-rail")?.getBoundingClientRect().width ?? 2) <= 1)
  const fileOpenProbe = await page.evaluate(() => ({
    navigationWidth: document.querySelector<HTMLElement>(".wb-project-navigation")?.getBoundingClientRect().width,
    resourceRailVisible: (document.querySelector<HTMLElement>(".workbench-rail")?.getBoundingClientRect().width ?? 0) > 1,
    fileExpansionVisible: (document.querySelector<HTMLElement>(".wb-workbench-file-expansion")?.getBoundingClientRect().height ?? 0) > 0,
    editButtons: [...document.querySelectorAll<HTMLElement>('[title="编辑文件"]')].filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.pointerEvents !== "none"
    }).length,
    inlinePreviewCount: document.querySelectorAll(".wb-chat-workbench-preview").length,
  }))
  if (!fileOpenProbe.navigationWidth || Math.abs(fileOpenProbe.navigationWidth - navigationWidthBeforeOpen) > 1 || fileOpenProbe.resourceRailVisible || !fileOpenProbe.fileExpansionVisible || fileOpenProbe.editButtons !== 1 || fileOpenProbe.inlinePreviewCount !== 0) {
    throw new Error(`Desktop file open did not enter the full Workbench mode: ${JSON.stringify({ navigationWidthBeforeOpen, fileOpenProbe })}`)
  }
  await page.getByTitle("收起工作台").click()
  await page.locator('.worldbuilder-app[data-layout-mode="chat"]').waitFor()
  await page.locator(".wb-workbench-launcher > button", { hasText: "文件" }).click()
  await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').waitFor()
  if (await page.locator(".workbench-stage").getAttribute("aria-hidden") !== "false") throw new Error("Desktop workbench canvas remained hidden after reopen")
  const activeWorkbenchButton = page.locator(".wb-workbench-launcher > button", { hasText: "文件" })
  await activeWorkbenchButton.click()
  if (await activeWorkbenchButton.getAttribute("aria-expanded") !== "false" || await page.locator(".wb-workbench-file-expansion").count()) throw new Error("Desktop active workbench second click did not collapse only its resources")
  if (await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').count() !== 1 || !await page.locator(".wb-document-page", { hasText: "这是用户在工作台编辑并保存的最终内容。" }).count()) throw new Error("Desktop workbench resource collapse changed the central file")
  await activeWorkbenchButton.click()
  await page.locator(".wb-workbench-file-expansion").waitFor()
  await page.locator(".wb-project-main").first().click()
  if (await page.locator(".wb-workbench-file-expansion").count()) throw new Error("Desktop project second click did not collapse its workbench files")
  if (await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').count() !== 1 || !await page.locator(".wb-document-page", { hasText: "这是用户在工作台编辑并保存的最终内容。" }).count()) throw new Error("Desktop project collapse changed the central Workbench")
  await page.locator(".wb-project-main").first().click()
  await page.locator(".wb-workbench-file-expansion").waitFor()
  await page.locator(".wb-document-page", { hasText: "这是用户在工作台编辑并保存的最终内容。" }).waitFor()
  if (!await conversationNode.evaluate((element) => element.isConnected && element === document.querySelector(".conversation-stage"))) {
    throw new Error("Desktop replaced the persistent conversation component while selecting a workbench file")
  }
  if (await composer.inputValue() !== "这是一份切换工作台时必须保留的草稿。") throw new Error("Desktop lost the Composer draft while switching workspace modes")
  console.log("desktop: Chat/Workbench switching, direct edit/save, fixed exhibition, and persistent conversation verified")
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-worldbuilder-workbench.png"))
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-1355x898.png"))

  await page.setViewportSize({ width: 1360, height: 860 })
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-1360x860.png"))
  await assertNoOverflow(page, "workbench-1360x860")
  await assertWorkbenchFilesReachable(page, "workbench-1360x860")
  await page.setViewportSize({ width: 900, height: 700 })
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-900x700.png"))
  await assertNoOverflow(page, "workbench-900x700")
  await assertWorkbenchFilesReachable(page, "workbench-900x700")
  await page.setViewportSize({ width: 860, height: 620 })
  await captureAuxiliaryScreenshot(page, join(evidenceDir, "desktop-860x620.png"))
  await assertNoOverflow(page, "workbench-860x620")
  await assertWorkbenchFilesReachable(page, "workbench-860x620")
  await page.locator(".wb-skill-basket-trigger").click()
  await page.locator(".wb-skill-basket-empty").click()
  await page.getByRole("button", { name: "添加 Skill", exact: true }).click()
  await page.locator(".wb-skill-basket-panel select").nth(1).selectOption("creatx-build-character-gallery")
  await page.locator(".wb-skill-slot-toggle").first().click()
  const originalSequence = await page.locator(".wb-skill-basket-panel li").evaluateAll((elements) => elements.map((element) => ({
    skillName: element.querySelector("select")?.value,
    enabled: element.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true",
  })))
  if (JSON.stringify(originalSequence) !== JSON.stringify([{ skillName: "creatx-draw-map", enabled: false }, { skillName: "creatx-build-character-gallery", enabled: true }])) throw new Error(`Desktop did not preserve the selected Skill slots: ${JSON.stringify(originalSequence)}`)
  await page.waitForFunction(() => {
    const stored = JSON.parse(window.localStorage.getItem("creatx.composer.skill-sequences.v2") ?? "{}") as { sessions?: Record<string, Array<{ skillName: string; enabled: boolean }>> }
    return Object.values(stored.sessions ?? {}).some((slots) => JSON.stringify(slots) === JSON.stringify([{ skillName: "creatx-draw-map", enabled: false }, { skillName: "creatx-build-character-gallery", enabled: true }]))
  })
  const originalSequenceSessionId = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("creatx.composer.skill-sequences.v2") ?? "{}") as { sessions?: Record<string, Array<{ skillName: string; enabled: boolean }>> }
    const ids = Object.keys(stored.sessions ?? {})
    if (ids.length !== 1) throw new Error(`Expected one stored Skill sequence, received ${ids.length}`)
    return ids[0]!
  })
  const sessionBeforeCreate = await page.locator(".wb-conversation-session-strip [data-session-id].is-active").getAttribute("data-session-id")
  await page.locator('.conversation-stage > .wb-panel-heading button[title="新会话"]').click()
  await page.waitForFunction((previousSessionId) => {
    const active = document.querySelector<HTMLElement>(".wb-conversation-session-strip [data-session-id].is-active")?.dataset.sessionId
    return Boolean(active && active !== previousSessionId)
  }, sessionBeforeCreate)
  await page.locator('.worldbuilder-app[data-layout-mode="workbench"]').waitFor()
  await page.waitForFunction(() => (document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect().width ?? 0) >= 300)
  const changedSessionLayout = await page.evaluate(() => ({
    canvasWidth: document.querySelector<HTMLElement>(".workbench-stage")?.getBoundingClientRect().width,
    inspectorCount: document.querySelectorAll(".wb-inspector").length,
    selectedFile: document.querySelector<HTMLElement>(".wb-workbench-file-expansion .wb-workbench-file-item.is-active")?.textContent?.trim(),
  }))
  if ((changedSessionLayout.canvasWidth ?? 0) < 300 || changedSessionLayout.inspectorCount !== 0 || !changedSessionLayout.selectedFile?.includes("创作笔记.md")) throw new Error(`Desktop session change did not preserve the Workbench file and canvas: ${JSON.stringify(changedSessionLayout)}`)
  if (await composer.inputValue() !== "这是一份切换工作台时必须保留的草稿。") throw new Error("Desktop lost the Composer draft when the active session changed")
  await page.locator(".wb-skill-basket-trigger").click()
  if (await page.locator(".wb-skill-basket-panel select").count() !== 0) throw new Error("Desktop leaked one session's Skill basket into a new session")
  await page.locator(".wb-skill-basket-empty").click()
  await page.waitForFunction((excludedSessionId) => {
    const stored = JSON.parse(window.localStorage.getItem("creatx.composer.skill-sequences.v2") ?? "{}") as { sessions?: Record<string, Array<{ skillName: string; enabled: boolean }>> }
    return Object.entries(stored.sessions ?? {}).some(([sessionId, slots]) => sessionId !== excludedSessionId && slots.length === 1 && slots[0]?.skillName === "creatx-draw-map" && slots[0].enabled)
  }, originalSequenceSessionId)
  const restorableSessionId = await page.evaluate((excludedSessionId) => {
    const stored = JSON.parse(window.localStorage.getItem("creatx.composer.skill-sequences.v2") ?? "{}") as { sessions?: Record<string, Array<{ skillName: string; enabled: boolean }>> }
    const match = Object.entries(stored.sessions ?? {}).find(([sessionId, slots]) => sessionId !== excludedSessionId && slots.length === 1 && slots[0]?.skillName === "creatx-draw-map" && slots[0].enabled)
    if (!match) throw new Error("New session Skill sequence was not persisted")
    return match[0]
  }, originalSequenceSessionId)
  const sessionCountBeforeThird = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok) throw new Error(bootstrap.error.message)
    return bootstrap.value.sessions.length
  })
  await page.locator('.conversation-stage > .wb-panel-heading button[title="新会话"]').click()
  await page.waitForFunction(async (previousCount) => {
    const bootstrap = await window.creatx.bootstrap()
    return bootstrap.ok && bootstrap.value.sessions.length > previousCount && document.querySelectorAll(".wb-skill-basket-panel select").length === 0
  }, sessionCountBeforeThird)
  await page.waitForTimeout(100)
  await page.locator(".wb-skill-basket-trigger").click()
  if (await page.locator(".wb-skill-basket-panel select").count() !== 0) throw new Error("Desktop leaked the second session's Skill basket into a third session")
  if (await page.getByTitle("展开项目导航").count()) await page.getByTitle("展开项目导航").click()
  await page.locator(`[data-session-id="${restorableSessionId}"]`).click()
  await page.waitForFunction((sessionId) => document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.contains("is-active"), restorableSessionId)
  await page.locator(".wb-skill-basket-trigger").click()
  const restoredSequence = await page.locator(".wb-skill-basket-panel select").evaluateAll((elements) => elements.map((element) => (element as HTMLSelectElement).value))
  if (restoredSequence.join(",") !== "creatx-draw-map") throw new Error(`Desktop did not restore the selected session's Skill sequence: ${JSON.stringify(restoredSequence)}`)
  for (let index = 0; index < 3; index += 1) await page.getByRole("button", { name: "添加 Skill", exact: true }).click()
  await page.locator(".wb-skill-basket-panel select").nth(1).selectOption("creatx-build-character-gallery")
  await page.locator(".wb-skill-basket-panel select").nth(2).selectOption("creatx-novel-start")
  await page.locator(".wb-skill-basket-panel select").nth(3).selectOption("creatx-draw-comic")
  const armSkillBasket = page.getByRole("checkbox", { name: "启用下一次发送的 Skill 挂篮" })
  if (await armSkillBasket.getAttribute("aria-checked") !== "false") throw new Error("Desktop Skill basket was armed without an explicit user action")
  await armSkillBasket.click()
  const oneShotPrompt = "桌面挂篮一次性启用验证。"
  await page.getByLabel("发送消息").fill(oneShotPrompt)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="启用下一次发送的 Skill 挂篮"]')?.getAttribute("aria-checked") === "false")
  await page.waitForFunction(async ({ sessionId, prompt }) => {
    const timeline = await window.creatx.readTimeline(sessionId)
    if (!timeline.ok) return false
    const user = timeline.value.find((item) => item.kind === "message" && item.presentation === "user" && item.text === prompt)
    return Boolean(user && timeline.value.some((item) => item.kind === "message" && item.presentation === "assistant" && item.sequence > user.sequence))
  }, { sessionId: restorableSessionId, prompt: oneShotPrompt })
  await page.getByTitle("停止").waitFor({ state: "detached" })
  const basketResult = await page.evaluate(async ({ sessionId, prompt }) => {
    const timeline = await window.creatx.readTimeline(sessionId)
    if (!timeline.ok) return { ok: false as const, error: timeline.error }
    const user = timeline.value.find((item) => item.kind === "message" && item.presentation === "user" && item.text === prompt)
    return { ok: true as const, assistantCount: timeline.value.filter((item) => item.kind === "message" && item.presentation === "assistant" && item.sequence > (user?.sequence ?? Number.MAX_SAFE_INTEGER)).length }
  }, { sessionId: restorableSessionId, prompt: oneShotPrompt })
  if (!basketResult.ok || basketResult.assistantCount !== 4) throw new Error(`Desktop Skill basket did not execute map, character, novel, and comic as four ordered Runs: ${JSON.stringify(basketResult)}`)
  const skillSequenceProbe = await page.evaluate(async (sessionId) => {
    const prompt = "桌面序列闭环：先研究，再制作地图。"
    const sent = await window.creatx.sendMessage({
      requestId: "desktop-skill-sequence",
      sessionId,
      prompt,
      attachmentIds: [],
      skillSequence: ["creatx-study", "creatx-draw-map"],
    })
    if (!sent.ok) return { ok: false as const, error: sent.error }
    const timeline = await window.creatx.readTimeline(sessionId)
    if (!timeline.ok) return { ok: false as const, error: timeline.error }
    const user = timeline.value.filter((item) => item.kind === "message" && item.presentation === "user" && item.text === prompt)
    const firstSequence = user[0]?.sequence ?? Number.MAX_SAFE_INTEGER
    const assistant = timeline.value.filter((item) => item.kind === "message" && item.presentation === "assistant" && item.sequence > firstSequence)
    return { ok: true as const, userCount: user.length, assistantCount: assistant.length }
  }, restorableSessionId)
  if (!skillSequenceProbe.ok || skillSequenceProbe.userCount !== 1 || skillSequenceProbe.assistantCount !== 2) {
    throw new Error(`Desktop Skill sequence did not produce one user turn and two Assistant turns: ${JSON.stringify(skillSequenceProbe)}`)
  }
  console.log("desktop: session-isolated Skill preferences, one-shot basket arming, and one-message/two-Run sequencing verified")
  const layout = await page.evaluate(() => ({
    title: document.title,
    project: document.querySelector(".project-button")?.textContent?.trim(),
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
    apiAvailable: typeof window.creatx?.bootstrap === "function",
  }))
  if (layout.title !== "CreatX" || !layout.apiAvailable) throw new Error(`Desktop bootstrap mismatch: ${JSON.stringify(layout)}`)
  if (layout.bodyWidth > layout.viewportWidth || layout.bodyHeight > layout.viewportHeight) throw new Error(`Desktop overflow: ${JSON.stringify(layout)}`)
  if (pageErrors.length || consoleErrors.length || failedRequests.length) throw new Error(`Renderer errors: ${JSON.stringify({ pageErrors, consoleErrors, failedRequests })}`)
  shutdownGoalId = await page.evaluate(async (sessionId) => {
    let sendResult: Awaited<ReturnType<typeof window.creatx.sendMessage>> | undefined
    void window.creatx.sendMessage({ requestId: "desktop-growth-restart", sessionId, prompt: "/growth 验证应用重启后的暂停恢复", attachmentIds: [] }).then((result) => { sendResult = result })
    let lastGrowth: unknown
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const bootstrap = await window.creatx.bootstrap()
      if (bootstrap.ok) lastGrowth = bootstrap.value.growth
      if (bootstrap.ok && bootstrap.value.growth?.status === "active") return bootstrap.value.growth.goalId
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
    }
    throw new Error(`Shutdown recovery Goal did not become active: ${JSON.stringify({ sendResult, lastGrowth })}`)
  }, permissionProbe.sessionId)
  console.log(JSON.stringify({ status: "DESKTOP PASS", pid, layout, permissionProbe, screenshots: ["desktop-worldbuilder-conversation.png", "desktop-worldbuilder-workbench.png", "desktop-1355x898.png", "desktop-1360x860.png", "desktop-900x700.png", "desktop-860x620.png"] }))
} catch (error) {
  console.error(`DESKTOP FAIL: ${error instanceof Error ? error.message : String(error)}`)
  console.error(`DESKTOP DIAGNOSTICS: ${JSON.stringify({ pageErrors, consoleErrors, failedRequests })}`)
  process.exitCode = 1
} finally {
  const closed = await Promise.race([
    electronApp.close().then(() => true),
    new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 10_000)),
  ])
  if (!closed) {
    electronApp.process().kill()
    console.error("DESKTOP FAIL: Electron did not exit within 10 seconds")
    process.exitCode = 1
  }
  try {
    if (closed && shutdownGoalId && process.exitCode !== 1) {
      const database = new DatabaseSync(join(userData, "creatx", "growth.sqlite"), { readOnly: true })
      const persisted = database.prepare("SELECT status FROM growth_goal WHERE goal_id = ?").get(shutdownGoalId) as { status: string } | undefined
      database.close()
      if (persisted?.status !== "paused") throw new Error(`Growth shutdown state mismatch: ${persisted?.status ?? "missing"}`)

      const restarted = await electron.launch({
        executablePath: packagedExecutable ? resolve(packagedExecutable) : electronExecutable || resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
        args: [...(packagedExecutable ? [] : [workspace]), `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
        cwd: workspace,
        env: desktopEnvironment,
      })
      const restartedPid = restarted.process().pid
      try {
        const restartedPage = await restarted.firstWindow()
        await restartedPage.waitForSelector('[data-growth-status="paused"]', { timeout: 30_000 })
        const recovered = await restartedPage.evaluate(async () => {
          const bootstrap = await window.creatx.bootstrap()
          if (!bootstrap.ok) throw new Error(bootstrap.error.message)
          return { growth: bootstrap.value.growth, image: bootstrap.value.modelSettings.image }
        })
        if (recovered.growth?.goalId !== shutdownGoalId || recovered.growth.status !== "paused") {
          throw new Error(`Growth restart projection mismatch: ${JSON.stringify(recovered)}`)
        }
        if (recovered.image.baseUrl !== "https://images-updated.example/v1" || recovered.image.defaultModel !== "gpt-image-2" || !recovered.image.configured) {
          throw new Error(`Model settings restart projection mismatch: ${JSON.stringify(recovered.image)}`)
        }
      } finally {
        await restarted.close().catch(() => restarted.process().kill())
      }
      if (restartedPid) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
        try {
          process.kill(restartedPid, 0)
          throw new Error(`Restarted Electron process ${restartedPid} is still alive after close`)
        } catch (error) {
          if (error instanceof Error && error.message.includes("still alive")) throw error
        }
      }
      console.log("desktop: active Growth persisted paused and remained paused after restart")
    }
  } catch (error) {
    console.error(`DESKTOP RECOVERY FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    await Promise.all([
      new Promise<void>((resolveClose) => provider.close(() => resolveClose())),
      rm(projectRoot, { recursive: true, force: true }),
      rm(externalRoot, { recursive: true, force: true }),
      rm(userData, { recursive: true, force: true }),
    ])
  }
}

await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
try {
  process.kill(pid, 0)
  throw new Error(`Electron main process ${pid} is still alive after close`)
} catch (error) {
  if (error instanceof Error && error.message.includes("still alive")) throw error
}

async function captureAuxiliaryScreenshot(page: Page, path: string) {
  await page.screenshot({ timeout: 30_000, path }).then(
    () => undefined,
    (error: unknown) => console.warn(`desktop: auxiliary screenshot failed: ${path}: ${error instanceof Error ? error.message : String(error)}`),
  )
}

async function assertNoOverflow(page: Page, stage: string) {
  const size = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth, bodyHeight: document.body.scrollHeight, viewportHeight: window.innerHeight }))
  if (size.bodyWidth > size.viewportWidth || size.bodyHeight > size.viewportHeight) throw new Error(`Desktop overflow at ${stage}: ${JSON.stringify(size)}`)
}

async function assertWorkbenchFilesReachable(page: Page, stage: string) {
  const expandNavigation = page.getByTitle("展开项目导航")
  if (await expandNavigation.isVisible()) await expandNavigation.click()
  const result = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>(".wb-workbench-file-expansion")
    if (!rail) return { found: false, reachable: false }
    const box = rail.getBoundingClientRect()
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(90, box.height / 2))
    return { found: true, reachable: Boolean(target?.closest(".wb-workbench-file-expansion")), box: { left: box.left, right: box.right, width: box.width } }
  })
  if (!result.found || !result.reachable) throw new Error(`Desktop workbench files are occluded at ${stage}: ${JSON.stringify(result)}`)
}

function createDesktopProvider() {
  let growthControllerCalls = 0
  return createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { messages?: Array<{ role?: string; content?: unknown }>; tools?: Array<{ function?: { name?: string } }> }
      const toolNames = body.tools?.map((tool) => tool.function?.name).filter(Boolean) ?? []
      const ownerMessageIndex = body.messages?.findLastIndex((message) => message.role === "user") ?? -1
      const controllerResult = body.messages?.slice(ownerMessageIndex + 1).some((message) => message.role === "tool") ?? false
      if (!toolNames.includes("run_growth") && JSON.stringify(body.messages ?? []).includes("验证应用重启后的暂停恢复")) {
        response.writeHead(200, { "content-type": "text/event-stream" })
        response.write(": keep-alive\n\n")
        return
      }
      const event = toolNames.includes("run_growth") && !controllerResult
        ? { id: "desktop-owner-tool", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `desktop-run-growth-${growthControllerCalls += 1}`, type: "function", function: { name: "run_growth", arguments: "{}" } }] }, finish_reason: "tool_calls" }] }
        : { id: "desktop-text", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content: toolNames.includes("run_growth") ? "Growth 已停在可恢复的等待状态。" : "当前有界阶段未形成有效回执。" }, finish_reason: "stop" }] }
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`)
    })
  })
}
