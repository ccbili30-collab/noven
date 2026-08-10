import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, test } from "node:test"
import type { GrowthProgressReport } from "@creatx/contracts"
import { GrowthGoalStore, GrowthProgressService, type GrowthEvidenceQueryPort } from "../src/index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(
  imageStates: Record<string, "queued" | "generating" | "succeeded" | "failed" | "interrupted" | "cancelled"> = {},
  imagePaths: Record<string, string> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth Progress "))
  roots.push(root)
  const databasePath = join(root, "growth.sqlite")
  const store = new GrowthGoalStore(databasePath)
  const goal = store.create({ requestId: "create-1", projectId: "project-1", sessionId: "session-1", instruction: "完成长期作品" })
  const state = { artifactAvailable: true }
  const evidence: GrowthEvidenceQueryPort = {
    artifactExists: async (projectId, relativePath) => state.artifactAvailable && projectId === "project-1" && relativePath === "作品/正文.md",
    imageTaskEvidence: async (projectId, imageTaskId) => projectId === "project-1" && imageStates[imageTaskId]
      ? { status: imageStates[imageTaskId], relativePath: imagePaths[imageTaskId] ?? `图片/${imageTaskId}.png` }
      : undefined,
  }
  return { store, goal, state, evidence, databasePath, service: new GrowthProgressService(store, evidence) }
}

function context(version = 1) {
  return { sessionId: `growth-worker-${version}`, projectId: "project-1", growthGoalId: "", growthGoalVersion: version }
}

function report(overrides: Partial<GrowthProgressReport> = {}): GrowthProgressReport {
  return {
    reportId: "report-1",
    outcome: "continue",
    summary: "完成当前阶段",
    artifactPaths: ["作品/正文.md"],
    imageTaskIds: [],
    requiredImageTaskIds: [],
    ...overrides,
  }
}

test("contributes an automatic project tool and trusts only injected identities", async () => {
  const { store, goal, service } = await setup()
  const tool = service.tool()
  assert.equal(tool.name, "report_growth_progress")
  assert.equal(tool.scope, "project")
  assert.equal(tool.approval, "automatic")
  assert.deepEqual(Object.keys((tool.inputSchema.properties as Record<string, unknown>)).sort(), [
    "artifactPaths", "imageTaskIds", "nextStep", "outcome", "reportId", "requiredImageTaskIds", "summary",
  ])

  const forged = await tool.execute({ ...report(), goalId: goal.goalId }, { ...context(), growthGoalId: goal.goalId })
  assert.equal(forged.ok, false)
  const missingIdentity = await tool.execute(report(), { sessionId: "session-1", projectId: "project-1" })
  assert.equal(missingIdentity.ok, false)
  assert.equal(store.get(goal.goalId)?.version, 1)

  const accepted = await tool.execute(report(), { ...context(), growthGoalId: goal.goalId })
  assert.equal(accepted.ok, true)
  assert.equal(service.hasReport(goal.goalId, "report-1"), true)
  assert.equal(service.hasReport(goal.goalId, "report-missing"), false)
  assert.deepEqual(accepted.ok && accepted.value, { goal: { ...goal, version: 2, updatedAt: (accepted.value as { goal: { updatedAt: string } }).goal.updatedAt }, outcome: "continue", duplicate: false })
  store.close()
})

test("keeps bounded stage reports active until the Scheduler closes the attempt and applies its wait gate", async () => {
  const current = await setup()
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({
      waitAfterContinueReason: "第 1/10 阶段结束，等待用户继续。",
      preventCompletion: true,
    }),
  })
  const result = await service.tool().execute(report({ outcome: "completed" }), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(result.ok, true)
  assert.equal(result.ok && (result.value as { outcome: string }).outcome, "continue")
  assert.equal(current.store.get(current.goal.goalId)?.status, "active")
  assert.equal(current.store.get(current.goal.goalId)?.statusReason, undefined)

  const trusted = await service.commit(report({ reportId: "report-2", outcome: "completed" }), {
    projectId: current.goal.projectId,
    goalId: current.goal.goalId,
    version: 2,
  }, { completionAuthority: "world-materialization-final" })
  assert.equal(trusted.outcome, "completed")
  assert.equal(current.store.get(current.goal.goalId)?.status, "active")
  assert.equal(current.store.get(current.goal.goalId)?.ownerReplyPending, true)
  current.store.close()
})

