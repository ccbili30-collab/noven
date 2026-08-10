import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import type { GrowthGoalProjection, GrowthStageFailure, GrowthStageRunCommand } from "@creatx/contracts"
import { assembleGrowthStagePrompt, GrowthGoalStore, GrowthScheduler, type GrowthStageRunnerPort } from "../src/index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(onChanged?: (goal: GrowthGoalProjection) => void) {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth Scheduler "))
  roots.push(root)
  const store = new GrowthGoalStore(join(root, "growth.sqlite"), onChanged ? { onChanged } : {})
  const goal = store.create({ requestId: "request-1", projectId: "project-1", sessionId: "session-1", instruction: "完成长篇创作" })
  return { store, goal }
}

test("runs reported continue stages serially until completion", async () => {
  const current = await setup()
  let active = 0
  let maximumActive = 0
  const commands: GrowthStageRunCommand[] = []
  const runner: GrowthStageRunnerPort = {
    runGrowthStage: async (command) => {
      commands.push(command)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: `report-${command.expectedVersion}`,
        payloadHash: `hash-${command.expectedVersion}`,
        outcome: command.expectedVersion === 1 ? "continue" : "completed",
        requiredImageTaskIds: [],
      })
      active -= 1
      return { state: "completed" }
    },
  }
  const scheduler = new GrowthScheduler(current.store, runner, { fingerprint: async () => `version-${current.store.get(current.goal.goalId)?.version}` })

  const [first, second] = await Promise.all([scheduler.run(current.goal.goalId), scheduler.run(current.goal.goalId)])

  assert.deepEqual(first, second)
  assert.equal(first.status, "completed")
  assert.equal(commands.length, 2)
  assert.equal(commands.every((command) => command.prompt.startsWith("/growth\n")), true)
  assert.equal(commands[0]?.prompt, "/growth\n完成长篇创作")
  assert.equal(commands[1]?.prompt.includes("<creatx_internal_growth_stage>"), true)
  assert.equal(maximumActive, 1)
  current.store.close()
})

test("rejects a second Owner activation while the same Goal is draining", async () => {
  const current = await setup()
  let release: (() => void) | undefined
  const entered = Promise.withResolvers<void>()
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      entered.resolve()
      await blocked
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "report-owner-a",
        payloadHash: "hash-owner-a",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "same" })

  const first = scheduler.run(current.goal.goalId, "activation-owner-a")
  await entered.promise
  assert.throws(() => scheduler.run(current.goal.goalId, "activation-owner-b"), /another Owner activation/)
  release?.()
  assert.equal((await first).status, "completed")
  current.store.close()
})

test("propagates Owner cancellation to the active stage and returns the persisted paused Goal", async () => {
  const current = await setup()
  const entered = Promise.withResolvers<void>()
  const controller = new AbortController()
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (_command, signal) => {
      assert.equal(signal, controller.signal)
      entered.resolve()
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }))
      return { state: "cancelled" }
    },
  }, { fingerprint: async () => "same" })

  const execution = scheduler.run(current.goal.goalId, "activation-owner", controller.signal)
  await entered.promise
  current.store.pauseWithOwnerActivations({ goalId: current.goal.goalId, expectedVersion: current.goal.version, reason: "应用正在退出" })
  controller.abort(new Error("应用正在退出"))

  assert.equal((await execution).status, "paused")
  current.store.close()
})

test("preserves a Growth World route marker across bounded stages", async () => {
  const current = await setup()
  const instruction = "Growth World 专用目标：创建一个中世纪世界"

  assert.equal(assembleGrowthStagePrompt({ ...current.goal, instruction }, false), `/growth\n${instruction}`)
  assert.match(assembleGrowthStagePrompt({ ...current.goal, instruction, version: 2 }, false), /目标：Growth World 专用目标：创建一个中世纪世界/)
  assert.match(assembleGrowthStagePrompt({ ...current.goal, instruction, version: 2 }, true), /目标：Growth World 专用目标：创建一个中世纪世界/)
  current.store.close()
})

