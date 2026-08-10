import { ClineCore, CoreSessionService, SqliteSessionStore } from "@cline/sdk"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  buildWorldMaterializationWritingPrompt,
  hashWritingContract,
  publicationGenre,
  requireResearchSubmissionV7,
  resolveWritingContract,
  type WorldBlueprintLayerDocument,
  type WorldBlueprintObject,
  type WorldMaterializationResearchPacket,
  type WorldMaterializationResearchPacketV7,
} from "../../world-blueprint/src/index.ts"

const projectRoot = process.env.CREATX_STYLE_SOURCE_PROJECT?.trim() || "D:\\CodexCache\\Temp\\CreatX Pro V2 经典中世纪蓝图项目 3OVVWf"
const workRoot = "阿斯特拉恩"
const repository = resolve(import.meta.dirname, "../../../..")
const evidenceName = process.env.CREATX_STYLE_EVIDENCE_NAME?.trim() || "pro-v4-deepseek-layer-genres-six-sample-r2"
if (!/^[a-z0-9-]+$/u.test(evidenceName)) throw new Error("CREATX_STYLE_EVIDENCE_NAME must be a lowercase kebab-case directory name")
const evidenceDir = resolve(repository, "artifacts", "growth-world-live", evidenceName)
const runRoot = await mkdtemp(join(tmpdir(), "creatx-layer-genres-live-"))
const apiKey = requireEnvironment("DEEPSEEK_API_KEY")
const modelId = process.env.CREATX_MODEL_ID?.trim() || "deepseek-chat"
const store = new SqliteSessionStore({ sessionsDir: join(runRoot, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(runRoot, "sessions") })
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-pro-layer-genres-live",
  distinctId: "creatx-growth-world-pro-layer-genres-live",
  sessionService,
  capabilities: { requestToolApproval: () => ({ approved: false, reason: "This prose-only Live does not permit tools" }) },
})

const titles = process.env.CREATX_STYLE_TITLES?.split(",").map((title) => title.trim()).filter(Boolean)
  ?? ["灰烬起义", "艾尔长河", "河原马", "泛原迁居月", "谷冠女王伊莱安", "沉王之歌"]
const resumeExisting = process.env.CREATX_STYLE_RESUME === "1"
const startedAt = Date.now()