test("normalizes non-failed intermediate reports to continue only when the stage policy requires it", async () => {
  const current = await setup()
  const worldPro = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({ successfulReportOutcome: "continue" }),
  })
  const normalized = await worldPro.tool().execute(report({ outcome: "waiting" }), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(normalized.ok, true)
  assert.equal(normalized.ok && (normalized.value as { outcome: string }).outcome, "continue")
  assert.equal(current.store.get(current.goal.goalId)?.status, "active")
  current.store.close()

  const ordinary = await setup()
  const waiting = await ordinary.service.tool().execute(report({ outcome: "waiting" }), { ...context(), growthGoalId: ordinary.goal.goalId })

  assert.equal(waiting.ok, true)
  assert.equal(waiting.ok && (waiting.value as { outcome: string }).outcome, "waiting")
  assert.equal(ordinary.store.get(ordinary.goal.goalId)?.status, "waiting")
  ordinary.store.close()

  const failed = await setup()
  const protectedFailure = new GrowthProgressService(failed.store, failed.evidence, {
    beforeStage: () => ({ successfulReportOutcome: "continue" }),
  })
  const failure = await protectedFailure.tool().execute(report({ outcome: "failed" }), { ...context(), growthGoalId: failed.goal.goalId })

  assert.equal(failure.ok, true)
  assert.equal(failure.ok && (failure.value as { outcome: string }).outcome, "failed")
  assert.equal(failed.store.get(failed.goal.goalId)?.status, "failed")
  failed.store.close()
})

test("captures one verified nested plan path as the immutable work root and restores it after restart", async () => {
  const current = await setup()
  current.evidence.artifactExists = async (projectId, relativePath) => projectId === "project-1"
    && ["银冠诸境/世界真相.md", "银冠诸境/创作计划.md"].includes(relativePath)
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({ workRootArtifactName: "创作计划.md" }),
  })
  const result = await service.tool().execute(report({
    artifactPaths: ["银冠诸境/世界真相.md", "银冠诸境/创作计划.md"],
  }), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(result.ok, true)
  assert.equal(current.store.get(current.goal.goalId)?.workRootPath, "银冠诸境")
  current.store.close()
  const reopened = new GrowthGoalStore(current.databasePath)
  assert.equal(reopened.get(current.goal.goalId)?.workRootPath, "银冠诸境")
  reopened.close()
})

test("rejects a blueprint report until the world root workbench is registered", async () => {
  const current = await setup()
  current.evidence.artifactExists = async () => true
  current.evidence.registeredWorkbenchFolders = async () => ["世界/核心规则与边界"]
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({
      workRootArtifactName: "世界基准.md",
      requiredWorkbenchRoot: true,
    }),
  })
  const input = report({ artifactPaths: ["世界/世界基准.md", "世界/世界蓝图/index.json"] })
  const rejected = await service.tool().execute(input, { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(rejected.ok, false)
  assert.match(rejected.ok ? "" : rejected.error.detail ?? "", /world workbench 世界 is not registered/)
  assert.equal(current.store.get(current.goal.goalId)?.version, 1)

  current.evidence.registeredWorkbenchFolders = async () => ["世界"]
  const accepted = await service.tool().execute(input, { ...context(), growthGoalId: current.goal.goalId })
  assert.equal(accepted.ok, true)
  assert.equal(current.store.get(current.goal.goalId)?.workRootPath, "世界")
  current.store.close()
})

test("fails closed when a work-root plan is missing, at project root, or ambiguous", async () => {
  for (const artifactPaths of [
    ["作品/世界真相.md"],
    ["创作计划.md"],
    ["世界甲/创作计划.md", "世界乙/创作计划.md"],
  ]) {
    const current = await setup()
    current.evidence.artifactExists = async () => true
    const service = new GrowthProgressService(current.store, current.evidence, {
      beforeStage: () => ({ workRootArtifactName: "创作计划.md" }),
    })
    const result = await service.tool().execute(report({ artifactPaths }), { ...context(), growthGoalId: current.goal.goalId })
    assert.equal(result.ok, false)
    assert.equal(current.store.get(current.goal.goalId)?.version, 1)
    assert.equal(current.store.get(current.goal.goalId)?.workRootPath, undefined)
    current.store.close()
  }
})

