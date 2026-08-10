import { describe, expect, test } from "bun:test"
import { growthActionAvailability, growthOwnerDeliveryMessage, growthTerminalRemainingMs } from "../src/growth-status-visibility"

describe("Growth terminal visibility", () => {
  const now = Date.parse("2026-08-04T12:00:03.000Z")

  test("keeps completed, cancelled, and failed goals for only three seconds", () => {
    expect(growthTerminalRemainingMs("completed", "2026-08-04T12:00:01.000Z", now)).toBe(1_000)
    expect(growthTerminalRemainingMs("cancelled", "2026-08-04T12:00:00.500Z", now)).toBe(500)
    expect(growthTerminalRemainingMs("cancelled", "2026-08-04T12:00:00.000Z", now)).toBe(0)
    expect(growthTerminalRemainingMs("failed", "2026-08-04T12:00:01.000Z", now)).toBe(1_000)
  })

  test("keeps active, paused, and waiting goals visible", () => {
    for (const status of ["active", "paused", "waiting"] as const) {
      expect(growthTerminalRemainingMs(status, "2026-08-04T11:00:00.000Z", now)).toBeUndefined()
    }
  })

  test("keeps Continue and End available while an Owner reply is pending after restart", () => {
    expect(growthActionAvailability("active", true, false)).toEqual({
      active: false,
      resumable: true,
      cancellable: true,
    })
    expect(growthActionAvailability("failed", true, false)).toEqual({
      active: false,
      resumable: true,
      cancellable: true,
    })
  })

  test("does not offer resume while waiting for user input", () => {
    expect(growthActionAvailability("waiting", false, true)).toEqual({
      active: false,
      resumable: false,
      cancellable: true,
    })
  })

  test("describes Owner delivery without presenting failure as completed work", () => {
    expect(growthOwnerDeliveryMessage("active")).toBe("作品已完成，正在把结果交回当前对话。")
    expect(growthOwnerDeliveryMessage("waiting")).toBe("正在把等待原因交回当前对话。")
    expect(growthOwnerDeliveryMessage("failed")).toBe("正在把失败说明交回当前对话。")
  })
})
