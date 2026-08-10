import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { GrowthGoalStore } from "@creatx/growth-runtime"
import { admitOwnerConversationTurn, assertOwnerConversationAvailable, OwnerConversationMutationCoordinator, OwnerGrowthExecutionCoordinator, reuseOwnerActivation, settleOwnerReplyBeforeCancellation, type OwnerGrowthTurnPort } from "../src/owner-growth-delivery.ts"

test("completes a persisted Owner reply without another Provider delivery turn", async () => {
  const current = await setupResultReadyActivation()
  let deliveries = 0
  const cleanups: string[] = []
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async () => ({ controllerCallCount: 1, controllerResult: "success", reply: "世界已经完成。" }),
    hasPersistedOwnerControllerResult: async () => true,
    sendOwnerResultDelivery: async () => {
      deliveries += 1
      return "unexpected"
    },
  }
  try {
    assert.equal(await reuseOwnerActivation(current.store, history, current.activation, undefined, (goal) => {
      assert.equal(current.store.get(goal.goalId)?.status, "completed")
      cleanups.push(`${goal.sessionId}:${goal.goalId}`)
    }), true)
    assert.equal(deliveries, 0)
    assert.deepEqual(cleanups, [`session-1:${current.goalId}`])
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "completed")
    assert.equal(current.store.get(current.goalId)?.status, "completed")
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("persists the Resume request before delivery and replays it without a second turn", async () => {
  const current = await setupResultReadyActivation()
  const delivery = current.store.createOwnerDeliveryActivation({
    activationId: "activation-resume-request",
    sourceActivationId: current.activation.activationId,
    promptHash: "resume-request-hash",
  })
  let deliveries = 0
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async () => ({ controllerCallCount: 0, controllerResult: "none", reply: undefined }),
    hasPersistedOwnerControllerResult: async () => true,
    sendOwnerResultDelivery: async (_sessionId, _activationId, onCompleted) => {
      deliveries += 1
      await onCompleted("世界已经完成。")
      return "世界已经完成。"
    },
  }
  try {
    assert.equal(await reuseOwnerActivation(current.store, history, delivery), true)
    assert.equal(deliveries, 1)
    const replay = current.store.getOwnerActivation(delivery.activationId)!
    assert.equal(replay.status, "completed")
    assert.equal(await reuseOwnerActivation(current.store, history, replay), true)
    assert.equal(deliveries, 1)
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "completed")
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("recovers a persisted pending delivery reply in-process without another Provider turn", async () => {
  const current = await setupResultReadyActivation()
  const delivery = current.store.createOwnerDeliveryActivation({
    activationId: "activation-resume-crashed-callback",
    sourceActivationId: current.activation.activationId,
    promptHash: "resume-crashed-callback-hash",
  })
  let deliveries = 0
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async () => ({ controllerCallCount: 0, controllerResult: "none", reply: "世界已经完成。" }),
    hasPersistedOwnerControllerResult: async () => true,
    sendOwnerResultDelivery: async () => {
      deliveries += 1
      return "unexpected"
    },
  }
  try {
    assert.equal(await reuseOwnerActivation(current.store, history, delivery), true)
    assert.equal(deliveries, 0)
    assert.equal(current.store.getOwnerActivation(delivery.activationId)?.status, "completed")
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "completed")
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("fails the pending Owner result atomically when Cline has no trusted Tool Result", async () => {
  const current = await setupResultReadyActivation()
  const delivery = current.store.createOwnerDeliveryActivation({
    activationId: "activation-missing-tool-result",
    sourceActivationId: current.activation.activationId,
    promptHash: "missing-tool-result-hash",
  })
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async () => ({ controllerCallCount: 0, controllerResult: "none", reply: undefined }),
    hasPersistedOwnerControllerResult: async () => false,
    sendOwnerResultDelivery: async () => "unexpected",
  }
  let cleanups = 0
  try {
    await assert.rejects(() => reuseOwnerActivation(current.store, history, delivery, undefined, () => {
      cleanups += 1
    }), /缺少与 Owner Activation 匹配的可信 Tool Result/)
    assert.equal(cleanups, 0)
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "failed")
    assert.equal(current.store.getOwnerActivation(delivery.activationId)?.status, "failed")
    assert.equal(current.store.get(current.goalId)?.status, "failed")
    assert.equal(current.store.get(current.goalId)?.ownerReplyPending, undefined)
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("joins concurrent exact retries to one in-process Owner execution", async () => {
  const coordinator = new OwnerGrowthExecutionCoordinator()
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = coordinator.run("activation-concurrent", async () => {
    calls += 1
    await gate
    return "done"
  })
  const retry = coordinator.run("activation-concurrent", async () => {
    calls += 1
    return "duplicate"
  })
  assert.equal(first, retry)
  assert.equal(calls, 1)
  release()
  assert.equal(await retry, "done")
  assert.equal(coordinator.find("activation-concurrent"), undefined)
})

test("records cancellation before a registered Owner execution can start sending", async () => {
  const coordinator = new OwnerGrowthExecutionCoordinator()
  let release!: () => void
  let sends = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const execution = coordinator.run("activation-pre-send-cancel", async (signal) => {
    await gate
    signal.throwIfAborted()
    sends += 1
  })
  const cancelled = coordinator.requestCancellation("activation-pre-send-cancel", "用户结束了 Growth。")
  assert.equal(cancelled, execution)
  release()
  await assert.rejects(execution, /用户结束了 Growth/)
  assert.equal(sends, 0)
  assert.equal(coordinator.find("activation-pre-send-cancel"), undefined)
})

test("serializes Owner admission with conversation deletion without holding the execution", async () => {
  const coordinator = new OwnerConversationMutationCoordinator()
  const events: string[] = []
  let sessionExists = true
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const deletion = coordinator.run(async () => {
    events.push("delete-check")
    await gate
    sessionExists = false
    events.push("delete-commit")
  })
  const admission = coordinator.run(() => {
    events.push("admission-check")
    if (!sessionExists) return "missing"
    events.push("activation-create")
    return "created"
  })
  await Promise.resolve()
  assert.deepEqual(events, ["delete-check"])
  release()
  await deletion
  assert.equal(await admission, "missing")
  assert.deepEqual(events, ["delete-check", "delete-commit", "admission-check"])
})

test("holds the Owner mutation boundary until an ordinary Cline turn is admitted", async () => {
  const coordinator = new OwnerConversationMutationCoordinator()
  const events: string[] = []
  let admit!: () => void
  let finish!: () => void
  const execution = new Promise<string>((resolve) => {
    finish = () => resolve("done")
  })
  const ordinary = admitOwnerConversationTurn(coordinator, "session-ordinary", (onAdmitted) => {
    events.push("ordinary-check")
    admit = () => {
      events.push("ordinary-admitted")
      onAdmitted()
    }
    return execution
  })
  const growthAdmission = coordinator.run(() => {
    coordinator.assertSessionIdle("session-ordinary")
    events.push("growth-activation-created")
  })
  await Promise.resolve()
  assert.deepEqual(events, ["ordinary-check"])
  admit()
  await assert.rejects(growthAdmission, /active Owner turn/)
  assert.deepEqual(events, ["ordinary-check", "ordinary-admitted"])
  finish()
  assert.equal(await ordinary, "done")
  await coordinator.run(() => {
    coordinator.assertSessionIdle("session-ordinary")
    events.push("growth-activation-created")
  })
  assert.deepEqual(events, ["ordinary-check", "ordinary-admitted", "growth-activation-created"])
})

test("shutdown cancels and joins every registered Owner execution and rejects new work", async () => {
  const coordinator = new OwnerGrowthExecutionCoordinator()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const execution = coordinator.run("activation-shutdown", async (signal) => {
    await gate
    signal.throwIfAborted()
  })
  const shutdown = coordinator.shutdown("应用正在退出。")
  await assert.rejects(() => coordinator.run("activation-too-late", async () => undefined), /is shutting down/)
  release()
  await shutdown
  await assert.rejects(execution, /应用正在退出/)
  assert.equal(coordinator.find("activation-shutdown"), undefined)
})

test("commits an already persisted Owner reply before cancellation can win", async () => {
  const current = await setupResultReadyActivation()
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async () => ({ controllerCallCount: 1, controllerResult: "success", reply: "世界已经完成。" }),
    hasPersistedOwnerControllerResult: async () => true,
    sendOwnerResultDelivery: async () => "unexpected",
  }
  try {
    const settled = await settleOwnerReplyBeforeCancellation(current.store, history, current.goalId)
    assert.equal(settled?.status, "completed")
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "completed")
    assert.throws(() => current.store.cancelWithOwnerActivations({ goalId: current.goalId, expectedVersion: settled!.version, reason: "用户结束了 Growth。" }), /cannot transition Goal from completed to cancelled/)
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("returns a Goal that completed while cancellation was waiting", async () => {
  const current = await setupResultReadyActivation()
  try {
    current.store.completeOwnerActivation({ activationId: current.activation.activationId, reply: "世界已经完成。" })
    const history: OwnerGrowthTurnPort = {
      findPersistedOwnerTurn: async () => undefined,
      hasPersistedOwnerControllerResult: async () => true,
      sendOwnerResultDelivery: async () => "unexpected",
    }
    const settled = await settleOwnerReplyBeforeCancellation(current.store, history, current.goalId)
    assert.equal(settled?.status, "completed")
    assert.equal(settled?.ownerReplyPending, undefined)
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("commits a persisted delivery reply before cancellation and tolerates the original callback", async () => {
  const current = await setupResultReadyActivation()
  const delivery = current.store.createOwnerDeliveryActivation({
    activationId: "activation-cancel-delivery-race",
    sourceActivationId: current.activation.activationId,
    promptHash: "cancel-delivery-race-hash",
  })
  const history: OwnerGrowthTurnPort = {
    findPersistedOwnerTurn: async (_sessionId, activationId) => activationId === delivery.activationId
      ? { controllerCallCount: 0, controllerResult: "none", reply: "世界已经完成。" }
      : { controllerCallCount: 1, controllerResult: "success", reply: undefined },
    hasPersistedOwnerControllerResult: async () => true,
    sendOwnerResultDelivery: async () => "unexpected",
  }
  try {
    const settled = await settleOwnerReplyBeforeCancellation(current.store, history, current.goalId)
    assert.equal(settled?.status, "completed")
    assert.equal(current.store.getOwnerActivation(delivery.activationId)?.status, "completed")
    assert.equal(current.store.getOwnerActivation(current.activation.activationId)?.status, "completed")
    assert.equal(current.store.completeOwnerDeliveryActivation({ activationId: delivery.activationId, reply: "世界已经完成。" }).goal.status, "completed")
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("keeps failed delivery history while allowing a new request to deliver the same result", async () => {
  const current = await setupResultReadyActivation()
  const failed = current.store.createOwnerDeliveryActivation({
    activationId: "activation-resume-failed",
    sourceActivationId: current.activation.activationId,
    promptHash: "resume-failed-hash",
  })
  current.store.failOwnerActivation({ activationId: failed.activationId, reason: "应用退出前没有形成持久回复" })
  const retry = current.store.createOwnerDeliveryActivation({
    activationId: "activation-resume-retry",
    sourceActivationId: current.activation.activationId,
    promptHash: "resume-retry-hash",
  })
  try {
    assert.equal(current.store.getOwnerActivation(failed.activationId)?.status, "failed")
    assert.equal(retry.status, "pending")
    assert.equal(retry.deliverySourceActivationId, current.activation.activationId)
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

test("blocks ordinary Owner conversation until a pending Growth result is delivered or ended", async () => {
  const current = await setupResultReadyActivation(true)
  try {
    assert.throws(() => assertOwnerConversationAvailable(current.store, current.store.get(current.goalId)!), /must deliver or end/)
    current.store.completeOwnerActivation({ activationId: current.activation.activationId, reply: "世界已经完成。" })
    assert.doesNotThrow(() => assertOwnerConversationAvailable(current.store, current.store.get(current.goalId)!))
  } finally {
    current.store.close()
    await rm(current.root, { recursive: true, force: true })
  }
})

async function setupResultReadyActivation(failed = false) {
  const root = await mkdtemp(join(tmpdir(), "CreatX Owner Delivery "))
  const store = new GrowthGoalStore(join(root, "growth.sqlite"))
  const activation = store.createOwnerActivation({
    activationId: "activation-source",
    kind: "start",
    route: "growth-world-pro",
    sessionId: "session-1",
    projectId: "project-1",
    promptHash: "prompt-hash",
    instruction: "建立完整世界",
    controllerToolName: "run_growth",
  })
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: activation.controllerToolName, toolCallId: "tool-call-1" })
  const goal = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction! })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: goal.goalId })
  const finalizing = failed
    ? store.transition({ goalId: goal.goalId, expectedVersion: goal.version, status: "failed", reason: "正文 Worker 已耗尽重试" })
    : store.markOwnerReplyPending(goal.goalId, goal.version)
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: {
      activationId: activation.activationId,
      goalId: goal.goalId,
      status: "ready_for_owner_reply",
      version: finalizing.version,
      goalStatus: finalizing.status,
      ...(finalizing.statusReason ? { reason: finalizing.statusReason } : {}),
    },
  })
  return { root, store, goalId: goal.goalId, activation: store.getOwnerActivation(activation.activationId)! }
}
