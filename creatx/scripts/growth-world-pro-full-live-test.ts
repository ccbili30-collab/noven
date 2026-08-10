import { appendFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import { WORLD_BLUEPRINT_LAYERS } from "../packages/world-blueprint/src/schema.ts"
import { queueCompletedLiveArchive } from "@creatx/live-archive-runtime"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repository = resolve(workspace, "..")
const freshRun = process.argv.includes("--fresh")
const projectRoot = freshRun
  ? await mkdtemp(join(tmpdir(), "CreatX Pro 全链实跑 "))
  : resolve(process.env.CREATX_FULL_PRO_PROJECT_ROOT?.trim() || "D:\\CodexCache\\Temp\\CreatX Pro 蓝图合同实跑 b3mDDk")
const userData = freshRun
  ? await mkdtemp(join(tmpdir(), "CreatX Pro 全链用户数据 "))
  : resolve(process.env.CREATX_FULL_PRO_USER_DATA?.trim() || "D:\\CodexCache\\Temp\\CreatX Pro 蓝图合同用户数据 hTlA7s")
let expectedGoalId = freshRun ? undefined : process.env.CREATX_FULL_PRO_GOAL_ID?.trim() || "goal_fc4a52de-c767-4ad4-a38f-600a0f8eb10f"
let expectedProjectId: string | undefined
const expectedObjectCount = process.env.CREATX_FULL_PRO_OBJECT_COUNT?.trim() ? Number(process.env.CREATX_FULL_PRO_OBJECT_COUNT) : undefined
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const runName = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
const evidenceRoot = resolve(repository, "artifacts", "growth-world-live", "full-materialization")
const evidenceDir = join(evidenceRoot, runName)
const progressPath = join(evidenceDir, "progress.jsonl")
const errorPath = join(evidenceDir, "errors.jsonl")
const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || requireEnvironment("CREATX_IMAGE_API_KEY")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const modelId = process.env.CREATX_MODEL_ID?.trim() || "gpt-5.6-luna"
const freshInstruction = process.env.CREATX_FULL_PRO_INSTRUCTION?.trim() || "/growth_world_pro 创作一个经典、宏大、完整、适合长期扩展的中古剑与魔法世界。采用清楚易懂的中世纪奇幻想象，避免为了猎奇而破坏常识；让地理、生态、生产、社会、国家、历史、地点、冲突、人物与传说逐层相互支撑。正文应像真正的地理志、史书、博物志、制度说明或人物记述，不得暴露制作过程、自询问、提示词、检索与索引术语。"
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const observedErrors: ObservedError[] = []
const progress: ProgressSnapshot[] = []
const startedAt = Date.now()

await mkdir(evidenceDir, { recursive: true })
await writeFile(progressPath, "", "utf8")
await writeFile(errorPath, "", "utf8")

const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...inheritedEnvironment,
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    CREATX_PROVIDER_ID: process.env.CREATX_PROVIDER_ID?.trim() || "openai-compatible",
    CREATX_MODEL_ID: modelId,
    CREATX_PROVIDER_BASE_URL: providerBaseUrl,
    CREATX_PROVIDER_API_KEY: providerApiKey,
    CREATX_IMAGE_BASE_URL: imageBaseUrl,
    CREATX_IMAGE_API_KEY: imageApiKey,
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")
let appClosed = false

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  await installObserver(page)
  if (freshRun) {
    await page.locator("button[aria-label='新会话']").click()
    await requireFreeProjectSession(page)
    await sendFromComposer(page, freshInstruction)
    const startedGoal = await waitForStartedGoal(page, 30_000)
    expectedGoalId = startedGoal.goalId
    expectedProjectId = startedGoal.projectId
  } else {
    const initialGoal = requireRecoverableGoal(expectedGoalId!)
    expectedProjectId = initialGoal.projectId
    if (!initialGoal.workRootPath) throw new Error("Recoverable Goal has no verified work root")
    const initialBlueprint = readInternalJson<BlueprintState>(expectedGoalId!, "world", "blueprint", "state.json")
    if (initialBlueprint.status !== "review" && initialBlueprint.status !== "frozen") throw new Error(`Blueprint is ${initialBlueprint.status}, expected review or frozen`)
    const resumed = await page.evaluate(async (goalId) => window.creatx.resumeGrowth({ requestId: `full-live-resume-${Date.now()}`, goalId }), expectedGoalId!)
    if (!resumed.ok) throw new Error(`Growth resume failed: ${resumed.error.code}: ${resumed.error.detail ?? resumed.error.message}`)
  }
  const finalGoal = await observeUntilFinalStop(page, expectedProjectId!, expectedGoalId!, 30 * 60 * 60_000)
  const liveProjection = await inspectLiveProjection(page, finalGoal)
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: join(evidenceDir, "final.png"), timeout: 90_000 })
  await closeAndAssert(app, pid)
  appClosed = true
  const result = await inspectFinalResult(finalGoal)
  const archive = await queueCompletedLiveArchive({
    sourceProjectRoot: projectRoot,
    sourceUserData: userData,
    targetUserData: resolve(process.env.CREATX_LIVE_ARCHIVE_USER_DATA?.trim() || join(requireEnvironment("APPDATA"), "creatx")),
    goalId: expectedGoalId!,
  })
  const payload = {
    status: "ELECTRON GROWTH WORLD PRO FULL MATERIALIZATION LIVE PASS",
    modelId,
    projectRoot,
    userData,
    goal: finalGoal,
    observedErrors,
    issues: readGrowthIssues(expectedGoalId!),
    progress,
    liveProjection,
    liveArchive: { archiveId: archive.archiveId, inbox: archive.inbox },
    ...result,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(payload, undefined, 2)}\n`, "utf8")
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify({ evidenceDir, result: join(evidenceDir, "result.json"), projectRoot, userData, goalId: expectedGoalId }, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify({ event: "PASS", evidenceDir, completed: result.completedObjects, images: result.imageTasks, hardQualityFailures: result.prose.hardFailures.length, warnings: result.prose.warnings.length }))
} catch (error) {
  if (!appClosed) {
    await closeAndAssert(app, pid)
    appClosed = true
  }
  const payload = {
    status: "ELECTRON GROWTH WORLD PRO FULL MATERIALIZATION LIVE FAIL",
    error: error instanceof Error ? error.message : String(error),
    modelId,
    projectRoot,
    userData,
    goal: expectedGoalId ? queryGoal(expectedGoalId) : undefined,
    observedErrors,
    issues: expectedGoalId ? readGrowthIssues(expectedGoalId) : [],
    progress,
    materialization: expectedGoalId ? optionalMaterialization(expectedGoalId) : undefined,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  }
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify(payload, undefined, 2)}\n`, "utf8")
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify({ evidenceDir, failure: join(evidenceDir, "failure.json"), projectRoot, userData, goalId: expectedGoalId }, undefined, 2)}\n`, "utf8")
  throw error
} finally {
  if (!appClosed) await closeAndAssert(app, pid)
}

interface Goal {
  goalId: string
  projectId: string
  sessionId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  version: number
  statusReason?: string
  workRootPath?: string
  ownerReplyPending?: boolean
}

interface BlueprintState {
  status: "draft" | "review" | "frozen"
  ownerGoalId: string
  root: string
}

interface MaterializationObject {
  objectId: string
  layer: string
  plannedPath: string
  status: "pending" | "researching" | "ready" | "writing" | "completed" | "retryable" | "blocked" | "unknown"
  attempts: { research: number; writing: number; recovery: number }
  block?: { kind: string; reason: string }
  lastError?: { phase: string; message: string }
}

interface MaterializationState {
  schemaVersion: number
  root: string
  goalId: string
  objects: MaterializationObject[]
}

interface MaterializationReceipt {
  schemaVersion: number
  objectId: string
  artifactPath: string
  imageTaskId: string
  bodySha256: string
  extractionSha256: string
}

interface Extraction {
  schemaVersion: number
  objectId: string
  bodySha256: string
  facts: Array<{ id: string; text: string; sourceLevel: "source" | "derived" | "created"; sourcePaths: string[] }>
  relations: unknown[]
  contradictions: string[]
  lockedFactConflicts: string[]
}

interface PersistedIssue {
  issueId: string
  dedupeKey: string
  errorCode: string
  status: "detected" | "repairing" | "resolved" | "bypassed" | "needs_help" | "waiting_user"
  summary: string
  detail?: string
  workItemId?: string
}

interface ObservedError {
  at: string
  source: "runtime" | "tool" | "page"
  detail: string
  code?: string
  toolName?: string
}

interface ProgressSnapshot {
  at: string
  version: number
  status: Goal["status"]
  completed: number
  active: number
  retryable: number
  blocked: number
  unknown: number
  currentLayer?: string
  reason?: string
}

async function installObserver(page: Page) {
  await page.exposeFunction("recordCreatXFullRunError", async (input: Omit<ObservedError, "at">) => {
    const observed = { at: new Date().toISOString(), ...input }
    observedErrors.push(observed)
    await appendFile(errorPath, `${JSON.stringify(observed)}\n`, "utf8")
    console.log(JSON.stringify({ event: "ERROR_OBSERVED", ...observed }))
  })
  page.on("pageerror", (error) => {
    void page.evaluate((detail) => {
      void (globalThis as unknown as { recordCreatXFullRunError: (input: Omit<ObservedError, "at">) => Promise<void> }).recordCreatXFullRunError({ source: "page", detail })
    }, error.message).catch(() => undefined)
  })
  await page.evaluate(() => {
    const record = (input: Omit<ObservedError, "at">) => {
      void (globalThis as unknown as { recordCreatXFullRunError: (value: Omit<ObservedError, "at">) => Promise<void> }).recordCreatXFullRunError(input)
    }
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") {
        record({ source: "runtime", code: event.error.code, detail: event.error.detail ?? event.error.message })
        return
      }
      if (event.type !== "timeline.upsert" || event.item.kind !== "tool" || event.item.state !== "failed") return
      record({ source: "tool", ...(event.item.toolName ? { toolName: event.item.toolName } : {}), detail: event.item.error ?? "工具调用失败" })
    })
  })
}

async function requireFreeProjectSession(page: Page) {
  const timeoutAt = Date.now() + 30_000
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.sessions[0]?.kind === "project" && result.value.sessions[0].permission.mode === "free") return
    await page.waitForTimeout(250)
  }
  throw new Error("Timed out waiting for a free project session")
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.getByLabel("发送消息").fill(prompt)
  await page.locator("button[title='发送']").click()
}

async function waitForStartedGoal(page: Page, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.growth) return result.value.growth as Goal
    await page.waitForTimeout(250)
  }
  throw new Error("Growth World Pro did not create a Goal within 30 seconds")
}

async function observeUntilFinalStop(page: Page, projectId: string, goalId: string, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  let lastSignature = ""
  let lastChangeAt = Date.now()
  while (Date.now() < timeoutAt) {
    if (app.process().exitCode !== null) throw new Error(`Electron exited unexpectedly with code ${app.process().exitCode}`)
    const projected = await page.evaluate(async (currentProjectId) => window.creatx.readGrowthGoal(currentProjectId), projectId)
    if (!projected.ok) throw new Error(`Growth projection failed: ${projected.error.code}: ${projected.error.detail ?? projected.error.message}`)
    const goal = projected.value as Goal | undefined
    if (!goal || goal.goalId !== goalId) throw new Error("Growth Goal disappeared during the Live run")
    const state = optionalMaterialization(goalId)
    const snapshot = progressSnapshot(goal, state)
    const signature = progressSignature(snapshot)
    if (signature !== lastSignature) {
      progress.push(snapshot)
      await appendFile(progressPath, `${JSON.stringify(snapshot)}\n`, "utf8")
      console.log(JSON.stringify({ event: "PROGRESS", ...snapshot }))
      lastSignature = signature
      lastChangeAt = Date.now()
    }
    if (goal.status !== "active" && !goal.ownerReplyPending) return goal
    if (Date.now() - lastChangeAt > 90 * 60_000) throw new Error("Growth made no persisted progress for 90 minutes")
    await page.waitForTimeout(2_000)
  }
  throw new Error(`Growth exceeded ${Math.round(timeoutMs / 3_600_000)} hours without reaching a stable stop`)
}

function progressSnapshot(goal: Goal, state: MaterializationState | undefined): ProgressSnapshot {
  const objects = state?.objects ?? []
  const currentLayer = WORLD_BLUEPRINT_LAYERS.find((layer) => objects.some((object) => object.layer === layer && object.status !== "completed"))
  return {
    at: new Date().toISOString(),
    version: goal.version,
    status: goal.status,
    completed: objects.filter((object) => object.status === "completed").length,
    active: objects.filter((object) => object.status === "researching" || object.status === "writing").length,
    retryable: objects.filter((object) => object.status === "retryable").length,
    blocked: objects.filter((object) => object.status === "blocked").length,
    unknown: objects.filter((object) => object.status === "unknown").length,
    ...(currentLayer ? { currentLayer } : {}),
    ...(goal.statusReason ? { reason: goal.statusReason } : {}),
  }
}

function progressSignature(snapshot: ProgressSnapshot) {
  return JSON.stringify({
    version: snapshot.version,
    status: snapshot.status,
    completed: snapshot.completed,
    active: snapshot.active,
    retryable: snapshot.retryable,
    blocked: snapshot.blocked,
    unknown: snapshot.unknown,
    currentLayer: snapshot.currentLayer ?? null,
    reason: snapshot.reason ?? null,
  })
}

async function inspectLiveProjection(page: Page, goal: Goal) {
  if (goal.status !== "completed" || goal.ownerReplyPending) throw new Error(`Growth stopped before Owner delivery completed: ${JSON.stringify(goal)}`)
  const state = readInternalJson<MaterializationState>(goal.goalId, "world", "materialization", "state.json")
  const completed = state.objects.filter((object) => object.status === "completed")
  const projection = await page.evaluate(async ({ sessionId, projectId }) => ({
    timeline: await window.creatx.readTimeline(sessionId),
    project: await window.creatx.refreshFiles(projectId),
    workbenches: await window.creatx.readWorkbenches(projectId),
  }), { sessionId: goal.sessionId, projectId: goal.projectId })
  if (!projection.timeline.ok) throw new Error(`Owner timeline could not be read: ${projection.timeline.error.code}: ${projection.timeline.error.detail ?? projection.timeline.error.message}`)
  if (!projection.project.ok) throw new Error(`Project files could not be refreshed: ${projection.project.error.code}: ${projection.project.error.detail ?? projection.project.error.message}`)
  if (!projection.workbenches.ok) throw new Error(`Workbenches could not be read: ${projection.workbenches.error.code}: ${projection.workbenches.error.detail ?? projection.workbenches.error.message}`)
  const commands = projection.timeline.value.filter((item) => item.kind === "message" && item.presentation === "user" && item.text?.trim().startsWith("/growth_world_pro"))
  if (freshRun && commands.length !== 1) throw new Error(`Fresh Growth run exposed ${commands.length} user commands instead of exactly one`)
  const command = commands.at(-1)
  if (!command) throw new Error("Owner timeline lost the visible /growth_world_pro user command")
  const finalReply = projection.timeline.value.findLast((item) => item.sequence > command.sequence && item.kind === "message" && item.presentation === "assistant" && item.state === "completed" && Boolean(item.text?.trim()))
  if (!finalReply?.text) throw new Error("Owner timeline has no formal Assistant reply after the Growth command")
  if (/(?:Growth\s*状态|目标状态)[：:\s`*]*active/iu.test(finalReply.text)) throw new Error("Owner final reply exposes the pre-delivery active status")
  const unfinishedImages = readImageTasks(goal.projectId).filter((image) => image.status !== "succeeded")
  if (unfinishedImages.length && !/(?:图片|配图|插图)/u.test(finalReply.text)) throw new Error(`Owner final reply omits ${unfinishedImages.length} unfinished image tasks`)
  const completedPaths = new Set(completed.map((object) => object.plannedPath.replaceAll("\\", "/")))
  const projectedPaths = new Set(projection.project.value.files.map((file) => file.relativePath))
  const missingPaths = [...completedPaths].filter((path) => !projectedPaths.has(path))
  if (missingPaths.length) throw new Error(`Workbench file projection is missing ${missingPaths.length} completed正文 files: ${JSON.stringify(missingPaths.slice(0, 12))}`)
  const rootWorkbench = projection.workbenches.value.workbenches.find((workbench) => workbench.source === "registered" && workbench.state === "ready" && workbench.folder === goal.workRootPath)
  if (!rootWorkbench) throw new Error(`The registered root workbench for ${goal.workRootPath ?? "<missing>"} is not ready`)
  const sampleObject = completed[0]
  if (!sampleObject) throw new Error("Workbench has no completed正文 file to read")
  const sampleFile = projection.project.value.files.find((file) => file.relativePath === sampleObject.plannedPath.replaceAll("\\", "/"))
  if (!sampleFile) throw new Error(`Workbench sample file ${sampleObject.plannedPath} is not projected`)
  const samplePreview = await page.evaluate(async ({ projectId, fileId }) => window.creatx.readFile(projectId, fileId), { projectId: goal.projectId, fileId: sampleFile.id })
  if (!samplePreview.ok) throw new Error(`Workbench could not read ${sampleObject.plannedPath}: ${samplePreview.error.code}: ${samplePreview.error.detail ?? samplePreview.error.message}`)
  const diskSample = await readFile(join(projectRoot, sampleObject.plannedPath), "utf8")
  if (samplePreview.value.content !== diskSample) throw new Error(`Workbench content for ${sampleObject.plannedPath} differs from the real project file`)
  if (state.objects.some((object) => object.status !== "completed") && !/(?:待返工|未完成|失败|未能完成)/u.test(finalReply.text)) {
    throw new Error("Owner final reply did not disclose incomplete正文 objects")
  }
  return {
    userCommandCount: commands.length,
    finalReply: finalReply.text,
    projectedFileCount: projection.project.value.files.length,
    registeredWorkbenchId: rootWorkbench.id,
    verifiedFilePath: sampleObject.plannedPath,
  }
}

