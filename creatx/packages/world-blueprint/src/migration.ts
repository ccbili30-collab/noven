import { createHash } from "node:crypto"
import type { ProjectFileQueryPort, ProjectInternalStatePort } from "@creatx/project-files"
import {
  blueprintIndexKey,
  blueprintLayerKey,
  blueprintRelationsKey,
  blueprintStateKey,
  GROWTH_INTERNAL_NAMESPACE,
  materializationReceiptKey,
  materializationRelationsKey,
  materializationResearchKey,
  materializationStateKey,
  migrationBackupKey,
  migrationManifestKey,
  worldOwnerKey,
} from "./internal-state.ts"
import { parseJson, WORLD_BLUEPRINT_LAYERS, type WorldBlueprintStateDocument } from "./schema.ts"
import type { WorldMaterializationObjectState, WorldMaterializationReceipt, WorldMaterializationStateDocument } from "./materialization.ts"

const decoder = new TextDecoder()
const encoder = new TextEncoder()

interface GrowthMigrationEntry {
  sourcePath?: string
  sourceSha256?: string
  backupKey?: string
  targetKey: string
  targetSha256: string
  transform: "copy" | "materialization-v2" | "receipt-v2" | "world-owner"
}

export interface GrowthMigrationManifest {
  schemaVersion: 1
  goalId: string
  root: string
  status: "prepared" | "committed"
  entries: GrowthMigrationEntry[]
}

export async function migrateLegacyWorldState(input: {
  projectFiles: ProjectFileQueryPort
  internalState: ProjectInternalStatePort
  projectId: string
  goalId: string
  root: string
}) {
  const manifestKey = migrationManifestKey(input.goalId)
  const existingManifest = await readInternalJson<GrowthMigrationManifest>(input, manifestKey)
  if (existingManifest?.status === "committed") return existingManifest
  const manifest = existingManifest ?? await prepareManifest(input, manifestKey)
  requireManifestIdentity(manifest, input.goalId, input.root)

  for (const entry of manifest.entries) {
    const target = await input.internalState.readFile(input.projectId, GROWTH_INTERNAL_NAMESPACE, entry.targetKey)
    if (target) {
      if (sha256(target.bytes) !== entry.targetSha256) throw new Error(`growth_migration_conflict: internal target changed: ${entry.targetKey}`)
      continue
    }
    const content = await targetContent(input, entry)
    if (sha256(content) !== entry.targetSha256) throw new Error(`growth_migration_conflict: regenerated target hash differs: ${entry.targetKey}`)
    await input.internalState.writeFile({ projectId: input.projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key: entry.targetKey, content, expectedModifiedAt: null })
  }

  for (const entry of manifest.entries) {
    if (!entry.sourcePath || !entry.sourceSha256 || !entry.backupKey) continue
    await input.internalState.moveContentFileToBackup(input.projectId, entry.sourcePath, GROWTH_INTERNAL_NAMESPACE, entry.backupKey, entry.sourceSha256)
  }

  const current = await input.internalState.readFile(input.projectId, GROWTH_INTERNAL_NAMESPACE, manifestKey)
  if (!current) throw new Error("growth_migration_conflict: prepared migration manifest disappeared")
  const committed = { ...manifest, status: "committed" as const }
  await input.internalState.writeFile({
    projectId: input.projectId,
    namespace: GROWTH_INTERNAL_NAMESPACE,
    key: manifestKey,
    content: jsonBytes(committed),
    expectedModifiedAt: current.modifiedAt,
  })
  return committed
}