test("injects the trusted policy stage key into the Runner command", async () => {
  const current = await setup()
  const commands: GrowthStageRunCommand[] = []
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      commands.push(command)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "stage-key-report",
        payloadHash: "stage-key-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "stage-key" }, { beforeStage: () => ({ stageKey: "world-blueprint-create" }) })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(commands[0]?.stageKey, "world-blueprint-create")
  current.store.close()
})

test("includes persisted required image failures in the next bounded stage", async () => {
  const current = await setup()
  const prompt = assembleGrowthStagePrompt({
    ...current.goal,
    version: 2,
    requiredImageTaskIds: ["image-failed"],
  }, false, [{
    imageTaskId: "image-failed",
    status: "failed",
    relativePath: "世界/视觉/封面.png",
    errorCode: "image_request",
  }])

  assert.match(prompt, /当前必需图片任务真实状态/)
  assert.match(prompt, /image-failed \| failed \| 世界\/视觉\/封面\.png \| image_request/)
  assert.match(prompt, /新的幂等键重试同一目标路径/)
  current.store.close()
})

test("injects the latest persisted user correction into the next stage", async () => {
  const current = await setup()
  const prompts: string[] = []
  current.store.recordLatestSteer(current.goal.goalId, "所有公开魔法都必须消耗可验证的真实记忆")
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      prompts.push(command.prompt)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "corrected-report",
        payloadHash: "corrected-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "corrected" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.match(prompts[0]!, /最新用户修正（持久记录，优先于旧计划和旧摘要）/)
  assert.match(prompts[0]!, /所有公开魔法都必须消耗可验证的真实记忆/)
  assert.match(prompts[0]!, /先把修正写入正式世界真相与计划/)
  current.store.close()
})

test("records one blueprint tool issue and resolves it only after a trusted retry receipt", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      if (runs === 1) return {
        state: "completed",
        failures: [{ source: "tool", toolCallId: "call-invalid", toolName: "write_world_blueprint", error: { code: "blueprint_invalid", message: "世界蓝图输入或持久状态无效。", detail: "genreKey is not allowed" } }],
      }
      current.store.commitProgress({ goalId: command.goalId, expectedVersion: command.expectedVersion, reportId: "repaired", payloadHash: "repaired-hash", outcome: "completed", requiredImageTaskIds: [] })
      return { state: "completed" }
    },
  }, { fingerprint: async () => `run-${runs}` }, { beforeStage: () => ({ stageKey: "world-blueprint-create" }) })

  const result = await scheduler.run(current.goal.goalId)
  const issues = current.store.listIssues(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.status, "resolved")
  assert.equal(issues[0]?.stageAttemptId, `${current.goal.goalId}:stage:1`)
  current.store.close()
})

test("bypasses redundant workbench registration only after the root workbench receipt gate passes", async () => {
  const current = await setup()
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      current.store.commitProgress({ goalId: command.goalId, expectedVersion: command.expectedVersion, reportId: "workbench-verified", payloadHash: "workbench-verified-hash", outcome: "completed", requiredImageTaskIds: [] })
      return {
        state: "completed",
        failures: [{ source: "tool", toolCallId: "call-workbench", toolName: "register_workbench", error: { code: "tool_failed", message: "工具执行失败。", detail: "register_workbench is disabled" } }],
      }
    },
  }, { fingerprint: async () => "workbench-verified" }, { beforeStage: () => ({ stageKey: "world-blueprint-create", requiredWorkbenchRoot: true }) })

  const result = await scheduler.run(current.goal.goalId)
  const issue = current.store.listIssues(current.goal.goalId)[0]

  assert.equal(result.status, "completed")
  assert.equal(issue?.status, "bypassed")
  assert.equal(issue?.errorCode, "blueprint_redundant_workbench_registration")
  current.store.close()
})

