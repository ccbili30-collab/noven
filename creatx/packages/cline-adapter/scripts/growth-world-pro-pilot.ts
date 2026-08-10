import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  ClineCore,
  CoreSessionService,
  SqliteSessionStore,
} from "@cline/sdk"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const MODEL_ID = "gpt-5.6-luna"
const MAX_CONTEXT_PACK_CHARACTERS = 30_000
const pilotKind = process.argv[2] === "classic" ? "classic" : "geography"
if (process.argv[2] && process.argv[2] !== "classic" && process.argv[2] !== "geography") {
  throw new Error("Usage: growth-world-pro-pilot.ts [geography|classic]")
}
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const evidenceDir = resolve(
  import.meta.dirname,
  pilotKind === "classic"
    ? "../../../../artifacts/growth-world-pro-classic-pilot/2026-07-29"
    : "../../../../artifacts/growth-world-pro-pilot/2026-07-29",
)
const projectRoot = join(evidenceDir, "project")
const dataDir = join(evidenceDir, "runtime")
const manifestPath = join(projectRoot, "制作清单.json")
const requestBodies: string[] = []
const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(dataDir, "sessions") })
const dispatcher = new EnvHttpProxyAgent()
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-pro-pilot",
  distinctId: "creatx-growth-world-pro-pilot",
  sessionService,
  fetch: createProviderFetch(dispatcher, requestBodies),
  capabilities: {
    requestToolApproval: () => ({ approved: false, reason: "This experiment does not permit tools" }),
  },
})

try {
  await initializeProject()
  const warmReplay = await exists(manifestPath)
    && (await readManifest()).units.every((unit) => unit.status === "completed")
  const firstPass = await runPipeline()
  const requestsAfterFirstPass = requestBodies.length
  const secondPass = await runPipeline()
  requireCondition(requestBodies.length === requestsAfterFirstPass, "Idempotency replay unexpectedly called the Provider")
  requireCondition(secondPass.every((result) => result === "skipped"), "Idempotency replay did not skip every completed unit")

  const manifest = await readManifest()
  requireCondition(manifest.units.every((unit) => unit.status === "completed"), "Pilot ended with incomplete units")
  const report = {
    schemaVersion: 1,
    pilotKind,
    generatedAt: new Date().toISOString(),
    provider: "openai-compatible",
    model: MODEL_ID,
    topic: manifest.goal,
    manifestTitle: manifest.title,
    unitCount: manifest.units.length,
    completedUnits: manifest.units.map((unit) => ({
      id: unit.id,
      targetPath: unit.targetPath,
      questionerSessionId: unit.questionerSessionId,
      writerSessionId: unit.writerSessionId,
      retrievedSourceIds: unit.retrievedSourceIds,
    })),
    providerRequests: requestBodies.length,
    firstPass,
    replay: secondPass,
    replayProviderRequests: requestBodies.length - requestsAfterFirstPass,
    contextPackLimit: MAX_CONTEXT_PACK_CHARACTERS,
  }
  if (!warmReplay) await atomicWrite(join(evidenceDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    status: warmReplay ? "GROWTH WORLD PRO PILOT WARM REPLAY PASS" : "GROWTH WORLD PRO PILOT PASS",
    units: manifest.units.length,
    providerRequests: requestBodies.length,
    replayProviderRequests: 0,
    evidenceDir,
  }))
} finally {
  try {
    await core.dispose("Growth World Pro Pilot cleanup")
  } finally {
    store.close()
    await dispatcher.close()
  }
}

interface ProductionManifest {
  schemaVersion: 1
  title: string
  goal: string
  route: "original"
  status: "active" | "completed"
  units: ProductionUnit[]
}

interface ProductionUnit {
  id: string
  title: string
  kind: "foundation" | "civilization" | "era" | "heartland"
  targetPath: string
  dependsOn: string[]
  brief: string
  status: "planned" | "running" | "failed" | "completed"
  attempts: number
  questionerSessionId?: string
  writerSessionId?: string
  retrievedSourceIds?: string[]
  completedAt?: string
  error?: string
}

interface Question {
  subject: string
  question: string
  value: string
  anchors: string[]
}

interface SourceDocument {
  id: string
  path: string
  content: string
}

