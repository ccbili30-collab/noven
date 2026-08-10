export const WORLD_BLUEPRINT_LAYERS = [
  "核心规则与边界",
  "宇宙、自然与地理",
  "生态、资源与物种",
  "经济、技术与力量体系",
  "社会、文化与日常生活",
  "国家、组织与权力",
  "历史、时代与重大事件",
  "地区、城市与重要地点",
  "当前局势与核心冲突",
  "人物、关系与阵营",
  "故事、传说与叙事入口",
  "视觉、地图与关系索引",
] as const

export const WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8] as const

export type WorldBlueprintLayer = typeof WORLD_BLUEPRINT_LAYERS[number]

export interface WorldBlueprintObject {
  id: string
  key: string
  title: string
  layer: WorldBlueprintLayer
  kind: "group" | "entry"
  parentId: string | null
  plannedPath?: string
  genreKey?: string
  locator: string
  order: number
  status: "planned"
}

export interface WorldBlueprintLayerDocument {
  schemaVersion: 3
  layer: WorldBlueprintLayer
  objects: WorldBlueprintObject[]
}

export interface WorldBlueprintCausalRelation {
  from: string
  to: string
  type: "causes"
  reason: string
}

export interface WorldBlueprintRelationsDocument {
  schemaVersion: 3
  relations: WorldBlueprintCausalRelation[]
}

export interface WorldBlueprintIndexDocument {
  schemaVersion: 3
  root: string
  status: "draft" | "review" | "frozen"
  layers: Array<{ layer: WorldBlueprintLayer; path: string; objectCount: number; plannedPathCount: number }>
  causalRelationCount: number
  crossLayerCausalRelationCount: number
}

export interface WorldBlueprintSourceRecord {
  id: string
  kind: "user" | "project" | "web" | "canon"
  locator: string
  authority: string
  summary: string
  capturedAt?: string
  contentHash?: string
  excerpts?: string[]
}

export interface WorldBlueprintCreativeDirection {
  worldPremise: string
  creativeDirection: string
  tone: string
  themes: string[]
  constraints: string[]
  unresolvedQuestions: string[]
}

export interface WorldBlueprintPendingBatch {
  batchId: string
  payloadHash: string
  layer: WorldBlueprintLayer
  payload: {
    objects: Array<{ key: string; title: string; kind: "group" | "entry"; parentKey?: string; genreKey?: string; rationale: string }>
    causes: Array<{ fromKey: string; toKey: string; reason: string }>
  }
}

export interface WorldBlueprintStateDocument {
  schemaVersion: 3
  root: string
  worldName: string
  route: "original" | "canon" | "fanwork"
  topicProfileKey: string
  topicProfileVersion: 1
  worldStyleProfile: import("./writing-contract.ts").WorldStyleProfile
  sources: WorldBlueprintSourceRecord[]
  direction: WorldBlueprintCreativeDirection
  ownerGoalId: string
  acceptedGoalVersion: number
  revision: number
  status: "draft" | "review" | "frozen"
  batches: Array<{ batchId: string; payloadHash: string; layer: WorldBlueprintLayer }>
  pendingBatch?: WorldBlueprintPendingBatch
}

export interface WorldBlueprintArtifactEvidence {
  relativePath: string
  text?: string
}

export function validateFrozenWorldBlueprintArtifacts(artifacts: readonly WorldBlueprintArtifactEvidence[]) {
  return validateBlueprintArtifacts(artifacts, "frozen")
}

export function validateReviewWorldBlueprintArtifacts(artifacts: readonly WorldBlueprintArtifactEvidence[]) {
  return validateBlueprintArtifacts(artifacts, "review")
}

