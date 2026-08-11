import { GrowthGoalStore, type GrowthOwnerActivationProjection } from "@creatx/growth-runtime"
import type { GrowthGoalProjection } from "@creatx/contracts"

export interface OwnerGrowthTurnPort {
  findPersistedOwnerTurn(sessionId: string, activationId: string, controllerToolName: string): Promise<{
    controllerCallCount: number
    controllerResult: "none" | "success" | "error"
    reply: string | undefined
  } | undefined>
  hasPersistedOwnerControllerResult(sessionId: string, activationId: string, controllerToolName: string): Promise<boolean>
  sendOwnerResultDelivery(sessionId: string, activationId: string, onCompleted: (reply: string) => Promise<void>, signal?: AbortSignal): Promise<string>
}

export type OwnerGrowthCompleted = (goal: GrowthGoalProjection) => void

export class OwnerGrowthExecutionCoordinator {
  private readonly executions = new Map<string, { promise: Promise<unknown>; controller: AbortController }>()
  private shutdownReason: string | undefined

  get activeExecutionCount() {
    return this.executions.size
  }

  find(activationId: string) {
    return this.executions.get(activationId)?.promise
  }

  requestCancellation(activationId: string, reason = "Owner Growth execution was cancelled") {
    const current = this.executions.get(activationId)
    if (!current) return undefined
    current.controller.abort(new Error(`cancelled: ${reason}`))
    return current.promise
  }

  run<T>(activationId: string, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const current = this.executions.get(activationId)
    if (current) return current.promise as Promise<T>
    if (this.shutdownReason) return Promise.reject(new Error(`owner_execution: coordinator is shutting down: ${this.shutdownReason}`))
    const controller = new AbortController()
    const execution = execute(controller.signal).finally(() => {
      if (this.executions.get(activationId)?.promise === execution) this.executions.delete(activationId)
    })
    this.executions.set(activationId, { promise: execution, controller })
    return execution
  }

  async shutdown(reason = "Owner Growth execution coordinator is shutting down") {
    this.shutdownReason ??= reason
    const executions = [...this.executions.values()]
    for (const execution of executions) execution.controller.abort(new Error(`cancelled: ${this.shutdownReason}`))
    await Promise.allSettled(executions.map((execution) => execution.promise))
  }
}

export class OwnerConversationMutationCoordinator {
  private tail = Promise.resolve()
  private readonly activeTurns = new Map<string, Promise<unknown>>()

  get activeTurnCount() {
    return this.activeTurns.size
  }

  run<T>(execute: () => T | Promise<T>): Promise<T> {
    const current = this.tail.then(execute)
    this.tail = current.then(() => undefined, () => undefined)
    return current
  }

  assertSessionIdle(sessionId: string) {
    if (this.activeTurns.has(sessionId)) throw new Error("session_conflict: conversation already has an active Owner turn")
  }

  trackTurn(sessionId: string, execution: Promise<unknown>) {
    this.assertSessionIdle(sessionId)
    this.activeTurns.set(sessionId, execution)
    void execution.finally(() => {
      if (this.activeTurns.get(sessionId) === execution) this.activeTurns.delete(sessionId)
    }).catch(() => undefined)
  }
}

export async function admitOwnerConversationTurn<T>(coordinator: OwnerConversationMutationCoordinator, sessionId: string, execute: (onAdmitted: () => void) => Promise<T>) {
  const admitted = await coordinator.run(async () => {
    coordinator.assertSessionIdle(sessionId)
    let resolveAdmission!: () => void
    const admission = new Promise<void>((resolve) => {
      resolveAdmission = resolve
    })
    const execution = execute(resolveAdmission)
    coordinator.trackTurn(sessionId, execution)
    await Promise.race([admission, execution.then(() => undefined)])
    return { execution }
  })
  return admitted.execution
}

export async function reuseOwnerActivation(store: GrowthGoalStore, history: OwnerGrowthTurnPort, activation: GrowthOwnerActivationProjection, signal?: AbortSignal, onCompleted?: OwnerGrowthCompleted) {
  if (activation.status === "pending") {
    if (!activation.deliverySourceActivationId) return false
    if (await completePersistedOwnerActivation(store, history, activation, onCompleted)) return true
    const source = store.getOwnerActivation(activation.deliverySourceActivationId)
    if (!source) throw new Error("growth_persistence: Owner delivery source activation is missing")
    await deliverOwnerResult(store, history, activation, source, signal, onCompleted)
    return true
  }
  if (activation.status === "running") throw new Error("growth_conflict: this Owner message is already running")
  if (activation.status === "failed") throw new Error(`growth_conflict: this Owner message failed${activation.failureReason ? `: ${activation.failureReason}` : ""}`)
  if (activation.status === "cancelled") throw new Error("growth_conflict: this Owner message was cancelled")
  if (activation.status === "result_ready") {
    if (!activation.goalId) throw new Error("growth_persistence: result-ready Owner activation has no Goal")
    if (!await completePersistedOwnerActivation(store, history, activation, onCompleted)) await deliverOwnerResult(store, history, activation, activation, signal, onCompleted)
  }
  return true
}

