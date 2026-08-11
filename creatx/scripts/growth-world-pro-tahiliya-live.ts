// Live run against the user's REAL profile (%APPDATA%\creatx): first verifies the startup
// provider migration repaired the legacy "gpt-5.6-luna" profile, then seeds a new project from
// the 塔希里亚故事集 Wikipedia entry via /growth_world_pro and observes read-only until the Goal
// reaches a stable stop. It never pauses, steers or approves anything on the Growth run.
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repository = resolve(workspace, "..")
const appData = process.env.APPDATA?.trim()
if (!appData) throw new Error("TAHILIYA LIVE FAIL: APPDATA is not configured")
const userData = resolve(appData, "creatx")
const modelsPath = join(userData, "creatx", "models.json")
const projectRoot = process.env.CREATX_TAHILIYA_PROJECT_ROOT?.trim() || "C:\\Users\\hawke\\Desktop\\CreatXProjects\\塔希里亚故事集"
const runName = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
const evidenceRoot = resolve(repository, "artifacts", "growth-world-live", "tahiliya")
const evidenceDir = join(evidenceRoot, runName)
const progressPath = join(evidenceDir, "progress.jsonl")
const errorPath = join(evidenceDir, "errors.jsonl")
// ELECTRON_RUN_AS_NODE leaks in from Electron-based host terminals and would turn the launched
// desktop app into a plain Node process, so it must never be inherited.
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE" && entry[0] !== "ELECTRON_NO_ATTACH_CONSOLE"))
const instruction = [
  "/growth_world_pro 以维基百科条目《塔希里亚故事集》 https://zh.wikipedia.org/wiki/%E5%A1%94%E5%B8%8C%E9%87%8C%E4%BA%9E%E6%95%85%E4%BA%8B%E9%9B%86 为种子与考据起点。",
  "先阅读该条目，理解吴淼笔下塔希里亚世界的设定、美学与叙事气质（黑白剪影、克制的魔法、命运与选择的主题），再以其精神与框架为源头独立创作一个完整、自洽、可长期扩展的世界作品；不要照抄或复述原作情节。",
  "让地理、生态、生产、社会、国家、历史、地点、冲突、人物与传说逐层相互支撑。正文应像真正的地理志、史书、博物志、制度说明或人物记述，不得暴露制作过程、自询问、提示词、检索与索引术语。",
].join("\n")
const observedErrors: Array<{ at: string; source: string; detail: string; code?: string; toolName?: string }> = []
const progress: Array<Record<string, unknown>> = []
const startedAt = Date.now()