test("keeps blueprint issues unresolved when no trusted progress receipt exists", async () => {
  const current = await setup()
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => ({
      state: "completed",
      failures: [{ source: "tool", toolCallId: "call-invalid", toolName: "write_world_blueprint", error: { code: "blueprint_conflict", message: "世界蓝图与现有状态冲突。", detail: "metadata differs" } }],
    }),
  }, { fingerprint: async () => "unchanged" }, { beforeStage: () => ({ stageKey: "route-and-sources" }) })

  const result = await scheduler.run(current.goal.goalId)
  const issues = current.store.listIssues(current.goal.goalId)

  assert.equal(result.status, "waiting")
  assert.equal(issues.length, 2)
  assert.equal(issues.every((issue) => issue.status === "repairing" && !issue.resolvedAt), true)
  current.store.close()
})

test("uses one recovery stage then waits after a second missing report", async () => {
  const states: Array<{ status: string; statusReason?: string }> = []
  const current = await setup((goal) => states.push({ status: goal.status, ...(goal.statusReason ? { statusReason: goal.statusReason } : {}) }))
  states.length = 0
  const prompts: string[] = []
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      prompts.push(command.prompt)
      return { state: "completed" }
    },
  }, { fingerprint: async () => "same" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(prompts.length, 2)
  assert.match(prompts[1]!, /没有收到有效的阶段汇报/)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /连续两个阶段没有提交进度汇报/)
  assert.equal(states[0]?.status, "active")
  assert.match(states[0]?.statusReason ?? "", /正在恢复/)
  assert.equal(states.at(-1)?.status, "waiting")
  current.store.close()
})

test("uses a read-only recovery Worker when a missing report left project changes", async () => {
  const current = await setup()
  const commands: GrowthStageRunCommand[] = []
  const fingerprints = ["before", "after-write", "after-write", "after-write"]
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      commands.push(command)
      if (commands.length === 1) return { state: "completed" }
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "recovered-existing-files",
        payloadHash: "recovered-existing-files-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => fingerprints.shift() ?? "after-write" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(commands.length, 2)
  assert.equal(commands[1]?.workerProfile, "growth-recovery")
  assert.equal(commands[1]?.directFileMutation, "disabled")
  assert.match(commands[1]?.prompt ?? "", /项目文件已经发生变化/)
  assert.match(commands[1]?.prompt ?? "", /禁止编辑、创建、删除文件或提交图片/)
  current.store.close()
})

test("retries a blueprint stage three times only for a known Provider transport failure", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      if (runs < 3) return {
        state: "failed",
        reason: "terminated: SocketError: other side closed (UND_ERR_SOCKET)",
        failure: {
          code: "runtime",
          message: "运行时错误。",
          detail: "terminated: SocketError: other side closed (UND_ERR_SOCKET)",
        },
      }
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "transport-recovered-report",
        payloadHash: "transport-recovered-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => `fingerprint-${runs}` }, { beforeStage: () => ({ stageKey: "twelve-layer-skeleton" }) })

  const result = await scheduler.run(current.goal.goalId)
  const issues = current.store.listIssues(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(runs, 3)
  assert.equal(issues.length, 2)
  assert.equal(issues.every((issue) => issue.status === "resolved"), true)
  assert.equal(issues.every((issue) => issue.detail?.includes("UND_ERR_SOCKET")), true)
  current.store.close()
})

test("persists a Worker tool failure before the stage returns and deduplicates terminal reconciliation", async () => {
  const current = await setup()
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command, _signal, onFailure) => {
      const failure = {
        source: "tool" as const,
        toolCallId: "tool-call-live-issue",
        toolName: "write_world_blueprint",
        error: { code: "blueprint_conflict", message: "世界蓝图与现有状态冲突。", detail: "partial blueprint batch" },
      } satisfies GrowthStageFailure
      onFailure?.(failure)
      assert.equal(current.store.listIssues(command.goalId).length, 1)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "recovered-stage-report",
        payloadHash: "recovered-stage-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed", failures: [failure] }
    },
  }, { fingerprint: async () => "recovered" }, { beforeStage: () => ({ stageKey: "world-blueprint-create" }) })

  const result = await scheduler.run(current.goal.goalId)
  const issues = current.store.listIssues(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.status, "resolved")
  current.store.close()
})

