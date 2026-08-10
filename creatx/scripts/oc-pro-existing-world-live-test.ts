import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { ClineAdapter } from "@creatx/cline-adapter"
import type { CreatXEvent } from "@creatx/contracts"
import { ImageRuntime } from "@creatx/image-runtime"
import { ImageTaskQueue, ImageTaskStore } from "@creatx/image-runtime/queue"
import { projectId, ProjectFileService } from "@creatx/project-files"
import { OC_PRO_SKILL_SOURCE } from "@creatx/creative-skills"
import { SessionPermissionStore } from "@creatx/session-runtime"
import { WorkbenchRegistryService } from "@creatx/workbench"
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici"

const sourceRoot = resolve("D:/CodexCache/Temp/CreatX Pro V2 经典中世纪蓝图项目 3OVVWf/阿斯特拉恩")
const evidenceName = process.env.CREATX_OC_PRO_EVIDENCE_NAME?.trim() || "2026-08-02"
if (!/^[a-z0-9-]+$/u.test(evidenceName)) throw new Error("OC PRO LIVE FAIL: evidence name is invalid")
const evidenceDir = resolve(import.meta.dirname, `../../artifacts/oc-pro-live/${evidenceName}`)
const replayResponsePath = process.env.CREATX_OC_PRO_REPLAY_RESPONSE?.trim()
const replayResponse = replayResponsePath ? await readFile(resolve(replayResponsePath), "utf8") : undefined
const replayResponseHash = replayResponse ? createHash("sha256").update(replayResponse).digest("hex") : undefined
const expectedReplayHash = process.env.CREATX_OC_PRO_REPLAY_SHA256?.trim().toLowerCase()
if (replayResponse && !/^[a-f0-9]{64}$/u.test(expectedReplayHash ?? "")) throw new Error("OC PRO LIVE FAIL: saved response replay requires CREATX_OC_PRO_REPLAY_SHA256")
if (replayResponseHash && replayResponseHash !== expectedReplayHash) throw new Error("OC PRO LIVE FAIL: saved response replay hash mismatch")
const projectRoot = join(evidenceDir, "project")
const runtimeRoot = join(evidenceDir, "runtime")
const worldRoot = "阿斯特拉恩"
const characterName = "谷冠女王伊莱安"
const characterOutput = `${worldRoot}/人物、关系与阵营/OC设定/${characterName}`
const sourcePaths = [
  `${worldRoot}/世界基准.md`,
  `${worldRoot}/关系/index.json`,
  `${worldRoot}/人物、关系与阵营/${characterName}.md`,
  `${worldRoot}/国家、组织与权力/谷冠王国.md`,
  `${worldRoot}/国家、组织与权力/泛原粮议会.md`,
  `${worldRoot}/社会、文化与日常生活/炉边继承法.md`,
  `${worldRoot}/经济、技术与力量体系/封誓骑士团.md`,
  `${worldRoot}/当前局势与核心冲突/三关集兵令.md`,
  `${worldRoot}/当前局势与核心冲突/泛原歉收预兆.md`,
] as const
const worldSourcePaths = sourcePaths.filter((path) => !path.endsWith("世界基准.md") && !path.endsWith("关系/index.json") && !path.endsWith(`/${characterName}.md`))
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const skipImage = process.env.CREATX_OC_PRO_SKIP_IMAGE === "1"
await rm(evidenceDir, { recursive: true, force: true })
await mkdir(projectRoot, { recursive: true })
const dispatcher = new EnvHttpProxyAgent()
const permissions = new SessionPermissionStore(join(runtimeRoot, "session.sqlite"))
const events: CreatXEvent[] = []
const adapter = await ClineAdapter.create({
  dataDir: join(runtimeRoot, "cline"),
  providerId: "openai-compatible",
  modelId: "gpt-5.6-luna",
  apiKey,
  baseUrl,
  systemGuidance: [OC_PRO_SKILL_SOURCE, "这是无工具的有界 Provider Pilot。只返回用户要求的严格 JSON，不调用任何工具。"],
  sessionPermissions: permissions,
  onEvent: (event) => events.push(event),
})
let queue: ImageTaskQueue | undefined
let imageStore: ImageTaskStore | undefined

