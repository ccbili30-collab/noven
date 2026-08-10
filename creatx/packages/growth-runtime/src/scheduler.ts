import { CREATX_INTERNAL_GROWTH_STAGE, type GrowthGoalProjection, type GrowthStageFailure, type GrowthStageRunCommand, type GrowthStageRunResult, type GrowthWorkerProfile } from "@creatx/contracts"
import { GrowthGoalStore } from "./store.ts"
import { GrowthStageIssueService } from "./stage-issues.ts"

const MISSING_REPORT_REASON = "连续两个阶段没有提交进度汇报，Growth 已停止等待用户检查。"
const STAGNATION_REASON = "连续三个阶段没有检测到文件、图片或计划变化，Growth 已停止等待用户检查。"
const RECOVERY_REASON = "上一个阶段没有提交有效进度汇报，Growth 正在恢复并检查真实产物。"

export interface GrowthStageRunnerPort {
  runGrowthStage(command: GrowthStageRunCommand, signal?: AbortSignal, onFailure?: (failure: GrowthStageFailure) => void): Promise<GrowthStageRunResult>
}

export interface GrowthStageCoordinatorPort {
  run(goal: GrowthGoalProjection, executionMode: "world-materialization", ownerActivationId?: string): Promise<GrowthStageRunResult>
}

export interface GrowthProgressSnapshotPort {
  fingerprint(goal: GrowthGoalProjection): Promise<string>
  requiredImageStatuses?(goal: GrowthGoalProjection): Promise<GrowthRequiredImageStatus[]>
}

export interface GrowthRequiredImageStatus {
  imageTaskId: string
  status: "queued" | "generating" | "succeeded" | "failed" | "interrupted" | "cancelled" | "unknown"
  relativePath?: string
  errorCode?: string
}

export interface GrowthStagePolicyDecision {
  stageKey?: string
  executionMode?: "cline" | "world-materialization"
  stageInstruction?: string
  workRootArtifactName?: string
  requireWorkRoot?: boolean
  waitAfterContinueReason?: string
  preventCompletion?: boolean
  successfulReportOutcome?: "continue"
  requiredWorkbenchRoot?: boolean
  maxIterations?: number
  workerProfile?: GrowthWorkerProfile
  trustedArtifactSource?: "world-blueprint"
  validateArtifacts?: (artifacts: readonly GrowthStageArtifactEvidence[]) => string | undefined
}

export interface GrowthStageArtifactEvidence {
  relativePath: string
  text?: string
}

export interface GrowthStagePolicyPort {
  beforeStage(goal: GrowthGoalProjection, completedReports: number): GrowthStagePolicyDecision | undefined
}

export class GrowthScheduler {
  private readonly drains = new Map<string, Promise<GrowthGoalProjection>>()
  private readonly drainActivations = new Map<string, string | undefined>()
  private readonly store: GrowthGoalStore
  private readonly runner: GrowthStageRunnerPort
  private readonly progress: GrowthProgressSnapshotPort
  private readonly policy: GrowthStagePolicyPort | undefined
  private readonly coordinator: GrowthStageCoordinatorPort | undefined
  private readonly stageIssues: GrowthStageIssueService

  constructor(
    store: GrowthGoalStore,
    runner: GrowthStageRunnerPort,
    progress: GrowthProgressSnapshotPort,
    policy?: GrowthStagePolicyPort,
    coordinator?: GrowthStageCoordinatorPort,
  ) {
    this.store = store
    this.runner = runner
    this.progress = progress
    this.policy = policy
    this.coordinator = coordinator
    this.stageIssues = new GrowthStageIssueService(store)
  }

  run(goalId: string, ownerActivationId?: string, signal?: AbortSignal): Promise<GrowthGoalProjection> {
    signal?.throwIfAborted()
    const active = this.drains.get(goalId)
    if (active) {
      if (this.drainActivations.get(goalId) !== ownerActivationId) throw new Error("growth_conflict: Goal is already running under another Owner activation")
      return active.then(() => {
        const current = requireGoal(this.store, goalId)
        if (current.status !== "active") return current
        return this.run(goalId, ownerActivationId, signal)
      })
    }
    const drain = this.drain(goalId, ownerActivationId, signal).finally(() => {
      if (this.drains.get(goalId) === drain) {
        this.drains.delete(goalId)
        this.drainActivations.delete(goalId)
      }
    })
    this.drains.set(goalId, drain)
    this.drainActivations.set(goalId, ownerActivationId)
    return drain
  }