export function assertOwnerConversationAvailable(store: GrowthGoalStore, goal: { goalId: string; ownerReplyPending?: boolean }) {
  if (goal.ownerReplyPending || store.findResultReadyOwnerActivationForGoal(goal.goalId)) {
    throw new Error("growth_conflict: Growth must deliver or end its pending Owner result before ordinary conversation continues")
  }
}

export async function completePersistedOwnerActivation(store: GrowthGoalStore, history: OwnerGrowthTurnPort, activation: GrowthOwnerActivationProjection, onCompleted?: OwnerGrowthCompleted) {
  const persisted = await history.findPersistedOwnerTurn(activation.sessionId, activation.activationId, activation.controllerToolName)
  if (!persisted?.reply) return false
  if (activation.deliverySourceActivationId && activation.status === "pending" && persisted.controllerCallCount === 0) {
    const source = store.getOwnerActivation(activation.deliverySourceActivationId)
    if (!source) throw new Error("growth_persistence: Owner delivery source activation is missing")
    await requireTrustedOwnerResultEvidence(store, history, source)
    const completed = store.completeOwnerDeliveryActivation({ activationId: activation.activationId, reply: persisted.reply })
    onCompleted?.(completed.goal)
    return true
  }
  if (activation.status === "result_ready" && persisted.controllerCallCount === 0) {
    await requireTrustedOwnerResultEvidence(store, history, activation)
    const completed = store.completeOwnerActivation({ activationId: activation.activationId, reply: persisted.reply })
    onCompleted?.(completed.goal)
    return true
  }
  if (activation.status === "result_ready" && persisted.controllerCallCount === 1 && persisted.controllerResult === "success") {
    const completed = store.completeOwnerActivation({ activationId: activation.activationId, reply: persisted.reply })
    onCompleted?.(completed.goal)
    return true
  }
  if (activation.kind === "issue" && activation.status === "pending" && persisted.controllerCallCount === 0) {
    store.completeOwnerActivationWithoutController({ activationId: activation.activationId, reply: persisted.reply })
    return true
  }
  return false
}

export async function settleOwnerReplyBeforeCancellation(store: GrowthGoalStore, history: OwnerGrowthTurnPort, goalId: string, onCompleted?: OwnerGrowthCompleted) {
  const source = store.findResultReadyOwnerActivationForGoal(goalId)
  if (!source) {
    const current = store.get(goalId)
    return current && !current.ownerReplyPending && (current.status === "completed" || current.status === "cancelled" || current.status === "failed")
      ? current
      : undefined
  }
  const delivery = store.findOpenOwnerDeliveryActivation(source.activationId)
  if (delivery && await completePersistedOwnerActivation(store, history, delivery, onCompleted)) return store.get(goalId)
  if (await completePersistedOwnerActivation(store, history, source, onCompleted)) return store.get(goalId)
  const current = store.get(goalId)
  if (current?.status === "completed" || current && !current.ownerReplyPending) return current
  return undefined
}

async function deliverOwnerResult(store: GrowthGoalStore, history: OwnerGrowthTurnPort, delivery: GrowthOwnerActivationProjection, source: GrowthOwnerActivationProjection, signal?: AbortSignal, onCompleted?: OwnerGrowthCompleted) {
  if (source.status !== "result_ready" || !source.goalId) throw new Error("growth_conflict: Owner result is no longer ready for delivery")
  await requireTrustedOwnerResultEvidence(store, history, source)
  signal?.throwIfAborted()
  await history.sendOwnerResultDelivery(delivery.sessionId, delivery.activationId, async (reply) => {
    if (delivery.deliverySourceActivationId) {
      const completed = store.completeOwnerDeliveryActivation({ activationId: delivery.activationId, reply })
      onCompleted?.(completed.goal)
      return
    }
    const completed = store.completeOwnerActivation({ activationId: source.activationId, reply })
    onCompleted?.(completed.goal)
  }, signal)
}

async function requireTrustedOwnerResultEvidence(store: GrowthGoalStore, history: OwnerGrowthTurnPort, source: GrowthOwnerActivationProjection) {
  if (!await history.hasPersistedOwnerControllerResult(source.sessionId, source.activationId, source.controllerToolName)) {
    const reason = "Cline 历史缺少与 Owner Activation 匹配的可信 Tool Result，结果交付已失败关闭。"
    store.failOwnerResultEvidence({ activationId: source.activationId, reason })
    throw new Error(`session_persistence: ${reason}`)
  }
}
