import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import type { ProjectFileQueryPort } from "@creatx/project-files"
import type { GrowthGoalProjection, GrowthIssueProjection } from "@creatx/contracts"
import {
  WorldMaterializationCoordinator,
  WorldMaterializationService,
  blueprintIndexKey,
  blueprintLayerKey,
  blueprintReconciliationKey,
  blueprintRelationsKey,
  blueprintStateKey,
  GROWTH_INTERNAL_NAMESPACE,
  materializationBriefKey,
  materializationExtractionKey,
  materializationReceiptKey,
  materializationRelationsKey,
  materializationStateKey,
  planMaterializationIssueReconciliation,
  PUBLICATION_GENRE_LIBRARY,
  WORLD_BLUEPRINT_LAYERS,
  hashWritingContract,
  publicationGenre,
  projectMaterializationTerminal,
  type WorldBlueprintIndexDocument,
  type WorldBlueprintLayerDocument,
  type WorldBlueprintObject,
  type WorldMaterializationImageEvidence,
  type WorldMaterializationGoalImageEvidence,
  type WorldMaterializationIssuePort,
  type WorldMaterializationRecoveryImageEvidence,
  type WorldMaterializationReceipt,
} from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("materialization issue reconciliation", () => {
  const issue = (status: GrowthIssueProjection["status"], issueId: string, objectId: string): GrowthIssueProjection => ({
    issueId,
    goalId: "goal-1",
    workItemId: objectId,
    errorCode: "materialization_worker_failure",
    impact: status === "waiting_user" ? "blocking" : "repairable",
    status,
    summary: "物化未形成可信完成证据。",
    affectedObjectIds: [objectId],
    attemptCount: 1,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    version: 2,
  })

  test("resolves every stale issue for an object after a newer trusted receipt exists", () => {
    const transitions = planMaterializationIssueReconciliation({
      issues: [issue("repairing", "writing-issue", "object-1"), issue("resolved", "recovery-issue", "object-1")],
      outcomes: [{ status: "accepted-existing", objectId: "object-1", title: "北境", path: "世界/北境.md", attemptId: "recovery-2" }],
      terminalizing: false,
    })

    expect(transitions).toEqual([{ issueId: "writing-issue", expectedVersion: 2, status: "resolved", summary: "对象已经形成可信物化回执，相关自动修复问题已解决。" }])
  })

  test("bypasses stale repair issues only after the object has a bypassed terminal outcome", () => {
    expect(planMaterializationIssueReconciliation({
      issues: [issue("repairing", "writing-issue", "object-1")],
      outcomes: [{ status: "bypassed-missing", objectId: "object-1", title: "北境", path: "世界/北境.md" }],
      terminalizing: false,
    })[0]).toMatchObject({ issueId: "writing-issue", status: "bypassed" })
  })

  test("keeps waiting-user issues open and marks other unresolved terminal issues as needs-help", () => {
    const transitions = planMaterializationIssueReconciliation({
      issues: [issue("waiting_user", "blocking-issue", "object-1"), issue("repairing", "local-issue", "object-2")],
      outcomes: [
        { status: "needs-help", objectId: "object-1", title: "北境", path: "世界/北境.md" },
        { status: "needs-help", objectId: "object-2", title: "南境", path: "世界/南境.md" },
      ],
      terminalizing: true,
    })

    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ issueId: "local-issue", status: "needs_help", impact: "local" })
  })
})