  runAfterCurrent(goalId: string, ownerActivationId: string): Promise<GrowthGoalProjection> {
    const active = this.drains.get(goalId)
    if (!active) return this.run(goalId, ownerActivationId)
    return active.then(() => this.run(goalId, ownerActivationId))
  }

  private async drain(goalId: string, ownerActivationId?: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const initial = requireGoal(this.store, goalId)
    if (initial.status !== "active") return initial
    if (initial.ownerReplyPending) return initial
    while (true) {
      signal?.throwIfAborted()
      const expected = requireGoal(this.store, goalId)
      if (expected.status !== "active") return expected
      if (expected.ownerReplyPending) return expected
      const policyResult = resolveStagePolicy(this.policy, expected, this.store.countProgressReceipts(goalId))
      if ("error" in policyResult) {
        return this.store.transition({
          goalId,
          expectedVersion: expected.version,
          status: "waiting",
          reason: `Growth 无法确定下一个阶段，已停止等待检查：${policyResult.error}`,
        })
      }
      const policy = policyResult.decision
      if (policy?.requireWorkRoot && !expected.workRootPath) {
        return this.store.transition({
          goalId,
          expectedVersion: expected.version,
          status: "waiting",
          reason: "当前 Growth 阶段缺少经过验证并持久化的统一作品根，已在文件操作前停止。",
        })
      }
      const reportCountBefore = this.store.countProgressReceipts(goalId)
      const fingerprintBefore = await this.progress.fingerprint(expected).catch((error) => this.store.transition({
        goalId,
        expectedVersion: expected.version,
        status: "waiting",
        reason: `Growth 无法读取阶段开始前的项目证据，已停止等待检查：${error instanceof Error ? error.message : String(error)}`,
      }))
      if (typeof fingerprintBefore !== "string") return fingerprintBefore
      const recovery = this.store.countConsecutiveMissingStageAttempts(goalId) === 1
      const readOnlyRecovery = recovery && !policy?.workerProfile && this.store.missingStageRequiresReadOnlyRecovery(goalId, fingerprintBefore)
      const attempt = this.store.beginStageAttempt({
        goalId,
        stageKey: policy?.stageKey ?? `bounded-stage-${reportCountBefore + 1}`,
        startedVersion: expected.version,
        reportCountBefore,
        fingerprintBefore,
      })
      let stageResult: GrowthStageRunResult | undefined
      try {
        if (policy?.executionMode === "world-materialization") {
          if (!this.coordinator) throw new Error("growth_invalid: world materialization coordinator is unavailable")
          stageResult = await this.coordinator.run(expected, policy.executionMode, ownerActivationId)
        } else {
          const requiredImageStatuses = await this.progress.requiredImageStatuses?.(expected) ?? []
          const latestSteer = this.store.latestSteer(goalId)
          stageResult = await this.runner.runGrowthStage({
            goalId: expected.goalId,
            projectId: expected.projectId,
            sessionId: expected.sessionId,
            ...(ownerActivationId ? { ownerActivationId } : {}),
            expectedVersion: expected.version,
            stageKey: attempt.stageKey,
            attemptId: attempt.attemptId,
            ...(expected.worldEntryMode ? { worldEntryMode: expected.worldEntryMode } : {}),
            ...(expected.worldEntryStage ? { worldEntryStage: expected.worldEntryStage } : {}),
            ...(expected.workRootPath ? { workRootPath: expected.workRootPath } : {}),
            prompt: assembleGrowthStagePrompt(expected, recovery, requiredImageStatuses, policy?.stageInstruction, latestSteer, readOnlyRecovery),
            ...(policy?.maxIterations ? { maxIterations: policy.maxIterations } : {}),
            ...(readOnlyRecovery ? { workerProfile: "growth-recovery" as const, directFileMutation: "disabled" as const } : policy?.workerProfile ? { workerProfile: policy.workerProfile } : {}),
          }, signal, (failure) => this.stageIssues.recordFailure(expected.goalId, attempt, failure))
        }
        if (stageResult) this.stageIssues.recordFailures(expected.goalId, attempt, stageResult)
      } catch (error) {
        const changed = requireGoal(this.store, goalId)
        const fingerprintAfter = await this.progress.fingerprint(changed).catch(() => undefined)
        this.store.finishStageAttempt({ attemptId: attempt.attemptId, status: "missing", ...(fingerprintAfter ? { fingerprintAfter } : {}) })
        if (changed.version !== expected.version || changed.status !== "active") return changed
        if (policy?.executionMode === "world-materialization") {
          return this.store.transition({
            goalId,
            expectedVersion: changed.version,
            status: "waiting",
            reason: `正文物化已停止：${error instanceof Error ? error.message : String(error)}`,
          })
        }
        if (this.store.countConsecutiveMissingStageAttempts(goalId) < 2) {
          this.store.describeActiveRecovery(goalId, changed.version, RECOVERY_REASON)
          continue
        }
        return this.store.transition({
          goalId,
          expectedVersion: changed.version,
          status: "waiting",
          reason: MISSING_REPORT_REASON,
        })
      }

      const current = requireGoal(this.store, goalId)
      const receipt = this.store.latestProgressReceiptAfter(goalId, reportCountBefore)
      if (!receipt) {
        const fingerprintAfter = await this.progress.fingerprint(current).catch(() => undefined)
        this.store.finishStageAttempt({ attemptId: attempt.attemptId, status: "missing", ...(fingerprintAfter ? { fingerprintAfter } : {}) })
        if (current.version !== expected.version || current.status !== "active") return current
        if (this.store.countConsecutiveMissingStageAttempts(goalId) < this.stageIssues.missingAttemptLimit(stageResult)) {
          this.store.describeActiveRecovery(goalId, current.version, RECOVERY_REASON)
          continue
        }
        return this.store.transition({
          goalId,
          expectedVersion: current.version,
          status: "waiting",
          reason: MISSING_REPORT_REASON,
        })
      }

      const fingerprint = await this.progress.fingerprint(current).catch(() => undefined)
      if (fingerprint === undefined) {
        this.store.finishStageAttempt({ attemptId: attempt.attemptId, status: "reported", reportId: receipt.reportId })
        const reconciliationFailure = this.reconcileReportedStage(expected, attempt.stageKey, policy?.requiredWorkbenchRoot === true)
        if (reconciliationFailure) return reconciliationFailure
        const reconciled = requireGoal(this.store, goalId)
        if (reconciled.status !== "active") return reconciled
        if (reconciled.ownerReplyPending) {
          return this.store.waitOwnerReplyPendingGoal(reconciled.goalId, reconciled.version, "阶段完成回执已经提交，但 Growth 无法读取更新后的项目证据，已停止并取消本次完成交付。")
        }
        return this.store.transition({
          goalId,
          expectedVersion: reconciled.version,
          status: "waiting",
          reason: "阶段结果已经提交，但 Growth 无法读取更新后的项目证据，已停止以避免重复副作用。",
        })
      }
      this.store.finishStageAttempt({ attemptId: attempt.attemptId, status: "reported", reportId: receipt.reportId, fingerprintAfter: fingerprint })
      const reconciliationFailure = this.reconcileReportedStage(expected, attempt.stageKey, policy?.requiredWorkbenchRoot === true)
      if (reconciliationFailure) return reconciliationFailure
      const reconciled = requireGoal(this.store, goalId)
      if (reconciled.status !== "active") return reconciled
      if (reconciled.ownerReplyPending) return reconciled
      if (policy?.waitAfterContinueReason) {
        return this.store.transition({
          goalId,
          expectedVersion: reconciled.version,
          status: "waiting",
          reason: policy.waitAfterContinueReason,
        })
      }
      if (this.store.countConsecutiveStagnantStageAttempts(goalId, attempt.stageKey) < 3) continue
      return this.store.transition({
        goalId,
        expectedVersion: current.version,
        status: "waiting",
        reason: STAGNATION_REASON,
      })
    }
  }

