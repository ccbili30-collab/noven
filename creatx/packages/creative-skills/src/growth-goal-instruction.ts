export const GROWTH_WORLD_GOAL_PREFIX = "Growth World 专用目标：" as const
export const GROWTH_WORLD_PRO_GOAL_PREFIX = "Growth World Pro 专用目标：" as const

const growthRoutePrefixes = [GROWTH_WORLD_PRO_GOAL_PREFIX, GROWTH_WORLD_GOAL_PREFIX] as const

export function growthGoalDisplayInstruction(instruction: string) {
  const prefix = growthRoutePrefixes.find((candidate) => instruction.startsWith(candidate))
  return (prefix ? instruction.slice(prefix.length) : instruction).trim()
}
