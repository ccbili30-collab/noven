import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const cases = {
  proMedieval: {
    title: "Growth World Pro 中世纪大型文字世界",
    instruction: `/growth_world_pro 创建一个经典、宏大、完整、能够长期经营的原创中世纪奇幻世界。

这是第一轮生产实力证明：请由你根据世界本身自然策展，不套固定目录，不用重复文字凑规模。最终形成约 3 至 5 万中文字符、25 至 40 份高密度 Markdown，具有多个可浏览集合、独立实体、直接生成依据、完整世界层次和可继续创作的故事入口。本轮只做文字世界与内容结构：不要生成图片，不要生成 HTML。稳定骨架形成后注册统一作品根；值得独立展示和持续操作的集合在入口与首个真实实体形成后立即注册，让工作台随文件束继续增长。`,
    route: "original",
    minimumMarkdown: 25,
    maximumMarkdown: 40,
    minimumCharacters: 30_000,
    minimumCollectionDirectories: 4,
    minimumEvidenceFiles: 12,
    minimumStageReports: 13,
    requireImages: false,
    prohibitImages: true,
    prohibitHtml: true,
    minimumNestedWorkbenches: 3,
    requireSources: false,
    completionTimeoutMs: 90 * 60_000,
  },
  medieval: {
    title: "极短中古原创",
    instruction: "/growth_world 创建一个中世纪世界",
    route: "original",
    minimumMarkdown: 6,
    requireImages: true,
    requireSources: false,
  },
  modernChina: {
    title: "中国近代历史架空",
    instruction: `/growth_world 创建一个中国近代历史架空世界。

约束：
1. 分歧点发生在1894年甲午战争前夕，但不允许靠超自然、穿越者或未来科技改变历史。
2. 清廷、地方督抚、士绅商人、农民、会党、列强与新式知识人的行动都必须符合各自利益，任何一方都不能突然获得现代人的全知视角。
3. 保留晚清财政、漕运、厘金、海关、铁路、电报、军工、科举、宗族、租界和国际条约的现实约束。
4. 推演到1912年前后，形成至少三条相互牵制的政治路线，不预设共和国或帝制必然胜出。
5. 明确哪些内容来自真实历史，哪些是架空分歧及其后续推演；必要时联网核对真实背景。
6. 成品需要世界导览、分歧点、时间线、主要地区、制度与经济、国内外势力、核心人物、普通人生活、当前危机和一个能体现时代矛盾的短篇故事。
7. 视觉避免影视剧影楼感，采用晚清新闻画报、历史摄影与写实插画融合的统一方向；生成一张势力与交通导览图和一张代表性场景图。
8. 让世界保持可继续写小说和角色的开放性，不要把它写成单一历史结论。`,
    route: "original",
    minimumMarkdown: 7,
    requireImages: true,
    requireSources: false,
  },
  threeBody: {
    title: "三体世界整理",
    instruction: `/growth_world 整理《三体》三部曲的完整世界设定。请自行联网按人物、组织、时代、空间、科技和关键事件分别搜索并实际读取可靠网页正文；原著全文不可访问时，继续使用可访问的官方资料、可靠百科和有明确出处的专题资料建立具体关系，不能只确认术语存在，也不能用单一影视改编代替三部曲。整理出清晰、有来源的世界导览、完整时代线、文明与空间、科技体系、组织与人物关系、关键事件与因果、版本差异。严格区分原作事实、改编差异、来源未知与模型推测；不要把补写内容冒充原作，也不要创作新的世界线或续篇。本次完成标准是形成主要世界脊柱可导航的完整档案，不是穷尽全部人物支线、精确参数、逐章考据和所有改编；这些细节可以明确列为后续扩展，但不能因此无限搜索或拒绝完成第一圈。`,
    route: "canon",
    minimumMarkdown: 8,
    requireImages: false,
    requireSources: true,
    requiredTermGroups: [
      ["叶文洁"],
      ["汪淼"],
      ["罗辑"],
      ["程心"],
      ["红岸基地", "红岸项目"],
      ["地球三体组织", "ETO", "三体组织"],
      ["面壁计划", "面壁者"],
      ["黑暗森林"],
      ["威慑纪元"],
      ["智子"],
      ["水滴"],
      ["曲率推进", "曲率驱动"],
      ["二向箔", "维度打击", "降维打击", "dimensional strike"],
      ["三体文明"],
    ],
  },
  rainWorld: {
    title: "Rain World 图片资料二创",
    instruction: `/growth_world 基于当前项目“原始资料”目录中的全部参考图片，扩展这份《Rain World》世界观二创。请先联网搜索并实际读取原作资料，确认 Rain World 的基础世界、生态循环和核心概念；再加载 Study 实际读取图片，绝对不要根据哈希文件名猜测。识别并保留图片里用户已经写出的作品名、地区名、角色名和设定，不得擅自改名。原作事实、用户二创、视觉观察、合理推断和 AI 新增必须分开；在明确分歧点上把残缺资料补成具有空间、生态、历史、行动者、当前冲突、故事与因果的完整二创世界。原图保持不变，生成的配图继承可观察到的画法与生态压迫感，但不要复制具体原图。`,
    route: "fan",
    minimumMarkdown: 7,
    requireImages: true,
    requireSources: true,
    sourceDirectory: "C:/Users/16014/Desktop/rain_world",
    requireImageReads: true,
  },
} as const

