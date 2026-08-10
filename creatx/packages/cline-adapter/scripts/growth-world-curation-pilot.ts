import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import {
  ClineCore,
  CoreSessionService,
  SqliteSessionStore,
} from "@cline/sdk"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const MODEL_ID = "gpt-5.6-luna"
const MAX_CASE_CHARACTERS = 42_000
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const evidenceDir = resolve(import.meta.dirname, "../../../../artifacts/growth-world-curation-pilot/2026-07-29")
const outputRoot = join(evidenceDir, "results")
const dataDir = join(evidenceDir, "runtime")
const requestBodies: string[] = []
const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(dataDir, "sessions") })
const dispatcher = new EnvHttpProxyAgent()
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-curation-pilot",
  distinctId: "creatx-growth-world-curation-pilot",
  sessionService,
  fetch: createProviderFetch(dispatcher, requestBodies),
  capabilities: {
    requestToolApproval: () => ({ approved: false, reason: "This experiment does not permit tools" }),
  },
})

const cases = [
  {
    id: "classic-original",
    title: "经典中世纪原创世界",
    route: "original",
    sourceRoot: resolve(import.meta.dirname, "../../../../artifacts/growth-world-pro-classic-pilot/2026-07-29/project"),
  },
  {
    id: "three-body",
    title: "《三体》原著世界整理",
    route: "source",
    sourceRoot: resolve(import.meta.dirname, "../../../../artifacts/growth-world-live/threeBody/project/三体三部曲世界档案"),
  },
  {
    id: "rain-world-fanwork",
    title: "Rain World 弥天大雾二创",
    route: "fanwork",
    sourceRoot: resolve(import.meta.dirname, "../../../../artifacts/growth-world-live/rainWorld/project/弥天大雾世界"),
  },
] as const

try {
  await mkdir(outputRoot, { recursive: true })
  const results = []
  for (const item of cases) {
    const source = await readCaseSource(item.sourceRoot)
    const planPath = join(outputRoot, item.id, "策展计划.json")
    const session = await exists(planPath)
      ? undefined
      : await runSession(
        `策展规划：${item.title}`,
        curationSystemPrompt(),
        curationPrompt(item.title, item.route, source),
      )
    const plan = session
      ? parseJsonBlock<CurationPlan>(session.text, "CURATION_JSON_BEGIN", "CURATION_JSON_END")
      : JSON.parse(await readFile(planPath, "utf8")) as CurationPlan
    validateCurationPlan(plan)
    if (session) {
      await atomicWrite(planPath, `${JSON.stringify(plan, null, 2)}\n`)
      await atomicWrite(join(outputRoot, item.id, "策展原始输出.md"), session.text)
    }
    results.push({
      id: item.id,
      route: item.route,
      sourceCharacters: source.length,
      sessionId: session?.sessionId ?? "reused-from-persisted-plan",
      collections: plan.collections.length,
      registeredCollections: plan.collections.filter((collection) => collection.registerWorkbench).length,
      standaloneFiles: plan.standaloneFiles.length,
    })
  }

  const classicPlan = JSON.parse(await readFile(join(outputRoot, "classic-original", "策展计划.json"), "utf8")) as CurationPlan
  const classicSource = await readCaseSource(cases[0].sourceRoot)
  const materializer = await runSession(
    "物化经典世界文件束",
    materializerSystemPrompt(),
    materializerPrompt(classicPlan, classicSource),
  )
  const bundle = parseJsonBlock<FileBundle>(materializer.text, "FILE_BUNDLE_JSON_BEGIN", "FILE_BUNDLE_JSON_END")
  await atomicWrite(join(outputRoot, "classic-original", "物化原始输出.md"), materializer.text)
  validateFileBundle(bundle, classicPlan)
  const bundleRoot = join(outputRoot, "classic-original", "世界文件束")
  for (const file of bundle.files) await atomicWrite(join(bundleRoot, ...file.path.split("/")), `${file.content.trim()}\n`)

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: "openai-compatible",
    model: MODEL_ID,
    cases: results,
    materializedCase: "classic-original",
    materializedFiles: bundle.files.map((file) => file.path),
    providerRequests: requestBodies.length,
    productionIntegrated: false,
  }
  await atomicWrite(join(evidenceDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ status: "GROWTH WORLD CURATION PILOT PASS", ...report }))
} finally {
  try {
    await core.dispose("Growth World Curation Pilot cleanup")
  } finally {
    store.close()
    await dispatcher.close()
  }
}

