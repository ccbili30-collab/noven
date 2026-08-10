import { execFile } from "node:child_process"
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type Page } from "@playwright/test"

const projectRoot = resolve(requireEnvironment("CREATX_RECOVERY_PROJECT_ROOT"))
const userData = resolve(requireEnvironment("CREATX_RECOVERY_USER_DATA"))
const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "proImagePerFile")
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const correction = `继续当前 Growth World Pro 实验，并以这条最新要求取代旧测试中的“不要生成图片”：从现在起，每完成一份新的正式正文文件，就根据正文真实内容调用 submit_image_generation 提交一张配图，输出到正文同目录的 图片/<正文文件名>.png，把任务 ID 同时写进阶段回执的 imageTaskIds 和 requiredImageTaskIds。提交后不要等待图片完成，继续冻结清单的下一份正文。不要追溯补画恢复前已有文件。`
const beforeFiles = await snapshotMarkdown()
const beforeTasks = readImageTasks()
const beforeReports = readReceiptCount()
const startedAt = Date.now()

await mkdir(evidenceDir, { recursive: true })
const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...inheritedEnvironment,
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    CREATX_PROVIDER_ID: "openai-compatible",
    CREATX_MODEL_ID: "gpt-5.6-luna",
    CREATX_PROVIDER_BASE_URL: providerBaseUrl,
    CREATX_PROVIDER_API_KEY: providerApiKey,
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  await installRuntimeTrap(page)
  const bootstrap = await page.evaluate(async () => window.creatx.bootstrap())
  if (!bootstrap.ok || !bootstrap.value.growth) throw new Error("Paused Growth Goal is unavailable")
  if (bootstrap.value.growth.status !== "paused") throw new Error(`Expected paused Goal, found ${bootstrap.value.growth.status}`)
  const goalId = bootstrap.value.growth.goalId
  const resumed = await page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `image-per-file-resume-${Date.now()}`, goalId: id }), goalId)
  if (!resumed.ok) throw new Error(`Could not resume Goal: ${resumed.error.message}`)
  await sendFromComposer(page, correction)

  const evidence = await waitForEvidence(page, goalId)
  const paused = await page.evaluate(async (id) => window.creatx.pauseGrowth(id), goalId)
  if (!paused.ok || paused.value.status !== "paused") throw new Error(`Could not pause resumed Goal: ${JSON.stringify(paused)}`)
  await waitForSettledImages(5 * 60_000)
  await assertNoRuntimeErrors(page)

  const tasks = readImageTasks().filter((task) => !beforeTasks.some((before) => before.imageTaskId === task.imageTaskId))
  await assertImagePlacement(tasks, evidence.newContentFiles)
  const finalGoal = await page.evaluate(async (projectId) => window.creatx.readGrowthGoal(projectId), bootstrap.value.project!.id)
  if (!finalGoal.ok || finalGoal.value?.status !== "paused") throw new Error("Goal did not remain paused after image verification")
  await page.screenshot({ path: join(evidenceDir, "paused-with-images.png"), timeout: 90_000 })

  const result = {
    status: "ELECTRON GROWTH WORLD PRO IMAGE PER FILE LIVE PASS",
    provider: "JMRAI gpt-5.6-luna + image queue",
    goalId,
    goalStatus: finalGoal.value.status,
    reportsBefore: beforeReports,
    reportsAfter: readReceiptCount(),
    newContentFiles: evidence.newContentFiles,
    imageTasks: tasks,
    succeededImageFiles: tasks.filter((task) => task.status === "succeeded").map((task) => task.relativePath),
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    screenshot: "paused-with-images.png",
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} finally {
  await closeAndAssert(pid)
}

interface ImageTaskRow {
  imageTaskId: string
  idempotencyKey: string
  relativePath: string
  status: "queued" | "generating" | "succeeded" | "failed" | "interrupted"
  createdAt: string
  completedAt?: string
}

