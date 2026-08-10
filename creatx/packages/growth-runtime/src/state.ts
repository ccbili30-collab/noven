import type { GrowthGoalStatus } from "@creatx/contracts"

const transitions: Readonly<Record<GrowthGoalStatus, readonly GrowthGoalStatus[]>> = {
  active: ["paused", "waiting", "completed", "cancelled", "failed"],
  paused: ["active", "cancelled"],
  waiting: ["active", "cancelled", "failed"],
  completed: [],
  cancelled: [],
  failed: [],
}

export function assertGrowthTransition(from: GrowthGoalStatus, to: GrowthGoalStatus) {
  if (transitions[from].includes(to)) return
  throw new Error(`growth_invalid: cannot transition Goal from ${from} to ${to}`)
}
