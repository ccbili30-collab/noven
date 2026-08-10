import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, test } from "node:test"
import type { GrowthGoalProjection } from "@creatx/contracts"
import { GrowthGoalStore } from "../src/store.ts"
import { GrowthIssueResolutionService } from "../src/issue-resolution.ts"
import { growthSchemaV1, growthSchemaV10Migration, growthSchemaV11Migration, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration } from "../src/schema.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth "))
  roots.push(root)
  return { root, databasePath: join(root, "growth.sqlite") }
}

const create = {
  requestId: "request-1",
  projectId: "project-1",
  sessionId: "session-1",
  instruction: "写完十章小说",
  planFileId: "file-plan",
  requiredImageTaskIds: ["image-map"],
}

test("creates idempotently and permits only one unterminated Goal per project", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const first = store.create(create)
  assert.deepEqual(store.create(create), first)
  assert.throws(() => store.create({ ...create, requestId: "request-2", instruction: "另一个目标" }), /growth_conflict/)
  assert.throws(() => store.create({ ...create, instruction: "冲突重试" }), /growth_conflict/)
  store.close()
})

test("creates a Start Goal and binds its claimed Owner activation in one transaction", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  store.createOwnerActivation({
    activationId: "activation-start-atomic",
    kind: "start",
    route: "growth",
    sessionId: create.sessionId,
    projectId: create.projectId,
    promptHash: "prompt-start-atomic",
    instruction: create.instruction,
    controllerToolName: "run_growth",
  })
  store.claimOwnerActivation({ activationId: "activation-start-atomic", sessionId: create.sessionId, toolName: "run_growth", toolCallId: "tool-start-atomic" })
  const goal = store.createAndBindStartGoal({ activationId: "activation-start-atomic", toolCallId: "tool-start-atomic", goal: create })
  assert.equal(store.getOwnerActivation("activation-start-atomic")?.goalId, goal.goalId)
  assert.deepEqual(store.createAndBindStartGoal({ activationId: "activation-start-atomic", toolCallId: "tool-start-atomic", goal: create }), goal)
  assert.throws(() => store.createAndBindStartGoal({ activationId: "activation-start-atomic", toolCallId: "another-tool", goal: create }), /growth_conflict/)
  store.close()
})

test("atomically replaces a legacy Goal with a successor bound to the Start activation", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const legacy = store.transition({ goalId: store.create(create).goalId, expectedVersion: 1, status: "waiting", reason: "旧版入口等待接管" })
  store.createOwnerActivation({
    activationId: "activation-start-replacement",
    kind: "start",
    route: "growth-world-pro",
    sessionId: create.sessionId,
    projectId: create.projectId,
    goalId: legacy.goalId,
    promptHash: "prompt-start-replacement",
    instruction: "/growth_world_pro 继续旧世界",
    controllerToolName: "run_growth",
  })
  store.claimOwnerActivation({ activationId: "activation-start-replacement", sessionId: create.sessionId, toolName: "run_growth", toolCallId: "tool-start-replacement" })
  const successor = store.createAndBindStartGoal({
    activationId: "activation-start-replacement",
    toolCallId: "tool-start-replacement",
    replaceGoalId: legacy.goalId,
    goal: { ...create, requestId: "activation-start-replacement", instruction: "继续旧世界" },
  })
  assert.equal(store.get(legacy.goalId)?.status, "cancelled")
  assert.equal(store.getOwnerActivation("activation-start-replacement")?.goalId, successor.goalId)
  assert.equal(store.findUnterminated(create.projectId)?.goalId, successor.goalId)
  store.close()
})

test("atomically pauses a Goal and cancels its not-yet-sent Owner activation", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const activation = store.createOwnerActivation({
    activationId: "activation-pause-before-send",
    kind: "start",
    route: "growth-world-pro",
    sessionId: create.sessionId,
    projectId: create.projectId,
    goalId: goal.goalId,
    promptHash: "prompt-pause-before-send",
    instruction: "/growth_world_pro 继续旧世界",
    controllerToolName: "run_growth",
  })
  const paused = store.pauseWithOwnerActivations({ goalId: goal.goalId, expectedVersion: goal.version, reason: "用户暂停了 Growth。" })
  assert.equal(paused.status, "paused")
  assert.equal(store.getOwnerActivation(activation.activationId)?.status, "cancelled")
  assert.throws(() => store.claimOwnerActivation({ activationId: activation.activationId, sessionId: create.sessionId, toolName: "run_growth", toolCallId: "late-tool" }), /cancelled Owner activation cannot be claimed/)
  store.close()
})

