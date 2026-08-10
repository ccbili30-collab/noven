import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import { WORLD_BLUEPRINT_LAYERS } from "../packages/world-blueprint/src/schema.ts"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repository = resolve(workspace, "..")
const blueprintEvidence = resolve(repository, "artifacts", "growth-world-live", "pro-v2-classic-medieval-review")
const blueprintResult = JSON.parse(await readFile(join(blueprintEvidence, "result.json"), "utf8")) as { projectRoot: string; userData: string; goalId: string; workRoot: string }
const projectRoot = blueprintResult.projectRoot
const userData = blueprintResult.userData
const goalId = blueprintResult.goalId
const workRoot = blueprintResult.workRoot
const evidenceDir = resolve(repository, "artifacts", "growth-world-live", "pro-v2-classic-medieval-prose-sample")
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || imageBaseUrl
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || imageApiKey
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const startedAt = Date.now()

const initialGoal = queryGoal()
if (!initialGoal || initialGoal.goalId !== goalId || !["waiting", "paused"].includes(initialGoal.status)) throw new Error(`Expected the V2 Goal in waiting or paused, received ${JSON.stringify(initialGoal)}`)
const initialState = readJson<{ schemaVersion: number; status: string; root: string }>(join(projectRoot, workRoot, "世界蓝图", "state.json"))
if (initialState.schemaVersion !== 2 || !["review", "frozen"].includes(initialState.status) || initialState.root !== workRoot) throw new Error(`Expected a reviewable or frozen V2 blueprint, received ${JSON.stringify(initialState)}`)

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
    CREATX_IMAGE_BASE_URL: imageBaseUrl,
    CREATX_IMAGE_API_KEY: imageApiKey,
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")

let monitor: NodeJS.Timeout | undefined
try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  await installRuntimeTrap(page, goalId)
  let pauseRequested = false
  let polling = false
  monitor = setInterval(async () => {
    if (polling || pauseRequested) return
    polling = true
    try {
      const completed = completedObjects()
      if (completed >= 3) {
        pauseRequested = true
        await page.evaluate(async (id) => window.creatx.pauseGrowth(id), goalId)
      }
    } finally {
      polling = false
    }
  }, 100)

  const resumed = await page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `prose-sample-resume-${Date.now()}`, goalId: id }), goalId)
  if (!resumed.ok) throw new Error(`Growth resume failed: ${resumed.error.code}: ${resumed.error.message}`)
  const paused = await waitForGoal(page, (goal) => goal.status === "paused" && completedObjects() >= 3, 45 * 60_000)
  clearInterval(monitor)
  monitor = undefined
  await page.waitForTimeout(5_000)

  const runtimeErrors = await page.evaluate(() => (window as unknown as { __creatxProseErrors?: string[] }).__creatxProseErrors ?? [])
  if (runtimeErrors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(runtimeErrors)}`)
  const state = readJson<{ schemaVersion: number; status: string }>(join(projectRoot, workRoot, "世界蓝图", "state.json"))
  if (state.schemaVersion !== 2 || state.status !== "frozen") throw new Error(`Blueprint did not freeze before materialization: ${JSON.stringify(state)}`)
  const materialization = readMaterialization()
  const firstLayer = WORLD_BLUEPRINT_LAYERS[0]
  const completed = materialization.objects.filter((object) => object.layer === firstLayer && object.status === "completed")
  if (completed.length < 2 || completed.length > 3) throw new Error(`Expected 2-3 completed prose samples, received ${completed.length}`)
  const laterCompleted = materialization.objects.filter((object) => object.layer !== firstLayer && object.status === "completed")
  if (laterCompleted.length) throw new Error(`Materialization crossed the first-layer barrier: ${JSON.stringify(laterCompleted)}`)
  const unknownBodies = materialization.objects.filter((object) => object.status !== "completed" && existsSync(join(projectRoot, object.plannedPath)))
  if (unknownBodies.length) throw new Error(`Pause left unreceipted prose files: ${JSON.stringify(unknownBodies)}`)

  const samples = await Promise.all(completed.map(async (object) => {
    const text = await readFile(join(projectRoot, object.plannedPath), "utf8")
    if (text.trim().length < 1_000 || text.includes("�")) throw new Error(`Prose sample is too short or invalid UTF-8: ${object.plannedPath}`)
    const forbidden = [/artifactBrief/iu, /noveltyAgainstSources/iu, /sourcePaths/iu, /研究问题/u, /生成依据/u, /上游文件/u, /当前阶段/u, /任务\s*ID/iu, /卷首[^\n]{0,20}(?:问|问题)/u]
    if (forbidden.some((pattern) => pattern.test(text))) throw new Error(`Prose sample exposes research scaffolding: ${object.plannedPath}`)
    return { objectId: object.objectId, path: object.plannedPath, characters: text.replace(/\s/gu, "").length, text }
  }))
  const receipts = new Set(await readdir(join(projectRoot, workRoot, "世界蓝图", "物化回执")))
  const research = new Set(await readdir(join(projectRoot, workRoot, "世界蓝图", "研究包")))
  if (completed.some((object) => !receipts.has(`${object.objectId}.json`) || !research.has(`${object.objectId}.json`))) throw new Error("Completed prose is missing a receipt or private research packet")
  const imageTasks = queryRows(imageDatabasePath, "SELECT image_task_id, relative_path, status FROM image_task ORDER BY queue_sequence") as Array<{ image_task_id: string; relative_path: string; status: string }>
  const expectedImages = new Set(samples.map((sample) => `${dirname(sample.path).replaceAll("\\", "/")}/图片/${sample.path.split("/").at(-1)!.slice(0, -3)}.png`))
  const matchingImages = imageTasks.filter((task) => expectedImages.has(task.relative_path.replaceAll("\\", "/")))
  if (matchingImages.length !== samples.length) throw new Error(`Expected ${samples.length} image tasks, received ${matchingImages.length}`)

  await page.getByTitle(`${firstLayer}工作台`).click()
  await page.locator(".workbench-header strong", { hasText: firstLayer }).waitFor({ timeout: 30_000 })
  const firstFileName = samples[0]!.path.split("/").at(-1)!
  await page.locator(".workbench-file-list .file-row", { hasText: firstFileName }).click()
  await page.locator(".markdown-preview").waitFor({ timeout: 30_000 }).catch(() => undefined)
  await page.screenshot({ path: join(evidenceDir, "first-prose-paused.png"), timeout: 90_000 })
  await rm(join(evidenceDir, "project"), { recursive: true, force: true })
  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true })
  const toolWarnings = await page.evaluate(() => (window as unknown as { __creatxProseToolWarnings?: string[] }).__creatxProseToolWarnings ?? [])
  const result = {
    status: "ELECTRON GROWTH WORLD PRO V2 PROSE SAMPLE LIVE PASS",
    provider: "gpt-5.6-luna",
    projectRoot,
    userData,
    goalId,
    goalStatus: paused.status,
    goalVersion: paused.version,
    workRoot,
    firstLayer,
    completedCount: samples.length,
    samples: samples.map((sample) => ({ path: sample.path, characters: sample.characters })),
    imageTasks: matchingImages,
    toolWarnings,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
    screenshot: "first-prose-paused.png",
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} catch (error) {
  await cp(projectRoot, join(evidenceDir, "failed-project"), { recursive: true }).catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), projectRoot, userData, elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000) }, undefined, 2)}\n`, "utf8")
  throw error
} finally {
  if (monitor) clearInterval(monitor)
  await closeAndAssert(app, pid)
}

