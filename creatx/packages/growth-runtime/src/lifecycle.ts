import type { GrowthGoalProjection } from "@creatx/contracts"
import { GrowthScheduler } from "./scheduler.ts"
import { GrowthGoalStore } from "./store.ts"

const USER_PAUSED_REASON = "用户暂停了 Growth。"
const INTERRUPTED_REASON = "应用中断了活动 Growth，等待用户明确继续。"
const SHUTDOWN_REASON = "应用正在退出，Growth 已暂停。"
const USER_CANCELLED_REASON = "用户结束了 Growth。"

export interface GrowthSessionControlPort {
  steer(sessionId: string, prompt: string): Promise<void>
  abort(sessionId: string, reason: string): Promise<void>
}

export class GrowthLifecycleController {
  private readonly store: GrowthGoalStore
  private readonly scheduler: GrowthScheduler
  private readonly sessions: GrowthSessionControlPort

  constructor(store: GrowthGoalStore, scheduler: GrowthScheduler, sessions: GrowthSessionControlPort) {
    this.store = store
    this.scheduler = scheduler
    this.sessions = sessions
  }

  async steer(goalId: string, promptInput: string) {
    return (await this.steerWithDelivery(goalId, promptInput)).goal
  }

  async steerWithDelivery(goalId: string, promptInput: string) {
    const goal = requireGoal(this.store, goalId)
    if (goal.status !== "active") throw new Error(`growth_conflict: ${goal.status} Goal cannot accept Steer`)
    if (goal.ownerReplyPending) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
    const prompt = requireText(promptInput, "prompt")
    this.store.recordLatestSteer(goalId, prompt)
    try {
      await this.sessions.steer(goal.sessionId, prompt)
      return { goal: requireGoal(this.store, goalId), deliveredToActiveRun: true }
    } catch (error) {
      if (!isIdleSteer(error)) throw error
      return { goal: requireGoal(this.store, goalId), deliveredToActiveRun: false }
    }
  }

  async pause(goalId: string) {
    const goal = requireGoal(this.store, goalId)
    if (goal.status === "paused") return goal
    if (goal.status !== "active") throw new Error(`growth_conflict: ${goal.status} Goal cannot be paused`)
    if (goal.ownerReplyPending) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
    const paused = this.store.pauseWithOwnerActivations({ goalId, expectedVersion: goal.version, reason: USER_PAUSED_REASON })
    await this.sessions.abort(paused.sessionId, USER_PAUSED_REASON)
    return paused
  }

  async resume(goalId: string, ownerActivationIdInput: string) {
    const goal = requireGoal(this.store, goalId)
    if (goal.status !== "paused" && goal.status !== "waiting") {
      throw new Error(`growth_conflict: ${goal.status} Goal cannot be resumed`)
    }
    const ownerActivationId = requireText(ownerActivationIdInput, "ownerActivationId")
    this.store.transition({ goalId, expectedVersion: goal.version, status: "active" })
    return this.scheduler.runAfterCurrent(goalId, ownerActivationId)
  }

  async cancel(goalId: string) {
    const goal = requireGoal(this.store, goalId)
    if (goal.status === "cancelled") return goal
    if (goal.status !== "active" && goal.status !== "paused" && goal.status !== "waiting" && !goal.ownerReplyPending) {
      throw new Error(`growth_conflict: ${goal.status} Goal cannot be cancelled`)
    }
    const cancelled = this.store.cancelWithOwnerActivations({
      goalId,
      expectedVersion: goal.version,
      reason: USER_CANCELLED_REASON,
    })
    await this.sessions.abort(cancelled.sessionId, USER_CANCELLED_REASON)
    return cancelled
  }

  recoverInterrupted() {
    return this.store.listActive().filter((goal) => !goal.ownerReplyPending).map((goal) => {
      this.store.recoverRunningStageAttempts(goal.goalId)
      return this.store.transition({
        goalId: goal.goalId,
        expectedVersion: goal.version,
        status: "paused",
        reason: INTERRUPTED_REASON,
      })
    })
  }

  async shutdown() {
    const paused = this.pauseActiveGoals(SHUTDOWN_REASON)
    const aborts = await Promise.allSettled(paused.map((goal) => this.sessions.abort(goal.sessionId, SHUTDOWN_REASON)))
    const failures = aborts.flatMap((result) => result.status === "rejected" ? [result.reason] : [])
    if (failures.length) throw new AggregateError(failures, "growth_runtime: one or more active Growth Runs could not be aborted during shutdown")
    return paused
  }

  private pauseActiveGoals(reason: string) {
    return this.store.listActive().filter((goal) => !goal.ownerReplyPending).map((goal) => this.store.pauseWithOwnerActivations({
      goalId: goal.goalId,
      expectedVersion: goal.version,
      reason,
    }))
  }
}

function requireGoal(store: GrowthGoalStore, goalId: string): GrowthGoalProjection {
  const goal = store.get(goalId)
  if (!goal) throw new Error("growth_invalid: Goal does not exist")
  return goal
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`growth_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function isIdleSteer(error: unknown) {
  return error instanceof Error && error.message === "session_conflict: cannot Steer an idle session"
}
