import type { GrowthGoalProjection, GrowthWorldEntryMode, GrowthWorldEntryStage } from "@creatx/contracts"
import type { AuthoritativeWorldEntry } from "@creatx/world-blueprint"

export interface GrowthWorldEntryDecision {
  mode: GrowthWorldEntryMode
  stage: GrowthWorldEntryStage
  workRootPath?: string
  predecessorGoalId?: string
}

export function resolveGrowthWorldEntry(input: {
  projectId: string
  worlds: AuthoritativeWorldEntry[]
  hasProjectContent: boolean
  ownerGoal?: GrowthGoalProjection
}): GrowthWorldEntryDecision {
  if (!input.worlds.length) return { mode: input.hasProjectContent ? "reconcile" : "create", stage: "blueprint-create" }
  if (input.worlds.length > 1) throw new Error("world_entry_conflict: project has multiple authoritative worlds; choose one before continuing")
  const world = input.worlds[0]!
  const predecessor = input.ownerGoal
  if (!predecessor || predecessor.goalId !== world.goalId) throw new Error("world_entry_conflict: authoritative world owner Goal is unavailable")
  if (predecessor.projectId !== input.projectId || predecessor.workRootPath !== world.root) throw new Error("world_entry_conflict: authoritative Goal and world root disagree")
  if (predecessor.status === "active" || predecessor.status === "paused" || predecessor.status === "waiting") {
    throw new Error("world_entry_conflict: authoritative world still belongs to an unterminated Goal")
  }
  const stage = world.blueprintStatus === "draft" ? "blueprint-create" : world.blueprintStatus === "review" ? "blueprint-review" : "materialization"
  return { mode: "continue", stage, workRootPath: world.root, predecessorGoalId: predecessor.goalId }
}

export function isReplaceableLegacyWorldGoal(input: {
  current: GrowthGoalProjection
  worlds: AuthoritativeWorldEntry[]
  ownerGoal?: GrowthGoalProjection
}) {
  if (input.current.status !== "waiting" || input.current.workRootPath || input.current.worldEntryMode || input.current.worldEntryStage) return false
  if (input.worlds.length !== 1 || input.worlds[0]!.goalId === input.current.goalId) return false
  const owner = input.ownerGoal
  if (!owner || owner.goalId !== input.worlds[0]!.goalId || owner.projectId !== input.current.projectId || owner.workRootPath !== input.worlds[0]!.root) return false
  return owner.status === "completed" || owner.status === "cancelled" || owner.status === "failed"
}
