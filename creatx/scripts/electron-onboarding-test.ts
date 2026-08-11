import { createServer } from "node:http"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const electronExecutable = process.env.CREATX_TEST_ELECTRON_EXECUTABLE?.trim() || resolve(workspace, "node_modules", "electron", "dist", "electron.exe")
const userData = await mkdtemp(join(tmpdir(), "noven-onboarding-data-"))
const projectRoot = await mkdtemp(join(tmpdir(), "noven-onboarding-project-"))
const artifacts = resolve(workspace, "..", "artifacts")
const activeApps: ElectronApplication[] = []
const launchedPids: number[] = []
let providerRequests = 0
const provider = createServer((request, response) => {
  providerRequests += 1
  request.resume()
  response.writeHead(500, { "content-type": "application/json" })
  response.end(JSON.stringify({ error: "The onboarding test must never call the Provider." }))
})

await mkdir(artifacts, { recursive: true })
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const providerAddress = provider.address()
if (!providerAddress || typeof providerAddress === "string") throw new Error("Onboarding test Provider did not expose a port")
const providerPort = providerAddress.port

try {
  const interrupted = await launch()
  await expectStep(interrupted.page, 1, "把一次心动，种成一个世界")
  await close(interrupted.app)

  const first = await launch()
  await expectStep(first.page, 1, "把一次心动，种成一个世界")
  await first.page.screenshot({ path: join(artifacts, "onboarding-production-welcome.png"), fullPage: true })

  await next(first.page)
  await expectStep(first.page, 2, "先让诺文能够听懂你")
  await requireVisibleTarget(first.page, "api")
  await first.page.screenshot({ path: join(artifacts, "onboarding-production-api.png"), fullPage: true })

  for (const expected of [
    [3, "你的作品，保存在真实文件夹中", "open-project"],
    [4, "把视频链接和创作愿望一起发给 AI", "composer"],
    [5, "作品会在工作台里陆续出现", "workbench"],
    [6, "艺术库保存你真正喜欢的画面", "art-library"],
    [7, "灵感库分成启发与幻想", "idea-library"],
    [8, "传承库保存方法，不冒充看过内容", "heritage-library"],
  ] as const) {
    await next(first.page)
    await expectStep(first.page, expected[0], expected[1])
    await requireVisibleTarget(first.page, expected[2])
  }

  await next(first.page)
  await expectStep(first.page, 9, "你只需说想创造什么")
  const capabilities = first.page.locator(".wb-onboarding-card[data-step=capabilities]")
  for (const name of ["世界生长", "小说创作", "人物群像", "资料学习", "地图", "漫画", "因果图", "图像", "工作台"]) await capabilities.getByText(name, { exact: true }).first().waitFor()
  for (const name of ["小说创作", "资料研究", "世界地图", "人物群像", "连续漫画", "因果关系网", "长期目标", "完整世界", "大型世界工程"]) await capabilities.getByText(name, { exact: true }).last().waitFor()
  await first.page.screenshot({ path: join(artifacts, "onboarding-production-capabilities.png"), fullPage: true })

  await next(first.page)
  await expectStep(first.page, 10, "接下来，由你决定世界往哪里生长")
  await first.page.getByRole("button", { name: "开始创作" }).click()
  await first.page.locator(".wb-onboarding-layer").waitFor({ state: "detached" })
  if (!await first.page.evaluate(() => window.localStorage.getItem("creatx.workspace.onboarding.v1") === JSON.stringify({ version: 1, seen: true }))) throw new Error("Completing the tour did not persist its Profile marker")
  await close(first.app)

  const second = await launch()
  await second.page.waitForTimeout(350)
  if (await second.page.locator(".wb-onboarding-layer").count()) throw new Error("Completed onboarding opened again after restart")

  await second.page.locator(".wb-secondary-nav").getByText("新手教程", { exact: true }).click()
  await expectStep(second.page, 1, "把一次心动，种成一个世界")
  await second.page.getByRole("button", { name: "跳过" }).click()
  await second.page.getByTitle("收起项目导航").click()
  await second.page.getByTitle("新手教程").click()
  await expectStep(second.page, 1, "把一次心动，种成一个世界")

  await second.page.emulateMedia({ reducedMotion: "reduce" })
  const animation = await second.page.locator(".wb-onboarding-target").evaluate((target) => getComputedStyle(target).animationName).catch(() => "none")
  if (animation !== "none") throw new Error(`Reduced-motion mode kept the Spotlight animation: ${animation}`)
  await second.page.keyboard.press("Escape")
  await second.page.locator(".wb-onboarding-layer").waitFor({ state: "detached" })
  await close(second.app)

  if (providerRequests !== 0) throw new Error(`Onboarding called the Provider ${providerRequests} time(s)`)
  const projectEntries = await readdir(projectRoot, { recursive: true })
  if (projectEntries.length) throw new Error(`Onboarding changed the project directory: ${JSON.stringify(projectEntries)}`)
  await assertProcessesExited(launchedPids)
  console.log(JSON.stringify({
    status: "ONBOARDING ELECTRON PASS",
    steps: 10,
    firstRun: "shown once",
    interruptedFirstRun: "shown again",
    replay: ["expanded navigation", "collapsed rail"],
    reducedMotion: "pass",
    providerRequests,
    projectWrites: projectEntries.length,
  }))
} finally {
  await Promise.allSettled(activeApps.map((app) => app.close()))
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function launch() {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
    cwd: workspace,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CREATX_DESKTOP_TEST: "1",
      CREATX_PROJECT_ROOT: projectRoot,
      CREATX_PROVIDER_API_KEY: "onboarding-test-key",
      CREATX_PROVIDER_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    },
  })
  activeApps.push(app)
  const pid = app.process().pid
  if (!pid) throw new Error("Electron Main PID is unavailable")
  launchedPids.push(pid)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  return { app, page }
}

async function next(page: Page) {
  await page.locator(".wb-onboarding-primary").click()
}

async function expectStep(page: Page, index: number, title: string) {
  const card = page.locator(".wb-onboarding-card")
  await card.getByText(title, { exact: true }).waitFor({ timeout: 10_000 })
  await card.getByText(`${index} / 10`, { exact: true }).waitFor()
}

async function requireVisibleTarget(page: Page, name: string) {
  const anchor = page.locator(`[data-onboarding="${name}"]`)
  await anchor.waitFor({ state: "visible", timeout: 10_000 })
  await page.locator(".wb-onboarding-target").waitFor({ state: "visible", timeout: 10_000 })
  const overlap = await page.evaluate((selector) => {
    const anchor = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
    const target = document.querySelector<HTMLElement>(".wb-onboarding-target")?.getBoundingClientRect()
    if (!anchor || !target) return false
    return Math.abs(anchor.left - (target.left + 8)) <= 2 && Math.abs(anchor.top - (target.top + 8)) <= 2
  }, `[data-onboarding="${name}"]`)
  if (!overlap) throw new Error(`Spotlight does not frame the real ${name} target`)
}

async function close(app: ElectronApplication) {
  await app.close()
  activeApps.splice(activeApps.indexOf(app), 1)
  await new Promise((resolveWait) => setTimeout(resolveWait, 250))
}

async function assertProcessesExited(pids: number[]) {
  const alive = pids.filter((pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  })
  if (alive.length) throw new Error(`Electron test processes remain: ${alive.join(", ")}`)
}
