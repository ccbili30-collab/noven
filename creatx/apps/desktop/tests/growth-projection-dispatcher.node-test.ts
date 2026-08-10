import assert from "node:assert/strict"
import test from "node:test"
import { GrowthProjectionDispatcher } from "../src/growth-projection-dispatcher.ts"

test("coalesces progress bursts and always projects the latest Goal", async () => {
  let releaseFirst!: () => void
  const firstProjection = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const projected: number[] = []
  const dispatcher = new GrowthProjectionDispatcher<{ goalId: string; completed: number }>(async (goal) => {
    projected.push(goal.completed)
    if (projected.length === 1) await firstProjection
  }, (error) => assert.fail(String(error)))

  dispatcher.enqueue({ goalId: "goal-1", completed: 1 })
  for (let completed = 2; completed <= 181; completed += 1) dispatcher.enqueue({ goalId: "goal-1", completed })
  releaseFirst()
  await dispatcher.settle()

  assert.deepEqual(projected, [1, 181])
})

test("keeps different Goals independent and continues after one projection error", async () => {
  const projected: string[] = []
  const errors: string[] = []
  const dispatcher = new GrowthProjectionDispatcher<{ goalId: string; completed: number }>(async (goal) => {
    if (goal.completed === 1) throw new Error(`failed ${goal.goalId}`)
    projected.push(`${goal.goalId}:${goal.completed}`)
  }, (error) => errors.push(error instanceof Error ? error.message : String(error)))

  dispatcher.enqueue({ goalId: "goal-1", completed: 1 })
  dispatcher.enqueue({ goalId: "goal-1", completed: 2 })
  dispatcher.enqueue({ goalId: "goal-2", completed: 3 })
  await dispatcher.settle()

  assert.deepEqual(errors, ["failed goal-1"])
  assert.deepEqual(projected.sort(), ["goal-1:2", "goal-2:3"])
})