async function setup(route: "original" | "canon" | "fanwork" = "original") {
  const root = await mkdtemp(join(tmpdir(), "CreatX 正文物化 "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const images = new Map<string, WorldMaterializationImageEvidence>()
  const recoveryImages = new Map<string, WorldMaterializationRecoveryImageEvidence>()
  const goalImages: WorldMaterializationGoalImageEvidence[] = []
  const terminalIssues: Array<Pick<GrowthIssueProjection, "status" | "affectedObjectIds">> = []
  const attemptIds = new Map<string, string>()
  const serviceWrites: string[] = []
  const progressEvents: string[] = []
  const attachmentBindings: Array<{ projectId: string; imageTaskId: string; documentPath: string; alt: string; placement: "after_heading"; anchor: string }> = []
  let goalIdentity = { projectId: project.id, version: 2, status: "active", workRootPath: "航海尽头" }
  const service = new WorldMaterializationService(
    files.queries,
    {
      writeFile: async (request) => {
        serviceWrites.push(request.key)
        return files.internal.writeFile(request)
      },
      readFile: files.internal.readFile,
      listDirectory: files.internal.listDirectory,
      moveContentFileToBackup: files.internal.moveContentFileToBackup,
    },
    async (_projectId, imageTaskId) => images.get(imageTaskId),
    () => goalIdentity,
    async (_projectId, idempotencyKey) => recoveryImages.get(idempotencyKey),
    (goalId) => { progressEvents.push(goalId) },
    async (binding) => { attachmentBindings.push(binding) },
    async () => goalImages,
    () => terminalIssues,
  )
  const dispatchBatch = service.dispatchBatch.bind(service)
  service.dispatchBatch = async (input) => {
    const batch = await dispatchBatch(input)
    batch.commands.forEach((command) => {
      if (command.workItemId && command.attemptId) attemptIds.set(command.workItemId, command.attemptId)
    })
    return batch
  }
  const workRoot = "航海尽头"
  await write(files, project.id, `${workRoot}/世界基准.md`, "# 世界基准\n\n大航海时代没有印度板块，欧洲航队在海平线上看见八千米高的大陆崖。")
  await write(files, project.id, `${workRoot}/资料索引.md`, `# 资料索引\n\n## project-boundary\n\n- 类型：project\n- 定位：.\n- 摘要：范围说明不是可读取文件，不得进入资料候选。\n\n## web-source\n\n- 类型：web\n- 定位：https://example.com/reference\n- 摘要：网络来源只允许通过索引摘要使用。\n\n## project-source\n\n- 类型：project\n- 定位：${workRoot}/来源.md\n- 摘要：用户原始要求。`)
  await write(files, project.id, `${workRoot}/来源.md`, "# 来源\n\n用户提供的既有项目资料。")
  await writeInternalJson(files, project.id, blueprintStateKey("goal-1"), {
    schemaVersion: 3,
    root: workRoot,
    worldName: workRoot,
    route,
    topicProfileKey: "modern-alternate-history",
    topicProfileVersion: 1,
    worldStyleProfile: {
      schemaVersion: 1,
      narrativeDistance: "historical",
      register: "documentary",
      knowledgePosition: "retrospective",
      languageConventions: ["使用航海时代可理解的内部称呼"],
      forbiddenPatterns: ["现代项目管理语言"],
      sourceIds: route === "original" ? ["user"] : route === "canon" ? ["canon"] : ["canon", "user"],
    },
    sources: route === "original"
      ? [{ id: "user", kind: "user", locator: "用户目标", authority: "用户", summary: "历史架空" }]
      : route === "canon"
        ? [{ id: "canon", kind: "canon", locator: "原著资料", authority: "原著", summary: "现成作品世界整理" }]
        : [
            { id: "canon", kind: "canon", locator: "原著资料", authority: "原著", summary: "二创继承的原著边界" },
            { id: "user", kind: "user", locator: "用户目标", authority: "用户", summary: "二创扩展方向" },
          ],
    direction: { worldPremise: "航海尽头出现大陆崖", creativeDirection: "历史架空世界", tone: "历史架空", themes: ["航海"], constraints: [], unresolvedQuestions: [] },
    ownerGoalId: "goal-1",
    acceptedGoalVersion: 2,
    revision: 1,
    status: "frozen",
    batches: [],
  })
  const entries = [
    entry("rule-ocean", "海洋边界", 0, 1),
    entry("rule-magic", "自然法则", 0, 2),
    entry("rule-navigation", "航海测量", 0, 3),
    entry("rule-distance", "距离与季风", 0, 4),
    entry("geo-cliff", "世界尽头大陆崖", 1, 1),
    entry("geo-port", "西岸观测港", 1, 2),
  ]
  const layerDocuments = WORLD_BLUEPRINT_LAYERS.map((layer, index) => ({
    schemaVersion: 3,
    layer,
    objects: [group(index), ...entries.filter((object) => object.layer === layer)],
  }) satisfies WorldBlueprintLayerDocument)
  for (const document of layerDocuments) {
    await writeInternalJson(files, project.id, blueprintLayerKey("goal-1", document.layer), {
      ...document,
    })
  }
  const relations = {
    schemaVersion: 3,
    relations: [{ from: entries[0]!.id, to: entries[2]!.id, type: "causes", reason: "海洋边界塑造大陆崖航路" }],
  } as const
  await writeInternalJson(files, project.id, blueprintRelationsKey("goal-1"), relations)
  await writeInternalJson(files, project.id, blueprintIndexKey("goal-1"), {
    schemaVersion: 3,
    root: workRoot,
    status: "frozen",
    layers: layerDocuments.map((document) => ({
      layer: document.layer,
      path: `${workRoot}/${document.layer}/蓝图.json`,
      objectCount: document.objects.length,
      plannedPathCount: document.objects.filter((object) => object.kind === "entry").length,
    })),
    causalRelationCount: relations.relations.length,
    crossLayerCausalRelationCount: 0,
  } satisfies WorldBlueprintIndexDocument)
  return {
    root,
    project,
    files,
    images,
    recoveryImages,
    goalImages,
    terminalIssues,
    attemptIds,
    serviceWrites,
    progressEvents,
    attachmentBindings,
    service,
    tool: service.tool(),
    workRoot,
    entries,
    setGoal: (next: typeof goalIdentity) => { goalIdentity = next },
  }
}

describe("world materialization", () => {
  test("classifies every object once from receipts, files, and terminal dispositions", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const state = await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    const [completed, accepted, unverified, bypassed, needsHelp] = state.objects
    const receipt = (object: typeof completed, phase: WorldMaterializationReceipt["phase"]): WorldMaterializationReceipt => ({
      schemaVersion: 4,
      goalId: goal.goalId,
      goalVersion: goal.version,
      objectId: object!.objectId,
      attemptId: `${phase}-${object!.objectId}`,
      phase,
      writingContractHash: object!.writingContractHash,
      bodySha256: "body",
      artifactPath: object!.plannedPath,
      sourcePaths: [],
      imageTaskId: `image-${object!.objectId}`,
      summary: "完成",
      extractionSha256: "extraction",
    })
    const terminal = projectMaterializationTerminal({
      state: {
        ...state,
        objects: state.objects.map((object) => [completed!.objectId, accepted!.objectId].includes(object.objectId) ? { ...object, status: "completed" as const } : object),
      },
      receipts: [receipt(completed, "writing"), receipt(accepted, "recovery")],
      existingPaths: new Set([completed!.plannedPath, accepted!.plannedPath, unverified!.plannedPath]),
      dispositions: new Map([[bypassed!.objectId, "bypassed" as const], [needsHelp!.objectId, "needs_help" as const]]),
    })

    expect(terminal.outcomes.slice(0, 5).map((outcome) => outcome.status)).toEqual([
      "completed",
      "accepted-existing",
      "unverified-file",
      "bypassed-missing",
      "needs-help",
    ])
    expect(new Set(terminal.outcomes.map((outcome) => outcome.objectId)).size).toBe(state.objects.length)
    expect(terminal.trustedCompleted).toBe(2)
    expect(terminal.untrusted).toBe(state.objects.length - 2)
    expect(terminal.isPartial).toBe(true)
  })

  test("exposes the V4 brief and post-write extraction contract to the model", async () => {
    const value = await setup()
    const schema = value.tool.inputSchema as {
      oneOf: Array<{ properties: Record<string, { required?: string[]; properties?: Record<string, unknown>; items?: { required?: string[]; properties?: Record<string, { enum?: string[] }> } }> }>
    }
    const research = schema.oneOf.find((variant) => "purpose" in variant.properties)!
    expect(research.properties).not.toHaveProperty("schemaVersion")
    expect(research.properties).not.toHaveProperty("objectId")
    expect(research.properties.lockedFacts!.items!.required).toEqual(["id", "text", "sourcePaths"])
    expect(research.properties.genreSuggestions!.required).toEqual(["primary", "alternatives", "techniques", "avoid"])
    expect(research.properties).not.toHaveProperty("claims")
    expect(research.properties).not.toHaveProperty("contentCards")
    expect(research.properties).not.toHaveProperty("criticalGaps")
    const completion = schema.oneOf.find((variant) => "extraction" in variant.properties)!
    expect(completion.properties).toHaveProperty("extraction")
    expect(completion.properties.extraction!.properties).not.toHaveProperty("bodySha256")
    expect(completion.properties.extraction!.properties).not.toHaveProperty("objectId")
    expect(completion.properties.extraction!.properties).not.toHaveProperty("schemaVersion")
    expect((value.tool.inputSchemaForWorkerProfile?.("world-research").properties as { action: { const: string } }).action.const).toBe("submit_research")
    expect((value.tool.inputSchemaForWorkerProfile?.("world-writer").properties as { action: { const: string } }).action.const).toBe("complete_object")
    expect((value.tool.inputSchemaForWorkerProfile?.("world-recovery").properties as { action: { const: string } }).action.const).toBe("complete_object")
  })

  test("binds materialization actions to the trusted persisted attempt phase", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const object = value.entries.find((entry) => entry.id === researchBatch.commands[0]!.workItemId)!
    expect(await value.tool.execute(completionAction(object, "untrusted-image", "错误阶段"), context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("trusted research attempt only accepts submit_research") },
    })
    expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    for (const command of researchBatch.commands.slice(1)) {
      const sibling = value.entries.find((entry) => entry.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(sibling, value.workRoot), context(value, sibling.id, goal))).ok).toBe(true)
    }
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, researchBatch.commands.map((command) => command.workItemId!), researchBatch.commands.map(() => ({ state: "completed" })))
    const writingBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const writing = value.entries.find((entry) => entry.id === writingBatch.commands[0]!.workItemId)!
    expect(await value.tool.execute(researchAction(writing, value.workRoot), context(value, writing.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("trusted writing attempt only accepts complete_object") },
    })
  })

  test("offers project files declared by the source index as exact research choices", async () => {
    const value = await setup()
    const batch = await value.service.dispatchBatch({ projectId: value.project.id, sessionId: "session-1", goalId: "goal-1", expectedVersion: 3, root: value.workRoot })
    expect(batch.commands[0]?.prompt).toContain(`- ${value.workRoot}/来源.md`)
    expect(batch.commands[0]?.prompt).not.toContain("- 当前项目根目录")
    expect(batch.commands[0]?.prompt).not.toContain("- https://example.com/reference")
    expect(batch.commands[0]?.prompt).toContain("不得填写 URL、资料 ID 或路径缩写")
    expect(batch.commands[0]?.prompt).toContain("资料不足、未知细节、普通语义缺口")
    expect(batch.commands[0]?.prompt).toContain("不得提交 claims、contentCards、consistencyGuard 或 criticalGaps")
  })

  test("requires a reconcile research Worker to adopt a source mapped to its object", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = value.entries[0]!
    await write(value.files, value.project.id, "旧资料/海洋边界.md", "# 海洋边界\n\n旧资料记录了沿岸居民反复辨认远白崖的航路经验。")
    await writeInternalJson(value.files, value.project.id, blueprintReconciliationKey(goal.goalId), {
      schemaVersion: 1,
      goalId: goal.goalId,
      root: value.workRoot,
      mappings: [{ objectId: object.id, objectKey: object.key, coverage: "existing", sourcePaths: ["旧资料/海洋边界.md"], note: "旧资料直接覆盖海洋边界的观察经验" }],
      batches: [{ batchId: "map-1", payloadHash: "fixture" }],
    })
    const batch = await value.service.dispatchBatch(commandInput(value, goal))
    expect(batch.commands.find((command) => command.workItemId === object.id)?.prompt).toContain("整理阶段已匹配到当前对象的原始资料")
    expect(batch.commands.find((command) => command.workItemId === object.id)?.prompt).toContain("旧资料/海洋边界.md")

    expect(await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).toMatchObject({ ok: false, error: { code: "growth_invalid", detail: expect.stringContaining("must adopt") } })
    const adopted = researchAction(object, value.workRoot)
    adopted.materialPaths = ["旧资料/海洋边界.md"]
    expect(await value.tool.execute(adopted, context(value, object.id, goal))).toMatchObject({ ok: true, value: { status: "ready" } })
    for (const command of batch.commands.filter((command) => command.workItemId !== object.id)) {
      const candidate = value.entries.find((entry) => entry.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(candidate, value.workRoot), context(value, candidate.id, goal))).ok).toBe(true)
    }
    const writing = await value.service.dispatchBatch(commandInput(value, goal))
    expect(writing.commands.some((command) => command.workItemId === object.id)).toBe(true)
    const body = formalBody(object.title)
    await write(value.files, value.project.id, object.plannedPath!, body)
    const imageTaskId = `image-${object.id}`
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    const completion = completionAction(object, imageTaskId, "旧资料已形成正式正文。", body)
    expect(await value.tool.execute(completion, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: false } })
    expect(value.attachmentBindings).toEqual([{ projectId: value.project.id, imageTaskId, documentPath: object.plannedPath, alt: object.title, placement: "after_heading", anchor: object.title }])
    const firstRelations = await readInternalJson<{
      nodes: Array<{ id: string; path?: string }>
      relations: Array<{ from: string; to: string }>
    }>(value.files, value.project.id, materializationRelationsKey(goal.goalId))
    expect(firstRelations.nodes).toContainEqual(expect.objectContaining({ id: expect.stringMatching(/^source:project:/), path: "旧资料/海洋边界.md" }))
    const nodeIds = new Set(firstRelations.nodes.map((node) => node.id))
    expect(firstRelations.relations.every((relation) => nodeIds.has(relation.from) && nodeIds.has(relation.to))).toBe(true)

    expect(await value.tool.execute(completion, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: true } })
    expect(value.attachmentBindings).toHaveLength(2)
    expect(await value.service.reconcileImageAttachments(value.project.id, goal.goalId, value.workRoot)).toEqual({ checked: 1, bound: 1, failed: [] })
    expect(value.attachmentBindings).toHaveLength(3)
    expect(await readInternalJson<typeof firstRelations>(value.files, value.project.id, materializationRelationsKey(goal.goalId))).toEqual(firstRelations)
  })

  test("assigns one bounded publication family to every layer", () => {
    expect(Object.keys(PUBLICATION_GENRE_LIBRARY)).toEqual([...WORLD_BLUEPRINT_LAYERS])
    expect(publicationGenre("历史、时代与重大事件", "narrative-history").label).toBe("叙事史")
    expect(publicationGenre("宇宙、自然与地理", "regional-gazetteer").label).toBe("区域地理志")
    expect(publicationGenre("生态、资源与物种", "natural-history").label).toBe("通俗自然史")
    expect(publicationGenre("历史、时代与重大事件", "legendary-chronicle").label).toBe("传奇编年史")
    expect(publicationGenre("历史、时代与重大事件", "era-history").label).toBe("时代史")
    expect(() => publicationGenre("历史、时代与重大事件", "city-portrait")).toThrow("is not allowed")
  })

  test("snapshots one immutable writing contract for every entry before dispatch", async () => {
    const value = await setup()
    const state = await value.service.prepare(value.project.id, "goal-1", value.workRoot)
    expect(state.schemaVersion).toBe(4)
    expect(state.objects).toHaveLength(value.entries.length)
    for (const object of state.objects) {
      expect(object.writingContract.object.id).toBe(object.objectId)
      expect(object.writingContract.genreKey).toBe(value.entries.find((entry) => entry.id === object.objectId)!.genreKey)
      expect(object.writingContractHash).toBe(hashWritingContract(object.writingContract))
    }
    const persisted = await readInternalJson<{ objects: Array<{ writingContract: { worldStyle: { languageConventions: string[] } } }> }>(value.files, value.project.id, materializationStateKey("goal-1"))
    expect(persisted.objects[0]!.writingContract.worldStyle.languageConventions).toEqual(["使用航海时代可理解的内部称呼"])
  })

  test("projects object progress even when the Goal version does not change", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    expect(await value.service.progress(value.project.id, goal.goalId)).toMatchObject({ phase: WORLD_BLUEPRINT_LAYERS[0], total: 6, completed: 0, active: 0, retryable: 0, blocked: 0, unknown: 0 })

    const batch = await value.service.dispatchBatch(commandInput(value, goal))
    expect(batch.commands).toHaveLength(3)
    expect(await value.service.progress(value.project.id, goal.goalId)).toMatchObject({ total: 6, completed: 0, active: 3, currentObjects: expect.arrayContaining([expect.objectContaining({ status: "active" })]) })
    expect(value.progressEvents).toEqual([goal.goalId, goal.goalId])

    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, batch.commands.map((command) => command.workItemId!), batch.commands.map(() => ({ state: "failed" as const, reason: "Provider interrupted" })))
    expect(await value.service.progress(value.project.id, goal.goalId)).toMatchObject({ active: 0, retryable: 3, errorCategory: "worker-failure", currentObjects: expect.arrayContaining([expect.objectContaining({ status: "retryable" })]) })
  })

  test("fails closed for retained V1 materialization before changing it", async () => {
    const value = await setup()
    const legacy = { schemaVersion: 1, root: value.workRoot, goalId: "goal-1", objects: [] }
    await writeInternalJson(value.files, value.project.id, materializationStateKey("goal-1"), legacy)
    await expect(value.service.prepare(value.project.id, "goal-1", value.workRoot)).rejects.toThrow("frozen blueprint no longer matches materialization state")
    expect(await readInternalJson<typeof legacy>(value.files, value.project.id, materializationStateKey("goal-1"))).toEqual(legacy)
  })

  test("rejects mixed Blueprint schemas before creating materialization state", async () => {
    for (const artifact of ["layer", "relations", "index"] as const) {
      const value = await setup()
      if (artifact === "layer") {
        await writeInternalJson(value.files, value.project.id, blueprintLayerKey("goal-1", WORLD_BLUEPRINT_LAYERS[0]!), {
          schemaVersion: 2,
          layer: WORLD_BLUEPRINT_LAYERS[0],
          objects: [group(0), ...value.entries.filter((object) => object.layer === WORLD_BLUEPRINT_LAYERS[0])],
        })
      }
      if (artifact === "relations") {
        await writeInternalJson(value.files, value.project.id, blueprintRelationsKey("goal-1"), { schemaVersion: 2, relations: [] })
      }
      if (artifact === "index") {
        const index = await readInternalJson<Record<string, unknown>>(value.files, value.project.id, blueprintIndexKey("goal-1"))
        await writeInternalJson(value.files, value.project.id, blueprintIndexKey("goal-1"), { ...index, schemaVersion: 2 })
      }
      await expect(value.service.prepare(value.project.id, "goal-1", value.workRoot)).rejects.toThrow("confirmed frozen V3 blueprint")
      expect(await value.files.internal.readFile(value.project.id, GROWTH_INTERNAL_NAMESPACE, materializationStateKey("goal-1"))).toBeUndefined()
    }
  })

  test("runs private research and fresh writing sessions in bounded batches", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const batches: Array<{ phase: "research" | "writing"; ids: string[] }> = []
    let committed = false
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async (commands) => {
        const phase = commands[0]!.workerProfile === "world-research" ? "research" : "writing"
        expect(commands.every((command) => command.workerProfile === (phase === "research" ? "world-research" : "world-writer"))).toBe(true)
        batches.push({ phase, ids: commands.map((command) => command.workItemId!) })
        for (const command of commands) {
          const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
          if (phase === "research") {
            expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
            continue
          }
          expect(command.prompt).toContain("候选文类与文风建议")
          expect(command.prompt).toContain("自由创造完整、丰富、可读")
          expect(command.prompt).toContain("成稿后检查篇内明显矛盾")
          expect(command.prompt).not.toContain("attachment.documentPath")
          await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
          const imageTaskId = `image-${object.id}`
          value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
          expect((await value.tool.execute(completionAction(object, imageTaskId, `${object.title}完成。`), context(value, object.id, goal))).ok).toBe(true)
        }
        throw new Error("Model returned empty response")
      },
    }, {
      hasReport: () => false,
      commit: async (report) => {
        committed = true
        return { goal, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    await expect(coordinator.run(goal)).resolves.toEqual({ state: "completed", reason: `${WORLD_BLUEPRINT_LAYERS[0]} materialized` })
    expect(batches).toEqual([
      { phase: "research", ids: value.entries.slice(0, 3).map((object) => object.id) },
      { phase: "writing", ids: value.entries.slice(0, 3).map((object) => object.id) },
      { phase: "research", ids: [value.entries[3]!.id] },
      { phase: "writing", ids: [value.entries[3]!.id] },
    ])
    expect(committed).toBe(true)
  })

  test("recovers a completed layer report before dispatching the next layer", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    const reports = new Set<string>()
    let workerRuns = 0
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async () => {
        workerRuns += 1
        return []
      },
    }, {
      hasReport: (_goalId, reportId) => reports.has(reportId),
      commit: async (report) => {
        reports.add(report.reportId)
        return { goal, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    await expect(coordinator.run(goal)).resolves.toEqual({ state: "completed", reason: `${WORLD_BLUEPRINT_LAYERS[0]} materialization report recovered` })
    expect(reports).toEqual(new Set(["world-materialization-layer-1"]))
    expect(workerRuns).toBe(0)
    expect(await value.service.currentLayer(value.project.id, goal.goalId, value.workRoot)).toBe(WORLD_BLUEPRINT_LAYERS[1])
  })

  test("keeps an earlier partial layer report immutable and records reopened progress separately", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const commits: string[] = []
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async (commands) => {
        const research = commands[0]!.workerProfile === "world-research"
        for (const command of commands) {
          const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
          if (research) {
            expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
            continue
          }
          await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
          const imageTaskId = `image-${object.id}`
          value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
          expect((await value.tool.execute(completionAction(object, imageTaskId, "恢复完成。"), context(value, object.id, goal))).ok).toBe(true)
        }
        return commands.map(() => ({ state: "completed" as const }))
      },
    }, {
      hasReport: (_goalId, reportId) => reportId === "world-materialization-layer-1",
      commit: async (report) => {
        commits.push(report.reportId)
        return { goal, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    await expect(coordinator.run(goal)).resolves.toEqual({ state: "completed", reason: `${WORLD_BLUEPRINT_LAYERS[0]} materialized` })
    expect(commits).toEqual([`world-materialization-layer-1-recovery-${goal.version}`])
  })

  test("recovers the last historical layer report and then returns trusted evidence to the Owner", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[1]!)
    const reports = new Set(["world-materialization-layer-2"])
    const committedOutcomes: string[] = []
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async () => { throw new Error("finalization must not launch a Summary Worker") },
    }, {
      hasReport: (_goalId, reportId) => reports.has(reportId),
      commit: async (report) => {
        reports.add(report.reportId)
        committedOutcomes.push(report.outcome)
        return { goal: { ...goal, status: report.outcome === "completed" ? "completed" : "active" }, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    await expect(coordinator.run(goal)).resolves.toEqual({ state: "completed", reason: `${WORLD_BLUEPRINT_LAYERS[0]} materialization report recovered` })
    expect(reports).toEqual(new Set(["world-materialization-layer-2", "world-materialization-layer-1"]))
    expect(committedOutcomes).toEqual(["continue"])
    const completed = await coordinator.run(goal)
    expect(completed.state).toBe("completed")
    expect(completed.reason).toContain("可信完成信息")
    expect(completed.reason).toContain(`可信正文：${value.entries.length}/${value.entries.length}`)
    expect(committedOutcomes).toEqual(["continue", "completed"])
  })

  test("returns deterministic trusted completion evidence without invoking a Summary Worker", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[1]!)
    const reports = new Set(["world-materialization-layer-1", "world-materialization-layer-2"])
    let completionReport: import("@creatx/contracts").GrowthProgressReport | undefined
    let completionAuthority: string | undefined
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async () => {
        throw new Error("finalization must not invoke the Provider")
      },
    }, {
      hasReport: (_goalId, reportId) => reports.has(reportId),
      commit: async (report, _context, options) => {
        completionReport = report
        completionAuthority = options?.completionAuthority
        return { goal: { ...goal, status: "completed" }, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    const completed = await coordinator.run(goal)
    expect(completed.state).toBe("completed")
    expect(completed.reason).toContain("可信完成信息")
    expect(completionReport).toMatchObject({
      reportId: "world-materialization-owner-ready-v3",
      outcome: "completed",
      artifactPaths: [],
      imageTaskIds: value.entries.map((object) => `image-${object.id}`),
      backgroundImageTaskIds: value.entries.map((object) => `image-${object.id}`),
      requiredImageTaskIds: [],
    })
    expect(completionAuthority).toBe("world-materialization-final")
  }, 15_000)

  test("uses a versioned terminal report when a reopened Goal already has final evidence", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[1]!)
    let reportId = ""
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async () => { throw new Error("finalization must not invoke the Provider") },
    }, {
      hasReport: (_goalId, candidate) => ["world-materialization-layer-1", "world-materialization-layer-2", "world-materialization-owner-ready-v3"].includes(candidate),
      commit: async (report) => {
        reportId = report.reportId
        return { goal: { ...goal, status: "completed" }, outcome: report.outcome, duplicate: false }
      },
    }, { get: () => goal })

    await expect(coordinator.run(goal)).resolves.toMatchObject({ state: "completed" })
    expect(reportId).toBe(`world-materialization-owner-ready-v3-recovery-${goal.version}`)
  })

  test("reports image paths that did not apply the project visual style", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    for (const [imageTaskId, evidence] of value.images) value.images.set(imageTaskId, { ...evidence, visualStyleApplied: true })
    const missingImageTaskId = `image-${value.entries[0]!.id}`
    value.images.set(missingImageTaskId, { ...value.images.get(missingImageTaskId)!, visualStyleApplied: false })

    const missing = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(missing.summary).toContain("未应用项目统一画风的图片")
    expect(missing.summary).toContain(imagePath(value.entries[0]!.plannedPath!))

    value.images.set(missingImageTaskId, { ...value.images.get(missingImageTaskId)!, visualStyleApplied: true })
    const complete = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(complete.summary).not.toContain("未应用项目统一画风的图片")
  })

  test("records repairable failures and turns them green only after durable retry evidence", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const issueHarness = memoryIssuePort(goal)
    let firstResearch = true
    const repairObjectIds = new Set<string>()
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async (commands) => {
        const research = commands[0]!.workerProfile === "world-research"
        if (research && firstResearch) {
          firstResearch = false
          commands.forEach((command) => repairObjectIds.add(command.workItemId!))
          return commands.map(() => ({ state: "failed" as const, failure: { code: "tool_failed" as const, message: "研究回执不合法。", detail: "consistencyGuard.invariants must contain 0 to 30 objects" } }))
        }
        for (const command of commands) {
          const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
          if (research) {
            if (repairObjectIds.has(object.id)) expect(command.prompt).toContain("上次尝试未形成合法持久简报")
            else expect(command.prompt).not.toContain("上次尝试未形成合法持久简报")
            expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
            continue
          }
          await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
          const imageTaskId = `image-${object.id}`
          value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
          expect((await value.tool.execute(completionAction(object, imageTaskId, "自动修复后完成。"), context(value, object.id, goal))).ok).toBe(true)
        }
        return commands.map(() => ({ state: "completed" as const }))
      },
    }, { hasReport: () => false, commit: async (report) => ({ goal, outcome: report.outcome, duplicate: false }) }, issueHarness.goals, issueHarness.issues)

    await expect(coordinator.run(goal)).resolves.toMatchObject({ state: "completed" })
    expect(issueHarness.all()).toHaveLength(3)
    expect(issueHarness.all().every((issue) => issue.status === "resolved" && issue.errorCode === "materialization_contract_overflow" && issue.resolvedAt)).toBe(true)
  })

  test("bypasses a failed final response only when the Worker already left durable evidence", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const issueHarness = memoryIssuePort(goal)
    const phases: string[] = []
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async (commands) => {
        const research = commands[0]!.workerProfile === "world-research"
        phases.push(research ? "research" : "writing")
        for (const command of commands) {
          const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
          if (research) {
            expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
            continue
          }
          await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
          const imageTaskId = `image-${object.id}`
          value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
          expect((await value.tool.execute(completionAction(object, imageTaskId, "正文完成。"), context(value, object.id, goal))).ok).toBe(true)
        }
        return commands.map(() => research ? { state: "failed" as const, reason: "Model returned empty response" } : { state: "completed" as const })
      },
    }, { hasReport: () => false, commit: async (report) => ({ goal, outcome: report.outcome, duplicate: false }) }, issueHarness.goals, issueHarness.issues)

    await expect(coordinator.run(goal)).resolves.toMatchObject({ state: "completed" })
    expect(phases).toContain("writing")
    await expect(value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)).resolves.toMatchObject({
      evidence: { terminal: { trustedCompleted: value.entries.filter((entry) => entry.layer === WORLD_BLUEPRINT_LAYERS[0]).length } },
    })
    expect(issueHarness.all()).toHaveLength(4)
    expect(issueHarness.all().every((issue) => issue.status === "bypassed" && issue.resolvedAt)).toBe(true)
  })

  test("automatically bypasses exhausted objects and their dependent subtree", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const issueHarness = memoryIssuePort(goal)
    const coordinator = new WorldMaterializationCoordinator(value.service, {
      runGrowthStageBatch: async (commands) => commands.map(() => ({ state: "failed" as const, reason: "persistent unknown failure" })),
    }, { hasReport: () => false, commit: async (report) => ({ goal, outcome: report.outcome, duplicate: false }) }, issueHarness.goals, issueHarness.issues)

    await expect(coordinator.run(goal)).resolves.toMatchObject({ state: "completed" })
    const rootIssue = issueHarness.all().find((issue) => issue.workItemId === value.entries[0]!.id)!
    const leafIssue = issueHarness.all().find((issue) => issue.workItemId === value.entries[1]!.id)!
    expect(rootIssue).toMatchObject({ status: "bypassed", impact: "local", affectedObjectIds: [value.entries[0]!.id, value.entries[2]!.id] })
    expect(leafIssue).toMatchObject({ status: "bypassed", impact: "local", affectedObjectIds: [value.entries[1]!.id] })
    expect(rootIssue.resolvedAt).toBeTruthy()
    expect(leafIssue.resolvedAt).toBeTruthy()
    expect(issueHarness.goal()).toMatchObject({ status: "active", version: goal.version })
  })

  test("reports every untrusted object instead of treating an existing file as completed", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    const unverified = value.entries.find((object) => object.layer === WORLD_BLUEPRINT_LAYERS[1])!
    await write(value.files, value.project.id, unverified.plannedPath!, formalBody(unverified.title))
    const trustedCompleted = value.entries.filter((object) => object.layer === WORLD_BLUEPRINT_LAYERS[0]).length

    const result = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(result.evidence.terminal).toMatchObject({
      total: value.entries.length,
      trustedCompleted,
      untrusted: value.entries.length - trustedCompleted,
      isPartial: true,
    })
    expect(result.evidence.terminal.outcomes.find((outcome) => outcome.objectId === unverified.id)?.status).toBe("unverified-file")
    expect(result.summary).toContain("交付结果：部分完成")
    expect(result.summary).toContain(`可信正文：${trustedCompleted}/${value.entries.length}`)
    expect(result.summary).toContain(`未可信完成：${value.entries.length - trustedCompleted}`)
    for (const outcome of result.evidence.terminal.outcomes.filter((outcome) => outcome.status !== "completed" && outcome.status !== "accepted-existing")) {
      expect(result.summary).toContain(outcome.title)
      expect(result.summary).toContain(outcome.path)
    }
  })

  test("includes Goal-owned image tasks that have not reached a materialization receipt", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    const receipted = value.entries[0]!
    const unbound = value.entries.find((object) => object.layer === WORLD_BLUEPRINT_LAYERS[1])!
    value.goalImages.push({
      imageTaskId: `image-${receipted.id}`,
      growthWorkItemId: receipted.id,
      growthAttemptId: "attempt-receipted",
      ...value.images.get(`image-${receipted.id}`)!,
    }, {
      imageTaskId: "image-unbound",
      growthWorkItemId: unbound.id,
      growthAttemptId: "attempt-unbound",
      status: "queued",
      relativePath: imagePath(unbound.plannedPath!),
      visualStyleApplied: true,
    })

    const result = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(result.evidence.images.filter((image) => image.imageTaskId === `image-${receipted.id}`)).toHaveLength(1)
    expect(result.evidence.images.find((image) => image.imageTaskId === "image-unbound")).toMatchObject({
      bindingStatus: "unbound-to-receipt",
      artifactPath: unbound.plannedPath,
      growthWorkItemId: unbound.id,
    })
    expect(result.summary).toContain("已提交但尚未绑定正文回执的图片")
    expect(result.summary).toContain(imagePath(unbound.plannedPath!))
  })

  test("does not let terminal Issue history defer objects that still have runnable work", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    const [bypassed, needsHelp] = value.entries
    value.terminalIssues.push(
      { status: "bypassed", affectedObjectIds: [bypassed!.id] },
      { status: "needs_help", affectedObjectIds: [needsHelp!.id] },
    )

    const result = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(result.evidence.terminal.outcomes.find((outcome) => outcome.objectId === bypassed!.id)?.status).toBe("needs-help")
    expect(result.evidence.terminal.outcomes.find((outcome) => outcome.objectId === needsHelp!.id)?.status).toBe("needs-help")
  })

  test("silences a generated image position mismatch while still reporting other attachment failures", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    await materializeLayer(value, goal, WORLD_BLUEPRINT_LAYERS[0]!)
    const imageTaskId = `image-${value.entries[0]!.id}`
    value.images.set(imageTaskId, {
      ...value.images.get(imageTaskId)!,
      status: "succeeded",
      attachment: { documentPath: value.entries[0]!.plannedPath!, status: "failed", errorCode: "image_attachment_conflict", errorMessage: "标题已被用户修改" },
    })
    const unavailableImageTaskId = `image-${value.entries[1]!.id}`
    value.images.set(unavailableImageTaskId, {
      ...value.images.get(unavailableImageTaskId)!,
      status: "succeeded",
      attachment: { documentPath: value.entries[1]!.plannedPath!, status: "failed", errorCode: "image_attachment_unavailable", errorMessage: "挂接服务不可用" },
    })

    const result = await value.service.finalSummary(value.project.id, goal.goalId, value.workRoot)
    expect(result.summary).toContain("图片已生成但未插入文章")
    expect(result.summary).not.toContain("image_attachment_conflict")
    expect(result.summary).toContain("image_attachment_unavailable")
    expect(result.evidence.completedObjects).toBeGreaterThan(0)
  })

  test("isolates one Worker failure while preserving durable siblings", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const batch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of batch.commands.slice(1)) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    }
    await value.service.settleBatch(
      value.project.id,
      goal.goalId,
      value.workRoot,
      batch.commands.map((command) => command.workItemId!),
      batch.commands.map((_, index) => index === 0
        ? { state: "failed", reason: "provider_network: worker request disconnected" }
        : { state: "completed" }),
    )
    const objects = (await value.service.prepare(value.project.id, goal.goalId, value.workRoot)).objects.slice(0, 3)
    expect(objects[0]!.status).toBe("retryable")
    expect(objects[0]!.lastError?.message).toContain("provider_network")
    expect(objects.slice(1).every((object) => object.status === "ready")).toBe(true)
  })

  test("injects the exact contract failure into a bounded repair attempt", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const first = await value.service.dispatchBatch(commandInput(value, goal))
    const target = first.commands[0]!
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, first.commands.map((command) => command.workItemId!), first.commands.map((command) => command === target
      ? { state: "failed", failure: { code: "tool_failed", message: "工具提交失败。", detail: "consistencyGuard.invariants must contain 0 to 30 objects" } }
      : { state: "failed", reason: "provider_network" }))
    const retry = await value.service.dispatchBatch(commandInput(value, goal))
    const repair = retry.commands.find((command) => command.workItemId === target.workItemId)!
    expect(repair.prompt).toContain("上次尝试未形成合法持久简报")
    expect(repair.prompt).toContain("consistencyGuard.invariants must contain 0 to 30 objects")
    expect(repair.prompt).toContain("只修正简报")
    expect(repair.prompt).toContain("不重复文件或图片副作用")
  })

  test("derives causal downstream impact and rearms only a blocked object", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    expect(await value.service.downstreamObjectIds(value.project.id, goal.goalId, value.workRoot, value.entries[0]!.id)).toEqual([value.entries[2]!.id])
    expect(await value.service.downstreamObjectIds(value.project.id, goal.goalId, value.workRoot, value.entries[1]!.id)).toEqual([])
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const batch = await value.service.dispatchBatch(commandInput(value, goal))
      await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, batch.commands.map((command) => command.workItemId!), batch.commands.map(() => ({ state: "failed", reason: "persistent failure" })))
    }
    const blocked = await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    expect(blocked.objects.find((object) => object.objectId === value.entries[0]!.id)?.status).toBe("blocked")
    const rearmed = await value.service.retryBlockedObject(value.project.id, goal.goalId, value.workRoot, value.entries[0]!.id)
    expect(rearmed.objects.find((object) => object.objectId === value.entries[0]!.id)?.status).toBe("retryable")
    expect(rearmed.objects.find((object) => object.objectId === value.entries[0]!.id)?.block).toBeUndefined()
  })

  test("rearms a legacy unknown object that still carries a durable block", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    const state = await readInternalJson<Awaited<ReturnType<typeof value.service.prepare>>>(value.files, value.project.id, materializationStateKey(goal.goalId))
    await writeInternalJson(value.files, value.project.id, materializationStateKey(goal.goalId), {
      ...state,
      objects: state.objects.map((candidate) => candidate.objectId === object.id ? {
        ...candidate,
        status: "unknown",
        lastError: { phase: "recovery", message: "public body leaks external creative framing" },
        block: { kind: "attempt-limit", reason: "public body leaks external creative framing" },
      } : candidate),
    })

    const rearmed = await value.service.retryBlockedObject(value.project.id, goal.goalId, value.workRoot, object.id)
    expect(rearmed.objects.find((candidate) => candidate.objectId === object.id)).toMatchObject({
      status: "retryable",
      lastError: { phase: "recovery" },
    })
  })

  test("turns an Owner-authorized repair into an editable Writer attempt", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    const state = await readInternalJson<Awaited<ReturnType<typeof value.service.prepare>>>(value.files, value.project.id, materializationStateKey(goal.goalId))
    await writeInternalJson(value.files, value.project.id, materializationStateKey(goal.goalId), {
      ...state,
      objects: state.objects.map((candidate) => candidate.objectId === object.id ? {
        ...candidate,
        status: "blocked",
        lastError: { phase: "recovery", message: "正文仍含制作框架" },
        block: { kind: "attempt-limit", reason: "正文仍含制作框架" },
      } : candidate),
    })

    await value.service.resolveBlockedObject(value.project.id, goal.goalId, value.workRoot, object.id, "repair", "删除制作框架后继续，不改变世界事实。")
    const repair = await value.service.dispatchBatch(commandInput(value, goal))
    const command = repair.commands.find((candidate) => candidate.workItemId === object.id)!
    expect(command.workerProfile).toBe("world-writer")
    expect(command.prompt).toContain("Owner resolution (repair)")
    expect(command.prompt).toContain("删除制作框架后继续")
  })

  test("keeps a failed Writer editable and injects the exact completion error", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, [object.id], [{
      state: "failed",
      failure: { code: "growth_invalid", message: "正文对象回执无效。", detail: "public body leaks external creative framing" },
    }])

    const repair = await value.service.dispatchBatch(commandInput(value, goal))
    const command = repair.commands.find((candidate) => candidate.workItemId === object.id)!
    expect(command.workerProfile).toBe("world-writer")
    expect(command.directFileMutation).not.toBe("disabled")
    expect(command.prompt).toContain("public body leaks external creative framing")
    expect(command.prompt).toContain("修改现有正文")
  })

  test("does not lock an uncommitted extraction before image validation succeeds", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    expect(await value.tool.execute(completionAction(object, "missing-image", "第一次抽取"), context(value, object.id, goal))).toMatchObject({ ok: false, error: { code: "growth_invalid" } })
    expect(await value.files.internal.readFile(value.project.id, GROWTH_INTERNAL_NAMESPACE, materializationExtractionKey(goal.goalId, object.id))).toBeUndefined()

    const imageTaskId = `image-${object.id}`
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    const second = completionAction(object, imageTaskId, "第二次抽取")
    second.extraction.facts[0]!.text = `${object.title}形成了修正后的可用观察经验`
    expect(await value.tool.execute(second, context(value, object.id, goal))).toMatchObject({ ok: true })
  })

  test("rejects a late Worker after a newer object attempt starts", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const first = await value.service.dispatchBatch(commandInput(value, goal))
    const target = first.commands[0]!
    await value.service.settleBatch(
      value.project.id,
      goal.goalId,
      value.workRoot,
      first.commands.map((command) => command.workItemId!),
      first.commands.map((_, index) => index === 0 ? { state: "failed", reason: "provider_network" } : { state: "completed" }),
    )
    const second = await value.service.dispatchBatch(commandInput(value, goal))
    expect(second.commands[0]!.workItemId).toBe(target.workItemId)
    expect(second.commands[0]!.attemptId).not.toBe(target.attemptId)
    const object = value.entries.find((candidate) => candidate.id === target.workItemId)!
    expect(await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal, target.attemptId))).toMatchObject({
      ok: false,
      error: { code: "growth_conflict", detail: expect.stringContaining("attempt is stale") },
    })
  })

  test("replays exact research and completion retries for the same attempt", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of researchBatch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      const action = researchAction(object, value.workRoot)
      expect(await value.tool.execute(action, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: false } })
      expect(await value.tool.execute(action, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: true } })
    }
    const writingBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const command = writingBatch.commands[0]!
    const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    const imageTaskId = `image-${object.id}`
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    const action = completionAction(object, imageTaskId, "同一尝试精确重放。")
    expect(await value.tool.execute(action, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: false } })
    expect(await value.tool.execute(action, context(value, object.id, goal))).toMatchObject({ ok: true, value: { replayed: true } })
  })

  test("reuses an existing object image task during a bounded Writer retry", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const research = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of research.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    }
    const writing = await value.service.dispatchBatch(commandInput(value, goal))
    const object = value.entries.find((candidate) => candidate.id === writing.commands[0]!.workItemId)!
    const imageTaskId = `image-${object.id}`
    value.recoveryImages.set(`world-pro:${object.id}:illustration`, { imageTaskId, status: "queued", relativePath: imagePath(object.plannedPath!) })
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, writing.commands.map((command) => command.workItemId!), writing.commands.map(() => ({ state: "failed", reason: "Writer ended before completion" })))

    const retry = await value.service.dispatchBatch(commandInput(value, goal))
    expect(retry.commands.find((command) => command.workItemId === object.id)?.prompt).toContain(`已有真实图片任务 ${imageTaskId}`)
    expect(retry.commands.find((command) => command.workItemId === object.id)?.prompt).toContain("禁止再次调用 submit_image_generation")
  })

  test("blocks an object after three failed attempts instead of generating forever", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const first = await value.service.dispatchBatch(commandInput(value, goal))
    await value.service.settleBatch(
      value.project.id,
      goal.goalId,
      value.workRoot,
      first.commands.map((command) => command.workItemId!),
      first.commands.map((_, index) => index === 0 ? { state: "failed", reason: "first failure" } : { state: "completed" }),
    )
    for (const reason of ["second failure", "third failure"]) {
      const retry = await value.service.dispatchBatch(commandInput(value, goal))
      const targetCommand = retry.commands.find((command) => command.workItemId === first.commands[0]!.workItemId)!
      expect(targetCommand).toBeTruthy()
      await value.service.settleBatch(
        value.project.id,
        goal.goalId,
        value.workRoot,
        retry.commands.map((command) => command.workItemId!),
        retry.commands.map((command) => command === targetCommand ? { state: "failed", reason } : { state: "completed" }),
      )
    }
    const state = await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    const target = state.objects.find((object) => object.objectId === first.commands[0]!.workItemId)!
    expect(target.status).toBe("blocked")
    expect(target.block).toEqual({ kind: "attempt-limit", reason: "third failure" })
    expect((await value.service.dispatchBatch(commandInput(value, goal))).commands.some((command) => command.workItemId === target.objectId)).toBe(false)
  })

  test("keeps an exhausted Writer blocked even though its research remains durable", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const layer = WORLD_BLUEPRINT_LAYERS[0]!
    await writeInternalJson(value.files, value.project.id, blueprintLayerKey("goal-1", layer), {
      schemaVersion: 3,
      layer,
      objects: [group(0), value.entries[0]],
    })
    await writeInternalJson(value.files, value.project.id, blueprintRelationsKey("goal-1"), { schemaVersion: 3, relations: [] })
    const index = await readInternalJson<WorldBlueprintIndexDocument>(value.files, value.project.id, blueprintIndexKey("goal-1"))
    index.layers[0]!.objectCount = 2
    index.layers[0]!.plannedPathCount = 1
    index.causalRelationCount = 0
    index.crossLayerCausalRelationCount = 0
    await writeInternalJson(value.files, value.project.id, blueprintIndexKey("goal-1"), index)

    const research = await value.service.dispatchBatch(commandInput(value, goal))
    const object = value.entries[0]!
    expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    for (const reason of ["writer failed once", "writer failed twice", "writer failed three times"]) {
      const writing = await value.service.dispatchBatch(commandInput(value, goal))
      await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, [object.id], [{ state: "failed", reason }])
    }
    expect((await value.service.prepare(value.project.id, goal.goalId, value.workRoot)).objects[0]!.status).toBe("blocked")
    expect((await value.service.dispatchBatch(commandInput(value, goal))).commands).toEqual([])
  })

  test("bounds filesystem reads while reconciling a growing materialization", async () => {
    const value = await setup()
    let activeReads = 0
    let maximumReads = 0
    const queries: ProjectFileQueryPort = {
      ...value.files.queries,
      readBytes: async (projectId, relativePath) => {
        activeReads += 1
        maximumReads = Math.max(maximumReads, activeReads)
        try {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 2))
          return await value.files.queries.readBytes(projectId, relativePath)
        } finally {
          activeReads -= 1
        }
      },
    }
    const service = new WorldMaterializationService(queries, value.files.internal, async (_projectId, imageTaskId) => value.images.get(imageTaskId), () => ({
      projectId: value.project.id,
      version: 2,
      status: "active",
      workRootPath: value.workRoot,
    }))

    await service.dispatchBatch(commandInput(value, growthGoal(value)))

    expect(maximumReads).toBeLessThanOrEqual(4)
  })

  test("runs the V4 brief, free writing, extraction, and downstream fact chain", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const completedFacts: string[] = []

    for (const expectedGroup of [value.entries.slice(0, 3), [value.entries[3]!]]) {
      const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
      expect(researchBatch.phase).toBe("research")
      expect(researchBatch.commands.map((command) => command.workItemId)).toEqual(expectedGroup.map((object) => object.id))
      for (const command of researchBatch.commands) {
        const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
        expect(command.prompt).toContain("由 Runtime 从可信 Worker 身份补齐")
        expect(command.prompt).toContain("短小写作简报")
        expect(command.prompt).not.toContain("contentCards 只包含")
        expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
      }

      const writingBatch = await value.service.dispatchBatch(commandInput(value, goal))
      expect(writingBatch.phase).toBe("writing")
      for (const command of writingBatch.commands) {
        const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
        expect(command.prompt).toContain("候选文类与文风建议")
        expect(command.prompt).toContain("自由创造完整、丰富、可读")
        expect(command.prompt).toContain("身份和来源字段由 Runtime")
        expect(command.prompt).toContain("GPT/Codex 模型通常使用 apply_patch")
        expect(command.prompt).not.toContain("不得创造内容卡中不存在的新世界事实")
        const body = formalBody(object.title)
        await write(value.files, value.project.id, object.plannedPath!, body)
        const imageTaskId = `image-${object.id}`
        value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
        expect(await value.tool.execute(completionAction(object, imageTaskId, `${object.title}完成。`, body), context(value, object.id, goal))).toMatchObject({
          ok: true,
          value: { replayed: false },
        })
        completedFacts.push(`${object.title}形成了可供航行者采用的具体观察经验`)
      }
    }

    const first = value.entries[0]!
    const brief = await readInternalJson<{ schemaVersion: number; materialPaths: string[] }>(value.files, value.project.id, materializationBriefKey(goal.goalId, first.id))
    expect(brief).toMatchObject({ schemaVersion: 4, materialPaths: [`${value.workRoot}/世界基准.md`] })
    const extraction = await readInternalJson<{ schemaVersion: number; facts: Array<{ sourceLevel: string }> }>(value.files, value.project.id, materializationExtractionKey(goal.goalId, first.id))
    expect(extraction).toMatchObject({ schemaVersion: 4, facts: [expect.objectContaining({ sourceLevel: "created" })] })
    const receipt = await readInternalJson<{ schemaVersion: number; extractionSha256: string }>(value.files, value.project.id, materializationReceiptKey(goal.goalId, first.id))
    expect(receipt.schemaVersion).toBe(4)
    expect(receipt.extractionSha256).toHaveLength(64)
    const relations = await readInternalJson<{ nodes: Array<{ title: string }> }>(value.files, value.project.id, materializationRelationsKey(goal.goalId))
    expect(relations.nodes.some((node) => node.title === completedFacts[0])).toBe(true)

    const later = await value.service.dispatchBatch(commandInput(value, goal))
    expect(later.phase).toBe("research")
    for (const fact of completedFacts) expect(later.commands[0]!.prompt).toContain(fact)
  })


  test("offers every completed earlier-layer body as a bounded choice without admitting same-layer siblings", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    for (const group of [value.entries.slice(0, 3), [value.entries[3]!]]) {
      const research = await value.service.dispatchBatch(commandInput(value, goal))
      expect(research.commands.map((command) => command.workItemId)).toEqual(group.map((object) => object.id))
      for (const object of group) {
        expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
      }
      const writing = await value.service.dispatchBatch(commandInput(value, goal))
      for (const object of group) {
        await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
        const imageTaskId = `image-${object.id}`
        value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
        expect((await value.tool.execute(completionAction(object, imageTaskId, `${object.title}完成。`), context(value, object.id, goal))).ok).toBe(true)
      }
      expect(writing.commands.map((command) => command.workItemId)).toEqual(group.map((object) => object.id))
    }

    const batch = await value.service.dispatchBatch(commandInput(value, goal))
    expect(batch.phase).toBe("research")
    const earlierPaths = value.entries.slice(0, 4).map((object) => object.plannedPath!)
    for (const command of batch.commands) {
      for (const path of earlierPaths) expect(command.prompt).toContain(`- ${path}`)
      expect(command.prompt).toContain("按相关性读取少量材料")
    }

    const object = value.entries[4]!
    const globalSource = researchAction(object, value.workRoot)
    globalSource.materialPaths = [value.entries[1]!.plannedPath!]
    expect((await value.tool.execute(globalSource, context(value, object.id, goal))).ok).toBe(true)

    const sibling = value.entries[5]!
    const invalidSibling = researchAction(sibling, value.workRoot)
    invalidSibling.materialPaths = [object.plannedPath!]
    expect(await value.tool.execute(invalidSibling, context(value, sibling.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("material is not available") },
    })
  })

  test("fails closed for short or polluted public bodies, extraction conflicts, and a wrong image path", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    const imageTaskId = `image-${object.id}`
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })

    const leakedBody = `# ${object.title}\n\n${"created: 这是内部 sourceLevel 标签，不得出现在公开正文。".repeat(20)}`
    await write(value.files, value.project.id, object.plannedPath!, leakedBody)
    expect(await value.tool.execute(completionAction(object, imageTaskId, "泄露内部标签", leakedBody), context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("exposes internal production labels") },
    })

    const shortBody = `# ${object.title}\n\n这只是一段不足以独立成篇的摘要。`
    await write(value.files, value.project.id, object.plannedPath!, shortBody)
    expect(await value.tool.execute(completionAction(object, imageTaskId, "正文过短", shortBody), context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("too short to stand as a complete world entry") },
    })

    const selfQuestioningBody = `# 卷首：先问五件事\n\n${"这是一段把内部问题清单误写进正文的测试文字。".repeat(80)}`
    await write(value.files, value.project.id, object.plannedPath!, selfQuestioningBody)
    expect(await value.tool.execute(completionAction(object, imageTaskId, "泄露自询问", selfQuestioningBody), context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("self-questioning scaffolding") },
    })

    const body = formalBody(object.title)
    await write(value.files, value.project.id, object.plannedPath!, body)
    const contradictionBase = completionAction(object, imageTaskId, "存在篇内矛盾", body)
    const contradiction = { ...contradictionBase, extraction: { ...contradictionBase.extraction, contradictions: ["潮汐方向在同一时刻互相否定"] } }
    expect(await value.tool.execute(contradiction, context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("within-article contradiction blocks completion") },
    })

    const lockedConflictBase = completionAction(object, imageTaskId, "冲突锁定事实", body)
    const lockedConflict = { ...lockedConflictBase, extraction: { ...lockedConflictBase.extraction, lockedFactConflicts: ["正文否定了已锁定的航路观测事实"] } }
    expect(await value.tool.execute(lockedConflict, context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("locked fact conflict blocks completion") },
    })

    value.images.set("wrong-image", { status: "queued", relativePath: `${value.workRoot}/错误.png` })
    expect(await value.tool.execute(completionAction(object, "wrong-image", "错误图片", body), context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_invalid", detail: expect.stringContaining("image task must target") },
    })
  })


  test("recovers durable research and adopts an unreceipted body without rewriting it", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of researchBatch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    }
    const writingBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const recovered = await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, writingBatch.commands.map((command) => command.workItemId!))
    expect(recovered.objects.filter((object) => writingBatch.commands.some((command) => command.workItemId === object.objectId)).every((object) => object.status === "retryable")).toBe(true)

    const redispatched = await value.service.dispatchBatch(commandInput(value, goal))
    expect(redispatched.phase).toBe("writing")
    const object = value.entries.find((candidate) => candidate.id === redispatched.commands[0]!.workItemId)!
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    const settled = await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, redispatched.commands.map((command) => command.workItemId!))
    expect(settled.objects.find((candidate) => candidate.objectId === object.id)?.status).toBe("unknown")
    const imageTaskId = `image-${object.id}`
    value.recoveryImages.set(`world-pro:${object.id}:illustration`, { imageTaskId, status: "queued", relativePath: imagePath(object.plannedPath!) })
    const recovery = await value.service.dispatchBatch(commandInput(value, goal))
    expect(recovery.phase).toBe("recovery")
    expect(recovery.commands).toHaveLength(1)
    expect(recovery.commands[0]).toMatchObject({ workItemId: object.id, directFileMutation: "disabled", workerProfile: "world-recovery" })
    expect(recovery.commands[0]!.prompt).toContain(`真实图片任务 ${imageTaskId}`)
    expect(recovery.commands[0]!.prompt).toContain("禁止再次调用 submit_image_generation")
    const original = new TextDecoder().decode(await value.files.queries.readBytes(value.project.id, object.plannedPath!))
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    expect((await value.tool.execute(completionAction(object, imageTaskId, "接管现有正文", original), context(value, object.id, goal))).ok).toBe(true)
    expect(new TextDecoder().decode(await value.files.queries.readBytes(value.project.id, object.plannedPath!))).toBe(original)
    expect((await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, [object.id])).objects.find((candidate) => candidate.objectId === object.id)?.status).toBe("completed")
  })

  test("reclaims an interrupted writing batch without waiting for the dead Worker to settle", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of researchBatch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    }
    const writingBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const object = value.entries.find((candidate) => candidate.id === writingBatch.commands[0]!.workItemId)!
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    const imageTaskId = `image-${object.id}`
    value.recoveryImages.set(`world-pro:${object.id}:illustration`, { imageTaskId, status: "queued", relativePath: imagePath(object.plannedPath!) })

    const recovery = await value.service.dispatchBatch(commandInput(value, goal))

    expect(recovery.phase).toBe("recovery")
    expect(recovery.commands).toHaveLength(1)
    expect(recovery.commands[0]).toMatchObject({ workItemId: object.id, directFileMutation: "disabled", workerProfile: "world-recovery" })
    expect(recovery.commands[0]!.prompt).toContain(`真实图片任务 ${imageTaskId}`)
    const state = await readInternalJson<{ objects: Array<{ objectId: string; status: string; lastError?: { phase: string; message: string } }> }>(value.files, value.project.id, materializationStateKey(goal.goalId))
    expect(state.objects.filter((candidate) => writingBatch.commands.slice(1).some((command) => command.workItemId === candidate.objectId))).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "retryable", lastError: expect.objectContaining({ phase: "writing", message: expect.stringContaining("interrupted") }) }),
    ]))
  })

  test("researches an interrupted unreviewed body before entering read-only recovery", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const firstResearch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of firstResearch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    }
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, firstResearch.commands.map((command) => command.workItemId!), firstResearch.commands.map(() => ({ state: "failed" as const, reason: "aborted" })))

    const retriedResearch = await value.service.dispatchBatch(commandInput(value, goal))
    expect(retriedResearch.phase).toBe("research")
    expect(retriedResearch.commands).toHaveLength(firstResearch.commands.length)
    for (const command of retriedResearch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      expect(command.workerProfile).toBe("world-research")
      expect(command.prompt).toContain(`未审正文草稿：\n- ${object.plannedPath}`)
      expect(command.prompt).toContain("不得作为自己的 source 路径")
      expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
    }

    const recovery = await value.service.dispatchBatch(commandInput(value, goal))
    expect(recovery.phase).toBe("recovery")
    expect(recovery.commands.map((command) => command.workItemId).sort()).toEqual(retriedResearch.commands.map((command) => command.workItemId).sort())
    expect(recovery.commands.every((command) => command.workerProfile === "world-recovery" && command.directFileMutation === "disabled")).toBe(true)
  })

  test("keeps a completed receipt valid after the user edits the formal body", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    value.images.set(`image-${object.id}`, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    expect((await value.tool.execute(completionAction(object, `image-${object.id}`, "正文已完成."), context(value, object.id, goal))).ok).toBe(true)

    await write(value.files, value.project.id, object.plannedPath!, `${formalBody(object.title)}\n\n用户补充了一段正式修订。`)
    const reconciled = await value.service.prepare(value.project.id, goal.goalId, value.workRoot)
    expect(reconciled.objects.find((candidate) => candidate.objectId === object.id)?.status).toBe("completed")
  })

  test("rejects recovery completion after the preserved body changes", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const object = await prepareWriting(value, goal)
    await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
    await value.service.settleBatch(value.project.id, goal.goalId, value.workRoot, [object.id])
    await value.service.dispatchBatch(commandInput(value, goal))
    await write(value.files, value.project.id, object.plannedPath!, `${formalBody(object.title)}\n\n外部改动`)
    const imageTaskId = `image-${object.id}`
    value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
    expect(await value.tool.execute({ action: "complete_object", imageTaskId, summary: "不应接管" }, context(value, object.id, goal))).toMatchObject({
      ok: false,
      error: { code: "growth_conflict", detail: expect.stringContaining("preserved hash") },
    })
  })

  test("fails closed for late research and completion after pause or version change", async () => {
    const value = await setup()
    const goal = growthGoal(value)
    const researchBatch = await value.service.dispatchBatch(commandInput(value, goal))
    const object = value.entries.find((candidate) => candidate.id === researchBatch.commands[0]!.workItemId)!
    value.setGoal({ projectId: value.project.id, version: 3, status: "paused", workRootPath: value.workRoot })
    expect(await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).toMatchObject({ ok: false, error: { code: "growth_conflict", detail: expect.stringContaining("paused v3") } })
  })
})

