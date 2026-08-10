import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import { GROWTH_WORLD_PRO_WORLD_LAYERS } from "../packages/creative-skills/src/growth-world-pro.ts"

const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "proFixedPartial")
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Pro 固定骨架部分验收 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-growth-world-pro-fixed-partial-"))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const instruction = `/growth_world_pro 创建一个经典、宏大、可长期扩展的原创中古剑与魔法世界。

使用固定十二层世界设定集骨架，默认全部 visible 并逐层填充。本次是文字连续运行验收：不要生成图片或 HTML，不要提前完成；先建立可恢复骨架并注册根工作台，再按冻结清单持续生成层入口和独立实体。`
const correction = "/growth_world_pro 用户修正：所有公开施展的魔法都必须消耗施术者一段可验证的真实记忆；禁止血统天赋带来无代价施法。请先把这条修正写入世界真相和创作计划，标出受影响层与下游，再继续当前清单。"
const correctionAnchor = "可验证的真实记忆"
const minimumReports = 6
const minimumCharacters = 12_000
const maximumReports = 10
const startedAt = Date.now()
let goalId = ""
let preserveFailure = false

await rm(evidenceDir, { recursive: true, force: true })
await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "测试要求.md"), `# 固定十二层部分运行验收\n\n${instruction}\n`, "utf8")