test("prebound Start activation can steer the existing Goal or atomically move to its replacement", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const existing = store.create(create)
  store.createOwnerActivation({
    activationId: "activation-prebound-start",
    kind: "start",
    route: "growth-world-pro",
    sessionId: create.sessionId,
    projectId: create.projectId,
    goalId: existing.goalId,
    promptHash: "prompt-prebound-start",
    instruction: "/growth_world_pro 继续世界",
    controllerToolName: "run_growth",
  })
  store.claimOwnerActivation({ activationId: "activation-prebound-start", sessionId: create.sessionId, toolName: "run_growth", toolCallId: "tool-prebound-start" })
  const bound = store.bindOwnerActivationGoal({ activationId: "activation-prebound-start", toolCallId: "tool-prebound-start", goalId: existing.goalId })
  assert.equal(bound.goalId, existing.goalId)

  const replacement = store.createAndBindStartGoal({
    activationId: "activation-prebound-start",
    toolCallId: "tool-prebound-start",
    replaceGoalId: existing.goalId,
    goal: { ...create, requestId: "activation-prebound-start", instruction: "继续世界" },
  })
  assert.notEqual(replacement.goalId, existing.goalId)
  assert.equal(store.get(existing.goalId)?.status, "cancelled")
  assert.equal(store.getOwnerActivation("activation-prebound-start")?.goalId, replacement.goalId)
  store.close()
})

test("publishes committed projections and recovers the latest project Goal", async () => {
  const { databasePath } = await setup()
  const changed: GrowthGoalProjection[] = []
  const store = new GrowthGoalStore(databasePath, { onChanged: (goal) => changed.push(goal) })
  const created = store.create(create)
  const completed = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "completed" })

  assert.deepEqual(changed.map((goal) => [goal.goalId, goal.status, goal.version]), [
    [created.goalId, "active", 1],
    [created.goalId, "completed", 2],
  ])
  assert.deepEqual(store.findLatest(create.projectId), completed)
  assert.equal(store.findLatest("another-project"), undefined)
  store.close()
})

test("protects the sole Owner conversation for every unsettled Growth state", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const active = store.create(create)
  assert.equal(store.hasUnsettledOwnerWorkForSession(create.sessionId), true)
  assert.equal(store.hasUnsettledOwnerWorkForProject(create.projectId), true)
  const paused = store.transition({ goalId: active.goalId, expectedVersion: active.version, status: "paused" })
  assert.equal(store.hasUnsettledOwnerWorkForSession(create.sessionId), true)
  const cancelled = store.transition({ goalId: paused.goalId, expectedVersion: paused.version, status: "cancelled" })
  assert.equal(cancelled.status, "cancelled")
  assert.equal(store.hasUnsettledOwnerWorkForSession(create.sessionId), false)

  const activation = store.createOwnerActivation({
    activationId: "activation-unbound",
    kind: "start",
    route: "growth",
    sessionId: "session-open",
    projectId: "project-open",
    promptHash: "prompt-open",
    instruction: "开始 Growth",
    controllerToolName: "run_growth",
  })
  assert.equal(store.hasUnsettledOwnerWorkForSession(activation.sessionId), true)
  assert.equal(store.hasUnsettledOwnerWorkForProject(activation.projectId), true)
  store.failOwnerActivation({ activationId: activation.activationId, reason: "测试收束" })
  assert.equal(store.hasUnsettledOwnerWorkForSession(activation.sessionId), false)
  store.close()
})

test("uses optimistic versions and prevents late writes from replacing terminal state", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const completed = store.transition({ goalId: goal.goalId, expectedVersion: goal.version, status: "completed" })
  assert.equal(completed.version, 2)
  assert.throws(() => store.transition({ goalId: goal.goalId, expectedVersion: goal.version, status: "failed" }), /growth_conflict/)
  assert.throws(() => store.transition({ goalId: goal.goalId, expectedVersion: completed.version, status: "active" }), /growth_invalid/)
  assert.throws(() => store.reopenCompleted({ goalId: goal.goalId, expectedVersion: completed.version, userInitiated: false } as never), /growth_invalid/)
  const reopened = store.reopenCompleted({ goalId: goal.goalId, expectedVersion: completed.version, userInitiated: true })
  assert.equal(reopened.status, "active")
  assert.equal(reopened.goalId, goal.goalId)
  store.close()
})

test("cancelled and failed Goals cannot be reopened", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const cancelled = store.transition({ goalId: store.create(create).goalId, expectedVersion: 1, status: "cancelled" })
  assert.throws(() => store.reopenCompleted({ goalId: cancelled.goalId, expectedVersion: cancelled.version, userInitiated: true }), /growth_invalid/)
  const failed = store.transition({ goalId: store.create({ ...create, requestId: "request-2" }).goalId, expectedVersion: 1, status: "failed" })
  assert.throws(() => store.reopenCompleted({ goalId: failed.goalId, expectedVersion: failed.version, userInitiated: true }), /growth_invalid/)
  store.close()
})