type CaseName = keyof typeof cases
const caseName = process.argv[2] as CaseName | undefined
if (!caseName || !(caseName in cases)) throw new Error(`Usage: growth-world-three-cases-live-test.ts <${Object.keys(cases).join("|")}>`)

const testCase = cases[caseName]
const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", caseName)
const resume = process.argv.includes("--resume")
const previousFailure = resume ? JSON.parse(await readFile(join(evidenceDir, "failure.json"), "utf8")) as { projectRoot: string; userData: string; goalId: string } : undefined
const projectRoot = previousFailure?.projectRoot ?? await mkdtemp(join(tmpdir(), `CreatX Growth World ${testCase.title} `))
const userData = previousFailure?.userData ?? await mkdtemp(join(tmpdir(), `creatx-growth-world-${caseName}-`))
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const growthDatabasePath = join(userData, "creatx", "growth.sqlite")
const imageDatabasePath = join(userData, "creatx", "image-queue.sqlite")
const startedAt = Date.now()
let goalId = previousFailure?.goalId ?? ""
let preserveFailure = false
let runError: unknown

if (!resume) {
  await cleanupPreviousFailureRuntime()
  await rm(evidenceDir, { recursive: true, force: true })
}
await mkdir(evidenceDir, { recursive: true })
if (!resume) {
  if ("sourceDirectory" in testCase) await cp(testCase.sourceDirectory, join(projectRoot, "原始资料"), { recursive: true })
  await writeFile(join(projectRoot, "测试要求.md"), `# ${testCase.title}\n\n${testCase.instruction}\n`, "utf8")
}

