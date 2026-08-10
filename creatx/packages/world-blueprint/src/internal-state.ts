import { createHash } from "node:crypto"
import type { WorldBlueprintLayer } from "./schema.ts"
import { WORLD_BLUEPRINT_LAYERS } from "./schema.ts"

export const GROWTH_INTERNAL_NAMESPACE = "growth"

export function blueprintStateKey(goalId: string) {
  return `${goalRoot(goalId)}/world/blueprint/state.json`
}

export function worldOwnerKey(root: string) {
  return `worlds/${createHash("sha256").update(root.replaceAll("\\", "/").toLocaleLowerCase("en-US")).digest("hex")}/owner.json`
}

export function blueprintIndexKey(goalId: string) {
  return `${goalRoot(goalId)}/world/blueprint/index.json`
}

export function blueprintRelationsKey(goalId: string) {
  return `${goalRoot(goalId)}/world/blueprint/relations.json`
}

export function blueprintLayerKey(goalId: string, layer: WorldBlueprintLayer) {
  const index = WORLD_BLUEPRINT_LAYERS.indexOf(layer)
  if (index < 0) throw new Error(`blueprint_invalid: unknown world layer: ${layer}`)
  return `${goalRoot(goalId)}/world/blueprint/layers/${String(index + 1).padStart(2, "0")}.json`
}

export function blueprintReconciliationKey(goalId: string) {
  return `${goalRoot(goalId)}/world/blueprint/reconciliation.json`
}

export function blueprintInternalKey(goalId: string, relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/")
  if (normalized.endsWith("/世界蓝图/state.json")) return blueprintStateKey(goalId)
  if (normalized.endsWith("/世界蓝图/index.json")) return blueprintIndexKey(goalId)
  if (normalized.endsWith("/世界蓝图/relations.json")) return blueprintRelationsKey(goalId)
  const layer = WORLD_BLUEPRINT_LAYERS.find((candidate) => normalized.endsWith(`/${candidate}/蓝图.json`))
  if (layer) return blueprintLayerKey(goalId, layer)
  throw new Error(`blueprint_invalid: unsupported blueprint machine path: ${relativePath}`)
}

export function materializationStateKey(goalId: string) {
  return `${goalRoot(goalId)}/world/materialization/state.json`
}

export function materializationResearchKey(goalId: string, objectId: string) {
  return `${goalRoot(goalId)}/world/materialization/research/${safeSegment(objectId, "object ID")}.json`
}

export function materializationBriefKey(goalId: string, objectId: string) {
  return `${goalRoot(goalId)}/world/materialization/briefs/${safeSegment(objectId, "object ID")}.json`
}

export function materializationExtractionKey(goalId: string, objectId: string) {
  return `${goalRoot(goalId)}/world/materialization/extractions/${safeSegment(objectId, "object ID")}.json`
}

export function materializationReceiptKey(goalId: string, objectId: string) {
  return `${goalRoot(goalId)}/world/materialization/receipts/${safeSegment(objectId, "object ID")}.json`
}

export function materializationRelationsKey(goalId: string) {
  return `${goalRoot(goalId)}/world/materialization/relations.json`
}

export function migrationManifestKey(goalId: string) {
  return `${goalRoot(goalId)}/world/migration/manifest.json`
}

export function migrationBackupKey(goalId: string, relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/").split("/").filter(Boolean)
  if (!normalized.length || normalized.some((part) => part === "." || part === "..")) throw new Error("growth_migration_invalid: backup path is invalid")
  return `${goalRoot(goalId)}/world/migration-backup/${normalized.map(encodeURIComponent).join("/")}`
}

export function goalWorldKey(goalId: string) {
  return `${goalRoot(goalId)}/world`
}

function goalRoot(goalId: string) {
  return `goals/${safeSegment(goalId, "Growth Goal ID")}`
}

function safeSegment(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new Error(`growth_internal_invalid: ${label} is not a safe path segment`)
  }
  return encodeURIComponent(trimmed)
}