test("persists an explicit Growth World entry and validates continue predecessors", async () => {
  const { databasePath } = await setup()
  const firstStore = new GrowthGoalStore(databasePath)
  const original = firstStore.create({
    ...create,
    worldEntryMode: "create",
    worldEntryStage: "blueprint-create",
  })
  const rooted = firstStore.commitProgress({
    goalId: original.goalId,
    expectedVersion: original.version,
    reportId: "world-root",
    payloadHash: "world-root-hash",
    outcome: "continue",
    workRootPath: "阿斯特拉恩",
    requiredImageTaskIds: [],
  }).goal
  const cancelled = firstStore.transition({
    goalId: rooted.goalId,
    expectedVersion: rooted.version,
    status: "cancelled",
  })
  const successor = firstStore.create({
    ...create,
    requestId: "request-successor",
    worldEntryMode: "continue",
    worldEntryStage: "materialization",
    predecessorGoalId: cancelled.goalId,
    workRootPath: "阿斯特拉恩",
  })

  assert.equal(successor.worldEntryMode, "continue")
  assert.equal(successor.worldEntryStage, "materialization")
  assert.equal(successor.predecessorGoalId, cancelled.goalId)
  assert.equal(successor.workRootPath, "阿斯特拉恩")
  assert.throws(() => firstStore.create({
    ...create,
    requestId: "request-invalid-create",
    projectId: "project-2",
    worldEntryMode: "create",
    worldEntryStage: "blueprint-create",
    predecessorGoalId: cancelled.goalId,
  }), /growth_invalid/)
  firstStore.close()

  const secondStore = new GrowthGoalStore(databasePath)
  assert.deepEqual(secondStore.get(successor.goalId), successor)
  secondStore.close()
})

test("rejects continue without a terminal predecessor in the same project and work root", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const active = store.create({ ...create, worldEntryMode: "create", worldEntryStage: "blueprint-create" })
  assert.throws(() => store.create({
    ...create,
    requestId: "request-missing-predecessor",
    projectId: "project-2",
    worldEntryMode: "continue",
    worldEntryStage: "materialization",
    workRootPath: "阿斯特拉恩",
  }), /growth_invalid/)
  const terminal = store.transition({ goalId: active.goalId, expectedVersion: active.version, status: "cancelled" })
  assert.throws(() => store.create({
    ...create,
    requestId: "request-other-project",
    projectId: "project-2",
    worldEntryMode: "continue",
    worldEntryStage: "materialization",
    predecessorGoalId: terminal.goalId,
    workRootPath: "阿斯特拉恩",
  }), /growth_invalid/)
  assert.throws(() => store.create({
    ...create,
    requestId: "request-wrong-root",
    worldEntryMode: "continue",
    worldEntryStage: "materialization",
    predecessorGoalId: terminal.goalId,
    workRootPath: "另一个世界",
  }), /growth_invalid/)
  store.close()
})

test("reloads the same Goal after restart", async () => {
  const { databasePath } = await setup()
  const firstStore = new GrowthGoalStore(databasePath)
  const created = firstStore.create(create)
  firstStore.close()
  const secondStore = new GrowthGoalStore(databasePath)
  assert.deepEqual(secondStore.get(created.goalId), created)
  assert.deepEqual(secondStore.findUnterminated(create.projectId), created)
  secondStore.close()
})

test("persists Growth issues and enforces repair, advisory, and blocking transitions", async () => {
  const { databasePath } = await setup()
  const firstStore = new GrowthGoalStore(databasePath)
  const goal = firstStore.create(create)
  const detected = firstStore.recordIssue({
    issueId: "issue-overflow",
    dedupeKey: "object-1:research:guard-overflow",
    goalId: goal.goalId,
    workItemId: "object-1",
    errorCode: "materialization_contract_overflow",
    impact: "repairable",
    summary: "研究约束数量超出工具合同。",
    detail: "consistencyGuard.invariants must contain 0 to 30 objects",
    affectedObjectIds: ["object-1"],
  })
  assert.equal(detected.status, "detected")
  assert.deepEqual(firstStore.recordIssue({
    issueId: "another-id",
    dedupeKey: "object-1:research:guard-overflow",
    goalId: goal.goalId,
    workItemId: "object-1",
    errorCode: "materialization_contract_overflow",
    impact: "repairable",
    summary: "研究约束数量超出工具合同。",
    detail: "consistencyGuard.invariants must contain 0 to 30 objects",
    affectedObjectIds: ["object-1"],
  }), detected)
  const repairing = firstStore.transitionIssue({ issueId: detected.issueId, expectedVersion: 1, status: "repairing", attemptCount: 1 })
  const resolved = firstStore.transitionIssue({ issueId: detected.issueId, expectedVersion: repairing.version, status: "resolved", summary: "约束已合并并重新提交。" })
  assert.ok(resolved.resolvedAt)
  assert.throws(() => firstStore.transitionIssue({ issueId: detected.issueId, expectedVersion: resolved.version, status: "repairing" }), /growth_invalid/)
  firstStore.close()

  const secondStore = new GrowthGoalStore(databasePath)
  assert.deepEqual(secondStore.listIssues(goal.goalId), [resolved])
  secondStore.close()
})

