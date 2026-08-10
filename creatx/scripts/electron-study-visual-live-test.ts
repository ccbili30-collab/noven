import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 诡秘 Study 项目 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-study-visual-live-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "study-runtime", "visual")
const researchDirectory = join(projectRoot, "研究")
const generatedImage = join(researchDirectory, "风格实验.png")
const referenceOne = join(projectRoot, "随手放的", "IMG_1024.jpg")
const referenceTwo = join(projectRoot, "旧文件", "asset-final.jpeg")
const studyPrompt = "/study 学习当前项目里的资料和参考图片。"
const imagePrompt = "根据刚才 Study 形成的研究文件，生成一张原创的维多利亚时代神秘学城市调查者角色卡。严格保持研究中提炼的二维插画媒介、绘画笔触、纸张颗粒、卡牌装帧、边框与系列构图，以及色彩和光影；人物身份、姿态、道具和符号必须原创，不复制参考图的具体角色或像素。不要生成照片写实、电影剧照或电影概念图。保存为 研究/风格实验.png。"

await mkdir(evidenceDir, { recursive: true })
await preparePublicMaterials()
const sourceSnapshot = await snapshotSources()

try {
  const desktop = await launchDesktop()
  try {
    await assertHealthyWindow(desktop.page)
    await desktop.page.getByTitle("新会话").click()
    await desktop.page.locator(".session-tree-row").first().waitFor({ timeout: 30_000 })
    await sendAndWait(desktop.page, studyPrompt, 360_000)
    await assertSourcesUnchanged(sourceSnapshot)

    const studyFiles = (await readdir(researchDirectory)).filter((name) => name.endsWith(".md"))
    if (!studyFiles.length) throw new Error("Visual Study did not create a Markdown artifact")
    const studyContent = (await Promise.all(studyFiles.map((name) => readFile(join(researchDirectory, name), "utf8")))).join("\n")
    await writeFile(join(evidenceDir, "study-output-latest.md"), studyContent, "utf8")
    requireVisualStudy(studyContent)
    const studyToolNames = await desktop.page.locator(".agent-operation strong").allTextContents()
    if (!studyToolNames.includes("skills") || !studyToolNames.includes("注册工作台")) {
      throw new Error(`Visual Study did not load its Skill and register the result: ${JSON.stringify(studyToolNames)}`)
    }
    if (!studyToolNames.includes("读取文件")) throw new Error(`Visual Study did not inspect project images through read_files: ${JSON.stringify(studyToolNames)}`)

    await sendAndWait(desktop.page, imagePrompt, 300_000)
    await waitForFile(generatedImage, 30_000)
    await assertSourcesUnchanged(sourceSnapshot)
    const toolNames = await desktop.page.locator(".agent-operation strong").allTextContents()
    if (!toolNames.includes("生成图片")) {
      throw new Error(`Visual generation did not use the real image tool: ${JSON.stringify(toolNames)}`)
    }

    const workbenchButton = desktop.page.locator(".workbench-button").filter({ hasText: /研究|Study|学习/ }).first()
    await workbenchButton.click()
    await desktop.page.locator(".files-workbench").waitFor()
    await desktop.page.locator(".workbench-file-list .file-row", { hasText: "风格实验.png" }).click()
    const preview = desktop.page.locator(".large-map img")
    await preview.waitFor()
    const decoded = await preview.evaluate((image) => ({ width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight }))
    if (decoded.width < 1 || decoded.height < 1) throw new Error(`Generated preview did not decode: ${JSON.stringify(decoded)}`)
    await desktop.page.screenshot({ path: join(evidenceDir, "electron-study-visual-live.png"), timeout: 90_000 })

    await Promise.all([
      copyFile(referenceOne, join(evidenceDir, "reference-klein.jpg")),
      copyFile(referenceTwo, join(evidenceDir, "reference-tarot-club.jpeg")),
      copyFile(generatedImage, join(evidenceDir, "generated-style-experiment.png")),
      writeFile(join(evidenceDir, "study-output.md"), studyContent, "utf8"),
    ])
    const comparison = await compareImages(referenceOne, referenceTwo, generatedImage)
    await writeFile(join(evidenceDir, "visual-comparison.md"), `# 视觉对照\n\n${comparison}\n`, "utf8")
    console.log(JSON.stringify({
      status: "ELECTRON STUDY VISUAL LIVE PASS",
      provider: "JMRAI gpt-5.6-luna",
      publicSources: 5,
      studyFiles,
      generated: "研究/风格实验.png",
      preview: decoded,
      sourcePreserved: true,
      evidence: ["reference-klein.jpg", "reference-tarot-club.jpeg", "generated-style-experiment.png", "study-output.md", "visual-comparison.md", "electron-study-visual-live.png"],
    }))
  } catch (error) {
    await desktop.page.screenshot({ path: join(evidenceDir, "electron-study-visual-live-failure.png") }).catch(() => undefined)
    throw error
  } finally {
    await closeAndAssert(desktop.app, desktop.pid)
  }
} finally {
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function preparePublicMaterials() {
  const wikiDirectory = join(projectRoot, "零散资料", "临时")
  await Promise.all([mkdir(wikiDirectory, { recursive: true }), mkdir(join(projectRoot, "随手放的"), { recursive: true }), mkdir(join(projectRoot, "旧文件"), { recursive: true })])
  const pages = await Promise.all(["Pathways", "Klein Moretti", "Tarot Club"].map(fetchWikiText))
  await Promise.all([
    writeFile(join(wikiDirectory, "a-final-final.txt"), sourceNote("Pathways", pages[0]!), "utf8"),
    writeFile(join(projectRoot, "未分类角色资料.md"), sourceNote("Klein Moretti", pages[1]!), "utf8"),
    writeFile(join(projectRoot, "旧文件", "不知道放哪.txt"), sourceNote("Tarot Club", pages[2]!), "utf8"),
    downloadImage("https://static.wikia.nocookie.net/lord-of-the-mystery/images/4/4c/Klein_Moretti_Official.jpg/revision/latest?cb=20201017102316", referenceOne),
    downloadImage("https://static.wikia.nocookie.net/lord-of-the-mystery/images/8/88/The_World.jpeg/revision/latest?cb=20230911232245", referenceTwo),
  ])
}

async function fetchWikiText(page: string) {
  const url = new URL("https://lordofthemysteries.fandom.com/api.php")
  url.search = new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json", origin: "*" }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Fandom ${page} returned HTTP ${response.status}`)
  const payload = await response.json() as { parse?: { wikitext?: { "*"?: string } } }
  const text = payload.parse?.wikitext?.["*"]?.trim()
  if (!text) throw new Error(`Fandom ${page} returned no wikitext`)
  return text.slice(0, 3_500)
}

function sourceNote(page: string, body: string) {
  return `公开来源：https://lordofthemysteries.fandom.com/wiki/${encodeURIComponent(page.replaceAll(" ", "_"))}\n抓取用途：临时 Study Live 资料样本\n\n${body}`
}

async function downloadImage(url: string, path: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Reference image returned HTTP ${response.status}`)
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) throw new Error(`Reference URL did not return an image: ${contentType}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 10_000) throw new Error(`Reference image is unexpectedly small: ${bytes.length}`)
  await writeFile(path, bytes)
}

