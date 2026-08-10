import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { GROWTH_SKILL_NAME, GROWTH_SKILL_SOURCE } from "./growth.ts"
import { GROWTH_WORLD_SKILL_NAME, GROWTH_WORLD_SKILL_SOURCE } from "./growth-world.ts"
import { GROWTH_WORLD_PRO_SKILL_NAME, GROWTH_WORLD_PRO_SKILL_SOURCE } from "./growth-world-pro.ts"
import { STUDY_SKILL_NAME, STUDY_SKILL_SOURCE } from "./study.ts"
import { DRAW_MAP_SKILL_FILES, DRAW_MAP_SKILL_NAME } from "./draw-map.ts"
import { DRAW_COMIC_SKILL_FILES, DRAW_COMIC_SKILL_NAME } from "./draw-comic.ts"
import { CHARACTER_GALLERY_SKILL_FILES, CHARACTER_GALLERY_SKILL_NAME } from "./character-gallery.ts"
import { CAUSALITY_SKILL_FILES, CAUSALITY_SKILL_NAME } from "./causality.ts"
import { NOVEL_START_SKILL_FILES, NOVEL_START_SKILL_NAME } from "./novel-opening.ts"

export { GROWTH_SKILL_NAME, GROWTH_SKILL_SOURCE } from "./growth.ts"
export { parseGrowthCommand, type GrowthCommand } from "./growth-command.ts"
export { GROWTH_WORLD_GOAL_PREFIX, GROWTH_WORLD_PRO_GOAL_PREFIX, growthGoalDisplayInstruction } from "./growth-goal-instruction.ts"
export { GROWTH_WORLD_SKILL_NAME, GROWTH_WORLD_SKILL_SOURCE } from "./growth-world.ts"
export { parseGrowthWorldCommand, type GrowthWorldCommand } from "./growth-world-command.ts"
export { GROWTH_WORLD_STAGE_CARDS, advanceGrowthWorldStage, buildGrowthWorldHiddenContext, enterGrowthWorldMode, exitGrowthWorldMode, recordGrowthWorldReview, type GrowthWorldModeState, type GrowthWorldModeStatus, type GrowthWorldReview, type GrowthWorldStageCard } from "./growth-world-mode.ts"
export { GROWTH_WORLD_PRO_BLUEPRINT_RELATION_TYPES, GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS, GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS, GROWTH_WORLD_PRO_SKILL_NAME, GROWTH_WORLD_PRO_SKILL_SOURCE, GROWTH_WORLD_PRO_STAGE_COUNT, GROWTH_WORLD_PRO_STAGES, GROWTH_WORLD_PRO_WORLD_LAYERS, growthWorldProStagePolicy, validateGrowthWorldProBlueprintArtifacts, validateGrowthWorldProReviewArtifacts } from "./growth-world-pro.ts"
export { parseGrowthWorldProCommand, type GrowthWorldProCommand } from "./growth-world-pro-command.ts"
export { OC_PRO_SKILL_NAME, OC_PRO_SKILL_SOURCE } from "./oc-pro.ts"
export { STUDY_SKILL_NAME, STUDY_SKILL_SOURCE } from "./study.ts"
export { DRAW_MAP_SKILL_FILES, DRAW_MAP_SKILL_NAME, DRAW_MAP_SKILL_SOURCE } from "./draw-map.ts"
export { DRAW_COMIC_SKILL_FILES, DRAW_COMIC_SKILL_NAME, DRAW_COMIC_SKILL_SOURCE } from "./draw-comic.ts"
export { CHARACTER_GALLERY_SKILL_FILES, CHARACTER_GALLERY_SKILL_NAME, CHARACTER_GALLERY_SKILL_SOURCE } from "./character-gallery.ts"
export { CAUSALITY_SKILL_FILES, CAUSALITY_SKILL_NAME, CAUSALITY_SKILL_SOURCE } from "./causality.ts"
export { NOVEL_START_SKILL_FILES, NOVEL_START_SKILL_NAME, NOVEL_START_SKILL_SOURCE } from "./novel-opening.ts"
export { CREATIVE_SLASH_COMMANDS, isSlashCommandInput, resolveCreativeSlashCommand, type CreativeSlashCommandActivation, type CreativeSlashCommandDefinition, type ResolvedCreativeSlashCommand } from "./slash-commands.ts"
export { normalizeCreativeSkillSequence, QUEUEABLE_CREATIVE_SKILLS, type QueueableCreativeSkillDefinition } from "./skill-sequence.ts"

