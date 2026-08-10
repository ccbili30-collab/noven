import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService, type ProjectInternalStatePort } from "@creatx/project-files"
import {
  blueprintStateKey,
  GROWTH_INTERNAL_NAMESPACE,
  materializationReceiptKey,
  materializationStateKey,
  migrateLegacyWorldState,
  migrateWorldV3ToV4Fixture,
  migrationManifestKey,
  hashWritingContract,
  publicationGenreKeys,
  resolveWritingContract,
  WORLD_BLUEPRINT_LAYERS,
  type WorldBlueprintIndexDocument,
  type WorldBlueprintLayerDocument,
  type WorldBlueprintObject,
  type WorldStyleProfile,
} from "../src"

const roots: string[] = []
const goalId = "goal-migration"
const workRoot = "迁移世界"

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Growth world internal-state migration", () => {
  test("migrates a V3 fixture to V4 without changing durable identities", () => {
    const fixture = {
      schemaVersion: 3 as const,
      layers: WORLD_BLUEPRINT_LAYERS.map((layer, index) => ({ layer, objects: [{ id: `object-${index}`, parentId: index ? `object-${index - 1}` : null, plannedPath: `${workRoot}/${layer}/正文.md` }] })),
      relations: [{ from: "object-0", to: "object-1", type: "causes" as const, reason: "规则塑造自然" }],
      materialization: {
        schemaVersion: 3 as const,
        root: workRoot,
        goalId,
        objects: [
          { objectId: "object-0", layer: WORLD_BLUEPRINT_LAYERS[0], plannedPath: `${workRoot}/${WORLD_BLUEPRINT_LAYERS[0]}/正文.md`, status: "completed" as const, attempts: { research: 1, writing: 1, recovery: 0 } },
          { objectId: "object-1", layer: WORLD_BLUEPRINT_LAYERS[1], plannedPath: `${workRoot}/${WORLD_BLUEPRINT_LAYERS[1]}/正文.md`, status: "blocked" as const, attempts: { research: 1, writing: 0, recovery: 0 }, block: { kind: "critical-gap" as const, reason: "旧文类 beat 缺口" } },
          { objectId: "object-2", layer: WORLD_BLUEPRINT_LAYERS[2], plannedPath: `${workRoot}/${WORLD_BLUEPRINT_LAYERS[2]}/正文.md`, status: "blocked" as const, attempts: { research: 1, writing: 0, recovery: 0 }, block: { kind: "attempt-limit" as const, reason: "Provider contract failure" } },
        ],
      },
      receipts: [{ schemaVersion: 3 as const, objectId: "object-0", attemptId: "attempt-preserved", artifactPath: `${workRoot}/${WORLD_BLUEPRINT_LAYERS[0]}/正文.md`, bodySha256: "body-preserved", imageTaskId: "image-preserved" }],
      research: [{ objectId: "object-1", schemaVersion: 7, criticalGaps: [{ beat: "旧 beat", reason: "旧缺口" }] }],
    }

    const migrated = migrateWorldV3ToV4Fixture(fixture)
    expect(migrated.schemaVersion).toBe(4)
    expect(migrated.layers).toEqual(fixture.layers)
    expect(migrated.relations).toEqual(fixture.relations)
    expect(migrated.receipts[0]).toMatchObject({ objectId: "object-0", attemptId: "attempt-preserved", artifactPath: fixture.receipts[0]!.artifactPath, bodySha256: "body-preserved", imageTaskId: "image-preserved" })
    expect(migrated.materialization.objects[1]).toMatchObject({ objectId: "object-1", status: "pending" })
    expect(migrated.materialization.objects[1]).not.toHaveProperty("block")
    expect(migrated.materialization.objects[2]).toMatchObject({ objectId: "object-2", status: "blocked", block: { kind: "attempt-limit" } })
    expect(migrated.research[0]).toMatchObject({ lifecycle: "historical" })
    expect(migrateWorldV3ToV4Fixture(migrated)).toEqual(migrated)
  })
  test("preserves completed bodies and V2 receipt identity while moving machine files", async () => {
    const value = await legacyFixture()
    const bodyBefore = await value.files.queries.readBytes(value.projectId, value.completed.plannedPath!)

    const manifest = await migrateLegacyWorldState({ projectFiles: value.files.queries, internalState: value.files.internal, projectId: value.projectId, goalId, root: workRoot })

    expect(manifest.status).toBe("committed")
    const state = await internalJson<{ schemaVersion: number; objects: Array<{ objectId: string; status: string; attempts: Record<string, number> }> }>(value.files, value.projectId, materializationStateKey(goalId))
    expect(state.schemaVersion).toBe(4)
    expect(state.objects).toEqual([
      expect.objectContaining({ objectId: value.completed.id, status: "completed", attempts: { research: 0, writing: 1, recovery: 0 } }),
      expect.objectContaining({ objectId: value.pending.id, status: "pending", attempts: { research: 0, writing: 0, recovery: 0 } }),
    ])
    const receipt = await internalJson<Record<string, unknown>>(value.files, value.projectId, materializationReceiptKey(goalId, value.completed.id))
    expect(receipt).toMatchObject({ schemaVersion: 3, phase: "writing", goalId, objectId: value.completed.id, bodySha256: sha256(bodyBefore), imageTaskId: "image-preserved" })
    expect(receipt.attemptId).toMatch(/^[0-9a-f]{64}$/u)
    expect(await value.files.queries.readBytes(value.projectId, value.completed.plannedPath!)).toEqual(bodyBefore)
    expect((await value.files.queries.refreshProject(value.projectId)).files.map((file) => file.relativePath).sort()).toEqual([
      value.completed.plannedPath!,
      `${workRoot}/世界基准.md`,
      `${workRoot}/资料索引.md`,
    ].sort())
    await expectContentMissing(value.files, value.projectId, `${workRoot}/世界蓝图/state.json`)
    await expectContentMissing(value.files, value.projectId, `${workRoot}/世界蓝图/materialization.json`)
    expect((await migrateLegacyWorldState({ projectFiles: value.files.queries, internalState: value.files.internal, projectId: value.projectId, goalId, root: workRoot })).status).toBe("committed")
  })

  test("retries idempotently after target-write and source-move crashes", async () => {
    for (const crashPhase of ["write", "move"] as const) {
      const value = await legacyFixture()
      let writes = 0
      let moves = 0
      const crashing: ProjectInternalStatePort = {
        readFile: value.files.internal.readFile,
        listDirectory: value.files.internal.listDirectory,
        writeFile: async (request) => {
          writes += 1
          if (crashPhase === "write" && writes === 5) throw new Error("simulated target-write crash")
          return value.files.internal.writeFile(request)
        },
        moveContentFileToBackup: async (...args) => {
          moves += 1
          if (crashPhase === "move" && moves === 4) throw new Error("simulated source-move crash")
          return value.files.internal.moveContentFileToBackup(...args)
        },
      }
      await expect(migrateLegacyWorldState({ projectFiles: value.files.queries, internalState: crashing, projectId: value.projectId, goalId, root: workRoot })).rejects.toThrow(`simulated ${crashPhase === "write" ? "target-write" : "source-move"} crash`)
      expect((await internalJson<{ status: string }>(value.files, value.projectId, migrationManifestKey(goalId))).status).toBe("prepared")

      const result = await migrateLegacyWorldState({ projectFiles: value.files.queries, internalState: value.files.internal, projectId: value.projectId, goalId, root: workRoot })
      expect(result.status).toBe("committed")
      expect((await internalJson<{ schemaVersion: number }>(value.files, value.projectId, blueprintStateKey(goalId))).schemaVersion).toBe(3)
      await expectContentMissing(value.files, value.projectId, `${workRoot}/世界蓝图/state.json`)
    }
  })
})