function validateBlueprintArtifacts(artifacts: readonly WorldBlueprintArtifactEvidence[], expectedStatus: "review" | "frozen") {
  const normalized = artifacts.map((artifact) => ({ ...artifact, relativePath: artifact.relativePath.replaceAll("\\", "/") }))
  const stateArtifact = normalized.find((artifact) => artifact.relativePath.endsWith("/世界蓝图/state.json"))
  const root = stateArtifact?.relativePath.slice(0, -"/世界蓝图/state.json".length)
  if (!stateArtifact?.text || !root) return "蓝图回执必须包含可读取的 <作品根>/世界蓝图/state.json"
  const state = parseJson<WorldBlueprintStateDocument>(stateArtifact.text)
  if (!state || state.schemaVersion !== 3 || state.root !== root || state.status !== expectedStatus) return `世界蓝图/state.json 必须是 ${expectedStatus} 的 schemaVersion 3 状态`
  const layerDocuments = WORLD_BLUEPRINT_LAYERS.map((layer) => {
    const artifact = normalized.find((candidate) => candidate.relativePath === `${root}/${layer}/蓝图.json`)
    return artifact?.text ? parseJson<WorldBlueprintLayerDocument>(artifact.text) : undefined
  })
  const missingLayer = layerDocuments.findIndex((document) => !document)
  if (missingLayer >= 0) return `蓝图回执缺少可读取的 ${WORLD_BLUEPRINT_LAYERS[missingLayer]}/蓝图.json`
  const relationArtifact = normalized.find((artifact) => artifact.relativePath === `${root}/世界蓝图/relations.json`)
  const indexArtifact = normalized.find((artifact) => artifact.relativePath === `${root}/世界蓝图/index.json`)
  if (!relationArtifact?.text || !indexArtifact?.text) return "蓝图回执缺少可读取的总索引或因果关系文件"
  const relations = parseJson<WorldBlueprintRelationsDocument>(relationArtifact.text)
  const index = parseJson<WorldBlueprintIndexDocument>(indexArtifact.text)
  if (!relations || !index) return "蓝图总索引或因果关系文件不是有效 JSON"
  if (index.status !== expectedStatus) return `世界蓝图/index.json 必须是 ${expectedStatus} 状态`
  return validateWorldBlueprintDocuments(root, layerDocuments as WorldBlueprintLayerDocument[], relations, index, true)
}