async function waitForEvidence(page: Page, goalId: string) {
  const timeoutAt = Date.now() + 30 * 60_000
  let lastFingerprint = ""
  while (Date.now() < timeoutAt) {
    await assertNoRuntimeErrors(page)
    const goal = await page.evaluate(async (projectId) => window.creatx.readGrowthGoal(projectId), (await requireProjectId(page)))
    if (!goal.ok || !goal.value || goal.value.goalId !== goalId) throw new Error("Growth Goal disappeared while resuming")
    if (["failed", "cancelled", "completed", "waiting"].includes(goal.value.status)) throw new Error(`Goal stopped before image evidence: ${JSON.stringify(goal.value)}`)
    const currentFiles = await snapshotMarkdown()
    const newContentFiles = [...currentFiles.keys()].filter((path) => !beforeFiles.has(path) && isFormalContent(path))
    const tasks = readImageTasks().filter((task) => !beforeTasks.some((before) => before.imageTaskId === task.imageTaskId))
    const fingerprint = `${readReceiptCount()}:${newContentFiles.length}:${tasks.length}:${tasks.map((task) => task.status).join(",")}`
    if (fingerprint !== lastFingerprint) {
      console.log(JSON.stringify({ stage: "progress", fingerprint, newContentFiles, imagePaths: tasks.map((task) => task.relativePath) }))
      lastFingerprint = fingerprint
    }
    if (readReceiptCount() > beforeReports && newContentFiles.length >= 2 && tasks.length >= 2) return { newContentFiles }
    await page.waitForTimeout(2_000)
  }
  throw new Error("Timed out waiting for two new content files and image tasks")
}

async function waitForSettledImages(timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  while (Date.now() < timeoutAt) {
    const tasks = readImageTasks().filter((task) => !beforeTasks.some((before) => before.imageTaskId === task.imageTaskId))
    if (tasks.length && tasks.every((task) => task.status === "succeeded" || task.status === "failed" || task.status === "interrupted")) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
}

async function assertImagePlacement(tasks: ImageTaskRow[], newContentFiles: string[]) {
  if (tasks.length < 2) throw new Error(`Only ${tasks.length} new image tasks were submitted`)
  if (new Set(tasks.map((task) => task.idempotencyKey)).size !== tasks.length) throw new Error("Image tasks did not use distinct idempotency keys")
  const expected = new Set(newContentFiles.map((path) => normalizeRelative(join(dirname(path), "图片", `${basename(path, extname(path))}.png`))))
  for (const task of tasks) {
    if (!expected.has(normalizeRelative(task.relativePath))) throw new Error(`Image task is not adjacent to a new content file: ${task.relativePath}`)
    if (task.status === "succeeded") await access(join(projectRoot, task.relativePath))
  }
}

async function snapshotMarkdown() {
  const files = (await listFiles(projectRoot)).filter((path) => extname(path).toLocaleLowerCase("en-US") === ".md" && !relative(projectRoot, path).startsWith(".creatx"))
  return new Map(await Promise.all(files.map(async (path) => [normalizeRelative(relative(projectRoot, path)), `${(await stat(path)).size}:${(await stat(path)).mtimeMs}`] as const)))
}

function isFormalContent(path: string) {
  const excluded = new Set(["测试要求.md", "创作计划.md", "世界真相.md", "世界导览.md", "世界骨架.md", "关系索引.md", "索引.md"])
  return !excluded.has(basename(path)) && !path.includes("/研究/")
}

function readImageTasks(): ImageTaskRow[] {
  const database = new DatabaseSync(imageDatabasePath, { readOnly: true })
  try {
    return (database.prepare(`
      SELECT image_task_id, idempotency_key, relative_path, status, created_at, completed_at
      FROM image_task ORDER BY queue_sequence
    `).all() as unknown as Array<Record<string, unknown>>).map((row) => ({
      imageTaskId: String(row.image_task_id),
      idempotencyKey: String(row.idempotency_key),
      relativePath: String(row.relative_path),
      status: row.status as ImageTaskRow["status"],
      createdAt: String(row.created_at),
      ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
    }))
  } finally {
    database.close()
  }
}

function readReceiptCount() {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    const row = database.prepare("SELECT COUNT(*) AS count FROM growth_report_receipt").get() as unknown as { count: number }
    return Number(row.count)
  } finally {
    database.close()
  }
}

async function requireProjectId(page: Page) {
  const bootstrap = await page.evaluate(async () => window.creatx.bootstrap())
  if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Project is unavailable")
  return bootstrap.value.project.id
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.locator("textarea").fill(prompt)
  await page.locator(".composer-actions .send-button:not(.stop)").click()
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    Object.defineProperty(window, "__creatxProImageErrors", { value: errors, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxProImageErrors?: string[] }).__creatxProImageErrors ?? [])
  if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
  if (await page.getByRole("dialog").count()) throw new Error("Free Growth World Pro displayed an approval dialog")
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

async function closeAndAssert(pid: number) {
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
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$needle*" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${userData}`)
}

function normalizeRelative(path: string) {
  return path.replaceAll("\\", "/")
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