async function snapshotSources() {
  const paths = [
    join(projectRoot, "零散资料", "临时", "a-final-final.txt"),
    join(projectRoot, "未分类角色资料.md"),
    join(projectRoot, "旧文件", "不知道放哪.txt"),
    referenceOne,
    referenceTwo,
  ]
  return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(path)] as const)))
}

async function assertSourcesUnchanged(snapshot: ReadonlyMap<string, Buffer>) {
  await Promise.all([...snapshot].map(async ([path, expected]) => {
    if (!expected.equals(await readFile(path))) throw new Error(`Study changed source material ${path}`)
  }))
}

function requireVisualStudy(content: string) {
  if (content.trim().length < 800) throw new Error("Visual Study output is too short")
  if (!/(途径|序列|Pathway|Beyonder)/i.test(content)) throw new Error("Study did not understand the power system")
  if (!/(克莱恩|Klein|塔罗会|Tarot)/i.test(content)) throw new Error("Study did not understand the supplied characters or organization")
  if (!/(文风|叙事|节奏|句式)/.test(content)) throw new Error("Study did not analyze writing style")
  if (!/(视觉|构图|光影|色彩)/.test(content)) throw new Error("Study did not analyze the reference images")
  if (!/(媒介|笔触|画法)/.test(content)) throw new Error("Study did not preserve the reference medium or brushwork")
  if (!/(装帧|边框|卡牌)/.test(content)) throw new Error("Study did not preserve the reference framing")
  if (!/(Prompt|提示词)/i.test(content)) throw new Error("Study did not create reusable image guidance")
  if (/无法读取图片|没有图片|未看到图片/.test(content)) throw new Error("Vision-capable Study incorrectly claimed the reference images were unavailable")
}

async function sendAndWait(page: Page, prompt: string, timeout: number) {
  await page.locator("textarea").fill(prompt)
  await page.getByTitle("发送").click()
  await page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
  await page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout })
}

async function waitForFile(path: string, timeout: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    try {
      await readFile(path)
      return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
  }
  throw new Error(`Timed out waiting for ${path}`)
}

async function compareImages(first: string, second: string, generated: string) {
  const images = await Promise.all([first, second, generated].map(async (path) => `data:image/${path.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path)).toString("base64")}`))
  const response = await fetch(`${providerBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${providerApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      messages: [{ role: "user", content: [
        { type: "text", text: "前两张是参考图，第三张是 Study 后生成的新图。严格按六个独立维度比较第三张与参考图：题材、色彩、光影、构图、媒介/笔触、装帧。给出每项 0-10 分和综合分，并说明主要相似点与明显差异。题材或氛围相同不能补偿媒介、笔触、构图或装帧不同。" },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ] }],
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(240_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Visual comparison returned HTTP ${response.status}: ${text.slice(0, 300)}`)
  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
  const result = payload.choices?.[0]?.message?.content?.trim()
  if (!result) throw new Error("Visual comparison returned no content")
  return result
}

async function launchDesktop() {
  const app = await electron.launch({
    executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
    args: [workspace, `--user-data-dir=${userData}`],
    cwd: workspace,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CREATX_PROJECT_ROOT: projectRoot,
      CREATX_PROVIDER_ID: "openai-compatible",
      CREATX_MODEL_ID: "gpt-5.6-luna",
      CREATX_PROVIDER_BASE_URL: providerBaseUrl,
      CREATX_PROVIDER_API_KEY: providerApiKey,
      CREATX_IMAGE_BASE_URL: providerBaseUrl,
      CREATX_IMAGE_API_KEY: providerApiKey,
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

async function closeAndAssert(app: ElectronApplication, pid: number) {
  const closed = await Promise.race([app.close().then(() => true), new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 15_000))])
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
  if (!value) throw new Error(`ELECTRON STUDY VISUAL LIVE FAIL: ${name} is not configured`)
  return value
}