  private reconcileReportedStage(expected: GrowthGoalProjection, stageKey: string, requiredWorkbenchRoot: boolean) {
    try {
      this.stageIssues.reconcileReportedStage(expected.goalId, stageKey, requiredWorkbenchRoot)
      return undefined
    } catch (error) {
      const current = requireGoal(this.store, expected.goalId)
      if (current.status !== "active") return current
      const reason = `阶段结果已经提交，但 Growth 无法完成问题对账，已停止以避免重复副作用：${error instanceof Error ? error.message : String(error)}`
      if (current.ownerReplyPending) return this.store.waitOwnerReplyPendingGoal(current.goalId, current.version, reason)
      return this.store.transition({
        goalId: current.goalId,
        expectedVersion: current.version,
        status: "waiting",
        reason,
      })
    }
  }
}

function resolveStagePolicy(policy: GrowthStagePolicyPort | undefined, goal: GrowthGoalProjection, completedReports: number): { decision: GrowthStagePolicyDecision | undefined } | { error: string } {
  try {
    return { decision: policy?.beforeStage(goal, completedReports) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function assembleGrowthStagePrompt(goal: GrowthGoalProjection, recovery: boolean, requiredImageStatuses: GrowthRequiredImageStatus[] = [], stageInstruction?: string, latestSteer?: string, readOnlyRecovery = false) {
  const recoveryInstruction = recovery
    ? readOnlyRecovery
      ? "上一个阶段没有提交有效汇报，但项目文件已经发生变化。本次是只读恢复：核对真实文件并为已经完成的工作补交 report_growth_progress；若文件只完成一部分或结果无法确认，如实报告 waiting。禁止编辑、创建、删除文件或提交图片。"
      : "上一个阶段结束后没有收到有效的阶段汇报，且项目文件指纹未变化。请检查真实项目文件与当前计划，只恢复尚未完成的工作，不要重复已完成的副作用。"
    : "继续执行这个 Growth 目标的下一个有界阶段。"
  const stagePrompt = goal.version === 1 && !recovery
    ? `/growth\n${goal.instruction}`
    : `/growth
${CREATX_INTERNAL_GROWTH_STAGE}
${recoveryInstruction}

目标：${goal.instruction}
当前 Goal 版本：${goal.version}
${goal.planFileId ? `计划文件 ID：${goal.planFileId}\n` : ""}阶段结束前必须调用 report_growth_progress，并只引用已经存在的真实文件和图片任务。若目标已经完成、需要用户决定或已失败，请如实报告对应结果。`
  const workRootPrompt = goal.workRootPath ? `\n统一作品根（项目相对路径，由 Runtime 从已验证产物持久恢复）：${goal.workRootPath}\n必须逐字使用这个前缀；不要搜索、猜测或改名作品根。` : ""
  return stagePrompt
    + workRootPrompt
    + (stageInstruction ? `\n\n阶段策略：${stageInstruction}` : "")
    + (latestSteer ? `\n\n最新用户修正（持久记录，优先于旧计划和旧摘要）：\n${latestSteer}\n先把修正写入正式世界真相与计划，标出受影响下游，再继续文件束。` : "")
    + (requiredImageStatuses.length ? `\n\n当前必需图片任务真实状态：\n${requiredImageStatuses.map((image) => `- ${image.imageTaskId} | ${image.status} | ${image.relativePath ?? "unknown-path"}${image.errorCode ? ` | ${image.errorCode}` : ""}`).join("\n")}\n失败或中断的任务不会自行恢复；需要该视觉时，用新的幂等键重试同一目标路径。` : "")
}

function requireGoal(store: GrowthGoalStore, goalId: string) {
  const goal = store.get(goalId)
  if (!goal) throw new Error("growth_invalid: Goal does not exist")
  return goal
}