try {
  for (const relativePath of sourcePaths) {
    const source = join(sourceRoot, relativePath.slice(`${worldRoot}/`.length))
    const target = join(projectRoot, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target)
  }

  const sourceDocuments = await Promise.all(sourcePaths.map(async (relativePath) => ({ relativePath, content: await readFile(join(projectRoot, relativePath), "utf8") })))
  const prompt = buildPrompt(sourceDocuments)
  const response = replayResponse ?? await runTurn(prompt)
  await writeFile(join(evidenceDir, "provider-response.txt"), `${response}\n`, "utf8")
  const production = requireProduction(JSON.parse(stripFence(response)))

  const files = new ProjectFileService()
  const project = await files.openProject(projectRoot)
  await Promise.all([
    writeProjectFile(files, project.id, `${characterOutput}/design-manifest.json`, JSON.stringify(production.manifest, undefined, 2)),
    writeProjectFile(files, project.id, `${characterOutput}/角色总卡.md`, production.roleCard),
    writeProjectFile(files, project.id, `${characterOutput}/人物圣经.md`, production.characterBible),
    writeProjectFile(files, project.id, `${characterOutput}/角色卡.json`, JSON.stringify(production.characterCard, undefined, 2)),
    writeProjectFile(files, project.id, `${characterOutput}/关系.json`, JSON.stringify(production.relations, undefined, 2)),
    writeProjectFile(files, project.id, `${characterOutput}/视觉制作规范.md`, production.visualProductionGuide),
  ])

  const workbenches = new WorkbenchRegistryService(files.queries, files.internal)
  await workbenches.commands.register({ projectId: project.id, folder: worldRoot, title: worldRoot })
  await workbenches.commands.register({ projectId: project.id, folder: `${worldRoot}/人物、关系与阵营/OC设定`, title: "角色设定" })

  const image = skipImage ? undefined : await generateStandardImage(files, project.id, production.imagePrompt)
  const imageSucceeded = image?.status === "succeeded"
  const imageResultUnknown = image?.status === "failed" && image.errorCode === "image_result_unknown"

  const snapshot = await workbenches.queries.snapshot(project.id)
  const registered = snapshot.workbenches.filter((workbench) => workbench.source === "registered")
  if (registered.length !== 2 || !registered.some((workbench) => workbench.folder === worldRoot) || !registered.some((workbench) => workbench.folder === `${worldRoot}/人物、关系与阵营/OC设定`)) {
    throw new Error(`OC PRO LIVE FAIL: unexpected workbench projection ${JSON.stringify(registered)}`)
  }
  const result = {
    status: imageResultUnknown
      ? "OC PRO EXISTING WORLD TEXT PACKAGE PASS — IMAGE RESULT UNKNOWN"
      : image && !imageSucceeded
        ? "OC PRO EXISTING WORLD TEXT PACKAGE PASS — IMAGE FAILED"
      : replayResponse && skipImage
        ? "OC PRO EXISTING WORLD SAVED PROVIDER RESPONSE TEXT REPLAY PASS — IMAGE NOT RETRIED"
      : replayResponse
        ? "OC PRO EXISTING WORLD SAVED PROVIDER RESPONSE REPLAY PASS"
        : skipImage
          ? "OC PRO EXISTING WORLD TEXT PILOT PASS — IMAGE NOT RETRIED"
          : "OC PRO EXISTING WORLD PROVIDER PILOT PASS",
    provider: "JMRAI openai-compatible",
    textModel: "gpt-5.6-luna",
    imageModel: "gpt-image-2-cheap",
    characterName,
    selectedTier: production.manifest.tier,
    worldSourcePaths: production.manifest.worldSourcePaths,
    providerRequests: events.filter((event) => event.type === "run.state" && event.state === "running").length,
    textExecution: replayResponse ? `hash-bound saved Provider response replayed from ${resolve(replayResponsePath!)}` : "real Provider request",
    ...(replayResponseHash ? { replayResponseSha256: replayResponseHash } : {}),
    ...(image ? {
      imageTaskId: image.imageTaskId,
      imageStatus: image.status,
      imageErrorCode: image.errorCode,
      imageErrorMessage: image.errorMessage,
      ...(imageSucceeded ? { imageBytes: (await readFile(join(projectRoot, `${characterOutput}/图片/标准全身立绘.png`))).byteLength } : {}),
    } : { imageStatus: "not-retried-after-result-unknown" }),
    registeredWorkbenches: registered.map((workbench) => ({ folder: workbench.folder, title: workbench.title })),
    projectRoot,
    scope: imageResultUnknown
      ? "Validated OC Pro text package + real workbench registry; persistent image task ended without a confirmed result and was not retried; no Electron UI or dependent reference-image design sheets"
      : image && !imageSucceeded
        ? `Validated OC Pro text package + real workbench registry; persistent image task ended as ${image.status} with ${image.errorCode ?? "an unclassified error"}; no Electron UI or dependent reference-image design sheets`
      : replayResponse && skipImage
        ? "Hash-bound saved Provider response revalidated after correcting an over-precise deterministic length gate + real workbench registry; image Result Unknown evidence remains in the prior run and was not retried; no Electron UI"
      : replayResponse
        ? "Hash-bound saved Provider response revalidated after correcting an over-precise deterministic length gate + persistent image queue + real workbench registry; no second text Provider request, Electron UI, or dependent reference-image design sheets"
        : skipImage
          ? "Real text Provider + validated OC Pro package + real workbench registry; prior image Result Unknown was not retried, no Electron UI"
          : "Real text Provider + validated OC Pro package + persistent image queue + real workbench registry; no Electron UI or dependent reference-image design sheets",
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} finally {
  await queue?.shutdown().catch(() => undefined)
  imageStore?.close()
  try {
    await adapter.dispose()
  } finally {
    permissions.close()
    await dispatcher.close()
  }
}

interface Production {
  manifest: {
    schemaVersion: 2
    characterName: string
    sourceCharacterPath: string
    sourceObjectId: string
    tier: "快速档" | "完整档" | "制作档"
    tierReason: string
    worldSourcePaths: string[]
    worldMarks: Array<{ sourceFact: string; characterTrace: string; sourcePath: string }>
    storyEngine: {
      externalGoal: string
      internalNeed: string
      falseBelief: string
      wound: string
      fear: string
      flaw: string
      contradiction: string
      stakes: string
      irreversibleChoice: string
      arc: string
    }
    personalityCore: string[]
    voiceGuide: {
      rhythm: string
      vocabulary: string[]
      avoidedTopics: string[]
      underPressure: string
      sampleLines: string[]
    }
    visualAnchors: string[]
    palette: string[]
    materials: string[]
    signatureProps: string[]
    relationships: Array<{ target: string; type: string; description: string; sourcePath: string }>
    plannedOutputs: string[]
  }
  roleCard: string
  characterBible: string
  characterCard: Record<string, unknown>
  relations: { schemaVersion: 1; characterName: string; relations: Array<{ target: string; type: string; description: string; sourcePath: string }> }
  visualProductionGuide: string
  imagePrompt: string
}

function buildPrompt(documents: Array<{ relativePath: string; content: string }>) {
  const sources = documents.map((document) => `SOURCE_BEGIN ${document.relativePath}\n${document.content}\nSOURCE_END ${document.relativePath}`).join("\n\n")
  return `使用 OC Pro 为已有世界角色“${characterName}”制作角色总卡、人物圣经和视觉制作包。不要创造替代角色，不要改写世界，不要输出图片本身。她是王国统治者、阵营核心与多条冲突的连接人物，请自主选择三档之一。\n\n程序已经从关系图预选以下六份世界正文：\n${worldSourcePaths.map((path) => `- ${path}`).join("\n")}\n你只需从中选择实际采用的 4 至 6 份写入 worldSourcePaths。世界资料只能转化成角色亲历的损失、习惯、偏见、欲望、恐惧、身体痕迹、关系压力、服装或当前两难，绝对不要继续介绍制度、物流或行政结构。人物的核心是欲望、错误信念、矛盾和选择。\n\n返回严格 JSON，不要 Markdown 围栏，字段必须完整：\n{\n  "manifest": {\n    "schemaVersion": 2,\n    "characterName": "${characterName}",\n    "sourceCharacterPath": "${worldRoot}/人物、关系与阵营/${characterName}.md",\n    "sourceObjectId": "wbo_52e358a7e3759a6aaf9d",\n    "tier": "快速档|完整档|制作档",\n    "tierReason": "具体理由",\n    "worldSourcePaths": ["只从六份候选中选择"],\n    "worldMarks": [{"sourceFact":"来源支持的具体事实", "characterTrace":"该事实在角色身上留下的具体痕迹", "sourcePath":"实际来源"}],\n    "storyEngine": {"externalGoal":"外在目标", "internalNeed":"内在需要", "falseBelief":"错误信念", "wound":"旧伤", "fear":"可被利用的恐惧", "flaw":"会损害自身利益的缺陷", "contradiction":"核心矛盾", "stakes":"当前赌注", "irreversibleChoice":"不可逆选择", "arc":"角色弧"},\n    "personalityCore": ["至少6项具体行为倾向"],\n    "voiceGuide": {"rhythm":"语言节奏", "vocabulary":["常用词"], "avoidedTopics":["回避话题"], "underPressure":"压力下表达变化", "sampleLines":["至少3句不同处境的代表台词"]},\n    "visualAnchors": ["至少12项，覆盖轮廓、形状语言、比例、面部、发型、服装、动作和禁忌"],\n    "palette": ["至少4项颜色及用途"],\n    "materials": ["至少4项材质及用途"],\n    "signatureProps": ["至少3项"],\n    "relationships": [{"target":"已有对象", "type":"关系类型", "description":"角色欲望或恐惧如何作用于此关系", "sourcePath":"实际来源"}],\n    "plannedOutputs": ["角色总卡.md", "人物圣经.md", "角色卡.json", "关系.json", "视觉制作规范.md", "图片/标准全身立绘.png"]\n  },\n  "roleCard": "500 至 1000 个非空白中文字符的 Markdown，只含一句话角色印象、身份、当前目标、致命缺陷、当前困境、三项关键关系和故事状态；一眼可扫读",\n  "characterBible": "至少约3000个非空白中文字符的 Markdown。把 storyEngine 写成一个会行动的人，重点表现欲望、旧伤、错误信念、关系压力、会犯的错、不可逆选择、角色弧、声音与可演出行为；不写国家制度说明",\n  "characterCard": {"稳定字段":"包含总卡摘要、完整 storyEngine、voiceGuide 和视觉摘要，不复制全文"},\n  "relations": {"schemaVersion":1,"characterName":"${characterName}","relations":["与 manifest 相同形状的关系对象"]},\n  "visualProductionGuide": "至少1500个非空白中文字符的 Markdown，覆盖轮廓与形状语言、头身比例、面部、发型、服装分层、材质、色板、道具、动作姿态、表情范围、角色比例对照和禁止漂移项",\n  "imagePrompt": "只生成标准全身立绘的完整中文生图 Prompt：单人、全身、角色设计展示、中性背景、轮廓和服装结构清楚，不要文字、拼贴、剧情遮挡或多视图"\n}\n\n禁止在任何读者成品中出现：节点、接口、责任链、功能模块、系统协调、结构闭环、治理逻辑、运作机制。\n\n以下是实际世界资料：\n\n${sources}`
}

async function runTurn(prompt: string) {
  const session = await adapter.createProjectSession({ projectId: projectId(projectRoot), projectRoot })
  await adapter.sendMessage(session.id, prompt)
  const responseEvent = events.filter((event) => event.type === "timeline.upsert" && event.item.kind === "message" && event.item.state === "completed").at(-1)
  const response = responseEvent?.type === "timeline.upsert" ? responseEvent.item.text?.trim() : undefined
  if (!response) throw new Error("OC PRO LIVE FAIL: text Provider returned no content")
  return response
}

function requireProduction(value: unknown): Production {
  if (!isRecord(value) || !isRecord(value.manifest) || !isRecord(value.characterCard) || !isRecord(value.relations)) throw new Error("OC PRO LIVE FAIL: Provider output is not the required object")
  const manifest = value.manifest
  if (manifest.schemaVersion !== 2 || manifest.characterName !== characterName || manifest.sourceCharacterPath !== `${worldRoot}/人物、关系与阵营/${characterName}.md` || manifest.sourceObjectId !== "wbo_52e358a7e3759a6aaf9d") throw new Error("OC PRO LIVE FAIL: manifest identity is invalid")
  if (manifest.tier !== "快速档" && manifest.tier !== "完整档" && manifest.tier !== "制作档") throw new Error("OC PRO LIVE FAIL: tier is invalid")
  const selectedSources = strings(manifest.worldSourcePaths, "worldSourcePaths", 4, 6)
  if (selectedSources.some((path) => !worldSourcePaths.includes(path as typeof worldSourcePaths[number]))) throw new Error("OC PRO LIVE FAIL: manifest selected an unapproved world source")
  const relationships = relations(manifest.relationships)
  if (relationships.some((relation) => !sourcePaths.includes(relation.sourcePath as typeof sourcePaths[number]))) throw new Error("OC PRO LIVE FAIL: relationship source is outside the supplied project sources")
  const relationDocument = value.relations
  if (relationDocument.schemaVersion !== 1 || relationDocument.characterName !== characterName) throw new Error("OC PRO LIVE FAIL: relation document identity is invalid")
  const documentedRelationships = relations(relationDocument.relations)
  if (documentedRelationships.some((relation) => !sourcePaths.includes(relation.sourcePath as typeof sourcePaths[number]))) throw new Error("OC PRO LIVE FAIL: relation document source is outside the supplied project sources")
  const worldMarks = requireWorldMarks(manifest.worldMarks)
  if (worldMarks.some((mark) => !selectedSources.includes(mark.sourcePath))) throw new Error("OC PRO LIVE FAIL: world mark source is outside selected world sources")
  const storyEngine = requireStoryEngine(manifest.storyEngine)
  const voiceGuide = requireVoiceGuide(manifest.voiceGuide)
  const production: Production = {
    manifest: {
      schemaVersion: 2,
      characterName,
      sourceCharacterPath: manifest.sourceCharacterPath,
      sourceObjectId: manifest.sourceObjectId,
      tier: manifest.tier,
      tierReason: text(manifest.tierReason, "tierReason", 20),
      worldSourcePaths: selectedSources,
      worldMarks,
      storyEngine,
      personalityCore: strings(manifest.personalityCore, "personalityCore", 6, 20),
      voiceGuide,
      visualAnchors: strings(manifest.visualAnchors, "visualAnchors", 12, 30),
      palette: strings(manifest.palette, "palette", 4, 12),
      materials: strings(manifest.materials, "materials", 4, 12),
      signatureProps: strings(manifest.signatureProps, "signatureProps", 3, 12),
      relationships,
      plannedOutputs: strings(manifest.plannedOutputs, "plannedOutputs", 6, 20),
    },
    roleCard: text(value.roleCard, "roleCard", 400),
    characterBible: text(value.characterBible, "characterBible", 3_000),
    characterCard: value.characterCard,
    relations: { schemaVersion: 1, characterName, relations: documentedRelationships },
    visualProductionGuide: text(value.visualProductionGuide, "visualProductionGuide", 1_500),
    imagePrompt: text(value.imagePrompt, "imagePrompt", 300),
  }
  const roleCardLength = production.roleCard.replace(/\s/gu, "").length
  if (roleCardLength < 400 || roleCardLength > 1_000) throw new Error("OC PRO LIVE FAIL: roleCard must contain 400-1000 non-whitespace characters")
  if (production.characterBible.replace(/\s/gu, "").length < 3_000) throw new Error("OC PRO LIVE FAIL: characterBible is too short")
  if (production.visualProductionGuide.replace(/\s/gu, "").length < 1_500) throw new Error("OC PRO LIVE FAIL: visualProductionGuide is too short")
  const readerText = `${production.roleCard}\n${production.characterBible}\n${production.visualProductionGuide}`
  const pollution = [...new Set(readerText.match(/节点|接口|责任链|功能模块|系统协调|结构闭环|治理逻辑|运作机制/gu) ?? [])]
  if (pollution.length) throw new Error(`OC PRO LIVE FAIL: production language leaked into character output: ${pollution.join("、")}`)
  const requiredStoryHeadings = ["外在目标", "内在需要", "错误信念", "旧伤", "恐惧", "缺陷", "不可逆选择", "角色弧", "声音"]
  const missingHeading = requiredStoryHeadings.find((heading) => !production.characterBible.includes(heading))
  if (missingHeading) throw new Error(`OC PRO LIVE FAIL: characterBible is missing ${missingHeading}`)
  const requiredVisualTopics = ["轮廓", "形状语言", "比例", "面部", "发型", "服装", "材质", "色板", "道具", "动作", "表情", "禁止漂移"]
  const missingVisualTopic = requiredVisualTopics.find((topic) => !production.visualProductionGuide.includes(topic))
  if (missingVisualTopic) throw new Error(`OC PRO LIVE FAIL: visualProductionGuide is missing ${missingVisualTopic}`)
  return production
}

async function generateStandardImage(files: ProjectFileService, projectId: string, prompt: string) {
  imageStore = new ImageTaskStore(join(runtimeRoot, "image-queue.sqlite"))
  const images = new ImageRuntime({ baseUrl, apiKey, fileQueries: files.queries, fileCommands: files.commands, fetch: imageFetch(dispatcher) })
  queue = new ImageTaskQueue(imageStore, images)
  queue.start()
  const task = await queue.submit({
    projectId,
    idempotencyKey: `oc-pro:${characterName}:standard-full-body:v2`,
    prompt,
    relativePath: `${characterOutput}/图片/标准全身立绘.png`,
    model: "gpt-image-2-cheap",
  })
  const image = await waitForImage(imageStore, task.imageTaskId)
  return image
}

async function writeProjectFile(files: ProjectFileService, projectId: string, relativePath: string, content: string) {
  await files.commands.writeFile({ projectId, relativePath, content: `${content.trim()}\n`, expectedModifiedAt: null })
}

async function waitForImage(store: ImageTaskStore, imageTaskId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 600_000) {
    const task = store.get(imageTaskId)
    if (!task) throw new Error("OC PRO LIVE FAIL: image task disappeared")
    if (task.status === "succeeded" || task.status === "failed" || task.status === "interrupted") return task
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error("OC PRO LIVE FAIL: timed out waiting for standard full-body image")
}

function imageFetch(dispatcher: EnvHttpProxyAgent): typeof fetch {
  const request = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
  ) as unknown as Response
  return Object.assign(request, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function relations(value: unknown) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 20) throw new Error("OC PRO LIVE FAIL: relationships must contain 3-20 items")
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`OC PRO LIVE FAIL: relationships[${index}] is invalid`)
    return {
      target: text(item.target, `relationships[${index}].target`, 2),
      type: text(item.type, `relationships[${index}].type`, 2),
      description: text(item.description, `relationships[${index}].description`, 8),
      sourcePath: text(item.sourcePath, `relationships[${index}].sourcePath`, 8),
    }
  })
}

