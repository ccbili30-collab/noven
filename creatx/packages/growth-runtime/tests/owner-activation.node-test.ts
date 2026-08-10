import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { GrowthGoalStore } from "../src/store.ts"
import { createGrowthOwnerControllerResult } from "../src/owner-activation.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Owner Activation "))
  roots.push(root)
  const databasePath = join(root, "growth.sqlite")
  return { databasePath, store: new GrowthGoalStore(databasePath) }
}

const activation = {
  activationId: "activation-1",
  kind: "start" as const,
  route: "growth-world-pro" as const,
  sessionId: "session-1",
  projectId: "project-1",
  promptHash: "prompt-hash-1",
  instruction: "建立完整世界",
  controllerToolName: "run_growth",
}

test("projects a reply-pending completion as completed and carries the trusted Owner summary", () => {
  const result = createGrowthOwnerControllerResult("activation-1", {
    goalId: "goal-1",
    projectId: "project-1",
    sessionId: "session-1",
    instruction: "建立完整世界",
    status: "active",
    requiredImageTaskIds: [],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:01.000Z",
    version: 18,
    ownerReplyPending: true,
  }, "正文 181/181；图片 153 成功，28 未完成。")

  assert.equal(result.goalStatus, "active")
  assert.equal(result.deliveryGoalStatus, "completed")
  assert.equal(result.ownerSummary, "正文 181/181；图片 153 成功，28 未完成。")
})

test("persists one exact Owner activation and claims one controller Tool Call", async () => {
  const { store } = await setup()
  const created = store.createOwnerActivation(activation)
  assert.deepEqual(store.createOwnerActivation(activation), created)
  assert.throws(() => store.createOwnerActivation({ ...activation, promptHash: "changed" }), /growth_conflict/)

  const claimed = store.claimOwnerActivation({
    activationId: activation.activationId,
    sessionId: activation.sessionId,
    toolName: activation.controllerToolName,
    toolCallId: "tool-call-1",
  })
  assert.equal(claimed.duplicate, false)
  assert.equal(claimed.activation.status, "running")
  assert.equal(store.claimOwnerActivation({
    activationId: activation.activationId,
    sessionId: activation.sessionId,
    toolName: activation.controllerToolName,
    toolCallId: "tool-call-1",
  }).duplicate, true)
  assert.throws(() => store.claimOwnerActivation({
    activationId: activation.activationId,
    sessionId: activation.sessionId,
    toolName: activation.controllerToolName,
    toolCallId: "tool-call-2",
  }), /growth_conflict/)
  store.close()
})

test("replays the complete persisted controller result for the exact Tool Call", async () => {
  const { store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const goal = store.create({
    requestId: activation.activationId,
    projectId: activation.projectId,
    sessionId: activation.sessionId,
    instruction: activation.instruction,
    worldEntryMode: "create",
    worldEntryStage: "blueprint-create",
  })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: goal.goalId })
  assert.equal(store.createOwnerActivation(activation).goalId, goal.goalId)
  const waiting = store.commitProgress({
    goalId: goal.goalId,
    expectedVersion: goal.version,
    reportId: "controller-result-evidence",
    payloadHash: "controller-result-evidence-hash",
    outcome: "waiting",
    reason: "等待用户确认世界基调",
    workRootPath: "作品/阿尔瑟兰",
    requiredImageTaskIds: [],
  }).goal
  const result = {
    activationId: activation.activationId,
    goalId: goal.goalId,
    status: "ready_for_owner_reply" as const,
    version: waiting.version,
    goalStatus: waiting.status,
    ...(waiting.statusReason ? { reason: waiting.statusReason } : {}),
    ...(waiting.workRootPath ? { workRootPath: waiting.workRootPath } : {}),
  }
  store.recordOwnerActivationResult({ activationId: activation.activationId, toolCallId: "tool-call-1", result })

  const replay = store.claimOwnerActivation({
    activationId: activation.activationId,
    sessionId: activation.sessionId,
    toolName: "run_growth",
    toolCallId: "tool-call-1",
  })
  assert.equal(replay.duplicate, true)
  assert.deepEqual(replay.activation.result, result)
  store.close()
})

