import { createHash } from "node:crypto"
import type { GrowthGoalProjection, GrowthOwnerControllerResult } from "@creatx/contracts"

export type GrowthOwnerActivationKind = "start" | "resume" | "issue"
export type GrowthOwnerActivationRoute = "growth" | "growth-world" | "growth-world-pro"
export type GrowthOwnerActivationStatus = "pending" | "running" | "result_ready" | "completed" | "failed" | "cancelled"

export interface GrowthOwnerActivationRow {
  activation_id: string
  kind: GrowthOwnerActivationKind
  route: GrowthOwnerActivationRoute | null
  session_id: string
  project_id: string
  goal_id: string | null
  prompt_hash: string
  instruction: string | null
  controller_tool_name: string
  tool_call_id: string | null
  status: GrowthOwnerActivationStatus
  result_json: string | null
  owner_reply_hash: string | null
  failure_reason: string | null
  delivery_source_activation_id: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface GrowthOwnerActivationProjection {
  activationId: string
  kind: GrowthOwnerActivationKind
  route?: GrowthOwnerActivationRoute | undefined
  sessionId: string
  projectId: string
  goalId?: string
  promptHash: string
  instruction?: string | undefined
  controllerToolName: string
  toolCallId?: string
  status: GrowthOwnerActivationStatus
  result?: GrowthOwnerControllerResult
  ownerReplyHash?: string
  failureReason?: string
  deliverySourceActivationId?: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateGrowthOwnerActivationCommand {
  activationId: string
  kind: GrowthOwnerActivationKind
  route?: GrowthOwnerActivationRoute | undefined
  sessionId: string
  projectId: string
  goalId?: string | undefined
  promptHash: string
  instruction?: string | undefined
  controllerToolName: string
}

export function normalizeOwnerActivation(command: CreateGrowthOwnerActivationCommand) {
  return {
    activationId: requireText(command.activationId, "activationId"),
    kind: requireKind(command.kind),
    route: command.route === undefined ? undefined : requireRoute(command.route),
    sessionId: requireText(command.sessionId, "sessionId"),
    projectId: requireText(command.projectId, "projectId"),
    goalId: command.goalId === undefined ? undefined : requireText(command.goalId, "goalId"),
    promptHash: requireText(command.promptHash, "promptHash"),
    instruction: command.instruction === undefined ? undefined : requireText(command.instruction, "instruction"),
    controllerToolName: requireText(command.controllerToolName, "controllerToolName"),
  }
}

export function sameOwnerActivation(row: GrowthOwnerActivationRow, command: ReturnType<typeof normalizeOwnerActivation>) {
  return row.kind === command.kind
    && row.route === (command.route ?? null)
    && row.session_id === command.sessionId
    && row.project_id === command.projectId
    && (command.kind === "start" && command.goalId === undefined || row.goal_id === (command.goalId ?? null))
    && row.prompt_hash === command.promptHash
    && row.instruction === (command.instruction ?? null)
    && row.controller_tool_name === command.controllerToolName
}

export function projectOwnerActivation(row: GrowthOwnerActivationRow): GrowthOwnerActivationProjection {
  return {
    activationId: requireText(row.activation_id, "persisted activationId"),
    kind: requireKind(row.kind),
    ...(row.route ? { route: requireRoute(row.route) } : {}),
    sessionId: requireText(row.session_id, "persisted activation sessionId"),
    projectId: requireText(row.project_id, "persisted activation projectId"),
    ...(row.goal_id ? { goalId: requireText(row.goal_id, "persisted activation goalId") } : {}),
    promptHash: requireText(row.prompt_hash, "persisted activation promptHash"),
    ...(row.instruction ? { instruction: requireText(row.instruction, "persisted activation instruction") } : {}),
    controllerToolName: requireText(row.controller_tool_name, "persisted activation controllerToolName"),
    ...(row.tool_call_id ? { toolCallId: requireText(row.tool_call_id, "persisted activation toolCallId") } : {}),
    status: requireStatus(row.status),
    ...(row.result_json ? { result: decodeOwnerControllerResult(row.result_json) } : {}),
    ...(row.owner_reply_hash ? { ownerReplyHash: requireText(row.owner_reply_hash, "persisted activation ownerReplyHash") } : {}),
    ...(row.failure_reason ? { failureReason: requireText(row.failure_reason, "persisted activation failureReason") } : {}),
    ...(row.delivery_source_activation_id ? { deliverySourceActivationId: requireText(row.delivery_source_activation_id, "persisted delivery source activationId") } : {}),
    createdAt: requireText(row.created_at, "persisted activation createdAt"),
    updatedAt: requireText(row.updated_at, "persisted activation updatedAt"),
    version: requirePositiveInteger(row.version, "persisted activation version"),
  }
}

export function encodeOwnerControllerResult(result: GrowthOwnerControllerResult) {
  if (result.status !== "ready_for_owner_reply") throw new Error("growth_invalid: unsupported Owner controller result status")
  return JSON.stringify({
    activationId: requireText(result.activationId, "result activationId"),
    goalId: requireText(result.goalId, "result goalId"),
    status: result.status,
    version: requirePositiveInteger(result.version, "result version"),
    goalStatus: requireGoalStatus(result.goalStatus),
    ...(result.deliveryGoalStatus ? { deliveryGoalStatus: requireGoalStatus(result.deliveryGoalStatus) } : {}),
    ...(result.ownerSummary ? { ownerSummary: requireText(result.ownerSummary, "result Owner summary") } : {}),
    ...(result.reason ? { reason: requireText(result.reason, "result reason") } : {}),
    ...(result.workRootPath ? { workRootPath: requireText(result.workRootPath, "result workRootPath") } : {}),
  } satisfies GrowthOwnerControllerResult)
}

export function createGrowthOwnerControllerResult(activationId: string, goal: GrowthGoalProjection, ownerSummary?: string): GrowthOwnerControllerResult {
  return {
    activationId: requireText(activationId, "result activationId"),
    goalId: goal.goalId,
    status: "ready_for_owner_reply",
    version: goal.version,
    goalStatus: goal.status,
    deliveryGoalStatus: goal.status === "active" && goal.ownerReplyPending ? "completed" : goal.status,
    ...(ownerSummary ? { ownerSummary: requireText(ownerSummary, "Owner summary") } : {}),
    ...(goal.statusReason ? { reason: goal.statusReason } : {}),
    ...(goal.workRootPath ? { workRootPath: goal.workRootPath } : {}),
  }
}

export function hashOwnerReply(reply: string) {
  return createHash("sha256").update(requireText(reply, "reply"), "utf8").digest("hex")
}

function decodeOwnerControllerResult(value: string): GrowthOwnerControllerResult {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object") throw new Error("growth_persistence: Owner controller result is corrupt")
  const result = parsed as Record<string, unknown>
  if (result.status !== "ready_for_owner_reply") throw new Error("growth_persistence: Owner controller result status is corrupt")
  return {
    activationId: requireText(result.activationId, "persisted result activationId"),
    goalId: requireText(result.goalId, "persisted result goalId"),
    status: result.status,
    version: requirePositiveInteger(result.version, "persisted result version"),
    goalStatus: requireGoalStatus(result.goalStatus),
    ...(result.deliveryGoalStatus ? { deliveryGoalStatus: requireGoalStatus(result.deliveryGoalStatus) } : {}),
    ...(result.ownerSummary ? { ownerSummary: requireText(result.ownerSummary, "persisted result Owner summary") } : {}),
    ...(result.reason ? { reason: requireText(result.reason, "persisted result reason") } : {}),
    ...(result.workRootPath ? { workRootPath: requireText(result.workRootPath, "persisted result workRootPath") } : {}),
  }
}

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`growth_invalid: ${field} is required`)
  return value.trim()
}

function requirePositiveInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`growth_invalid: ${field} must be a positive integer`)
  return value as number
}

function requireKind(value: unknown): GrowthOwnerActivationKind {
  if (value === "start" || value === "resume" || value === "issue") return value
  throw new Error("growth_invalid: Owner activation kind is invalid")
}

function requireRoute(value: unknown): GrowthOwnerActivationRoute {
  if (value === "growth" || value === "growth-world" || value === "growth-world-pro") return value
  throw new Error("growth_invalid: Owner activation route is invalid")
}

function requireStatus(value: unknown): GrowthOwnerActivationStatus {
  if (value === "pending" || value === "running" || value === "result_ready" || value === "completed" || value === "failed" || value === "cancelled") return value
  throw new Error("growth_persistence: Owner activation status is corrupt")
}

function requireGoalStatus(value: unknown): GrowthOwnerControllerResult["goalStatus"] {
  if (value === "active" || value === "waiting" || value === "paused" || value === "completed" || value === "cancelled" || value === "failed") return value
  throw new Error("growth_persistence: Owner controller Goal status is corrupt")
}