interface Goal {
  goalId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  statusReason?: string
  version: number
}

interface Materialization {
  objects: Array<{ objectId: string; layer: string; plannedPath: string; status: string }>
}

function completedObjects() {
  const path = join(projectRoot, workRoot, "世界蓝图", "materialization.json")
  if (!existsSync(path)) return 0
  return readJson<Materialization>(path).objects.filter((object) => object.status === "completed").length
}

function readMaterialization() {
  return readJson<Materialization>(join(projectRoot, workRoot, "世界蓝图", "materialization.json"))
}

async function waitForGoal(page: Page, predicate: (goal: Goal) => boolean, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  let lastVersion = -1
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const goal = result.value.growth as Goal | undefined
    if (goal && goal.version !== lastVersion) {
      console.log(JSON.stringify({ status: "PROGRESS", goalStatus: goal.status, version: goal.version, completedObjects: completedObjects() }))
      lastVersion = goal.version
    }
    if (goal && predicate(goal)) return goal
    if (goal?.status === "waiting") throw new Error(`Goal stopped before prose samples completed: ${goal.statusReason ?? "waiting without a reason"}`)
    if (goal && ["completed", "cancelled", "failed"].includes(goal.status)) throw new Error(`Goal reached an unexpected terminal state: ${JSON.stringify(goal)}`)
    await page.waitForTimeout(250)
  }
  throw new Error("Timed out waiting for the V2 prose sample")
}

async function installRuntimeTrap(page: Page, id: string) {
  await page.evaluate((goal) => {
    const errors: string[] = []
    const warnings: string[] = []
    let completed = 0
    let pausing = false
    const containsAction = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsAction)
      if (!value || typeof value !== "object") return false
      const record = value as Record<string, unknown>
      if (record.action === "complete_object") return true
      return Object.values(record).some(containsAction)
    }
    Object.defineProperty(window, "__creatxProseErrors", { value: errors, configurable: true })
    Object.defineProperty(window, "__creatxProseToolWarnings", { value: warnings, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
      if (event.type !== "timeline.upsert" || event.item.kind !== "tool" || event.item.state === "streaming") return
      if (event.item.error) {
        warnings.push(`${event.item.toolName}: ${event.item.error}`)
        return
      }
      if (event.item.toolName !== "complete_world_materialization_object" || !containsAction(event.item.output)) return
      completed += 1
      if (completed < 3 || pausing) return
      pausing = true
      void window.creatx.pauseGrowth(goal)
    })
  }, id)
}

function queryGoal() {
  const rows = queryRows(growthDatabasePath, "SELECT goal_id, status, version FROM growth_goal ORDER BY created_at DESC LIMIT 1") as Array<{ goal_id: string; status: Goal["status"]; version: number }>
  const row = rows[0]
  return row ? { goalId: row.goal_id, status: row.status, version: row.version } : undefined
}

function queryRows(databasePath: string, sql: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return database.prepare(sql).all() as unknown[]
  } finally {
    database.close()
  }
}

function readJson<T>(path: string) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))) as T
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