async function inspectFinalResult(goal: Goal) {
  if (goal.status !== "completed" || goal.ownerReplyPending) throw new Error(`Growth did not finish with a delivered Owner reply: ${JSON.stringify(goal)}`)
  if (!goal.workRootPath) throw new Error("Completed Goal lost its work root")
  const state = readInternalJson<MaterializationState>(goal.goalId, "world", "materialization", "state.json")
  if (state.schemaVersion !== 4 || state.goalId !== goal.goalId || state.root !== goal.workRootPath) throw new Error("Final materialization identity is invalid")
  if (expectedObjectCount !== undefined && state.objects.length !== expectedObjectCount) throw new Error(`Materialization has ${state.objects.length} objects, expected ${expectedObjectCount}`)
  const completed = state.objects.filter((object) => object.status === "completed")
  const incomplete = state.objects.filter((object) => object.status !== "completed")
  if (!completed.length) throw new Error("Materialization completed the Goal without any real正文 object")
  if (new Set(state.objects.map((object) => object.plannedPath)).size !== state.objects.length) throw new Error("Materialization assigned the same正文 path to multiple objects")
  const receipts = await readInternalDirectory<MaterializationReceipt>(goal.goalId, "world", "materialization", "receipts")
  const extractions = await readInternalDirectory<Extraction>(goal.goalId, "world", "materialization", "extractions")
  if (receipts.length !== completed.length) throw new Error(`Expected ${completed.length} receipts, received ${receipts.length}`)
  if (extractions.length !== completed.length) throw new Error(`Expected ${completed.length} extractions, received ${extractions.length}`)
  const contradiction = extractions.find((item) => item.value.contradictions.length || item.value.lockedFactConflicts.length)
  if (contradiction) throw new Error(`Extraction retained contradictions for ${contradiction.value.objectId}`)
  const receiptByObject = new Map(receipts.map((item) => [item.value.objectId, item.value]))
  const extractionByObject = new Map(extractions.map((item) => [item.value.objectId, item.value]))
  const missingEvidence = completed.find((object) => !receiptByObject.has(object.objectId) || !extractionByObject.has(object.objectId))
  if (missingEvidence) throw new Error(`Object ${missingEvidence.objectId} is missing durable completion evidence`)
  const bodies = await Promise.all(completed.map(async (object) => ({ object, body: await readFile(join(projectRoot, object.plannedPath), "utf8") })))
  const mismatchedBody = bodies.find((item) => createHash("sha256").update(item.body, "utf8").digest("hex") !== receiptByObject.get(item.object.objectId)?.bodySha256)
  if (mismatchedBody) throw new Error(`Object ${mismatchedBody.object.objectId} was overwritten after its durable receipt`)
  const bodyHashes = bodies.map((item) => createHash("sha256").update(item.body, "utf8").digest("hex"))
  if (new Set(bodyHashes).size !== bodyHashes.length) throw new Error("Multiple正文 objects contain the exact same body")
  const images = readImageTasks(goal.projectId)
  if (images.length !== completed.length) throw new Error(`Expected ${completed.length} image tasks, received ${images.length}`)
  const receiptImageIds = new Set(receipts.map((item) => item.value.imageTaskId))
  if (receiptImageIds.size !== completed.length || images.some((image) => !receiptImageIds.has(image.imageTaskId))) throw new Error("Image tasks and object receipts are not one-to-one")
  const layerReports = readGrowthReportIds(goal.goalId).filter((reportId) => reportId.startsWith("world-materialization-layer-"))
  if (layerReports.length !== WORLD_BLUEPRINT_LAYERS.length) throw new Error(`Expected 12 materialization layer reports, received ${layerReports.length}`)
  const issues = readGrowthIssues(goal.goalId)
  const blockingIssues = issues.filter((issue) => issue.status !== "resolved" && issue.status !== "bypassed" && issue.status !== "needs_help")
  if (blockingIssues.length) throw new Error(`Final run retained blocking Issues: ${JSON.stringify(blockingIssues)}`)
  const deferredObjectIds = new Set(issues.filter((issue) => issue.status === "needs_help").flatMap((issue) => issue.workItemId ? [issue.workItemId] : []))
  const unexplainedIncomplete = incomplete.filter((object) => !deferredObjectIds.has(object.objectId))
  if (unexplainedIncomplete.length) throw new Error(`Final report omitted failure evidence for incomplete objects: ${JSON.stringify(unexplainedIncomplete.slice(0, 12))}`)
  if (new Set(issues.map((issue) => issue.dedupeKey)).size !== issues.length) throw new Error("Final run retained duplicate Issue keys")
  const runningAttempts = stageAttemptCount(goal.goalId, "running")
  if (runningAttempts) throw new Error(`Final run retained ${runningAttempts} running stage attempts`)
  const publicFiles = (await listFiles(projectRoot)).map(projectRelative).filter((path) => !path.startsWith(".creatx/"))
  const publicJson = publicFiles.filter((path) => path.endsWith(".json"))
  if (publicJson.length) throw new Error(`Materialization exposed machine JSON: ${JSON.stringify(publicJson)}`)
  const prose = await inspectProse(completed)
  await writeFile(join(evidenceDir, "prose-quality.json"), `${JSON.stringify(prose, undefined, 2)}\n`, "utf8")
  if (prose.hardFailures.length) throw new Error(`Prose quality gate failed for ${prose.hardFailures.length} findings; see ${join(evidenceDir, "prose-quality.json")}`)
  return {
    totalObjects: state.objects.length,
    completedObjects: completed.length,
    deferredObjects: incomplete.map((object) => ({ objectId: object.objectId, path: object.plannedPath, status: object.status })),
    receipts: receipts.length,
    extractions: extractions.length,
    imageTasks: images.length,
    imageStatuses: countBy(images.map((image) => image.status)),
    layerReports,
    issueCount: issues.length,
    runningAttempts,
    publicFiles: publicFiles.length,
    publicJsonCount: publicJson.length,
    prose,
  }
}