interface CurationPlan {
  worldTitle: string
  editorialPrinciple: string
  keepInOverview: Array<{ topic: string; reason: string }>
  standaloneFiles: Array<{ path: string; purpose: string }>
  collections: Array<{
    title: string
    folder: string
    scope: string
    presentationIntent: Array<"cards" | "map" | "timeline" | "graph" | "gallery" | "reading" | "dossier">
    reason: string
    registerWorkbench: boolean
    entities: Array<{ title: string; path: string; reason: string }>
  }>
  futureVisualTasks: Array<{ target: string; form: string; reason: string }>
  futureHtmlViews: Array<{ target: string; form: string; reason: string }>
  rejectedSplits: Array<{ topic: string; reason: string }>
}

interface FileBundle {
  files: Array<{ path: string; content: string }>
}

function curationSystemPrompt() {
  return `你是大型世界作品的内容策展主编。你只规划内容边界，不写正文，不调用工具。

你的经验不是一张固定目录模板，而是一套判断：
- 总览只保留帮助读者进入世界的整体印象、阅读导航和少量全局真相，不堆实体百科。
- 当一组内容具有多个可独立浏览的成员，并且适合比较、检索、地图、关系、时间线、画廊或连续阅读时，建立集合。
- 当一个对象拥有独立身份、足够事实、可被其他内容引用，或未来值得配图和展开时，把它拆成实体文件。
- 只有集合值得成为长期浏览入口时才建议注册工作台。单个实体通常只是集合中的文件；除非它本身已经形成多页、多图或独立关系空间。
- 不创建空分类，不为形式完整而拆分，不按文件数量机械判断。
- 分类名称必须来自当前题材。不得预设所有世界都有王国、生物、魔法、科技或人物。
- 原著整理优先呈现作品自身的时代、文明、制度、事件和版本边界；二创同时区分原作基线、用户设定和推演内容；原创按自身世界的行动结构组织。
- presentationIntent 只是未来展示建议：cards、map、timeline、graph、gallery、reading、dossier。它不是已实现 UI。
- 生图与 HTML 只列未来任务，本阶段不执行。

输出必须是严格 JSON，并置于 CURATION_JSON_BEGIN / CURATION_JSON_END 之间，不要输出其他说明。`
}

function curationPrompt(title: string, route: string, source: string) {
  return `请为下面的世界作品制定自然、可浏览、可继续扩展的策展计划。

案例：${title}
路线：${route}

不要照抄来源当前目录；要判断它本来应该怎样区分。不要把示例分类当答案。
每个建议拆分必须说明展示或检索价值；不值得拆的内容写入 keepInOverview 或 rejectedSplits。
folder 与 path 必须是项目相对路径，使用 /，不得包含 ..、绝对路径或 .creatx。

JSON 结构：
{
  "worldTitle": "...",
  "editorialPrinciple": "...",
  "keepInOverview": [{ "topic": "...", "reason": "..." }],
  "standaloneFiles": [{ "path": "...md", "purpose": "..." }],
  "collections": [{
    "title": "...",
    "folder": "...",
    "scope": "...",
    "presentationIntent": ["cards|map|timeline|graph|gallery|reading|dossier"],
    "reason": "...",
    "registerWorkbench": true,
    "entities": [{ "title": "...", "path": "...md", "reason": "..." }]
  }],
  "futureVisualTasks": [{ "target": "...", "form": "...", "reason": "..." }],
  "futureHtmlViews": [{ "target": "...", "form": "...", "reason": "..." }],
  "rejectedSplits": [{ "topic": "...", "reason": "..." }]
}

已有正式内容：
${source}`
}

function materializerSystemPrompt() {
  return `你是大型世界作品的出版物化编辑。根据已接受的策展计划，把现有综合正文重组为一组真实 Markdown 文件。

规则：
- 只使用来源中已有的专名、事实和合理推演，不为了填满目录发明大量新设定。
- 每个文件必须能独立阅读，并在开头说明其用途；索引文件应链接集合内实体。
- 重组不是简单复制：总览负责导航，集合索引负责浏览，实体文件负责一个明确对象。
- 不创建计划之外的分类；不输出空文件。
- 本阶段不生成图片、HTML 或 .creatx，不声称工作台已经注册。
- 最多输出 12 个文件，每个文件保持高密度，足以证明区分，不追求完整重写全部世界。

输出严格 JSON，置于 FILE_BUNDLE_JSON_BEGIN / FILE_BUNDLE_JSON_END 之间，不要输出其他说明。`
}

function materializerPrompt(plan: CurationPlan, source: string) {
  return `请物化第一批文件束。至少包含一个世界入口、两个不同集合的索引或总览，并把至少四个实体拆成独立文件。

策展计划：
${JSON.stringify(plan, null, 2)}

已有正式内容：
${source}

JSON 结构：
{
  "files": [
    { "path": "项目相对路径.md", "content": "完整 Markdown 正文" }
  ]
}`
}