test("rejects a stage-specific artifact content failure without committing progress", async () => {
  const current = await setup()
  current.evidence.artifactText = async () => "## 生成依据\n不应出现在读者正文"
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({
      validateArtifacts: (artifacts) => artifacts.some((artifact) => artifact.text?.includes("生成依据"))
        ? "读者正文泄露制作术语"
        : undefined,
    }),
  })
  const result = await service.tool().execute(report(), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(result.ok, false)
  assert.match(result.ok ? "" : result.error.detail ?? "", /读者正文泄露制作术语/)
  assert.equal(current.store.get(current.goal.goalId)?.version, 1)
  assert.equal(current.store.countProgressReceipts(current.goal.goalId), 0)
  current.store.close()
})

test("validates Runtime-owned blueprint evidence without exposing internal JSON as public artifacts", async () => {
  const current = await setup()
  current.evidence.artifactExists = async (projectId, relativePath) => projectId === "project-1"
    && ["世界/世界基准.md", "世界/资料索引.md"].includes(relativePath)
  current.evidence.registeredWorkbenchFolders = async () => ["世界"]
  current.evidence.trustedStageArtifacts = async (projectId, goalId, source, workRootPath) => {
    assert.equal(projectId, "project-1")
    assert.equal(goalId, current.goal.goalId)
    assert.equal(source, "world-blueprint")
    assert.equal(workRootPath, "世界")
    return [{ relativePath: "世界/世界蓝图/state.json", text: "trusted-internal-state" }]
  }
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({
      workRootArtifactName: "世界基准.md",
      requiredWorkbenchRoot: true,
      trustedArtifactSource: "world-blueprint",
      validateArtifacts: (artifacts) => artifacts[0]?.text === "trusted-internal-state" ? undefined : "未读取权威蓝图",
    }),
  })
  const result = await service.tool().execute(report({
    artifactPaths: ["世界/世界基准.md", "世界/资料索引.md"],
  }), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(result.ok, true)
  assert.equal(current.store.get(current.goal.goalId)?.workRootPath, "世界")
  current.store.close()
})

test("allows the final bounded stage to complete", async () => {
  const current = await setup()
  const service = new GrowthProgressService(current.store, current.evidence, {
    beforeStage: () => ({
      waitAfterContinueReason: "第 10/10 阶段未完成，等待用户检查。",
      preventCompletion: false,
    }),
  })
  const result = await service.tool().execute(report({ outcome: "completed" }), { ...context(), growthGoalId: current.goal.goalId })

  assert.equal(result.ok, true)
  assert.equal(result.ok && (result.value as { outcome: string }).outcome, "completed")
  assert.equal(current.store.get(current.goal.goalId)?.status, "active")
  assert.equal(current.store.get(current.goal.goalId)?.ownerReplyPending, true)
  current.store.close()
})