async function inspectProse(objects: readonly MaterializationObject[]) {
  const bodies = await Promise.all(objects.map(async (object) => ({ object, body: await readFile(join(projectRoot, object.plannedPath), "utf8") })))
  const hardFailures: Array<{ objectId: string; path: string; reason: string }> = []
  const warnings: Array<{ objectId: string; path: string; reason: string }> = []
  const openings = new Map<string, Array<{ objectId: string; path: string }>>()
  const samples: Record<string, Array<{ objectId: string; path: string; characters: number; opening: string }>> = {}
  const forbidden = [
    /(?:criticalGaps?|contentCards?|consistencyGuard|sourceLevel|epistemicStatus|\bsource\s*:\s*(?:source|derived|created)|\bderived\s*:|\bcreated\s*:)/iu,
    /(?:卷首[^\n]{0,20}(?:问|问题)|先问[一二三四五六七八九十0-9]|(?:以下|下列)[^\n]{0,12}(?:问题|问句)|必须先[^。\n]{0,40}(?:问题|问清|发问)|先自行提出)/u,
    /^#{1,6}\s*(?:事件定位|对象定位|叙述边界|运行边界|证据边界|研究包|检索过程|写作简报)\s*$/mu,
    /(?:现有事实支持|来源没有给出|不支持在没有新增依据时|本段将|本文将从|接下来将介绍)/u,
    /(?:现实世界|现实历史|现实意义上的|本应存在|原本应该存在|另一条世界线|在这个世界里|本世界)/u,
  ]
  for (const item of bodies) {
    const characters = item.body.replace(/\s/gu, "").length
    const finding = (reason: string) => ({ objectId: item.object.objectId, path: item.object.plannedPath, reason })
    if (characters < 600) hardFailures.push(finding(`only ${characters} non-whitespace characters`))
    if (item.body.includes("�")) hardFailures.push(finding("contains an invalid UTF-8 replacement character"))
    if (!/^#\s+\S+/mu.test(item.body)) hardFailures.push(finding("has no Markdown title"))
    if (forbidden.some((pattern) => pattern.test(item.body))) hardFailures.push(finding("contains internal, self-questioning, editorial, or external framing"))
    const paragraphs = item.body.split(/\n\s*\n/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length >= 100)
    if (new Set(paragraphs).size !== paragraphs.length) hardFailures.push(finding("repeats a substantial paragraph verbatim"))
    const lines = item.body.split(/\r?\n/u).filter((line) => line.trim())
    const listRatio = lines.filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/u.test(line)).length / Math.max(lines.length, 1)
    if (listRatio > 0.5) warnings.push(finding(`list-heavy body ratio ${listRatio.toFixed(2)}`))
    const opening = item.body.replace(/^#.*$/mu, "").replace(/\s+/gu, "").slice(0, 90)
    openings.set(opening, [...openings.get(opening) ?? [], { objectId: item.object.objectId, path: item.object.plannedPath }])
    samples[item.object.layer] = [...samples[item.object.layer] ?? [], { objectId: item.object.objectId, path: item.object.plannedPath, characters, opening: item.body.slice(0, 500) }].slice(0, 3)
  }
  for (const duplicates of openings.values()) {
    if (duplicates.length < 3) continue
    duplicates.forEach((item) => hardFailures.push({ ...item, reason: `shares the same opening with ${duplicates.length} bodies` }))
  }
  return {
    hardFailures,
    warnings,
    characters: {
      total: bodies.reduce((sum, item) => sum + item.body.replace(/\s/gu, "").length, 0),
      minimum: Math.min(...bodies.map((item) => item.body.replace(/\s/gu, "").length)),
      maximum: Math.max(...bodies.map((item) => item.body.replace(/\s/gu, "").length)),
      average: Math.round(bodies.reduce((sum, item) => sum + item.body.replace(/\s/gu, "").length, 0) / bodies.length),
    },
    samples,
  }
}

function requireRecoverableGoal(goalId: string) {
  const goal = queryGoal(goalId)
  if (!goal || (goal.status !== "waiting" && goal.status !== "paused")) throw new Error(`Expected a waiting or paused Goal, received ${JSON.stringify(goal)}`)
  return goal
}

function queryGoal(goalId: string): Goal | undefined {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    const row = database.prepare(`SELECT goal_id, project_id, session_id, status, version, status_reason, work_root_path FROM growth_goal WHERE goal_id = ?`).get(goalId) as unknown as { goal_id: string; project_id: string; session_id: string; status: Goal["status"]; version: number; status_reason: string | null; work_root_path: string | null } | undefined
    return row ? { goalId: row.goal_id, projectId: row.project_id, sessionId: row.session_id, status: row.status, version: row.version, ...(row.status_reason ? { statusReason: row.status_reason } : {}), ...(row.work_root_path ? { workRootPath: row.work_root_path } : {}) } : undefined
  } finally {
    database.close()
  }
}

