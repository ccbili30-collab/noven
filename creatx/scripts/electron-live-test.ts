import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  throw new Error("ELECTRON LIVE FAIL: DEEPSEEK_API_KEY is not configured")
}
const deepseekApiKey = apiKey
const naturalCreativeMode = process.argv.includes("--natural")
const manualShellMode = process.argv.includes("--manual-shell")
if (manualShellMode && !naturalCreativeMode) {
  throw new Error("ELECTRON LIVE FAIL: --manual-shell requires --natural")
}

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 连续验收项目 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-continuous-live-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "walking-skeleton")
const manualShellPending = join(evidenceDir, "manual-shell-pending.json")
const manualShellScreenshot = join(evidenceDir, "manual-shell-pending.png")
const manualShellDecision = join(evidenceDir, "manual-shell-decision.txt")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const outputFile = join(projectRoot, "continuous-live.md")
const initialContent = "CREATX_CONTINUOUS_ELECTRON_LIVE_PASS"
const externalContent = `${initialContent}\nExternal editor refresh is visible.`
const deniedFile = join(projectRoot, "denied.md")
const novelDirectory = join(projectRoot, "小说")
const outlineFile = join(novelDirectory, "大纲.md")
const chapterFile = join(novelDirectory, "第一章.md")
const technicalOutlineContent = "# 小说大纲\n\n主角在雨夜收到一封来自未来的信。"
const technicalChapterContent = "# 第一章\n\n雨落在旧车站的玻璃顶上。"
const deniedWorkbenchDirectory = join(projectRoot, "拒绝注册")
const workbenchDirectory = join(projectRoot, ".creatx", "workbenches")
const deniedPrompt = "Use the editor tool to create denied.md containing DENIED_SIDE_EFFECT. Do not use shell commands."
const firstPrompt = `Use the editor tool with path exactly continuous-live.md and new_text exactly ${initialContent}. Do not include punctuation or Markdown formatting in the file. Do not use shell commands.`
const continuePrompt = "Continue from the saved history. Do not use tools. Reply with exactly: CONTINUATION_OK"
const deniedRegisterPrompt = "把当前项目中已经存在的‘拒绝注册’文件夹注册为标题‘拒绝注册’的 CreatX 工作台。只调用 register_workbench，并且 folder 与 title 都严格填写 拒绝注册。"
const creativeProjectPrompt = naturalCreativeMode
  ? "我想写一部关于未来来信的小说，帮我开始。"
  : `用户要求你创建一个名为“小说”的创作项目。严格按顺序完成，并且不要使用 shell 命令或其他工具：\n1. 使用 editor，path 严格为 小说/大纲.md，new_text 严格为 ${JSON.stringify(technicalOutlineContent)}。\n2. 使用 editor，path 严格为 小说/第一章.md，new_text 严格为 ${JSON.stringify(technicalChapterContent)}。\n3. 调用 register_workbench，folder 和 title 都严格填写 小说。`
let registeredWorkbenchId = ""
let initialWorkbenchTitle = ""
let novelContents = new Map<string, string>()
let creativeShellApprovals = 0

await mkdir(evidenceDir, { recursive: true })
await Promise.all([
  rm(manualShellPending, { force: true }),
  rm(manualShellScreenshot, { force: true }),
  rm(manualShellDecision, { force: true }),
])
await mkdir(deniedWorkbenchDirectory)
await writeFile(join(projectRoot, "开始.md"), "# 连续验收项目", "utf8")