async function legacyFixture() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth migration "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const style: WorldStyleProfile = { schemaVersion: 1, narrativeDistance: "historical", register: "documentary", knowledgePosition: "retrospective", languageConventions: ["使用世界内部称呼"], forbiddenPatterns: [], sourceIds: ["user"] }
  const completed = entry("completed", "已完成规则", 1)
  const pending = entry("pending", "待完成规则", 2)
  const layers = WORLD_BLUEPRINT_LAYERS.map((layer, index) => ({
    schemaVersion: 3,
    layer,
    objects: index === 0 ? [group(layer, index), completed, pending] : [group(layer, index)],
  }) satisfies WorldBlueprintLayerDocument)
  const state = {
    schemaVersion: 3,
    root: workRoot,
    worldName: workRoot,
    route: "original",
    topicProfileKey: "classic-medieval-fantasy",
    topicProfileVersion: 1,
    worldStyleProfile: style,
    sources: [{ id: "user", kind: "user", locator: "用户目标", authority: "用户", summary: "迁移测试" }],
    direction: { worldPremise: "迁移世界", creativeDirection: "保留现场", tone: "克制", themes: ["恢复"], constraints: [], unresolvedQuestions: [] },
    ownerGoalId: goalId,
    acceptedGoalVersion: 4,
    revision: 1,
    status: "frozen",
    batches: [],
  }
  await contentJson(files, project.id, `${workRoot}/世界蓝图/state.json`, state)
  for (const layer of layers) await contentJson(files, project.id, `${workRoot}/${layer.layer}/蓝图.json`, layer)
  await contentJson(files, project.id, `${workRoot}/世界蓝图/relations.json`, { schemaVersion: 3, relations: [] })
  await contentJson(files, project.id, `${workRoot}/世界蓝图/index.json`, {
    schemaVersion: 3,
    root: workRoot,
    status: "frozen",
    layers: layers.map((layer) => ({ layer: layer.layer, path: `${workRoot}/${layer.layer}/蓝图.json`, objectCount: layer.objects.length, plannedPathCount: layer.objects.filter((object) => object.kind === "entry").length })),
    causalRelationCount: 0,
    crossLayerCausalRelationCount: 0,
  } satisfies WorldBlueprintIndexDocument)
  await content(files, project.id, `${workRoot}/世界基准.md`, "# 世界基准\n")
  await content(files, project.id, `${workRoot}/资料索引.md`, "# 资料索引\n")
  const completedContract = resolveWritingContract({ topicProfileKey: "classic-medieval-fantasy", worldStyleProfile: style, object: completed })
  const pendingContract = resolveWritingContract({ topicProfileKey: "classic-medieval-fantasy", worldStyleProfile: style, object: pending })
  const completedBody = `# 已完成规则\n\n${"这是一份迁移前已经完成、不得改写或丢失的正式世界规则正文。".repeat(20)}`
  await content(files, project.id, completed.plannedPath!, completedBody)
  await contentJson(files, project.id, `${workRoot}/世界蓝图/materialization.json`, {
    schemaVersion: 2,
    root: workRoot,
    goalId,
    objects: [
      { objectId: completed.id, layer: completed.layer, plannedPath: completed.plannedPath, status: "completed", writingContract: completedContract, writingContractHash: hashWritingContract(completedContract) },
      { objectId: pending.id, layer: pending.layer, plannedPath: pending.plannedPath, status: "pending", writingContract: pendingContract, writingContractHash: hashWritingContract(pendingContract) },
    ],
  })
  await contentJson(files, project.id, `${workRoot}/世界蓝图/物化回执/${completed.id}.json`, {
    schemaVersion: 2,
    goalId,
    goalVersion: 4,
    objectId: completed.id,
    writingContractHash: hashWritingContract(completedContract),
    bodySha256: sha256(new TextEncoder().encode(completedBody)),
    artifactPath: completed.plannedPath,
    sourcePaths: [`${workRoot}/世界基准.md`],
    imageTaskId: "image-preserved",
    summary: "迁移前已完成。",
  })
  await contentJson(files, project.id, `${workRoot}/世界蓝图/研究包/${completed.id}.json`, { schemaVersion: 7, objectId: completed.id, writingContractHash: hashWritingContract(completedContract) })
  await contentJson(files, project.id, `${workRoot}/关系/index.json`, { schemaVersion: 1, nodes: [], edges: [] })
  return { files, projectId: project.id, completed, pending }
}