export function validateWorldBlueprintDocuments(
  root: string,
  layers: readonly WorldBlueprintLayerDocument[],
  relations: WorldBlueprintRelationsDocument,
  index: WorldBlueprintIndexDocument,
  requireComplete: boolean,
) {
  if (layers.length !== 12 || index.schemaVersion !== 3 || index.root !== root || relations.schemaVersion !== 3) return "世界蓝图必须使用 schemaVersion 3 并包含十二层、总索引和因果关系"
  const invalidLayer = layers.findIndex((document, layerIndex) => document.schemaVersion !== 3
    || document.layer !== WORLD_BLUEPRINT_LAYERS[layerIndex]
    || !Array.isArray(document.objects))
  if (invalidLayer >= 0) return `${WORLD_BLUEPRINT_LAYERS[invalidLayer]}/蓝图.json 的结构无效`
  const incompleteLayer = layers.findIndex((document, layerIndex) => requireComplete
    && document.objects.filter((object) => object.kind === "entry").length < WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]!)
  if (incompleteLayer >= 0) return `${WORLD_BLUEPRINT_LAYERS[incompleteLayer]} 至少需要 ${WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[incompleteLayer]} 个正文条目，当前为 ${layers[incompleteLayer]!.objects.filter((object) => object.kind === "entry").length}`
  const oversizedLayer = layers.findIndex((document) => document.objects.length > 80)
  if (oversizedLayer >= 0) return `${WORLD_BLUEPRINT_LAYERS[oversizedLayer]} 超过单层 80 个对象上限`
  const objects = layers.flatMap((document) => {
    return document.objects
  })
  if (objects.length > 720) return "世界蓝图超过全世界 720 个对象上限"
  const ids = new Set<string>()
  const keys = new Set<string>()
  const paths = new Set<string>()
  const objectLayers = new Map<string, string>()
  for (const object of objects) {
    if (!object.id || ids.has(object.id) || !object.key || keys.has(object.key)) return "蓝图对象 ID 和 key 必须全世界唯一"
    if (!WORLD_BLUEPRINT_LAYERS.includes(object.layer) || object.status !== "planned" || !Number.isInteger(object.order) || object.order < 1) return `蓝图对象 ${object.id} 的层、状态或顺序无效`
    if (!object.title.trim() || isPlaceholderLabel(object.title)) return `蓝图对象 ${object.id} 使用了无效或占位标题`
    if (!object.locator.startsWith(`${object.layer}｜`) || object.locator.slice(object.layer.length + 1).trim().length < 8) return `蓝图对象 ${object.id} 缺少具体归层理由`
    if (object.kind === "group") {
      if (object.plannedPath !== undefined || object.genreKey !== undefined) return `蓝图分组 ${object.id} 不得包含 plannedPath 或 genreKey`
    } else {
      if (!object.parentId || !object.plannedPath?.startsWith(`${root}/${object.layer}/`) || !object.plannedPath.endsWith(".md") || !object.genreKey?.trim()) return `蓝图条目 ${object.id} 缺少同层父对象、合法计划路径或 genreKey`
      const pathKey = windowsPathKey(object.plannedPath)
      if (paths.has(pathKey)) return `蓝图计划路径在 Windows 上冲突：${object.plannedPath}`
      paths.add(pathKey)
    }
    ids.add(object.id)
    keys.add(object.key)
    objectLayers.set(object.id, object.layer)
  }
  for (const [layerIndex, layer] of WORLD_BLUEPRINT_LAYERS.entries()) {
    const layerObjects = objects.filter((object) => object.layer === layer)
    const groups = layerObjects.filter((object) => object.kind === "group")
    const entries = layerObjects.filter((object) => object.kind === "entry")
    if (requireComplete && (groups.length < 2 || groups.length > 8 || entries.length < WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]!)) return `${layer} 必须包含 2 至 8 个分组和至少 ${WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]} 个正文条目`
    const layerIds = new Set(layerObjects.map((object) => object.id))
    if (new Set(layerObjects.map((object) => object.order)).size !== layerObjects.length) return `${layer} 的对象 order 必须在本层唯一`
    const invalidParent = layerObjects.find((object) => object.parentId !== null && !layerIds.has(object.parentId))
    if (invalidParent) return `蓝图对象 ${invalidParent.id} 的 parentId 不是同层对象`
    for (const object of layerObjects) {
      const ancestors = new Set([object.id])
      let parentId = object.parentId
      while (parentId) {
        if (ancestors.has(parentId)) return `蓝图对象 ${object.id} 的父子层级形成循环`
        ancestors.add(parentId)
        parentId = layerObjects.find((candidate) => candidate.id === parentId)?.parentId ?? null
      }
    }
    const indexEntry = index.layers.find((entry) => entry.layer === layer)
    const plannedPathCount = entries.length
    if (!indexEntry || indexEntry.path !== `${root}/${layer}/蓝图.json` || indexEntry.objectCount !== layerObjects.length || indexEntry.plannedPathCount !== plannedPathCount) return `世界蓝图/index.json 未按真实文件登记 ${layer}`
    if (requireComplete && entries.length < WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]!) return `${layer} 正文条目数量不足`
  }
  let crossLayer = 0
  const relationKeys = new Set<string>()
  for (const relation of relations.relations) {
    if (!ids.has(relation.from) || !ids.has(relation.to) || relation.from === relation.to || relation.type !== "causes" || relation.reason.trim().length < 8) return "因果关系必须引用两个不同的已登记对象，并提供具体原因"
    const key = `${relation.from}\u0000${relation.to}`
    if (relationKeys.has(key)) return `因果关系重复：${relation.from} -> ${relation.to}`
    relationKeys.add(key)
    if (objectLayers.get(relation.from) !== objectLayers.get(relation.to)) crossLayer += 1
  }
  if (index.causalRelationCount !== relations.relations.length || index.crossLayerCausalRelationCount !== crossLayer) return "世界蓝图/index.json 的因果关系统计与真实关系不一致"
  if (requireComplete && crossLayer < 24) return `冻结蓝图至少需要 24 条跨层因果关系，当前为 ${crossLayer}`
  return undefined
}

function windowsPathKey(value: string) {
  return value.replaceAll("\\", "/").normalize("NFC").toLocaleLowerCase("en-US")
}

export function parseJson<T>(text: string): T | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === "object" && !Array.isArray(value) ? value as T : undefined
  } catch {
    return undefined
  }
}

function isPlaceholderLabel(value: string) {
  return /(?:对象|条目|节点|项目|实体|占位|object|item|node|entity)\s*[-_#:：]?\s*\d+$/iu.test(value.trim())
}
