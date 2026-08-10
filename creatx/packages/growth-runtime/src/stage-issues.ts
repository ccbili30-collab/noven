import { createHash } from "node:crypto"
import type { GrowthStageFailure, GrowthStageRunResult } from "@creatx/contracts"
import { GrowthGoalStore } from "./store.ts"

const blueprintStages = new Set(["route-and-sources", "twelve-layer-skeleton", "world-blueprint-create", "world-blueprint-confirm"])

export class GrowthStageIssueService {
  private readonly store: GrowthGoalStore

  constructor(store: GrowthGoalStore) {
    this.store = store
  }

  recordFailures(goalId: string, attempt: { attemptId: string; stageKey: string }, result: GrowthStageRunResult) {
    if (!blueprintStages.has(attempt.stageKey)) return []
    const failures = dedupeFailures(result.failures ?? (result.failure ? [{ source: "runtime" as const, error: result.failure }] : []))
    return failures.map((failure) => this.recordFailure(goalId, attempt, failure)).filter((issue) => issue !== undefined)
  }

  recordFailure(goalId: string, attempt: { attemptId: string; stageKey: string }, failure: GrowthStageFailure) {
    if (!blueprintStages.has(attempt.stageKey)) return undefined
    const classified = classifyStageFailure(failure)
    const dedupeKey = `${attempt.attemptId}:${failure.toolCallId ? `tool:${failure.toolCallId}` : `runtime:${failure.error.code}:${hash(failure.error.detail ?? failure.error.message)}`}`
    const issue = this.store.recordIssue({
      issueId: `issue_${hash(`${goalId}\0${dedupeKey}`).slice(0, 24)}`,
      dedupeKey,
      goalId,
      stageAttemptId: attempt.attemptId,
      errorCode: classified.errorCode,
      impact: "repairable",
      summary: classified.summary,
      detail: classified.detail,
      affectedObjectIds: [],
    })
    if (issue.status !== "detected") return issue
    return this.store.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "repairing", attemptCount: 1 })
  }

  missingAttemptLimit(result: GrowthStageRunResult | undefined) {
    return result && hasRetryableProviderTransportFailure(result) ? 3 : 2
  }

  reconcileReportedStage(goalId: string, stageKey: string, rootWorkbenchVerified: boolean) {
    if (!blueprintStages.has(stageKey)) return []
    return this.store.listIssuesForStage(goalId, stageKey).flatMap((issue) => {
      if (issue.status === "resolved" || issue.status === "bypassed" || issue.status === "waiting_user") return []
      if (issue.errorCode === "blueprint_redundant_workbench_registration") {
        if (!rootWorkbenchVerified) return []
        return [this.store.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "bypassed", summary: "统一作品根工作台已经由蓝图初始化建立，重复注册不影响蓝图结果，已自动绕过。" })]
      }
      return [this.store.transitionIssue({ issueId: issue.issueId, expectedVersion: issue.version, status: "resolved", summary: "蓝图阶段已提交可信进度回执，先前问题已经在本阶段内修正。" })]
    })
  }
}

function dedupeFailures(failures: readonly GrowthStageFailure[]) {
  const values = new Map<string, GrowthStageFailure>()
  for (const failure of failures) {
    const key = failure.toolCallId ? `tool:${failure.toolCallId}` : `runtime:${failure.error.code}:${failure.error.detail ?? failure.error.message}`
    if (!values.has(key)) values.set(key, failure)
  }
  return [...values.values()]
}

function classifyStageFailure(failure: GrowthStageFailure) {
  const detail = [failure.toolName ? `tool=${failure.toolName}` : undefined, failure.error.detail ?? failure.error.message].filter((value): value is string => Boolean(value)).join("\n")
  if (failure.toolName === "register_workbench") return {
    errorCode: "blueprint_redundant_workbench_registration",
    summary: "蓝图阶段尝试重复注册统一作品根工作台，正在核对权威工作台状态。",
    detail,
  }
  if (isRetryableProviderTransportFailure(failure)) return {
    errorCode: failure.error.code,
    summary: "模型服务连接中断，正在从持久蓝图继续有限重试。",
    detail,
  }
  return {
    errorCode: failure.error.code,
    summary: failure.error.code === "blueprint_conflict" ? "蓝图动作与当前权威状态冲突，正在从持久状态修复。" : "蓝图阶段工具输入无效，正在按可信阶段合同修复。",
    detail,
  }
}

function hasRetryableProviderTransportFailure(result: GrowthStageRunResult) {
  return (result.failures ?? (result.failure ? [{ source: "runtime" as const, error: result.failure }] : []))
    .some(isRetryableProviderTransportFailure)
}

function isRetryableProviderTransportFailure(failure: GrowthStageFailure) {
  if (failure.source !== "runtime") return false
  const detail = `${failure.error.message}\n${failure.error.detail ?? ""}`.toLocaleLowerCase("en-US")
  return ["und_err_socket", "socketerror", "other side closed", "econnreset", "etimedout", "fetch failed"].some((value) => detail.includes(value))
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
