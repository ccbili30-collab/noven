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
const blueprintResult = JSON.parse(await readFile(resolve(repository, "artifacts", "growth-world-live", "pro-native-view-plateau-voyage-v4", "result.json"), "utf8")) as { projectRoot: string; userData: string }
const projectRoot = process.env.CREATX_MATERIALIZATION_PROJECT_ROOT?.trim() || blueprintResult.projectRoot
const userData = process.env.CREATX_MATERIALIZATION_USER_DATA?.trim() || blueprintResult.userData
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || imageBaseUrl
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || imageApiKey
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const startedAt = Date.now()

const initialGoal = queryGoal()
if (!initialGoal || (initialGoal.status !== "paused" && initialGoal.status !== "waiting")) throw new Error(`Expected one paused or waiting recoverable Goal, received ${JSON.stringify(initialGoal)}`)
const workRoot = requireFrozenBlueprint(initialGoal)
const initialMaterialization = readMaterializationOrBlueprint(workRoot)
const layerOrder = [...WORLD_BLUEPRINT_LAYERS]
const requestedLayer = process.env.CREATX_MATERIALIZATION_TARGET_LAYER?.trim()
const targetLayer = requestedLayer
  ? layerOrder.find((layer) => layer === requestedLayer)
  : layerOrder.find((layer) => initialMaterialization.objects.some((object) => object.layer === layer && object.status !== "completed"))