try {
  const first = await launchDesktop()
  try {
    await assertHealthyWindow(first.page)
    console.log("electron-live: first window ready")
    await first.page.getByTitle("新会话").click()
    await first.page.locator(".session-item").first().waitFor({ timeout: 30_000 })
    await setNewestSessionMode(first.page, "approval")
    await first.page.locator("textarea").fill(deniedPrompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    await first.page.getByRole("dialog", { name: /允许旅鸽执行编辑文件/ }).waitFor({ timeout: 90_000 })
    await first.page.getByRole("button", { name: "拒绝" }).click()
    await first.page.getByTitle("停止").click()
    await first.page.locator('.workspace-shell[data-run-state="cancelled"]').waitFor({ timeout: 30_000 })
    if (await fileExists(deniedFile)) throw new Error("Rejected tool created denied.md")
    console.log("electron-live: rejection and cancellation left no side effect")

    await first.page.locator("textarea").fill(firstPrompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    console.log("electron-live: first run started")
    const firstOutcome = await Promise.race([
      first.page.getByRole("dialog").waitFor({ timeout: 90_000 }).then(() => "approval" as const),
      first.page.locator('.workspace-shell[data-run-state="completed"], .workspace-shell[data-run-state="failed"], .workspace-shell[data-run-state="unknown"], .workspace-shell[data-run-state="cancelled"]').waitFor({ timeout: 90_000 }).then(() => "terminal" as const),
    ])
    if (firstOutcome !== "approval") throw new Error(`Run reached ${await first.page.locator(".workspace-shell").getAttribute("data-run-state")} before approval`)
    await first.page.getByRole("dialog", { name: /允许旅鸽执行编辑文件/ }).waitFor()
    const approvalInput = await first.page.getByRole("dialog").locator("pre").innerText()
    requireExpectedApprovalPath(approvalInput, outputFile)
    console.log(`electron-live: approval input=${approvalInput}`)
    console.log("electron-live: editor approval visible")
    await first.page.getByRole("button", { name: "允许一次" }).click()
    await waitForFile(outputFile, 90_000)
    await first.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 90_000 })
    if ((await readFile(outputFile, "utf8")).trim() !== initialContent) throw new Error("Cline wrote unexpected Markdown content")

    await first.page.getByTitle("文件", { exact: true }).click()
    await first.page.locator(".file-row", { hasText: "continuous-live.md" }).click()
    await first.page.getByText(initialContent, { exact: true }).waitFor()
    await writeFile(outputFile, externalContent, "utf8")
    await first.page.getByTitle("刷新").click()
    await first.page.getByText("External editor refresh is visible.", { exact: false }).waitFor()
    await first.page.getByTitle("折叠工具栏").click()

    await first.page.locator("textarea").fill(deniedRegisterPrompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    await first.page.getByRole("dialog", { name: /允许旅鸽执行注册工作台/ }).waitFor({ timeout: 90_000 })
    const registerApproval = await first.page.getByRole("dialog").locator("pre").innerText()
    requireRegisterWorkbenchInput(registerApproval, "拒绝注册", "拒绝注册")
    await first.page.getByRole("button", { name: "拒绝" }).click()
    const stop = first.page.getByTitle("停止")
    if (await stop.isVisible()) await stop.click()
    await first.page.locator('.workspace-shell[data-run-state="completed"], .workspace-shell[data-run-state="cancelled"], .workspace-shell[data-run-state="failed"]').waitFor({ timeout: 30_000 })
    if (await fileExists(workbenchDirectory)) {
      const records = (await readdir(workbenchDirectory)).filter((name) => /^wb_.+\.json$/.test(name))
      if (records.length) throw new Error("Rejected register_workbench created metadata")
    }
    if (await first.page.getByTitle("工作台：拒绝注册").count()) throw new Error("Rejected register_workbench appeared in the UI")
    console.log("electron-live: rejected register_workbench left no registration")

    const previousSessionCount = await first.page.locator(".session-item").count()
    await first.page.getByTitle("新会话").click()
    await first.page.locator(".session-item").nth(previousSessionCount).waitFor({ timeout: 30_000 })
    await setNewestSessionMode(first.page, "approval")
    await first.page.locator("textarea").fill(creativeProjectPrompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    const creativeApproval = await approveNaturalNovelFiles(first.page)
    novelContents = creativeApproval.contents
    creativeShellApprovals = creativeApproval.shellApprovals
    await first.page.getByRole("dialog", { name: /允许旅鸽执行注册工作台/ }).waitFor({ timeout: 90_000 })
    const creativeRegisterInput = requireRegisterWorkbenchInput(
      await first.page.getByRole("dialog").locator("pre").innerText(),
      "小说",
      naturalCreativeMode ? undefined : "小说",
    )
    initialWorkbenchTitle = creativeRegisterInput.title ?? "小说"
    if (naturalCreativeMode && initialWorkbenchTitle === "小说") {
      throw new Error("Natural-language run did not produce a distinct title to correct")
    }
    await first.page.getByRole("button", { name: "允许一次" }).click()
    const recordPath = await waitForWorkbenchRecord(90_000)
    const record = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>
    registeredWorkbenchId = String(record.id ?? "")
    if (record.schemaVersion !== 1 || record.folder !== "小说" || (record.title ?? "小说") !== initialWorkbenchTitle || !registeredWorkbenchId.startsWith("wb_")) {
      throw new Error(`Unexpected workbench record: ${JSON.stringify(record)}`)
    }
    if ((await readFile(outlineFile, "utf8")) !== novelContents.get("小说/大纲.md")) throw new Error("大纲.md differs from its approved new_text")
    if ((await readFile(chapterFile, "utf8")) !== novelContents.get("小说/第一章.md")) throw new Error("第一章.md differs from its approved new_text")
    expectExactNovelFiles(await readdir(novelDirectory))
    await first.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 90_000 })
    const creativeToolNames = await first.page.locator(".agent-operation strong").allTextContents()
    if ((naturalCreativeMode && !creativeToolNames.includes("skills")) || !creativeToolNames.includes("注册工作台")) {
      throw new Error(`Unexpected natural-language tool sequence: ${JSON.stringify(creativeToolNames)}`)
    }
    await first.page.getByTitle(`工作台：${initialWorkbenchTitle}`).click()
    await first.page.locator(".workbench-heading", { hasText: initialWorkbenchTitle }).waitFor()
    await first.page.locator(".workbench-entry.file", { hasText: "大纲.md" }).waitFor()
    await first.page.locator(".workbench-entry.file", { hasText: "第一章.md" }).click()
    await first.page.locator(".document-preview pre").waitFor()
    if ((await first.page.locator(".document-preview pre").textContent())?.replaceAll("\r\n", "\n") !== novelContents.get("小说/第一章.md")?.replaceAll("\r\n", "\n")) {
      throw new Error("Workbench preview did not read the real 第一章.md content")
    }
    if (naturalCreativeMode) {
      const renamePrompt = `为什么把这个工作台叫${JSON.stringify(initialWorkbenchTitle)}？请把这个工作台的显示标题改成“小说”。`
      await first.page.locator("textarea").fill(renamePrompt)
      await first.page.getByTitle("发送").click()
      await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
      await first.page.getByRole("dialog", { name: /允许旅鸽执行修改工作台标题/ }).waitFor({ timeout: 90_000 })
      requireRenameWorkbenchInput(await first.page.getByRole("dialog").locator("pre").innerText(), "小说", "小说")
      await first.page.getByRole("button", { name: "允许一次" }).click()
      await first.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 90_000 })
      await first.page.getByTitle("工作台：小说").waitFor({ timeout: 30_000 })
      if (await first.page.getByTitle(`工作台：${initialWorkbenchTitle}`).count()) throw new Error("Old workbench title remained after rename")
      const renamedRecord = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>
      if (renamedRecord.id !== registeredWorkbenchId || renamedRecord.folder !== "小说" || renamedRecord.title !== "小说") {
        throw new Error(`Rename changed workbench identity or failed to persist: ${JSON.stringify(renamedRecord)}`)
      }
      expectExactNovelFiles(await readdir(novelDirectory))
      if ((await readFile(outlineFile, "utf8")) !== novelContents.get("小说/大纲.md")) throw new Error("Rename changed 大纲.md")
      if ((await readFile(chapterFile, "utf8")) !== novelContents.get("小说/第一章.md")) throw new Error("Rename changed 第一章.md")
    }
    console.log(`electron-live: AI created two novel files, registered title=${initialWorkbenchTitle}, and persisted title=小说 on ${registeredWorkbenchId}; Shell approvals=${creativeShellApprovals}`)
    await first.page.screenshot({ path: join(evidenceDir, "electron-live-first-run.png") })
  } catch (error) {
    await first.page.screenshot({ path: join(evidenceDir, "electron-live-failure.png") }).catch(() => undefined)
    console.error(`ELECTRON LIVE FIRST RUN FAIL: ${error instanceof Error ? error.message : String(error)}`)
    console.error((await first.page.locator("body").innerText().catch(() => "<body unavailable>")).slice(0, 6000))
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid, userData)
  }

  await writeFile(join(workbenchDirectory, "broken.json"), "{broken", "utf8")

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    await second.page.getByText(creativeProjectPrompt, { exact: true }).waitFor({ timeout: 30_000 })
    await second.page.getByTitle("工作台：小说").click()
    await second.page.locator(".workbench-heading", { hasText: "小说" }).waitFor()
    await second.page.getByText("1 条工作台记录无法读取", { exact: false }).waitFor()
    if (!(await second.page.getByTitle("工作台：小说").count())) throw new Error("Registered workbench did not recover after restart")
    await second.page.locator(".workbench-entry.file", { hasText: "第一章.md" }).waitFor()
    await second.page.locator(".workbench-entry.file", { hasText: "大纲.md" }).click()
    await second.page.locator(".document-preview pre").waitFor()
    if ((await second.page.locator(".document-preview pre").textContent())?.replaceAll("\r\n", "\n") !== novelContents.get("小说/大纲.md")?.replaceAll("\r\n", "\n")) {
      throw new Error("Restarted workbench preview did not recover 大纲.md")
    }
    await second.page.getByTitle("文件", { exact: true }).click()
    await second.page.locator(".file-row", { hasText: "continuous-live.md" }).click()
    await second.page.getByText("External editor refresh is visible.", { exact: false }).waitFor()
    await second.page.getByTitle("折叠工具栏").click()

    const assistantCount = await second.page.locator(".message.assistant").count()
    await second.page.locator("textarea").fill(continuePrompt)
    await second.page.getByTitle("发送").click()
    await second.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 90_000 })
    await second.page.locator(".message.assistant").nth(assistantCount).getByText("CONTINUATION_OK", { exact: false }).waitFor({ timeout: 30_000 })
    await second.page.screenshot({ path: join(evidenceDir, "electron-live-restarted.png") })
  } catch (error) {
    await second.page.screenshot({ path: join(evidenceDir, "electron-live-restart-failure.png") }).catch(() => undefined)
    console.error(`ELECTRON LIVE RESTART FAIL: ${error instanceof Error ? error.message : String(error)}`)
    console.error((await second.page.locator("body").innerText().catch(() => "<body unavailable>")).slice(0, 6000))
    throw error
  } finally {
    await closeAndAssert(second.app, second.pid, userData)
  }

  console.log(JSON.stringify({
    status: "ELECTRON LIVE PASS",
    provider: process.env.CREATX_PROVIDER_ID ?? "deepseek",
    model: process.env.CREATX_MODEL_ID ?? "deepseek-chat",
    file: "continuous-live.md",
    workbench: { id: registeredWorkbenchId, folder: "小说", initialTitle: initialWorkbenchTitle, title: "小说", files: ["大纲.md", "第一章.md"] },
    creativeShellApprovals,
    naturalCreativeMode,
    manualShellMode,
    restart: true,
    continuation: "CONTINUATION_OK",
  }))
} finally {
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function launchDesktop() {
  const app = await electron.launch({
    executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
    args: [workspace, `--user-data-dir=${userData}`],
    cwd: workspace,
    env: {
      ...inheritedEnvironment,
      CREATX_PROJECT_ROOT: projectRoot,
      DEEPSEEK_API_KEY: deepseekApiKey,
    },
  })
  const pid = app.process().pid
  if (!pid) throw new Error("Electron main process did not expose a PID")
  return { app, pid, page: await app.firstWindow() }
}

async function assertHealthyWindow(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  if (pageErrors.length || consoleErrors.length) throw new Error(`Renderer errors: ${JSON.stringify({ pageErrors, consoleErrors })}`)
}

async function setNewestSessionMode(page: Page, mode: "approval" | "free") {
  const result = await page.evaluate(async (permissionMode) => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok) return { ok: false as const, detail: bootstrap.error.message }
    const session = bootstrap.value.sessions[0]
    if (!session) return { ok: false as const, detail: "No session exists" }
    const changed = await window.creatx.setSessionPermissionMode(session.id, permissionMode)
    if (!changed.ok) return { ok: false as const, detail: changed.error.message }
    return { ok: true as const, mode: changed.value.permission.mode }
  }, mode)
  if (!result.ok || result.mode !== mode) throw new Error(`Could not set ${mode} mode: ${result.detail ?? result.mode}`)
}

