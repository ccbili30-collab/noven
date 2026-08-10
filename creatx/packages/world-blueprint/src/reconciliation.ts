export type WorldReconciliationCoverage = "existing" | "partial" | "conflicting" | "missing"

export interface WorldReconciliationMapping {
  objectId: string
  objectKey: string
  coverage: WorldReconciliationCoverage
  sourcePaths: string[]
  note: string
}

export interface WorldReconciliationManifest {
  schemaVersion: 1
  goalId: string
  root: string
  mappings: WorldReconciliationMapping[]
  batches: Array<{ batchId: string; payloadHash: string }>
}

export function reconciliationCoverageSummary(manifest: WorldReconciliationManifest) {
  return {
    existing: manifest.mappings.filter((mapping) => mapping.coverage === "existing").length,
    partial: manifest.mappings.filter((mapping) => mapping.coverage === "partial").length,
    conflicting: manifest.mappings.filter((mapping) => mapping.coverage === "conflicting").length,
    missing: manifest.mappings.filter((mapping) => mapping.coverage === "missing").length,
  }
}
