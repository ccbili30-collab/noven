import { CHARACTER_GALLERY_SKILL_NAME, DRAW_COMIC_SKILL_NAME, DRAW_MAP_SKILL_NAME, NOVEL_START_SKILL_NAME, STUDY_SKILL_NAME } from "./skill-names.ts"

export { NOVEL_START_SKILL_NAME } from "./skill-names.ts"

export interface QueueableCreativeSkillDefinition {
  name: string
  title: string
  description: string
}

export const QUEUEABLE_CREATIVE_SKILLS: readonly QueueableCreativeSkillDefinition[] = [
  { name: DRAW_MAP_SKILL_NAME, title: "地图", description: "制作高清地图与完整可选择区域" },
  { name: CHARACTER_GALLERY_SKILL_NAME, title: "人物", description: "建立五位著名人物与一位普通人的世界群像" },
  { name: NOVEL_START_SKILL_NAME, title: "小说", description: "从世界材料建立故事大纲与两章开篇" },
  { name: DRAW_COMIC_SKILL_NAME, title: "漫画", description: "把已有故事改编为连续漫画" },
  { name: STUDY_SKILL_NAME, title: "研究", description: "阅读资料并形成可复用理解" },
]

const queueableSkillNames = new Set(QUEUEABLE_CREATIVE_SKILLS.map((skill) => skill.name))

export function normalizeCreativeSkillSequence(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 12) throw new Error("skill_sequence_invalid: sequence must contain at most 12 Skills")
  return value.map((name) => {
    if (typeof name !== "string" || !queueableSkillNames.has(name)) throw new Error(`skill_sequence_invalid: unsupported queueable Skill ${String(name)}`)
    return name
  })
}
