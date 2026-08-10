import { describe, expect, test } from "bun:test"
import { configureSingleInstance } from "../src/single-instance"

describe("desktop single instance coordination", () => {
  test("quits before startup when another instance owns the profile", () => {
    let quitCount = 0
    let listener: (() => void) | undefined
    const admitted = configureSingleInstance({
      requestSingleInstanceLock: () => false,
      on: (_event, registered) => { listener = registered },
      quit: () => { quitCount += 1 },
    }, () => undefined)

    expect(admitted).toBe(false)
    expect(quitCount).toBe(1)
    expect(listener).toBeUndefined()
  })

  test("restores and focuses the existing window when a second instance starts", () => {
    const actions: string[] = []
    let listener: (() => void) | undefined
    const admitted = configureSingleInstance({
      requestSingleInstanceLock: () => true,
      on: (_event, registered) => { listener = registered },
      quit: () => { actions.push("quit") },
    }, () => ({
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: () => { actions.push("restore") },
      show: () => { actions.push("show") },
      focus: () => { actions.push("focus") },
    }))

    expect(admitted).toBe(true)
    expect(listener).toBeDefined()
    listener?.()
    expect(actions).toEqual(["restore", "show", "focus"])
  })

  test("does nothing when the first window is not ready or was destroyed", () => {
    let listener: (() => void) | undefined
    const app = {
      requestSingleInstanceLock: () => true,
      on: (_event: "second-instance", registered: () => void) => { listener = registered },
      quit: () => undefined,
    }

    configureSingleInstance(app, () => undefined)
    expect(() => listener?.()).not.toThrow()

    configureSingleInstance(app, () => ({
      isDestroyed: () => true,
      isMinimized: () => { throw new Error("destroyed window must not be inspected") },
      restore: () => undefined,
      show: () => undefined,
      focus: () => undefined,
    }))
    expect(() => listener?.()).not.toThrow()
  })
})