test("rejects unknown artifacts and cross-project image references without advancing", async () => {
  const { store, goal, service } = await setup({ "image-1": "succeeded" })
  const unknownArtifact = await service.tool().execute(report({ artifactPaths: ["../other-file"] }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(unknownArtifact.ok, false)
  const unknownImage = await service.tool().execute(report({ reportId: "report-2", imageTaskIds: ["other-image"] }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(unknownImage.ok, false)
  assert.equal(store.get(goal.goalId)?.version, 1)
  store.close()
})

test("requires every required image to succeed before completion", async () => {
  const states = { "image-1": "generating" as const }
  const { store, goal, service } = await setup(states)
  const continued = await service.tool().execute(report({ imageTaskIds: ["image-1"], requiredImageTaskIds: ["image-1"] }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(continued.ok, true)
  const completionReport = report({ reportId: "report-2", outcome: "completed", imageTaskIds: [], requiredImageTaskIds: [] })
  const blocked = await service.tool().execute(completionReport, { ...context(2), growthGoalId: goal.goalId })
  assert.equal(blocked.ok, false)
  assert.equal(store.get(goal.goalId)?.status, "active")
  ;(states as Record<string, string>)["image-1"] = "succeeded"
  const completed = await service.tool().execute(completionReport, { ...context(2), growthGoalId: goal.goalId })
  assert.equal(completed.ok, true)
  assert.equal(completed.ok && (completed.value as { goal: { status: string } }).goal.status, "active")
  assert.equal(store.get(goal.goalId)?.ownerReplyPending, true)
  store.close()
})

test("keeps reported background images outside the completion gate", async () => {
  const states = { "image-1": "generating" as const }
  const { store, goal, service } = await setup(states)
  const continued = await service.tool().execute(report({ imageTaskIds: ["image-1"], requiredImageTaskIds: [] }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(continued.ok, true)
  assert.deepEqual(store.get(goal.goalId)?.requiredImageTaskIds, [])

  const completed = await service.tool().execute(report({ reportId: "report-2", outcome: "completed", artifactPaths: [], imageTaskIds: [], requiredImageTaskIds: [] }), { ...context(2), growthGoalId: goal.goalId })
  assert.equal(completed.ok, true)
  assert.equal(store.get(goal.goalId)?.status, "active")
  assert.equal(store.get(goal.goalId)?.ownerReplyPending, true)
  store.close()
})

test("explicitly reclassifies historical required images as background", async () => {
  const states = { "image-1": "failed" as const }
  const { store, goal, service } = await setup(states)
  const historical = await service.tool().execute(report({ imageTaskIds: ["image-1"], requiredImageTaskIds: ["image-1"] }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(historical.ok, true)
  assert.deepEqual(store.get(goal.goalId)?.requiredImageTaskIds, ["image-1"])

  const rejectedModelDowngrade = await service.tool().execute(report({
    reportId: "report-2",
    outcome: "completed",
    artifactPaths: [],
    imageTaskIds: ["image-1"],
    requiredImageTaskIds: [],
    backgroundImageTaskIds: ["image-1"],
  }), { ...context(2), growthGoalId: goal.goalId })
  assert.equal(rejectedModelDowngrade.ok, false)

  const completed = await service.commit(report({
    reportId: "report-2",
    outcome: "completed",
    artifactPaths: [],
    imageTaskIds: ["image-1"],
    requiredImageTaskIds: [],
    backgroundImageTaskIds: ["image-1"],
  }), { projectId: "project-1", goalId: goal.goalId, version: 2 })
  assert.equal(completed.outcome, "completed")
  assert.deepEqual(store.get(goal.goalId)?.requiredImageTaskIds, [])
  assert.equal(store.get(goal.goalId)?.status, "active")
  assert.equal(store.get(goal.goalId)?.ownerReplyPending, true)
  store.close()
})

test("allows a successful retry at the same target path to replace a failed required attempt", async () => {
  const states = { "image-failed": "failed" as const, "image-retry": "succeeded" as const }
  const paths = { "image-failed": "作品/视觉/封面.png", "image-retry": "作品/视觉/封面.png" }
  const { store, goal, service } = await setup(states, paths)
  const waiting = await service.tool().execute(report({
    imageTaskIds: ["image-failed"],
    requiredImageTaskIds: ["image-failed"],
    outcome: "waiting",
  }), { ...context(), growthGoalId: goal.goalId })
  assert.equal(waiting.ok, true)
  store.transition({ goalId: goal.goalId, expectedVersion: 2, status: "active" })

  const completed = await service.tool().execute(report({
    reportId: "report-2",
    outcome: "completed",
    imageTaskIds: ["image-retry"],
    requiredImageTaskIds: ["image-retry"],
  }), { ...context(3), growthGoalId: goal.goalId })
  assert.equal(completed.ok, true)
  assert.equal(store.get(goal.goalId)?.status, "active")
  assert.equal(store.get(goal.goalId)?.ownerReplyPending, true)
  assert.deepEqual(store.get(goal.goalId)?.requiredImageTaskIds, ["image-failed", "image-retry"])
  store.close()
})

test("makes exact duplicate reports idempotent across restart and rejects conflicting reuse", async () => {
  const current = await setup()
  const first = await current.service.tool().execute(report(), { ...context(), growthGoalId: current.goal.goalId })
  current.store.close()
  current.state.artifactAvailable = false
  const store = new GrowthGoalStore(current.databasePath)
  const service = new GrowthProgressService(store, current.evidence)
  const duplicate = await service.tool().execute(report(), { ...context(), growthGoalId: current.goal.goalId })
  const conflict = await service.tool().execute(report({ summary: "不同内容" }), { ...context(), growthGoalId: current.goal.goalId })
  assert.equal(first.ok, true)
  assert.equal(duplicate.ok && (duplicate.value as { duplicate: boolean }).duplicate, true)
  assert.equal(conflict.ok, false)
  assert.equal(store.get(current.goal.goalId)?.version, 2)
  store.close()
})

test("late reports cannot replace paused or cancelled state", async () => {
  const pausedSetup = await setup()
  pausedSetup.store.transition({ goalId: pausedSetup.goal.goalId, expectedVersion: 1, status: "paused" })
  const paused = await pausedSetup.service.tool().execute(report(), { ...context(), growthGoalId: pausedSetup.goal.goalId })
  assert.equal(paused.ok, false)
  assert.equal(pausedSetup.store.get(pausedSetup.goal.goalId)?.status, "paused")
  pausedSetup.store.close()

  const cancelledSetup = await setup()
  cancelledSetup.store.transition({ goalId: cancelledSetup.goal.goalId, expectedVersion: 1, status: "cancelled" })
  const cancelled = await cancelledSetup.service.tool().execute(report(), { ...context(), growthGoalId: cancelledSetup.goal.goalId })
  assert.equal(cancelled.ok, false)
  assert.equal(cancelledSetup.store.get(cancelledSetup.goal.goalId)?.status, "cancelled")
  cancelledSetup.store.close()
})

test("maps every report outcome to one Goal result without a scheduler", async () => {
  const outcomes = [
    ["continue", "active"],
    ["waiting", "waiting"],
    ["completed", "active"],
    ["failed", "failed"],
  ] as const
  for (const [outcome, status] of outcomes) {
    const current = await setup()
    const result = await current.service.tool().execute(report({ outcome }), { ...context(), growthGoalId: current.goal.goalId })
    assert.equal(result.ok, true)
    assert.equal(current.store.get(current.goal.goalId)?.status, status)
    if (status === "waiting" || status === "failed") {
      assert.equal(current.store.get(current.goal.goalId)?.statusReason, "完成当前阶段")
    }
    if (outcome === "completed") {
      assert.equal(current.store.get(current.goal.goalId)?.ownerReplyPending, true)
    }
    current.store.close()
  }
})

test("rolls back Goal advancement when persisting the report receipt fails", async () => {
  const current = await setup()
  current.store.close()
  const database = new DatabaseSync(current.databasePath)
  database.exec(`
    CREATE TRIGGER reject_growth_receipt BEFORE INSERT ON growth_report_receipt
    BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;
  `)
  database.close()
  const store = new GrowthGoalStore(current.databasePath)
  const service = new GrowthProgressService(store, current.evidence)
  const result = await service.tool().execute(report(), { ...context(), growthGoalId: current.goal.goalId })
  assert.equal(result.ok, false)
  assert.equal(store.get(current.goal.goalId)?.version, 1)
  assert.equal(store.get(current.goal.goalId)?.status, "active")
  store.close()
})

test("atomically rolls back a final receipt when the Owner reply gate cannot be persisted", async () => {
  const current = await setup()
  current.store.close()
  const database = new DatabaseSync(current.databasePath)
  database.exec(`
    CREATE TRIGGER reject_owner_reply_gate BEFORE UPDATE ON growth_goal
    WHEN NEW.owner_reply_pending = 1
    BEGIN SELECT RAISE(ABORT, 'injected Owner reply gate failure'); END;
  `)
  database.close()

  const blockedStore = new GrowthGoalStore(current.databasePath)
  const blockedService = new GrowthProgressService(blockedStore, current.evidence)
  const finalReport = report({ outcome: "completed" })
  const blocked = await blockedService.tool().execute(finalReport, { ...context(), growthGoalId: current.goal.goalId })
  assert.equal(blocked.ok, false)
  assert.equal(blockedStore.get(current.goal.goalId)?.version, 1)
  assert.equal(blockedStore.replayProgress(current.goal.goalId, finalReport.reportId, "unrelated"), undefined)
  blockedStore.close()

  const repair = new DatabaseSync(current.databasePath)
  repair.exec("DROP TRIGGER reject_owner_reply_gate")
  repair.close()
  const restoredStore = new GrowthGoalStore(current.databasePath)
  const restoredService = new GrowthProgressService(restoredStore, current.evidence)
  const restored = await restoredService.tool().execute(finalReport, { ...context(), growthGoalId: current.goal.goalId })
  assert.equal(restored.ok, true)
  assert.equal(restoredStore.get(current.goal.goalId)?.ownerReplyPending, true)
  assert.equal(restoredStore.get(current.goal.goalId)?.version, 2)
  restoredStore.close()
})