function growthGoal(value: Awaited<ReturnType<typeof setup>>) {
  return {
    goalId: "goal-1",
    projectId: value.project.id,
    sessionId: "session-1",
    instruction: "物化世界蓝图",
    status: "active" as const,
    workRootPath: value.workRoot,
    requiredImageTaskIds: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    version: 2,
  }
}

function memoryIssuePort(initialGoal: ReturnType<typeof growthGoal>) {
  let goal: GrowthGoalProjection = initialGoal
  const values = new Map<string, GrowthIssueProjection>()
  const findByDedupe = (goalId: string, dedupeKey: string) => [...values.values()].find((issue) => issue.goalId === goalId && (issue as GrowthIssueProjection & { dedupeKey?: string }).dedupeKey === dedupeKey)
  return {
    goals: { get: () => goal },
    issues: {
      recordIssue: (command: Parameters<WorldMaterializationIssuePort["recordIssue"]>[0]) => {
        const existing = findByDedupe(command.goalId, command.dedupeKey)
        if (existing) return existing
        const now = new Date().toISOString()
        const issue = { ...command, status: "detected" as const, attemptCount: 0, createdAt: now, updatedAt: now, version: 1, dedupeKey: command.dedupeKey }
        values.set(issue.issueId, issue)
        return issue
      },
      transitionIssue: (command: Parameters<WorldMaterializationIssuePort["transitionIssue"]>[0]) => {
        const current = values.get(command.issueId)!
        const now = new Date().toISOString()
        const next = { ...current, ...command, updatedAt: now, ...(command.status === "resolved" || command.status === "bypassed" ? { resolvedAt: now } : {}), version: current.version + 1 }
        values.set(next.issueId, next)
        return next
      },
      listIssues: () => [...values.values()],
      getIssueByDedupe: findByDedupe,
      blockForIssue: (command: Parameters<WorldMaterializationIssuePort["blockForIssue"]>[0]) => {
        const current = values.get(command.issueId)!
        const issue = { ...current, status: "waiting_user" as const, impact: "blocking" as const, affectedObjectIds: command.affectedObjectIds ?? current.affectedObjectIds, version: current.version + 1 }
        goal = { ...goal, status: "waiting", version: goal.version + 1 }
        values.set(issue.issueId, issue)
        return { goal, issue }
      },
    },
    all: () => [...values.values()],
    goal: () => goal,
  }
}

