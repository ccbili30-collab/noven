import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { WorkbenchRegistryService } from "@creatx/workbench"
import { blueprintInternalKey, GROWTH_INTERNAL_NAMESPACE, publicationGenreKeys, validateReviewWorldBlueprintArtifacts, WorldBlueprintService, WORLD_BLUEPRINT_LAYERS, WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX 世界蓝图 "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const workbenches = new WorkbenchRegistryService(files.queries, files.internal)
  const service = new WorldBlueprintService(files.queries, files.commands, files.internal, workbenches.commands, workbenches.queries)
  return { root, project, files, workbenches, service, tool: service.tool() }
}

const context = (projectId: string, growthStageKey = "world-blueprint-create") => ({ sessionId: "session-1", projectId, growthGoalId: "goal-1", growthGoalVersion: 1, growthStageKey })
const routeContext = (projectId: string) => context(projectId, "route-and-sources")
const confirmContext = (projectId: string) => context(projectId, "world-blueprint-confirm")

const visualStyle = {
  artMovementAndMedium: "以十五世纪手抄本细密画和蛋彩画为媒介基础，保留天然颜料与羊皮纸的手工质感。",
  colorAndLighting: "使用矿物蓝、赭石、暗红和旧金，日光克制，夜景主要由火焰与月光塑造层次。",
  eraMaterialsAndCraft: "金属、木材、石材、皮革和织物必须符合中古手工制作痕迹，不出现工业量产品。",
  architectureCostumeAndWeapons: "建筑承重、服装层次与武器结构共享同一中古工艺语言，并体现地区材料差异。",
  motifsSymbolsAndMarks: "反复使用断冠、白蜡烛和盘绕河纹作为权力、信仰与道路的项目级象征。",
  lineDetailAndComposition: "轮廓清楚、局部细密、背景适度留白，构图重视叙事关系而不是现代时尚摄影姿态。",
  forbiddenElements: ["现代塑料与合成纤维", "电气照明与现代枪械", "霓虹赛博装饰", "无来源的现代文字标牌"],
}

const prepareReview = () => ({ action: "prepare_review", root: "阿尔瑟兰", visualStyle })

const initialization = (overrides: Record<string, unknown> = {}) => ({
  action: "initialize",
  root: "阿尔瑟兰",
  worldName: "阿尔瑟兰",
  route: "original",
  topicProfileKey: "classic-medieval-fantasy",
  worldStyleProfile: {
    schemaVersion: 1,
    narrativeDistance: "historical",
    register: "literary",
    knowledgePosition: "retrospective",
    languageConventions: ["使用清楚的中古世界内部称呼"],
    forbiddenPatterns: ["现代项目管理语言"],
    sourceIds: ["user-goal"],
  },
  sources: [{ id: "user-goal", kind: "user", locator: "当前用户目标", authority: "用户明确要求", summary: "经典奥法中土中世纪" }],
  direction: {
    worldPremise: "旧帝国崩溃后诸王国争夺遗产",
    creativeDirection: "完整、经典且可继续扩展的中世纪奇幻世界",
    tone: "经典、庄重、可理解的中古剑与魔法",
    themes: ["旧帝国遗产", "新旧秩序交替"],
    constraints: ["不使用抽象猎奇规则"],
    unresolvedQuestions: ["远海之外尚未设定"],
  },
  ...overrides,
})

function layerBatch(layerIndex: number) {
  const layer = WORLD_BLUEPRINT_LAYERS[layerIndex]!
  const minimum = WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]!
  const groups = [0, 1].map((index) => ({
    key: `layer-${layerIndex}-group-${index}`,
    title: `${layer}分域${index + 1}`,
    kind: "group" as const,
    rationale: `用于组织${layer}中的第${index + 1}组明确世界内容`,
  }))
  const entries = Array.from({ length: minimum }, (_, index) => ({
    key: `layer-${layerIndex}-entry-${index}`,
    title: `${layer}具体设定${index + 1}`,
    kind: "entry" as const,
    parentKey: groups[index % groups.length]!.key,
    genreKey: publicationGenreKeys(layer)[0]!,
    rationale: `这是${layer}中需要后续独立填充的具体设定${index + 1}`,
  }))
  const causes = layerIndex === 0 ? [] : [0, 1, 2].map((index) => ({
    fromKey: `layer-${layerIndex - 1}-${index < 2 ? `group-${index}` : "entry-0"}`,
    toKey: `layer-${layerIndex}-${index < 2 ? `group-${index}` : "entry-0"}`,
    reason: `上一层的既定条件具体促成当前层第${index + 1}项结果`,
  }))
  return { action: "append", root: "阿尔瑟兰", layer, batchId: `layer-${layerIndex}-complete`, objects: [...groups, ...entries], causes }
}

