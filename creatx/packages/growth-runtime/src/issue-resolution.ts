import type { CreatXError, CreatXToolContribution, GrowthGoalProjection, GrowthIssueProjection } from "@creatx/contracts"
import { GrowthGoalStore } from "./store.ts"
import { createGrowthOwnerControllerResult } from "./owner-activation.ts"

export interface GrowthIssueResolutionPort {
  prepare(issue: GrowthIssueProjection, goal: GrowthGoalProjection, resolution: GrowthIssueResolution): Promise<void>
  resumed(goal: GrowthGoalProjection, ownerActivationId: string): Promise<GrowthGoalProjection>
}

export type GrowthIssueResolutionAction = "retry" | "repair" | "accept" | "bypass"

export interface GrowthIssueResolution {
  action: GrowthIssueResolutionAction
  summary: string
}

export class GrowthIssueResolutionService {
  private readonly store: GrowthGoalStore
  private readonly resolution: GrowthIssueResolutionPort

  constructor(store: GrowthGoalStore, resolution: GrowthIssueResolutionPort) {
    this.store = store
    this.resolution = resolution
  }

  tool(): CreatXToolContribution {
    return {
      name: "resolve_growth_issue",
      audiences: ["owner-growth-issue"],
      description: "Resolve the one blocking Growth issue trusted by the current project and user reply. Choose retry, repair, accept, or bypass when the user's answer makes that action safe. If more information is needed, ask the user normally and do not call this tool.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["action", "summary"],
        properties: {
          action: { type: "string", enum: ["retry", "repair", "accept", "bypass"], description: "Retry unchanged work, repair the assigned artifact, accept existing durable output, or bypass the affected objects and continue." },
          summary: { type: "string", minLength: 1, maxLength: 1000, description: "Why the selected action is safe, what should change, and any user-visible consequence." },
        },
      },
      scope: "project",
      approval: "automatic",
      execute: async (input, context) => {
        try {
          if (!context.projectId) throw new Error("project_invalid: Growth issue resolution requires a project")
          if (!context.ownerActivationId || !context.toolCallId) throw new Error("growth_invalid: trusted Owner activation identity is missing")
          const claim = this.store.claimOwnerActivation({
            activationId: context.ownerActivationId,
            sessionId: context.sessionId,
            toolName: "resolve_growth_issue",
            toolCallId: context.toolCallId,
          })
          if (claim.duplicate) {
            if (!claim.activation.result) throw new Error("growth_conflict: duplicate issue controller call has no persisted result")
            return { ok: true, value: claim.activation.result }
          }
          const goal = claim.activation.goalId ? this.store.get(claim.activation.goalId) : undefined
          if (!goal || goal.projectId !== context.projectId || goal.sessionId !== context.sessionId || goal.status !== "waiting") throw new Error("growth_conflict: current session has no waiting Growth issue")
          this.store.bindOwnerActivationGoal({ activationId: context.ownerActivationId, toolCallId: context.toolCallId, goalId: goal.goalId })
          const issue = this.store.getWaitingIssue(goal.goalId)
          if (!issue) throw new Error("growth_conflict: waiting Goal has no blocking issue")
          const resolution = requireResolution(input)
          await this.resolution.prepare(issue, goal, resolution)
          const committed = this.store.resolveWaitingIssue({ goalId: goal.goalId, expectedGoalVersion: goal.version, issueId: issue.issueId, expectedIssueVersion: issue.version, status: resolution.action === "bypass" ? "bypassed" : "repairing", summary: resolution.summary, resolutionInstruction: `${resolution.action}: ${resolution.summary}` })
          const resumed = await this.resolution.resumed(committed.goal, context.ownerActivationId)
          const result = createGrowthOwnerControllerResult(context.ownerActivationId, resumed)
          this.store.recordOwnerActivationResult({ activationId: context.ownerActivationId, toolCallId: context.toolCallId, result })
          return { ok: true, value: result }
        } catch (error) {
          return { ok: false, error: issueResolutionError(error) }
        }
      },
    }
  }
}

function requireResolution(input: unknown): GrowthIssueResolution {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: issue resolution must be an object")
  const action = (input as { action?: unknown }).action
  if (action !== "retry" && action !== "repair" && action !== "accept" && action !== "bypass") throw new Error("growth_invalid: issue resolution action is invalid")
  const summary = (input as { summary?: unknown }).summary
  if (typeof summary !== "string" || !summary.trim() || summary.length > 1000) throw new Error("growth_invalid: issue resolution summary must contain 1 to 1000 characters")
  return { action, summary: summary.trim() }
}

function issueResolutionError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前问题不属于有效项目。", detail }
  if (detail.startsWith("growth_conflict")) return { code: "growth_conflict", message: "等待中的 Growth 问题已经变化。", detail }
  return { code: "growth_invalid", message: "Growth 问题解决回执无效。", detail }
}