test("stops after three Provider transport failures with an accurate unresolved Issue", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      return {
        state: "failed",
        failure: {
          code: "runtime",
          message: "运行时错误。",
          detail: "terminated: SocketError: other side closed (UND_ERR_SOCKET)",
        },
      }
    },
  }, { fingerprint: async () => "unchanged" }, { beforeStage: () => ({ stageKey: "twelve-layer-skeleton" }) })

  const result = await scheduler.run(current.goal.goalId)
  const issues = current.store.listIssues(current.goal.goalId)

  assert.equal(result.status, "waiting")
  assert.equal(runs, 3)
  assert.equal(issues.length, 3)
  assert.equal(issues.every((issue) => issue.status === "repairing"), true)
  assert.equal(issues.every((issue) => issue.summary === "模型服务连接中断，正在从持久蓝图继续有限重试。"), true)
  current.store.close()
})

test("waits after three reported stages without material progress", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: `report-${runs}`,
        payloadHash: `hash-${runs}`,
        outcome: "continue",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "unchanged" }, { beforeStage: () => ({ stageKey: "same-stage" }) })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 3)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /连续三个阶段没有检测到文件、图片或计划变化/)
  current.store.close()
})

test("does not carry stagnant fingerprints across product stage boundaries", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: `cross-stage-report-${runs}`,
        payloadHash: `cross-stage-hash-${runs}`,
        outcome: runs === 4 ? "completed" : "continue",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "same-public-files" }, {
    beforeStage: (_goal, reports) => ({ stageKey: ["route", "skeleton", "blueprint", "materialization"][reports] ?? "materialization" }),
  })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 4)
  assert.equal(result.status, "completed")
  current.store.close()
})

test("recovers an ordinary Runner exception through the persisted missing path", async () => {
  const current = await setup()
  let runs = 0
  const prompts: string[] = []
  const runner: GrowthStageRunnerPort = {
    runGrowthStage: async (command) => {
      runs += 1
      if (runs === 1) throw new Error("simulated process boundary")
      prompts.push(command.prompt)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "recovered-report",
        payloadHash: "recovered-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }
  const scheduler = new GrowthScheduler(current.store, runner, { fingerprint: async () => "same" })
  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(runs, 2)
  assert.equal(current.store.countConsecutiveMissingStageAttempts(current.goal.goalId), 0)
  assert.match(prompts[0] ?? "", /没有收到有效的阶段汇报/)
  current.store.close()
})

test("persists repeated Runner exceptions and waits without rejecting the drain", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      throw new Error(`simulated Runner failure ${runs}`)
    },
  }, { fingerprint: async () => "same" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "waiting")
  assert.equal(runs, 2)
  assert.equal(current.store.countConsecutiveMissingStageAttempts(current.goal.goalId), 2)
  assert.match(result.statusReason ?? "", /连续两个阶段没有提交进度汇报/)
  current.store.close()
})

test("waits without starting a Worker when the pre-stage project evidence cannot be read", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      return { state: "completed" }
    },
  }, { fingerprint: async () => { throw new Error("project scan failed") } })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 0)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /阶段开始前的项目证据/)
  assert.equal(current.store.countConsecutiveMissingStageAttempts(current.goal.goalId), 0)
  current.store.close()
})

test("waits without starting a Worker when stage policy resolution fails", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      return { state: "completed" }
    },
  }, { fingerprint: async () => "unused" }, { beforeStage: () => { throw new Error("policy state is unreadable") } })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 0)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /无法确定下一个阶段/)
  current.store.close()
})

test("keeps a committed stage receipt and waits when post-stage project evidence cannot be read", async () => {
  const current = await setup()
  let fingerprints = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      const progressed = current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "post-evidence-report",
        payloadHash: "post-evidence-hash",
        outcome: "continue",
        requiredImageTaskIds: [],
      }).goal
      current.store.markOwnerReplyPending(progressed.goalId, progressed.version)
      return { state: "completed" }
    },
  }, { fingerprint: async () => {
    fingerprints += 1
    if (fingerprints === 2) throw new Error("post-stage scan failed")
    return "before"
  } })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /回执已经提交/)
  assert.equal(result.ownerReplyPending, undefined)
  assert.equal(current.store.countProgressReceipts(current.goal.goalId), 1)
  assert.equal(current.store.countConsecutiveMissingStageAttempts(current.goal.goalId), 0)
  current.store.close()
})