function commandInput(value: Awaited<ReturnType<typeof setup>>, goal: ReturnType<typeof growthGoal>) {
  return { projectId: value.project.id, sessionId: goal.sessionId, goalId: goal.goalId, expectedVersion: goal.version, root: value.workRoot }
}

function context(value: Awaited<ReturnType<typeof setup>>, objectId: string, goal: ReturnType<typeof growthGoal>, attemptId = value.attemptIds.get(objectId)) {
  return {
    sessionId: `worker-${objectId}`,
    projectId: value.project.id,
    growthGoalId: goal.goalId,
    growthGoalVersion: goal.version,
    ...(attemptId ? { growthAttemptId: attemptId } : {}),
    growthWorkItemId: objectId,
    growthWorkRootPath: value.workRoot,
  }
}

function researchAction(object: WorldBlueprintObject & { genreKey: string }, workRoot: string) {
  const genre = publicationGenre(object.layer, object.genreKey)
  return {
    action: "submit_research",
    purpose: `${object.title}本身及其世界影响`,
    materialPaths: [`${workRoot}/世界基准.md`],
    lockedFacts: [{ id: "locked-observation", text: `${object.title}通过反复观测形成可用航路常识`, sourcePaths: [`${workRoot}/世界基准.md`] }],
    genreSuggestions: { primary: genre.label, alternatives: ["地方纪行"], techniques: [...genre.language], avoid: [...genre.forbidden] },
  }
}


