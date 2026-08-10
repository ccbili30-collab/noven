import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import {
  GROWTH_WORLD_PRO_WORLD_LAYERS,
  validateGrowthWorldProReviewArtifacts,
} from "../packages/creative-skills/src/growth-world-pro.ts"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "blueprint-contract")
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Pro 蓝图合同实跑 "))
const userData = await mkdtemp(join(tmpdir(), "CreatX Pro 蓝图合同用户数据 "))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const errorLogPath = join(evidenceDir, "errors.jsonl")
const providerBaseUrl = process.env.CREATX_PROVIDER_BASE_URL?.trim() || requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = process.env.CREATX_PROVIDER_API_KEY?.trim() || requireEnvironment("CREATX_IMAGE_API_KEY")
const modelId = process.env.CREATX_MODEL_ID?.trim() || "gpt-5.6-luna"
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const errors: ObservedError[] = []
const progress: ObservedProgress[] = []
const startedAt = Date.now()

await rm(evidenceDir, { recursive: true, force: true })
await mkdir(evidenceDir, { recursive: true })
await writeFile(errorLogPath, "", "utf8")

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
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  await installObserver(page)
  await page.locator("button[aria-label='新会话']").click()
  await requireFreeProjectSession(page)
  await sendFromComposer(page, "/growth_world_pro 创建一个经典、宏大、完整、适合长期扩展的中古剑与魔法世界。使用清楚易懂的中世纪奇幻想象，先完成路线、十二层骨架和全世界蓝图；蓝图达到审查状态后停下，不写正文，不生成图片。")
  const goal = await waitUntilStopped(page, 90 * 60_000)
  await waitUntilAttemptsSettle(goal.goalId, 30_000)
  const result = await inspectStoppedRun(goal)
  await page.screenshot({ path: join(evidenceDir, "stopped.png"), timeout: 90_000 })
  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true })
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify({
    status: "ELECTRON GROWTH WORLD PRO BLUEPRINT CONTRACT LIVE PASS",
    modelId,
    projectRoot,
    userData,
    goal,
    errors,
    issues: readGrowthIssues(goal.goalId),
    progress,
    ...result,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  }, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ status: "PASS", modelId, projectRoot, userData, goalId: goal.goalId, errors: errors.length, ...result }))
} catch (error) {
  await cp(projectRoot, join(evidenceDir, "failed-project"), { recursive: true }).catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    modelId,
    projectRoot,
    userData,
    errors,
    issues: goalIdFromDatabase() ? readGrowthIssues(goalIdFromDatabase()!) : [],
    progress,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  }, null, 2)}\n`, "utf8")
  throw error
} finally {
  await closeAndAssert(app, pid)
}

interface Goal {
  goalId: string
  sessionId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  version: number
  statusReason?: string
  workRootPath?: string
}

interface ObservedError {
  at: string
  source: "runtime" | "tool" | "page"
  code?: string
  toolName?: string
  detail: string
}

interface PersistedIssue {
  issueId: string
  dedupeKey: string
  stageAttemptId?: string
  errorCode: string
  status: "detected" | "repairing" | "resolved" | "bypassed" | "needs_help" | "waiting_user"
  summary: string
  detail?: string
}

interface ObservedProgress {
  at: string
  version: number
  status: Goal["status"]
  receipts: number
  reason?: string
}

async function installObserver(page: Page) {
  await page.exposeFunction("recordCreatXBlueprintError", async (input: { source: ObservedError["source"]; code?: string; toolName?: string; detail: string }) => {
    const observed = { at: new Date().toISOString(), ...input }
    errors.push(observed)
    await appendFile(errorLogPath, `${JSON.stringify(observed)}\n`, "utf8")
  })
  page.on("pageerror", (error) => {
    void (page as unknown as { evaluate: (callback: (detail: string) => void, detail: string) => Promise<void> }).evaluate((detail) => {
      void (globalThis as unknown as { recordCreatXBlueprintError: (input: { source: "page"; detail: string }) => Promise<void> }).recordCreatXBlueprintError({ source: "page", detail })
    }, error.message).catch(() => undefined)
  })
  await page.evaluate(() => {
    const record = (input: { source: "runtime" | "tool"; code?: string; toolName?: string; detail: string }) => {
      void (globalThis as unknown as { recordCreatXBlueprintError: (value: typeof input) => Promise<void> }).recordCreatXBlueprintError(input)
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

async function waitUntilStopped(page: Page, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  let lastVersion = -1
  while (Date.now() < timeoutAt) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) {
      await recordHarnessError("runtime", result.error.detail ?? result.error.message, result.error.code)
      await page.waitForTimeout(1_000)
      continue
    }
    const goal = result.value.growth as Goal | undefined
    if (goal && goal.version !== lastVersion) {
      const entry = { at: new Date().toISOString(), version: goal.version, status: goal.status, receipts: receiptCount(goal.goalId), ...(goal.statusReason ? { reason: goal.statusReason } : {}) }
      progress.push(entry)
      console.log(JSON.stringify({ event: "PROGRESS", ...entry }))
      lastVersion = goal.version
    }
    if (goal && goal.status !== "active") return goal
    await page.waitForTimeout(1_000)
  }
  await recordHarnessError("runtime", `Live test exceeded ${Math.round(timeoutMs / 60_000)} minutes without a stable Goal state`, "harness_timeout")
  throw new Error("Timed out waiting for Growth World Pro to stop")
}

async function inspectStoppedRun(goal: Goal) {
  if (goal.status !== "waiting" || !goal.statusReason?.includes("蓝图草案等待用户检查")) {
    throw new Error(`Goal stopped outside the expected blueprint review gate: ${JSON.stringify(goal)}`)
  }
  if (!goal.workRootPath) throw new Error("Stopped Goal did not persist a verified work root")
  const publicFiles = (await listFiles(projectRoot)).map(projectRelative).filter((path) => !path.startsWith(".creatx/"))
  const publicJson = publicFiles.filter((path) => path.endsWith(".json"))
  if (publicJson.length) throw new Error(`Blueprint exposed machine JSON in public content: ${JSON.stringify(publicJson)}`)
  for (const path of [`${goal.workRootPath}/世界基准.md`, `${goal.workRootPath}/资料索引.md`]) {
    if (!publicFiles.includes(path)) throw new Error(`Blueprint omitted public creative file ${path}`)
  }
  const internalRoot = join(projectRoot, ".creatx", "growth", "goals", goal.goalId, "world", "blueprint")
  const logicalPaths = [
    `${goal.workRootPath}/世界蓝图/state.json`,
    `${goal.workRootPath}/世界蓝图/index.json`,
    `${goal.workRootPath}/世界蓝图/relations.json`,
    ...GROWTH_WORLD_PRO_WORLD_LAYERS.map((layer) => `${goal.workRootPath}/${layer}/蓝图.json`),
  ]
  const internalPaths = [
    join(internalRoot, "state.json"),
    join(internalRoot, "index.json"),
    join(internalRoot, "relations.json"),
    ...GROWTH_WORLD_PRO_WORLD_LAYERS.map((_, index) => join(internalRoot, "layers", `${String(index + 1).padStart(2, "0")}.json`)),
  ]
  const artifacts = await Promise.all(internalPaths.map(async (path, index) => ({ relativePath: logicalPaths[index]!, text: await readFile(path, "utf8") })))
  const validationError = validateGrowthWorldProReviewArtifacts(artifacts)
  if (validationError) throw new Error(`Runtime-owned blueprint evidence is invalid: ${validationError}`)
  const state = JSON.parse(artifacts[0]!.text) as { status: string; ownerGoalId: string }
  if (state.status !== "review" || state.ownerGoalId !== goal.goalId) throw new Error("Internal blueprint state does not belong to the stopped Goal in review")
  const workbenches = await readWorkbenches()
  if (workbenches.length !== 1 || workbenches[0]?.folder !== goal.workRootPath) throw new Error(`Expected one root workbench: ${JSON.stringify(workbenches)}`)
  const receipts = receiptCount(goal.goalId)
  if (receipts !== 3) throw new Error(`Expected three product-stage receipts before blueprint review, received ${receipts}`)
  const runningAttempts = stageAttemptCount(goal.goalId, "running")
  if (runningAttempts !== 0) throw new Error(`Stopped Goal retained ${runningAttempts} running stage attempts`)
  const issues = readGrowthIssues(goal.goalId)
  const unresolved = issues.filter((issue) => issue.status !== "resolved" && issue.status !== "bypassed")
  if (unresolved.length) throw new Error(`Stopped Goal retained unresolved production issues: ${JSON.stringify(unresolved)}`)
  if (new Set(issues.map((issue) => issue.dedupeKey)).size !== issues.length) throw new Error("Stopped Goal retained duplicate production issue keys")
  return { receipts, publicFiles, publicJsonCount: publicJson.length, internalArtifactCount: artifacts.length, workbenchCount: workbenches.length, runningAttempts, issueCount: issues.length }
}

async function waitUntilAttemptsSettle(goalId: string, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  while (Date.now() < timeoutAt) {
    if (stageAttemptCount(goalId, "running") === 0) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error("Goal stopped while a Growth stage attempt remained running")
}

async function recordHarnessError(source: ObservedError["source"], detail: string, code?: string) {
  const observed = { at: new Date().toISOString(), source, detail: detail.trim(), ...(code ? { code } : {}) }
  errors.push(observed)
  await appendFile(errorLogPath, `${JSON.stringify(observed)}\n`, "utf8")
}

function readGrowthIssues(goalId: string): PersistedIssue[] {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return (database.prepare(`
      SELECT issue_id, dedupe_key, stage_attempt_id, error_code, status, summary, detail
      FROM growth_issue WHERE goal_id = ? ORDER BY created_at, issue_id
    `).all(goalId) as unknown as Array<{ issue_id: string; dedupe_key: string; stage_attempt_id: string | null; error_code: string; status: PersistedIssue["status"]; summary: string; detail: string | null }>).map((issue) => ({
      issueId: issue.issue_id,
      dedupeKey: issue.dedupe_key,
      ...(issue.stage_attempt_id ? { stageAttemptId: issue.stage_attempt_id } : {}),
      errorCode: issue.error_code,
      status: issue.status,
      summary: issue.summary,
      ...(issue.detail ? { detail: issue.detail } : {}),
    }))
  } finally {
    database.close()
  }
}

function goalIdFromDatabase() {
  try {
    const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
    try {
      return (database.prepare("SELECT goal_id AS goalId FROM growth_goal ORDER BY created_at DESC LIMIT 1").get() as unknown as { goalId: string } | undefined)?.goalId
    } finally {
      database.close()
    }
  } catch {
    return undefined
  }
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

function receiptCount(goalId: string) {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    return Number((database.prepare("SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?").get(goalId) as unknown as { count: number }).count)
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

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory).catch(() => [])
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as { folder?: string }))
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