test("binds stage issues to durable attempts and restores them by attempt and stage", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const attempt = store.beginStageAttempt({ goalId: goal.goalId, stageKey: "world-blueprint-create", startedVersion: goal.version, reportCountBefore: 0, fingerprintBefore: "before" })
  const issue = store.recordIssue({
    issueId: "issue-blueprint",
    dedupeKey: `${attempt.attemptId}:tool:call-1`,
    goalId: goal.goalId,
    stageAttemptId: attempt.attemptId,
    errorCode: "blueprint_invalid",
    impact: "repairable",
    summary: "蓝图动作输入无效。",
    detail: "objects[0].genreKey is not allowed",
    affectedObjectIds: [],
  })

  assert.equal(issue.stageAttemptId, attempt.attemptId)
  assert.deepEqual(store.listIssuesForStageAttempt(attempt.attemptId), [issue])
  assert.deepEqual(store.listIssuesForStage(goal.goalId, "world-blueprint-create"), [issue])
  assert.throws(() => store.recordIssue({ ...issue, issueId: "issue-wrong-attempt", dedupeKey: "wrong-attempt", stageAttemptId: "missing-attempt" }), /growth_invalid/)
  store.close()
})

test("keeps local help active but requires a waiting Goal for a blocking issue", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const local = store.recordIssue({
    issueId: "issue-local",
    dedupeKey: "object-leaf:attempt-limit",
    goalId: goal.goalId,
    workItemId: "object-leaf",
    errorCode: "materialization_attempt_limit",
    impact: "local",
    summary: "叶子对象需要返工。",
    affectedObjectIds: ["object-leaf"],
  })
  const help = store.transitionIssue({ issueId: local.issueId, expectedVersion: local.version, status: "needs_help" })
  assert.equal(store.get(goal.goalId)?.status, "active")
  assert.equal(help.status, "needs_help")

  const blocking = store.recordIssue({
    issueId: "issue-blocking",
    dedupeKey: "object-root:attempt-limit",
    goalId: goal.goalId,
    workItemId: "object-root",
    errorCode: "materialization_attempt_limit",
    impact: "blocking",
    summary: "核心对象阻塞下游。",
    affectedObjectIds: ["object-root", "object-child"],
  })
  assert.throws(() => store.transitionIssue({ issueId: blocking.issueId, expectedVersion: blocking.version, status: "waiting_user" }), /growth_conflict/)
  const waiting = store.transition({ goalId: goal.goalId, expectedVersion: goal.version, status: "waiting", reason: "核心对象需要用户方案。" })
  const waitingIssue = store.transitionIssue({ issueId: blocking.issueId, expectedVersion: blocking.version, status: "waiting_user" })
  assert.equal(store.getWaitingIssue(waiting.goalId)?.issueId, waitingIssue.issueId)
  assert.equal(store.listVisibleIssues(waiting.goalId).length, 2)
  store.close()
})

test("blocks and resolves one waiting issue atomically with its Goal", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const issue = store.recordIssue({
    issueId: "issue-dependency",
    dedupeKey: "object-root:dependency",
    goalId: goal.goalId,
    workItemId: "object-root",
    errorCode: "materialization_dependency_blocked",
    impact: "repairable",
    summary: "核心规则缺失。",
    affectedObjectIds: ["object-root", "object-child"],
  })
  const blocked = store.blockForIssue({
    goalId: goal.goalId,
    expectedGoalVersion: goal.version,
    issueId: issue.issueId,
    expectedIssueVersion: issue.version,
    reason: "核心规则缺失，等待用户方案。",
    affectedObjectIds: ["object-root", "object-child"],
  })
  assert.equal(blocked.goal.status, "waiting")
  assert.equal(blocked.issue.status, "waiting_user")
  assert.equal(blocked.issue.impact, "blocking")
  assert.deepEqual(blocked.issue.affectedObjectIds, ["object-root", "object-child"])

  const resumed = store.resolveWaitingIssue({
    goalId: goal.goalId,
    expectedGoalVersion: blocked.goal.version,
    issueId: issue.issueId,
    expectedIssueVersion: blocked.issue.version,
    summary: "用户确认采用有限施法规则。",
  })
  assert.equal(resumed.goal.status, "active")
  assert.equal(resumed.issue.status, "resolved")
  assert.ok(resumed.issue.resolvedAt)
  store.close()
})