async function prepareWriting(value: Awaited<ReturnType<typeof setup>>, goal: ReturnType<typeof growthGoal>) {
  const batch = await value.service.dispatchBatch(commandInput(value, goal))
  for (const command of batch.commands) {
    const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
    expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
  }
  const writing = await value.service.dispatchBatch(commandInput(value, goal))
  return value.entries.find((candidate) => candidate.id === writing.commands[0]!.workItemId)!
}

async function materializeLayer(value: Awaited<ReturnType<typeof setup>>, goal: ReturnType<typeof growthGoal>, layer: string) {
  while (await value.service.currentLayer(value.project.id, goal.goalId, value.workRoot) === layer) {
    const batch = await value.service.dispatchBatch(commandInput(value, goal))
    for (const command of batch.commands) {
      const object = value.entries.find((candidate) => candidate.id === command.workItemId)!
      if (batch.phase === "research") {
        expect((await value.tool.execute(researchAction(object, value.workRoot), context(value, object.id, goal))).ok).toBe(true)
        continue
      }
      await write(value.files, value.project.id, object.plannedPath!, formalBody(object.title))
      const imageTaskId = `image-${object.id}`
      value.images.set(imageTaskId, { status: "queued", relativePath: imagePath(object.plannedPath!) })
      expect((await value.tool.execute(completionAction(object, imageTaskId, `${object.title}完成。`), context(value, object.id, goal))).ok).toBe(true)
    }
  }
}