async function initializeProject() {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(join(projectRoot, "时空"), { recursive: true }),
    mkdir(join(projectRoot, "文明"), { recursive: true }),
    mkdir(join(projectRoot, "世界"), { recursive: true }),
    mkdir(join(projectRoot, "地区"), { recursive: true }),
    mkdir(join(projectRoot, "索引"), { recursive: true }),
    mkdir(join(evidenceDir, "raw"), { recursive: true }),
  ])
  await writeIfMissing(join(projectRoot, "创作目标.md"), pilotKind === "classic" ? classicGoal() : `# 创作目标

建立一个可以扩展为十万字设定集的低魔中世纪世界。世界不能依赖猎奇奇观支撑，应让地理、资源、交通、防务、制度和日常生活互相产生原因。

首轮 Pilot 只物化两个有依赖关系的内容单元：先建立一片决定人类生存方式的区域，再从该区域自然生长一个文明共同体。
`)
  await writeIfMissing(join(projectRoot, "世界宪章.md"), pilotKind === "classic" ? classicCharter() : `# 世界宪章

## 创作方向

- 题材是低魔中世纪，而不是高魔英雄游乐场。
- 世界的魅力来自可以理解的生活、制度、利益与冲突，不依赖随机猎奇设定。
- 自然条件不是唯一原因；技术、贸易、信仰、历史选择和人物行动也可以反过来改变世界。

## 核心事实

- 世界处于大陆内海退缩后的数百年，旧港口、盐碱地和新河道共同塑造聚落。
- 魔法稀少，主要表现为需要长期维护、效果有限的古代工程遗产。
- 当前时代没有统一帝国，区域秩序来自领主、城镇、行会和宗教机构的妥协。

## 写作规则

- 每项重要制度至少连接一个现实需求和一个代价。
- 可以进行自然推演，但不得把推演伪装成已经提供的来源事实。
- 正文优先呈现世界本身，不写研究报告或校验过程。
`)
  await writeIfMissing(join(projectRoot, "索引", "关系索引.md"), pilotKind === "classic" ? classicRelationSeed() : `# 关系索引

- 内海退缩 --留下--> 旧港口与盐碱地 [SRC-CHARTER]
- 新河道 --重新决定--> 聚落与贸易路线 [SRC-CHARTER]
- 古代工程遗产 --提供但限制--> 稀少魔法能力 [SRC-CHARTER]
- 多中心秩序 --由妥协形成--> 领主、城镇、行会与宗教机构 [SRC-CHARTER]
- 地理与资源 --影响但不完全决定--> 制度与日常生活 [SRC-GOAL]
- 技术与历史选择 --能够反向改变--> 地理利用方式 [SRC-GOAL]
`)
  await writeIfMissing(join(projectRoot, "索引", "实体摘要.md"), "# 实体摘要\n")
}

function classicGoal() {
  return `# 创作目标

创造一个经典、宏大、完整的原创中世纪奇幻世界。

用户只提供这一句话。AI 应使用自身对通俗中世纪奇幻的理解，自主创造鲜明而可信的时代、地区、国家、族群、信仰、魔法、遗迹、威胁与故事入口。不要复制任何现成作品的专有名称、人物或情节。
`
}

function classicCharter() {
  return `# 世界宪章

## 成品方向

- 这是能承载长篇小说、游戏和持续扩展设定集的经典中世纪奇幻世界。
- 读者首先应看见正在生活的人、正在行动的势力和正在变化的时代，而不是一篇抽象地理或社会科学报告。
- 世界可以包含熟悉的王国、古老族群、骑士、巫师、神殿、商路、荒野、遗迹和怪物，但必须形成原创组合与自身历史。
- 鲜明不等于随机猎奇。每个令人记住的设定都应连接地区、历史、信仰、利益或人物行动。

## 创作自由

- AI 自主决定世界名称、时代危机、地区、国家、族群、魔法来源和历史遗产。
- 地理只需支撑地区差异、行动路线、资源与战争，不需要先写成自然地理教材。
- 不要求科学证明；要求通俗、自然、宏大、完整，并让用户容易继续提出新想法。

## 正文要求

- 使用具体名称、象征、习俗、职业、矛盾和可演出的场景。
- 同时提供经典奇幻的熟悉感和这个世界独有的辨识度。
- 正文写世界本身，不描述提示词、研究过程或模型工作步骤。
`
}

