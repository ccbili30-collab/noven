export type InterfaceFont = "system" | "sans" | "serif"

export interface AppearancePreferences {
  font: InterfaceFont
  interfaceFontSize: number
  readingFontSize: number
}

export const defaultAppearancePreferences: AppearancePreferences = {
  font: "system",
  interfaceFontSize: 13,
  readingFontSize: 15,
}

export const appearanceStorageKey = "creatx.appearance.v1"

export const interfaceFontStacks: Record<InterfaceFont, string> = {
  system: '"JetBrains Mono", "Microsoft YaHei UI", "Noto Sans CJK SC", monospace',
  sans: '"JetBrains Mono", "Microsoft YaHei UI", "Noto Sans CJK SC", monospace',
  serif: '"JetBrains Mono", "Microsoft YaHei UI", "Noto Sans CJK SC", monospace',
}

export function parseAppearancePreferences(value: string | null): AppearancePreferences {
  if (!value) return defaultAppearancePreferences
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object") return defaultAppearancePreferences
    const candidate = parsed as Record<string, unknown>
    const font = candidate.font
    const legacyFontSize = candidate.fontSize
    const interfaceFontSize = candidate.interfaceFontSize ?? legacyFontSize
    const readingFontSize = candidate.readingFontSize ?? legacyFontSize
    if (font !== "system" && font !== "sans" && font !== "serif") return defaultAppearancePreferences
    if (!validFontSize(interfaceFontSize) || !validFontSize(readingFontSize)) return defaultAppearancePreferences
    return { font, interfaceFontSize, readingFontSize }
  } catch {
    return defaultAppearancePreferences
  }
}

function validFontSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 12 && value <= 18
}