function entry(id: string, title: string, layerIndex: number, order: number) {
  const layer = WORLD_BLUEPRINT_LAYERS[layerIndex]!
  return {
    id,
    key: id,
    title,
    layer,
    kind: "entry" as const,
    parentId: `group-${layerIndex}`,
    plannedPath: `航海尽头/${layer}/${title}.md`,
    genreKey: PUBLICATION_GENRE_LIBRARY[layer].defaultGenreKey,
    locator: `${layer}｜用于验证正文物化的具体世界对象`,
    order,
    status: "planned" as const,
  }
}

function group(layerIndex: number) {
  const layer = WORLD_BLUEPRINT_LAYERS[layerIndex]!
  return {
    id: `group-${layerIndex}`,
    key: `group-${layerIndex}`,
    title: `${layer}测试分组`,
    layer,
    kind: "group" as const,
    parentId: null,
    locator: `${layer}｜用于容纳本层正文物化测试对象`,
    order: 100,
    status: "planned" as const,
  }
}

function formalBody(title: string) {
  return `# ${title}\n\n${"测量官把晨昏所见与潮汐、风向、船速逐日对照，只有三支互不相识的船队留下相同记载，才会写进港口通行册。这样的谨慎并未消除争论，却让水手知道何时转帆、何时避开云墙，也让商人能够估算粮水和归期。".repeat(8)}`
}