export const BUILTIN_CREATIVE_SKILLS_VERSION = "v26" as const
export const WORKBENCH_CORE_GUIDANCE = `CreatX workbench rules:
- Project files are the authoritative creative content. A workbench is only a visual entrance to an existing project directory.
- When the user begins sustained creative work, establishes a work, or organizes related material, consider creating a focused directory and registering it as a workbench. Do not register every ordinary directory.
- When the user's request matches an available Creative Skill, the first tool action must load that Skill. Do not inspect files, plan a structure, or call another tool before loading it. Keep domain-specific structures out of the permanent context.
- Only load the Growth Skill when the current user message itself begins with the explicit /growth command. Never infer Growth from an ordinary long request or from a mention of /growth in prose.
- Load the Study Skill when the current message begins with /study, asks to learn from substantial existing material, or needs creative research before continuing. Study creates derived understanding and never reorganizes source files in place.
- Load the Novel Start Skill when the current goal turns a premise or existing world into a sustained story. Preserve existing writing and use the Skill's story gate instead of reducing the novel to world exposition.
- Load the Draw Map Skill when the current message begins with /draw-map or the active creative goal genuinely requires a selectable regional map. A generated picture alone is not a selectable map.
- Load the Character Gallery Skill when the active creative goal requires a world cast, several notable figures, an ordinary-person viewpoint, or a reusable character-bible gallery. Do not substitute the single-character OC Pro candidate.
- Load the Draw Comic Skill when the current message begins with /draw-comic or the active creative goal requires turning source text into a visually continuous comic. Do not treat independent illustrations as a comic sequence.
- Load the Causality Skill when the current message begins with /causality or the active creative goal requires an explicit full-world cause-and-effect graph. Never promote ordinary references or associations to causality.
- Prefer Cline's read-only file tools over Shell commands when they can inspect the required project content.
- Never move or copy existing files merely to register a workbench.
- Never create or edit .creatx metadata directly. Use register_workbench, rename_workbench, unregister_workbench, set_workbench_home, or set_workbench_visibility for their declared purposes.
- When the user asks to remove a registered workbench entrance, use unregister_workbench. It removes only the view registration and must never be described as deleting the real directory or its content.
- A workbench title is a changeable display name and may differ from its folder. When the user corrects a registered workbench title, use rename_workbench instead of registering again or editing .creatx.
- When the user asks a registered workbench to show only selected file paths or types, use set_workbench_visibility. autoIncludeNewFiles=true keeps admitting future matches; false freezes only the files matching at that moment. This changes only the workbench projection, never project files.
- Report that a workbench was created only after register_workbench succeeds.`

export async function installBuiltinCreativeSkills(appDataDirectory: string) {
  const root = join(appDataDirectory, "creative-skills", BUILTIN_CREATIVE_SKILLS_VERSION)
  const novelDirectory = join(root, NOVEL_START_SKILL_NAME)
  const growthDirectory = join(root, GROWTH_SKILL_NAME)
  const growthWorldDirectory = join(root, GROWTH_WORLD_SKILL_NAME)
  const growthWorldProDirectory = join(root, GROWTH_WORLD_PRO_SKILL_NAME)
  const studyDirectory = join(root, STUDY_SKILL_NAME)
  const drawMapDirectory = join(root, DRAW_MAP_SKILL_NAME)
  const drawComicDirectory = join(root, DRAW_COMIC_SKILL_NAME)
  const characterGalleryDirectory = join(root, CHARACTER_GALLERY_SKILL_NAME)
  const causalityDirectory = join(root, CAUSALITY_SKILL_NAME)
  await Promise.all([
    mkdir(novelDirectory, { recursive: true }),
    mkdir(growthDirectory, { recursive: true }),
    mkdir(growthWorldDirectory, { recursive: true }),
    mkdir(growthWorldProDirectory, { recursive: true }),
    mkdir(studyDirectory, { recursive: true }),
    mkdir(drawMapDirectory, { recursive: true }),
    mkdir(drawComicDirectory, { recursive: true }),
    mkdir(characterGalleryDirectory, { recursive: true }),
    mkdir(causalityDirectory, { recursive: true }),
  ])
  await Promise.all([
    installPackagedSkill(novelDirectory, NOVEL_START_SKILL_FILES),
    writeFile(join(growthDirectory, "SKILL.md"), GROWTH_SKILL_SOURCE, "utf8"),
    writeFile(join(growthWorldDirectory, "SKILL.md"), GROWTH_WORLD_SKILL_SOURCE, "utf8"),
    writeFile(join(growthWorldProDirectory, "SKILL.md"), GROWTH_WORLD_PRO_SKILL_SOURCE, "utf8"),
    writeFile(join(studyDirectory, "SKILL.md"), STUDY_SKILL_SOURCE, "utf8"),
    installPackagedSkill(drawMapDirectory, DRAW_MAP_SKILL_FILES),
    installPackagedSkill(drawComicDirectory, DRAW_COMIC_SKILL_FILES),
    installPackagedSkill(characterGalleryDirectory, CHARACTER_GALLERY_SKILL_FILES),
    installPackagedSkill(causalityDirectory, CAUSALITY_SKILL_FILES),
  ])
  return {
    skillDirectories: [root],
    skills: [NOVEL_START_SKILL_NAME, STUDY_SKILL_NAME, DRAW_MAP_SKILL_NAME, CHARACTER_GALLERY_SKILL_NAME, DRAW_COMIC_SKILL_NAME, CAUSALITY_SKILL_NAME],
    workerSkills: {
      "growth-stage": [GROWTH_SKILL_NAME],
      "growth-recovery": [GROWTH_SKILL_NAME],
      "world-blueprint": [GROWTH_SKILL_NAME, GROWTH_WORLD_SKILL_NAME, GROWTH_WORLD_PRO_SKILL_NAME],
      "world-research": [GROWTH_WORLD_PRO_SKILL_NAME],
      "world-writer": [GROWTH_WORLD_PRO_SKILL_NAME],
      "world-recovery": [GROWTH_WORLD_PRO_SKILL_NAME],
    },
  }
}

async function installPackagedSkill(directory: string, files: Record<string, string>) {
  await Promise.all(Object.entries(files).map(async ([relativePath, base64]) => {
    const path = join(directory, ...relativePath.split("/"))
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(base64, "base64"))
  }))
}
