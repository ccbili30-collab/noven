import type { GrowthGoalStatus } from "@creatx/contracts"

const terminalVisibilityMs = 3_000

export function growthTerminalRemainingMs(status: GrowthGoalStatus, updatedAt: string, now = Date.now()) {
  if (status !== "completed" && status !== "cancelled" && status !== "failed") return undefined
  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(updated)) return 0
  return Math.max(0, terminalVisibilityMs - (now - updated))
}

export function growthActionAvailability(status: GrowthGoalStatus, ownerReplyPending: boolean, waitingForUser: boolean) {
  const active = status === "active" && !ownerReplyPending
  const resumable = ownerReplyPending || status === "paused" || status === "waiting" && !waitingForUser
  return {
    active,
    resumable,
    cancellable: active || resumable || waitingForUser,
  }
}

export function growthOwnerDeliveryMessage(status: GrowthGoalStatus) {
  if (status === "failed") return "正在把失败说明交回当前对话。"
  if (status === "waiting") return "正在把等待原因交回当前对话。"
  return "作品已完成，正在把结果交回当前对话。"
}
