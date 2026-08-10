import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const executable = resolve(workspace, "release", "win-unpacked", "CreatX.exe")
const projectRoot = resolve(workspace, "..", "..", "skill-sequence-live")
const evidenceRoot = resolve(projectRoot, "验收记录")
const runEvidenceRoot = resolve(evidenceRoot, `skill-sequence-${new Date().toISOString().replaceAll(":", "-")}`)
const skills = [
  "creatx-draw-map",
  "creatx-build-character-gallery",
  "creatx-novel-start",
  "creatx-draw-comic",
  "creatx-study",
]
const prompt = "基于项目中的《世界基准》、地理势力人物线索与统一画风，严格按挂篮五项依次完成：先制作完整可点击交互地图，然后制作五位著名人物加一位普通人的六人角色群像，再完成小说大纲与前两章，接着把小说开篇改编成至少两页可读漫画，最后研究并复核本轮全部成品，形成可复用的项目研究总结。每一项形成真实成品并验证后才能进入下一项；如果真实失败或部分完成，就停在当前项并如实汇报，不要继续后面的任务。"
const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const app = await electron.launch({
  executablePath: executable,
  cwd: workspace,
  env: { ...environment, CREATX_PROJECT_ROOT: projectRoot },
})
const page = await app.firstWindow()
const log: Array<Record<string, unknown>> = []
let relaunched = false
let terminalCandidate: string | undefined
let terminalCandidateCount = 0

try {
  await mkdir(runEvidenceRoot, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  const activeSessionBeforeCreate = await page.locator('button[data-session-id].is-active').first().getAttribute("data-session-id")
  await page.locator('.wb-project-heading-actions button[aria-label="新会话"]').click()
  const sessionId = await page.waitForFunction((previousSessionId) => {
    const active = document.querySelector<HTMLButtonElement>('button[data-session-id].is-active')?.dataset.sessionId
    return active && active !== previousSessionId ? active : undefined
  }, activeSessionBeforeCreate).then((handle) => handle.jsonValue())
  if (typeof sessionId !== "string") throw new Error("formal_live_session_missing: newly created project session was not found")
  await page.waitForFunction((createdSessionId) => document.querySelector(`[data-session-id="${createdSessionId}"]`)?.classList.contains("is-active"), sessionId)

  await page.locator(".wb-skill-basket-trigger").click()
  const selectors = page.locator(".wb-skill-basket-panel select")
  const existingSlotCount = await selectors.count()
  for (let index = existingSlotCount; index < skills.length; index += 1) await page.getByRole("button", { name: "添加 Skill", exact: true }).click()
  if (await selectors.count() !== skills.length) throw new Error(`formal_live_slot_count_mismatch: expected ${skills.length} slots`)
  for (const [index, skill] of skills.entries()) await selectors.nth(index).selectOption(skill)
  await page.getByLabel("启用下一次发送的 Skill 挂篮").click()
  await page.locator("textarea").fill(prompt)
  await page.locator("button.wb-send").click()
  await page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 30_000 })

  const bootstrap = await page.evaluate(() => window.creatx.bootstrap())
  if (!bootstrap.ok || !bootstrap.value.project) throw new Error(`formal_live_bootstrap_failed: ${JSON.stringify(bootstrap)}`)
  const session = bootstrap.value.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) throw new Error("formal_live_session_missing: newly created project session was not found")
  log.push({ at: new Date().toISOString(), event: "started", sessionId: session.id, projectId: bootstrap.value.project.id, skills, prompt })
  await writeLog()

  const deadline = Date.now() + 3 * 60 * 60 * 1_000
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ sessionId, projectId }) => {
      const timeline = await window.creatx.readTimeline(sessionId)
      const images = await window.creatx.readImageTasks(projectId)
      const runState = document.querySelector(".workspace-shell")?.getAttribute("data-run-state") ?? "missing"
      return {
        runState,
        timeline: timeline.ok ? timeline.value.map((item) => ({ kind: item.kind, state: item.state, presentation: item.presentation, toolName: item.toolName, text: item.text, error: item.error })) : [],
        timelineError: timeline.ok ? undefined : timeline.error,
        images: images.ok ? images.value.map((task) => ({ imageTaskId: task.imageTaskId, relativePath: task.relativePath, status: task.status, errorCode: task.errorCode, errorMessage: task.errorMessage })) : [],
        imageError: images.ok ? undefined : images.error,
      }
    }, { sessionId: session.id, projectId: bootstrap.value.project.id })
    const latest = snapshot.timeline.at(-1)
    const streamingTools = snapshot.timeline.filter((item) => item.kind === "tool" && item.state === "streaming")
    const imageCounts = Object.fromEntries(["queued", "generating", "succeeded", "failed", "interrupted", "cancelled"].map((status) => [status, snapshot.images.filter((task) => task.status === status).length]))
    const entry = { at: new Date().toISOString(), event: "snapshot", runState: snapshot.runState, latest, streamingToolCount: streamingTools.length, imageCounts }
    log.push(entry)
    console.log(JSON.stringify(entry))
    await writeLog()
    if (snapshot.runState !== "running" && streamingTools.length === 0) {
      terminalCandidateCount = terminalCandidate === snapshot.runState ? terminalCandidateCount + 1 : 1
      terminalCandidate = snapshot.runState
    } else {
      if (snapshot.runState !== "running" && streamingTools.length) {
        log.push({ at: new Date().toISOString(), event: "terminal_deferred", runState: snapshot.runState, streamingTools: streamingTools.map((item) => item.toolName) })
        await writeLog()
      }
      terminalCandidate = undefined
      terminalCandidateCount = 0
    }
    if (terminalCandidateCount >= 2) {
      await writeFile(resolve(runEvidenceRoot, "final-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
      await page.screenshot({ path: resolve(runEvidenceRoot, `skill-sequence-${snapshot.runState}.png`), fullPage: false, timeout: 30_000 }).catch(async (error) => {
        log.push({ at: new Date().toISOString(), event: "screenshot_failed", error: error instanceof Error ? error.message : String(error) })
        await writeLog()
      })
      break
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 15_000))
  }
  if (page.locator('.workspace-shell[data-run-state="running"]')) {
    const runState = await page.locator(".workspace-shell").getAttribute("data-run-state")
    if (runState === "running") throw new Error("formal_live_timeout: Skill sequence remained active after three hours")
  }
  await app.close()
  spawn(executable, [], { cwd: workspace, detached: true, env: { ...environment, CREATX_PROJECT_ROOT: projectRoot }, stdio: "ignore" }).unref()
  relaunched = true
} catch (error) {
  log.push({ at: new Date().toISOString(), event: "runner_failed", error: error instanceof Error ? error.stack ?? error.message : String(error) })
  await writeLog().catch(() => undefined)
  await page.screenshot({ path: resolve(runEvidenceRoot, "skill-sequence-runner-failed.png"), fullPage: false, timeout: 30_000 }).catch(() => undefined)
  await app.close().catch(() => undefined)
  spawn(executable, [], { cwd: workspace, detached: true, env: { ...environment, CREATX_PROJECT_ROOT: projectRoot }, stdio: "ignore" }).unref()
  relaunched = true
  throw error
} finally {
  if (!relaunched) await app.close().catch(() => undefined)
}

async function writeLog() {
  await writeFile(resolve(runEvidenceRoot, "run-log.json"), `${JSON.stringify(log, null, 2)}\n`, "utf8")
}
