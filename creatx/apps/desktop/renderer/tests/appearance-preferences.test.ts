import { describe, expect, test } from "bun:test"
import { defaultAppearancePreferences, interfaceFontStacks, parseAppearancePreferences } from "../src/appearance-preferences"

describe("appearance preferences", () => {
  test("accepts supported interface font and size", () => {
    expect(parseAppearancePreferences(JSON.stringify({ font: "serif", interfaceFontSize: 16, readingFontSize: 18 }))).toEqual({ font: "serif", interfaceFontSize: 16, readingFontSize: 18 })
  })

  test("migrates the former single size into both independent controls", () => {
    expect(parseAppearancePreferences(JSON.stringify({ font: "sans", fontSize: 14 }))).toEqual({ font: "sans", interfaceFontSize: 14, readingFontSize: 14 })
  })

  test("fails closed to defaults for malformed or unsupported preferences", () => {
    expect(parseAppearancePreferences("{" )).toEqual(defaultAppearancePreferences)
    expect(parseAppearancePreferences(JSON.stringify({ font: "comic", interfaceFontSize: 14, readingFontSize: 15 }))).toEqual(defaultAppearancePreferences)
    expect(parseAppearancePreferences(JSON.stringify({ font: "system", interfaceFontSize: 22, readingFontSize: 15 }))).toEqual(defaultAppearancePreferences)
  })

  test("keeps every compatible preference on the bundled JetBrains Mono family", () => {
    expect(Object.values(interfaceFontStacks)).toHaveLength(3)
    expect(Object.values(interfaceFontStacks).every((stack) => stack.startsWith('"JetBrains Mono"'))).toBe(true)
    expect(Object.values(interfaceFontStacks).every((stack) => stack.includes('"Microsoft YaHei UI"'))).toBe(true)
  })
})