if (!targetLayer) throw new Error(`No valid materialization target layer remains: ${requestedLayer ?? "none"}`)
const targetLayerIndex = layerOrder.indexOf(targetLayer)
const evidenceDir = resolve(repository, "artifacts", "growth-world-live", process.env.CREATX_MATERIALIZATION_EVIDENCE_NAME?.trim() || `pro-native-view-materialization-stage-${targetLayerIndex + 4}`)
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

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  await installRuntimeTrap(page)
  const before = readMaterializationOrBlueprint(workRoot)
  const targetBefore = before.objects.filter((object) => object.layer === targetLayer)
  if (!targetBefore.length) throw new Error(`Target layer has no materialization objects: ${targetLayer}`)
  const earlierIncomplete = before.objects.find((object) => layerOrder.indexOf(object.layer) < targetLayerIndex && object.status !== "completed")
  if (earlierIncomplete) throw new Error(`Earlier layer object is incomplete: ${JSON.stringify(earlierIncomplete)}`)
  const stage = targetBefore.every((object) => object.status === "completed")
    ? { goal: initialGoal }
    : await runTargetLayer(page, initialGoal, targetLayer)
  await page.waitForTimeout(5_000)
  await assertNoRuntimeErrors(page)

  const materialization = readJson<Materialization>(join(projectRoot, workRoot, "世界蓝图", "materialization.json"))
  const targetObjects = materialization.objects.filter((object) => object.layer === targetLayer)
  if (targetObjects.some((object) => object.status !== "completed")) {
    throw new Error(`Target materialization layer is incomplete: ${JSON.stringify(targetObjects)}`)
  }
  const laterCompleted = materialization.objects.filter((object) => layerOrder.indexOf(object.layer) > targetLayerIndex && object.status === "completed")
  if (laterCompleted.length) throw new Error(`A later layer crossed the target barrier: ${JSON.stringify(laterCompleted.slice(0, 5))}`)
  const receipts = new Set(await readdir(join(projectRoot, workRoot, "世界蓝图", "物化回执")))
  const missingReceipts = targetObjects.filter((object) => !receipts.has(`${object.objectId}.json`))
  if (missingReceipts.length) throw new Error(`Target objects are missing receipts: ${JSON.stringify(missingReceipts)}`)
  const researchPackets = new Set(await readdir(join(projectRoot, workRoot, "世界蓝图", "研究包")))
  const missingResearch = targetObjects.filter((object) => !researchPackets.has(`${object.objectId}.json`))
  if (missingResearch.length) throw new Error(`Target objects are missing private research packets: ${JSON.stringify(missingResearch)}`)
  const bodyPaths = targetObjects.map((object) => object.plannedPath)
  const bodyTexts = await Promise.all(bodyPaths.map((path) => readFile(join(projectRoot, path), "utf8")))
  if (bodyTexts.some((text) => text.trim().length < 200 || text.includes("�"))) throw new Error("One or more target-layer bodies are too short or invalid UTF-8")
  const forbiddenBodyPatterns = [/卷首[^\n]{0,20}(?:问|问题)/u, /先问[一二三四五六七八九十0-9]/u, /(?:印度板块|现实喜马拉雅|本应存在|另一条世界线|现实世界)/u]
  const pollutedBody = bodyPaths.find((_path, index) => forbiddenBodyPatterns.some((pattern) => pattern.test(bodyTexts[index]!)))
  if (pollutedBody) throw new Error(`Formal body exposes private research or external creation knowledge: ${pollutedBody}`)
  const imageTasks = queryRows(imageDatabasePath, "SELECT image_task_id, relative_path, status FROM image_task ORDER BY queue_sequence") as unknown as ImageTask[]
  const targetImagePaths = new Set(bodyPaths.map((path) => `${dirname(path).replaceAll("\\", "/")}/图片/${path.split("/").at(-1)!.slice(0, -3)}.png`))
  const matchingImages = imageTasks.filter((task) => targetImagePaths.has(task.relative_path.replaceAll("\\", "/")))
  if (matchingImages.length !== targetObjects.length) throw new Error(`Expected ${targetObjects.length} target-layer image tasks, found ${matchingImages.length}`)
  const relations = readJson<{ nodes?: unknown[]; relations?: Array<{ from?: string; type?: string }> }>(join(projectRoot, workRoot, "关系", "index.json"))
  const adopts = relations.relations?.filter((edge) => edge.type === "adopts") ?? []
  const adoptedObjects = new Set(adopts.map((edge) => edge.from).filter((value): value is string => Boolean(value)))
  if (!relations.nodes?.length || targetObjects.some((object) => !adoptedObjects.has(object.objectId))) {
    throw new Error("Relationship index leaves one or more completed target-layer objects without an adopts source")
  }

  const screenshot = `stage-${targetLayerIndex + 4}-${stage.goal.status}.png`
  await page.screenshot({ path: join(evidenceDir, screenshot), timeout: 90_000 })
  await assertNoRuntimeErrors(page)
  await rm(join(evidenceDir, "project"), { recursive: true, force: true })
  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true, force: true })
  const result = {
    status: `ELECTRON GROWTH WORLD PRO STAGE ${targetLayerIndex + 4} LIVE PASS`,
    provider: "JMRAI gpt-5.6-luna",
    projectRoot,
    userData,
    goalId: stage.goal.goalId,
    goalVersion: stage.goal.version,
    goalStatus: stage.goal.status,
    workRoot,
    targetLayer,
    objectCount: targetObjects.length,
    receiptCount: targetObjects.length,
    researchPacketCount: targetObjects.length,
    bodyPaths,
    imageTasks: matchingImages,
    relationNodes: relations.nodes.length,
    adopts: adopts.length,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    screenshot,
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} catch (error) {
  await cp(projectRoot, join(evidenceDir, "failed-project"), { recursive: true, force: true }).catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), projectRoot, userData, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) }, undefined, 2)}\n`, "utf8")
  throw error
} finally {
  await closeAndAssert(app, pid)
}

interface Goal {
  goalId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  version: number
  workRootPath?: string
}

interface Materialization {
  objects: Array<{ objectId: string; layer: typeof WORLD_BLUEPRINT_LAYERS[number]; plannedPath: string; status: string }>
}

interface ImageTask {
  image_task_id: string
  relative_path: string
  status: string
}

async function resume(page: Page, goalId: string) {
  const result = await page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `materialization-resume-${Date.now()}`, goalId: id }), goalId)
  if (!result.ok) throw new Error(`Growth resume failed: ${result.error.code}: ${result.error.message}`)
}

async function armPauseAfterLayer(page: Page, goalId: string, materializedVersion: number) {
  await page.evaluate(({ id, version }) => {
    window.creatx.onEvent((event) => {
      if (event.type !== "growth.goal.changed" || event.goal.goalId !== id || event.goal.status !== "active" || event.goal.version !== version) return
      void window.creatx.pauseGrowth(id)
    })
  }, { id: goalId, version: materializedVersion })
}

async function waitForGoal(page: Page, predicate: (goal: Goal) => boolean, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  while (Date.now() < timeoutAt) {
    await assertNoRuntimeErrors(page)
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    if (result.value.growth && predicate(result.value.growth as Goal)) return result.value.growth as Goal
    if (result.value.growth && ["completed", "cancelled", "failed"].includes(result.value.growth.status)) throw new Error(`Goal reached unexpected terminal state: ${JSON.stringify(result.value.growth)}`)
    await page.waitForTimeout(250)
  }
  throw new Error("Timed out waiting for Growth stage state")
}

function requireFrozenBlueprint(goal: Goal) {
  if (!goal.workRootPath) throw new Error("Blueprint report did not persist a work root")
  const state = readJson<{ status?: string; root?: string }>(join(projectRoot, goal.workRootPath, "世界蓝图", "state.json"))
  if (state.status !== "frozen" || state.root !== goal.workRootPath) throw new Error(`Blueprint is not frozen: ${JSON.stringify(state)}`)
  return goal.workRootPath
}

async function runTargetLayer(page: Page, goal: Goal, targetLayer: string) {
  const isLastLayer = targetLayerIndex === layerOrder.length - 1
  if (!isLastLayer) await armPauseAfterLayer(page, goal.goalId, goal.version + 2)
  await resume(page, goal.goalId)
  const settled = await waitForGoal(page, (current) => isLastLayer
    ? current.status === "waiting" && current.version >= goal.version + 2
    : current.status === "paused" && current.version >= goal.version + 3, 30 * 60_000)
  const reportId = `world-materialization-layer-${targetLayerIndex + 1}`
  if (!hasProgressReport(goal.goalId, reportId)) throw new Error(`Target layer did not commit ${reportId}: ${targetLayer}`)
  return { goal: settled }
}

function queryGoal() {
  const rows = queryRows(growthDatabasePath, "SELECT goal_id, status, version, work_root_path FROM growth_goal ORDER BY created_at DESC LIMIT 1") as unknown as Array<{ goal_id: string; status: Goal["status"]; version: number; work_root_path: string | null }>
  const row = rows[0]
  return row ? { goalId: row.goal_id, status: row.status, version: row.version, ...(row.work_root_path ? { workRootPath: row.work_root_path } : {}) } : undefined
}

function hasProgressReport(goalId: string, reportId: string) {
  const rows = queryRows(growthDatabasePath, "SELECT 1 present FROM growth_report_receipt WHERE goal_id = ? AND report_id = ?", [goalId, reportId]) as unknown as Array<{ present: number }>
  return rows[0]?.present === 1
}

function queryRows(databasePath: string, sql: string, parameters?: string | string[]) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    if (Array.isArray(parameters)) return database.prepare(sql).all(...parameters)
    return parameters ? database.prepare(sql).all(parameters) : database.prepare(sql).all()
  } finally {
    database.close()
  }
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function readMaterializationOrBlueprint(root: string): Materialization {
  const path = join(projectRoot, root, "世界蓝图", "materialization.json")
  if (existsSync(path)) return readJson<Materialization>(path)
  return {
    objects: WORLD_BLUEPRINT_LAYERS.flatMap((layer) => readJson<{ objects: Array<{ id: string; plannedPath?: string }> }>(join(projectRoot, root, layer, "蓝图.json")).objects
      .filter((object): object is { id: string; plannedPath: string } => typeof object.plannedPath === "string")
      .map((object) => ({ objectId: object.id, layer, plannedPath: object.plannedPath, status: "pending" }))),
  }
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    Object.defineProperty(window, "__creatxMaterializationErrors", { value: errors, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxMaterializationErrors?: string[] }).__creatxMaterializationErrors ?? [])
  if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
  if (await page.getByRole("dialog").count()) throw new Error("Free Growth displayed an approval dialog")
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