function readGrowthIssues(goalId: string): PersistedIssue[] {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return (database.prepare(`SELECT issue_id, dedupe_key, work_item_id, error_code, status, summary, detail FROM growth_issue WHERE goal_id = ? ORDER BY created_at, issue_id`).all(goalId) as unknown as Array<{ issue_id: string; dedupe_key: string; work_item_id: string | null; error_code: string; status: PersistedIssue["status"]; summary: string; detail: string | null }>).map((issue) => ({
      issueId: issue.issue_id,
      dedupeKey: issue.dedupe_key,
      errorCode: issue.error_code,
      status: issue.status,
      summary: issue.summary,
      ...(issue.detail ? { detail: issue.detail } : {}),
      ...(issue.work_item_id ? { workItemId: issue.work_item_id } : {}),
    }))
  } finally {
    database.close()
  }
}

function readGrowthReportIds(goalId: string) {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return (database.prepare("SELECT report_id AS reportId FROM growth_report_receipt WHERE goal_id = ? ORDER BY resulting_version").all(goalId) as unknown as Array<{ reportId: string }>).map((row) => row.reportId)
  } finally {
    database.close()
  }
}

function stageAttemptCount(goalId: string, status: string) {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return Number((database.prepare("SELECT COUNT(*) AS count FROM growth_stage_attempt WHERE goal_id = ? AND status = ?").get(goalId, status) as unknown as { count: number }).count)
  } finally {
    database.close()
  }
}