test("atomically binds the Goal, records trusted result, and completes after the Owner reply", async () => {
  const { store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const goal = store.create({
    requestId: activation.activationId,
    projectId: activation.projectId,
    sessionId: activation.sessionId,
    instruction: activation.instruction,
    requiredImageTaskIds: [],
  })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: goal.goalId })
  const finalizing = store.markOwnerReplyPending(goal.goalId, goal.version)
  assert.equal(finalizing.ownerReplyPending, true)
  assert.equal(finalizing.status, "active")
  assert.equal(finalizing.statusReason, undefined)

  const result = {
    activationId: activation.activationId,
    goalId: goal.goalId,
    status: "ready_for_owner_reply" as const,
    version: finalizing.version,
    goalStatus: finalizing.status,
  }
  const ready = store.recordOwnerActivationResult({ activationId: activation.activationId, toolCallId: "tool-call-1", result })
  assert.equal(ready.status, "result_ready")
  assert.deepEqual(ready.result, result)

  const detected = store.recordIssue({
    issueId: "issue-before-owner-reply",
    dedupeKey: "object-1:writing:worker-failure",
    goalId: goal.goalId,
    workItemId: "object-1",
    errorCode: "materialization_worker_failure",
    impact: "repairable",
    summary: "正文尚未形成可信回执。",
    affectedObjectIds: ["object-1"],
  })
  const repairing = store.transitionIssue({ issueId: detected.issueId, expectedVersion: detected.version, status: "repairing" })
  assert.throws(() => store.completeOwnerActivation({ activationId: activation.activationId, reply: "世界已经完成。" }), /unresolved repairing issue/)
  store.transitionIssue({ issueId: repairing.issueId, expectedVersion: repairing.version, status: "resolved", summary: "正文已经形成可信回执。" })

  const completed = store.completeOwnerActivation({ activationId: activation.activationId, reply: "世界已经完成。" })
  assert.equal(completed.activation.status, "completed")
  assert.equal(completed.goal?.status, "completed")
  assert.equal(completed.goal?.statusReason, undefined)
  assert.equal(completed.goal?.ownerReplyPending, undefined)
  store.close()
})

test("completes an accepted direction Activation without completing its active Goal", async () => {
  const { store } = await setup()
  const goal = store.create({
    requestId: "activation-original",
    projectId: activation.projectId,
    sessionId: activation.sessionId,
    instruction: "建立完整世界",
  })
  const direction = store.createOwnerActivation({
    ...activation,
    activationId: "activation-direction",
    goalId: goal.goalId,
    promptHash: "direction-hash",
    instruction: "/growth 加强北方港口之间的贸易联系",
  })
  store.claimOwnerActivation({
    activationId: direction.activationId,
    sessionId: direction.sessionId,
    toolName: direction.controllerToolName,
    toolCallId: "tool-call-direction",
  })
  const current = store.get(goal.goalId)!
  store.recordOwnerActivationResult({
    activationId: direction.activationId,
    toolCallId: "tool-call-direction",
    result: {
      activationId: direction.activationId,
      goalId: current.goalId,
      status: "ready_for_owner_reply",
      version: current.version,
      goalStatus: current.status,
    },
  })

  const completed = store.completeOwnerActivation({ activationId: direction.activationId, reply: "方向已接纳，Growth 将继续运行。" })
  assert.equal(completed.activation.status, "completed")
  assert.equal(completed.goal.status, "active")
  assert.equal(completed.goal.version, current.version)
  assert.equal(completed.goal.ownerReplyPending, undefined)
  store.close()
})

test("keeps clarification turns and failed controller admission separate from Goal completion", async () => {
  const { store } = await setup()
  const created = store.create({ requestId: "issue-goal", projectId: activation.projectId, sessionId: activation.sessionId, instruction: "等待补充" })
  const waiting = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "waiting", reason: "等待补充" })
  const issue = store.createOwnerActivation({
    ...activation,
    activationId: "activation-issue",
    kind: "issue",
    route: undefined,
    goalId: waiting.goalId,
    instruction: undefined,
    controllerToolName: "resolve_growth_issue",
  })
  const clarified = store.completeOwnerActivationWithoutController({ activationId: issue.activationId, reply: "还需要确认魔法代价。" })
  assert.equal(clarified.status, "completed")
  assert.equal(clarified.toolCallId, undefined)

  const missing = store.createOwnerActivation({ ...activation, activationId: "activation-missing" })
  const failed = store.failOwnerActivation({ activationId: missing.activationId, reason: "Provider did not call run_growth" })
  assert.equal(failed.status, "failed")
  assert.match(failed.failureReason ?? "", /did not call/)
  assert.equal(store.findOpenOwnerActivationForSession(activation.sessionId), undefined)
  store.close()
})

