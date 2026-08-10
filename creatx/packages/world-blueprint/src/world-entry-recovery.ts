import type { ProjectInternalStatePort, ProjectInternalStateRecord } from "@creatx/project-files"
import {
  GROWTH_INTERNAL_NAMESPACE,
  blueprintIndexKey,
  blueprintLayerKey,
  blueprintRelationsKey,
  blueprintStateKey,
  goalWorldKey,
  materializationStateKey,
  worldOwnerKey,
} from "./internal-state.ts"
import { WORLD_BLUEPRINT_LAYERS, type WorldBlueprintStateDocument } from "./schema.ts"
import type { WorldMaterializationStateDocument } from "./materialization.ts"

const decoder = new TextDecoder()

export interface AdoptWorldSuccessorInput {
  projectId: string
  predecessorGoalId: string
  successorGoalId: string
  successorGoalVersion: number
  root: string
}

export interface AdoptWorldSuccessorResult {
  root: string
  blueprintStatus: WorldBlueprintStateDocument["status"]
  materializationObjectCount: number
  replayed: boolean
}

export interface AuthoritativeWorldEntry {
  root: string
  goalId: string
  blueprintStatus: WorldBlueprintStateDocument["status"]
  materializationObjectCount: number
}

export class WorldEntryRecoveryService {
  private readonly internalState: ProjectInternalStatePort

  constructor(internalState: ProjectInternalStatePort) {
    this.internalState = internalState
  }

  async inspectAuthoritativeWorlds(projectId: string): Promise<AuthoritativeWorldEntry[]> {
    const worlds = await this.internalState.listDirectory(projectId, GROWTH_INTERNAL_NAMESPACE, "worlds")
    if (!worlds) return []
    const owners = await Promise.all(worlds.entries.filter((entry) => entry.kind === "directory").map(async (entry) => {
      const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, `${entry.relativePath}/owner.json`)
      if (!record) throw new Error(`world_entry_invalid: world owner is missing under ${entry.relativePath}`)
      const parsed = requireAnyOwner(record)
      const state = await this.requireJson<WorldBlueprintStateDocument>(projectId, blueprintStateKey(parsed.goalId))
      if (state.schemaVersion !== 3 || state.root !== parsed.root || state.ownerGoalId !== parsed.goalId) {
        throw new Error("world_entry_invalid: authoritative world and blueprint identity disagree")
      }
      const materialization = await this.optionalJson<WorldMaterializationStateDocument>(projectId, materializationStateKey(parsed.goalId))
      if (materialization && (materialization.schemaVersion !== 4 || materialization.root !== parsed.root || materialization.goalId !== parsed.goalId || !Array.isArray(materialization.objects))) {
        throw new Error("world_entry_invalid: authoritative materialization identity is inconsistent")
      }
      return { root: parsed.root, goalId: parsed.goalId, blueprintStatus: state.status, materializationObjectCount: materialization?.objects.length ?? 0 }
    }))
    return owners.sort((left, right) => left.root.localeCompare(right.root, "zh-CN"))
  }

  async adoptSuccessor(input: AdoptWorldSuccessorInput): Promise<AdoptWorldSuccessorResult> {
    requireInput(input)
    const ownerKey = worldOwnerKey(input.root)
    const ownerRecord = await this.internalState.readFile(input.projectId, GROWTH_INTERNAL_NAMESPACE, ownerKey)
    if (!ownerRecord) throw new Error("world_entry_conflict: requested world has no authoritative owner")
    const owner = requireOwner(ownerRecord, input.root)
    if (owner.goalId === input.successorGoalId) return this.validateSuccessor(input, true)
    if (owner.goalId !== input.predecessorGoalId) {
      throw new Error("world_entry_conflict: predecessor Goal is not the authoritative world owner")
    }

    const source = await this.readWorldFiles(input.projectId, input.predecessorGoalId)
    requireSourceWorld(source, input)
    const destinationRoot = goalWorldKey(input.successorGoalId)
    const sourceRoot = goalWorldKey(input.predecessorGoalId)
    const prepared = source.map((record) => ({
      key: `${destinationRoot}${record.key.slice(sourceRoot.length)}`,
      content: rewriteGoalIdentity(record, input),
    }))
    for (const file of prepared) await this.ensureExact(input.projectId, file.key, file.content)
    const result = await this.validateSuccessor(input, false)
    await this.internalState.writeFile({
      projectId: input.projectId,
      namespace: GROWTH_INTERNAL_NAMESPACE,
      key: ownerKey,
      content: jsonText({ schemaVersion: 1, root: input.root, goalId: input.successorGoalId }),
      expectedModifiedAt: ownerRecord.modifiedAt,
    })
    return result
  }

  private async validateSuccessor(input: AdoptWorldSuccessorInput, replayed: boolean): Promise<AdoptWorldSuccessorResult> {
    const state = await this.requireJson<WorldBlueprintStateDocument>(input.projectId, blueprintStateKey(input.successorGoalId))
    if (state.schemaVersion !== 3 || state.root !== input.root || state.ownerGoalId !== input.successorGoalId || state.acceptedGoalVersion !== input.successorGoalVersion) {
      throw new Error("world_entry_invalid: successor blueprint identity is inconsistent")
    }
    await Promise.all([
      this.requireJson(input.projectId, blueprintIndexKey(input.successorGoalId)),
      this.requireJson(input.projectId, blueprintRelationsKey(input.successorGoalId)),
      ...WORLD_BLUEPRINT_LAYERS.map((layer) => this.requireJson(input.projectId, blueprintLayerKey(input.successorGoalId, layer))),
    ])
    const materialization = await this.optionalJson<WorldMaterializationStateDocument>(input.projectId, materializationStateKey(input.successorGoalId))
    if (materialization && (materialization.schemaVersion !== 4 || materialization.root !== input.root || materialization.goalId !== input.successorGoalId || !Array.isArray(materialization.objects))) {
      throw new Error("world_entry_invalid: successor materialization identity is inconsistent")
    }
    return { root: input.root, blueprintStatus: state.status, materializationObjectCount: materialization?.objects.length ?? 0, replayed }
  }

  private async readWorldFiles(projectId: string, goalId: string) {
    const root = goalWorldKey(goalId)
    const records: ProjectInternalStateRecord[] = []
    const visit = async (directory: string): Promise<void> => {
      const snapshot = await this.internalState.listDirectory(projectId, GROWTH_INTERNAL_NAMESPACE, directory)
      if (!snapshot) throw new Error(`world_entry_invalid: missing predecessor state directory ${directory}`)
      for (const entry of snapshot.entries) {
        if (entry.kind === "directory") {
          await visit(entry.relativePath)
          continue
        }
        const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, entry.relativePath)
        if (!record) throw new Error(`world_entry_invalid: predecessor state disappeared: ${entry.relativePath}`)
        records.push(record)
      }
    }
    await visit(root)
    return records.sort((left, right) => left.key.localeCompare(right.key, "en-US"))
  }

  private async ensureExact(projectId: string, key: string, content: string) {
    const existing = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (existing) {
      if (decoder.decode(existing.bytes) !== content) throw new Error(`world_entry_conflict: partial successor state differs at ${key}`)
      return
    }
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content, expectedModifiedAt: null })
  }

  private async requireJson<T>(projectId: string, key: string) {
    const value = await this.optionalJson<T>(projectId, key)
    if (!value) throw new Error(`world_entry_invalid: required successor state is missing: ${key}`)
    return value
  }

  private async optionalJson<T>(projectId: string, key: string) {
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (!record) return undefined
    try {
      return JSON.parse(decoder.decode(record.bytes)) as T
    } catch {
      throw new Error(`world_entry_invalid: internal state is not valid JSON: ${key}`)
    }
  }
}

