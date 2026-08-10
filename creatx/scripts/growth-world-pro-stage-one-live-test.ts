import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "proTenStageOne")
const projectRoot = process.env.CREATX_STAGE_ONE_PROJECT_ROOT?.trim() || await mkdtemp(join(tmpdir(), "CreatX Pro 三阶段项目 "))
const userData = process.env.CREATX_STAGE_ONE_USER_DATA?.trim() || await mkdtemp(join(tmpdir(), "CreatX Pro 三阶段用户数据 "))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || imageBaseUrl
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || imageApiKey
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const startedAt = Date.now()
const observe = process.argv.includes("--observe")
const continueStageTwo = process.argv.includes("--continue-stage-two")
const continueStageThree = process.argv.includes("--continue-stage-three")
const recoverStageThree = process.argv.includes("--recover-stage-three")
let observationStarted = false

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
  const bootstrap = await page.evaluate(async () => window.creatx.bootstrap())
  if (!bootstrap.ok) throw new Error(bootstrap.error.message)
  const restored = bootstrap.value.growth as Goal | undefined
  const stageOneGoal = restored?.status === "waiting"
    ? restored
    : await startStageOne(page)
  const goal = continueStageThree
    ? await continueToStageThree(page, stageOneGoal)
    : continueStageTwo
      ? await continueToStageTwo(page, stageOneGoal)
      : stageOneGoal
  await page.waitForTimeout(2_000)
  await assertNoRuntimeErrors(page)

  const result = continueStageThree
    ? await inspectBlueprint(goal.goalId, goal.sessionId)
    : continueStageTwo
      ? await inspectStageTwo(goal.goalId, goal.sessionId)
      : await inspectStageOne(goal.goalId, goal.sessionId)
  const stage = continueStageThree ? "stage-three" : continueStageTwo ? "stage-two" : "stage-one"
  await page.screenshot({ path: join(evidenceDir, `${stage}-waiting.png`), timeout: 90_000 })
  await rm(join(evidenceDir, "project"), { recursive: true, force: true })
  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true, force: true })
  await writeFile(join(evidenceDir, continueStageThree ? "stage-three-result.json" : continueStageTwo ? "stage-two-result.json" : "result.json"), `${JSON.stringify({
    status: `ELECTRON GROWTH WORLD PRO ${continueStageThree ? "STAGE THREE" : continueStageTwo ? "STAGE TWO" : "STAGE ONE"} LIVE PASS`,
    provider: "JMRAI gpt-5.6-luna",
    projectRoot,
    userData,
    goalId: goal.goalId,
    goalStatus: goal.status,
    goalStatusReason: goal.statusReason,
    ...result,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    screenshot: `${stage}-waiting.png`,
  }, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ status: "PASS", projectRoot, userData, goalId: goal.goalId, ...result }))
  if (observe) {
    observationStarted = true
    console.log(JSON.stringify({ status: "OBSERVING", message: "Electron will remain open until the user closes the window." }))
    await new Promise<void>((resolveClose) => app.once("close", resolveClose))
  }
} catch (error) {
  await preserveFailure(error)
  throw error
} finally {
  if (!observationStarted) await closeAndAssert(app, pid)
}

interface Goal {
  goalId: string
  sessionId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  version: number
  statusReason?: string
}

async function startStageOne(page: Page) {
  await page.getByTitle("新会话").click()
  await requireFreeProjectSession(page)
  await sendFromComposer(page, "/growth_world_pro 创建一个经典、完整、自洽、适合长期扩展的中古剑与魔法世界。先建立覆盖整个世界的丰富蓝图，不要用猎奇设定代替经典题材深度。")
  return waitForGoal(page, (current) => current.status === "waiting", 15 * 60_000)
}

async function continueToStageTwo(page: Page, goal: Goal) {
  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goal.goalId)
  if (reports === 2) return goal
  if (reports !== 1) throw new Error(`Cannot enter stage two from ${reports} committed reports`)
  await inspectStageOne(goal.goalId, goal.sessionId)
  const resumed = await page.evaluate(async (goalId) => window.creatx.resumeGrowth({ requestId: `stage-one-resume-${Date.now()}`, goalId }), goal.goalId)
  if (!resumed.ok) throw new Error(`Stage two resume failed: ${resumed.error.code}: ${resumed.error.message}`)
  return waitForGoal(page, (current) => current.goalId === goal.goalId && current.status === "waiting" && current.version > goal.version, 15 * 60_000)
}

async function continueToStageThree(page: Page, goal: Goal) {
  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goal.goalId)
  const stageTwoGoal = reports === 1 ? await continueToStageTwo(page, goal) : goal
  const stageTwoReports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goal.goalId)
  if (stageTwoReports === 14) return stageTwoGoal
  if (stageTwoReports !== 2) throw new Error(`Cannot enter stage three from ${stageTwoReports} committed reports`)
  if (!recoverStageThree) await inspectStageTwo(goal.goalId, goal.sessionId)
  const resumed = await page.evaluate(async (goalId) => window.creatx.resumeGrowth({ requestId: `stage-two-resume-${Date.now()}`, goalId }), goal.goalId)
  if (!resumed.ok) throw new Error(`Stage three resume failed: ${resumed.error.code}: ${resumed.error.message}`)
  return waitForGoal(page, (current) => current.goalId === goal.goalId && current.status === "waiting" && queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goal.goalId) === 14, 60 * 60_000)
}

async function inspectStageOne(goalId: string, ownerSessionId: string) {
  const files = (await listFiles(projectRoot)).map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  const markdown = files.filter((path) => path.endsWith(".md"))
  if (markdown.length !== 2) throw new Error(`Stage one created ${markdown.length} Markdown files instead of two: ${JSON.stringify(markdown)}`)
  const planPath = markdown.find((path) => basename(path) === "创作计划.md")
  const truthPath = markdown.find((path) => basename(path) === "世界真相.md")
  if (!planPath || !truthPath) throw new Error(`Stage one files are incorrect: ${JSON.stringify(markdown)}`)
  if (dirname(planPath) !== dirname(truthPath) || dirname(planPath) === ".") throw new Error("Stage one did not use one non-root work directory")

  const plan = decodeUtf8(await readFile(join(projectRoot, planPath)), planPath)
  const truth = decodeUtf8(await readFile(join(projectRoot, truthPath)), truthPath)
  const layers = [
    "核心规则与边界",
    "宇宙、自然与地理",
    "生态、资源与物种",
    "经济、技术与力量体系",
    "社会、文化与日常生活",
    "国家、组织与权力",
    "历史、时代与重大事件",
    "地区、城市与重要地点",
    "当前局势与核心冲突",
    "人物、关系与阵营",
    "故事、传说与叙事入口",
    "视觉、地图与关系索引",
  ]
  const missingLayers = layers.filter((layer) => !plan.includes(layer))
  if (missingLayers.length) throw new Error(`Plan omitted fixed layers: ${JSON.stringify(missingLayers)}`)
  if (!/四个?用户阶段|4\s*个?用户阶段/u.test(plan) || !/十二个?(?:蓝图|内部)步骤|12\s*个?(?:蓝图|内部)步骤/u.test(plan)) throw new Error("Plan does not record four user stages and twelve blueprint steps")
  const completionRecord = plan.match(/## [^\n]*完成记录([\s\S]*?)(?:\n## (?!#)|$)/u)?.[1] ?? ""
  if (/等待[^\n]{0,20}(?:建立|创建)[^\n]{0,10}世界真相/u.test(completionRecord)) throw new Error("Plan still claims that the existing 世界真相.md is pending")
  if (!completionRecord.includes("已完成") || !completionRecord.includes("世界真相") || !completionRecord.includes("创作计划")) {
    throw new Error("Plan does not record both stage-one files as completed")
  }
  if (plan.includes("�") || truth.includes("�")) throw new Error("Stage one output contains Unicode replacement characters")
  if (files.some((path) => path.startsWith(".creatx/"))) throw new Error("Stage one registered a workbench before the skeleton")

  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goalId)
  if (reports !== 1) throw new Error(`Stage one produced ${reports} progress receipts instead of one`)
  const persistedRoot = String((queryRows(growthDatabasePath, "SELECT work_root_path FROM growth_goal WHERE goal_id = ?", goalId)[0] as { work_root_path?: string | null }).work_root_path ?? "")
  if (persistedRoot !== dirname(planPath).replaceAll("\\", "/")) throw new Error(`Stage one persisted work root ${persistedRoot || "<missing>"} instead of ${dirname(planPath)}`)
  const imageTasks = queryCount(imageDatabasePath, "SELECT COUNT(*) AS count FROM image_task")
  if (imageTasks !== 0) throw new Error(`Stage one submitted ${imageTasks} image tasks`)
  const workerSessions = await countWorkerSessions(ownerSessionId)
  if (workerSessions !== 1) throw new Error(`Stage one created ${workerSessions} hidden workers instead of one`)
  return { workRoot: dirname(planPath), persistedRoot, markdown, reports, imageTasks, workerSessions, utf8: true, layerCount: layers.length, stageCount: 4, stageThreeSteps: 12 }
}

async function inspectStageTwo(goalId: string, ownerSessionId: string) {
  const files = (await listFiles(projectRoot)).map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  const markdown = files.filter((path) => path.endsWith(".md"))
  if (markdown.length !== 4) throw new Error(`Stage two has ${markdown.length} Markdown files instead of four: ${JSON.stringify(markdown)}`)
  const expectedNames = ["世界真相.md", "创作计划.md", "世界导览.md", "世界骨架.md"]
  const paths = expectedNames.map((name) => markdown.find((path) => basename(path) === name))
  if (paths.some((path) => !path)) throw new Error(`Stage two entry files are incorrect: ${JSON.stringify(markdown)}`)
  const roots = new Set(paths.map((path) => dirname(path!)))
  if (roots.size !== 1 || roots.has(".")) throw new Error(`Stage two entry files do not share one work root: ${JSON.stringify([...roots])}`)
  const workRoot = [...roots][0]!
  const documents = await Promise.all(paths.map(async (path) => decodeUtf8(await readFile(join(projectRoot, path!)), path!)))
  const plan = documents[1]!
  const skeleton = documents[3]!
  const layers = [
    "核心规则与边界",
    "宇宙、自然与地理",
    "生态、资源与物种",
    "经济、技术与力量体系",
    "社会、文化与日常生活",
    "国家、组织与权力",
    "历史、时代与重大事件",
    "地区、城市与重要地点",
    "当前局势与核心冲突",
    "人物、关系与阵营",
    "故事、传说与叙事入口",
    "视觉、地图与关系索引",
  ]
  const missingLayers = layers.filter((layer) => !plan.includes(layer) || !skeleton.includes(layer))
  if (missingLayers.length) throw new Error(`Stage two omitted fixed layers: ${JSON.stringify(missingLayers)}`)
  if (documents.some((document) => document.includes("�"))) throw new Error("Stage two output contains Unicode replacement characters")
  const workbenches = await readWorkbenches()
  const rootWorkbench = workbenches.find((workbench) => workbench.folder === workRoot)
  if (!rootWorkbench) throw new Error(`Stage two did not register the unified work root: ${workRoot}`)
  if (workbenches.length !== 1) throw new Error(`Stage two registered ${workbenches.length} workbenches instead of one: ${JSON.stringify(workbenches)}`)
  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goalId)
  if (reports !== 2) throw new Error(`Stage two produced ${reports} total progress receipts instead of two`)
  const imageTasks = queryCount(imageDatabasePath, "SELECT COUNT(*) AS count FROM image_task")
  if (imageTasks !== 0) throw new Error(`Stage two submitted ${imageTasks} image tasks`)
  const workerSessions = await countWorkerSessions(ownerSessionId)
  if (workerSessions !== 2) throw new Error(`Stage two has ${workerSessions} hidden workers instead of two`)
  return { workRoot, markdown, reports, imageTasks, workerSessions, workbenches: workbenches.length, utf8: true, layerCount: layers.length, stageCount: 4, stageThreeSteps: 12 }
}

async function inspectStageThree(goalId: string, ownerSessionId: string) {
  const files = (await listFiles(projectRoot)).map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  const markdown = files.filter((path) => path.endsWith(".md"))
  const entryNames = ["世界真相.md", "创作计划.md", "世界导览.md", "世界骨架.md"]
  const entryPaths = entryNames.map((name) => markdown.find((path) => basename(path) === name))
  if (entryPaths.some((path) => !path)) throw new Error(`Stage three lost an entry file: ${JSON.stringify(markdown)}`)
  const roots = new Set(entryPaths.map((path) => dirname(path!)))
  if (roots.size !== 1 || roots.has(".")) throw new Error(`Stage three entry files do not share one work root: ${JSON.stringify([...roots])}`)
  const workRoot = [...roots][0]!
  const layerNames = ["核心规则与边界", "宇宙、自然与地理"]
  const layerIndexes = layerNames.map((layer) => `${workRoot}/${layer}/索引.md`)
  const missingIndexes = layerIndexes.filter((path) => !markdown.includes(path))
  if (missingIndexes.length) throw new Error(`Stage three omitted layer indexes: ${JSON.stringify(missingIndexes)}`)
  const relationPath = `${workRoot}/关系/index.json`
  if (!files.includes(relationPath)) throw new Error("Stage three did not create 关系/index.json")
  const bodies = layerNames.flatMap((layer) => markdown.filter((path) => path.startsWith(`${workRoot}/${layer}/`) && basename(path) !== "索引.md"))
  if (bodies.length !== 2) throw new Error(`Stage three created ${bodies.length} formal bodies instead of two: ${JSON.stringify(bodies)}`)
  for (const layer of layerNames) {
    if (!bodies.some((path) => path.startsWith(`${workRoot}/${layer}/`))) throw new Error(`Stage three did not create a formal body for ${layer}`)
  }
  if (markdown.length !== 8) throw new Error(`Stage three has ${markdown.length} Markdown files instead of eight: ${JSON.stringify(markdown)}`)

  const bodyDocuments = await Promise.all(bodies.map(async (path) => decodeUtf8(await readFile(join(projectRoot, path)), path)))
  const forbiddenTerms = ["生成依据", "推演问答", "上游文件", "关系邻接", "文件束", "任务 ID", "当前阶段", "文体：书信"]
  for (const [index, document] of bodyDocuments.entries()) {
    const leaked = forbiddenTerms.filter((term) => document.includes(term))
    if (leaked.length) throw new Error(`Reader body ${bodies[index]} leaked production terms: ${JSON.stringify(leaked)}`)
    if (document.includes("�")) throw new Error(`Reader body ${bodies[index]} contains Unicode replacement characters`)
  }
  const geographyBodyIndex = bodies.findIndex((path) => path.startsWith(`${workRoot}/宇宙、自然与地理/`))
  const geographyBody = bodyDocuments[geographyBodyIndex]!
  if (!/(?:编纂|撰写|著|记述|记录者|地理师|制图师|旅人|学者|修士|署名)/u.test(geographyBody)) {
    throw new Error(`Geography body does not expose a world-internal narrator or compiler: ${bodies[geographyBodyIndex]}`)
  }

  const relation = JSON.parse(decodeUtf8(await readFile(join(projectRoot, relationPath)), relationPath)) as {
    schemaVersion?: number
    nodes?: { id?: string; layer?: number; title?: string; path?: string; sourcePath?: string }[]
    relations?: { from?: string; to?: string; type?: string; note?: string; reason?: string }[]
  }
  if (relation.schemaVersion !== 1 || !Array.isArray(relation.nodes) || !Array.isArray(relation.relations)) {
    throw new Error("Stage three relationship index does not use schemaVersion 1 nodes and relations")
  }
  const nodeById = new Map(relation.nodes.map((node) => [node.id, node]))
  const nodePath = (node: { path?: string; sourcePath?: string }) => node.path ?? node.sourcePath
  const geographyNode = relation.nodes.find((node) => node.layer === 2 && nodePath(node) === bodies[geographyBodyIndex])
  const ruleNode = relation.nodes.find((node) => node.layer === 1 && bodies.includes(nodePath(node) ?? ""))
  const foundationNode = relation.nodes.find((node) => node.layer === 0 && nodePath(node) === `${workRoot}/世界真相.md`)
  if (!geographyNode?.id || !ruleNode?.id || !foundationNode?.id) throw new Error("Stage three relationship index omitted foundation, rule, or geography nodes")
  const geographyRelations = relation.relations.filter((edge) => edge.from === geographyNode.id && edge.type === "adopts")
  const geographyTargets = new Set(geographyRelations.map((edge) => nodeById.get(edge.to)?.layer))
  if (!geographyTargets.has(0) || !geographyTargets.has(1)) throw new Error("Stage three geography did not adopt both world truth and layer-one rules")
  for (const edge of geographyRelations) {
    const note = edge.note ?? edge.reason
    if (!note || note.trim().length < 8) throw new Error(`Stage three contains an unexplained relationship: ${JSON.stringify(edge)}`)
    const target = nodeById.get(edge.to)
    if (!target || !files.includes(nodePath(target) ?? "")) throw new Error(`Stage three relationship references an unverified target node: ${JSON.stringify(edge)}`)
  }

  const planPath = entryPaths[1]!
  const plan = decodeUtf8(await readFile(join(projectRoot, planPath)), planPath)
  if (!/第\s*2\s*阶段[^\n]*(?:已完成|完成)/u.test(plan)) throw new Error("Stage three did not repair the stale stage-two completion record")
  if (/当前阶段[^\n]*第\s*1\s*\/\s*3/u.test(plan)) throw new Error("Stage three left the plan at stage one")
  if (/第\s*2\s*阶段[^\n]*未开始/u.test(plan)) throw new Error("Stage three still claims stage two has not started")
  const imageTasks = queryRows(imageDatabasePath, "SELECT image_task_id, relative_path, status FROM image_task ORDER BY created_at") as { image_task_id: string; relative_path: string; status: string }[]
  if (imageTasks.length !== 2) throw new Error(`Stage three submitted ${imageTasks.length} image tasks instead of two`)
  const expectedImagePaths = bodies.map((path) => `${dirname(path)}/图片/${basename(path, ".md")}.png`)
  const actualImagePaths = imageTasks.map((task) => task.relative_path.replaceAll("\\", "/"))
  const missingImagePaths = expectedImagePaths.filter((path) => !actualImagePaths.includes(path))
  if (missingImagePaths.length) throw new Error(`Stage three image tasks target unexpected paths: ${JSON.stringify({ expectedImagePaths, actualImagePaths })}`)
  const requiredImageTaskIds = JSON.parse(String((queryRows(growthDatabasePath, "SELECT required_image_task_ids FROM growth_goal WHERE goal_id = ?", goalId)[0] as { required_image_task_ids: string }).required_image_task_ids)) as string[]
  const missingRequiredTasks = imageTasks.filter((task) => !requiredImageTaskIds.includes(task.image_task_id))
  if (missingRequiredTasks.length) throw new Error(`Stage three did not attach all image tasks to the Goal: ${JSON.stringify(missingRequiredTasks)}`)
  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goalId)
  if (reports !== 3) throw new Error(`Stage three produced ${reports} total progress receipts instead of three`)
  const workerSessions = await countWorkerSessions(ownerSessionId)
  if (recoverStageThree ? workerSessions < 3 : workerSessions !== 3) throw new Error(`Stage three has an unexpected hidden Worker count: ${workerSessions}`)
  return { workRoot, markdown, bodies, relationPath, relationNodes: relation.nodes.length, relationEdges: relation.relations.length, reports, imageTasks, requiredImageTaskIds, workerSessions, utf8: true, stageCount: 3, stageThreeSteps: 12, completedInternalSteps: 2 }
}

async function inspectBlueprint(goalId: string, ownerSessionId: string) {
  const files = (await listFiles(projectRoot)).map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  const markdown = files.filter((path) => path.endsWith(".md"))
  const entryNames = ["世界真相.md", "创作计划.md", "世界导览.md", "世界骨架.md"]
  const entryPaths = entryNames.map((name) => markdown.find((path) => basename(path) === name))
  if (entryPaths.some((path) => !path) || markdown.length !== 4) throw new Error(`Blueprint stage must keep exactly four entry Markdown files: ${JSON.stringify(markdown)}`)
  const workRoot = dirname(entryPaths[0]!)
  const layers = ["核心规则与边界", "宇宙、自然与地理", "生态、资源与物种", "经济、技术与力量体系", "社会、文化与日常生活", "国家、组织与权力", "历史、时代与重大事件", "地区、城市与重要地点", "当前局势与核心冲突", "人物、关系与阵营", "故事、传说与叙事入口", "视觉、地图与关系索引"]
  const indexPath = `${workRoot}/世界蓝图/index.json`
  const layerPaths = layers.map((layer) => `${workRoot}/世界蓝图/${layer}.json`)
  const missing = [indexPath, ...layerPaths].filter((path) => !files.includes(path))
  if (missing.length) throw new Error(`Blueprint omitted required JSON files: ${JSON.stringify(missing)}`)
  if (files.includes(`${workRoot}/世界蓝图/relations.json`) || files.includes(`${workRoot}/关系/index.json`)) throw new Error("Blueprint guessed semantic or generation relations before prose")
  const objects = (await Promise.all(layerPaths.map(async (path, layerIndex) => {
    const parsed = JSON.parse(decodeUtf8(await readFile(join(projectRoot, path)), path)) as { schemaVersion?: number; layer?: string; objects?: Record<string, unknown>[] }
    if (parsed.schemaVersion !== 1 || parsed.layer !== layers[layerIndex] || !Array.isArray(parsed.objects)) throw new Error(`Invalid blueprint layer: ${path}`)
    return parsed.objects
  }))).flat()
  if (objects.length < 100 || objects.length > 200) throw new Error(`Blueprint has ${objects.length} objects instead of 100-200`)
  const ids = new Set(objects.map((object) => String(object.id ?? "")))
  if (ids.size !== objects.length || ids.has("")) throw new Error("Blueprint object IDs are empty or duplicated")
  const plannedPaths = new Set(objects.flatMap((object) => typeof object.plannedPath === "string" ? [object.plannedPath.replaceAll("\\", "/")] : []))
  if (plannedPaths.size < 80 || plannedPaths.size > 150) throw new Error(`Blueprint has ${plannedPaths.size} planned paths instead of 80-150`)
  const parentLinks = objects.flatMap((object) => typeof object.parentId === "string" && object.parentId ? [{ from: String(object.id), to: object.parentId }] : [])
  const unknownParent = parentLinks.find((link) => !ids.has(link.to))
  if (unknownParent) throw new Error(`Blueprint references unknown parent: ${JSON.stringify(unknownParent)}`)
  const guessed = objects.find((object) => "dependsOn" in object || "adopts" in object || "relations" in object)
  if (guessed) throw new Error(`Blueprint guessed a generation relationship: ${JSON.stringify(guessed)}`)
  const invalidStatus = objects.find((object) => object.status !== "planned" || !Number.isInteger(object.order) || typeof object.locator !== "string" || !object.locator)
  if (invalidStatus) throw new Error(`Blueprint object lacks planned status or order: ${JSON.stringify(invalidStatus)}`)
  const reports = queryCount(growthDatabasePath, "SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?", goalId)
  if (reports !== 14) throw new Error(`Blueprint produced ${reports} reports instead of 14`)
  const imageTasks = queryCount(imageDatabasePath, "SELECT COUNT(*) AS count FROM image_task")
  if (imageTasks !== 0) throw new Error(`Blueprint submitted ${imageTasks} image tasks before prose`)
  const workerSessions = await countWorkerSessions(ownerSessionId)
  if (workerSessions !== 14) throw new Error(`Blueprint has ${workerSessions} hidden workers instead of 14`)
  return { workRoot, markdown, blueprintFiles: [indexPath, ...layerPaths], objectCount: objects.length, plannedPathCount: plannedPaths.size, parentLinkCount: parentLinks.length, layerMembershipCount: objects.length, reports, imageTasks, workerSessions, utf8: true, stageCount: 4, blueprintSteps: 12 }
}

interface WorkbenchRecord {
  id?: string
  title?: string
  folder?: string
}

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory).catch(() => [])
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(decodeUtf8(await readFile(join(directory, name)), name)) as WorkbenchRecord))
}

function decodeUtf8(bytes: Uint8Array, path: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`Output is not valid UTF-8: ${path}`)
  }
}

function queryCount(databasePath: string, sql: string, parameter?: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const row = (parameter ? database.prepare(sql).get(parameter) : database.prepare(sql).get()) as unknown as { count: number }
    return Number(row.count)
  } finally {
    database.close()
  }
}

function queryRows(databasePath: string, sql: string, parameter?: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return parameter ? database.prepare(sql).all(parameter) : database.prepare(sql).all()
  } finally {
    database.close()
  }
}

async function countWorkerSessions(ownerSessionId: string) {
  const sessionsDirectory = join(userData, "cline", "sessions")
  const entries = await readdir(sessionsDirectory, { withFileTypes: true })
  const sessionIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  if (!sessionIds.includes(ownerSessionId)) throw new Error("Owner session is missing from Cline persistence")
  return sessionIds.filter((sessionId) => sessionId !== ownerSessionId).length
}

async function requireFreeProjectSession(page: Page) {
  const timeoutAt = Date.now() + 30_000
  while (Date.now() < timeoutAt) {
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
  const timeoutAt = Date.now() + timeoutMs
  while (Date.now() < timeoutAt) {
    await assertNoRuntimeErrors(page)
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.growth && predicate(result.value.growth)) return result.value.growth as Goal
    if (result.ok && result.value.growth?.status === "waiting") {
      throw new Error(`Goal entered waiting before the expected stage evidence was complete: ${JSON.stringify(result.value.growth)}`)
    }
    if (result.ok && result.value.growth && ["completed", "cancelled", "failed"].includes(result.value.growth.status)) {
      throw new Error(`Goal reached an unexpected terminal state: ${JSON.stringify(result.value.growth)}`)
    }
    await page.waitForTimeout(500)
  }
  throw new Error("Timed out waiting for stage one to enter waiting")
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    Object.defineProperty(window, "__creatxProStageOneErrors", { value: errors, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxProStageOneErrors?: string[] }).__creatxProStageOneErrors ?? [])
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

async function preserveFailure(error: unknown) {
  await cp(projectRoot, join(evidenceDir, "failed-project"), { recursive: true, force: true }).catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    projectRoot,
    userData,
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
