import { describe, expect, test } from "bun:test"
import { assertGrowthTransition } from "../src/state.ts"

describe("Growth Goal state", () => {
  test("accepts only automatic lifecycle transitions", () => {
    expect(() => assertGrowthTransition("active", "paused")).not.toThrow()
    expect(() => assertGrowthTransition("active", "waiting")).not.toThrow()
    expect(() => assertGrowthTransition("waiting", "active")).not.toThrow()
    expect(() => assertGrowthTransition("paused", "active")).not.toThrow()
    expect(() => assertGrowthTransition("active", "completed")).not.toThrow()
  })

  test("keeps terminal states terminal", () => {
    expect(() => assertGrowthTransition("completed", "active")).toThrow("growth_invalid")
    expect(() => assertGrowthTransition("cancelled", "active")).toThrow("growth_invalid")
    expect(() => assertGrowthTransition("failed", "active")).toThrow("growth_invalid")
  })

  test("rejects transitions that bypass resume semantics", () => {
    expect(() => assertGrowthTransition("paused", "completed")).toThrow("growth_invalid")
    expect(() => assertGrowthTransition("waiting", "completed")).toThrow("growth_invalid")
    expect(() => assertGrowthTransition("paused", "waiting")).toThrow("growth_invalid")
  })
})