try {
  await mkdir(evidenceDir, { recursive: true })
  const objects = await blueprintObjects()
  const results = []
  for (const title of titles) {
    const sourceObject = objects.find((candidate) => candidate.title === title)
    if (!sourceObject?.plannedPath) throw new Error(`STYLE LIVE FAIL: blueprint object is missing: ${title}`)
    if (!sourceObject.genreKey) throw new Error(`STYLE LIVE FAIL: retained blueprint object has no persisted genreKey and cannot be resumed: ${title}`)
    const object: WorldBlueprintObject & { plannedPath: string; genreKey: string } = {
      ...sourceObject,
      plannedPath: sourceObject.plannedPath,
      genreKey: sourceObject.genreKey,
    }
    const genre = publicationGenre(object.layer, object.genreKey)
    const contract = resolveWritingContract({
      topicProfileKey: "classic-medieval-fantasy",
      worldStyleProfile: {
        schemaVersion: 1,
        narrativeDistance: "historical",
        register: "literary",
        knowledgePosition: "retrospective",
        languageConventions: ["使用世界内部纪年和正式称呼"],
        forbiddenPatterns: ["现代项目管理语言"],
        sourceIds: ["legacy-live-evidence"],
      },
      object,
    })
    const paths = {
      old: join(evidenceDir, `A-旧版-${title}.md`),
      body: join(evidenceDir, `B-新版-${title}.md`),
      prompt: join(evidenceDir, `Prompt-${title}.md`),
    }
    if (resumeExisting && Object.values(paths).every(existsSync)) {
      const [oldBody, body] = await Promise.all([readFile(paths.old, "utf8"), readFile(paths.body, "utf8")])
      results.push(result(title, object, contract, oldBody, body, "resumed"))
      console.log(JSON.stringify({ status: "STYLE_SAMPLE_REUSED", title, genre: genre.label, characters: body.replace(/\s/gu, "").length }))
      continue
    }
    const legacy = JSON.parse(await readFile(join(projectRoot, workRoot, "世界蓝图", "研究包", `${object.id}.json`), "utf8")) as LegacyResearchPacket
    const packet = await convertPacket(object, legacy, contract)
    const prompt = buildWorldMaterializationWritingPrompt(
      workRoot,
      object as WorldBlueprintObject & { plannedPath: string },
      packet,
      contract,
      "不要调用工具。充分展开每个组织节拍，正文至少约 1500 个非空白中文字符，不得靠重复或空泛总结凑长。只在本次回复中输出完整、可直接出版的 Markdown 正文；标题必须与对象标题一致。",
    )
    const session = await core.start({
      source: "desktop",
      interactive: false,
      sessionMetadata: { title: `${title}：${genre.label}` },
      config: {
        providerId: "deepseek",
        modelId,
        apiKey,
        cwd: runRoot,
        workspaceRoot: runRoot,
        mode: "act",
        systemPrompt: "你是世界设定集的正式出版作者。严格执行用户给出的目标文类，只返回正文，不解释工作过程。",
        maxIterations: 1,
        enableTools: false,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
      },
      toolPolicies: {},
    })
    const response = await core.send({ sessionId: session.sessionId, prompt, timeoutMs: 600_000 })
    if (!response?.text.trim()) throw new Error(`STYLE LIVE FAIL: Provider returned no prose for ${title}`)
    const body = stripFence(response.text.trim())
    const characters = body.replace(/\s/gu, "").length
    if (characters < 1_200) throw new Error(`STYLE LIVE FAIL: ${title} returned only ${characters} non-whitespace characters`)
    const auditMatches = auditTerms().flatMap((pattern) => body.match(pattern) ?? [])
    if (auditMatches.length) throw new Error(`STYLE LIVE FAIL: ${title} still contains editorial audit language: ${[...new Set(auditMatches)].join("、")}`)
    const oldBody = await readFile(join(projectRoot, object.plannedPath), "utf8")
    await Promise.all([
      writeFile(join(evidenceDir, `A-旧版-${title}.md`), oldBody, "utf8"),
      writeFile(join(evidenceDir, `B-新版-${title}.md`), `${body}\n`, "utf8"),
      writeFile(join(evidenceDir, `Prompt-${title}.md`), `${prompt}\n`, "utf8"),
    ])
    results.push(result(title, object, contract, oldBody, body, response.finishReason))
    await core.stop(session.sessionId)
    console.log(JSON.stringify({ status: "STYLE_SAMPLE_COMPLETED", title, genre: genre.label, characters }))
  }

  const report = {
    status: "GROWTH WORLD PRO LAYER GENRES PROVIDER LIVE PASS",
    provider: "deepseek",
    model: modelId,
    projectRoot,
    workRoot,
    sampleCount: results.length,
    results,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    evidenceDir,
    scope: "Real Provider prose-only A/B; no Electron, image queue, or production project mutation",
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(report, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify(report))
} finally {
  try {
    await core.dispose("Growth World Pro layer genre Live cleanup")
  } finally {
    store.close()
    await rm(runRoot, { recursive: true, force: true })
  }
}

interface LegacyResearchPacket {
  artifactBrief: {
    purpose: string
    inScope: string[]
    requiredFacts: string[]
  }
  claims: WorldMaterializationResearchPacket["claims"]
  terms: WorldMaterializationResearchPacket["terms"]
  openQuestions?: Array<{ question: string }>
  excludedExternalTerms?: string[]
}

async function blueprintObjects() {
  const directory = join(projectRoot, workRoot)
  const layers = [
    "核心规则与边界", "宇宙、自然与地理", "生态、资源与物种", "经济、技术与力量体系",
    "社会、文化与日常生活", "国家、组织与权力", "历史、时代与重大事件", "地区、城市与重要地点",
    "当前局势与核心冲突", "人物、关系与阵营", "故事、传说与叙事入口", "视觉、地图与关系索引",
  ]
  return (await Promise.all(layers.map(async (layer) => JSON.parse(await readFile(join(directory, layer, "蓝图.json"), "utf8")) as WorldBlueprintLayerDocument))).flatMap((document) => document.objects)
}

async function convertPacket(object: WorldBlueprintObject & { genreKey: string }, legacy: LegacyResearchPacket, contract: ReturnType<typeof resolveWritingContract>) {
  const genre = publicationGenre(object.layer, contract.genreKey)
  const initialPrompt = `对象：${object.title}\n目标文类：${genre.label}\n组织节拍：\n${genre.structure.map((beat) => `- ${beat}`).join("\n")}\n\n既有 claims：\n${JSON.stringify(legacy.claims, undefined, 2)}\n\n这是原创世界。返回严格 JSON，只能包含 claims、contentCards、terms、consistencyGuard。claims 保留既有字段；新增事实必须成为 epistemicStatus=inferred 的独立 claim。contentCards 每项只能包含 beat 和一个 claimId，不得写 text 或 claimIds；每个组织节拍至少一张卡。terms 每项包含 canonical、aliases、claimId，名称必须逐字出现在实际采用的 claim 中。consistencyGuard 只能包含 invariants 与 attributedClaims；invariants 逐字引用实际采用的 established claim，attributedClaims 只绑定实际采用的 contested claim，并用 attributionClaimId 引用另一条也被内容卡采用并进入 invariant 的 established 归属 claim。绝对禁止“现有资料、支持、不支持、推演、节点、接口、责任链、研究包、物化、Writer、制作流程”等分析语言。不要输出 Markdown 围栏。`
  let prompt = initialPrompt
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await runContentCardTurn(object.title, attempt, prompt)
    try {
      const converted = JSON.parse(stripFence(response)) as Pick<WorldMaterializationResearchPacketV7, "claims" | "contentCards" | "terms" | "consistencyGuard">
      const packet = {
        schemaVersion: 7,
        objectId: object.id,
        writingContractHash: hashWritingContract(contract),
        contentBrief: {
          focus: `${object.title}作为${object.layer}中的独立出版条目`,
          requiredElements: legacy.artifactBrief.inScope,
          concreteDetails: [...legacy.artifactBrief.requiredFacts, ...legacy.claims.slice(0, 6).map((claim) => claim.claim)],
          developmentSpace: ["在不违反可采用事实和正式称呼的前提下，补足目标文类需要的具体场景、顺序、空间或观察细节"],
          avoidDuplication: [],
        },
        claims: converted.claims,
        contentCards: converted.contentCards,
        terms: converted.terms,
        consistencyGuard: converted.consistencyGuard,
        criticalGaps: [],
        excludedExternalTerms: legacy.excludedExternalTerms ?? [],
      } satisfies WorldMaterializationResearchPacketV7
      return requireResearchSubmissionV7(packet, object, contract, hashWritingContract(contract))
    } catch (error) {
      if (attempt === 3) throw error
      prompt = `${initialPrompt}\n\n上一版研究包被 Runtime 拒绝：${error instanceof Error ? error.message : String(error)}。重新生成完整 JSON；所有新增内容必须先成为 inferred claim，内容卡只引用 claimId。`
    }
  }
  throw new Error(`STYLE LIVE FAIL: content card retry loop exhausted for ${object.title}`)
}