test("recognizes a durable receipt without exact Goal version plus one coupling", async () => {
  const current = await setup()
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      current.store.describeActiveRecovery(command.goalId, command.expectedVersion, "unrelated durable status detail")
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: "durable-report",
        payloadHash: "durable-report-hash",
        outcome: "completed",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "changed" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(result.status, "completed")
  assert.equal(current.store.countConsecutiveMissingStageAttempts(current.goal.goalId), 0)
  current.store.close()
})

test("resets the stagnation guard when the progress fingerprint changes", async () => {
  const current = await setup()
  let runs = 0
  const fingerprints = ["base", "base", "base", "changed", "changed", "changed", "changed", "changed", "changed", "changed"]
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: `report-${runs}`,
        payloadHash: `hash-${runs}`,
        outcome: runs === 5 ? "completed" : "continue",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => fingerprints.shift() ?? "changed" })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 5)
  assert.equal(result.status, "completed")
  current.store.close()
})

test("applies a bounded stage policy and waits when finalization still reports continue", async () => {
  const current = await setup()
  let runs = 0
  const prompts: string[] = []
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (command) => {
      runs += 1
      prompts.push(command.prompt)
      current.store.commitProgress({
        goalId: command.goalId,
        expectedVersion: command.expectedVersion,
        reportId: `report-${runs}`,
        payloadHash: `hash-${runs}`,
        outcome: "continue",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => `run-${runs}` }, {
    beforeStage: (_goal, completedReports) => completedReports < 2 ? undefined : {
      stageInstruction: "这是唯一的最终收束阶段，不得报告 continue。",
      waitAfterContinueReason: "自动阶段预算已经用完。",
    },
  })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 3)
  assert.doesNotMatch(prompts[1]!, /阶段策略/)
  assert.match(prompts[2]!, /阶段策略：这是唯一的最终收束阶段/)
  assert.equal(result.status, "waiting")
  assert.equal(result.statusReason, "自动阶段预算已经用完。")
  assert.equal(current.store.countProgressReceipts(current.goal.goalId), 3)
  current.store.close()
})

test("passes a policy-owned iteration budget only to its bounded stage", async () => {
  const current = await setup()
  let command: GrowthStageRunCommand | undefined
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async (received) => {
      command = received
      current.store.commitProgress({
        goalId: received.goalId,
        expectedVersion: received.expectedVersion,
        reportId: "blueprint-report",
        payloadHash: "blueprint-hash",
        outcome: "waiting",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "blueprint" }, {
    beforeStage: () => ({ maxIterations: 48 }),
  })

  await scheduler.run(current.goal.goalId)

  assert.equal(command?.maxIterations, 48)
  current.store.close()
})

test("passes the persisted world entry identity and work root into the trusted Cline stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Growth Scheduler World Entry "))
  roots.push(root)
  const store = new GrowthGoalStore(join(root, "growth.sqlite"))
  const original = store.create({ requestId: "original", projectId: "project-1", sessionId: "session-1", instruction: "旧世界", worldEntryMode: "create", worldEntryStage: "blueprint-create" })
  const rooted = store.commitProgress({ goalId: original.goalId, expectedVersion: original.version, reportId: "root", payloadHash: "root-hash", outcome: "continue", workRootPath: "旧世界", requiredImageTaskIds: [] }).goal
  const terminal = store.transition({ goalId: rooted.goalId, expectedVersion: rooted.version, status: "cancelled" })
  const goal = store.create({ requestId: "successor", projectId: "project-1", sessionId: "session-1", instruction: "继续旧世界", worldEntryMode: "continue", worldEntryStage: "blueprint-review", predecessorGoalId: terminal.goalId, workRootPath: "旧世界" })
  let command: GrowthStageRunCommand | undefined
  const scheduler = new GrowthScheduler(store, {
    runGrowthStage: async (received) => {
      command = received
      store.commitProgress({ goalId: received.goalId, expectedVersion: received.expectedVersion, reportId: "continued", payloadHash: "continued-hash", outcome: "waiting", requiredImageTaskIds: [] })
      return { state: "completed" }
    },
  }, { fingerprint: async () => "continued" })

  await scheduler.run(goal.goalId)

  assert.equal(command?.worldEntryMode, "continue")
  assert.equal(command?.worldEntryStage, "blueprint-review")
  assert.equal(command?.workRootPath, "旧世界")
  store.close()
})