try {
  const first = await launchDesktop()
  let evidence: PartialEvidence | undefined
  try {
    await assertHealthyWindow(first.page)
    await installRuntimeTrap(first.page)
    await first.page.getByTitle("新会话").click()
    const session = await requireFreeProjectSession(first.page)
    await sendFromComposer(first.page, instruction)
    const started = await waitForGoal(first.page, (goal) => goal.status === "active", 30_000)
    goalId = started.goalId
    console.log(JSON.stringify({ stage: "started", goalId, sessionId: session.id }))

    evidence = await runUntilObservable(first.page)
    const paused = await first.page.evaluate(async (id) => window.creatx.pauseGrowth(id), goalId)
    if (!paused.ok || paused.value.status !== "paused") throw new Error(`Could not pause observable Pro run: ${JSON.stringify(paused)}`)
    const pausedHashes = await snapshotContentFiles()
    await first.page.waitForTimeout(2_000)
    await assertContentHashes(pausedHashes)
    await assertNoRuntimeErrors(first.page)
    await openRootWorkbench(first.page, evidence.workbenches)
    await first.page.screenshot({ path: join(evidenceDir, "paused.png"), timeout: 90_000 })
    console.log(JSON.stringify({ stage: "paused", reports: evidence.stageReports, characters: evidence.contentCharacters }))
  } catch (error) {
    preserveFailure = true
    await first.page.screenshot({ path: join(evidenceDir, "failure.png"), timeout: 90_000 }).catch(() => undefined)
    await preserveDiagnostics(error)
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid)
  }

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    const restored = await waitForGoal(second.page, (goal) => goal.goalId === goalId, 30_000)
    if (restored.status !== "paused") throw new Error(`Restart changed paused Goal to ${restored.status}`)
    const evidence = await collectEvidence()
    assertPartialEvidence(evidence)
    await openRootWorkbench(second.page, evidence.workbenches)
    await second.page.screenshot({ path: join(evidenceDir, "restarted.png"), timeout: 90_000 })
    await copyProjectEvidence()
    const result = {
      status: "ELECTRON GROWTH WORLD PRO FIXED PARTIAL LIVE PASS",
      provider: "JMRAI gpt-5.6-luna",
      goalId,
      goalStatus: restored.status,
      ...evidence,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      screenshots: ["paused.png", "restarted.png"],
    }
    await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
    console.log(JSON.stringify(result))
  } finally {
    await closeAndAssert(second.app, second.pid)
  }
} finally {
  if (!preserveFailure) await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

interface Goal {
  goalId: string
  status: string
  version: number
  statusReason?: string
}

interface WorkbenchRecord {
  id?: string
  title?: string
  folder?: string
}

interface PartialEvidence {
  stageReports: number
  contentCharacters: number
  markdownFiles: string[]
  workRoot: string
  layerDirectories: string[]
  entityFiles: string[]
  inferenceFiles: string[]
  workbenches: WorkbenchRecord[]
  workerSessions: number
  correctionApplied: boolean
  fixedLayersPresent: boolean
  workRoots: string[]
}

async function launchDesktop() {
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
  return { app, pid, page: await app.firstWindow() }
}

async function runUntilObservable(page: Page) {
  const timeoutMs = 30 * 60_000
  const started = Date.now()
  let steeredAtReports: number | undefined
  let lastReportCount = -1
  while (Date.now() - started < timeoutMs) {
    const goal = await waitForGoal(page, (candidate) => candidate.goalId === goalId, 10_000)
    const reports = readReceiptCount()
    if (reports !== lastReportCount) {
      const evidence = await collectEvidence()
      console.log(JSON.stringify({ stage: "progress", reports, goalStatus: goal.status, characters: evidence.contentCharacters, files: evidence.markdownFiles.length, workbenches: evidence.workbenches.length }))
      lastReportCount = reports
    }
    await assertNoRuntimeErrors(page)
    if (["failed", "cancelled", "completed", "paused", "waiting"].includes(goal.status)) {
      throw new Error(`Pro run stopped before the partial threshold: ${JSON.stringify(goal)}`)
    }
    if (reports >= 3 && steeredAtReports === undefined) {
      await sendFromComposer(page, correction)
      steeredAtReports = reports
      console.log(JSON.stringify({ stage: "steered", reports, correctionAnchor }))
    }
    const evidence = await collectEvidence()
    if (steeredAtReports !== undefined && reports > steeredAtReports && reports >= minimumReports && evidence.contentCharacters >= minimumCharacters) {
      assertPartialEvidence(evidence)
      return evidence
    }
    if (reports >= maximumReports) throw new Error(`Pro reached ${reports} reports without satisfying the bounded partial evidence`)
    await page.waitForTimeout(2_000)
  }
  throw new Error("Timed out waiting for bounded Pro evidence")
}

async function collectEvidence(): Promise<PartialEvidence> {
  const files = await listFiles(projectRoot)
  const markdown = files.filter((path) => extname(path).toLocaleLowerCase("en-US") === ".md" && basename(path) !== "测试要求.md")
  const workbenches = await readWorkbenches()
  const relativeMarkdown = markdown.map(projectRelative)
  const stable = markdown.find((path) => basename(path) === "世界骨架.md")
  const workRoot = stable ? projectRelative(stable).split("/")[0] ?? "" : ""
  const workRoots = [...new Set(markdown
    .filter((path) => ["创作计划.md", "世界真相.md", "世界导览.md", "世界骨架.md"].includes(basename(path)))
    .map((path) => projectRelative(path).split("/")[0] ?? "")
    .filter(Boolean))]
  const skeleton = stable ? await readFile(stable, "utf8") : ""
  const layerDirectories = GROWTH_WORLD_PRO_WORLD_LAYERS.filter((layer) => relativeMarkdown.some((path) => path.startsWith(`${workRoot}/${layer}/`)))
  const entityFiles = relativeMarkdown.filter((path) => GROWTH_WORLD_PRO_WORLD_LAYERS.some((layer) => path.startsWith(`${workRoot}/${layer}/`)) && basename(path) !== "索引.md")
  const documents = await Promise.all(markdown.map(async (path) => ({ path: projectRelative(path), content: await readFile(path, "utf8") })))
  const inferenceFiles = documents.filter((document) => entityFiles.includes(document.path) && document.content.includes("生成依据") && document.content.includes("推演问答")).map((document) => document.path)
  const truth = await readFile(join(projectRoot, workRoot, "世界真相.md"), "utf8").catch(() => "")
  return {
    stageReports: readReceiptCount(),
    contentCharacters: documents.filter((document) => basename(document.path) !== "创作计划.md").reduce((total, document) => total + document.content.replace(/\s/g, "").length, 0),
    markdownFiles: relativeMarkdown,
    workRoot,
    layerDirectories,
    entityFiles,
    inferenceFiles,
    workbenches,
    workerSessions: await countWorkerSessions(),
    correctionApplied: truth.includes(correctionAnchor),
    fixedLayersPresent: GROWTH_WORLD_PRO_WORLD_LAYERS.every((layer) => skeleton.includes(layer)),
    workRoots,
  }
}

function assertPartialEvidence(evidence: PartialEvidence) {
  if (evidence.stageReports < minimumReports) throw new Error(`Only ${evidence.stageReports} stage reports were committed`)
  if (evidence.contentCharacters < minimumCharacters) throw new Error(`Only ${evidence.contentCharacters} non-whitespace characters were written`)
  if (!evidence.workRoot) throw new Error("世界骨架.md does not exist")
  if (evidence.workRoots.length !== 1) throw new Error(`Expected one Pro work root, found: ${evidence.workRoots.join(", ")}`)
  const skeletonPath = join(projectRoot, evidence.workRoot, "世界骨架.md")
  if (!existsInEvidence(evidence.markdownFiles, `${evidence.workRoot}/世界骨架.md`)) throw new Error(`Missing ${skeletonPath}`)
  if (!evidence.fixedLayersPresent) throw new Error("世界骨架.md does not contain all twelve fixed layers")
  if (!evidence.layerDirectories.length) throw new Error("No fixed layer directory has begun materializing")
  if (!evidence.entityFiles.length) throw new Error("No independent layer entity exists")
  if (!evidence.inferenceFiles.length) throw new Error("No entity records both generation evidence and self-questioning")
  if (!evidence.workbenches.some((workbench) => workbench.folder === evidence.workRoot)) throw new Error("Root workbench was not registered after the skeleton")
  if (!evidence.workbenches.some((workbench) => workbench.folder?.startsWith(`${evidence.workRoot}/`))) throw new Error("No mature layer workbench was registered")
  if (evidence.workerSessions < evidence.stageReports) throw new Error(`Only ${evidence.workerSessions} disposable worker sessions exist for ${evidence.stageReports} reports`)
  if (!evidence.correctionApplied) throw new Error("User correction did not enter 世界真相.md")
}

async function requireFreeProjectSession(page: Page) {
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const session = result.value.sessions[0]
    if (session?.kind === "project" && session.permission.mode === "free") return session
    await page.waitForTimeout(250)
  }
  throw new Error("Timed out waiting for a free project session")
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.locator("textarea").fill(prompt)
  await page.locator(".composer-actions .send-button:not(.stop)").click()
}