try {
  const desktop = await launchDesktop()
  try {
    await desktop.page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
    await installRuntimeTrap(desktop.page)
    const session = resume ? await requireExistingSession(desktop.page) : await createProjectSession(desktop.page)
    if (resume) {
      const existing = await waitForGoal(desktop.page, (goal) => goal.goalId === goalId, 30_000)
      if (existing.status === "waiting" || existing.status === "paused") {
        const resumed = await desktop.page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `three-cases-resume-${Date.now()}`, goalId: id }), goalId)
        if (!resumed.ok) throw new Error(`Could not resume preserved Goal: ${JSON.stringify(resumed)}`)
        console.log(JSON.stringify({ caseName, stage: "resumed", goalId, sessionId: session.id }))
      } else if (existing.status !== "completed") {
        throw new Error(`Cannot resume Goal from ${existing.status}`)
      }
    } else {
      await sendFromComposer(desktop.page, testCase.instruction)
      const started = await waitForGoal(desktop.page, (goal) => goal.status === "active", 30_000)
      goalId = started.goalId
      console.log(JSON.stringify({ caseName, stage: "started", goalId, sessionId: session.id }))
    }

    const completed = await waitForCompletion(desktop.page, "completionTimeoutMs" in testCase ? testCase.completionTimeoutMs : 45 * 60_000)
    if (completed.status !== "completed") throw new Error(`Growth World ended as ${completed.status}: ${JSON.stringify(completed)}`)
    await assertNoRuntimeErrors(desktop.page)

    const files = await listFiles(projectRoot)
    const markdown = files.filter((path) => extname(path).toLocaleLowerCase("en-US") === ".md" && basename(path) !== "测试要求.md")
    if (markdown.length < testCase.minimumMarkdown) throw new Error(`Only ${markdown.length} generated Markdown files: ${JSON.stringify(markdown.map(projectRelative))}`)
    const workbenches = await readWorkbenches()
    if (!workbenches.length) throw new Error("Growth World completed without registering a workbench")
    const workRoot = requireUnifiedWorkRoot(files, workbenches)
    if ("minimumNestedWorkbenches" in testCase) {
      const nested = workbenches.filter((workbench) => typeof workbench.folder === "string" && workbench.folder.replaceAll("\\", "/").startsWith(`${workRoot}/`))
      if (nested.length < testCase.minimumNestedWorkbenches) {
        throw new Error(`Growth World Pro registered only ${nested.length} mature collection workbenches: ${JSON.stringify(workbenches)}`)
      }
    }
    const spine = await validateWorldSpine(markdown, workRoot, testCase.route, !("prohibitImages" in testCase && testCase.prohibitImages))
    const images = readImageEvidence()
    if (testCase.requireImages && !images.some((image) => image.status === "succeeded")) throw new Error(`No successful queued image: ${JSON.stringify(images)}`)
    if ("prohibitImages" in testCase && testCase.prohibitImages && images.length) throw new Error(`Growth World Pro unexpectedly submitted image tasks: ${JSON.stringify(images)}`)
    await verifyImages(images.filter((image) => image.status === "succeeded").map((image) => image.relativePath))
    const html = files.filter((path) => [".html", ".htm"].includes(extname(path).toLocaleLowerCase("en-US")))
    if ("prohibitHtml" in testCase && testCase.prohibitHtml && html.length) throw new Error(`Growth World Pro unexpectedly generated HTML: ${JSON.stringify(html.map(projectRelative))}`)
    const proEvidence = "minimumCharacters" in testCase
      ? await validateProWorld(markdown, workRoot, testCase)
      : undefined
    const urls = await readSourceUrls(markdown)
    if (testCase.requireSources && urls.length < 2) throw new Error(`Existing-work整理没有留下至少两个实际来源 URL: ${JSON.stringify(urls)}`)
    if ("requiredTermGroups" in testCase) {
      const content = (await Promise.all(markdown.map((path) => readFile(path, "utf8")))).join("\n")
      const missingTermGroups = testCase.requiredTermGroups.filter((terms) => !terms.some((term) => content.toLocaleLowerCase("en-US").includes(term.toLocaleLowerCase("en-US"))))
      if (missingTermGroups.length) throw new Error(`World content is missing required semantic anchor groups: ${JSON.stringify(missingTermGroups)}`)
    }
    const liveTools = await desktop.page.evaluate(() => (window as unknown as { __creatxGrowthWorldTools?: string[] }).__creatxGrowthWorldTools ?? [])
    const tools = [...new Set([...liveTools, ...await readHistoricalToolNames(session.id)])]
    if ("requireImageReads" in testCase && testCase.requireImageReads && !tools.includes("read_files")) throw new Error(`图片二创没有实际调用 read_files: ${JSON.stringify(tools)}`)

    const preview = await selectMarkdownPreview(desktop.page, markdown[0]!)
    await desktop.page.screenshot({ path: join(evidenceDir, "completed.png"), timeout: 90_000 })
    const result = {
      status: "ELECTRON GROWTH WORLD LIVE PASS",
      caseName,
      title: testCase.title,
      provider: "openai-compatible",
      model: "gpt-5.6-luna",
      goalId,
      goalVersion: completed.version,
      stageReports: readReceiptCount(),
      markdownFiles: markdown.map(projectRelative),
      images,
      workbenches,
      worldSpine: spine,
      ...(proEvidence ? { proEvidence } : {}),
      sourceUrls: urls,
      tools,
      preview,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    }
    await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
    await copyProjectEvidence()
    await Promise.all([
      rm(join(evidenceDir, "failure.json"), { force: true }),
      rm(join(evidenceDir, "failure.png"), { force: true }),
      rm(join(evidenceDir, "lifecycle-failure.json"), { force: true }),
    ])
    console.log(JSON.stringify(result))
  } catch (error) {
    runError = error
    preserveFailure = true
    await desktop.page.screenshot({ path: join(evidenceDir, "failure.png"), timeout: 90_000 }).catch(() => undefined)
    await preserveDiagnostics(error)
    throw error
  } finally {
    try {
      await closeAndAssert(desktop.app, desktop.pid)
    } catch (error) {
      preserveFailure = true
      await preserveLifecycleDiagnostics(error)
      if (!runError) throw error
    }
  }
} finally {
  if (!preserveFailure) await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
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
      CREATX_IMAGE_BASE_URL: providerBaseUrl,
      CREATX_IMAGE_API_KEY: providerApiKey,
    },
  })
  const pid = app.process().pid
  if (!pid) throw new Error("Electron main process did not expose a PID")
  return { app, pid, page: await app.firstWindow() }
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    const tools: string[] = []
    Object.defineProperty(window, "__creatxGrowthWorldErrors", { value: errors, configurable: true })
    Object.defineProperty(window, "__creatxGrowthWorldTools", { value: tools, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
      if (event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "streaming") tools.push(event.item.toolName ?? "")
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxGrowthWorldErrors?: string[] }).__creatxGrowthWorldErrors ?? [])
  if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
  if (await page.getByRole("dialog").count()) throw new Error("Free Growth World displayed an approval dialog")
}

