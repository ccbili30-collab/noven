import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  ClineCore,
  CoreSessionService,
  SqliteSessionStore,
} from "@cline/sdk"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const QUESTIONER_PRIVATE_SENTINEL = `QUESTIONER_PRIVATE_${Date.now()}`
const QUESTIONER_PROMPT_MARKER = "CREATX_CAUSAL_QUESTION_EDITOR_V1"
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const runRoot = await mkdtemp(join(tmpdir(), "creatx-self-question-live-"))
const dataDir = join(runRoot, "data")
const projectRoot = join(runRoot, "project")
const evidenceDir = resolve(import.meta.dirname, "../../../../artifacts/growth-world-self-question/2026-07-29")
const sourceDocuments = retrievalDocuments()
const relationIndex = relationshipIndex()
const requestBodies: string[] = []
const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(dataDir, "sessions") })
const dispatcher = new EnvHttpProxyAgent()
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-self-question-live",
  distinctId: "creatx-growth-world-self-question-live",
  sessionService,
  fetch: createProviderFetch(dispatcher, requestBodies),
  capabilities: {
    requestToolApproval: () => ({ approved: false, reason: "This experiment does not permit tools" }),
  },
})

try {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(evidenceDir, { recursive: true }),
    ...sourceDocuments.map((document) => mkdir(dirname(join(evidenceDir, document.path)), { recursive: true })),
  ])
  await Promise.all([
    writeFile(join(evidenceDir, "关系索引.md"), relationIndex, "utf8"),
    ...sourceDocuments.map((document) => writeFile(join(evidenceDir, document.path), document.content, "utf8")),
  ])

  const questioner = await startSession(core, projectRoot, "因果提问者", questionerSystemPrompt())
  const questionResult = await core.send({
    sessionId: questioner.sessionId,
    prompt: questionerPrompt(relationIndex),
    timeoutMs: 300_000,
  })
  if (!questionResult) throw new Error("SELF QUESTION LIVE FAIL: questioner returned no result")
  const questions = parseQuestionSet(questionResult.text)
  requireCondition(questions.length >= 3 && questions.length <= 7, `Questioner produced ${questions.length} valid questions instead of 3-7`)
  const retrieval = retrieveEvidence(questions, relationIndex, sourceDocuments)
  requireCondition(retrieval.sourceIds.length >= 2, "Retrieval selected fewer than two source sections")

  const answerer = await startSession(core, projectRoot, "因果回答与创作", answererSystemPrompt())
  requireCondition(answerer.sessionId !== questioner.sessionId, "Questioner and answerer unexpectedly share one Session")
  const answerResult = await core.send({
    sessionId: answerer.sessionId,
    prompt: answererPrompt(questionResult.text, retrieval.pack),
    timeoutMs: 300_000,
  })
  if (!answerResult) throw new Error("SELF QUESTION LIVE FAIL: answerer returned no result")

  const answerRequest = requestBodies.at(-1) ?? ""
  requireCondition(requestBodies.length >= 2, "Provider request capture did not observe both Sessions")
  requireCondition(!answerRequest.includes(QUESTIONER_PRIVATE_SENTINEL), "Questioner private memory leaked into the answerer Provider request")
  requireCondition(!answerRequest.includes(QUESTIONER_PROMPT_MARKER), "Questioner role instructions leaked into the answerer Provider request")
  requireCondition(!answerResult.text.includes(QUESTIONER_PRIVATE_SENTINEL), "Questioner private memory leaked into the answer")
  const citedSources = [...answerResult.text.matchAll(/\[(SRC-[A-Z]+-\d+)\]/g)].map((match) => match[1]!)
  requireCondition(new Set(citedSources).size >= 2, "Answerer cited fewer than two retrieved source sections")
  const citationsOutsideRetrieval = [...new Set(citedSources)].filter((sourceId) => !retrieval.sourceIds.includes(sourceId))
  requireCondition(citationsOutsideRetrieval.length === 0, `Answerer cited sources outside the retrieval pack: ${citationsOutsideRetrieval.join(", ")}`)
  requireCondition(/龙巢|赤冠/.test(answerResult.text) && /哥布林|菌潮/.test(answerResult.text), "Answerer did not connect the two defining premises")

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: "openai-compatible",
    model: "gpt-5.6-luna",
    topic: "中古剑与魔法国家：邻近龙巢并长期遭受哥布林侵袭",
    questionerSessionId: questioner.sessionId,
    answererSessionId: answerer.sessionId,
    sessionsDistinct: questioner.sessionId !== answerer.sessionId,
    providerRequests: requestBodies.length,
    privateMemoryIsolated: !answerRequest.includes(QUESTIONER_PRIVATE_SENTINEL),
    questionCount: questions.length,
    retrievalAnchors: [...new Set(questions.flatMap((question) => question.anchors))],
    retrievedSourceIds: retrieval.sourceIds,
    relationLines: retrieval.relationLines,
    citedSourceIds: [...new Set(citedSources)],
    questionFinishReason: questionResult.finishReason,
    answerFinishReason: answerResult.finishReason,
  }
  await Promise.all([
    writeFile(join(evidenceDir, "提问者原始输出.md"), `# 提问者原始输出\n\n${questionResult.text}\n`, "utf8"),
    writeFile(join(evidenceDir, "回答者检索包.md"), `# 回答者检索包\n\n${retrieval.pack}\n`, "utf8"),
    writeFile(join(evidenceDir, "回答者原始输出.md"), `# 回答者原始输出\n\n${answerResult.text}\n`, "utf8"),
    writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ])
  console.log(JSON.stringify({
    status: "GROWTH WORLD SELF QUESTION LIVE PASS",
    questionCount: questions.length,
    retrievedSourceIds: retrieval.sourceIds,
    citedSourceIds: [...new Set(citedSources)],
    sessionsDistinct: true,
    privateMemoryIsolated: true,
    evidenceDir,
  }))
} finally {
  try {
    await core.dispose("Growth World self-question Live cleanup")
  } finally {
    store.close()
    await dispatcher.close()
    await rm(runRoot, { recursive: true, force: true })
  }
}