async function prepareManifest(input: Parameters<typeof migrateLegacyWorldState>[0], manifestKey: string) {
  const legacyStatePath = `${input.root}/世界蓝图/state.json`
  const legacyState = parseJson<WorldBlueprintStateDocument>(decoder.decode(await requireContentBytes(input, legacyStatePath)))
  if (!legacyState || legacyState.schemaVersion !== 3 || legacyState.root !== input.root || legacyState.status !== "frozen") {
    throw new Error("growth_migration_invalid: legacy world must contain a frozen V3 blueprint")
  }
  if (legacyState.ownerGoalId !== input.goalId) throw new Error("growth_migration_conflict: legacy blueprint belongs to another Growth Goal")

  const sources: Array<{ sourcePath: string; targetKey: string; transform: GrowthMigrationEntry["transform"] }> = [
    { sourcePath: legacyStatePath, targetKey: blueprintStateKey(input.goalId), transform: "copy" as const },
    { sourcePath: `${input.root}/世界蓝图/index.json`, targetKey: blueprintIndexKey(input.goalId), transform: "copy" as const },
    { sourcePath: `${input.root}/世界蓝图/relations.json`, targetKey: blueprintRelationsKey(input.goalId), transform: "copy" as const },
    ...WORLD_BLUEPRINT_LAYERS.map((layer) => ({ sourcePath: `${input.root}/${layer}/蓝图.json`, targetKey: blueprintLayerKey(input.goalId, layer), transform: "copy" as const })),
  ]
  const materializationPath = `${input.root}/世界蓝图/materialization.json`
  if (await contentExists(input, materializationPath)) sources.push({ sourcePath: materializationPath, targetKey: materializationStateKey(input.goalId), transform: "materialization-v2" as const })
  for (const objectId of await jsonFileIds(input, `${input.root}/世界蓝图/研究包`)) {
    sources.push({ sourcePath: `${input.root}/世界蓝图/研究包/${objectId}.json`, targetKey: materializationResearchKey(input.goalId, objectId), transform: "copy" as const })
  }
  for (const objectId of await jsonFileIds(input, `${input.root}/世界蓝图/物化回执`)) {
    sources.push({ sourcePath: `${input.root}/世界蓝图/物化回执/${objectId}.json`, targetKey: materializationReceiptKey(input.goalId, objectId), transform: "receipt-v2" as const })
  }
  const relationsPath = `${input.root}/关系/index.json`
  if (await contentExists(input, relationsPath)) sources.push({ sourcePath: relationsPath, targetKey: materializationRelationsKey(input.goalId), transform: "copy" as const })

  const entries: GrowthMigrationEntry[] = []
  for (const source of sources) {
    const sourceBytes = await requireContentBytes(input, source.sourcePath)
    const content = transformContent(source.transform, sourceBytes, input.goalId)
    entries.push({
      ...source,
      sourceSha256: sha256(sourceBytes),
      backupKey: migrationBackupKey(input.goalId, source.sourcePath),
      targetSha256: sha256(content),
    })
  }
  const ownerContent = jsonBytes({ schemaVersion: 1, root: input.root, goalId: input.goalId })
  entries.push({ targetKey: worldOwnerKey(input.root), targetSha256: sha256(ownerContent), transform: "world-owner" })
  const manifest: GrowthMigrationManifest = { schemaVersion: 1, goalId: input.goalId, root: input.root, status: "prepared", entries }
  await input.internalState.writeFile({ projectId: input.projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key: manifestKey, content: jsonBytes(manifest), expectedModifiedAt: null })
  return manifest
}

async function targetContent(input: Parameters<typeof migrateLegacyWorldState>[0], entry: GrowthMigrationEntry) {
  if (entry.transform === "world-owner") return jsonBytes({ schemaVersion: 1, root: input.root, goalId: input.goalId })
  if (!entry.sourcePath || !entry.sourceSha256 || !entry.backupKey) throw new Error("growth_migration_invalid: source-backed manifest entry is incomplete")
  const source = await readContentBytes(input, entry.sourcePath)
  const bytes = source ?? (await input.internalState.readFile(input.projectId, GROWTH_INTERNAL_NAMESPACE, entry.backupKey))?.bytes
  if (!bytes || sha256(bytes) !== entry.sourceSha256) throw new Error(`growth_migration_conflict: legacy source changed or disappeared: ${entry.sourcePath}`)
  return transformContent(entry.transform, bytes, input.goalId)
}

function transformContent(transform: GrowthMigrationEntry["transform"], bytes: Uint8Array, goalId: string) {
  if (transform === "copy") return bytes
  if (transform === "materialization-v2") return jsonBytes(convertMaterialization(bytes, goalId))
  if (transform === "receipt-v2") return jsonBytes(convertReceipt(bytes, goalId))
  throw new Error(`growth_migration_invalid: unsupported source transform: ${transform}`)
}

function convertMaterialization(bytes: Uint8Array, goalId: string): WorldMaterializationStateDocument {
  const legacy = parseJson<{ schemaVersion: number; root: string; goalId: string; objects: Array<Omit<WorldMaterializationObjectState, "attempts"> & { status: string }> }>(decoder.decode(bytes))
  if (!legacy || legacy.schemaVersion !== 2 || legacy.goalId !== goalId || !Array.isArray(legacy.objects)) throw new Error("growth_migration_invalid: legacy materialization must be V2 and belong to this Goal")
  return {
    schemaVersion: 4,
    root: legacy.root,
    goalId,
    objects: legacy.objects.map((object) => {
      const status = migratedStatus(object.status)
      const phase = object.status === "researching" ? "research" : object.status === "writing" ? "writing" : "recovery"
      const attempts = { research: object.status === "researching" ? 1 : 0, writing: object.status === "completed" || object.status === "writing" ? 1 : 0, recovery: 0 }
      return {
        objectId: object.objectId,
        layer: object.layer,
        plannedPath: object.plannedPath,
        status,
        writingContract: object.writingContract,
        writingContractHash: object.writingContractHash,
        attempts,
        ...(["researching", "writing"].includes(object.status) ? { lastError: { phase, message: "Legacy Worker ended before durable phase completion during V2 migration" } } : {}),
      }
    }),
  }
}