async function completeBlueprint(setupResult: Awaited<ReturnType<typeof setup>>) {
  expect((await setupResult.tool.execute(initialization(), routeContext(setupResult.project.id))).ok).toBe(true)
  for (const layerIndex of WORLD_BLUEPRINT_LAYERS.keys()) {
    const result = await setupResult.tool.execute(layerBatch(layerIndex), context(setupResult.project.id))
    expect(result.ok).toBe(true)
  }
}

async function internalText(value: Awaited<ReturnType<typeof setup>>, relativePath: string) {
  const record = await value.files.internal.readFile(value.project.id, GROWTH_INTERNAL_NAMESPACE, blueprintInternalKey("goal-1", relativePath))
  if (!record) throw new Error(`missing internal blueprint fixture: ${relativePath}`)
  return new TextDecoder().decode(record.bytes)
}

async function writeInternalText(value: Awaited<ReturnType<typeof setup>>, relativePath: string, content: string) {
  const key = blueprintInternalKey("goal-1", relativePath)
  const record = await value.files.internal.readFile(value.project.id, GROWTH_INTERNAL_NAMESPACE, key)
  await value.files.internal.writeFile({ projectId: value.project.id, namespace: GROWTH_INTERNAL_NAMESPACE, key, content, expectedModifiedAt: record?.modifiedAt ?? null })
}