async function waitForFile(path: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await access(path)
      return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
    }
  }
  throw new Error(`Timed out waiting for ${path}`)
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function requireExpectedApprovalPath(inputText: string, expectedFile: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || !("path" in input) || typeof input.path !== "string") {
    throw new Error(`Editor approval has no string path: ${inputText}`)
  }
  const target = isAbsolute(input.path) ? resolve(input.path) : resolve(projectRoot, input.path)
  if (target.toLocaleLowerCase("en-US") !== expectedFile.toLocaleLowerCase("en-US")) {
    throw new Error(`Editor approval escaped the test project: ${input.path}`)
  }
}

function requireRegisterWorkbenchInput(inputText: string, folder: string, title?: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Invalid register_workbench input: ${inputText}`)
  const value = input as Record<string, unknown>
  const keys = Object.keys(value).sort().join(",")
  if ((keys !== "folder" && keys !== "folder,title") || value.folder !== folder || (value.title !== undefined && (typeof value.title !== "string" || !value.title.trim()))) {
    throw new Error(`Unexpected register_workbench input: ${inputText}`)
  }
  if (title !== undefined && value.title !== title) throw new Error(`Unexpected register_workbench input: ${inputText}`)
  return { folder: value.folder, ...(typeof value.title === "string" ? { title: value.title.trim() } : {}) }
}

function requireRenameWorkbenchInput(inputText: string, folder: string, title: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Invalid rename_workbench input: ${inputText}`)
  const value = input as Record<string, unknown>
  if (Object.keys(value).sort().join(",") !== "folder,title" || value.folder !== folder || value.title !== title) {
    throw new Error(`Unexpected rename_workbench input: ${inputText}`)
  }
}