async function waitForGoal(page: Page, predicate: (goal: Goal) => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.growth && predicate(result.value.growth)) return result.value.growth
    await page.waitForTimeout(500)
  }
  throw new Error("Timed out waiting for Growth Goal")
}

async function assertHealthyWindow(page: Page) {
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    Object.defineProperty(window, "__creatxProFixedErrors", { value: errors, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxProFixedErrors?: string[] }).__creatxProFixedErrors ?? [])
  if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
  if (await page.getByRole("dialog").count()) throw new Error("Free Growth World Pro displayed an approval dialog")
}

function readReceiptCount() {
  try {
    const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
    try {
      const row = database.prepare("SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?").get(goalId) as unknown as { count: number }
      return Number(row.count)
    } finally {
      database.close()
    }
  } catch {
    return 0
  }
}

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory).catch(() => [])
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as WorkbenchRecord))
}

function existsInEvidence(paths: string[], expected: string) {
  return paths.includes(expected)
}

async function countWorkerSessions() {
  const sessionsDirectory = join(userData, "cline", "sessions")
  const entries = await readdir(sessionsDirectory, { withFileTypes: true }).catch(() => [])
  const messageFiles = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const names = await readdir(join(sessionsDirectory, entry.name)).catch(() => [])
    return names.filter((name) => name.endsWith(".messages.json")).map((name) => join(sessionsDirectory, entry.name, name))
  }))).flat()
  return Math.max(0, messageFiles.length - 1)
}

async function openRootWorkbench(page: Page, workbenches: WorkbenchRecord[]) {
  const root = workbenches.find((workbench) => workbench.folder && !workbench.folder.includes("/"))
  if (!root) throw new Error("No root workbench for visual verification")
  const title = root.title ?? root.folder!
  await page.locator(".workbench-button", { hasText: title }).click()
  await page.locator(".files-workbench").waitFor({ timeout: 30_000 })
  await page.locator(".workbench-header strong", { hasText: title }).waitFor({ timeout: 30_000 })
}

async function snapshotContentFiles() {
  const files = (await listFiles(projectRoot)).filter((path) => !path.startsWith(join(projectRoot, ".creatx")))
  return new Map(await Promise.all(files.map(async (path) => [projectRelative(path), `${(await stat(path)).size}:${(await stat(path)).mtimeMs}`] as const)))
}

async function assertContentHashes(expected: Map<string, string>) {
  const current = await snapshotContentFiles()
  if (current.size !== expected.size) throw new Error("Files changed after Growth pause")
  for (const [path, fingerprint] of expected) if (current.get(path) !== fingerprint) throw new Error(`File changed after Growth pause: ${path}`)
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

function projectRelative(path: string) {
  return relative(projectRoot, path).replaceAll("\\", "/")
}

async function copyProjectEvidence() {
  const target = join(evidenceDir, "project")
  await rm(target, { recursive: true, force: true })
  await cp(projectRoot, target, { recursive: true })
}

async function preserveDiagnostics(error: unknown) {
  await copyProjectEvidence().catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    goalId,
    projectRoot,
    userData,
    stageReports: goalId ? readReceiptCount() : 0,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  }, null, 2)}\n`, "utf8")
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
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$needle*" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${userData}`)
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