describe("world blueprint tool", () => {
  test("initializes UTF-8 blueprint files and registers only the world root workbench", async () => {
    const value = await setup()
    expect(value.tool).toMatchObject({ name: "write_world_blueprint", scope: "project", approval: "required", inputSchema: { type: "object" } })
    const result = await value.tool.execute(initialization(), routeContext(value.project.id))

    expect(result).toMatchObject({ ok: true, value: { action: "initialize", status: "draft", workbenchCount: 1, topicProfileKey: "classic-medieval-fantasy" } })
    expect(await value.tool.execute({ action: "inspect", root: "阿尔瑟兰" }, context(value.project.id))).toMatchObject({
      ok: true,
      value: { action: "inspect", root: "阿尔瑟兰", status: "draft", causalRelationCount: 0 },
    })
    expect(result.ok && result.value).toHaveProperty("genreCandidates.历史、时代与重大事件")
    expect(JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/state.json"))).toMatchObject({ schemaVersion: 3, worldName: "阿尔瑟兰", route: "original", topicProfileKey: "classic-medieval-fantasy", topicProfileVersion: 1, status: "draft" })
    expect((await value.files.queries.refreshProject(value.project.id)).files.map((file) => file.relativePath)).toEqual(["阿尔瑟兰/世界基准.md", "阿尔瑟兰/资料索引.md"])
    expect(await readFile(join(value.root, "阿尔瑟兰", "世界基准.md"), "utf8")).toContain("经典、庄重、可理解")
    const snapshot = await value.workbenches.queries.snapshot(value.project.id)
    expect(snapshot.workbenches.filter((workbench) => workbench.source === "registered")).toEqual([
      expect.objectContaining({ folder: "阿尔瑟兰", title: "阿尔瑟兰" }),
    ])
    expect(snapshot.workbenches.some((workbench) => WORLD_BLUEPRINT_LAYERS.some((layer) => workbench.folder === `阿尔瑟兰/${layer}`))).toBe(false)
  })

  test("publishes layer-bound genre schemas from the twelve-layer genre library", async () => {
    const value = await setup()
    const branches = (value.tool.inputSchema as {
      oneOf: Array<{ properties?: { action?: { const?: string }; layer?: { const?: string }; objects?: { items?: { oneOf?: Array<{ properties?: { kind?: { const?: string }; genreKey?: { enum?: string[] } } }> } } } }>
    }).oneOf

    for (const layer of WORLD_BLUEPRINT_LAYERS) {
      for (const action of ["append", "amend"]) {
        const branch = branches.find((candidate) => candidate.properties?.action?.const === action && candidate.properties?.layer?.const === layer)
        const objectBranches = branch?.properties?.objects?.items?.oneOf ?? []
        const group = objectBranches.find((candidate) => candidate.properties?.kind?.const === "group")
        const entry = objectBranches.find((candidate) => candidate.properties?.kind?.const === "entry")
        expect(group?.properties?.genreKey).toBeUndefined()
        expect(entry?.properties?.genreKey?.enum).toEqual(publicationGenreKeys(layer))
      }
    }
  })

  test("replays exact initialization and rejects changed metadata without overwriting it", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute(initialization(), routeContext(value.project.id))).toMatchObject({ ok: true, value: { replayed: true } })
    const conflict = await value.tool.execute(initialization({ direction: { ...initialization().direction, tone: "冲突基调" } }), routeContext(value.project.id))
    expect(conflict).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    expect(await readFile(join(value.root, "阿尔瑟兰", "世界基准.md"), "utf8")).not.toContain("冲突基调")
  })

  test("requires trusted Growth identity", async () => {
    const value = await setup()
    const result = await value.tool.execute(initialization(), { sessionId: "session-1", projectId: value.project.id })
    expect(result).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
  })

  test("enforces trusted stage actions before project or workbench side effects", async () => {
    const value = await setup()
    const append = layerBatch(0)

    expect(await value.tool.execute(append, routeContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("not allowed") } })
    expect((await value.files.queries.refreshProject(value.project.id)).files).toEqual([])
    expect((await value.workbenches.queries.snapshot(value.project.id)).workbenches.filter((workbench) => workbench.source === "registered")).toEqual([])

    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute(initialization(), context(value.project.id, "twelve-layer-skeleton"))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(await value.tool.execute({ action: "inspect", root: "阿尔瑟兰" }, context(value.project.id, "twelve-layer-skeleton"))).toMatchObject({ ok: true, value: { layerObjectCounts: Object.fromEntries(WORLD_BLUEPRINT_LAYERS.map((layer) => [layer, 0])) } })
    expect(await value.tool.execute(append, context(value.project.id, "twelve-layer-skeleton"))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("not allowed") } })
    expect((await value.tool.execute(append, context(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute({ action: "inspect", root: "阿尔瑟兰" }, context(value.project.id, "twelve-layer-skeleton"))).toMatchObject({ ok: false, error: { code: "blueprint_conflict", detail: expect.stringContaining("object counts") } })
    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(await value.tool.execute({ ...layerBatch(1), batchId: "confirm-append" }, confirmContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })

    for (const growthStageKey of ["free-materialization", "bounded-stage-1", "unknown-stage"]) {
      expect(await value.tool.execute({ ...layerBatch(1), batchId: `blocked-${growthStageKey}` }, context(value.project.id, growthStageKey))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    }
    expect(await value.tool.execute({ ...layerBatch(1), batchId: "blocked-missing" }, { sessionId: "session-1", projectId: value.project.id, growthGoalId: "goal-1", growthGoalVersion: 1 })).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[1]!}/蓝图.json`)).objects).toEqual([])
  })

  test("rejects another Goal and a stale Goal version", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute(layerBatch(0), { ...context(value.project.id), growthGoalId: "goal-2" })).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    expect(await value.tool.execute(layerBatch(0), { ...context(value.project.id), growthGoalVersion: 0 })).toMatchObject({ ok: false, error: { code: "blueprint_conflict", detail: expect.stringContaining("stale") } })
  })

  test.each([1, 2])("rejects retained V%s state before creating files or workbenches", async (schemaVersion) => {
    const value = await setup()
    await value.files.commands.writeFile({ projectId: value.project.id, relativePath: "阿尔瑟兰/世界蓝图/state.json", content: `${JSON.stringify({ schemaVersion, root: "阿尔瑟兰" })}\n` })
    expect(await value.tool.execute(initialization(), routeContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict", detail: expect.stringContaining("cannot be resumed as V3") } })
    expect((await value.workbenches.queries.snapshot(value.project.id)).workbenches.filter((workbench) => workbench.source === "registered")).toHaveLength(0)
    expect(await value.files.queries.listDirectory(value.project.id, "阿尔瑟兰", "internal")).toMatchObject({ entries: [{ relativePath: "阿尔瑟兰/世界蓝图", kind: "directory" }] })
  })

  test("requires traceable evidence for canon and fanwork routes", async () => {
    const canon = await setup()
    expect(await canon.tool.execute(initialization({ route: "canon" }), routeContext(canon.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    const fanwork = await setup()
    expect(await fanwork.tool.execute(initialization({ route: "fanwork", sources: [{ id: "canon", kind: "canon", locator: "原著第一卷", authority: "原著", summary: "原著世界事实" }] }), routeContext(fanwork.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
  })

  test("appends stable IDs, readable paths, ordering, parents, and causal edges", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    const result = await value.tool.execute(layerBatch(1), context(value.project.id))
    expect(result).toMatchObject({ ok: true, value: { objectCount: WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[1] + 2, causalRelationCount: 3 } })
    const layer = JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[1]}/蓝图.json`))
    expect(layer.objects[0]).toMatchObject({ id: expect.stringMatching(/^wbo_[0-9a-f]{20}$/), order: 1, parentId: null, kind: "group" })
    expect(layer.objects[2]).toMatchObject({ order: 3, parentId: layer.objects[0].id, plannedPath: expect.stringContaining("具体设定1.md") })
    expect(layer.objects[2].locator).toStartWith(`${WORLD_BLUEPRINT_LAYERS[1]}｜`)
  })

  test("requires and persists only a topic-bound genreKey for entries", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    const batch = layerBatch(1)
    const objects = batch.objects.map((object, index) => index === 2 ? { ...object, genreKey: "physical-atlas" } : object)
    expect((await value.tool.execute({ ...batch, objects }, context(value.project.id))).ok).toBe(true)
    const layer = JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[1]!}/蓝图.json`))
    expect(layer.objects[2]).toMatchObject({ genreKey: "physical-atlas" })

    const missing = await setup()
    expect((await missing.tool.execute(initialization(), routeContext(missing.project.id))).ok).toBe(true)
    const missingBatch = layerBatch(0)
    const withoutGenre = missingBatch.objects.map((object, index) => index === 2 ? Object.fromEntries(Object.entries(object).filter(([key]) => key !== "genreKey")) : object)
    expect(await missing.tool.execute({ ...missingBatch, objects: withoutGenre }, context(missing.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("genreKey") } })

    const invalid = await setup()
    expect((await invalid.tool.execute(initialization(), routeContext(invalid.project.id))).ok).toBe(true)
    const wrongLayer = layerBatch(0)
    const wrongObjects = wrongLayer.objects.map((object, index) => index === 2 ? { ...object, genreKey: "city-portrait" } : object)
    expect(await invalid.tool.execute({ ...wrongLayer, objects: wrongObjects }, context(invalid.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("genreKey") } })

    const groupGenre = await setup()
    expect((await groupGenre.tool.execute(initialization(), routeContext(groupGenre.project.id))).ok).toBe(true)
    const groupBatch = layerBatch(0)
    const groupObjects = groupBatch.objects.map((object, index) => index === 0 ? { ...object, genreKey: "rulebook" } : object)
    expect(await groupGenre.tool.execute({ ...groupBatch, objects: groupObjects }, context(groupGenre.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("only valid for entry") } })

    const story = await setup()
    expect((await story.tool.execute(initialization(), routeContext(story.project.id))).ok).toBe(true)
    const storyBatch = { ...layerBatch(10), causes: [] }
    const historicalGenre = storyBatch.objects.map((object, index) => index === 2 ? { ...object, genreKey: "legendary-chronicle" } : object)
    expect(await story.tool.execute({ ...storyBatch, objects: historicalGenre }, context(story.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("genreKey") } })
    const storyGenre = storyBatch.objects.map((object, index) => index === 2 ? { ...object, genreKey: "legend-retelling" } : object)
    expect((await story.tool.execute({ ...storyBatch, objects: storyGenre }, context(story.project.id))).ok).toBe(true)
  }, 15_000)

  test("accepts an object-only append when causes are omitted", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const result = await value.tool.execute({
      action: "append",
      root: "阿尔瑟兰",
      layer: WORLD_BLUEPRINT_LAYERS[0]!,
      batchId: "object-only",
      objects: layerBatch(0).objects,
    }, context(value.project.id))

    expect(result).toMatchObject({ ok: true, value: { objectCount: WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[0] + 2, causalRelationCount: 0 } })
  })

  test("supports a same-layer hierarchy deeper than group to entry", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const batch = layerBatch(0)
    const objects = batch.objects.map((object, index) => index === 3 ? { ...object, parentKey: batch.objects[2]!.key } : object)
    const result = await value.tool.execute({ ...batch, objects }, context(value.project.id))

    expect(result.ok).toBe(true)
    const layer = JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]!}/蓝图.json`))
    expect(layer.objects[3].parentId).toBe(layer.objects[2].id)
  })

  test("replays an exact batch and rejects a reused batchId with different content", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute(layerBatch(0), context(value.project.id))).toMatchObject({ ok: true, value: { replayed: true } })
    const changed = { ...layerBatch(0), objects: layerBatch(0).objects.map((object, index) => index === 0 ? { ...object, title: "冲突标题" } : object) }
    expect(await value.tool.execute(changed, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
  })

  test("keeps semantically identical existing objects and appends only the missing part of a new batch", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const complete = layerBatch(0)
    const seed = { ...complete, batchId: "layer-0-seed", objects: complete.objects.slice(0, 3), causes: [] }
    expect(await value.tool.execute(seed, context(value.project.id))).toMatchObject({ ok: true, value: { objectCount: 3 } })

    expect(await value.tool.execute(complete, context(value.project.id))).toMatchObject({
      ok: true,
      value: { objectCount: complete.objects.length, replayed: false },
    })
    const layer = JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]!}/蓝图.json`))
    expect(layer.objects).toHaveLength(complete.objects.length)
    expect(layer.objects.map((object: { order: number }) => object.order)).toEqual(Array.from({ length: complete.objects.length }, (_, index) => index + 1))

    const conflicting = { ...complete, batchId: "layer-0-conflicting-resume", objects: complete.objects.map((object, index) => index === 0 ? { ...object, title: "同 key 的不同分组" } : object) }
    expect(await value.tool.execute(conflicting, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict", detail: expect.stringContaining("semantic content") } })
  })

  test("recovers when materialized files exist but the batch state commit was interrupted", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    const statePath = "阿尔瑟兰/世界蓝图/state.json"
    const state = JSON.parse(await internalText(value, statePath))
    const batch = layerBatch(0)
    await writeInternalText(value, statePath, `${JSON.stringify({ ...state, batches: [], pendingBatch: { ...state.batches[0], payload: { objects: batch.objects, causes: batch.causes } } }, undefined, 2)}\n`)

    expect(await value.tool.execute(layerBatch(0), context(value.project.id))).toMatchObject({ ok: true, value: { replayed: true } })
    expect(JSON.parse(await internalText(value, statePath)).batches).toHaveLength(1)
    expect(JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]}/蓝图.json`)).objects).toHaveLength(WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[0] + 2)
  })

  test("rejects unknown parents without changing a layer", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const path = `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]}/蓝图.json`
    const before = await internalText(value, path)
    const invalid = { ...layerBatch(0), objects: [{ key: "orphan", title: "孤立条目", kind: "entry", parentKey: "missing", rationale: "这个条目没有真实存在的同层分组" }] }
    expect(await value.tool.execute(invalid, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(await internalText(value, path)).toBe(before)
  })

  test("rejects unknown, self-referential, and duplicate causal edges before writes", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const base = layerBatch(0)
    const unknown = { ...base, causes: [{ fromKey: base.objects[0]!.key, toKey: "missing", reason: "引用的结果对象并不存在于世界蓝图" }] }
    expect(await value.tool.execute(unknown, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    const self = { ...base, causes: [{ fromKey: base.objects[0]!.key, toKey: base.objects[0]!.key, reason: "对象不能成为它自身的直接原因关系" }] }
    expect(await value.tool.execute(self, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    const edge = { fromKey: base.objects[0]!.key, toKey: base.objects[1]!.key, reason: "第一个分域的条件促成第二个分域的结果" }
    expect(await value.tool.execute({ ...base, causes: [edge, edge] }, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]}/蓝图.json`)).objects).toHaveLength(0)
  })

  test("rejects cyclic same-layer hierarchy without changing a layer", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const batch = layerBatch(0)
    const objects = batch.objects.map((object, index) => {
      if (index === 0) return { ...object, parentKey: batch.objects[2]!.key }
      if (index === 2) return { ...object, parentKey: batch.objects[0]!.key }
      return object
    })
    const result = await value.tool.execute({ ...batch, objects }, context(value.project.id))

    expect(result).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(JSON.parse(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]!}/蓝图.json`)).objects).toHaveLength(0)
  })

  test("fails closed when finalization coverage is incomplete", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    const result = await value.tool.execute(prepareReview(), context(value.project.id))
    expect(result).toMatchObject({ ok: false, error: { code: "blueprint_invalid" } })
    expect(JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/state.json")).status).toBe("draft")
  })

  test("requires a complete, path-verified source map before a reconcile blueprint enters review", async () => {
    const value = await setup()
    await value.files.commands.writeFile({ projectId: value.project.id, relativePath: "旧资料/王国残稿.md", content: "洛恩王国控制中央平原。" })
    const reconcileRouteContext = { ...routeContext(value.project.id), growthWorldEntryMode: "reconcile" as const, growthWorldEntryStage: "blueprint-create" as const }
    const reconcileContext = { ...context(value.project.id), growthWorldEntryMode: "reconcile" as const, growthWorldEntryStage: "blueprint-create" as const }
    expect((await value.tool.execute(initialization(), reconcileRouteContext)).ok).toBe(true)
    for (const layerIndex of WORLD_BLUEPRINT_LAYERS.keys()) expect((await value.tool.execute(layerBatch(layerIndex), reconcileContext)).ok).toBe(true)

    expect(await value.tool.execute(prepareReview(), reconcileContext)).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("unmapped") } })
    expect(await value.tool.execute({ action: "map_sources", root: "阿尔瑟兰", batchId: "bad-path", mappings: [{ objectKey: "layer-0-entry-0", coverage: "existing", sourcePaths: ["不存在.md"], note: "已有资料应当实际存在，不能只凭模型声称" }] }, reconcileContext)).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("does not exist") } })

    const entryKeys = WORLD_BLUEPRINT_LAYERS.flatMap((_, layerIndex) => Array.from({ length: WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS[layerIndex]! }, (__, entryIndex) => `layer-${layerIndex}-entry-${entryIndex}`))
    for (let offset = 0; offset < entryKeys.length; offset += 40) {
      const mappings = entryKeys.slice(offset, offset + 40).map((objectKey, index) => objectKey === "layer-0-entry-0"
        ? { objectKey, coverage: "existing", sourcePaths: ["旧资料/王国残稿.md"], note: "旧资料已经直接覆盖这个蓝图对象的核心定位" }
        : { objectKey, coverage: "missing", sourcePaths: [], note: `现有项目没有覆盖该对象，后续仅在新作品根补写 ${offset + index}` })
      expect(await value.tool.execute({ action: "map_sources", root: "阿尔瑟兰", batchId: `mapping-${offset}`, mappings }, reconcileContext)).toMatchObject({ ok: true, value: { replayed: false } })
    }
    expect(await value.tool.execute({ action: "inspect", root: "阿尔瑟兰" }, reconcileContext)).toMatchObject({ ok: true, value: { reconciliation: { unmappedCount: 0, coverage: { existing: 1 } } } })
    expect(await value.tool.execute(prepareReview(), reconcileContext)).toMatchObject({ ok: true, value: { status: "review" } })
  })

  test("rejects source mapping outside a trusted reconcile entry", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute(layerBatch(0), context(value.project.id))).ok).toBe(true)
    expect(await value.tool.execute({ action: "map_sources", root: "阿尔瑟兰", batchId: "wrong-mode", mappings: [{ objectKey: "layer-0-entry-0", coverage: "missing", sourcePaths: [], note: "普通原创入口不能伪造整理来源映射" }] }, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("trusted reconcile") } })
  })

  test("reviews then freezes a complete twelve-layer blueprint with cross-layer causality and one world workbench", async () => {
    const value = await setup()
    await completeBlueprint(value)
    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    expect(await value.tool.execute({ action: "prepare_review", root: "阿尔瑟兰" }, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("visualStyle") } })
    expect(await value.tool.execute(prepareReview(), context(value.project.id))).toMatchObject({ ok: true, value: { status: "review", visualStylePath: "阿尔瑟兰/视觉设定/统一画风.md" } })
    expect(await readFile(join(value.root, "阿尔瑟兰", "视觉设定", "统一画风.md"), "utf8")).toContain("## 美术流派与媒介质感")
    const styleBeforeRetry = await readFile(join(value.root, "阿尔瑟兰", "视觉设定", "统一画风.md"), "utf8")
    expect(await value.tool.execute(prepareReview(), confirmContext(value.project.id))).toMatchObject({ ok: true, value: { replayed: true } })
    expect(await readFile(join(value.root, "阿尔瑟兰", "视觉设定", "统一画风.md"), "utf8")).toBe(styleBeforeRetry)
    const runtimeArtifacts = await value.service.progressEvidence(value.project.id, "goal-1", "阿尔瑟兰")
    expect(runtimeArtifacts).toHaveLength(15)
    expect(runtimeArtifacts.every((artifact) => artifact.text && artifact.relativePath.startsWith("阿尔瑟兰/"))).toBe(true)
    expect(validateReviewWorldBlueprintArtifacts(runtimeArtifacts)).toBeUndefined()
    const reviewArtifacts = await Promise.all([
      "世界蓝图/state.json",
      "世界蓝图/index.json",
      "世界蓝图/relations.json",
      ...WORLD_BLUEPRINT_LAYERS.map((layer) => `${layer}/蓝图.json`),
    ].map(async (relativePath) => ({ relativePath: `阿尔瑟兰/${relativePath}`, text: await internalText(value, `阿尔瑟兰/${relativePath}`) })))
    expect(validateReviewWorldBlueprintArtifacts(reviewArtifacts)).toBeUndefined()
    const mismatchedArtifacts = reviewArtifacts.map((artifact) => artifact.relativePath.endsWith("/index.json")
      ? { ...artifact, text: `${JSON.stringify({ ...JSON.parse(artifact.text), status: "frozen" }, undefined, 2)}\n` }
      : artifact)
    expect(validateReviewWorldBlueprintArtifacts(mismatchedArtifacts)).toContain("index.json")
    const result = await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))

    expect(result).toMatchObject({ ok: true, value: { status: "frozen", objectCount: 120, causalRelationCount: 33, replayed: false } })
    const index = JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/index.json"))
    expect(index).toMatchObject({ status: "frozen", causalRelationCount: 33, crossLayerCausalRelationCount: 33 })
    expect(index.layers).toHaveLength(12)
    expect((await value.workbenches.queries.snapshot(value.project.id)).workbenches.filter((workbench) => workbench.source === "registered")).toHaveLength(1)
    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).toMatchObject({ ok: true, value: { replayed: true } })
  })

  test("rejects append after freeze", async () => {
    const value = await setup()
    await completeBlueprint(value)
    expect((await value.tool.execute(prepareReview(), context(value.project.id))).ok).toBe(true)
    expect((await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).ok).toBe(true)
    const result = await value.tool.execute({ ...layerBatch(0), batchId: "after-freeze" }, context(value.project.id))
    expect(result).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    const stylePath = join(value.root, "阿尔瑟兰", "视觉设定", "统一画风.md")
    await rm(stylePath)
    expect(await value.tool.execute(prepareReview(), confirmContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    await expect(readFile(stylePath, "utf8")).rejects.toThrow()
  })

  test("refuses to freeze when the reviewed visual style file disappears", async () => {
    const value = await setup()
    await completeBlueprint(value)
    expect((await value.tool.execute(prepareReview(), context(value.project.id))).ok).toBe(true)
    await rm(join(value.root, "阿尔瑟兰", "视觉设定", "统一画风.md"))

    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).toMatchObject({
      ok: false,
      error: { code: "blueprint_invalid", detail: expect.stringContaining("required visual style file is missing") },
    })
  })

  test("amends a reviewed layer and requires review again before freeze", async () => {
    const value = await setup()
    await completeBlueprint(value)
    expect((await value.tool.execute(prepareReview(), context(value.project.id))).ok).toBe(true)
    const batch = layerBatch(0)
    const layers = await Promise.all(WORLD_BLUEPRINT_LAYERS.map(async (layer) => JSON.parse(await internalText(value, `阿尔瑟兰/${layer}/蓝图.json`))))
    const keys = new Map(layers.flatMap((layer) => layer.objects.map((object: { id: string; key: string }) => [object.id, object.key] as const)))
    const relations = JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/relations.json"))
    const amended = {
      ...batch,
      action: "amend",
      batchId: "amend-layer-0",
      topicProfileKey: "hard-science-fiction",
      worldStyleProfile: {
        schemaVersion: 1,
        narrativeDistance: "observational",
        register: "documentary",
        knowledgePosition: "contemporary",
        languageConventions: ["使用清晰克制的调查记录语言"],
        forbiddenPatterns: ["中古编年史腔调"],
        sourceIds: ["style-revision-1"],
      },
      objects: batch.objects.map((object, index) => index === 2 ? { ...object, title: "修订后的核心法则" } : object),
      causes: relations.relations.map((relation: { from: string; to: string; reason: string }) => ({ fromKey: keys.get(relation.from), toKey: keys.get(relation.to), reason: relation.reason })),
    }
    expect(await value.tool.execute(amended, confirmContext(value.project.id))).toMatchObject({ ok: true, value: { action: "amend", status: "draft", revision: 2 } })
    expect(JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/state.json"))).toMatchObject({
      topicProfileKey: "hard-science-fiction",
      topicProfileVersion: 1,
      worldStyleProfile: { register: "documentary", sourceIds: ["style-revision-1"] },
    })
    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
    expect(await internalText(value, `阿尔瑟兰/${WORLD_BLUEPRINT_LAYERS[0]}/蓝图.json`)).toContain("修订后的核心法则")
    expect(await value.tool.execute(prepareReview(), context(value.project.id))).toMatchObject({ ok: true, value: { status: "review", revision: 2 } })
    expect(await value.tool.execute({ action: "freeze", root: "阿尔瑟兰" }, confirmContext(value.project.id))).toMatchObject({ ok: true, value: { status: "frozen", revision: 2 } })
    expect(await value.tool.execute({ ...amended, batchId: "amend-after-freeze" }, confirmContext(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_conflict" } })
  }, 15_000)

  test("stops between review writes after cancellation and recovers by exact retry", async () => {
    const value = await setup()
    await completeBlueprint(value)
    const controller = new AbortController()
    const internal = {
      ...value.files.internal,
      writeFile: async (request: Parameters<typeof value.files.internal.writeFile>[0]) => {
        const result = await value.files.internal.writeFile(request)
        if (request.key.endsWith("/world/blueprint/index.json")) controller.abort("用户暂停")
        return result
      },
    }
    const service = new WorldBlueprintService(value.files.queries, value.files.commands, internal, value.workbenches.commands, value.workbenches.queries)

    expect(await service.tool().execute(prepareReview(), { ...context(value.project.id), signal: controller.signal })).toMatchObject({
      ok: false,
      error: { code: "blueprint_conflict", detail: expect.stringContaining("cancelled") },
    })
    expect(JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/state.json")).status).toBe("draft")
    expect(JSON.parse(await internalText(value, "阿尔瑟兰/世界蓝图/index.json")).status).toBe("review")
    expect(await value.tool.execute(prepareReview(), context(value.project.id))).toMatchObject({ ok: true, value: { status: "review" } })
  })

  test("rejects case-insensitive Windows path collisions and cancelled writes", async () => {
    const value = await setup()
    expect((await value.tool.execute(initialization(), routeContext(value.project.id))).ok).toBe(true)
    const batch = layerBatch(0)
    const collision = { ...batch, objects: batch.objects.map((object, index) => index === 2 ? { ...object, title: "Port" } : index === 3 ? { ...object, title: "port" } : object) }
    expect(await value.tool.execute(collision, context(value.project.id))).toMatchObject({ ok: false, error: { code: "blueprint_invalid", detail: expect.stringContaining("Windows") } })
    const controller = new AbortController()
    controller.abort("用户暂停")
    expect(await value.tool.execute(layerBatch(1), { ...context(value.project.id), signal: controller.signal })).toMatchObject({ ok: false, error: { code: "blueprint_conflict", detail: expect.stringContaining("cancelled") } })
  })
})
