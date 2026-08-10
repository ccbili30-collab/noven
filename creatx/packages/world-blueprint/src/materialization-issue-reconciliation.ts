import type { GrowthIssueProjection } from "@creatx/contracts"
import type { MaterializationObjectOutcome } from "./materialization-terminal.ts"

export interface MaterializationIssueTransition {
  issueId: string
  expectedVersion: number
  status: "resolved" | "bypassed" | "needs_help"
  summary: string
  impact?: "local"
}

export function planMaterializationIssueReconciliation(input: {
  issues: readonly GrowthIssueProjection[]
  outcomes: readonly MaterializationObjectOutcome[]
  terminalizing: boolean
}): MaterializationIssueTransition[] {
  const outcomes = new Map(input.outcomes.map((outcome) => [outcome.objectId, outcome]))
  return input.issues.flatMap<MaterializationIssueTransition>((issue) => {
    if (issue.status === "resolved" || issue.status === "bypassed" || issue.status === "waiting_user") return []
    const affected = issue.affectedObjectIds.map((objectId) => outcomes.get(objectId)).filter((outcome): outcome is MaterializationObjectOutcome => Boolean(outcome))
    if (!affected.length) return []
    if (affected.every((outcome) => outcome.status === "completed" || outcome.status === "accepted-existing")) {
      return [{ issueId: issue.issueId, expectedVersion: issue.version, status: "resolved", summary: "对象已经形成可信物化回执，相关自动修复问题已解决。" }]
    }
    if (affected.every((outcome) => outcome.status === "bypassed-missing")) {
      return [{ issueId: issue.issueId, expectedVersion: issue.version, status: "bypassed", summary: "对象已经安全绕过，相关自动修复问题已收口。" }]
    }
    if (input.terminalizing && (issue.status === "detected" || issue.status === "repairing")) {
      return [{ issueId: issue.issueId, expectedVersion: issue.version, status: "needs_help", impact: "local", summary: "调度已经结束，但该对象仍缺少可信完成证据，需要后续返工。" }]
    }
    return []
  })
}
