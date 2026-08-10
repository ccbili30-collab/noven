import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import {
  GrowthGoalStore,
  GrowthLifecycleController,
  GrowthScheduler,
  type GrowthSessionControlPort,
  type GrowthStageRunnerPort,
} from "../src/index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth Lifecycle "))
  roots.push(root)
  const store = new GrowthGoalStore(join(root, "growth.sqlite"))
  const goal = store.create({ requestId: "request-1", projectId: "project-1", sessionId: "session-1", instruction: "完成长篇创作" })
  return { root, store, goal }
}

test("steers the active Cline session without aborting or changing Goal state", async () => {
  const current = await setup()
  const calls: string[] = []
  const controller = lifecycle(current.store, {
    steer: async (sessionId, prompt) => { calls.push(`steer:${sessionId}:${prompt}`) },
    abort: async () => { calls.push("abort") },
  })

  const result = await controller.steer(current.goal.goalId, "把城邦改成海上联盟")

  assert.equal(result.status, "active")
  assert.deepEqual(calls, ["steer:session-1:把城邦改成海上联盟"])
  assert.equal(current.store.get(current.goal.goalId)?.version, 1)
  assert.equal(current.store.latestSteer(current.goal.goalId), "把城邦改成海上联盟")
  current.store.close()
})

test("keeps a persisted Steer when the active Worker is between stages", async () => {
  const current = await setup()
  const controller = lifecycle(current.store, {
    steer: async () => { throw new Error("session_conflict: cannot Steer an idle session") },
    abort: async () => undefined,
  })

  const result = await controller.steer(current.goal.goalId, "把魔法代价改成真实记忆")

  assert.equal(result.status, "active")
  assert.equal(current.store.latestSteer(current.goal.goalId), "把魔法代价改成真实记忆")
  current.store.close()
})

test("reports whether a Steer reached an active Run so an idle Goal can be resumed", async () => {
  const current = await setup()
  const active = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async () => undefined,
  })
  const idle = lifecycle(current.store, {
    steer: async () => { throw new Error("session_conflict: cannot Steer an idle session") },
    abort: async () => undefined,
  })

  assert.equal((await active.steerWithDelivery(current.goal.goalId, "调整北境贸易")).deliveredToActiveRun, true)
  assert.equal((await idle.steerWithDelivery(current.goal.goalId, "补充港口税制")).deliveredToActiveRun, false)
  assert.equal(current.store.latestSteer(current.goal.goalId), "补充港口税制")
  current.store.close()
})

test("persists a Steer before surfacing a non-idle delivery failure", async () => {
  const current = await setup()
  const controller = lifecycle(current.store, {
    steer: async () => { throw new Error("provider unavailable") },
    abort: async () => undefined,
  })

  await assert.rejects(controller.steer(current.goal.goalId, "保留这条修正"), /provider unavailable/)

  assert.equal(current.store.latestSteer(current.goal.goalId), "保留这条修正")
  current.store.close()
})

test("pauses before abort and rejects a late stage report without scheduling again", async () => {
  const current = await setup()
  let release: () => void = () => undefined
  const blocked = new Promise<void>((resolve) => { release = resolve })
  let runs = 0
  const runner: GrowthStageRunnerPort = {
    runGrowthStage: async (command) => {
      runs += 1
      await blocked
      assert.throws(() => current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "late-report",
        payloadHash: "late-hash",
        outcome: "continue",
        requiredImageTaskIds: [],
      }), /growth_conflict/)
      return { state: "cancelled" }
    },
  }
  const scheduler = new GrowthScheduler(current.store, runner, { fingerprint: async () => "same" })
  const controller = new GrowthLifecycleController(current.store, scheduler, {
    steer: async () => undefined,
    abort: async () => { assert.equal(current.store.get(current.goal.goalId)?.status, "paused") },
  })
  const draining = scheduler.run(current.goal.goalId)
  await new Promise((resolve) => setTimeout(resolve, 10))

  const paused = await controller.pause(current.goal.goalId)
  release()
  const result = await draining

  assert.equal(paused.status, "paused")
  assert.equal(result.status, "paused")
  assert.equal(runs, 1)
  current.store.close()
})

test("resumes the same Goal and rereads progress before starting a new stage", async () => {
  const current = await setup()
  const paused = current.store.transition({ goalId: current.goal.goalId, expectedVersion: 1, status: "paused", reason: "用户暂停" })
  let fingerprints = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "resumed-report",
        payloadHash: "resumed-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => { fingerprints += 1; return `snapshot-${fingerprints}` } })
  const controller = new GrowthLifecycleController(current.store, scheduler, controls())

  const result = await controller.resume(paused.goalId, "activation-resume")

  assert.equal(result.goalId, paused.goalId)
  assert.equal(result.status, "completed")
  assert.ok(fingerprints >= 1)
  current.store.close()
})

test("starts a new drain when resume races with the previous drain settling", async () => {
  const current = await setup()
  let releaseFirst: () => void = () => undefined
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      if (runs === 1) {
        await firstBlocked
        return { state: "completed" }
      }
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "resumed-after-settle",
        payloadHash: "resumed-after-settle-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => `runs-${runs}` })
  const controller = new GrowthLifecycleController(current.store, scheduler, controls())
  const firstDrain = scheduler.run(current.goal.goalId)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const waiting = current.store.transition({
    goalId: current.goal.goalId,
    expectedVersion: current.goal.version,
    status: "waiting",
    reason: "等待已完成的图片任务",
  })

  const resumed = controller.resume(waiting.goalId, "activation-resume")
  releaseFirst()
  const [firstResult, resumedResult] = await Promise.all([firstDrain, resumed])

  assert.equal(firstResult.status, "active")
  assert.equal(resumedResult.status, "completed")
  assert.equal(runs, 2)
  current.store.close()
})