async function startSession(core: ClineCore, projectRoot: string, title: string, systemPrompt: string) {
  return await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title },
    config: {
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
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
}

function questionerSystemPrompt() {
  return [
    QUESTIONER_PROMPT_MARKER,
    "你是 Growth World 的问题编辑。你只发现因果缺口，不回答问题，不写正文。",
    "只使用用户提供的目标、世界骨架和关系索引。不要用常识补充索引中不存在的事实。",
    "优先询问形成原因、长期后果、优势代价、制度来源和会影响多个下游内容的关系。",
    "禁止泛问、重复已知事实、追求猎奇、提出纯审美问题或在问题中暗藏答案。",
    "每个问题必须给出具体对象、价值和 2-5 个可用于检索的锚点。",
    "严格输出 QUESTION_SET_BEGIN 与 QUESTION_SET_END；中间每行格式为 Q|对象|问题|为什么值得回答|锚点1,锚点2。字段内不要使用竖线。",
    `内部隔离标记：${QUESTIONER_PRIVATE_SENTINEL}。绝对不要在输出中复述这个标记。`,
  ].join("\n")
}

function questionerPrompt(index: string) {
  return [
    "目标：扩写一个中古剑与魔法国家。它位于赤冠龙巢附近，并长期遭受灰耳哥布林侵袭。",
    "任务：仅提出 3-7 个值得由另一位 Agent 检索并回答的因果问题。不要回答。",
    "关系索引：",
    index,
  ].join("\n\n")
}

function answererSystemPrompt() {
  return [
    "你是独立的因果回答者和世界设定作者。你没有提问者的会话记忆。",
    "只能依据本轮提供的问题、关系命中和来源片段回答；可以做自然创作推演，但必须明确写成推演，不能伪装成来源事实。",
    "先逐项回答问题，再生成一份完整但紧凑的国家设定。每项关键依据使用 [SRC-XXX-00] 标记。",
    "让地理、威胁、经济、制度、文化和内部冲突共享原因，不追求猎奇，不写校验报告。",
  ].join("\n")
}

function answererPrompt(questions: string, retrievalPack: string) {
  return [
    "题材：中古剑与魔法国家，邻近龙巢并长期遭受哥布林侵袭。",
    "以下是另一独立 Session 提出的问题：",
    questions,
    "以下是程序按检索锚点取得的关系与来源片段：",
    retrievalPack,
    "请输出《灰脊王国：因果推演与国家设定》。不要描述你的工作过程。",
  ].join("\n\n")
}

interface Question {
  subject: string
  question: string
  value: string
  anchors: string[]
}

function parseQuestionSet(text: string): Question[] {
  const body = text.match(/QUESTION_SET_BEGIN([\s\S]*?)QUESTION_SET_END/)?.[1]
  if (!body) throw new Error(`SELF QUESTION LIVE FAIL: questioner did not return the required markers\n${text}`)
  return body.split(/\r?\n/).flatMap((line) => {
    const parts = line.trim().split("|")
    if (parts.length !== 5 || parts[0] !== "Q") return []
    const anchors = parts[4]!.split(/[,，]/).map((anchor) => anchor.trim()).filter(Boolean)
    if (!parts[1]?.trim() || !parts[2]?.trim() || !parts[3]?.trim() || anchors.length < 2) return []
    return [{ subject: parts[1].trim(), question: parts[2].trim(), value: parts[3].trim(), anchors }]
  })
}

interface RetrievalDocument {
  id: string
  path: string
  keywords: string[]
  content: string
}

