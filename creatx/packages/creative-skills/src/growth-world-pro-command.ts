import { GROWTH_WORLD_PRO_SKILL_NAME } from "./growth-world-pro.ts"
import { GROWTH_WORLD_PRO_GOAL_PREFIX } from "./growth-goal-instruction.ts"
import { resolveCreativeSlashCommand } from "./slash-commands.ts"

export interface GrowthWorldProCommand {
  skillName: typeof GROWTH_WORLD_PRO_SKILL_NAME
  instruction: string
  goalInstruction: string
}

export function parseGrowthWorldProCommand(message: string): GrowthWorldProCommand | undefined {
  const resolved = resolveCreativeSlashCommand(message)
  if (resolved?.definition.command !== "/growth_world_pro") return undefined
  return command(resolved.instruction)
}

function command(instruction: string): GrowthWorldProCommand {
  return {
    skillName: GROWTH_WORLD_PRO_SKILL_NAME,
    instruction,
    goalInstruction: instruction ? `${GROWTH_WORLD_PRO_GOAL_PREFIX}${instruction}` : "",
  }
}