function classicRelationSeed() {
  return `# 关系索引

- 当前时代 --继承并误解--> 古老时代的遗产 [SRC-CHARTER]
- 王国与族群 --围绕土地、信仰、贸易与安全发生--> 合作和冲突 [SRC-CHARTER]
- 魔法与神迹 --拥有社会意义并要求--> 代价、传统或责任 [SRC-CHARTER]
- 地区差异 --塑造--> 生计、文化、军队与旅行体验 [SRC-CHARTER]
- 普通人的生活 --受到并回应--> 势力行动与时代危机 [SRC-GOAL]
- 历史遗产 --继续影响--> 当前政治、身份和故事 [SRC-GOAL]
`
}

async function runPipeline() {
  const manifest = await loadOrCreateManifest()
  const results: ("completed" | "skipped")[] = []
  for (const unit of manifest.units) {
    if (unit.status === "completed") {
      results.push("skipped")
      continue
    }
    requireCondition(unit.dependsOn.every((dependency) => manifest.units.some((candidate) => candidate.id === dependency && candidate.status === "completed")), `Unit ${unit.id} has incomplete dependencies`)
    unit.status = "running"
    unit.attempts += 1
    delete unit.error
    await saveManifest(manifest)
    try {
      await executeUnit(manifest, unit)
      unit.status = "completed"
      unit.completedAt = new Date().toISOString()
      await saveManifest(manifest)
      results.push("completed")
    } catch (error) {
      unit.status = "failed"
      unit.error = error instanceof Error ? error.message : String(error)
      await saveManifest(manifest)
      throw error
    }
  }
  manifest.status = "completed"
  await saveManifest(manifest)
  return results
}