test("prebinds Resume and Issue activations so cancellation rejects every late result", async () => {
  const { store } = await setup()
  for (const kind of ["resume", "issue"] as const) {
    const created = store.create({
      requestId: `request-${kind}`,
      projectId: activation.projectId,
      sessionId: activation.sessionId,
      instruction: `goal-${kind}`,
    })
    const waiting = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "waiting", reason: "等待恢复" })
    const current = store.createOwnerActivation({
      ...activation,
      activationId: `activation-${kind}-prebound`,
      kind,
      route: undefined,
      goalId: waiting.goalId,
      instruction: kind === "resume" ? waiting.goalId : "采用新资料",
      controllerToolName: kind === "resume" ? "run_growth" : "resolve_growth_issue",
    })
    assert.equal(current.goalId, waiting.goalId)
    const toolCallId = `tool-${kind}`
    store.claimOwnerActivation({ activationId: current.activationId, sessionId: current.sessionId, toolName: current.controllerToolName, toolCallId })
    const active = store.transition({ goalId: waiting.goalId, expectedVersion: waiting.version, status: "active" })
    const cancelled = store.cancelWithOwnerActivations({ goalId: active.goalId, expectedVersion: active.version, reason: "用户结束" })
    assert.equal(cancelled.status, "cancelled")
    assert.equal(store.getOwnerActivation(current.activationId)?.status, "cancelled")
    assert.throws(() => store.bindOwnerActivationGoal({ activationId: current.activationId, toolCallId, goalId: active.goalId }), /not claimed by this Tool Call/)
    assert.throws(() => store.recordOwnerActivationResult({
      activationId: current.activationId,
      toolCallId,
      result: { activationId: current.activationId, goalId: active.goalId, status: "ready_for_owner_reply", version: cancelled.version, goalStatus: cancelled.status },
    }), /does not match the claimed activation/)
  }
  store.close()
})

test("restores exact result-ready activation without confusing another Goal or session", async () => {
  const { databasePath, store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const goal = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: goal.goalId })
  const finalizing = store.markOwnerReplyPending(goal.goalId, goal.version)
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: { activationId: activation.activationId, goalId: goal.goalId, status: "ready_for_owner_reply", version: finalizing.version, goalStatus: finalizing.status },
  })
  store.close()

  const restored = new GrowthGoalStore(databasePath)
  assert.equal(restored.findResultReadyOwnerActivationForGoal(goal.goalId)?.activationId, activation.activationId)
  assert.equal(restored.findResultReadyOwnerActivationForGoal("another-goal"), undefined)
  assert.equal(restored.findOpenOwnerActivationForSession("another-session"), undefined)
  restored.close()
})

test("atomically cancels a Goal and its result-ready Owner activation", async () => {
  const { store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const created = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: created.goalId })
  const finalizing = store.markOwnerReplyPending(created.goalId, created.version)
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: { activationId: activation.activationId, goalId: created.goalId, status: "ready_for_owner_reply", version: finalizing.version, goalStatus: finalizing.status },
  })

  const cancelled = store.cancelWithOwnerActivations({ goalId: created.goalId, expectedVersion: finalizing.version, reason: "用户结束" })
  assert.equal(cancelled.status, "cancelled")
  assert.equal(cancelled.ownerReplyPending, undefined)
  assert.equal(store.getOwnerActivation(activation.activationId)?.status, "cancelled")
  assert.equal(store.findOpenOwnerActivationForSession(activation.sessionId), undefined)
  store.close()
})

test("restores delivery and cancellation exits for a failed result-ready Goal", async () => {
  const { databasePath, store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const created = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: created.goalId })
  const failed = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "failed", reason: "正文 Worker 已耗尽重试" })
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: {
      activationId: activation.activationId,
      goalId: created.goalId,
      status: "ready_for_owner_reply",
      version: failed.version,
      goalStatus: failed.status,
      ...(failed.statusReason ? { reason: failed.statusReason } : {}),
    },
  })
  assert.equal(store.get(created.goalId)?.ownerReplyPending, true)
  store.close()

  const restored = new GrowthGoalStore(databasePath)
  assert.equal(restored.findResultReadyOwnerActivationForGoal(created.goalId)?.activationId, activation.activationId)
  const delivered = restored.completeOwnerActivation({ activationId: activation.activationId, reply: "正文生成失败，未改动既有作品。" })
  assert.equal(delivered.goal?.status, "failed")
  assert.equal(delivered.goal?.ownerReplyPending, undefined)
  assert.equal(delivered.activation.status, "completed")
  assert.equal(restored.createOwnerActivation({ ...activation, activationId: "activation-next", promptHash: "prompt-hash-next" }).status, "pending")
  restored.close()
})