function entry(key: string, title: string, order: number): WorldBlueprintObject & { kind: "entry"; plannedPath: string; genreKey: string } {
  return {
    id: `wbo_${key.padEnd(20, "0")}`,
    key,
    title,
    layer: WORLD_BLUEPRINT_LAYERS[0]!,
    kind: "entry",
    parentId: "group-0",
    plannedPath: `${workRoot}/${WORLD_BLUEPRINT_LAYERS[0]}/${title}.md`,
    genreKey: publicationGenreKeys(WORLD_BLUEPRINT_LAYERS[0]!)[0]!,
    locator: `${WORLD_BLUEPRINT_LAYERS[0]}｜${title}用于验证迁移保持对象身份`,
    order,
    status: "planned",
  }
}

function group(layer: string, index: number): WorldBlueprintObject {
  return { id: `group-${index}`, key: `group-${index}`, title: `${layer}分组`, layer: layer as WorldBlueprintObject["layer"], kind: "group", parentId: null, locator: `${layer}｜迁移测试分组`, order: 100, status: "planned" }
}

async function content(files: ProjectFileService, projectId: string, relativePath: string, body: string) {
  await files.commands.writeFile({ projectId, relativePath, content: body })
}

async function contentJson(files: ProjectFileService, projectId: string, relativePath: string, value: unknown) {
  await content(files, projectId, relativePath, `${JSON.stringify(value, undefined, 2)}\n`)
}

async function internalJson<T>(files: ProjectFileService, projectId: string, key: string) {
  const record = await files.internal.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
  if (!record) throw new Error(`missing internal migration state: ${key}`)
  return JSON.parse(new TextDecoder().decode(record.bytes)) as T
}

async function expectContentMissing(files: ProjectFileService, projectId: string, relativePath: string) {
  await expect(files.queries.readBytes(projectId, relativePath)).rejects.toThrow("file does not exist")
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}