function retrieveEvidence(questions: Question[], index: string, documents: RetrievalDocument[]) {
  const anchors = [...new Set(questions.flatMap((question) => question.anchors))]
  const relationLines = index.split(/\r?\n/).filter((line) => anchors.some((anchor) => line.includes(anchor)))
  const linkedSourceIds = [...new Set(relationLines.flatMap((line) => [...line.matchAll(/\[(SRC-[A-Z]+-\d+)\]/g)].map((match) => match[1]!)))]
  const ranked = documents.map((document) => ({
    document,
    score: (linkedSourceIds.includes(document.id) ? 10 : 0)
      + anchors.filter((anchor) => document.content.includes(anchor) || document.keywords.some((keyword) => keyword.includes(anchor) || anchor.includes(keyword))).length,
  })).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score)
  const selected = ranked.length >= 2 ? ranked : documents.slice(0, 2).map((document) => ({ document, score: 0 }))
  return {
    sourceIds: selected.map((candidate) => candidate.document.id),
    relationLines,
    pack: [
      "## 命中的关系",
      relationLines.length ? relationLines.join("\n") : "没有直接命中；按关键词回退。",
      ...selected.flatMap((candidate) => [
        `## ${candidate.document.id}｜${candidate.document.path}`,
        candidate.document.content,
      ]),
    ].join("\n\n"),
  }
}

function relationshipIndex() {
  return `# 灰脊王国关系索引

- 灰脊王国 --位于附近--> 赤冠龙巢 [SRC-GEO-01]
- 赤冠龙巢 --产生资源--> 龙蜕与灰晶 [SRC-ECO-01]
- 灰脊王国 --长期遭受--> 灰耳哥布林侵袭 [SRC-HIS-01]
- 灰耳哥布林侵袭 --随七年菌潮增强--> 地表劫掠 [SRC-HIS-01]
- 灰脊王国 --控制--> 黑曜隘道 [SRC-GEO-01] [SRC-ECO-01]
- 黑曜隘道 --连接--> 南方粮食贸易 [SRC-ECO-01]
- 三座堡镇 --缔结--> 烽火盟约 [SRC-POL-01]
- 烽火盟约 --演变为--> 灰脊王国 [SRC-POL-01]
- 守望义务 --换取--> 税役减免 [SRC-POL-01]
- 龙巢与菌潮 --形成--> 火塔历法与危险地主观念 [SRC-CUL-01]
`
}

function retrievalDocuments(): RetrievalDocument[] {
  return [
    {
      id: "SRC-GEO-01",
      path: "检索资料/地理与龙巢.md",
      keywords: ["龙巢", "赤冠", "黑曜隘道", "地理", "迁徙", "定居"],
      content: `赤冠龙巢位于灰脊山最高的破火山口，距三座主要堡镇约两日山路。成年赤冠龙主要捕食高地巨角羊，居民不惊扰巢穴时很少主动攻击聚落。旧熔岩沟构成北侧天然屏障，黑曜隘道则是穿越灰脊山最稳定的南北通路。`,
    },
    {
      id: "SRC-HIS-01",
      path: "检索资料/哥布林与菌潮.md",
      keywords: ["哥布林", "灰耳", "菌潮", "侵袭", "历史", "劫掠"],
      content: `灰耳哥布林平时分散在北侧洞窟。地下孢子林约每七年出现一次菌潮，迫使多个部族同时向地表迁移。他们优先抢夺盐、铁器和可长期储存的粮食，而不是无差别屠杀。三次大菌潮迫使山口聚落建立连续火塔和轮值守望。`,
    },
    {
      id: "SRC-ECO-01",
      path: "检索资料/资源与贸易.md",
      keywords: ["龙蜕", "灰晶", "资源", "贸易", "粮食", "商人", "黑曜隘道"],
      content: `赤冠龙离巢后，持证采集者可在外缘拾取自然脱落的龙鳞与熔灰结晶；王国法律禁止进入巢穴。龙蜕、灰晶和黑曜隘道的通行税提供高额收入。高地耕地不足，王国依赖南方输入谷物，因此组织商队的三家行会掌握粮仓与冬季信贷。`,
    },
    {
      id: "SRC-POL-01",
      path: "检索资料/建国残片.md",
      keywords: ["建国", "烽火盟约", "守望", "军役", "税役", "堡镇", "制度"],
      content: `最初的三座堡镇与商队行会为共同维护火塔签订烽火盟约。盟约推举一名战时总守望，职位后来世袭为王冠，但三镇议会保留粮税和开战表决权。每户按人口承担守望日，完成义务即可减免部分道路税和冬季征粮。`,
    },
    {
      id: "SRC-CUL-01",
      path: "检索资料/习俗与称谓.md",
      keywords: ["文化", "火塔", "历法", "危险地主", "龙", "菌潮"],
      content: `当地人不崇拜赤冠龙，而称它为“山顶的危险地主”：它带来财富和屏障，也随时可能毁坏越界者。七年菌潮成为长周期历法的基准，成年礼包含第一次夜间守塔。民歌常把稳定燃烧的烽火与按时履约联系在一起。`,
    },
  ]
}

function createProviderFetch(dispatcher: EnvHttpProxyAgent, requestBodies: string[]): typeof fetch {
  const providerFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requestBodies.push(String(init?.body ?? ""))
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
  if (!value) throw new Error(`SELF QUESTION LIVE FAIL: ${name} is not configured`)
  return value
}

function requireCondition(condition: boolean, message: string) {
  if (!condition) throw new Error(`SELF QUESTION LIVE FAIL: ${message}`)
}
