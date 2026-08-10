import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const deepseekApiKey = requireEnvironment("DEEPSEEK_API_KEY")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-runtime")
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Growth 世界验收 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-growth-live-"))
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const instruction = "/growth 创建一个自洽、可供后续小说和角色创作使用的中世纪世界。\n请自主决定结构并持续完成整个目标，为重要内容配图。"
const steerInstruction = "不要建立统一帝国，以多个相互竞争的城邦为核心"
const startTime = Date.now()
let preserveFailure = false
let goalId = ""

await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "项目说明.md"), "# 中世纪世界创作项目\n\n这是一个用于 CreatX Dynamic Growth Live 验收的独立项目。\n", "utf8")

try {
  const first = await launchDesktop()
  try {
    await assertHealthyWindow(first.page)
    await installApprovalTrap(first.page)
    await first.page.getByTitle("新会话").click()
    const session = await requireFreeProjectSession(first.page)

    await sendFromComposer(first.page, instruction)
    const started = await waitForGoal(first.page, (goal) => goal.status === "active", 30_000)
    goalId = started.goalId
    await first.page.locator('[data-growth-status="active"]').waitFor({ timeout: 30_000 })
    await assertNoApproval(first.page, "Growth start")
    console.log(JSON.stringify({ stage: "started", goalId, sessionId: session.id, version: started.version }))

    await waitForNamedFile(projectRoot, "创作计划.md", 180_000)
    await sendFromComposer(first.page, steerInstruction)
    await first.page.locator(".message.user", { hasText: steerInstruction }).waitFor({ timeout: 30_000 })
    await assertNoApproval(first.page, "Growth steer")
    console.log(JSON.stringify({ stage: "steered", instruction: steerInstruction }))

    const firstReport = await waitForReceiptCount(1, 300_000)
    const beforePause = await requireGoal(first.page, goalId)
    if (beforePause.status !== "active") throw new Error(`Growth left active state before pause: ${JSON.stringify(beforePause)}`)
    const paused = await first.page.evaluate(async (id) => window.creatx.pauseGrowth(id), goalId)
    if (!paused.ok || paused.value.status !== "paused") throw new Error(`Could not pause Growth: ${JSON.stringify(paused)}`)
    await first.page.locator('[data-growth-status="paused"]').waitFor({ timeout: 30_000 })
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 6_000))
    const pausedReceiptCount = readGrowthEvidence().receiptCount
    const stillPaused = await requireGoal(first.page, goalId)
    if (stillPaused.status !== "paused" || pausedReceiptCount !== firstReport) {
      throw new Error(`Pause allowed another stage report: ${JSON.stringify({ firstReport, pausedReceiptCount, stillPaused })}`)
    }
    console.log(JSON.stringify({ stage: "paused", version: stillPaused.version, receiptCount: pausedReceiptCount }))

    await first.page.getByTitle("继续 Growth").click()
    await first.page.locator('[data-growth-status="active"]').waitFor({ timeout: 30_000 })
    await assertNoApproval(first.page, "Growth resume")
    console.log(JSON.stringify({ stage: "resumed", goalId }))

    const completed = await waitForCompletion(first.page, 30 * 60_000)
    if (completed.status !== "completed") throw new Error(`Growth did not complete autonomously: ${JSON.stringify(completed)}`)
    const growthEvidence = readGrowthEvidence()
    if (growthEvidence.receiptCount < 2) throw new Error(`Growth completed with only ${growthEvidence.receiptCount} stage reports`)
    const images = readImageEvidence()
    requireTwoCreativeImages(images)
    await requireFilesOnDisk(images.map((image) => image.relativePath))
    await requireSteerInProject()
    await requireUnifiedRegisteredWorkRoot(images)
    await assertNoApproval(first.page, "Growth completion")

    const previewFile = await selectRealPreview(first.page, projectRoot)
    const previewImage = await selectRealImagePreview(first.page, images[0]!.relativePath)
    await first.page.screenshot({ path: join(evidenceDir, "electron-growth-live-completed.png"), timeout: 90_000 })
    console.log(JSON.stringify({
      stage: "completed",
      goal: { goalId, version: completed.version, status: completed.status },
      stageReports: growthEvidence.receiptCount,
      images: images.map((image) => ({ relativePath: image.relativePath, model: image.model, status: image.status })),
      previewFile,
      previewImage,
    }))
  } catch (error) {
    preserveFailure = true
    await first.page.screenshot({ path: join(evidenceDir, "electron-growth-live-failure.png"), timeout: 90_000 }).catch(() => undefined)
    await preserveDiagnostics(error)
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid)
  }

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    await installApprovalTrap(second.page)
    const recovered = await waitForGoal(second.page, (goal) => goal.goalId === goalId, 30_000)
    if (recovered.status !== "completed") throw new Error(`Restart did not recover completed Goal: ${JSON.stringify(recovered)}`)
    await waitForNamedFile(projectRoot, "创作计划.md", 30_000)
    const images = readImageEvidence()
    await requireFilesOnDisk(images.map((image) => image.relativePath))
    const previewFile = await selectRealPreview(second.page, projectRoot)
    const previewImage = await selectRealImagePreview(second.page, images[0]!.relativePath)
    await assertNoApproval(second.page, "Growth restart")
    await second.page.screenshot({ path: join(evidenceDir, "electron-growth-live-restarted.png"), timeout: 90_000 })
    console.log(JSON.stringify({
      status: "ELECTRON GROWTH LIVE PASS",
      provider: process.env.CREATX_PROVIDER_ID ?? "deepseek",
      model: process.env.CREATX_MODEL_ID ?? "deepseek-chat",
      imageProvider: "JMRAI",
      goalId,
      stageReports: readGrowthEvidence().receiptCount,
      imageTasks: images.length,
      previewFile,
      previewImage,
      restart: true,
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      screenshots: ["electron-growth-live-completed.png", "electron-growth-live-restarted.png"],
    }))
  } catch (error) {
    preserveFailure = true
    await second.page.screenshot({ path: join(evidenceDir, "electron-growth-live-restart-failure.png"), timeout: 90_000 }).catch(() => undefined)
    await preserveDiagnostics(error)
    throw error
  } finally {
    await closeAndAssert(second.app, second.pid)
  }
} finally {
  if (!preserveFailure) await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
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
      CREATX_IMAGE_BASE_URL: imageBaseUrl,
      CREATX_IMAGE_API_KEY: imageApiKey,
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
  await page.waitForTimeout(500)
  if (pageErrors.length || consoleErrors.length) throw new Error(`Renderer errors: ${JSON.stringify({ pageErrors, consoleErrors })}`)
}