function readImageTasks(projectId: string) {
  const database = new DatabaseSync(imageDatabasePath, { readOnly: true })
  try {
    return database.prepare(`SELECT image_task_id AS imageTaskId, idempotency_key AS idempotencyKey, relative_path AS relativePath, status FROM image_task WHERE project_id = ? ORDER BY queue_sequence`).all(projectId) as unknown as Array<{ imageTaskId: string; idempotencyKey: string; relativePath: string; status: string }>
  } finally {
    database.close()
  }
}

function optionalMaterialization(goalId: string) {
  try {
    return readInternalJson<MaterializationState>(goalId, "world", "materialization", "state.json")
  } catch {
    return undefined
  }
}

function readInternalJson<T>(goalId: string, ...segments: string[]) {
  return JSON.parse(requireTextFile(join(projectRoot, ".creatx", "growth", "goals", encodeURIComponent(goalId), ...segments))) as T
}

async function readInternalDirectory<T>(goalId: string, ...segments: string[]) {
  const directory = join(projectRoot, ".creatx", "growth", "goals", encodeURIComponent(goalId), ...segments)
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
  return Promise.all(names.map(async (name) => ({ name, value: JSON.parse(await readFile(join(directory, name), "utf8")) as T })))
}

function requireTextFile(path: string) {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))
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

function countBy(values: readonly string[]) {
  return Object.fromEntries(values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()))
}

async function closeAndAssert(app: ElectronApplication, pid: number) {
  const closed = await Promise.race([app.close().then(() => true), new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 20_000))])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 20 seconds`)
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
