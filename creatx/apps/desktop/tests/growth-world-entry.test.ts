import { describe, expect, test } from "bun:test"
import { isReplaceableLegacyWorldGoal, resolveGrowthWorldEntry } from "../src/growth-world-entry.ts"

const predecessor = {
  goalId: "goal-old",
  projectId: "project-1",
  sessionId: "session-1",
  instruction: "旧世界",
  status: "cancelled" as const,
  workRootPath: "魔禁整理",
  requiredImageTaskIds: [],
  createdAt: "2026-08-01",
  updatedAt: "2026-08-02",
  version: 10,
}

describe("Growth World Pro entry resolution", () => {
  test("creates in an empty project and reconciles existing unowned content", () => {
    expect(resolveGrowthWorldEntry({ projectId: "project-1", worlds: [], hasProjectContent: false })).toEqual({ mode: "create", stage: "blueprint-create" })
    expect(resolveGrowthWorldEntry({ projectId: "project-1", worlds: [], hasProjectContent: true })).toEqual({ mode: "reconcile", stage: "blueprint-create" })
  })

  test("continues the one authoritative world from its persisted blueprint phase", () => {
    expect(resolveGrowthWorldEntry({
      worlds: [{ root: "魔禁整理", goalId: "goal-old", blueprintStatus: "frozen", materializationObjectCount: 124 }],
      projectId: "project-1",
      hasProjectContent: true,
      ownerGoal: predecessor,
    })).toEqual({ mode: "continue", stage: "materialization", workRootPath: "魔禁整理", predecessorGoalId: "goal-old" })
  })

  test("fails closed for ambiguous worlds or a live owner", () => {
    expect(() => resolveGrowthWorldEntry({
      worlds: [
        { root: "甲", goalId: "goal-a", blueprintStatus: "frozen", materializationObjectCount: 1 },
        { root: "乙", goalId: "goal-b", blueprintStatus: "frozen", materializationObjectCount: 1 },
      ],
      projectId: "project-1",
      hasProjectContent: true,
    })).toThrow(/world_entry_conflict/)
    expect(() => resolveGrowthWorldEntry({
      worlds: [{ root: "魔禁整理", goalId: "goal-old", blueprintStatus: "frozen", materializationObjectCount: 124 }],
      projectId: "project-1",
      hasProjectContent: true,
      ownerGoal: { ...predecessor, status: "waiting" },
    })).toThrow(/world_entry_conflict/)
  })

  test("recognizes only the pre-entry waiting Goal that collided with an older authoritative world", () => {
    const worlds = [{ root: "魔禁整理", goalId: "goal-old", blueprintStatus: "frozen" as const, materializationObjectCount: 124 }]
    const { workRootPath: _workRootPath, ...withoutRoot } = predecessor
    const orphan = { ...withoutRoot, goalId: "goal-bad", status: "waiting" as const }
    expect(isReplaceableLegacyWorldGoal({ current: orphan, worlds, ownerGoal: predecessor })).toBe(true)
    expect(isReplaceableLegacyWorldGoal({ current: { ...orphan, worldEntryMode: "continue" }, worlds, ownerGoal: predecessor })).toBe(false)
    expect(isReplaceableLegacyWorldGoal({ current: { ...orphan, status: "paused" }, worlds, ownerGoal: predecessor })).toBe(false)
  })
})