function completionAction(object: WorldBlueprintObject, imageTaskId: string, summary: string, body = formalBody(object.title)) {
  return {
    action: "complete_object",
    imageTaskId,
    summary,
    extraction: {
      facts: [{ id: "fact-created", text: `${object.title}形成了可供航行者采用的具体观察经验` }],
      relations: [],
      contradictions: [],
      lockedFactConflicts: [],
    },
  }
}

function imagePath(plannedPath: string) {
  const parts = plannedPath.split("/")
  const file = parts.pop()!
  return `${parts.join("/")}/图片/${file.slice(0, -3)}.png`
}

async function write(files: ProjectFileService, projectId: string, relativePath: string, content: string) {
  await files.commands.writeFile({ projectId, relativePath, content })
}

async function writeInternalJson(files: ProjectFileService, projectId: string, key: string, value: unknown) {
  const existing = await files.internal.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
  await files.internal.writeFile({
    projectId,
    namespace: GROWTH_INTERNAL_NAMESPACE,
    key,
    content: `${JSON.stringify(value, undefined, 2)}\n`,
    expectedModifiedAt: existing?.modifiedAt ?? null,
  })
}

async function readInternalJson<T>(files: ProjectFileService, projectId: string, key: string) {
  const record = await files.internal.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
  if (!record) throw new Error(`missing internal test fixture: ${key}`)
  return JSON.parse(new TextDecoder().decode(record.bytes)) as T
}