test("resolves only the current session waiting issue before waking its Goal", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const issue = store.recordIssue({
    issueId: "issue-resolution",
    dedupeKey: "object-root:resolution",
    goalId: goal.goalId,
    workItemId: "object-root",
    errorCode: "materialization_worker_failure",
    impact: "repairable",
    summary: "核心对象需要用户补充。",
    affectedObjectIds: ["object-root"],
  })
  store.blockForIssue({ goalId: goal.goalId, expectedGoalVersion: goal.version, issueId: issue.issueId, expectedIssueVersion: issue.version, reason: "等待用户补充。" })
  const activation = store.createOwnerActivation({ activationId: "activation-issue", kind: "issue", sessionId: create.sessionId, projectId: create.projectId, goalId: goal.goalId, promptHash: "prompt-hash", controllerToolName: "resolve_growth_issue" })
  const order: string[] = []
  const service = new GrowthIssueResolutionService(store, {
    prepare: async (waitingIssue, waitingGoal, resolution) => {
      order.push(`prepare:${waitingIssue.issueId}:${waitingGoal.status}:${resolution.action}`)
    },
    resumed: async (resumedGoal) => {
      order.push(`resume:${resumedGoal.status}`)
      return store.markOwnerReplyPending(resumedGoal.goalId, resumedGoal.version)
    },
  })
  const rejected = await service.tool().execute({ action: "repair", summary: "采用用户的新规则。" }, { sessionId: "another-session", projectId: create.projectId, ownerActivationId: activation.activationId, toolCallId: "tool-call-issue" })
  assert.equal(rejected.ok, false)
  assert.equal(store.get(goal.goalId)?.status, "waiting")
  const result = await service.tool().execute({ action: "repair", summary: "用户确认采用有限施法规则，可以安全重试。" }, { sessionId: create.sessionId, projectId: create.projectId, ownerActivationId: activation.activationId, toolCallId: "tool-call-issue" })
  assert.equal(result.ok, true)
  assert.deepEqual(order, [`prepare:${issue.issueId}:waiting:repair`, "resume:active"])
  assert.equal(store.get(goal.goalId)?.status, "active")
  assert.equal(store.getWaitingIssue(goal.goalId), undefined)
  assert.equal(store.listIssues(goal.goalId)[0]?.status, "repairing")
  assert.equal(store.listIssues(goal.goalId)[0]?.resolvedAt, undefined)
  assert.equal(store.latestSteer(goal.goalId), "repair: 用户确认采用有限施法规则，可以安全重试。")
  store.close()
})

test("records an Owner-authorized bypass as a green terminal issue before resuming", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  const issue = store.recordIssue({
    issueId: "issue-bypass",
    dedupeKey: "object-root:bypass",
    goalId: goal.goalId,
    workItemId: "object-root",
    errorCode: "materialization_attempt_limit",
    impact: "blocking",
    summary: "当前对象自动修复已耗尽。",
    affectedObjectIds: ["object-root", "object-child"],
  })
  store.blockForIssue({ goalId: goal.goalId, expectedGoalVersion: goal.version, issueId: issue.issueId, expectedIssueVersion: issue.version, reason: "等待用户决定。" })
  const activation = store.createOwnerActivation({ activationId: "activation-bypass", kind: "issue", sessionId: create.sessionId, projectId: create.projectId, goalId: goal.goalId, promptHash: "prompt-bypass", controllerToolName: "resolve_growth_issue" })
  const service = new GrowthIssueResolutionService(store, {
    prepare: async (_waitingIssue, _waitingGoal, resolution) => { assert.equal(resolution.action, "bypass") },
    resumed: async (resumedGoal) => store.markOwnerReplyPending(resumedGoal.goalId, resumedGoal.version),
  })

  const result = await service.tool().execute({ action: "bypass", summary: "保留缺失记录并继续其余对象。" }, { sessionId: create.sessionId, projectId: create.projectId, ownerActivationId: activation.activationId, toolCallId: "tool-call-bypass" })
  assert.equal(result.ok, true)
  assert.equal(store.listIssues(goal.goalId)[0]?.status, "bypassed")
  assert.ok(store.listIssues(goal.goalId)[0]?.resolvedAt)
  assert.equal(store.getWaitingIssue(goal.goalId), undefined)
  store.close()
})