async function installApprovalTrap(page: Page) {
  await page.evaluate(() => {
    const state = { seen: false, runtimeErrors: [] as string[] }
    Object.defineProperty(window, "__creatxGrowthApprovalTrap", { value: state, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") state.runtimeErrors.push(event.error.detail ?? event.error.message)
    })
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"]')) state.seen = true
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

async function assertNoApproval(page: Page, stage: string) {
  const trap = await page.evaluate(() => (window as unknown as { __creatxGrowthApprovalTrap?: { seen: boolean; runtimeErrors: string[] } }).__creatxGrowthApprovalTrap)
  if (trap?.seen || await page.getByRole("dialog").count()) throw new Error(`${stage} displayed an approval dialog in free mode`)
  if (trap?.runtimeErrors.length) throw new Error(`${stage} emitted Runtime errors: ${JSON.stringify(trap.runtimeErrors)}`)
}

async function requireFreeProjectSession(page: Page) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30_000) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const session = result.value.sessions[0]
    if (!session) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
      continue
    }
    if (session.kind !== "project" || session.permission.mode !== "free") {
      throw new Error(`Growth session is not a free project session: ${JSON.stringify(session)}`)
    }
    return session
  }
  throw new Error("Timed out waiting for the new project session")
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.locator("textarea").fill(prompt)
  await page.locator(".composer-actions .send-button:not(.stop)").click()
}

type Goal = { goalId: string; projectId: string; status: string; version: number; requiredImageTaskIds: string[] }

async function waitForGoal(page: Page, predicate: (goal: Goal) => boolean, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.growth && predicate(result.value.growth)) return result.value.growth
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error("Timed out waiting for the expected Growth Goal")
}

async function requireGoal(page: Page, id: string) {
  return waitForGoal(page, (goal) => goal.goalId === id, 10_000)
}

