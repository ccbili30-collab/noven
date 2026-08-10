import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import {
  GROWTH_INTERNAL_NAMESPACE,
  WORLD_BLUEPRINT_LAYERS,
  WorldEntryRecoveryService,
  blueprintIndexKey,
  blueprintLayerKey,
  blueprintRelationsKey,
  blueprintStateKey,
  materializationBriefKey,
  materializationExtractionKey,
  materializationReceiptKey,
  materializationRelationsKey,
  materializationStateKey,
  worldOwnerKey,
} from "../src"

const roots: string[] = []
const decoder = new TextDecoder()

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("adopts a terminal Goal world into a successor namespace without changing predecessor evidence", async () => {
  const value = await setup()
  const recovery = new WorldEntryRecoveryService(value.files.internal)
  await expect(recovery.inspectAuthoritativeWorlds(value.projectId)).resolves.toEqual([{
    root: "魔禁整理",
    goalId: "goal-old",
    blueprintStatus: "frozen",
    materializationObjectCount: 1,
  }])
  const result = await recovery.adoptSuccessor({
    projectId: value.projectId,
    predecessorGoalId: "goal-old",
    successorGoalId: "goal-new",
    successorGoalVersion: 1,
    root: "魔禁整理",
  })

  expect(result).toEqual({ root: "魔禁整理", blueprintStatus: "frozen", materializationObjectCount: 1, replayed: false })
  expect(await readJson(value, blueprintStateKey("goal-old"))).toMatchObject({ ownerGoalId: "goal-old", acceptedGoalVersion: 9 })
  expect(await readJson(value, blueprintStateKey("goal-new"))).toMatchObject({ ownerGoalId: "goal-new", acceptedGoalVersion: 1 })
  expect(await readJson(value, materializationStateKey("goal-new"))).toMatchObject({ goalId: "goal-new", root: "魔禁整理" })
  expect(await readJson(value, materializationReceiptKey("goal-new", "object-1"))).toMatchObject({ goalId: "goal-new", goalVersion: 1 })
  expect(await readJson(value, worldOwnerKey("魔禁整理"))).toEqual({ schemaVersion: 1, root: "魔禁整理", goalId: "goal-new" })

  await expect(recovery.adoptSuccessor({
    projectId: value.projectId,
    predecessorGoalId: "goal-old",
    successorGoalId: "goal-new",
    successorGoalVersion: 1,
    root: "魔禁整理",
  })).resolves.toEqual({ root: "魔禁整理", blueprintStatus: "frozen", materializationObjectCount: 1, replayed: true })
})

test("does not change world ownership when successor copying fails", async () => {
  const value = await setup()
  let writes = 0
  const recovery = new WorldEntryRecoveryService({
    ...value.files.internal,
    writeFile: async (request) => {
      writes += 1
      if (writes === 3) throw new Error("simulated storage failure")
      return value.files.internal.writeFile(request)
    },
  })

  await expect(recovery.adoptSuccessor({
    projectId: value.projectId,
    predecessorGoalId: "goal-old",
    successorGoalId: "goal-new",
    successorGoalVersion: 1,
    root: "魔禁整理",
  })).rejects.toThrow(/simulated storage failure/)
  expect(await readJson(value, worldOwnerKey("魔禁整理"))).toEqual({ schemaVersion: 1, root: "魔禁整理", goalId: "goal-old" })
})

test("fails closed when the requested predecessor is not the authoritative world owner", async () => {
  const value = await setup()
  const recovery = new WorldEntryRecoveryService(value.files.internal)
  await expect(recovery.adoptSuccessor({
    projectId: value.projectId,
    predecessorGoalId: "another-goal",
    successorGoalId: "goal-new",
    successorGoalVersion: 1,
    root: "魔禁整理",
  })).rejects.toThrow(/world_entry_conflict/)
  expect(await value.files.internal.readFile(value.projectId, GROWTH_INTERNAL_NAMESPACE, blueprintStateKey("goal-new"))).toBeUndefined()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX world entry "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const write = (key: string, value: unknown) => files.internal.writeFile({
    projectId: project.id,
    namespace: GROWTH_INTERNAL_NAMESPACE,
    key,
    content: `${JSON.stringify(value)}\n`,
    expectedModifiedAt: null,
  })
  await write(worldOwnerKey("魔禁整理"), { schemaVersion: 1, root: "魔禁整理", goalId: "goal-old" })
  await write(blueprintStateKey("goal-old"), {
    schemaVersion: 3,
    root: "魔禁整理",
    worldName: "魔禁整理",
    route: "fanwork",
    ownerGoalId: "goal-old",
    acceptedGoalVersion: 9,
    status: "frozen",
    batches: [],
  })
  await write(blueprintIndexKey("goal-old"), { schemaVersion: 3, root: "魔禁整理", status: "frozen", layers: [], causalRelationCount: 0, crossLayerCausalRelationCount: 0 })
  await write(blueprintRelationsKey("goal-old"), { schemaVersion: 3, relations: [] })
  for (const layer of WORLD_BLUEPRINT_LAYERS) await write(blueprintLayerKey("goal-old", layer), { schemaVersion: 3, layer, objects: [] })
  await write(materializationStateKey("goal-old"), {
    schemaVersion: 4,
    root: "魔禁整理",
    goalId: "goal-old",
    objects: [{ objectId: "object-1", layer: WORLD_BLUEPRINT_LAYERS[0], plannedPath: "魔禁整理/核心规则与边界/魔法.md", status: "completed" }],
  })
  await write(materializationBriefKey("goal-old", "object-1"), { schemaVersion: 4, objectId: "object-1", purpose: "保留既有魔法正文", materialPaths: [], lockedFacts: [], genreSuggestions: { primary: "设定规则书", alternatives: [], techniques: [], avoid: [] } })
  await write(materializationExtractionKey("goal-old", "object-1"), { schemaVersion: 4, objectId: "object-1", bodySha256: "fixture", facts: [], relations: [], contradictions: [], lockedFactConflicts: [] })
  await write(materializationReceiptKey("goal-old", "object-1"), { schemaVersion: 4, goalId: "goal-old", goalVersion: 9, objectId: "object-1", extractionSha256: "fixture" })
  await write(materializationRelationsKey("goal-old"), { schemaVersion: 1, root: "魔禁整理", relations: [] })
  return { files, projectId: project.id }
}

async function readJson(value: Awaited<ReturnType<typeof setup>>, key: string) {
  const record = await value.files.internal.readFile(value.projectId, GROWTH_INTERNAL_NAMESPACE, key)
  if (!record) throw new Error(`missing ${key}`)
  return JSON.parse(decoder.decode(record.bytes)) as Record<string, unknown>
}