test("persists a validated project-relative work root atomically with progress", async () => {
  const { databasePath } = await setup()
  const firstStore = new GrowthGoalStore(databasePath)
  const created = firstStore.create(create)
  const committed = firstStore.commitProgress({
    goalId: created.goalId,
    expectedVersion: created.version,
    reportId: "root-report",
    payloadHash: "root-hash",
    outcome: "continue",
    workRootPath: "银冠诸境",
    requiredImageTaskIds: [],
  })
  assert.equal(committed.goal.workRootPath, "银冠诸境")
  assert.throws(() => firstStore.commitProgress({
    goalId: committed.goal.goalId,
    expectedVersion: committed.goal.version,
    reportId: "bad-root-report",
    payloadHash: "bad-root-hash",
    outcome: "continue",
    workRootPath: "../项目外",
    requiredImageTaskIds: [],
  }), /growth_invalid/)
  firstStore.close()

  const secondStore = new GrowthGoalStore(databasePath)
  assert.equal(secondStore.get(created.goalId)?.workRootPath, "银冠诸境")
  secondStore.close()
})

test("persists only the latest active Goal Steer across restart", async () => {
  const { databasePath } = await setup()
  const firstStore = new GrowthGoalStore(databasePath)
  const created = firstStore.create(create)
  firstStore.recordLatestSteer(created.goalId, "先改成海上联盟")
  firstStore.recordLatestSteer(created.goalId, "最终改成山地邦联")
  assert.equal(firstStore.latestSteer(created.goalId), "最终改成山地邦联")
  firstStore.close()

  const secondStore = new GrowthGoalStore(databasePath)
  assert.equal(secondStore.latestSteer(created.goalId), "最终改成山地邦联")
  secondStore.close()
})

test("rejects Steer persistence for missing or non-active Goals", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const created = store.create(create)
  assert.throws(() => store.recordLatestSteer("missing-goal", "修正"), /growth_invalid/)
  const paused = store.transition({ goalId: created.goalId, expectedVersion: created.version, status: "paused", reason: "用户暂停" })
  assert.throws(() => store.recordLatestSteer(paused.goalId, "暂停后修正"), /growth_conflict/)
  assert.equal(store.latestSteer(paused.goalId), undefined)
  store.close()
})

test("fails closed on corrupt persistence without touching project content", async () => {
  const { root, databasePath } = await setup()
  const projectFile = join(root, "正文.md")
  await writeFile(projectFile, "真实正文", "utf8")
  await writeFile(databasePath, "not a sqlite database", "utf8")
  assert.throws(() => new GrowthGoalStore(databasePath), /growth_persistence/)
  assert.equal(await readFile(projectFile, "utf8"), "真实正文")
})

test("fails closed when a stored Goal projection is corrupt", async () => {
  const { databasePath } = await setup()
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create(create)
  store.close()
  const database = new DatabaseSync(databasePath)
  database.prepare("UPDATE growth_goal SET required_image_task_ids = ? WHERE goal_id = ?").run("not-json", goal.goalId)
  database.close()
  const reopened = new GrowthGoalStore(databasePath)
  assert.throws(() => reopened.get(goal.goalId), /growth_persistence/)
  reopened.close()
})

test("migrates V2 without losing a Goal or report receipt and rejects an unknown schema version", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  database.exec(growthSchemaV1)
  database.exec(`
    INSERT INTO growth_goal VALUES ('goal-old', 'request-old', 'project-old', 'session-old', '旧目标', 'active', NULL, '[]', '2026-01-01', '2026-01-01', 1);
  `)
  database.exec(growthSchemaV2Migration)
  database.prepare("INSERT INTO growth_report_receipt VALUES (?, ?, ?, ?)").run("goal-old", "report-old", "hash-old", 2)
  database.close()
  const migrated = new GrowthGoalStore(databasePath)
  assert.equal(migrated.get("goal-old")?.instruction, "旧目标")
  assert.equal(migrated.hasProgressReceipt("goal-old", 2), true)
  assert.equal(migrated.hasProgressReport("goal-old", "report-old"), true)
  assert.equal(migrated.hasProgressReport("goal-old", "report-missing"), false)
  migrated.close()
  const unsupported = new DatabaseSync(databasePath)
  unsupported.exec("PRAGMA user_version = 13")
  unsupported.close()
  assert.throws(() => new GrowthGoalStore(databasePath), /growth_persistence: unsupported Growth schema version 13/)
})