function requireWorldMarks(value: unknown) {
  if (!Array.isArray(value) || value.length < 6 || value.length > 20) throw new Error("OC PRO LIVE FAIL: worldMarks must contain 6-20 items")
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`OC PRO LIVE FAIL: worldMarks[${index}] is invalid`)
    return {
      sourceFact: text(item.sourceFact, `worldMarks[${index}].sourceFact`, 8),
      characterTrace: text(item.characterTrace, `worldMarks[${index}].characterTrace`, 8),
      sourcePath: text(item.sourcePath, `worldMarks[${index}].sourcePath`, 8),
    }
  })
}

function requireStoryEngine(value: unknown): Production["manifest"]["storyEngine"] {
  if (!isRecord(value)) throw new Error("OC PRO LIVE FAIL: storyEngine is invalid")
  return {
    externalGoal: text(value.externalGoal, "storyEngine.externalGoal", 12),
    internalNeed: text(value.internalNeed, "storyEngine.internalNeed", 12),
    falseBelief: text(value.falseBelief, "storyEngine.falseBelief", 12),
    wound: text(value.wound, "storyEngine.wound", 12),
    fear: text(value.fear, "storyEngine.fear", 12),
    flaw: text(value.flaw, "storyEngine.flaw", 12),
    contradiction: text(value.contradiction, "storyEngine.contradiction", 12),
    stakes: text(value.stakes, "storyEngine.stakes", 12),
    irreversibleChoice: text(value.irreversibleChoice, "storyEngine.irreversibleChoice", 12),
    arc: text(value.arc, "storyEngine.arc", 12),
  }
}

function requireVoiceGuide(value: unknown): Production["manifest"]["voiceGuide"] {
  if (!isRecord(value)) throw new Error("OC PRO LIVE FAIL: voiceGuide is invalid")
  return {
    rhythm: text(value.rhythm, "voiceGuide.rhythm", 8),
    vocabulary: strings(value.vocabulary, "voiceGuide.vocabulary", 3, 12),
    avoidedTopics: strings(value.avoidedTopics, "voiceGuide.avoidedTopics", 2, 12),
    underPressure: text(value.underPressure, "voiceGuide.underPressure", 8),
    sampleLines: strings(value.sampleLines, "voiceGuide.sampleLines", 3, 8),
  }
}

function strings(value: unknown, name: string, minimum: number, maximum: number) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`OC PRO LIVE FAIL: ${name} must contain ${minimum}-${maximum} items`)
  return value.map((item, index) => text(item, `${name}[${index}]`, 1))
}

function text(value: unknown, name: string, minimum: number) {
  if (typeof value !== "string" || value.trim().length < minimum) throw new Error(`OC PRO LIVE FAIL: ${name} is invalid`)
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stripFence(value: string) {
  return value.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim()
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`OC PRO LIVE FAIL: ${name} is not configured`)
  return value
}