async function loadOrCreateManifest() {
  if (await exists(manifestPath)) return await readManifest()
  const planner = await runSession("Pro 世界制作主编", plannerSystemPrompt(), plannerPrompt())
  await atomicWrite(join(evidenceDir, "raw", "制作主编原始输出.md"), `# 制作主编原始输出\n\n${planner.text}\n`)
  const manifest = parseManifest(planner.text)
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

async function executeUnit(manifest: ProductionManifest, unit: ProductionUnit) {
  const relationIndex = await readFile(join(projectRoot, "索引", "关系索引.md"), "utf8")
  const sourceDocuments = await loadSourceDocuments(manifest, unit)
  const privateSentinel = `QUESTIONER_PRIVATE_${unit.id}_${Date.now()}`
  const questioner = await runSession(
    `${unit.title}：因果提问`,
    questionerSystemPrompt(privateSentinel),
    questionerPrompt(manifest, unit, relationIndex, sourceDocuments),
  )
  await atomicWrite(join(evidenceDir, "raw", `${unit.id}-提问者.md`), `# ${unit.title}：提问者原始输出\n\n${questioner.text}\n`)
  const questions = parseQuestionSet(questioner.text)
  requireCondition(questions.length >= 3 && questions.length <= 6, `Unit ${unit.id} produced ${questions.length} questions instead of 3-6`)
  const retrieval = retrieveEvidence(questions, relationIndex, sourceDocuments)
  requireCondition(retrieval.pack.length <= MAX_CONTEXT_PACK_CHARACTERS, `Unit ${unit.id} exceeded the Context Pack limit`)
  await atomicWrite(join(evidenceDir, "raw", `${unit.id}-检索包.md`), `# ${unit.title}：检索包\n\n${retrieval.pack}\n`)

  const writer = await runSession(
    `${unit.title}：正式写作`,
    writerSystemPrompt(),
    writerPrompt(manifest, unit, questioner.text, retrieval.pack),
  )
  await atomicWrite(join(evidenceDir, "raw", `${unit.id}-写作者.md`), `# ${unit.title}：写作者原始输出\n\n${writer.text}\n`)
  requireCondition(questioner.sessionId !== writer.sessionId, `Unit ${unit.id} reused one Session for questioning and writing`)
  const writerRequest = writer.requestBody
  requireCondition(!writerRequest.includes(privateSentinel), `Unit ${unit.id} leaked questioner private memory into writer request`)
  const output = parseWriterOutput(writer.text)
  requireCondition(output.content.length >= 2_500, `Unit ${unit.id} content is too short for the Pilot`)
  const citations = [...output.content.matchAll(/\[\s*(SRC-[A-Z0-9-]+)\s*\]/g)].map((match) => match[1]!)
  const requiredCitationCount = unit.dependsOn.length ? 2 : 1
  requireCondition(new Set(citations).size >= requiredCitationCount, `Unit ${unit.id} cited fewer than ${requiredCitationCount} retrieved sources`)
  const outside = [...new Set(citations)].filter((sourceId) => !retrieval.sourceIds.includes(sourceId))
  requireCondition(outside.length === 0, `Unit ${unit.id} cited sources outside its Context Pack: ${outside.join(", ")}`)
  const dependencySourceIds = unit.dependsOn.map((dependency) => `SRC-${dependency.toUpperCase()}`)
  requireCondition(dependencySourceIds.every((sourceId) => citations.includes(sourceId)), `Unit ${unit.id} did not cite every direct dependency`)
  requireCondition(output.relations.length >= 4 && output.relations.length <= 12, `Unit ${unit.id} produced ${output.relations.length} relation deltas instead of 4-12`)

  const cleanContent = output.content.replace(/\[\s*SRC-[A-Z0-9-]+\s*\]/g, "").replace(/[ \t]+(?=\r?$)/gm, "")
  await atomicWrite(join(projectRoot, unit.targetPath), `${cleanContent.trim()}\n`)
  await appendText(join(projectRoot, "索引", "实体摘要.md"), `\n## ${unit.title} [SRC-${unit.id.toUpperCase()}]\n\n${output.summary.trim()}\n`)
  await appendText(
    join(projectRoot, "索引", "关系索引.md"),
    `\n## ${unit.title}\n\n${output.relations.map((relation) => `- ${relation.subject} --${relation.predicate}--> ${relation.object} [SRC-${unit.id.toUpperCase()}]`).join("\n")}\n`,
  )
  unit.questionerSessionId = questioner.sessionId
  unit.writerSessionId = writer.sessionId
  unit.retrievedSourceIds = retrieval.sourceIds
}

async function loadSourceDocuments(manifest: ProductionManifest, unit: ProductionUnit) {
  const base = await Promise.all([
    sourceDocument("SRC-CHARTER", "世界宪章.md"),
    sourceDocument("SRC-GOAL", "创作目标.md"),
  ])
  const dependencies = await Promise.all(unit.dependsOn.map(async (dependency) => {
    const sourceUnit = manifest.units.find((candidate) => candidate.id === dependency)
    if (!sourceUnit) throw new Error(`PRO PILOT FAIL: missing dependency ${dependency}`)
    return await sourceDocument(`SRC-${sourceUnit.id.toUpperCase()}`, sourceUnit.targetPath)
  }))
  return [...base, ...dependencies]
}

async function sourceDocument(id: string, path: string): Promise<SourceDocument> {
  return { id, path, content: await readFile(join(projectRoot, path), "utf8") }
}

function plannerSystemPrompt() {
  return [
    "你是 Growth World Pro 的世界制作主编，只负责把目标拆成有依赖关系的制作清单，不写正文。",
    pilotKind === "classic"
      ? "本次是经典奇幻两单元 Pilot：先建立世界总览与当前时代，再选择一个核心地区向下展开王国与边境。"
      : "本次是两单元 Pilot：第一个建立时空基础，第二个从第一个自然生长文明。",
    "目标路径必须使用 Windows 和跨平台都安全的项目相对路径。",
    "严格输出 MANIFEST_BEGIN 和 MANIFEST_END，中间只放 JSON，不要代码围栏。",
  ].join("\n")
}

function plannerPrompt() {
  if (pilotKind === "classic") return `请根据用户唯一目标“创造一个经典、宏大、完整的原创中世纪奇幻世界”生成两单元 Pilot 清单。

JSON 必须严格满足：
- schemaVersion 为 1；route 为 original；status 为 active。
- title 和 goal 使用中文，goal 保持用户的通俗目标，不替用户预设独特地理机制。
- units 恰好两个。
- 第一项 id 为 era，kind 为 era，targetPath 是位于 世界/ 下的 Markdown 文件并以 .md 结尾，dependsOn 为空。
- 第二项 id 为 heartland，kind 为 heartland，targetPath 是位于 地区/ 下的 Markdown 文件并以 .md 结尾，dependsOn 只能是 ["era"]。
- 每项包含中文 title、brief、status:"planned"、attempts:0。
- era 的 brief 要求形成世界名称、时代印象、主要地区与族群、古老遗产、魔法意义、当前危机、日常生活和故事入口。
- heartland 的 brief 要求从第一单元选择最适合演出的地区，展开核心王国、边境邻邦、势力诉求、社会生活、代表地点、人物位置和即时冲突。
- brief 规定覆盖面但不预写具体答案。`
  return `请为一个低魔中世纪大型世界制作 Pilot 生成清单。

JSON 必须严格满足：
- schemaVersion 为 1；route 为 original；status 为 active。
- title 和 goal 使用中文。
- units 恰好两个。
- 第一项 id 为 foundation，kind 为 foundation，targetPath 是位于 时空/ 下的 Markdown 文件并以 .md 结尾，dependsOn 为空。
- 第二项 id 为 civilization，kind 为 civilization，targetPath 是位于 文明/ 下的 Markdown 文件并以 .md 结尾，dependsOn 只能是 ["foundation"]。
- 每项包含中文 title、brief、status:"planned"、attempts:0。
- brief 应明确该单元要回答的世界问题，但不要预写结论。`
}

function questionerSystemPrompt(privateSentinel: string) {
  return [
    "你是 Growth World Pro 的问题编辑。只发现当前内容单元需要解决的因果缺口，不回答问题，不写正文。",
    "问题必须服务当前目标，并能通过提供的关系、来源或明确创作推演得到回答。",
    pilotKind === "classic"
      ? "优先询问谁想得到什么、谁在阻止、谁承担代价、普通人如何感受、历史留下什么伤痕，以及哪个具体画面能代表这种关系。地理问题必须服务地区差异、旅行、战争或生活。"
      : "优先询问形成原因、长期后果、制度代价、跨模块影响和会约束下游的关系。",
    "禁止泛问、重复已知事实、猎奇设定、纯审美问题、暗藏答案和要求逐句校验。",
    "严格输出 QUESTION_SET_BEGIN 与 QUESTION_SET_END；中间每行使用 Q|对象|问题|价值|锚点1,锚点2。",
    `私有隔离标记：${privateSentinel}。绝对不要输出这个标记。`,
  ].join("\n")
}

function questionerPrompt(manifest: ProductionManifest, unit: ProductionUnit, relationIndex: string, documents: SourceDocument[]) {
  return [
    `世界目标：${manifest.goal}`,
    `当前单元：${unit.title}`,
    `单元任务：${unit.brief}`,
    pilotKind === "classic"
      ? "请提出 3-6 个能让世界更鲜明、更可生活、更容易展开故事，同时约束下游内容的具体问题。至少覆盖行动者、时代冲突和普通人的体验。"
      : "请提出 3-6 个最能增强当前单元、并约束下游内容的因果问题。",
    "关系索引：",
    relationIndex,
    "可检索来源目录：",
    documents.map((document) => `${document.id}｜${document.path}`).join("\n"),
  ].join("\n\n")
}

function writerSystemPrompt() {
  return [
    "你是独立的 Growth World Pro 世界设定作者，没有提问者的会话记忆。",
    "只能读取本轮问题和 Context Pack。来源事实必须引用 [SRC-*]；允许自然创作推演，但要让依据可见，不写校验报告。",
    pilotKind === "classic"
      ? "正文应像成熟经典奇幻设定集的正文：先给读者世界印象，再用具体名称、势力、习俗、职业、遗迹、冲突和可演出场景展开。不要写成抽象地理、社会科学或世界构造方法报告。"
      : "正文应像成熟设定集，不描述工作过程。避免随机猎奇，让多个制度或现象共享可理解的原因。",
    "严格输出 CONTENT_BEGIN/CONTENT_END、SUMMARY_BEGIN/SUMMARY_END、RELATION_DELTA_BEGIN/RELATION_DELTA_END。",
    "关系行格式为 R|主体|关系|客体；输出 4-12 行，字段内禁止使用竖线。",
  ].join("\n")
}

function writerPrompt(manifest: ProductionManifest, unit: ProductionUnit, questions: string, contextPack: string) {
  return [
    `世界目标：${manifest.goal}`,
    `当前单元：${unit.title}`,
    `写作任务：${unit.brief}`,
    pilotKind === "classic"
      ? "请写 3500-5500 中文字的高密度正式设定。使用足够的原创专有名称，但不要堆砌名词；每个主要部分都要落到行动者、生活细节或具体场景。摘要控制在 150-400 字，用于下游检索。"
      : "请写 3000-5000 中文字的高密度正式设定。摘要控制在 150-400 字，用于下游检索。",
    "独立问题编辑提出的问题：",
    questions,
    "Context Pack：",
    contextPack,
  ].join("\n\n")
}

function parseManifest(text: string): ProductionManifest {
  const body = requireBlock(text, "MANIFEST_BEGIN", "MANIFEST_END")
  const parsed = JSON.parse(body) as unknown
  requireCondition(isRecord(parsed), "Planner manifest is not an object")
  requireCondition(parsed.schemaVersion === 1 && parsed.route === "original" && parsed.status === "active", "Planner manifest has invalid root fields")
  requireCondition(typeof parsed.title === "string" && parsed.title.trim().length > 0, "Planner manifest has no title")
  requireCondition(typeof parsed.goal === "string" && parsed.goal.trim().length > 0, "Planner manifest has no goal")
  requireCondition(Array.isArray(parsed.units) && parsed.units.length === 2, "Planner manifest must contain exactly two units")
  const units = parsed.units.map(parseUnit)
  if (pilotKind === "classic") {
    requireCondition(units[0]?.id === "era" && units[0].kind === "era" && units[0].dependsOn.length === 0 && /^世界\/[\p{L}\p{N}_-]+\.md$/u.test(units[0].targetPath), "Planner era unit violates the Classic Pilot contract")
    requireCondition(units[1]?.id === "heartland" && units[1].kind === "heartland" && units[1].dependsOn.length === 1 && units[1].dependsOn[0] === "era" && /^地区\/[\p{L}\p{N}_-]+\.md$/u.test(units[1].targetPath), "Planner heartland unit violates the Classic Pilot contract")
    return {
      schemaVersion: 1,
      title: parsed.title.trim(),
      goal: parsed.goal.trim(),
      route: "original",
      status: "active",
      units,
    }
  }
  requireCondition(units[0]?.id === "foundation" && units[0].kind === "foundation" && units[0].dependsOn.length === 0 && /^时空\/[\p{L}\p{N}_-]+\.md$/u.test(units[0].targetPath), "Planner foundation unit violates the Pilot contract")
  requireCondition(units[1]?.id === "civilization" && units[1].kind === "civilization" && units[1].dependsOn.length === 1 && units[1].dependsOn[0] === "foundation" && /^文明\/[\p{L}\p{N}_-]+\.md$/u.test(units[1].targetPath), "Planner civilization unit violates the Pilot contract")
  return {
    schemaVersion: 1,
    title: parsed.title.trim(),
    goal: parsed.goal.trim(),
    route: "original",
    status: "active",
    units,
  }
}

function parseUnit(value: unknown): ProductionUnit {
  requireCondition(isRecord(value), "Planner unit is not an object")
  requireCondition(typeof value.id === "string" && typeof value.title === "string" && typeof value.brief === "string", "Planner unit lacks text fields")
  requireCondition(value.kind === "foundation" || value.kind === "civilization" || value.kind === "era" || value.kind === "heartland", "Planner unit has an invalid kind")
  requireCondition(typeof value.targetPath === "string" && !value.targetPath.includes("..") && !value.targetPath.includes("\\"), "Planner unit has an unsafe targetPath")
  requireCondition(Array.isArray(value.dependsOn) && value.dependsOn.every((dependency) => typeof dependency === "string"), "Planner unit has invalid dependencies")
  requireCondition(value.status === "planned" && value.attempts === 0, "Planner unit has invalid initial state")
  return {
    id: value.id.trim(),
    title: value.title.trim(),
    kind: value.kind,
    targetPath: value.targetPath,
    dependsOn: value.dependsOn,
    brief: value.brief.trim(),
    status: "planned",
    attempts: 0,
  }
}

function parseQuestionSet(text: string): Question[] {
  const body = requireBlock(text, "QUESTION_SET_BEGIN", "QUESTION_SET_END")
  return body.split(/\r?\n/).flatMap((line) => {
    const parts = line.trim().split("|")
    if (parts.length !== 5 || parts[0] !== "Q") return []
    const anchors = parts[4]!.split(/[,，]/).map((anchor) => anchor.trim()).filter(Boolean)
    if (!parts[1]?.trim() || !parts[2]?.trim() || !parts[3]?.trim() || anchors.length < 2) return []
    return [{ subject: parts[1].trim(), question: parts[2].trim(), value: parts[3].trim(), anchors }]
  })
}

function retrieveEvidence(questions: Question[], relationIndex: string, documents: SourceDocument[]) {
  const anchors = [...new Set(questions.flatMap((question) => question.anchors))]
  const relationLines = relationIndex.split(/\r?\n/).filter((line) => anchors.some((anchor) => line.includes(anchor)))
  const linked = [...new Set(relationLines.flatMap((line) => [...line.matchAll(/\[(SRC-[A-Z0-9-]+)\]/g)].map((match) => match[1]!)))]
  const ranked = documents.map((document) => ({
    document,
    score: (linked.includes(document.id) ? 20 : 0) + anchors.filter((anchor) => document.content.includes(anchor)).length,
  })).sort((left, right) => right.score - left.score)
  const selected = ranked.filter((candidate) => candidate.score > 0)
  const candidates = selected.length >= 2 ? selected : ranked.slice(0, 2)
  const required = ranked.filter((candidate) => linked.includes(candidate.document.id))
  const unique = [...new Map([...required, ...candidates].map((candidate) => [candidate.document.id, candidate])).values()]
  const sections = [
    "## 命中的关系",
    relationLines.length ? relationLines.join("\n") : "没有直接关系命中；按问题锚点选择来源。",
  ]
  for (const candidate of unique) {
    const next = `## ${candidate.document.id}｜${candidate.document.path}\n\n${candidate.document.content}`
    requireCondition([...sections, next].join("\n\n").length <= MAX_CONTEXT_PACK_CHARACTERS, `Required sources exceed the Context Pack limit at ${candidate.document.id}`)
    sections.push(next)
  }
  return {
    sourceIds: unique.map((candidate) => candidate.document.id),
    pack: sections.join("\n\n"),
  }
}

function parseWriterOutput(text: string) {
  const relationBody = requireBlock(text, "RELATION_DELTA_BEGIN", "RELATION_DELTA_END")
  const relations = relationBody.split(/\r?\n/).flatMap((line) => {
    const parts = line.trim().split("|")
    if (parts.length !== 4 || parts[0] !== "R" || !parts[1]?.trim() || !parts[2]?.trim() || !parts[3]?.trim()) return []
    return [{ subject: parts[1].trim(), predicate: parts[2].trim(), object: parts[3].trim() }]
  })
  return {
    content: requireBlock(text, "CONTENT_BEGIN", "CONTENT_END"),
    summary: requireBlock(text, "SUMMARY_BEGIN", "SUMMARY_END"),
    relations,
  }
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
      cwd: projectRoot,
      workspaceRoot: projectRoot,
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
    if (!result) throw new Error(`PRO PILOT FAIL: ${title} returned no result`)
    requireCondition(requestBodies.length > requestsBefore, `${title} made no observed Provider request`)
    return {
      sessionId: started.sessionId,
      text: result.text,
      finishReason: result.finishReason,
      requestBody: requestBodies.at(-1) ?? "",
    }
  } finally {
    await core.stop(started.sessionId)
  }
}

async function readManifest() {
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as ProductionManifest
  requireCondition(parsed.schemaVersion === 1 && parsed.route === "original" && Array.isArray(parsed.units), "Persisted manifest is invalid")
  return parsed
}

async function saveManifest(manifest: ProductionManifest) {
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function atomicWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, content, "utf8")
  await rename(temporary, path)
}

async function appendText(path: string, content: string) {
  await atomicWrite(path, `${await readFile(path, "utf8")}${content}`)
}

async function writeIfMissing(path: string, content: string) {
  if (await exists(path)) return
  await atomicWrite(path, content)
}

async function exists(path: string) {
  return await readFile(path).then(() => true, () => false)
}

function requireBlock(text: string, start: string, end: string) {
  const body = text.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1]?.trim()
  if (!body) throw new Error(`PRO PILOT FAIL: missing ${start}/${end}`)
  return body
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
  if (!value) throw new Error(`PRO PILOT FAIL: ${name} is not configured`)
  return value
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`PRO PILOT FAIL: ${message}`)
}