async function waitForCompletion(page: Page, timeoutMs: number) {
  const startedAt = Date.now()
  let lastVersion = -1
  while (Date.now() - startedAt < timeoutMs) {
    const goal = await requireGoal(page, goalId)
    if (goal.version !== lastVersion) {
      console.log(JSON.stringify({ stage: "progress", status: goal.status, version: goal.version, receipts: readGrowthEvidence().receiptCount, images: readImageEvidence().map((image) => image.status) }))
      lastVersion = goal.version
    }
    await assertNoApproval(page, `Growth v${goal.version}`)
    if (goal.status === "completed") return goal
    if (goal.status !== "active") return goal
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error(`Timed out waiting for Growth completion after ${Math.round(timeoutMs / 60_000)} minutes`)
}

async function waitForReceiptCount(minimum: number, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const count = readGrowthEvidence().receiptCount
    if (count >= minimum) return count
    const goal = await requireGoalFromLatestWindow()
    if (goal.status !== "active") throw new Error(`Growth reached ${goal.status} before its first valid stage report: ${JSON.stringify(goal)}`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error(`Timed out waiting for ${minimum} Growth stage report(s)`)
}

async function requireGoalFromLatestWindow() {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    const row = database.prepare("SELECT goal_id, status, version, status_reason FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as { goal_id: string; status: string; version: number; status_reason: string | null } | undefined
    if (!row) throw new Error("Growth Goal is missing from persistence")
    return { goalId: row.goal_id, status: row.status, version: row.version, ...(row.status_reason ? { statusReason: row.status_reason } : {}) }
  } finally {
    database.close()
  }
}

function readGrowthEvidence() {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    const receipt = database.prepare("SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?").get(goalId) as unknown as { count: number }
    const goal = database.prepare("SELECT status, version FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as { status: string; version: number } | undefined
    return { receiptCount: Number(receipt.count), goal }
  } finally {
    database.close()
  }
}

interface ImageEvidence { relativePath: string; prompt: string; model: string; status: string; errorCode?: string }

function readImageEvidence(): ImageEvidence[] {
  if (!goalId || !fileExistsSync(imageDatabasePath)) return []
  const database = new DatabaseSync(imageDatabasePath, { readOnly: true })
  try {
    return (database.prepare("SELECT relative_path, prompt, model, status, error_code FROM image_task ORDER BY queue_sequence").all() as unknown as Array<{ relative_path: string; prompt: string; model: string; status: string; error_code: string | null }>).map((row) => ({
      relativePath: row.relative_path,
      prompt: row.prompt,
      model: row.model,
      status: row.status,
      ...(row.error_code ? { errorCode: row.error_code } : {}),
    }))
  } finally {
    database.close()
  }
}

function requireTwoCreativeImages(images: ImageEvidence[]) {
  const succeeded = images.filter((image) => image.status === "succeeded")
  if (succeeded.length < 2) throw new Error(`Growth completed without two successful queued images: ${JSON.stringify(images)}`)
  const map = succeeded.find((image) => /(地图|map|地形|疆域)/i.test(`${image.relativePath} ${image.prompt}`))
  const representative = succeeded.find((image) => image !== map)
  if (!map || !representative) throw new Error(`Growth did not produce both a map and a representative image: ${JSON.stringify(images)}`)
}

async function requireFilesOnDisk(relativePaths: string[]) {
  for (const path of relativePaths) {
    const target = resolve(projectRoot, path)
    const projectRelative = relative(projectRoot, target)
    if (!projectRelative || projectRelative.startsWith("..")) throw new Error(`Image task escaped the project: ${path}`)
    const info = await stat(target)
    if (!info.isFile() || info.size < 1_000) throw new Error(`Generated image is missing or empty: ${path}`)
    await decodeWithWindows(target)
  }
}

async function requireSteerInProject() {
  const files = await listFiles(projectRoot)
  const textFiles = files.filter((path) => [".md", ".txt", ".json", ".html"].includes(extname(path).toLocaleLowerCase("en-US")))
  const contents = await Promise.all(textFiles.map((path) => readFile(path, "utf8").catch(() => "")))
  if (!contents.some((content) => content.includes("城邦"))) throw new Error("Final project files do not reflect the city-state Steer")
}

async function requireUnifiedRegisteredWorkRoot(images: ImageEvidence[]) {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const records = await readdir(directory).catch(() => [])
  const workbenches = await Promise.all(records.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as { folder?: unknown }))
  const folder = workbenches.map((record) => record.folder).find((value): value is string => typeof value === "string" && value.trim().length > 0)
  if (!folder) throw new Error("Growth did not register a sustained work root")
  const prefix = `${folder.replaceAll("\\", "/").replace(/\/$/, "")}/`
  if (images.some((image) => !image.relativePath.replaceAll("\\", "/").startsWith(prefix))) {
    throw new Error(`Growth images are not inside the registered work root ${folder}: ${JSON.stringify(images)}`)
  }
  const files = await listFiles(projectRoot)
  const creativeFiles = files.map((path) => relative(projectRoot, path).replaceAll("\\", "/")).filter((path) => path !== "项目说明.md" && path !== "创作计划.md")
  if (creativeFiles.some((path) => !path.startsWith(prefix))) throw new Error(`Growth content escaped the registered work root ${folder}: ${JSON.stringify(creativeFiles)}`)
}

async function selectRealPreview(page: Page, root: string) {
  await page.getByTitle("文件", { exact: true }).click()
  const files = (await listFiles(root)).filter((path) => extname(path).toLocaleLowerCase("en-US") === ".md")
  const selected = files.find((path) => basename(path) !== "项目说明.md")
  if (!selected) throw new Error("Growth produced no Markdown file to preview")
  await page.locator(".file-row", { hasText: basename(selected) }).first().click()
  await page.locator(".document-preview pre").waitFor({ timeout: 30_000 })
  const preview = await page.locator(".document-preview pre").textContent()
  const disk = await readFile(selected, "utf8")
  if (preview?.replaceAll("\r\n", "\n") !== disk.replaceAll("\r\n", "\n")) throw new Error(`Renderer preview differs from disk: ${selected}`)
  return relative(root, selected).replaceAll("\\", "/")
}

async function selectRealImagePreview(page: Page, path: string) {
  const row = page.locator(".file-row", { hasText: basename(path) }).first()
  await row.waitFor({ timeout: 30_000 })
  await row.click()
  const image = page.locator(".image-preview img")
  await image.waitFor({ timeout: 30_000 })
  const decoded = await image.evaluate((element) => ({ width: (element as HTMLImageElement).naturalWidth, height: (element as HTMLImageElement).naturalHeight, source: element.getAttribute("src") }))
  if (!decoded.source?.startsWith("data:image/") || decoded.width < 1 || decoded.height < 1) throw new Error(`Renderer could not preview the real Growth image: ${JSON.stringify(decoded)}`)
  return { path, width: decoded.width, height: decoded.height }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".creatx").map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

async function decodeWithWindows(path: string) {
  const escaped = path.replaceAll("'", "''")
  const command = `Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Image]::FromFile('${escaped}'); try { Write-Output ($image.Width.ToString() + 'x' + $image.Height.ToString()) } finally { $image.Dispose() }`
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", command])
  if (!/^\d+x\d+$/.test(stdout.trim())) throw new Error(`Windows image decoder failed for ${path}: ${stdout.trim()}`)
}

async function closeAndAssert(app: ElectronApplication, pid: number) {
  const closed = await Promise.race([app.close().then(() => true), new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 20_000))])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 20 seconds`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750))
  try {
    process.kill(pid, 0)
    throw new Error(`Electron main process ${pid} is still alive after close`)
  } catch (error) {
    if (error instanceof Error && error.message.includes("still alive")) throw error
  }
  const escaped = userData.replaceAll("'", "''")
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like \"*$needle*\" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${userData}`)
}

async function waitForNamedFile(root: string, name: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const matches = (await listFiles(root)).filter((path) => basename(path) === name)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) throw new Error(`Growth created duplicate ${name} files: ${JSON.stringify(matches)}`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Timed out waiting for ${name} below ${root}`)
}

function fileExistsSync(path: string) {
  try {
    const database = new DatabaseSync(path, { readOnly: true })
    database.close()
    return true
  } catch {
    return false
  }
}

async function preserveDiagnostics(error: unknown) {
  const failureDir = join(evidenceDir, `failure-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`)
  await mkdir(failureDir, { recursive: true })
  await cp(projectRoot, join(failureDir, "project"), { recursive: true }).catch(() => undefined)
  await writeFile(join(failureDir, "failure.json"), `${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    goalId,
    projectRoot,
    userData,
    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
  }, null, 2)}\n`, "utf8")
  console.error(`Growth Live diagnostics preserved at ${failureDir}`)
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`ELECTRON GROWTH LIVE FAIL: ${name} is not configured`)
  return value
}
