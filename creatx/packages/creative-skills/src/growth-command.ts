import { GROWTH_SKILL_NAME } from "./growth.ts"
import { resolveCreativeSlashCommand } from "./slash-commands.ts"

export interface GrowthCommand {
  skillName: typeof GROWTH_SKILL_NAME
  instruction: string
}

export function parseGrowthCommand(message: string): GrowthCommand | undefined {
  const resolved = resolveCreativeSlashCommand(message)
  if (resolved?.definition.command !== "/growth") return undefined
  return { skillName: GROWTH_SKILL_NAME, instruction: resolved.instruction }
}