async function readCaseSource(root: string) {
  const paths = await listMarkdownFiles(root)
  const sections = []
  for (const path of paths) {
    const content = await readFile(path, "utf8")
    sections.push(`\n===== ${relative(root, path).split(sep).join("/")} =====\n${content}`)
  }
  const source = sections.join("\n")
  return source.length <= MAX_CASE_CHARACTERS
    ? source
    : `${source.slice(0, MAX_CASE_CHARACTERS)}\n\n[输入已在文件边界外截断]`
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return await listMarkdownFiles(path)
    return extname(entry.name).toLowerCase() === ".md" ? [path] : []
  }))
  return paths.flat().sort((left, right) => left.localeCompare(right, "zh-CN"))
}

async function runSession(title: string, systemPrompt: string, prompt: string) {
  const started = await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title },
    config: {
      providerId: "openai-compatible",
      modelId: MODEL_ID,
      apiKey,
      baseUrl,
      cwd: evidenceDir,
      workspaceRoot: evidenceDir,
      mode: "act",
      systemPrompt,
      maxIterations: 2,
      enableTools: false,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      disableMcpSettingsTools: true,
    },
    toolPolicies: {},
  })
  const requestsBefore = requestBodies.length
  try {
    const result = await core.send({ sessionId: started.sessionId, prompt, timeoutMs: 300_000 })
    if (!result) throw new Error(`CURATION PILOT FAIL: ${title} returned no result`)
    requireCondition(requestBodies.length > requestsBefore, `${title} made no observed Provider request`)
    return { sessionId: started.sessionId, text: result.text }
  } finally {
    await core.stop(started.sessionId)
  }
}

function parseJsonBlock<T>(text: string, start: string, end: string) {
  const body = text.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1]?.trim()
  if (!body) throw new Error(`CURATION PILOT FAIL: missing ${start}/${end}`)
  return JSON.parse(body.replace(/^```json\s*|\s*```$/g, "")) as T
}

function validateCurationPlan(plan: CurationPlan) {
  requireCondition(typeof plan.worldTitle === "string" && plan.worldTitle.length > 0, "worldTitle is missing")
  requireCondition(Array.isArray(plan.collections) && plan.collections.length >= 2, "fewer than two natural collections")
  requireCondition(plan.collections.some((collection) => collection.registerWorkbench), "no workbench-worthy collection")
  requireCondition(Array.isArray(plan.rejectedSplits) && plan.rejectedSplits.length > 0, "plan did not reject any superficial split")
  const paths = [
    ...plan.standaloneFiles.map((file) => file.path),
    ...plan.collections.flatMap((collection) => [collection.folder, ...collection.entities.map((entity) => entity.path)]),
  ]
  requireCondition(paths.every(isSafeRelativePath), "plan contains an unsafe path")
  requireCondition(plan.collections.every((collection) => collection.entities.length > 0), "plan contains an empty collection")
}

function validateFileBundle(bundle: FileBundle, plan: CurationPlan) {
  requireCondition(Array.isArray(bundle.files) && bundle.files.length >= 7 && bundle.files.length <= 12, "file bundle size is outside 7-12")
  requireCondition(bundle.files.every((file) => isSafeRelativePath(file.path) && file.path.endsWith(".md")), "bundle contains an unsafe or non-Markdown path")
  requireCondition(new Set(bundle.files.map((file) => file.path.toLowerCase())).size === bundle.files.length, "bundle contains duplicate paths")
  requireCondition(bundle.files.every((file) => file.content.trim().length >= 180), "bundle contains an empty or superficial file")
  const materializedCollections = plan.collections.filter((collection) => bundle.files.some((file) =>
    file.path === collection.folder || file.path.startsWith(`${collection.folder}/`),
  ))
  requireCondition(materializedCollections.length >= 2, "bundle did not materialize two planned collections")
}

function isSafeRelativePath(path: string) {
  return path.length > 0
    && !path.includes("\\")
    && !path.split("/").includes("..")
    && !path.startsWith("/")
    && !/^[a-zA-Z]:/.test(path)
    && !path.toLowerCase().startsWith(".creatx")
}

async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, content, "utf8")
  await rename(temporary, path)
}

async function exists(path: string) {
  return await readFile(path).then(() => true, () => false)
}

function createProviderFetch(dispatcher: EnvHttpProxyAgent, bodies: string[]): typeof fetch {
  const providerFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    bodies.push(String(init?.body ?? ""))
    const response = await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])
    return response as unknown as Response
  }
  return Object.assign(providerFetch, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`CURATION PILOT FAIL: ${name} is not configured`)
  return value
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`CURATION PILOT FAIL: ${message}`)
}