test("migrates V8 to V9 without changing existing Goals, issues, or attempts", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration]) database.exec(migration)
  database.exec(`
    INSERT INTO growth_goal (
      goal_id, request_id, project_id, session_id, instruction, status, plan_file_id,
      required_image_task_ids, created_at, updated_at, version, status_reason,
      work_root_path, world_entry_mode, world_entry_stage, predecessor_goal_id
    ) VALUES ('goal-v8', 'request-v8', 'project-v8', 'session-v8', '旧蓝图目标', 'active', NULL, '[]', '2026-01-01', '2026-01-01', 1, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO growth_stage_attempt (
      attempt_id, goal_id, sequence, stage_key, started_version, report_count_before,
      fingerprint_before, status, created_at, updated_at
    ) VALUES ('attempt-v8', 'goal-v8', 1, 'world-blueprint-create', 1, 0, 'before', 'missing', '2026-01-01', '2026-01-01');
    INSERT INTO growth_issue (
      issue_id, goal_id, dedupe_key, work_item_id, error_code, impact, status, summary,
      detail, affected_object_ids, attempt_count, created_at, updated_at, resolved_at, version
    ) VALUES ('issue-v8', 'goal-v8', 'legacy-dedupe', NULL, 'blueprint_invalid', 'repairable', 'detected', '旧问题', '旧详情', '[]', 0, '2026-01-01', '2026-01-01', NULL, 1);
  `)
  database.close()

  const migrated = new GrowthGoalStore(databasePath)
  assert.equal(migrated.get("goal-v8")?.instruction, "旧蓝图目标")
  const legacyIssue = migrated.listIssues("goal-v8")[0]
  assert.equal(legacyIssue?.issueId, "issue-v8")
  assert.equal(legacyIssue?.stageAttemptId, undefined)
  assert.equal(migrated.countConsecutiveMissingStageAttempts("goal-v8"), 1)
  migrated.close()
})

test("migrates V9 Owner completion sentinels to an explicit waiting state", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration]) database.exec(migration)
  database.exec(`
    INSERT INTO growth_goal (
      goal_id, request_id, project_id, session_id, instruction, status, plan_file_id,
      required_image_task_ids, created_at, updated_at, version, status_reason,
      work_root_path, world_entry_mode, world_entry_stage, predecessor_goal_id
    ) VALUES (
      'goal-v9', 'request-v9', 'project-v9', 'session-v9', '旧完成等待', 'active', NULL,
      '[]', '2026-01-01', '2026-01-01', 7, '<creatx_growth_owner_completion>旧汇报',
      NULL, NULL, NULL, NULL
    );
  `)
  database.close()

  const migrated = new GrowthGoalStore(databasePath)
  const goal = migrated.get("goal-v9")
  assert.equal(goal?.status, "waiting")
  assert.equal(goal?.version, 8)
  assert.match(goal?.statusReason ?? "", /缺少可验证的 Activation/)
  assert.equal(goal?.ownerReplyPending, undefined)
  assert.deepEqual(migrated.listOpenOwnerActivations(), [])
  migrated.close()
})

test("recovers an interrupted V9 migration after the issue column was already added", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration]) database.exec(migration)
  database.exec(`
    INSERT INTO growth_goal (
      goal_id, request_id, project_id, session_id, instruction, status, plan_file_id,
      required_image_task_ids, created_at, updated_at, version, status_reason,
      work_root_path, world_entry_mode, world_entry_stage, predecessor_goal_id
    ) VALUES ('goal-v8-interrupted', 'request-v8-interrupted', 'project-v8', 'session-v8', '保留旧目标', 'waiting', NULL, '[]', '2026-01-01', '2026-01-01', 1, '等待', NULL, NULL, NULL, NULL);
    INSERT INTO growth_issue (
      issue_id, goal_id, dedupe_key, work_item_id, error_code, impact, status, summary,
      detail, affected_object_ids, attempt_count, created_at, updated_at, resolved_at, version
    ) VALUES ('issue-v8-interrupted', 'goal-v8-interrupted', 'dedupe-v8', NULL, 'runtime', 'repairable', 'detected', '保留旧问题', NULL, '[]', 0, '2026-01-01', '2026-01-01', NULL, 1);
    ALTER TABLE growth_issue ADD COLUMN stage_attempt_id TEXT REFERENCES growth_stage_attempt(attempt_id);
  `)
  database.close()

  const recovered = new GrowthGoalStore(databasePath)
  assert.equal(recovered.get("goal-v8-interrupted")?.instruction, "保留旧目标")
  assert.equal(recovered.listIssues("goal-v8-interrupted")[0]?.summary, "保留旧问题")
  const version = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal((version.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 12)
  version.close()
  recovered.close()
})