test("stops before launching a stage that requires a missing persisted work root", async () => {
  const current = await setup()
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      return { state: "completed" }
    },
  }, { fingerprint: async () => "same" }, {
    beforeStage: () => ({ requireWorkRoot: true }),
  })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 0)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /缺少经过验证并持久化的统一作品根/)
  current.store.close()
})

test("delegates a policy-owned materialization stage without launching a generic Cline stage", async () => {
  const current = await setup()
  current.store.commitProgress({
    goalId: current.goal.goalId,
    expectedVersion: 1,
    reportId: "blueprint",
    payloadHash: "blueprint-hash",
    outcome: "continue",
    workRootPath: "世界",
    requiredImageTaskIds: [],
  })
  let genericRuns = 0
  let coordinatedRuns = 0
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      genericRuns += 1
      return { state: "completed" }
    },
  }, { fingerprint: async () => "materialized" }, {
    beforeStage: () => ({ executionMode: "world-materialization", requireWorkRoot: true }),
  }, {
    run: async (goal, mode, ownerActivationId) => {
      coordinatedRuns += 1
      assert.equal(mode, "world-materialization")
      assert.equal(ownerActivationId, "activation-materialization")
      current.store.commitProgress({
        goalId: goal.goalId,
        expectedVersion: goal.version,
        reportId: "layer-1",
        payloadHash: "layer-1-hash",
        outcome: "waiting",
        requiredImageTaskIds: [],
      })
      return { state: "completed" }
    },
  })

  const result = await scheduler.run(current.goal.goalId, "activation-materialization")

  assert.equal(genericRuns, 0)
  assert.equal(coordinatedRuns, 1)
  assert.equal(result.status, "waiting")
  current.store.close()
})

test("stops a failed materialization stage immediately with its classified reason", async () => {
  const current = await setup()
  current.store.commitProgress({ goalId: current.goal.goalId, expectedVersion: 1, reportId: "blueprint", payloadHash: "blueprint-hash", outcome: "continue", workRootPath: "世界", requiredImageTaskIds: [] })
  let runs = 0
  const scheduler = new GrowthScheduler(current.store, { runGrowthStage: async () => ({ state: "completed" }) }, { fingerprint: async () => "same" }, {
    beforeStage: () => ({ executionMode: "world-materialization", requireWorkRoot: true }),
  }, {
    run: async () => {
      runs += 1
      throw new Error("growth_conflict: 正文存在但没有有效回执")
    },
  })

  const result = await scheduler.run(current.goal.goalId)

  assert.equal(runs, 1)
  assert.equal(result.status, "waiting")
  assert.match(result.statusReason ?? "", /正文存在但没有有效回执/)
  current.store.close()
})

test("does not schedule after an outstanding stage is paused", async () => {
  const current = await setup()
  let release: () => void = () => undefined
  let runs = 0
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const scheduler = new GrowthScheduler(current.store, {
    runGrowthStage: async () => {
      runs += 1
      await blocked
      return { state: "completed" }
    },
  }, { fingerprint: async () => "same" })
  const draining = scheduler.run(current.goal.goalId)
  await new Promise((resolve) => setTimeout(resolve, 10))
  current.store.transition({ goalId: current.goal.goalId, expectedVersion: 1, status: "paused", reason: "用户暂停" })
  release()

  const result = await draining

  assert.equal(runs, 1)
  assert.equal(result.status, "paused")
  current.store.close()
})
