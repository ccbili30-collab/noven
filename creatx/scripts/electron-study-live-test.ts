import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Study 验收项目 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-study-live-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "study-runtime")
const sourceDirectory = join(projectRoot, "素材")
const researchDirectory = join(projectRoot, "研究")
const workbenchDirectory = join(projectRoot, ".creatx", "workbenches")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const prompt = "/study 主动学习项目里的“素材”目录。请整理它的设定组织方法、文风和可复用的生图 Prompt；这些资料没有图片，不要虚构已经看过画面。把学习结果写进研究目录并注册研究工作台。"
const sources = new Map([
  ["世界碎片.md", `# 雾潮群岛

雾潮群岛漂浮在永夜海上。岛屿依靠埋入岩层的潮汐钟保持高度；每次铜铃倒响，城市会下降一层，旧街因此逐渐沉进云海。

岛上的身份不是由血统决定，而由一个人能够听见哪一种钟声决定。听见低钟的人维护浮岛，听见高钟的人记录天气，听不见钟声的人负责在岛屿之间航行。
`],
  ["人物草稿.md", `# 岑雨

岑雨是最后一位听不见钟声的领航员。她随身带着一枚不会发声的铜铃，相信它来自已经坠落的第十三座岛。她害怕的不是坠落，而是某天终于听见一座城市要求她留下。
`],
  ["片段一.md", `雨从云海下面升上来。

岑雨把手伸出船舷，水珠沿着指节向天空滑去。远处的铜铃没有响，整座城却缓慢地矮了一寸。她没有提醒任何人，只把那枚哑铃握得更紧。

“今晚别点灯。”她说。

甲板上的孩子问为什么。岑雨望着逐渐发亮的雾，没有回答。
`],
  ["片段二.md", `桥在凌晨长出第三道影子。

守钟人逐段熄灭路灯，像替一条巨兽合上眼睛。岑雨从影子之间走过，鞋底没有声音。她知道有人跟着她，也知道那人还没有决定自己是谁。

铜铃倒响了一次。

这次，城里所有的鸟都落向天空。
`],
])

await mkdir(sourceDirectory, { recursive: true })
await mkdir(evidenceDir, { recursive: true })
await Promise.all([...sources].map(([name, content]) => writeFile(join(sourceDirectory, name), content, "utf8")))

try {
  const first = await launchDesktop()
  let researchFile = ""
  let workbenchTitle = "研究"
  try {
    await assertHealthyWindow(first.page)
    await first.page.getByTitle("新会话").click()
    await first.page.locator(".session-tree-row").first().waitFor({ timeout: 30_000 })
    await first.page.locator("textarea").fill(prompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    await first.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 180_000 })

    await assertSourcesUnchanged()
    const researchFiles = (await readdir(researchDirectory)).filter((name) => name.endsWith(".md"))
    if (!researchFiles.length) throw new Error("Study did not create a Markdown artifact in 研究/")
    const contents = await Promise.all(researchFiles.map((name) => readFile(join(researchDirectory, name), "utf8")))
    const combined = contents.join("\n")
    requireMeaningfulStudy(combined)
    researchFile = researchFiles[0]!

    const record = await readWorkbenchRecord()
    if (record.folder !== "研究") throw new Error(`Study registered an unexpected workbench: ${JSON.stringify(record)}`)
    workbenchTitle = typeof record.title === "string" && record.title.trim() ? record.title : "研究"
    const toolNames = await first.page.locator(".agent-operation strong").allTextContents()
    if (!toolNames.includes("skills") || !toolNames.includes("注册工作台")) {
      throw new Error(`Study did not load its Skill and register the result: ${JSON.stringify(toolNames)}`)
    }

    await first.page.locator(".workbench-button", { hasText: workbenchTitle }).click()
    await first.page.locator(".files-workbench").waitFor()
    await first.page.locator(".workbench-header strong", { hasText: workbenchTitle }).waitFor()
    await first.page.locator(".workbench-file-list .file-row", { hasText: basename(researchFile) }).click()
    await first.page.locator(".document-page pre").waitFor()
    const preview = await first.page.locator(".document-page pre").textContent()
    if (!preview?.trim()) throw new Error("Study workbench preview is empty")
    await first.page.screenshot({ path: join(evidenceDir, "electron-study-live.png"), timeout: 90_000 })
  } catch (error) {
    await first.page.screenshot({ path: join(evidenceDir, "electron-study-live-failure.png") }).catch(() => undefined)
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid)
  }

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    await second.page.locator(".message.user", { hasText: "/study" }).waitFor({ timeout: 30_000 })
    await second.page.locator(".workbench-button", { hasText: workbenchTitle }).click()
    await second.page.locator(".files-workbench").waitFor()
    await second.page.locator(".workbench-file-list .file-row", { hasText: basename(researchFile) }).click()
    await second.page.locator(".document-page pre").waitFor()
    requireMeaningfulStudy((await second.page.locator(".document-page pre").textContent()) ?? "")
    await assertSourcesUnchanged()
    await second.page.screenshot({ path: join(evidenceDir, "electron-study-restarted.png"), timeout: 90_000 })
  } finally {
    await closeAndAssert(second.app, second.pid)
  }

  console.log(JSON.stringify({
    status: "ELECTRON STUDY LIVE PASS",
    provider: "JMRAI gpt-5.6-luna",
    sourceFiles: sources.size,
    researchFile,
    workbench: workbenchTitle,
    sourcePreserved: true,
    restart: true,
    screenshots: ["electron-study-live.png", "electron-study-restarted.png"],
  }))
} finally {
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function launchDesktop() {
  const app = await electron.launch({
    executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
    args: [workspace, `--user-data-dir=${userData}`],
    cwd: workspace,
    env: {
      ...inheritedEnvironment,
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

async function assertHealthyWindow(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  if (pageErrors.length || consoleErrors.length) throw new Error(`Renderer errors: ${JSON.stringify({ pageErrors, consoleErrors })}`)
}

async function assertSourcesUnchanged() {
  await Promise.all([...sources].map(async ([name, content]) => {
    if ((await readFile(join(sourceDirectory, name), "utf8")) !== content) throw new Error(`Study changed source file ${name}`)
  }))
}

function requireMeaningfulStudy(content: string) {
  if (content.trim().length < 500) throw new Error("Study result is too short to be reusable")
  if (!/(雾潮|潮汐钟|岑雨)/.test(content)) throw new Error("Study result is not grounded in the supplied setting")
  if (!/(设定|世界规则|组织方法)/.test(content)) throw new Error("Study result does not explain the setting method")
  if (!/(文风|叙事|句式|节奏)/.test(content)) throw new Error("Study result does not explain the writing style")
  if (!/(Prompt|提示词)/i.test(content)) throw new Error("Study result does not include reusable image-generation guidance")
}

async function readWorkbenchRecord() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30_000) {
    try {
      const names = (await readdir(workbenchDirectory)).filter((name) => /^wb_.+\.json$/.test(name))
      if (names.length === 1) return JSON.parse(await readFile(join(workbenchDirectory, names[0]!), "utf8")) as Record<string, unknown>
    } catch {
      // Registration creates the directory after the Study artifacts exist.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
  }
  throw new Error("Timed out waiting for the Study workbench record")
}

async function closeAndAssert(app: ElectronApplication, pid: number) {
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 15_000)),
  ])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 15 seconds`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
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
  if (!value) throw new Error(`ELECTRON STUDY LIVE FAIL: ${name} is not configured`)
  return value
}