async function runContentCardTurn(title: string, attempt: number, prompt: string) {
  const session = await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title: `${title}：内容卡整理 ${attempt}` },
    config: {
      providerId: "deepseek", modelId, apiKey, cwd: runRoot, workspaceRoot: runRoot, mode: "act",
      systemPrompt: "你是出版内容编辑。只把给定事实改写成目标文类可直接使用的内容卡，不写正文，不解释。",
      maxIterations: 1, enableTools: false, enableSpawnAgent: false, enableAgentTeams: false, disableMcpSettingsTools: true,
    },
    toolPolicies: {},
  })
  try {
    const response = await core.send({ sessionId: session.sessionId, prompt, timeoutMs: 600_000 })
    if (!response?.text.trim()) throw new Error(`STYLE LIVE FAIL: Provider returned no content cards for ${title}`)
    return response.text.trim()
  } finally {
    await core.stop(session.sessionId)
  }
}

function stripFence(text: string) {
  const match = text.match(/^```(?:markdown|md|json)?\s*\n([\s\S]*?)\n```$/iu)
  return match?.[1]?.trim() ?? text
}

function result(
  title: string,
  object: WorldBlueprintObject,
  contract: ReturnType<typeof resolveWritingContract>,
  oldBody: string,
  body: string,
  finishReason: string,
) {
  return {
    title,
    layer: object.layer,
    genre: contract.genreLabel,
    genreKey: contract.genreKey,
    oldCharacters: oldBody.replace(/\s/gu, "").length,
    newCharacters: body.replace(/\s/gu, "").length,
    finishReason,
    oldAuditTerms: auditTerms().reduce((count, pattern) => count + (oldBody.match(pattern)?.length ?? 0), 0),
    newAuditTerms: auditTerms().reduce((count, pattern) => count + (body.match(pattern)?.length ?? 0), 0),
  }
}

function auditTerms() {
  return [/^##\s*(?:事件定位|战争如何运行|叙述边界|运行边界|证据边界)\s*$/gmu, /现有事实支持/gu, /不支持在没有新增依据时/gu, /(?:节点|责任)接口/gu]
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`STYLE LIVE FAIL: ${name} is not configured`)
  return value
}