await mkdir(evidenceDir, { recursive: true })
await mkdir(projectRoot, { recursive: true })
if (!existsSync(join(projectRoot, "项目说明.md"))) {
  await writeFile(join(projectRoot, "项目说明.md"), "# 塔希里亚故事集 · 衍生世界项目\n\n以吴淼《塔希里亚故事集》的维基百科条目为种子，独立创作一个自洽的衍生世界。\n", "utf8")
}
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
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")
app.process().stderr?.on("data", (chunk: Buffer) => { void appendFile(join(evidenceDir, "app-stderr.log"), chunk.toString("utf8")) })
app.process().stdout?.on("data", (chunk: Buffer) => { void appendFile(join(evidenceDir, "app-stdout.log"), chunk.toString("utf8")) })
let appClosed = false
let goalId = ""
let projectId = ""

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 60_000 })
  await installObserver(page)
  const migration = await requireRepairedProfiles()
  console.log(JSON.stringify({ event: "MIGRATION_VERIFIED", profiles: migration }))

  const resumeGoalId = process.env.CREATX_TAHILIYA_RESUME_GOAL?.trim()
  if (resumeGoalId) {
    const recovered = await waitForStartedGoal(page, 60_000)
    if (recovered.goalId !== resumeGoalId) throw new Error(`Recovered Goal ${recovered.goalId} does not match ${resumeGoalId}`)
    goalId = recovered.goalId
    projectId = recovered.projectId
    // Give the startup owner-recovery flow time to settle before touching the goal; a resume
    // fired during recovery races the ownership handshake and gets rejected as a conflict.
    await page.waitForTimeout(10_000)
    const settled = await page.evaluate(async (id) => window.creatx.readGrowthGoal(id), projectId)
    if (!settled.ok) throw new Error(`Growth projection failed after recovery: ${settled.error.code}`)
    const settledGoal = settled.value as Goal | undefined
    if (settledGoal?.status === "paused") {
      // Same call the UI resume button makes; retried because the startup owner-recovery flow can
      // briefly reject commands with growth_conflict while it settles.
      let resumeError = ""
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const resumed = await page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `tahiliya-resume-${Date.now()}`, goalId: id }), goalId)
        if (resumed.ok) { resumeError = ""; break }
        resumeError = `${resumed.error.code}: ${resumed.error.detail ?? resumed.error.message}`
        console.log(JSON.stringify({ event: "RESUME_RETRY", attempt: attempt + 1, error: resumeError }))
        await page.waitForTimeout(10_000)
      }
      if (resumeError) throw new Error(`Growth resume failed after retries: ${resumeError}`)
      const activeAt = Date.now() + 60_000
      while (Date.now() < activeAt) {
        const check = await page.evaluate(async (id) => window.creatx.readGrowthGoal(id), projectId)
        if (check.ok && (check.value as Goal | undefined)?.status === "active") break
        await page.waitForTimeout(500)
      }
    }
    console.log(JSON.stringify({ event: "RESUMED", goalId, projectId, status: settledGoal?.status, version: settledGoal?.version }))
  } else {
    await page.locator("button[aria-label='新会话']").click()
    await requireFreeProjectSession(page)
    await sendFromComposer(page, instruction)
    const startedGoal = await waitForStartedGoal(page, 60_000)
    goalId = startedGoal.goalId
    projectId = startedGoal.projectId
    console.log(JSON.stringify({ event: "STARTED", goalId, projectId, projectRoot }))
  }

  const finalGoal = await observeUntilFinalStop(page, projectId, goalId, 6 * 60 * 60_000)
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: join(evidenceDir, "final.png"), timeout: 90_000 }).catch(() => undefined)
  await closeAndAssert(app, pid)
  appClosed = true
  const files = await listFiles(projectRoot)
  const payload = {
    status: finalGoal.status === "completed" ? "TAHILIYA WORLD PRO LIVE PASS" : "TAHILIYA WORLD PRO LIVE STOPPED",
    goal: finalGoal,
    projectRoot,
    files: files.map((path) => relative(projectRoot, path).replaceAll("\\", "/")),
    observedErrors,
    progressEntries: progress.length,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(payload, undefined, 2)}\n`, "utf8")
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify({ evidenceDir, projectRoot, goalId }, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify({ event: finalGoal.status === "completed" ? "PASS" : "STOPPED", status: finalGoal.status, reason: finalGoal.statusReason, files: payload.files.length, evidenceDir }))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (!appClosed) {
    const page = await app.firstWindow().catch(() => undefined)
    await page?.screenshot({ path: join(evidenceDir, "failure.png"), timeout: 90_000 }).catch(() => undefined)
    await closeAndAssert(app, pid).catch(() => undefined)
    appClosed = true
  }
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({ status: "TAHILIYA WORLD PRO LIVE FAIL", error: message, goalId, projectRoot, observedErrors, progress, elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000) }, undefined, 2)}\n`, "utf8")
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify({ evidenceDir, projectRoot, goalId, failed: true }, undefined, 2)}\n`, "utf8")
  throw error
} finally {
  if (!appClosed) await closeAndAssert(app, pid).catch(() => undefined)
}

interface Goal {
  goalId: string
  projectId: string
  sessionId: string
  status: "active" | "paused" | "waiting" | "completed" | "cancelled" | "failed"
  version: number
  statusReason?: string
  ownerReplyPending?: boolean
}

async function requireRepairedProfiles() {
  const timeoutAt = Date.now() + 30_000
  let lastSeen: Array<{ id: string; providerId: string; modelId: string }> = []
  while (Date.now() < timeoutAt) {
    const parsed = JSON.parse(await readFile(modelsPath, "utf8")) as { textProfiles: Array<{ id: string; providerId: string; modelId: string }> }
    lastSeen = parsed.textProfiles.map(({ id, providerId, modelId }) => ({ id, providerId, modelId }))
    if (lastSeen.length && lastSeen.every((profile) => profile.providerId !== profile.modelId)) return lastSeen
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error(`Startup migration did not repair the legacy profile: ${JSON.stringify(lastSeen)}`)
}

async function installObserver(page: Page) {
  await page.exposeFunction("recordCreatXTahiliyaError", async (input: { source: string; detail: string; code?: string; toolName?: string }) => {
    const observed = { at: new Date().toISOString(), ...input }
    observedErrors.push(observed)
    await appendFile(errorPath, `${JSON.stringify(observed)}\n`, "utf8")
    console.log(JSON.stringify({ event: "ERROR_OBSERVED", ...observed }))
  })
  page.on("pageerror", (error) => {
    void page.evaluate((detail) => {
      void (globalThis as unknown as { recordCreatXTahiliyaError: (input: { source: string; detail: string }) => Promise<void> }).recordCreatXTahiliyaError({ source: "page", detail })
    }, error.message).catch(() => undefined)
  })
  await page.evaluate(() => {
    const record = (input: { source: string; detail: string; code?: string; toolName?: string }) => {
      void (globalThis as unknown as { recordCreatXTahiliyaError: (value: { source: string; detail: string; code?: string; toolName?: string }) => Promise<void> }).recordCreatXTahiliyaError(input)
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
  throw new Error("Growth World Pro did not create a Goal within the timeout")
}

async function observeUntilFinalStop(page: Page, currentProjectId: string, currentGoalId: string, timeoutMs: number) {
  const timeoutAt = Date.now() + timeoutMs
  let lastSignature = ""
  let lastChangeAt = Date.now()
  let consecutiveFailures = 0
  while (Date.now() < timeoutAt) {
    if (app.process().exitCode !== null) throw new Error(`Electron exited unexpectedly with code ${app.process().exitCode}`)
    const projected = await page.evaluate(async (id) => window.creatx.readGrowthGoal(id), currentProjectId).catch((error) => ({ ok: false as const, error: { code: "driver", detail: error instanceof Error ? error.message : String(error), message: "projection call failed" } }))
    if (!projected.ok) {
      // A transient projection hiccup must not make the driver tear down a healthy Growth run.
      consecutiveFailures += 1
      if (consecutiveFailures >= 5) throw new Error(`Growth projection failed ${consecutiveFailures} times: ${projected.error.code}: ${projected.error.detail ?? projected.error.message}`)
      await page.waitForTimeout(2_000)
      continue
    }
    consecutiveFailures = 0
    const goal = projected.value as Goal | undefined
    if (!goal || goal.goalId !== currentGoalId) throw new Error("Growth Goal disappeared during the Live run")
    const snapshot = { at: new Date().toISOString(), version: goal.version, status: goal.status, ...(goal.statusReason ? { reason: goal.statusReason } : {}), errors: observedErrors.length }
    const signature = JSON.stringify({ version: snapshot.version, status: snapshot.status, reason: goal.statusReason, errors: observedErrors.length })
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

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".creatx").map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

async function closeAndAssert(currentApp: ElectronApplication, currentPid: number) {
  const closed = await Promise.race([currentApp.close().then(() => true), new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 20_000))])
  if (!closed) {
    currentApp.process().kill()
    throw new Error(`Electron ${currentPid} did not exit within 20 seconds`)
  }
}
