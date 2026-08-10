import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import {
  GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS,
  GROWTH_WORLD_PRO_WORLD_LAYERS,
  validateGrowthWorldProReviewArtifacts,
} from "../packages/creative-skills/src/growth-world-pro.ts"

const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "pro-v2-classic-medieval-review")
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Pro V2 经典中世纪蓝图项目 "))
const userData = await mkdtemp(join(tmpdir(), "CreatX Pro V2 经典中世纪蓝图用户数据 "))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const startedAt = Date.now()
const instruction = "/growth_world_pro 创建一个经典、完整、自洽、适合长期扩展的中古剑与魔法世界。采用普通读者容易理解的奇幻想象，不要用猎奇核心设定代替内容深度。先建立覆盖整个世界的 V2 蓝图，完成后等待我检查。"
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
let preserveWorkspace = false

await rm(evidenceDir, { recursive: true, force: true })
await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "测试要求.md"), `# Growth World Pro V2 经典中世纪蓝图测试\n\n${instruction}\n`, "utf8")

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
  await page.getByTitle("新会话").click()
  await requireFreeProjectSession(page)
  await sendFromComposer(page, instruction)
  const goal = await waitForGoal(page, 45 * 60_000)
  const result = await inspectBlueprint(goal)
  const webWarnings = await page.evaluate(() => (window as unknown as { __creatxBlueprintWebWarnings?: string[] }).__creatxBlueprintWebWarnings ?? [])
  const toolWarnings = await page.evaluate(() => (window as unknown as { __creatxBlueprintToolWarnings?: string[] }).__creatxBlueprintToolWarnings ?? [])
  await openLayerWorkbench(page, "国家、组织与权力")
  await page.screenshot({ path: join(evidenceDir, "blueprint-waiting.png"), timeout: 90_000 })
  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true })
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify({
    status: "ELECTRON GROWTH WORLD PRO V2 REVIEW LIVE PASS",
    provider: "gpt-5.6-luna",
    projectRoot,
    userData,
    goalId: goal.goalId,
    goalStatus: goal.status,
    goalStatusReason: goal.statusReason,
    instruction,
    webWarnings,
    toolWarnings,
    ...result,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    screenshot: "blueprint-waiting.png",
  }, null, 2)}\n`, "utf8")
  preserveWorkspace = true
  console.log(JSON.stringify({ status: "PASS", projectRoot, userData, goalId: goal.goalId, ...result }))
} catch (error) {
  preserveWorkspace = true
  await cp(projectRoot, join(evidenceDir, "failed-project"), { recursive: true }).catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    projectRoot,
    userData,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  }, null, 2)}\n`, "utf8")
  throw error
} finally {
  await closeAndAssert(app, pid)
  if (!preserveWorkspace) await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

interface Goal {
  goalId: string
  sessionId: string
  status: string
  version: number
  statusReason?: string
}

async function inspectBlueprint(goal: Goal) {
  const files = (await listFiles(projectRoot)).map(projectRelative)
  const baselinePath = files.find((path) => basename(path) === "世界基准.md")
  const sourcePath = files.find((path) => basename(path) === "资料索引.md")
  if (!baselinePath || !sourcePath) throw new Error("Blueprint omitted 世界基准.md or 资料索引.md")
  const workRoot = baselinePath.slice(0, -"/世界基准.md".length)
  if (!workRoot || sourcePath !== `${workRoot}/资料索引.md`) throw new Error("Blueprint did not use one stable work root")
  const indexPath = `${workRoot}/世界蓝图/index.json`
  const statePath = `${workRoot}/世界蓝图/state.json`
  const relationsPath = `${workRoot}/世界蓝图/relations.json`
  const layerPaths = GROWTH_WORLD_PRO_WORLD_LAYERS.map((layer) => `${workRoot}/${layer}/蓝图.json`)
  const artifactPaths = [baselinePath, sourcePath, statePath, indexPath, relationsPath, ...layerPaths]
  const missing = artifactPaths.filter((path) => !files.includes(path))
  if (missing.length) throw new Error(`Blueprint omitted required files: ${JSON.stringify(missing)}`)
  const artifacts = await Promise.all(artifactPaths.map(async (relativePath) => ({ relativePath, text: decodeUtf8(await readFile(join(projectRoot, relativePath)), relativePath) })))
  const validationError = validateGrowthWorldProReviewArtifacts(artifacts)
  if (validationError) throw new Error(`Blueprint production validation failed: ${validationError}`)
  const state = JSON.parse(decodeUtf8(await readFile(join(projectRoot, statePath)), statePath)) as {
    route: string
    status: string
    revision: number
    sources: unknown[]
    direction: { worldPremise: string; creativeDirection: string; tone: string; themes: string[]; constraints: string[]; unresolvedQuestions: string[] }
  }

  const layers = await Promise.all(layerPaths.map(async (path) => JSON.parse(decodeUtf8(await readFile(join(projectRoot, path)), path)) as { objects: Array<Record<string, unknown> & { kind: "group" | "entry" }> }))
  const externalViewTerms = ["印度板块", "现实喜马拉雅", "现实世界", "本应存在", "另一条世界线", "旧世界线"]
  const pollutedObject = layers.flatMap((layer) => layer.objects).find((object) => externalViewTerms.some((term) => `${String(object.title ?? "")}\n${String(object.locator ?? "")}`.includes(term)))
  if (pollutedObject) throw new Error(`Blueprint exposed an external creation premise as a world object: ${JSON.stringify(pollutedObject)}`)
  if (externalViewTerms.some((term) => workRoot.includes(term))) throw new Error(`Blueprint work root exposes an external creation premise: ${workRoot}`)
  const objectCounts = layers.map((layer) => layer.objects.length)
  const entryCounts = layers.map((layer) => layer.objects.filter((object) => object.kind === "entry").length)
  const groupCounts = layers.map((layer) => layer.objects.filter((object) => object.kind === "group").length)
  const objectCount = objectCounts.reduce((total, count) => total + count, 0)
  const plannedPathCount = layers.flatMap((layer) => layer.objects).filter((object) => typeof object.plannedPath === "string").length
  const relations = JSON.parse(decodeUtf8(await readFile(join(projectRoot, relationsPath)), relationsPath)) as { relations: { from: string; to: string; type: "causes"; reason: string }[] }
  const objectLayers = new Map(layers.flatMap((layer) => layer.objects).map((object) => [String(object.id), String(object.layer)]))
  const crossLayerRelations = relations.relations.filter((relation) => objectLayers.get(relation.from) !== objectLayers.get(relation.to)).length
  const workbenches = await readWorkbenches()
  const expectedWorkbenchFolders = GROWTH_WORLD_PRO_WORLD_LAYERS.map((layer) => `${workRoot}/${layer}`)
  const actualWorkbenchFolders = new Set(workbenches.map((workbench) => workbench.folder))
  const missingWorkbenches = expectedWorkbenchFolders.filter((folder) => !actualWorkbenchFolders.has(folder))
  if (missingWorkbenches.length || workbenches.length !== 12) throw new Error(`Expected exactly twelve layer workbenches: ${JSON.stringify({ missingWorkbenches, workbenches })}`)
  if (actualWorkbenchFolders.has(workRoot)) throw new Error("Blueprint incorrectly registered the work root as a thirteenth workbench")
  if (files.some((path) => path.endsWith("/关系/index.json") || /\.(?:png|jpg|jpeg|webp)$/iu.test(path))) throw new Error("Blueprint created prose-generation relations or images")
  const markdown = files.filter((path) => path.endsWith(".md") && path !== "测试要求.md")
  if (markdown.length !== 2) throw new Error(`Blueprint created unexpected Markdown prose: ${JSON.stringify(markdown)}`)
  const reports = queryCount("SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goal.goalId)
  if (reports !== 1) throw new Error(`Blueprint produced ${reports} reports instead of one`)
  const workerSessions = await countWorkerSessions(goal.sessionId)
  if (workerSessions !== 1) throw new Error(`Blueprint created ${workerSessions} hidden workers instead of one`)
  return {
    workRoot,
    route: state.route,
    blueprintStatus: state.status,
    revision: state.revision,
    sourceCount: state.sources.length,
    direction: state.direction,
    objectCounts,
    entryCounts,
    groupCounts,
    minimumObjectCounts: GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS,
    objectCount,
    plannedPathCount,
    relationCount: relations.relations.length,
    crossLayerRelations,
    workbenchCount: workbenches.length,
    reports,
    workerSessions,
    markdown,
    imageCount: 0,
  }
}

async function waitForGoal(page: Page, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  let lastVersion = -1
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const goal = result.value.growth as Goal | undefined
    if (goal && goal.version !== lastVersion) {
      console.log(JSON.stringify({ status: "PROGRESS", goalId: goal.goalId, goalStatus: goal.status, version: goal.version }))
      lastVersion = goal.version
    }
    const errors = await page.evaluate(() => (window as unknown as { __creatxBlueprintErrors?: string[] }).__creatxBlueprintErrors ?? [])
    if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
    if (goal?.status === "waiting") return goal
    if (goal && ["completed", "cancelled", "failed", "paused"].includes(goal.status)) throw new Error(`Goal stopped unexpectedly: ${JSON.stringify(goal)}`)
    await page.waitForTimeout(1_000)
  }
  throw new Error("Timed out waiting for the single blueprint Run")
}

async function requireFreeProjectSession(page: Page) {
  const timeoutAt = Date.now() + 30_000
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const session = result.value.sessions[0]
    if (session?.kind === "project" && session.permission.mode === "free") return
    await page.waitForTimeout(250)
  }
  throw new Error("Timed out waiting for a free project session")
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.locator("textarea").fill(prompt)
  await page.locator(".composer-actions .send-button:not(.stop)").click()
}