function requireInput(input: AdoptWorldSuccessorInput) {
  for (const [name, value] of Object.entries({ projectId: input.projectId, predecessorGoalId: input.predecessorGoalId, successorGoalId: input.successorGoalId, root: input.root })) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`world_entry_invalid: ${name} is required`)
  }
  if (input.predecessorGoalId === input.successorGoalId) throw new Error("world_entry_invalid: successor Goal must differ from predecessor")
  if (!Number.isSafeInteger(input.successorGoalVersion) || input.successorGoalVersion < 1) throw new Error("world_entry_invalid: successor Goal version is invalid")
}

function requireOwner(record: ProjectInternalStateRecord, root: string) {
  const value = requireAnyOwner(record)
  if (value.root !== root) throw new Error("world_entry_invalid: world ownership record is corrupt")
  return value
}

function requireAnyOwner(record: ProjectInternalStateRecord) {
  try {
    const value = JSON.parse(decoder.decode(record.bytes)) as { schemaVersion?: unknown; root?: unknown; goalId?: unknown }
    if (value.schemaVersion !== 1 || typeof value.root !== "string" || !value.root || typeof value.goalId !== "string" || !value.goalId) throw new Error()
    return value as { schemaVersion: 1; root: string; goalId: string }
  } catch {
    throw new Error("world_entry_invalid: world ownership record is corrupt")
  }
}

function requireSourceWorld(records: ProjectInternalStateRecord[], input: AdoptWorldSuccessorInput) {
  const stateRecord = records.find((record) => record.key === blueprintStateKey(input.predecessorGoalId))
  if (!stateRecord) throw new Error("world_entry_invalid: predecessor blueprint state is missing")
  try {
    const state = JSON.parse(decoder.decode(stateRecord.bytes)) as WorldBlueprintStateDocument
    if (state.schemaVersion !== 3 || state.root !== input.root || state.ownerGoalId !== input.predecessorGoalId) throw new Error()
  } catch {
    throw new Error("world_entry_invalid: predecessor blueprint identity is inconsistent")
  }
}

function rewriteGoalIdentity(record: ProjectInternalStateRecord, input: AdoptWorldSuccessorInput) {
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(record.bytes))
  } catch {
    throw new Error(`world_entry_invalid: predecessor state is not valid JSON: ${record.key}`)
  }
  const rewrite = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => rewrite(item))
    if (!value || typeof value !== "object") {
      if ((key === "goalId" || key === "ownerGoalId") && value === input.predecessorGoalId) return input.successorGoalId
      if ((key === "acceptedGoalVersion" || key === "goalVersion") && typeof value === "number") return input.successorGoalVersion
      return value
    }
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, rewrite(child, childKey)]))
  }
  return jsonText(rewrite(parsed))
}

function jsonText(value: unknown) {
  return `${JSON.stringify(value, undefined, 2)}\n`
}