test("recovers an interrupted V9 migration after both column and index were committed", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration]) database.exec(migration)
  database.exec(`
    ALTER TABLE growth_issue ADD COLUMN stage_attempt_id TEXT REFERENCES growth_stage_attempt(attempt_id);
    CREATE INDEX growth_issue_stage_attempt ON growth_issue(stage_attempt_id, status, updated_at);
  `)
  database.close()

  const recovered = new GrowthGoalStore(databasePath)
  const version = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal((version.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 12)
  assert.equal((version.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'growth_issue_stage_attempt'").get() as { count: number }).count, 1)
  version.close()
  recovered.close()
})

test("recovers an interrupted V10 migration after the Goal column was already added", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration]) database.exec(migration)
  database.exec("ALTER TABLE growth_goal ADD COLUMN owner_reply_pending INTEGER NOT NULL DEFAULT 0 CHECK (owner_reply_pending IN (0, 1))")
  database.close()

  const recovered = new GrowthGoalStore(databasePath)
  const version = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal((version.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 12)
  version.close()
  assert.deepEqual(recovered.listOpenOwnerActivations(), [])
  recovered.close()
})

test("recovers an interrupted V11 migration after the delivery source column was already added", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration, growthSchemaV10Migration]) database.exec(migration)
  database.exec("ALTER TABLE growth_owner_activation ADD COLUMN delivery_source_activation_id TEXT REFERENCES growth_owner_activation(activation_id)")
  database.close()

  const recovered = new GrowthGoalStore(databasePath)
  const version = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal((version.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 12)
  version.close()
  assert.deepEqual(recovered.listOpenOwnerActivations(), [])
  recovered.close()
})

test("migrates V10 Owner activations and preserves their exact identity", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration, growthSchemaV10Migration]) database.exec(migration)
  database.exec(`
    INSERT INTO growth_owner_activation (
      activation_id, kind, route, session_id, project_id, prompt_hash, instruction,
      controller_tool_name, status, created_at, updated_at, version
    ) VALUES (
      'activation-v10', 'start', 'growth-world-pro', 'session-v10', 'project-v10',
      'prompt-v10', '建立旧世界', 'run_growth', 'pending', '2026-01-01', '2026-01-01', 1
    );
  `)
  database.close()

  const migrated = new GrowthGoalStore(databasePath)
  const restored = migrated.getOwnerActivation("activation-v10")
  assert.equal(restored?.sessionId, "session-v10")
  assert.equal(restored?.status, "pending")
  assert.equal(restored?.deliverySourceActivationId, undefined)
  migrated.close()
})

test("migrates V11 failed delivery history without blocking a new delivery request", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  for (const migration of [growthSchemaV1, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration, growthSchemaV10Migration, growthSchemaV11Migration]) database.exec(migration)
  database.exec(`
    INSERT INTO growth_goal (
      goal_id, request_id, project_id, session_id, instruction, status, plan_file_id,
      required_image_task_ids, created_at, updated_at, version, status_reason,
      work_root_path, world_entry_mode, world_entry_stage, predecessor_goal_id, owner_reply_pending
    ) VALUES (
      'goal-v11', 'request-v11', 'project-v11', 'session-v11', '继续旧世界', 'waiting', NULL,
      '[]', '2026-01-01', '2026-01-01', 2, '等待交付', NULL, NULL, NULL, NULL, 1
    );
    INSERT INTO growth_owner_activation (
      activation_id, kind, route, session_id, project_id, goal_id, prompt_hash, instruction,
      controller_tool_name, tool_call_id, status, result_json, created_at, updated_at, version,
      delivery_source_activation_id
    ) VALUES (
      'source-v11', 'start', 'growth-world-pro', 'session-v11', 'project-v11', 'goal-v11',
      'source-hash', '继续旧世界', 'run_growth', 'tool-v11', 'result_ready',
      '{"activationId":"source-v11","goalId":"goal-v11","status":"ready_for_owner_reply","version":2,"goalStatus":"waiting","reason":"等待交付"}',
      '2026-01-01', '2026-01-01', 3, NULL
    );
    INSERT INTO growth_owner_activation (
      activation_id, kind, session_id, project_id, goal_id, prompt_hash, instruction,
      controller_tool_name, status, failure_reason, created_at, updated_at, version,
      delivery_source_activation_id
    ) VALUES (
      'delivery-failed-v11', 'resume', 'session-v11', 'project-v11', 'goal-v11',
      'failed-hash', 'goal-v11', 'deliver_growth_result', 'failed', '没有持久回复',
      '2026-01-01', '2026-01-01', 2, 'source-v11'
    );
  `)
  database.exec("DROP INDEX growth_owner_activation_delivery_source")
  database.close()

  const migrated = new GrowthGoalStore(databasePath)
  const retry = migrated.createOwnerDeliveryActivation({ activationId: "delivery-retry-v12", sourceActivationId: "source-v11", promptHash: "retry-hash" })
  assert.equal(migrated.getOwnerActivation("delivery-failed-v11")?.status, "failed")
  assert.equal(retry.status, "pending")
  migrated.close()
})