function convertReceipt(bytes: Uint8Array, goalId: string): Omit<WorldMaterializationReceipt, "schemaVersion" | "extractionSha256"> & { schemaVersion: 3 } {
  const legacy = parseJson<Omit<WorldMaterializationReceipt, "schemaVersion" | "attemptId" | "phase"> & { schemaVersion: number }>(decoder.decode(bytes))
  if (!legacy || legacy.schemaVersion !== 2 || legacy.goalId !== goalId) throw new Error("growth_migration_invalid: legacy materialization receipt must be V2 and belong to this Goal")
  return { ...legacy, schemaVersion: 3, attemptId: migratedAttemptId(goalId, legacy.objectId), phase: "writing" }
}

function migratedStatus(status: string): WorldMaterializationObjectState["status"] {
  if (["pending", "ready", "completed", "unknown"].includes(status)) return status as WorldMaterializationObjectState["status"]
  if (["researching", "writing", "running"].includes(status)) return "retryable"
  throw new Error(`growth_migration_invalid: unsupported V2 object status: ${status}`)
}

function migratedAttemptId(goalId: string, objectId: string) {
  return createHash("sha256").update(`${goalId}\0${objectId}\0v2-receipt-migration`).digest("hex")
}

async function jsonFileIds(input: Parameters<typeof migrateLegacyWorldState>[0], directory: string) {
  const snapshot = await input.projectFiles.listDirectory(input.projectId, directory, "content")
  return snapshot?.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map((entry) => entry.name.slice(0, -5)) ?? []
}

async function requireContentBytes(input: Parameters<typeof migrateLegacyWorldState>[0], relativePath: string) {
  const bytes = await readContentBytes(input, relativePath)
  if (!bytes) throw new Error(`growth_migration_invalid: required legacy file is missing: ${relativePath}`)
  return bytes
}

async function readContentBytes(input: Parameters<typeof migrateLegacyWorldState>[0], relativePath: string) {
  try {
    return await input.projectFiles.readBytes(input.projectId, relativePath)
  } catch (error) {
    if (error instanceof Error && error.message.includes("file does not exist")) return undefined
    throw error
  }
}

async function contentExists(input: Parameters<typeof migrateLegacyWorldState>[0], relativePath: string) {
  return Boolean(await readContentBytes(input, relativePath))
}

async function readInternalJson<T>(input: Parameters<typeof migrateLegacyWorldState>[0], key: string) {
  const record = await input.internalState.readFile(input.projectId, GROWTH_INTERNAL_NAMESPACE, key)
  if (!record) return undefined
  return parseJson<T>(decoder.decode(record.bytes))
}

function requireManifestIdentity(manifest: GrowthMigrationManifest, goalId: string, root: string) {
  if (manifest.schemaVersion !== 1 || manifest.goalId !== goalId || manifest.root !== root || !Array.isArray(manifest.entries)) {
    throw new Error("growth_migration_conflict: migration manifest identity is invalid")
  }
}

function jsonBytes(value: unknown) {
  return encoder.encode(`${JSON.stringify(value, undefined, 2)}\n`)
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

export interface WorldV3ToV4Fixture {
  schemaVersion: 3 | 4
  layers: unknown[]
  relations: unknown[]
  materialization: {
    schemaVersion: 3 | 4
    root: string
    goalId: string
    objects: Array<Record<string, unknown> & { objectId: string; status: string; block?: { kind?: string; reason?: string } }>
  }
  receipts: Array<Record<string, unknown>>
  research: Array<Record<string, unknown>>
}

export function migrateWorldV3ToV4Fixture(input: WorldV3ToV4Fixture) {
  if (input.schemaVersion === 4) return input
  if (input.schemaVersion !== 3 || input.materialization.schemaVersion !== 3) throw new Error("growth_migration_invalid: fixture must be V3 or an exact V4 replay")
  return {
    schemaVersion: 4 as const,
    layers: input.layers.map((layer) => structuredClone(layer)),
    relations: input.relations.map((relation) => structuredClone(relation)),
    materialization: migrateWorldMaterializationV3ToV4(input.materialization),
    receipts: input.receipts.map((receipt) => ({ ...structuredClone(receipt), schemaVersion: 4 as const })),
    research: input.research.map((research) => ({ ...structuredClone(research), lifecycle: "historical" as const })),
  }
}

export function migrateWorldMaterializationV3ToV4<TObject extends { status: string; block?: { kind?: string } }>(input: { schemaVersion: 3 | 4; root: string; goalId: string; objects: TObject[] }): { schemaVersion: 4; root: string; goalId: string; objects: TObject[] } {
  if (input.schemaVersion === 4) return input as { schemaVersion: 4; root: string; goalId: string; objects: TObject[] }
  const migrated = structuredClone(input)
  return {
    ...migrated,
    schemaVersion: 4,
    objects: migrated.objects.map((object) => {
      if (object.status !== "blocked" || object.block?.kind !== "critical-gap") return object
      const { block: _block, lastError: _lastError, attempt: _attempt, ...preserved } = object as typeof object & { lastError?: unknown; attempt?: unknown }
      return { ...preserved, status: "pending" } as TObject
    }),
  }
}