async function approveNaturalNovelFiles(page: Page) {
  const expected = new Set(["小说/大纲.md", "小说/第一章.md"])
  const approved = new Map<string, string>()
  let shellApprovals = 0
  while (true) {
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ timeout: 90_000 })
    const dialogTitle = await dialog.getByRole("heading").innerText()
    if (dialogTitle.includes("运行命令")) {
      if (!naturalCreativeMode) throw new Error(`Technical creative flow requested Shell: ${await dialog.locator("pre").innerText()}`)
      const inputText = await dialog.locator("pre").innerText()
      if (manualShellMode) {
        const decision = await waitForManualShellDecision(page, inputText, shellApprovals + 1)
        shellApprovals += 1
        if (!(await dialog.isVisible())) continue
        await dialog.getByRole("button", { name: decision === "approve" ? "允许一次" : "拒绝", exact: true }).click()
        if (decision === "reject") throw new Error(`Manual reviewer rejected Shell approval ${shellApprovals}: ${inputText}`)
        continue
      }
      if (shellApprovals >= 3) throw new Error("Natural-language novel start requested too many Shell operations")
      requireAllowedProjectShell(inputText)
      shellApprovals += 1
      await page.getByRole("button", { name: "允许一次" }).click()
      continue
    }
    if (dialogTitle.includes("注册工作台")) {
      await Promise.all([waitForFile(outlineFile, 30_000), waitForFile(chapterFile, 30_000)])
      const contents = new Map([
        ["小说/大纲.md", await readFile(outlineFile, "utf8")],
        ["小说/第一章.md", await readFile(chapterFile, "utf8")],
      ])
      if (naturalCreativeMode) contents.forEach((content, relativePath) => requireMeaningfulFutureLetterContent(relativePath, content))
      return { contents, shellApprovals }
    }
    if (!dialogTitle.includes("编辑文件")) throw new Error(`Natural-language novel start requested an unexpected approval: ${dialogTitle}`)
    if (!approved.size) {
      const toolNames = await page.locator(".agent-operation strong").allTextContents()
      if (naturalCreativeMode && !toolNames.includes("skills")) throw new Error(`Cline did not load the novel Skill before editing: ${JSON.stringify(toolNames)}`)
    }
    const inputText = await page.getByRole("dialog").locator("pre").innerText()
    const input: unknown = JSON.parse(inputText)
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Invalid editor input: ${inputText}`)
    const value = input as Record<string, unknown>
    if (typeof value.path !== "string" || typeof value.new_text !== "string") throw new Error(`Editor input is missing path or new_text: ${inputText}`)
    const target = isAbsolute(value.path) ? resolve(value.path) : resolve(projectRoot, value.path)
    const relativePath = relative(projectRoot, target).replaceAll("\\", "/")
    if (!expected.has(relativePath)) throw new Error(`Unexpected creative project editor input: ${inputText}`)
    if (naturalCreativeMode) requireMeaningfulFutureLetterContent(relativePath, value.new_text)
    if (!naturalCreativeMode) {
      const expectedContent = relativePath === "小说/大纲.md" ? technicalOutlineContent : technicalChapterContent
      if (value.new_text !== expectedContent) throw new Error(`Technical creative content changed: ${inputText}`)
    }
    expected.delete(relativePath)
    approved.set(relativePath, value.new_text)
    await page.getByRole("button", { name: "允许一次" }).click()
  }
}

async function waitForManualShellDecision(page: Page, inputText: string, sequence: number) {
  const parsedInput: unknown = JSON.parse(inputText)
  await page.screenshot({ path: manualShellScreenshot, timeout: 10_000 }).catch(() => undefined)
  await writeFile(manualShellPending, `${JSON.stringify({
    sequence,
    projectRoot,
    approval: parsedInput,
    screenshot: manualShellScreenshot,
  }, null, 2)}\n`, "utf8")
  console.log(`electron-live: waiting for manual Shell decision ${sequence} at ${manualShellDecision}`)
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15 * 60_000) {
    if (!(await fileExists(manualShellDecision))) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
      continue
    }
    const decision = (await readFile(manualShellDecision, "utf8")).trim().toLocaleLowerCase("en-US")
    if (decision !== "approve" && decision !== "reject") {
      throw new Error(`Manual Shell decision must be approve or reject, received: ${JSON.stringify(decision)}`)
    }
    await Promise.all([
      rm(manualShellPending, { force: true }),
      rm(manualShellScreenshot, { force: true }),
      rm(manualShellDecision, { force: true }),
    ])
    console.log(`electron-live: manual Shell decision ${sequence}=${decision}`)
    return decision
  }
  throw new Error(`Timed out waiting for manual Shell decision ${sequence}`)
}

function requireAllowedProjectShell(inputText: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || Array.isArray(input) || !("commands" in input)) throw new Error(`Invalid Shell approval input: ${inputText}`)
  const raw = (input as Record<string, unknown>).commands
  const commands = typeof raw === "string" ? [raw] : Array.isArray(raw) && raw.every((command) => typeof command === "string") ? raw : []
  if (!commands.length || commands.length > 2) throw new Error(`Shell inspection must contain one or two commands: ${inputText}`)
  commands.forEach(requireAllowedProjectShellCommand)
}

function requireAllowedProjectShellCommand(command: string) {
  const normalized = command.toLocaleLowerCase("en-US")
  const root = projectRoot.toLocaleLowerCase("en-US")
  if (/^\s*ls\s+["']小说["']\s+2>\$null;\s*if\s*\(\$\?\)\s*\{\s*echo\s+["']exists["']\s*\}\s*else\s*\{\s*echo\s+["']not_exists["']\s*\}\s*$/i.test(command)) return
  if (/^\s*if\s+exist\s+"[^"]*[\\/]小说"\s+echo\s+exists\s*$/i.test(command) && normalized.includes(root)) return
  if (/&&|[;<>]|\b(remove-item|del|erase|rd|rmdir|move|copy|set-content|out-file)\b/i.test(command)) throw new Error(`Shell operation contains a forbidden operator: ${command}`)
  const isListing = /^\s*(dir\s+\/b\b|get-childitem\b|ls(?:\s+-[a-z]+)*\b)/i.test(command)
  if (isListing && (!normalized.includes(root) && !/^\s*ls(?:\s+-[a-z]+)*\s*$/i.test(command))) {
    throw new Error(`Shell listing does not target the test project: ${command}`)
  }
  if (isListing) return
  if (/^\s*if\s*\(test-path\s+["']?小说["']?\)\s*\{\s*write-output\s+["']exists["']\s*\}\s*else\s*\{\s*write-output\s+["']not_exists["']\s*\}\s*$/i.test(command)) return
  const target = novelDirectory.toLocaleLowerCase("en-US")
  const createsNovelDirectory = /^\s*(mkdir\b|new-item\b)/i.test(command)
    && (normalized.includes(target) || (!normalized.includes("..") && /(?:^|[\\/\s"'])小说(?:[\\/\s"']|$)/.test(command)))
  if (!createsNovelDirectory) throw new Error(`Shell operation is not an allowed project directory action: ${command}`)
}

function requireMeaningfulFutureLetterContent(relativePath: string, content: string) {
  if (content.trim().length < 80) throw new Error(`${relativePath} is too short to be meaningful`)
  if (!content.includes("未来") || !content.includes("信")) throw new Error(`${relativePath} does not respond to the future-letter premise`)
  if (/TODO|TBD|待补|占位|请填写|待定/i.test(content)) throw new Error(`${relativePath} contains placeholder content`)
}

function expectExactNovelFiles(names: string[]) {
  if (names.sort((left, right) => left.localeCompare(right, "zh-CN")).join("|") !== ["大纲.md", "第一章.md"].sort((left, right) => left.localeCompare(right, "zh-CN")).join("|")) {
    throw new Error(`Unexpected files inside 小说: ${JSON.stringify(names)}`)
  }
}

async function waitForWorkbenchRecord(timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const names = (await readdir(workbenchDirectory)).filter((name) => /^wb_.+\.json$/.test(name))
      if (names.length === 1) return join(workbenchDirectory, names[0]!)
    } catch {
      // The directory is created only after the approved registration succeeds.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
  }
  throw new Error("Timed out waiting for the registered workbench record")
}

async function closeAndAssert(app: ElectronApplication, pid: number, dataPath: string) {
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 15_000)),
  ])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 15 seconds`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  try {
    process.kill(pid, 0)
    throw new Error(`Electron main process ${pid} is still alive after close`)
  } catch (error) {
    if (error instanceof Error && error.message.includes("still alive")) throw error
  }
  const escaped = dataPath.replaceAll("'", "''")
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like \"*$needle*\" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${dataPath}`)
}