async function openLayerWorkbench(page: Page, title: string) {
  await page.locator(".workbench-button", { hasText: title }).click()
  await page.locator(".workbench-header strong", { hasText: title }).waitFor({ timeout: 30_000 })
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    const webWarnings: string[] = []
    const toolWarnings: string[] = []
    const findToolFailure = (value: unknown): string | undefined => {
      if (Array.isArray(value)) return value.map(findToolFailure).find((item) => item !== undefined)
      if (!value || typeof value !== "object") return undefined
      const record = value as Record<string, unknown>
      if (record.success === false || record.is_error === true || record.ok === false) {
        return typeof record.error === "string" ? record.error : JSON.stringify(record)
      }
      return Object.values(record).map(findToolFailure).find((item) => item !== undefined)
    }
    Object.defineProperty(window, "__creatxBlueprintErrors", { value: errors, configurable: true })
    Object.defineProperty(window, "__creatxBlueprintWebWarnings", { value: webWarnings, configurable: true })
    Object.defineProperty(window, "__creatxBlueprintToolWarnings", { value: toolWarnings, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
      if (event.type !== "timeline.upsert" || event.item.kind !== "tool" || event.item.state === "streaming") return
      if (event.item.error) {
        if (event.item.toolName === "fetch_web_content") webWarnings.push(`${event.item.toolName}: ${event.item.error}`)
        else toolWarnings.push(`${event.item.toolName}: ${event.item.error}`)
        return
      }
      const failure = findToolFailure(event.item.output)
      if (!failure) return
      if (event.item.toolName === "fetch_web_content") {
        webWarnings.push(`${event.item.toolName}: ${failure}`)
        return
      }
      toolWarnings.push(`${event.item.toolName}: ${failure}`)
    })
  })
}

interface WorkbenchRecord {
  title?: string
  folder?: string
}

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory).catch(() => [])
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(decodeUtf8(await readFile(join(directory, name)), name)) as WorkbenchRecord))
}

async function countWorkerSessions(ownerSessionId: string) {
  const directory = join(userData, "cline", "sessions")
  const entries = await readdir(directory, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory() && entry.name !== ownerSessionId).length
}

function queryCount(sql: string, parameter: string) {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return Number((database.prepare(sql).get(parameter) as unknown as { count: number }).count)
  } finally {
    database.close()
  }
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

function decodeUtf8(bytes: Uint8Array, path: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`Output is not valid UTF-8: ${path}`)
  }
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