test("marks interrupted active Goals paused on restart without starting a Run", async () => {
  const current = await setup()
  const attempt = current.store.beginStageAttempt({
    goalId: current.goal.goalId,
    stageKey: "interrupted-stage",
    startedVersion: current.goal.version,
    reportCountBefore: 0,
    fingerprintBefore: "before",
  })
  current.store.close()
  const reopened = new GrowthGoalStore(join(current.root, "growth.sqlite"))
  let runs = 0
  const scheduler = new GrowthScheduler(reopened, { runGrowthStage: async () => { runs += 1; return { state: "completed" } } }, { fingerprint: async () => "same" })
  const controller = new GrowthLifecycleController(reopened, scheduler, controls())

  const recovered = controller.recoverInterrupted()

  assert.equal(recovered.length, 1)
  assert.equal(recovered[0]?.status, "paused")
  assert.match(recovered[0]?.statusReason ?? "", /应用中断/)
  assert.equal(runs, 0)
  assert.equal(reopened.countConsecutiveMissingStageAttempts(current.goal.goalId), 1)
  assert.throws(() => reopened.finishStageAttempt({ attemptId: attempt.attemptId, status: "missing" }), /not running/)
  reopened.close()
})

test("keeps a reply-pending Goal out of Scheduler recovery and shutdown controls", async () => {
  const current = await setup()
  const pending = current.store.markOwnerReplyPending(current.goal.goalId, current.goal.version)
  let aborts = 0
  const controller = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async () => { aborts += 1 },
  })

  assert.deepEqual(controller.recoverInterrupted(), [])
  assert.deepEqual(await controller.shutdown(), [])
  await assert.rejects(controller.pause(pending.goalId), /waiting for its Owner reply/)
  await assert.rejects(controller.steer(pending.goalId, "继续"), /waiting for its Owner reply/)
  assert.equal(aborts, 0)
  assert.equal(current.store.get(pending.goalId)?.ownerReplyPending, true)
  current.store.close()
})

test("pauses every active Goal before requesting shutdown aborts", async () => {
  const current = await setup()
  const second = current.store.create({ requestId: "request-2", projectId: "project-2", sessionId: "session-2", instruction: "完成另一作品" })
  const activation = current.store.createOwnerActivation({
    activationId: "activation-shutdown",
    kind: "start",
    sessionId: current.goal.sessionId,
    projectId: current.goal.projectId,
    goalId: current.goal.goalId,
    promptHash: "prompt-shutdown",
    instruction: "/growth 完成作品",
    controllerToolName: "run_growth",
  })
  const aborted: string[] = []
  const controller = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async (sessionId) => {
      assert.equal(current.store.get(current.goal.goalId)?.status, "paused")
      assert.equal(current.store.get(second.goalId)?.status, "paused")
      assert.equal(current.store.getOwnerActivation(activation.activationId)?.status, "cancelled")
      aborted.push(sessionId)
    },
  })

  const paused = await controller.shutdown()

  assert.equal(paused.length, 2)
  assert.deepEqual(aborted.sort(), ["session-1", "session-2"])
  current.store.close()
})

test("cancels before aborting and keeps late stages terminal", async () => {
  const current = await setup()
  const observed: string[] = []
  const controller = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async () => { observed.push(current.store.get(current.goal.goalId)?.status ?? "missing") },
  })

  const cancelled = await controller.cancel(current.goal.goalId)

  assert.equal(cancelled.status, "cancelled")
  assert.deepEqual(observed, ["cancelled"])
  assert.throws(() => current.store.transition({
    goalId: cancelled.goalId,
    expectedVersion: cancelled.version,
    status: "active",
  }), /growth_invalid/)
  current.store.close()
})

test("keeps the Goal paused and exposes the error when abort fails", async () => {
  const current = await setup()
  const controller = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async () => { throw new Error("abort unavailable") },
  })

  await assert.rejects(controller.pause(current.goal.goalId), /abort unavailable/)

  assert.equal(current.store.get(current.goal.goalId)?.status, "paused")
  current.store.close()
})

test("pauses every active Goal and reports all shutdown abort failures", async () => {
  const current = await setup()
  current.store.create({ requestId: "request-2", projectId: "project-2", sessionId: "session-2", instruction: "完成另一作品" })
  const controller = lifecycle(current.store, {
    steer: async () => undefined,
    abort: async (sessionId) => { throw new Error(`abort failed:${sessionId}`) },
  })

  await assert.rejects(controller.shutdown(), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.errors.length, 2)
    return true
  })

  assert.equal(current.store.listActive().length, 0)
  current.store.close()
})

function lifecycle(store: GrowthGoalStore, control: GrowthSessionControlPort) {
  const scheduler = new GrowthScheduler(store, { runGrowthStage: async () => ({ state: "completed" }) }, { fingerprint: async () => "same" })
  return new GrowthLifecycleController(store, scheduler, control)
}

function controls(): GrowthSessionControlPort {
  return { steer: async () => undefined, abort: async () => undefined }
}
