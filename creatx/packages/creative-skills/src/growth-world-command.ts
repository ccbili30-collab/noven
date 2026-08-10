import { GROWTH_WORLD_SKILL_NAME } from "./growth-world.ts"
import { GROWTH_WORLD_GOAL_PREFIX } from "./growth-goal-instruction.ts"
import { resolveCreativeSlashCommand } from "./slash-commands.ts"

export interface GrowthWorldCommand {
  skillName: typeof GROWTH_WORLD_SKILL_NAME
  instruction: string
  goalInstruction: string
}

export function parseGrowthWorldCommand(message: string): GrowthWorldCommand | undefined {
  const resolved = resolveCreativeSlashCommand(message)
  if (resolved?.definition.command !== "/growth_world") return undefined
  return command(resolved.instruction)
}

function command(instruction: string): GrowthWorldCommand {
  return {
    skillName: GROWTH_WORLD_SKILL_NAME,
    instruction,
    goalInstruction: instruction ? `${GROWTH_WORLD_GOAL_PREFIX}${instruction}` : "",
  }
}