test("persists a Resume delivery request and atomically completes it with its result-ready source", async () => {
  const { store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const created = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: created.goalId })
  const finalizing = store.markOwnerReplyPending(created.goalId, created.version)
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: { activationId: activation.activationId, goalId: created.goalId, status: "ready_for_owner_reply", version: finalizing.version, goalStatus: finalizing.status },
  })

  const delivery = store.createOwnerDeliveryActivation({
    activationId: "activation-resume-delivery",
    sourceActivationId: activation.activationId,
    promptHash: "resume-request-hash",
  })
  assert.equal(delivery.status, "pending")
  assert.equal(delivery.goalId, created.goalId)
  assert.equal(delivery.deliverySourceActivationId, activation.activationId)
  assert.deepEqual(store.createOwnerDeliveryActivation({
    activationId: delivery.activationId,
    sourceActivationId: activation.activationId,
    promptHash: "resume-request-hash",
  }), delivery)
  assert.throws(() => store.createOwnerDeliveryActivation({
    activationId: delivery.activationId,
    sourceActivationId: activation.activationId,
    promptHash: "changed-request-hash",
  }), /growth_conflict/)

  const detected = store.recordIssue({
    issueId: "issue-before-delivery",
    dedupeKey: "object-2:writing:attempt-limit",
    goalId: created.goalId,
    workItemId: "object-2",
    errorCode: "materialization_attempt_limit",
    impact: "local",
    summary: "局部对象仍需后续返工。",
    affectedObjectIds: ["object-2"],
  })
  store.transitionIssue({ issueId: detected.issueId, expectedVersion: detected.version, status: "needs_help" })
  const open = store.recordIssue({
    issueId: "issue-before-delivery-open",
    dedupeKey: "object-3:writing:worker-failure",
    goalId: created.goalId,
    workItemId: "object-3",
    errorCode: "materialization_worker_failure",
    impact: "repairable",
    summary: "另一个对象仍在自动修复。",
    affectedObjectIds: ["object-3"],
  })
  assert.throws(() => store.completeOwnerDeliveryActivation({ activationId: delivery.activationId, reply: "作品已经完成。" }), /unresolved detected issue/)
  store.transitionIssue({ issueId: open.issueId, expectedVersion: open.version, status: "bypassed", summary: "该对象已安全绕过。" })

  const completed = store.completeOwnerDeliveryActivation({ activationId: delivery.activationId, reply: "作品已经完成。" })
  assert.equal(completed.activation.status, "completed")
  assert.equal(completed.source.status, "completed")
  assert.equal(completed.activation.ownerReplyHash, completed.source.ownerReplyHash)
  assert.equal(completed.goal.status, "completed")
  assert.equal(completed.goal.ownerReplyPending, undefined)
  assert.equal(store.findOpenOwnerActivationForSession(activation.sessionId), undefined)
  store.close()
})

test("atomically ends a failed result-ready Goal", async () => {
  const { store } = await setup()
  store.createOwnerActivation(activation)
  store.claimOwnerActivation({ activationId: activation.activationId, sessionId: activation.sessionId, toolName: "run_growth", toolCallId: "tool-call-1" })
  const created = store.create({ requestId: activation.activationId, projectId: activation.projectId, sessionId: activation.sessionId, instruction: activation.instruction })
  store.bindOwnerActivationGoal({ activationId: activation.activationId, toolCallId: "tool-call-1", goalId: created.goalId })
  const failed = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "failed", reason: "无法继续" })
  store.recordOwnerActivationResult({
    activationId: activation.activationId,
    toolCallId: "tool-call-1",
    result: { activationId: activation.activationId, goalId: created.goalId, status: "ready_for_owner_reply", version: failed.version, goalStatus: failed.status, ...(failed.statusReason ? { reason: failed.statusReason } : {}) },
  })
  const cancelled = store.cancelWithOwnerActivations({ goalId: created.goalId, expectedVersion: failed.version, reason: "用户结束" })
  assert.equal(cancelled.status, "cancelled")
  assert.equal(cancelled.ownerReplyPending, undefined)
  assert.equal(store.getOwnerActivation(activation.activationId)?.status, "cancelled")
  store.close()
})
