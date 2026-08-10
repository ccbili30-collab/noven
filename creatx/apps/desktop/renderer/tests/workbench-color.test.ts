import { describe, expect, test } from "bun:test"
import { hexToHsv, hsvToHex } from "../src/workbench-color"

describe("workbench annotation colors", () => {
  test("round-trips canonical RGB colors through HSV", () => {
    for (const color of ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF", "#000000", "#7F3FBF"]) {
      const hsv = hexToHsv(color)
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(color)
    }
  })

  test("normalizes valid hex input and rejects shorthand or alpha", () => {
    expect(hexToHsv("#ff0066")).toEqual({ h: 336, s: 1, v: 1 })
    expect(() => hexToHsv("#fff")).toThrow("workbench_color_invalid")
    expect(() => hexToHsv("#FF006680")).toThrow("workbench_color_invalid")
  })
})
