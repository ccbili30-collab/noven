import { describe, expect, test } from "bun:test"
import { captureWorkbenchRegion, normalizeWorkbenchCaptureRect } from "../src/workbench-capture"

describe("workbench capture boundary", () => {
  test("rounds one finite CSS-pixel rectangle outward without capturing adjacent UI", async () => {
    const calls: unknown[] = []
    const result = await captureWorkbenchRegion(async (rect) => {
      calls.push(rect)
      return "png"
    }, { x: 240.25, y: 81.75, width: 499.5, height: 300.1 }, { width: 1360, height: 860 })

    expect(result).toBe("png")
    expect(calls).toEqual([{ x: 240, y: 81, width: 500, height: 301 }])
  })

  test("fails closed for invalid, outside and unbounded rectangles before capture", async () => {
    const capture = async () => { throw new Error("capture must not run") }
    for (const rect of [
      { x: Number.NaN, y: 0, width: 10, height: 10 },
      { x: -1, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 1, height: 10 },
      { x: 900, y: 0, width: 200, height: 10 },
      { x: 0, y: 0, width: 9000, height: 9000 },
    ]) await expect(captureWorkbenchRegion(capture, rect, { width: 1000, height: 800 })).rejects.toThrow("workbench_capture_invalid")
  })

  test("rejects a rectangle whose outward rounding leaves the visible content bounds", () => {
    expect(() => normalizeWorkbenchCaptureRect({ x: 0.5, y: 0.5, width: 999.6, height: 799.6 }, { width: 1000, height: 800 })).toThrow("workbench_capture_invalid")
  })

  test("clamps Chromium subpixel noise at the exact viewport edge", () => {
    expect(normalizeWorkbenchCaptureRect({ x: 544, y: 48.79999923706055, width: 433, height: 711.2000122070312 }, { width: 1200, height: 760 })).toEqual({ x: 544, y: 48, width: 433, height: 712 })
  })
})