async function requireFreeProjectSession(page: Page) {
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (!result.ok) throw new Error(result.error.message)
    const session = result.value.sessions[0]
    if (!session) {
      await page.waitForTimeout(250)
      continue
    }
    if (session.kind !== "project" || session.permission.mode !== "free") throw new Error(`Expected free project session: ${JSON.stringify(session)}`)
    return session
  }
  throw new Error("Timed out waiting for a project session")
}

async function createProjectSession(page: Page) {
  await page.getByTitle("新会话").click()
  return requireFreeProjectSession(page)
}

async function requireExistingSession(page: Page) {
  return requireFreeProjectSession(page)
}

async function sendFromComposer(page: Page, prompt: string) {
  await page.locator("textarea").fill(prompt)
  await page.getByTitle("发送").click()
}

type Goal = { goalId: string; status: string; version: number; statusReason?: string }

async function waitForGoal(page: Page, predicate: (goal: Goal) => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await page.evaluate(async () => window.creatx.bootstrap())
    if (result.ok && result.value.growth && predicate(result.value.growth)) return result.value.growth
    await page.waitForTimeout(500)
  }
  throw new Error("Timed out waiting for Growth World Goal")
}

async function waitForCompletion(page: Page, timeoutMs: number) {
  const started = Date.now()
  let lastVersion = -1
  let imageResumeCount = resume ? 1 : 0
  while (Date.now() - started < timeoutMs) {
    const goal = await waitForGoal(page, (candidate) => candidate.goalId === goalId, 10_000)
    if (goal.version !== lastVersion) {
      console.log(JSON.stringify({ caseName, stage: "progress", goal, reports: readReceiptCount(), images: readImageEvidence().map((image) => image.status) }))
      lastVersion = goal.version
    }
    await assertNoRuntimeErrors(page)
    if (["completed", "failed", "cancelled", "paused"].includes(goal.status)) return goal
    if (goal.status === "waiting") {
      const images = readImageEvidence()
      if (!images.length) return goal
      if (images.some((image) => image.status === "queued" || image.status === "generating")) {
        await page.waitForTimeout(2_000)
        continue
      }
      if (imageResumeCount >= 3) throw new Error(`Growth World repeatedly waited after image attempts settled: ${JSON.stringify({ goal, images })}`)
      const resumed = await page.evaluate(async (id) => window.creatx.resumeGrowth({ requestId: `three-cases-retry-${Date.now()}`, goalId: id }), goalId)
      if (!resumed.ok) throw new Error(`Could not resume after image attempts settled: ${JSON.stringify(resumed)}`)
      imageResumeCount += 1
    }
    await page.waitForTimeout(2_000)
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes`)
}

function readReceiptCount() {
  const database = new DatabaseSync(growthDatabasePath, { readOnly: true })
  try {
    const row = database.prepare("SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?").get(goalId) as unknown as { count: number }
    return Number(row.count)
  } finally {
    database.close()
  }
}

interface ImageEvidence { relativePath: string; prompt: string; model: string; status: string; errorCode?: string }

function readImageEvidence(): ImageEvidence[] {
  if (!fileExistsSync(imageDatabasePath)) return []
  const database = new DatabaseSync(imageDatabasePath, { readOnly: true })
  try {
    return (database.prepare("SELECT relative_path, prompt, model, status, error_code FROM image_task ORDER BY queue_sequence").all() as unknown as Array<{ relative_path: string; prompt: string; model: string; status: string; error_code: string | null }>).map((row) => ({
      relativePath: row.relative_path,
      prompt: row.prompt,
      model: row.model,
      status: row.status,
      ...(row.error_code ? { errorCode: row.error_code } : {}),
    }))
  } finally {
    database.close()
  }
}

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory).catch(() => [])
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as { id?: string; title?: string; folder?: string }))
}

async function readSourceUrls(files: string[]) {
  const contents = await Promise.all(files.map((path) => readFile(path, "utf8")))
  return [...new Set(contents.flatMap((content) => content.match(/https?:\/\/[^\s\]>"']+/g) ?? []).map(trimUrlPunctuation))]
}

function trimUrlPunctuation(input: string) {
  let value = input.replace(/[.,;，。；]+$/, "")
  while ((value.match(/\(/g)?.length ?? 0) < (value.match(/\)/g)?.length ?? 0)) value = value.slice(0, -1)
  return value
}

async function readHistoricalToolNames(sessionId: string) {
  const path = join(userData, "cline", "sessions", sessionId, `${sessionId}.messages.json`)
  const session = JSON.parse(await readFile(path, "utf8")) as { messages?: Array<{ content?: unknown }> }
  return (session.messages ?? []).flatMap((message) => Array.isArray(message.content)
    ? message.content.flatMap((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "tool_use" && typeof (block as { name?: unknown }).name === "string" ? [(block as { name: string }).name] : [])
    : [])
}

function requireUnifiedWorkRoot(files: string[], workbenches: Array<{ folder?: string }>) {
  const generated = files.map(projectRelative).filter((path) => path !== "测试要求.md" && !path.startsWith("原始资料/"))
  const folders = workbenches.flatMap((workbench) => typeof workbench.folder === "string" && workbench.folder !== "." ? [workbench.folder.replaceAll("\\", "/").replace(/\/$/, "")] : [])
  const root = folders.find((folder) => generated.every((path) => path.startsWith(`${folder}/`)))
  if (!root) throw new Error(`Generated content is not contained by one registered work root: ${JSON.stringify({ folders, generated })}`)
  return root
}

async function validateWorldSpine(markdown: string[], workRoot: string, route: "original" | "canon" | "fan", requireVisual: boolean) {
  const relativeMarkdown = markdown.map(projectRelative)
  const stableFiles = ["世界导览.md", "世界真相.md", "世界骨架.md"].map((name) => `${workRoot}/${name}`)
  const missingStableFiles = stableFiles.filter((path) => !relativeMarkdown.includes(path))
  if (missingStableFiles.length) throw new Error(`Growth World is missing stable spine files: ${JSON.stringify(missingStableFiles)}`)

  const skeleton = await readFile(join(projectRoot, workRoot, "世界骨架.md"), "utf8")
  const spineTermGroups = [
    ["空间结构", "空间骨架"],
    ["运行系统", "权力骨架", "资源骨架", "规则骨架", "生活骨架"],
    ["时间结构", "时间骨架"],
    ["行动者", "人物骨架"],
    ["当前局势", "当前的", "当下的火种", "同一个冬天"],
    ["叙事入口", "故事骨架", "故事线"],
    ["因果脊柱", "因果顺序", "因果关系"],
    ...(requireVisual ? [["视觉体系", "视觉方向", "视觉风格"]] : []),
  ]
  const missingSpineTermGroups = spineTermGroups.filter((terms) => !terms.some((term) => skeleton.includes(term)))
  if (missingSpineTermGroups.length) throw new Error(`世界骨架.md does not cover the universal world spine: ${JSON.stringify(missingSpineTermGroups)}`)

  const contents = (await Promise.all(markdown.map((path) => readFile(path, "utf8")))).join("\n")
  const routeTerms = route === "original"
    ? ["原创世界"]
    : route === "canon"
      ? ["原著整理", "原作事实", "版本", "未知"]
      : ["二创扩展", "原作事实", "用户二创", "AI 二创推演"]
  const missingRouteTerms = routeTerms.filter((term) => !contents.includes(term))
  if (missingRouteTerms.length) throw new Error(`Growth World route evidence is incomplete: ${JSON.stringify({ route, missingRouteTerms })}`)
  return { route, workRoot, stableFiles, spineTermGroups, routeTerms }
}

async function validateProWorld(markdown: string[], workRoot: string, requirements: {
  minimumCharacters: number
  maximumMarkdown: number
  minimumCollectionDirectories: number
  minimumEvidenceFiles: number
  minimumStageReports: number
}) {
  const documents = await Promise.all(markdown.map(async (path) => ({ path, content: await readFile(path, "utf8") })))
  if (documents.length > requirements.maximumMarkdown) {
    throw new Error(`Growth World Pro exceeded the bounded first-round file count: ${documents.length} > ${requirements.maximumMarkdown}`)
  }
  const contentCharacters = documents
    .filter((document) => basename(document.path) !== "创作计划.md")
    .reduce((total, document) => total + document.content.replace(/\s/g, "").length, 0)
  if (contentCharacters < requirements.minimumCharacters) {
    throw new Error(`Growth World Pro produced only ${contentCharacters} non-whitespace content characters`)
  }
  const superficialFiles = documents.filter((document) => document.content.replace(/\s/g, "").length < 300).map((document) => projectRelative(document.path))
  if (superficialFiles.length) throw new Error(`Growth World Pro contains superficial files: ${JSON.stringify(superficialFiles)}`)

  const collectionDirectories = new Set(documents.flatMap((document) => {
    const path = projectRelative(document.path)
    const insideRoot = path.startsWith(`${workRoot}/`) ? path.slice(workRoot.length + 1) : ""
    const [directory, child] = insideRoot.split("/")
    return directory && child ? [directory] : []
  }))
  if (collectionDirectories.size < requirements.minimumCollectionDirectories) {
    throw new Error(`Growth World Pro formed only ${collectionDirectories.size} collection directories: ${JSON.stringify([...collectionDirectories])}`)
  }

  const plan = documents.find((document) => basename(document.path) === "创作计划.md")
  if (!plan || !plan.content.includes("内容地图") || !plan.content.includes("文件束队列")) {
    throw new Error("Growth World Pro did not preserve a readable content map and file bundle queue")
  }
  const evidenceFiles = documents.filter((document) => document.content.includes("生成依据"))
  if (evidenceFiles.length < requirements.minimumEvidenceFiles) {
    throw new Error(`Only ${evidenceFiles.length} files record direct generation evidence`)
  }
  const stageReports = readReceiptCount()
  if (stageReports < requirements.minimumStageReports) {
    throw new Error(`Growth World Pro completed after only ${stageReports} stage reports`)
  }
  return {
    contentCharacters,
    markdownFiles: documents.length,
    collectionDirectories: [...collectionDirectories].sort((left, right) => left.localeCompare(right, "zh-CN")),
    evidenceFiles: evidenceFiles.length,
    stageReports,
  }
}

async function verifyImages(paths: string[]) {
  for (const path of paths) {
    const target = resolve(projectRoot, path)
    const projectPath = relative(projectRoot, target)
    if (!projectPath || projectPath.startsWith("..")) throw new Error(`Image escaped project: ${path}`)
    const info = await stat(target)
    if (!info.isFile() || info.size < 1_000) throw new Error(`Image missing or empty: ${path}`)
    const escaped = target.replaceAll("'", "''")
    const command = `Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Image]::FromFile('${escaped}'); try { Write-Output ($image.Width.ToString() + 'x' + $image.Height.ToString()) } finally { $image.Dispose() }`
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", command])
    if (!/^\d+x\d+$/.test(stdout.trim())) throw new Error(`Windows could not decode ${path}`)
  }
}

async function selectMarkdownPreview(page: Page, path: string) {
  const tab = page.getByRole("tab", { name: "文件", exact: true })
  if (!await tab.isVisible()) await page.getByTitle("展开右侧工具").click()
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click()
  await page.locator(".file-row", { hasText: basename(path) }).first().click()
  const fullPreview = page.locator(".document-page pre")
  const smallPreview = page.locator(".small-document p")
  await fullPreview.or(smallPreview).first().waitFor({ timeout: 30_000 })
  const full = await fullPreview.isVisible()
  const preview = await (full ? fullPreview : smallPreview).textContent()
  const disk = await readFile(path, "utf8")
  const expected = full ? disk : disk.slice(0, 120)
  if (preview?.replaceAll("\r\n", "\n") !== expected.replaceAll("\r\n", "\n")) throw new Error(`Preview differs from disk: ${path}`)
  return projectRelative(path)
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => entry.name !== ".creatx").map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

function projectRelative(path: string) {
  return relative(projectRoot, path).replaceAll("\\", "/")
}

async function copyProjectEvidence() {
  const target = join(evidenceDir, "project")
  await rm(target, { recursive: true, force: true })
  await cp(projectRoot, target, { recursive: true })
}

async function cleanupPreviousFailureRuntime() {
  const failure = await readFile(join(evidenceDir, "failure.json"), "utf8")
    .then((content) => JSON.parse(content) as { projectRoot?: string; userData?: string }, () => undefined)
  if (!failure) return
  const temporaryRoot = resolve(tmpdir())
  const targets = [failure.projectRoot, failure.userData].flatMap((path) => typeof path === "string" ? [resolve(path)] : [])
  for (const target of targets) {
    const fromTemp = relative(temporaryRoot, target)
    if (!fromTemp || fromTemp.startsWith("..") || resolve(temporaryRoot, fromTemp) !== target) {
      throw new Error(`Refusing to remove previous Growth World runtime outside the temporary directory: ${target}`)
    }
    await rm(target, { recursive: true, force: true })
  }
}

async function preserveDiagnostics(error: unknown) {
  await copyProjectEvidence().catch(() => undefined)
  await writeFile(join(evidenceDir, "failure.json"), `${JSON.stringify({
    caseName,
    error: error instanceof Error ? error.message : String(error),
    goalId,
    projectRoot,
    userData,
    stageReports: goalId && fileExistsSync(growthDatabasePath) ? readReceiptCount() : 0,
    images: readImageEvidence(),
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  }, null, 2)}\n`, "utf8")
}

async function preserveLifecycleDiagnostics(error: unknown) {
  await writeFile(join(evidenceDir, "lifecycle-failure.json"), `${JSON.stringify({
    caseName,
    error: error instanceof Error ? error.message : String(error),
    goalId,
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

function fileExistsSync(path: string) {
  try {
    const database = new DatabaseSync(path, { readOnly: true })
    database.close()
    return true
  } catch {
    return false
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
