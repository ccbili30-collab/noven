import { describe, expect, test } from "bun:test"
import { ApplicationRestartCoordinator, decideApplicationRestart } from "../src/application-restart"

const idle = { conversation: false, growth: false, imageGeneration: false }

describe("application restart", () => {
  test("restarts immediately while idle", () => {
    expect(decideApplicationRestart({ confirmed: false }, idle)).toEqual({
      state: "restarting",
      activity: idle,
    })
  })

  test.each([
    { conversation: true, growth: false, imageGeneration: false },
    { conversation: false, growth: true, imageGeneration: false },
    { conversation: false, growth: false, imageGeneration: true },
  ])("requires confirmation for active work", (activity) => {
    expect(decideApplicationRestart({ confirmed: false }, activity)).toEqual({
      state: "confirmation_required",
      activity,
    })
  })

  test("allows a confirmed restart with active work", () => {
    const activity = { conversation: true, growth: true, imageGeneration: true }
    expect(decideApplicationRestart({ confirmed: true }, activity)).toEqual({
      state: "restarting",
      activity,
    })
  })

  test("schedules relaunch and quit only once", () => {
    const scheduled: Array<() => void> = []
    const events: string[] = []
    const coordinator = new ApplicationRestartCoordinator({
      defer: (action) => scheduled.push(action),
      relaunch: () => events.push("relaunch"),
      quit: () => events.push("quit"),
    })

    expect(coordinator.request({ confirmed: false }, idle).state).toBe("restarting")
    expect(coordinator.request({ confirmed: true }, idle).state).toBe("restarting")
    expect(scheduled).toHaveLength(1)
    scheduled[0]?.()
    expect(events).toEqual(["relaunch", "quit"])
  })
})
