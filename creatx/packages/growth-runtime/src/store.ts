import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type {
  CreateGrowthGoalCommand,
  GrowthGoalProjection,
  GrowthGoalStatus,
  GrowthIssueImpact,
  GrowthIssueProjection,
  GrowthIssueStatus,
  GrowthOwnerControllerResult,
  GrowthProgressOutcome,
  GrowthWorldEntryMode,
  GrowthWorldEntryStage,
  ReopenGrowthGoalCommand,
  TransitionGrowthGoalCommand,
} from "@creatx/contracts"
import { assertGrowthTransition } from "./state.ts"
import { encodeOwnerControllerResult, hashOwnerReply, normalizeOwnerActivation, projectOwnerActivation, sameOwnerActivation, type CreateGrowthOwnerActivationCommand, type GrowthOwnerActivationProjection, type GrowthOwnerActivationRow } from "./owner-activation.ts"
import { growthSchemaV1, growthSchemaV10Migration, growthSchemaV10RecoveryMigration, growthSchemaV11Migration, growthSchemaV11RecoveryMigration, growthSchemaV12Migration, growthSchemaV2Migration, growthSchemaV3Migration, growthSchemaV4Migration, growthSchemaV5Migration, growthSchemaV6Migration, growthSchemaV7Migration, growthSchemaV8Migration, growthSchemaV9Migration, growthSchemaV9RecoveryMigration, growthSchemaVersion } from "./schema.ts"

const unterminatedStatuses = new Set<GrowthGoalStatus>(["active", "paused", "waiting"])

interface GrowthGoalRow {
  goal_id: string
  request_id: string
  project_id: string
  session_id: string
  instruction: string
  status: GrowthGoalStatus
  status_reason: string | null
  owner_reply_pending: number
  plan_file_id: string | null
  work_root_path: string | null
  world_entry_mode: GrowthWorldEntryMode | null
  world_entry_stage: GrowthWorldEntryStage | null
  predecessor_goal_id: string | null
  required_image_task_ids: string
  created_at: string
  updated_at: string
  version: number
}

interface GrowthIssueRow {
  issue_id: string
  goal_id: string
  stage_attempt_id: string | null
  dedupe_key: string
  work_item_id: string | null
  error_code: string
  impact: GrowthIssueImpact
  status: GrowthIssueStatus
  summary: string
  detail: string | null
  affected_object_ids: string
  attempt_count: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  version: number
}

export interface RecordGrowthIssueCommand {
  issueId: string
  dedupeKey: string
  goalId: string
  stageAttemptId?: string
  workItemId?: string
  errorCode: string
  impact: GrowthIssueImpact
  summary: string
  detail?: string
  affectedObjectIds: string[]
}

export interface TransitionGrowthIssueCommand {
  issueId: string
  expectedVersion: number
  status: GrowthIssueStatus
  summary?: string
  detail?: string
  impact?: GrowthIssueImpact
  affectedObjectIds?: string[]
  attemptCount?: number
}

export interface BlockGrowthForIssueCommand {
  goalId: string
  expectedGoalVersion: number
  issueId: string
  expectedIssueVersion: number
  reason: string
  affectedObjectIds?: string[]
}

export interface ResolveWaitingGrowthIssueCommand {
  goalId: string
  expectedGoalVersion: number
  issueId: string
  expectedIssueVersion: number
  status?: "repairing" | "resolved" | "bypassed"
  summary: string
  resolutionInstruction?: string
}

export interface CommitGrowthProgressCommand {
  goalId: string
  expectedVersion: number
  reportId: string
  payloadHash: string
  outcome: GrowthProgressOutcome
  reason?: string
  workRootPath?: string
  requiredImageTaskIds: string[]
  ownerReplyPending?: boolean
}

export interface CommitGrowthProgressResult {
  goal: GrowthGoalProjection
  duplicate: boolean
}

export interface GrowthGoalStoreOptions {
  onChanged?: (goal: GrowthGoalProjection) => void
}

export class GrowthGoalStore {
  private readonly database: DatabaseSync
  private readonly onChanged: ((goal: GrowthGoalProjection) => void) | undefined

  constructor(databasePath: string, options: GrowthGoalStoreOptions = {}) {
    let database: DatabaseSync | undefined
    try {
      mkdirSync(dirname(databasePath), { recursive: true })
      database = new DatabaseSync(databasePath)
      this.database = database
      this.onChanged = options.onChanged
      this.initialize()
    } catch (error) {
      database?.close()
      throw persistenceError(error)
    }
  }

  create(command: CreateGrowthGoalCommand): GrowthGoalProjection {
    const input = normalizeCreate(command)
    return this.publish(project(this.transaction(() => this.createGoalRow(input))))
  }

  createAndBindStartGoal(input: { activationId: string; toolCallId: string; goal: CreateGrowthGoalCommand; replaceGoalId?: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const toolCallId = requireText(input.toolCallId, "toolCallId")
    const goalInput = normalizeCreate(input.goal)
    const replaceGoalId = optionalText(input.replaceGoalId, "replaceGoalId")
    const committed = this.transaction(() => {
      const activation = this.requireOwnerActivation(activationId)
      if (activation.kind !== "start" || activation.status !== "running" || activation.tool_call_id !== toolCallId) {
        throw new Error("growth_conflict: Start activation is not claimed by this Tool Call")
      }
      if (activation.session_id !== goalInput.sessionId || activation.project_id !== goalInput.projectId) {
        throw new Error("growth_conflict: Start Goal does not belong to the Owner activation")
      }
      const retry = this.database.prepare("SELECT * FROM growth_goal WHERE request_id = ?").get(goalInput.requestId) as unknown as GrowthGoalRow | undefined
      if (retry) {
        if (!sameCreate(retry, goalInput)) throw new Error("growth_conflict: requestId was already used for different Goal input")
        this.bindStartActivationRow(activation, retry, toolCallId, replaceGoalId)
        return { goal: project(retry), replaced: undefined }
      }
      const replaced = replaceGoalId ? this.cancelReplacedGoal(replaceGoalId, activation, goalInput.projectId) : undefined
      const goal = this.createGoalRow(goalInput)
      this.bindStartActivationRow(activation, goal, toolCallId, replaceGoalId)
      return { goal: project(goal), replaced }
    })
    if (committed.replaced) this.publish(committed.replaced)
    return this.publish(committed.goal)
  }

  get(goalId: string): GrowthGoalProjection | undefined {
    return optionalProject(this.findRow(requireText(goalId, "goalId")))
  }

  createOwnerActivation(command: CreateGrowthOwnerActivationCommand): GrowthOwnerActivationProjection {
    const input = normalizeOwnerActivation(command)
    const retry = this.findOwnerActivation(input.activationId)
    if (retry) {
      if (sameOwnerActivation(retry, input)) return projectOwnerActivation(retry)
      throw new Error("growth_conflict: activationId was already used for different Owner input")
    }
    this.transaction(() => {
      if (input.kind !== "start" && !input.goalId) throw new Error(`growth_invalid: ${input.kind} Owner activation requires a Goal`)
      if (input.goalId) {
        const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(input.goalId) as unknown as GrowthGoalRow | undefined
        if (!goal) throw new Error("growth_invalid: Owner activation Goal does not exist")
        if (goal.project_id !== input.projectId || goal.session_id !== input.sessionId) throw new Error("growth_conflict: Owner activation Goal belongs to another conversation")
        if (goal.status === "completed" || goal.status === "cancelled" || goal.status === "failed") throw new Error(`growth_conflict: ${goal.status} Goal cannot accept an Owner activation`)
      }
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        INSERT INTO growth_owner_activation (
          activation_id, kind, route, session_id, project_id, goal_id, prompt_hash, instruction,
          controller_tool_name, status, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)
      `).run(
        input.activationId, input.kind, input.route ?? null, input.sessionId, input.projectId, input.goalId ?? null,
        input.promptHash, input.instruction ?? null, input.controllerToolName, timestamp, timestamp,
      )
    })
    const created = this.findOwnerActivation(input.activationId)
    if (!created) throw new Error("growth_persistence: Owner activation could not be reloaded")
    return projectOwnerActivation(created)
  }

  createOwnerDeliveryActivation(input: { activationId: string; sourceActivationId: string; promptHash: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const sourceActivationId = requireText(input.sourceActivationId, "sourceActivationId")
    const promptHash = requireText(input.promptHash, "promptHash")
    const retry = this.findOwnerActivation(activationId)
    if (retry) {
      if (retry.kind === "resume"
        && retry.controller_tool_name === "deliver_growth_result"
        && retry.delivery_source_activation_id === sourceActivationId
        && retry.prompt_hash === promptHash) return projectOwnerActivation(retry)
      throw new Error("growth_conflict: activationId was already used for different Owner input")
    }
    const created = this.transaction(() => {
      const source = this.requireOwnerActivation(sourceActivationId)
      if (source.status !== "result_ready" || !source.goal_id || !source.result_json) {
        throw new Error("growth_conflict: only a result-ready Owner activation can create a delivery activation")
      }
      const existing = this.database.prepare(`
        SELECT activation_id FROM growth_owner_activation
        WHERE delivery_source_activation_id = ?
          AND status IN ('pending', 'running', 'result_ready', 'completed')
        LIMIT 1
      `).get(sourceActivationId) as unknown as { activation_id: string } | undefined
      if (existing) throw new Error("growth_conflict: Owner result already has an open or completed delivery activation")
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        INSERT INTO growth_owner_activation (
          activation_id, kind, session_id, project_id, goal_id, prompt_hash, instruction,
          controller_tool_name, status, delivery_source_activation_id, created_at, updated_at, version
        ) VALUES (?, 'resume', ?, ?, ?, ?, ?, 'deliver_growth_result', 'pending', ?, ?, ?, 1)
      `).run(
        activationId, source.session_id, source.project_id, source.goal_id, promptHash,
        source.goal_id, sourceActivationId, timestamp, timestamp,
      )
      return projectOwnerActivation(this.requireOwnerActivation(activationId))
    })
    return created
  }

  getOwnerActivation(activationId: string) {
    const row = this.findOwnerActivation(requireText(activationId, "activationId"))
    return row ? projectOwnerActivation(row) : undefined
  }

  findOpenOwnerActivationForSession(sessionIdInput: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_owner_activation
      WHERE session_id = ? AND status IN ('pending', 'running', 'result_ready')
      ORDER BY created_at DESC LIMIT 1
    `).get(requireText(sessionIdInput, "sessionId")) as unknown as GrowthOwnerActivationRow | undefined)
    return row ? projectOwnerActivation(row) : undefined
  }

  findResultReadyOwnerActivationForGoal(goalIdInput: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_owner_activation
      WHERE goal_id = ? AND status = 'result_ready'
      ORDER BY updated_at DESC LIMIT 1
    `).get(requireText(goalIdInput, "goalId")) as unknown as GrowthOwnerActivationRow | undefined)
    return row ? projectOwnerActivation(row) : undefined
  }

  findOpenOwnerDeliveryActivation(sourceActivationIdInput: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_owner_activation
      WHERE delivery_source_activation_id = ? AND status IN ('pending', 'running', 'result_ready')
      ORDER BY updated_at DESC LIMIT 1
    `).get(requireText(sourceActivationIdInput, "sourceActivationId")) as unknown as GrowthOwnerActivationRow | undefined)
    return row ? projectOwnerActivation(row) : undefined
  }

  hasUnsettledOwnerWorkForSession(sessionIdInput: string) {
    const sessionId = requireText(sessionIdInput, "sessionId")
    return this.hasUnsettledOwnerWork("session_id", sessionId)
  }

  hasUnsettledOwnerWorkForProject(projectIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    return this.hasUnsettledOwnerWork("project_id", projectId)
  }

  findOwnerReplyPendingGoal(projectIdInput: string, sessionIdInput: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_goal
      WHERE project_id = ? AND session_id = ? AND owner_reply_pending = 1
      ORDER BY updated_at DESC LIMIT 1
    `).get(requireText(projectIdInput, "projectId"), requireText(sessionIdInput, "sessionId")) as unknown as GrowthGoalRow | undefined)
    return row ? project(row) : undefined
  }

  listResultReadyOwnerActivations() {
    return this.read(() => (this.database.prepare(`
      SELECT * FROM growth_owner_activation WHERE status = 'result_ready' ORDER BY updated_at, activation_id
    `).all() as unknown as GrowthOwnerActivationRow[]).map(projectOwnerActivation))
  }

  listOpenOwnerActivations() {
    return this.read(() => (this.database.prepare(`
      SELECT * FROM growth_owner_activation
      WHERE status IN ('pending', 'running', 'result_ready')
      ORDER BY created_at, activation_id
    `).all() as unknown as GrowthOwnerActivationRow[]).map(projectOwnerActivation))
  }

  claimOwnerActivation(input: { activationId: string; sessionId: string; toolName: string; toolCallId: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const sessionId = requireText(input.sessionId, "sessionId")
    const toolName = requireText(input.toolName, "toolName")
    const toolCallId = requireText(input.toolCallId, "toolCallId")
    const claimed = this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      if (row.session_id !== sessionId || row.controller_tool_name !== toolName) {
        throw new Error("growth_conflict: controller Tool Call does not match the Owner activation")
      }
      if (row.tool_call_id) {
        if (row.tool_call_id !== toolCallId) throw new Error("growth_conflict: Owner activation already claimed another Tool Call")
        return { activation: projectOwnerActivation(row), duplicate: true }
      }
      if (row.status !== "pending") throw new Error(`growth_conflict: ${row.status} Owner activation cannot be claimed`)
      const result = this.database.prepare(`
        UPDATE growth_owner_activation
        SET tool_call_id = ?, status = 'running', updated_at = ?, version = version + 1
        WHERE activation_id = ? AND status = 'pending' AND tool_call_id IS NULL AND version = ?
      `).run(toolCallId, new Date().toISOString(), activationId, row.version)
      if (result.changes !== 1) throw new Error("growth_conflict: Owner activation changed before claim")
      return { activation: projectOwnerActivation(this.requireOwnerActivation(activationId)), duplicate: false }
    })
    return claimed
  }

  bindOwnerActivationGoal(input: { activationId: string; toolCallId: string; goalId: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const toolCallId = requireText(input.toolCallId, "toolCallId")
    const goalId = requireText(input.goalId, "goalId")
    return this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined
      if (!goal) throw new Error("growth_invalid: Goal does not exist")
      if (row.tool_call_id !== toolCallId || row.status !== "running") throw new Error("growth_conflict: Owner activation is not claimed by this Tool Call")
      if (goal.session_id !== row.session_id || goal.project_id !== row.project_id) throw new Error("growth_conflict: Goal does not belong to the Owner activation")
      if (goal.status === "completed" || goal.status === "cancelled") throw new Error(`growth_conflict: ${goal.status} Goal cannot bind an Owner activation`)
      if (row.goal_id) {
        if (row.goal_id !== goalId) throw new Error("growth_conflict: Owner activation is already bound to another Goal")
        return projectOwnerActivation(row)
      }
      const result = this.database.prepare(`
        UPDATE growth_owner_activation SET goal_id = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND goal_id IS NULL
      `).run(goalId, new Date().toISOString(), activationId, row.version)
      if (result.changes !== 1) throw new Error("growth_conflict: Owner activation changed before Goal binding")
      return projectOwnerActivation(this.requireOwnerActivation(activationId))
    })
  }

  markOwnerReplyPending(goalIdInput: string, expectedVersion: number) {
    const row = this.requireCurrent(goalIdInput, expectedVersion)
    if (row.status !== "active") throw new Error(`growth_conflict: ${row.status} Goal cannot await an Owner reply`)
    if (row.owner_reply_pending === 1) return project(row)
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_goal
      SET owner_reply_pending = 1, status_reason = NULL, updated_at = ?, version = version + 1
      WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 0
    `).run(new Date().toISOString(), row.goal_id, row.version))
    if (result.changes !== 1) throw new Error("growth_conflict: Goal changed before Owner reply became pending")
    const updated = this.findRow(row.goal_id)
    if (!updated) throw new Error("growth_persistence: pending Owner reply Goal could not be reloaded")
    return this.publish(project(updated))
  }

  waitOwnerReplyPendingGoal(goalIdInput: string, expectedVersion: number, reasonInput: string) {
    const row = this.requireCurrent(goalIdInput, expectedVersion)
    if (row.status !== "active" || row.owner_reply_pending !== 1) throw new Error("growth_conflict: Goal is not waiting for its Owner reply")
    const reason = requireText(reasonInput, "reason")
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_goal
      SET status = 'waiting', status_reason = ?, owner_reply_pending = 0, updated_at = ?, version = version + 1
      WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 1
    `).run(reason, new Date().toISOString(), row.goal_id, row.version))
    if (result.changes !== 1) throw new Error("growth_conflict: Goal changed before Owner evidence failure was recorded")
    const updated = this.findRow(row.goal_id)
    if (!updated) throw new Error("growth_persistence: waiting Goal could not be reloaded")
    return this.publish(project(updated))
  }

  recordOwnerActivationResult(input: { activationId: string; toolCallId: string; result: GrowthOwnerControllerResult }) {
    const activationId = requireText(input.activationId, "activationId")
    const toolCallId = requireText(input.toolCallId, "toolCallId")
    const resultJson = encodeOwnerControllerResult(input.result)
    const committed = this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      if (row.status === "result_ready" && row.result_json === resultJson && row.tool_call_id === toolCallId) {
        const goal = row.goal_id ? this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow | undefined : undefined
        if (goal?.status === "completed" || goal?.status === "cancelled") throw new Error(`growth_conflict: ${goal.status} Goal cannot replay an Owner controller result`)
        const acceptedDirection = goal?.status === "active"
          && goal.owner_reply_pending === 0
          && row.kind === "start"
          && goal.request_id !== row.activation_id
        if (goal && goal.owner_reply_pending !== 1 && !acceptedDirection) this.database.prepare(`
          UPDATE growth_goal SET owner_reply_pending = 1, updated_at = ? WHERE goal_id = ? AND owner_reply_pending = 0
        `).run(new Date().toISOString(), goal.goal_id)
        return { activation: projectOwnerActivation(row), goal: goal ? project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow) : undefined }
      }
      if (row.status !== "running" || row.tool_call_id !== toolCallId || row.goal_id !== input.result.goalId || input.result.activationId !== activationId) {
        throw new Error("growth_conflict: Owner controller result does not match the claimed activation")
      }
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow | undefined
      if (goal?.status === "completed" || goal?.status === "cancelled") throw new Error(`growth_conflict: ${goal.status} Goal cannot accept an Owner controller result`)
      const acceptedDirection = goal?.status === "active"
        && goal.owner_reply_pending === 0
        && row.kind === "start"
        && goal.request_id !== row.activation_id
      if (!goal || goal.version !== input.result.version || goal.status !== input.result.goalStatus || (goal.status === "active" && goal.owner_reply_pending !== 1 && !acceptedDirection)) {
        throw new Error("growth_conflict: Owner controller result does not match the pending Goal version")
      }
      if ((goal.status_reason ?? undefined) !== input.result.reason || (goal.work_root_path ?? undefined) !== input.result.workRootPath) {
        throw new Error("growth_conflict: Owner controller result does not match the pending Goal evidence")
      }
      if (goal.owner_reply_pending !== 1 && !acceptedDirection) this.database.prepare(`
        UPDATE growth_goal SET owner_reply_pending = 1, updated_at = ? WHERE goal_id = ? AND version = ? AND owner_reply_pending = 0
      `).run(new Date().toISOString(), goal.goal_id, goal.version)
      const update = this.database.prepare(`
        UPDATE growth_owner_activation
        SET result_json = ?, status = 'result_ready', updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND status = 'running'
      `).run(resultJson, new Date().toISOString(), activationId, row.version)
      if (update.changes !== 1) throw new Error("growth_conflict: Owner activation changed before result recording")
      return {
        activation: projectOwnerActivation(this.requireOwnerActivation(activationId)),
        goal: project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow),
      }
    })
    if (committed.goal) this.publish(committed.goal)
    return committed.activation
  }

  completeOwnerActivation(input: { activationId: string; reply: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const reply = requireText(input.reply, "reply")
    const committed = this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      const replyHash = hashOwnerReply(reply)
      if (row.status === "completed" && row.owner_reply_hash === replyHash && row.goal_id) {
        const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow | undefined
        if (!goal || goal.owner_reply_pending === 1) throw new Error("growth_persistence: completed Owner activation has an unsettled Goal")
        return { activation: projectOwnerActivation(row), goal: project(goal) }
      }
      if (row.status !== "result_ready" || !row.goal_id || !row.result_json) throw new Error(`growth_conflict: ${row.status} Owner activation cannot complete`)
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow | undefined
      if (!goal) throw new Error("growth_persistence: Owner activation Goal is missing")
      const acceptedDirection = goal.status === "active"
        && goal.owner_reply_pending === 0
        && row.kind === "start"
        && goal.request_id !== row.activation_id
      if (goal.status === "active" && goal.owner_reply_pending === 0 && !acceptedDirection) {
        throw new Error("growth_persistence: active Owner result is neither finalizing nor an accepted direction")
      }
      const updatedAt = new Date().toISOString()
      if (goal.owner_reply_pending === 1) {
        if (goal.status === "active") this.assertNoOpenCompletionIssues(goal.goal_id)
        const goalUpdate = goal.status === "active"
          ? this.database.prepare(`
              UPDATE growth_goal
              SET status = 'completed', status_reason = NULL, owner_reply_pending = 0, updated_at = ?, version = version + 1
              WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 1
            `).run(updatedAt, goal.goal_id, goal.version)
          : this.database.prepare(`
              UPDATE growth_goal
              SET owner_reply_pending = 0, updated_at = ?, version = version + 1
              WHERE goal_id = ? AND version = ? AND status = ? AND owner_reply_pending = 1
            `).run(updatedAt, goal.goal_id, goal.version, goal.status)
        if (goalUpdate.changes !== 1) throw new Error("growth_conflict: Goal changed before Owner reply completion")
      }
      const activationUpdate = this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'completed', owner_reply_hash = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND status = 'result_ready'
      `).run(replyHash, updatedAt, activationId, row.version)
      if (activationUpdate.changes !== 1) throw new Error("growth_conflict: Owner activation changed before completion")
      return {
        activation: projectOwnerActivation(this.requireOwnerActivation(activationId)),
        goal: project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow),
      }
    })
    this.publish(committed.goal)
    return committed
  }

  completeOwnerActivationWithoutController(input: { activationId: string; reply: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const reply = requireText(input.reply, "reply")
    return this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      if (row.kind !== "issue" || row.status !== "pending" || row.tool_call_id) throw new Error(`growth_conflict: ${row.status} Owner activation cannot complete without a controller`)
      const update = this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'completed', owner_reply_hash = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND status = 'pending' AND tool_call_id IS NULL
      `).run(hashOwnerReply(reply), new Date().toISOString(), activationId, row.version)
      if (update.changes !== 1) throw new Error("growth_conflict: Owner activation changed before clarification completion")
      return projectOwnerActivation(this.requireOwnerActivation(activationId))
    })
  }

  completeOwnerDeliveryActivation(input: { activationId: string; reply: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const reply = requireText(input.reply, "reply")
    const committed = this.transaction(() => {
      const delivery = this.requireOwnerActivation(activationId)
      const replyHash = hashOwnerReply(reply)
      if (delivery.status === "completed" && delivery.owner_reply_hash === replyHash && delivery.goal_id && delivery.delivery_source_activation_id) {
        const source = this.requireOwnerActivation(delivery.delivery_source_activation_id)
        const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(delivery.goal_id) as unknown as GrowthGoalRow | undefined
        if (source.status !== "completed" || source.owner_reply_hash !== replyHash || !goal || goal.owner_reply_pending === 1) {
          throw new Error("growth_persistence: completed Owner delivery is not atomically settled")
        }
        return { activation: projectOwnerActivation(delivery), source: projectOwnerActivation(source), goal: project(goal) }
      }
      if (delivery.status !== "pending" || delivery.tool_call_id || !delivery.goal_id || !delivery.delivery_source_activation_id || delivery.controller_tool_name !== "deliver_growth_result") {
        throw new Error(`growth_conflict: ${delivery.status} Owner delivery activation cannot complete`)
      }
      const source = this.requireOwnerActivation(delivery.delivery_source_activation_id)
      if (source.status !== "result_ready" || source.goal_id !== delivery.goal_id || source.session_id !== delivery.session_id || source.project_id !== delivery.project_id || !source.result_json) {
        throw new Error("growth_conflict: Owner delivery source no longer matches its result-ready activation")
      }
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(source.goal_id) as unknown as GrowthGoalRow | undefined
      if (!goal || goal.owner_reply_pending !== 1) throw new Error("growth_conflict: Owner delivery Goal is not waiting for its reply")
      if (goal.status === "active") this.assertNoOpenCompletionIssues(goal.goal_id)
      const updatedAt = new Date().toISOString()
      const goalUpdate = goal.status === "active"
        ? this.database.prepare(`
            UPDATE growth_goal
            SET status = 'completed', status_reason = NULL, owner_reply_pending = 0, updated_at = ?, version = version + 1
            WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 1
          `).run(updatedAt, goal.goal_id, goal.version)
        : this.database.prepare(`
            UPDATE growth_goal
            SET owner_reply_pending = 0, updated_at = ?, version = version + 1
            WHERE goal_id = ? AND version = ? AND status = ? AND owner_reply_pending = 1
          `).run(updatedAt, goal.goal_id, goal.version, goal.status)
      if (goalUpdate.changes !== 1) throw new Error("growth_conflict: Goal changed before Owner delivery completion")
      const sourceUpdate = this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'completed', owner_reply_hash = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND status = 'result_ready'
      `).run(replyHash, updatedAt, source.activation_id, source.version)
      if (sourceUpdate.changes !== 1) throw new Error("growth_conflict: Owner delivery source changed before completion")
      const deliveryUpdate = this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'completed', owner_reply_hash = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ? AND status = 'pending'
      `).run(replyHash, updatedAt, delivery.activation_id, delivery.version)
      if (deliveryUpdate.changes !== 1) throw new Error("growth_conflict: Owner delivery activation changed before completion")
      return {
        activation: projectOwnerActivation(this.requireOwnerActivation(delivery.activation_id)),
        source: projectOwnerActivation(this.requireOwnerActivation(source.activation_id)),
        goal: project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow),
      }
    })
    this.publish(committed.goal)
    return committed
  }

  failOwnerActivation(input: { activationId: string; reason: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const reason = requireText(input.reason, "reason")
    return this.transaction(() => {
      const row = this.requireOwnerActivation(activationId)
      if (row.status === "failed" && row.failure_reason === reason) return projectOwnerActivation(row)
      if (row.status === "completed" || row.status === "cancelled") throw new Error(`growth_conflict: ${row.status} Owner activation cannot fail`)
      const update = this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'failed', failure_reason = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND version = ?
      `).run(reason, new Date().toISOString(), activationId, row.version)
      if (update.changes !== 1) throw new Error("growth_conflict: Owner activation changed before failure")
      return projectOwnerActivation(this.requireOwnerActivation(activationId))
    })
  }

  failOwnerResultEvidence(input: { activationId: string; reason: string }) {
    const activationId = requireText(input.activationId, "activationId")
    const reason = requireText(input.reason, "reason")
    const committed = this.transaction(() => {
      const source = this.requireOwnerActivation(activationId)
      if (source.status !== "result_ready" || !source.goal_id) throw new Error(`growth_conflict: ${source.status} Owner result cannot fail evidence validation`)
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(source.goal_id) as unknown as GrowthGoalRow | undefined
      if (!goal || goal.owner_reply_pending !== 1) throw new Error("growth_conflict: Owner result Goal is not waiting for its reply")
      const updatedAt = new Date().toISOString()
      const goalUpdate = goal.status === "active"
        ? this.database.prepare(`
            UPDATE growth_goal
            SET status = 'failed', status_reason = ?, owner_reply_pending = 0, updated_at = ?, version = version + 1
            WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 1
          `).run(reason, updatedAt, goal.goal_id, goal.version)
        : this.database.prepare(`
            UPDATE growth_goal
            SET owner_reply_pending = 0, updated_at = ?, version = version + 1
            WHERE goal_id = ? AND version = ? AND status = ? AND owner_reply_pending = 1
          `).run(updatedAt, goal.goal_id, goal.version, goal.status)
      if (goalUpdate.changes !== 1) throw new Error("growth_conflict: Goal changed before Owner result evidence failure")
      this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'failed', failure_reason = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND status IN ('pending', 'running', 'result_ready')
      `).run(reason, updatedAt, goal.goal_id)
      return {
        activation: projectOwnerActivation(this.requireOwnerActivation(activationId)),
        goal: project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow),
      }
    })
    this.publish(committed.goal)
    return committed
  }

  findUnterminated(projectId: string): GrowthGoalProjection | undefined {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_goal
      WHERE project_id = ? AND status IN ('active', 'paused', 'waiting')
    `).get(requireText(projectId, "projectId")) as unknown as GrowthGoalRow | undefined)
    return optionalProject(row)
  }

  findLatest(projectId: string): GrowthGoalProjection | undefined {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_goal
      WHERE project_id = ?
      ORDER BY updated_at DESC, created_at DESC, goal_id DESC
      LIMIT 1
    `).get(requireText(projectId, "projectId")) as unknown as GrowthGoalRow | undefined)
    return optionalProject(row)
  }

  recordLatestSteer(goalIdInput: string, promptInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const prompt = requireText(promptInput, "prompt")
    const goal = this.findRow(goalId)
    if (!goal) throw new Error("growth_invalid: Goal does not exist")
    if (goal.status !== "active") throw new Error(`growth_conflict: ${goal.status} Goal cannot accept Steer`)
    const updatedAt = new Date().toISOString()
    this.write(() => this.database.prepare(`
      INSERT INTO growth_goal_steer (goal_id, prompt, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(goal_id) DO UPDATE SET prompt = excluded.prompt, updated_at = excluded.updated_at
    `).run(goalId, prompt, updatedAt))
    return { goalId, prompt, updatedAt }
  }

  latestSteer(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const row = this.read(() => this.database.prepare(`
      SELECT prompt FROM growth_goal_steer WHERE goal_id = ?
    `).get(goalId) as unknown as { prompt: string } | undefined)
    return row?.prompt
  }

  listActive() {
    return this.read(() => (this.database.prepare(`
      SELECT * FROM growth_goal WHERE status = 'active' ORDER BY created_at, goal_id
    `).all() as unknown as GrowthGoalRow[]).map(project))
  }

  recordIssue(command: RecordGrowthIssueCommand): GrowthIssueProjection {
    const issueId = requireText(command.issueId, "issueId")
    const goalId = requireText(command.goalId, "goalId")
    const dedupeKey = requireText(command.dedupeKey, "dedupeKey")
    const existing = this.findIssueByDedupe(goalId, dedupeKey)
    if (existing) return projectIssue(existing)
    if (!this.findRow(goalId)) throw new Error("growth_invalid: issue Goal does not exist")
    const stageAttemptId = optionalText(command.stageAttemptId, "stageAttemptId")
    if (stageAttemptId && !this.read(() => this.database.prepare("SELECT 1 FROM growth_stage_attempt WHERE attempt_id = ? AND goal_id = ?").get(stageAttemptId, goalId))) {
      throw new Error("growth_invalid: issue stage attempt does not belong to the Goal")
    }
    const timestamp = new Date().toISOString()
    const row: GrowthIssueRow = {
      issue_id: issueId,
      goal_id: goalId,
      stage_attempt_id: stageAttemptId ?? null,
      dedupe_key: dedupeKey,
      work_item_id: optionalText(command.workItemId, "workItemId") ?? null,
      error_code: requireText(command.errorCode, "errorCode"),
      impact: requireIssueImpact(command.impact),
      status: "detected",
      summary: requireText(command.summary, "summary"),
      detail: optionalText(command.detail, "detail") ?? null,
      affected_object_ids: JSON.stringify(normalizeIds(command.affectedObjectIds)),
      attempt_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
      resolved_at: null,
      version: 1,
    }
    this.write(() => this.database.prepare(`
      INSERT INTO growth_issue (
        issue_id, goal_id, stage_attempt_id, dedupe_key, work_item_id, error_code, impact, status,
        summary, detail, affected_object_ids, attempt_count, created_at, updated_at, resolved_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.issue_id, row.goal_id, row.stage_attempt_id, row.dedupe_key, row.work_item_id, row.error_code, row.impact, row.status,
      row.summary, row.detail, row.affected_object_ids, row.attempt_count, row.created_at, row.updated_at, row.resolved_at, row.version,
    ))
    this.publishIssueGoal(goalId)
    return projectIssue(row)
  }

  transitionIssue(command: TransitionGrowthIssueCommand): GrowthIssueProjection {
    const row = this.findIssue(requireText(command.issueId, "issueId"))
    if (!row) throw new Error("growth_invalid: Growth issue does not exist")
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) throw new Error("growth_invalid: issue expectedVersion must be positive")
    if (row.version !== command.expectedVersion) throw new Error(`growth_conflict: expected issue version ${command.expectedVersion}, current version is ${row.version}`)
    assertIssueTransition(row.status, command.status)
    const impact = command.impact === undefined ? row.impact : requireIssueImpact(command.impact)
    if (command.status === "waiting_user") {
      const goal = this.findRow(row.goal_id)
      if (!goal || goal.status !== "waiting" || impact !== "blocking") throw new Error("growth_conflict: waiting_user requires a waiting Goal and blocking impact")
    }
    if (command.status === "needs_help" && impact !== "local") throw new Error("growth_conflict: needs_help requires local impact")
    if ((command.status === "resolved" || command.status === "bypassed") && command.attemptCount !== undefined && command.attemptCount < row.attempt_count) {
      throw new Error("growth_invalid: issue attemptCount cannot decrease")
    }
    const updatedAt = new Date().toISOString()
    const terminal = command.status === "resolved" || command.status === "bypassed"
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_issue
      SET status = ?, summary = ?, detail = ?, impact = ?, affected_object_ids = ?, attempt_count = ?,
          updated_at = ?, resolved_at = ?, version = version + 1
      WHERE issue_id = ? AND version = ?
    `).run(
      command.status,
      optionalText(command.summary, "summary") ?? row.summary,
      command.detail === undefined ? row.detail : optionalText(command.detail, "detail") ?? null,
      impact,
      command.affectedObjectIds === undefined ? row.affected_object_ids : JSON.stringify(normalizeIds(command.affectedObjectIds)),
      command.attemptCount === undefined ? row.attempt_count : requireNonNegativeInteger(command.attemptCount, "attemptCount"),
      updatedAt,
      terminal ? updatedAt : null,
      row.issue_id,
      row.version,
    ))
    if (result.changes !== 1) throw new Error("growth_conflict: issue changed before update was committed")
    const updated = this.findIssue(row.issue_id)
    if (!updated) throw new Error("growth_persistence: updated issue could not be reloaded")
    this.publishIssueGoal(row.goal_id)
    return projectIssue(updated)
  }

  listIssues(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    return this.read(() => (this.database.prepare(`
      SELECT * FROM growth_issue WHERE goal_id = ? ORDER BY created_at, issue_id
    `).all(goalId) as unknown as GrowthIssueRow[]).map(projectIssue))
  }

  listVisibleIssues(goalIdInput: string, now = Date.now()) {
    return this.listIssues(goalIdInput).filter((issue) => issue.status !== "resolved" && issue.status !== "bypassed"
      || now - new Date(issue.resolvedAt!).getTime() < 3_000)
  }

  private assertNoOpenCompletionIssues(goalId: string) {
    const open = this.database.prepare(`
      SELECT status FROM growth_issue
      WHERE goal_id = ? AND status IN ('detected', 'repairing', 'waiting_user')
      LIMIT 1
    `).get(goalId) as { status: string } | undefined
    if (open) throw new Error(`growth_conflict: Goal has an unresolved ${open.status} issue and cannot complete`)
  }

  getWaitingIssue(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM growth_issue
      WHERE goal_id = ? AND status = 'waiting_user'
      ORDER BY updated_at, issue_id LIMIT 1
    `).get(goalId) as unknown as GrowthIssueRow | undefined)
    return row ? projectIssue(row) : undefined
  }

  getIssueByDedupe(goalIdInput: string, dedupeKeyInput: string) {
    const row = this.findIssueByDedupe(requireText(goalIdInput, "goalId"), requireText(dedupeKeyInput, "dedupeKey"))
    return row ? projectIssue(row) : undefined
  }

  listIssuesForStageAttempt(attemptIdInput: string) {
    const attemptId = requireText(attemptIdInput, "attemptId")
    return this.read(() => (this.database.prepare(`
      SELECT * FROM growth_issue WHERE stage_attempt_id = ? ORDER BY created_at, issue_id
    `).all(attemptId) as unknown as GrowthIssueRow[]).map(projectIssue))
  }

  listIssuesForStage(goalIdInput: string, stageKeyInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const stageKey = requireText(stageKeyInput, "stageKey")
    return this.read(() => (this.database.prepare(`
      SELECT issue.* FROM growth_issue AS issue
      JOIN growth_stage_attempt AS attempt ON attempt.attempt_id = issue.stage_attempt_id
      WHERE issue.goal_id = ? AND attempt.stage_key = ?
      ORDER BY issue.created_at, issue.issue_id
    `).all(goalId, stageKey) as unknown as GrowthIssueRow[]).map(projectIssue))
  }

  blockForIssue(command: BlockGrowthForIssueCommand) {
    const committed = this.transaction(() => {
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(requireText(command.goalId, "goalId")) as unknown as GrowthGoalRow | undefined
      const issue = this.database.prepare("SELECT * FROM growth_issue WHERE issue_id = ?").get(requireText(command.issueId, "issueId")) as unknown as GrowthIssueRow | undefined
      if (!goal || !issue || issue.goal_id !== goal.goal_id) throw new Error("growth_invalid: blocking issue and Goal do not match")
      requireExpectedVersion(goal.version, command.expectedGoalVersion, "Goal")
      requireExpectedVersion(issue.version, command.expectedIssueVersion, "issue")
      if (goal.status !== "active" || issue.status === "resolved" || issue.status === "bypassed") {
        throw new Error("growth_conflict: only an unresolved blocking issue can stop an active Goal")
      }
      const updatedAt = new Date().toISOString()
      this.database.prepare(`
        UPDATE growth_goal SET status = 'waiting', status_reason = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND version = ? AND status = 'active'
      `).run(requireText(command.reason, "reason"), updatedAt, goal.goal_id, goal.version)
      this.database.prepare(`
        UPDATE growth_issue SET status = 'waiting_user', impact = 'blocking', affected_object_ids = ?, updated_at = ?, version = version + 1
        WHERE issue_id = ? AND version = ?
      `).run(command.affectedObjectIds === undefined ? issue.affected_object_ids : JSON.stringify(normalizeIds(command.affectedObjectIds)), updatedAt, issue.issue_id, issue.version)
      const nextGoal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow
      const nextIssue = this.database.prepare("SELECT * FROM growth_issue WHERE issue_id = ?").get(issue.issue_id) as unknown as GrowthIssueRow
      return { goal: project(nextGoal), issue: projectIssue(nextIssue) }
    })
    this.publish(committed.goal)
    return committed
  }

  resolveWaitingIssue(command: ResolveWaitingGrowthIssueCommand) {
    const committed = this.transaction(() => {
      const goal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(requireText(command.goalId, "goalId")) as unknown as GrowthGoalRow | undefined
      const issue = this.database.prepare("SELECT * FROM growth_issue WHERE issue_id = ?").get(requireText(command.issueId, "issueId")) as unknown as GrowthIssueRow | undefined
      if (!goal || !issue || issue.goal_id !== goal.goal_id) throw new Error("growth_invalid: waiting issue and Goal do not match")
      requireExpectedVersion(goal.version, command.expectedGoalVersion, "Goal")
      requireExpectedVersion(issue.version, command.expectedIssueVersion, "issue")
      if (goal.status !== "waiting" || issue.status !== "waiting_user") throw new Error("growth_conflict: only the current waiting issue can resume its Goal")
      const status = command.status ?? "resolved"
      const updatedAt = new Date().toISOString()
      const terminal = status === "resolved" || status === "bypassed"
      this.database.prepare(`
        UPDATE growth_goal SET status = 'active', status_reason = NULL, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND version = ? AND status = 'waiting'
      `).run(updatedAt, goal.goal_id, goal.version)
      this.database.prepare(`
        UPDATE growth_issue SET status = ?, summary = ?, updated_at = ?, resolved_at = ?, version = version + 1
        WHERE issue_id = ? AND version = ? AND status = 'waiting_user'
      `).run(status, requireText(command.summary, "summary"), updatedAt, terminal ? updatedAt : null, issue.issue_id, issue.version)
      if (command.resolutionInstruction !== undefined) this.database.prepare(`
        INSERT INTO growth_goal_steer (goal_id, prompt, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(goal_id) DO UPDATE SET prompt = excluded.prompt, updated_at = excluded.updated_at
      `).run(goal.goal_id, requireText(command.resolutionInstruction, "resolutionInstruction"), updatedAt)
      const nextGoal = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goal.goal_id) as unknown as GrowthGoalRow
      const nextIssue = this.database.prepare("SELECT * FROM growth_issue WHERE issue_id = ?").get(issue.issue_id) as unknown as GrowthIssueRow
      return { goal: project(nextGoal), issue: projectIssue(nextIssue) }
    })
    this.publish(committed.goal)
    return committed
  }

  transition(command: TransitionGrowthGoalCommand): GrowthGoalProjection {
    const row = this.requireCurrent(command.goalId, command.expectedVersion)
    if (row.owner_reply_pending === 1) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
    assertGrowthTransition(row.status, command.status)
    return this.publish(this.update(row, command.status, command.planFileId, command.requiredImageTaskIds, command.reason))
  }

  pauseWithOwnerActivations(input: { goalId: string; expectedVersion: number; reason: string }) {
    const row = this.requireCurrent(input.goalId, input.expectedVersion)
    if (row.owner_reply_pending === 1) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
    assertGrowthTransition(row.status, "paused")
    const reason = requireText(input.reason, "reason")
    const updatedAt = new Date().toISOString()
    const paused = this.transaction(() => {
      const goalUpdate = this.database.prepare(`
        UPDATE growth_goal
        SET status = 'paused', status_reason = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND version = ? AND status = 'active' AND owner_reply_pending = 0
      `).run(reason, updatedAt, row.goal_id, row.version)
      if (goalUpdate.changes !== 1) throw new Error("growth_conflict: Goal changed before pause")
      this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'cancelled', failure_reason = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND status IN ('pending', 'running')
      `).run(reason, updatedAt, row.goal_id)
      return project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow)
    })
    return this.publish(paused)
  }

  cancelWithOwnerActivations(input: { goalId: string; expectedVersion: number; reason: string }) {
    const row = this.requireCurrent(input.goalId, input.expectedVersion)
    if (row.owner_reply_pending !== 1) assertGrowthTransition(row.status, "cancelled")
    const reason = requireText(input.reason, "reason")
    const updatedAt = new Date().toISOString()
    const cancelled = this.transaction(() => {
      const goalUpdate = this.database.prepare(`
        UPDATE growth_goal
        SET status = 'cancelled', status_reason = ?, owner_reply_pending = 0, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND version = ?
      `).run(reason, updatedAt, row.goal_id, row.version)
      if (goalUpdate.changes !== 1) throw new Error("growth_conflict: Goal changed before cancellation")
      this.database.prepare(`
        UPDATE growth_owner_activation
        SET status = 'cancelled', failure_reason = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND status IN ('pending', 'running', 'result_ready')
      `).run(reason, updatedAt, row.goal_id)
      return project(this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(row.goal_id) as unknown as GrowthGoalRow)
    })
    return this.publish(cancelled)
  }

  describeActiveRecovery(goalIdInput: string, expectedVersion: number, reason: string) {
    const row = this.requireCurrent(goalIdInput, expectedVersion)
    if (row.status !== "active") throw new Error(`growth_conflict: ${row.status} Goal cannot enter stage recovery`)
    const updatedAt = new Date().toISOString()
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_goal SET status_reason = ?, updated_at = ?
      WHERE goal_id = ? AND version = ? AND status = 'active'
    `).run(requireText(reason, "reason"), updatedAt, row.goal_id, row.version))
    if (result.changes !== 1) throw new Error("growth_conflict: Goal changed before stage recovery was recorded")
    const updated = this.findRow(row.goal_id)
    if (!updated) throw new Error("growth_persistence: recovering Goal could not be reloaded")
    return this.publish(project(updated))
  }

  reopenCompleted(command: ReopenGrowthGoalCommand): GrowthGoalProjection {
    if (command.userInitiated !== true) throw new Error("growth_invalid: reopening a completed Goal requires explicit user action")
    const row = this.requireCurrent(command.goalId, command.expectedVersion)
    if (row.status !== "completed") throw new Error(`growth_invalid: ${row.status} Goal cannot be reopened`)
    return this.publish(this.update(row, "active"))
  }

  commitProgress(command: CommitGrowthProgressCommand): CommitGrowthProgressResult {
    const committed = this.transaction(() => {
      const goalId = requireText(command.goalId, "goalId")
      const reportId = requireText(command.reportId, "reportId")
      const payloadHash = requireText(command.payloadHash, "payloadHash")
      const receipt = this.database.prepare(`
        SELECT payload_hash FROM growth_report_receipt WHERE goal_id = ? AND report_id = ?
      `).get(goalId, reportId) as unknown as { payload_hash: string } | undefined
      if (receipt) {
        if (receipt.payload_hash !== payloadHash) throw new Error("growth_conflict: reportId was already used for different progress")
        const current = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined
        if (!current) throw new Error("growth_persistence: idempotent report references a missing Goal")
        return { goal: project(current), duplicate: true }
      }

      const row = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined
      if (!row) throw new Error("growth_invalid: Goal does not exist")
      if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
        throw new Error("growth_invalid: expectedVersion must be a positive integer")
      }
      if (row.version !== command.expectedVersion) {
        throw new Error(`growth_conflict: expected version ${command.expectedVersion}, current version is ${row.version}`)
      }
      if (row.status !== "active") throw new Error(`growth_conflict: ${row.status} Goal cannot accept a stage report`)
      if (row.owner_reply_pending === 1) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
      const status = reportStatus(command.outcome)
      if (status !== "active") assertGrowthTransition(row.status, status)
      const requiredImageTaskIds = normalizeIds(command.requiredImageTaskIds)
      const workRootPath = command.workRootPath === undefined ? row.work_root_path : requireRelativePath(command.workRootPath, "workRootPath")
      const reason = optionalText(command.reason, "reason")
      const statusReason = status === "waiting" || status === "failed" ? reason ?? null : null
      const ownerReplyPending = command.ownerReplyPending === true ? 1 : 0
      if (ownerReplyPending === 1 && status !== "active") throw new Error("growth_invalid: only active completion evidence can await an Owner reply")
      const updatedAt = new Date().toISOString()
      const update = this.database.prepare(`
        UPDATE growth_goal
        SET status = ?, status_reason = ?, owner_reply_pending = ?, work_root_path = ?, required_image_task_ids = ?, updated_at = ?, version = version + 1
        WHERE goal_id = ? AND version = ? AND status = 'active'
      `).run(status, statusReason, ownerReplyPending, workRootPath, JSON.stringify(requiredImageTaskIds), updatedAt, goalId, row.version)
      if (update.changes !== 1) throw new Error("growth_conflict: Goal changed before progress was committed")
      this.database.prepare(`
        INSERT INTO growth_report_receipt (goal_id, report_id, payload_hash, resulting_version)
        VALUES (?, ?, ?, ?)
      `).run(goalId, reportId, payloadHash, row.version + 1)
      const updated = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined
      if (!updated) throw new Error("growth_persistence: reported Goal could not be reloaded")
      return { goal: project(updated), duplicate: false }
    })
    if (!committed.duplicate) this.publish(committed.goal)
    return committed
  }

  replayProgress(goalIdInput: string, reportIdInput: string, payloadHashInput: string): CommitGrowthProgressResult | undefined {
    const goalId = requireText(goalIdInput, "goalId")
    const reportId = requireText(reportIdInput, "reportId")
    const payloadHash = requireText(payloadHashInput, "payloadHash")
    const receipt = this.read(() => this.database.prepare(`
      SELECT payload_hash FROM growth_report_receipt WHERE goal_id = ? AND report_id = ?
    `).get(goalId, reportId) as unknown as { payload_hash: string } | undefined)
    if (!receipt) return undefined
    if (receipt.payload_hash !== payloadHash) throw new Error("growth_conflict: reportId was already used for different progress")
    const goal = this.get(goalId)
    if (!goal) throw new Error("growth_persistence: idempotent report references a missing Goal")
    return { goal, duplicate: true }
  }

  hasProgressReceipt(goalIdInput: string, resultingVersion: number) {
    const goalId = requireText(goalIdInput, "goalId")
    if (!Number.isSafeInteger(resultingVersion) || resultingVersion < 2) {
      throw new Error("growth_invalid: resultingVersion must be an integer greater than one")
    }
    return this.read(() => Boolean(this.database.prepare(`
      SELECT 1 FROM growth_report_receipt WHERE goal_id = ? AND resulting_version = ? LIMIT 1
    `).get(goalId, resultingVersion)))
  }

  hasProgressReport(goalIdInput: string, reportIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const reportId = requireText(reportIdInput, "reportId")
    return this.read(() => Boolean(this.database.prepare(`
      SELECT 1 FROM growth_report_receipt WHERE goal_id = ? AND report_id = ? LIMIT 1
    `).get(goalId, reportId)))
  }

  countProgressReceipts(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    return this.read(() => {
      const row = this.database.prepare(`
        SELECT COUNT(*) AS count FROM growth_report_receipt WHERE goal_id = ?
      `).get(goalId) as unknown as { count: number }
      return row.count
    })
  }

  beginStageAttempt(input: { goalId: string; stageKey: string; startedVersion: number; reportCountBefore: number; fingerprintBefore: string }) {
    const goalId = requireText(input.goalId, "goalId")
    const stageKey = requireText(input.stageKey, "stageKey")
    const goal = this.findRow(goalId)
    if (!goal) throw new Error("growth_invalid: Goal does not exist")
    if (goal.status !== "active") throw new Error(`growth_conflict: ${goal.status} Goal cannot begin a stage attempt`)
    if (!Number.isSafeInteger(input.startedVersion) || input.startedVersion < 1 || goal.version !== input.startedVersion) throw new Error("growth_conflict: stage attempt Goal version is stale")
    if (!Number.isSafeInteger(input.reportCountBefore) || input.reportCountBefore < 0) throw new Error("growth_invalid: reportCountBefore must be a non-negative integer")
    const timestamp = new Date().toISOString()
    return this.transaction(() => {
      this.database.prepare(`
        UPDATE growth_stage_attempt SET status = 'missing', updated_at = ?
        WHERE goal_id = ? AND status = 'running'
      `).run(timestamp, goalId)
      const sequence = (this.database.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM growth_stage_attempt WHERE goal_id = ?
      `).get(goalId) as unknown as { sequence: number }).sequence
      const attemptId = `${goalId}:stage:${sequence}`
      this.database.prepare(`
        INSERT INTO growth_stage_attempt (
          attempt_id, goal_id, sequence, stage_key, started_version, report_count_before,
          fingerprint_before, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
      `).run(attemptId, goalId, sequence, stageKey, input.startedVersion, input.reportCountBefore, requireText(input.fingerprintBefore, "fingerprintBefore"), timestamp, timestamp)
      return { attemptId, sequence, stageKey }
    })
  }

  finishStageAttempt(input: { attemptId: string; status: "missing" | "reported"; reportId?: string; fingerprintAfter?: string }) {
    const attemptId = requireText(input.attemptId, "attemptId")
    if (input.status === "reported" && !input.reportId) throw new Error("growth_invalid: reported stage attempt requires a reportId")
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_stage_attempt
      SET status = ?, report_id = ?, fingerprint_after = ?, updated_at = ?
      WHERE attempt_id = ? AND status = 'running'
    `).run(input.status, input.reportId ?? null, input.fingerprintAfter ?? null, new Date().toISOString(), attemptId))
    if (result.changes !== 1) throw new Error("growth_conflict: stage attempt is not running")
  }

  recoverRunningStageAttempts(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    if (!this.findRow(goalId)) throw new Error("growth_invalid: Goal does not exist")
    return this.write(() => this.database.prepare(`
      UPDATE growth_stage_attempt SET status = 'missing', updated_at = ?
      WHERE goal_id = ? AND status = 'running'
    `).run(new Date().toISOString(), goalId)).changes
  }

  latestProgressReceiptAfter(goalIdInput: string, priorCount: number) {
    const goalId = requireText(goalIdInput, "goalId")
    if (!Number.isSafeInteger(priorCount) || priorCount < 0) throw new Error("growth_invalid: priorCount must be a non-negative integer")
    return this.read(() => this.database.prepare(`
      SELECT report_id AS reportId FROM growth_report_receipt
      WHERE goal_id = ? ORDER BY rowid LIMIT 1 OFFSET ?
    `).get(goalId, priorCount) as unknown as { reportId: string } | undefined)
  }

  countConsecutiveMissingStageAttempts(goalIdInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const rows = this.read(() => this.database.prepare(`
      SELECT status FROM growth_stage_attempt WHERE goal_id = ? ORDER BY sequence DESC
    `).all(goalId) as unknown as Array<{ status: "running" | "missing" | "reported" }>)
    return rows.findIndex((row) => row.status !== "missing") === -1 ? rows.length : rows.findIndex((row) => row.status !== "missing")
  }

  missingStageRequiresReadOnlyRecovery(goalIdInput: string, currentFingerprintInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const currentFingerprint = requireText(currentFingerprintInput, "currentFingerprint")
    const row = this.read(() => this.database.prepare(`
      SELECT status, fingerprint_before, fingerprint_after FROM growth_stage_attempt
      WHERE goal_id = ? ORDER BY sequence DESC LIMIT 1
    `).get(goalId) as unknown as { status: "running" | "missing" | "reported"; fingerprint_before: string; fingerprint_after: string | null } | undefined)
    if (!row || row.status !== "missing") return false
    return (row.fingerprint_after ?? currentFingerprint) !== row.fingerprint_before
  }

  countConsecutiveStagnantStageAttempts(goalIdInput: string, stageKeyInput: string) {
    const goalId = requireText(goalIdInput, "goalId")
    const stageKey = requireText(stageKeyInput, "stageKey")
    const rows = this.read(() => this.database.prepare(`
      SELECT stage_key, fingerprint_before, fingerprint_after FROM growth_stage_attempt
      WHERE goal_id = ? AND status = 'reported' ORDER BY sequence DESC
    `).all(goalId) as unknown as Array<{ stage_key: string; fingerprint_before: string; fingerprint_after: string | null }>)
    const boundary = rows.findIndex((row) => row.stage_key !== stageKey)
    const sameStage = rows.slice(0, boundary === -1 ? rows.length : boundary)
    const firstChanged = sameStage.findIndex((row) => row.fingerprint_after !== row.fingerprint_before)
    return firstChanged === -1 ? sameStage.length : firstChanged
  }

  close() {
    this.database.close()
  }

  private publish(goal: GrowthGoalProjection) {
    try {
      this.onChanged?.(goal)
    } catch {
      // UI observation must not turn a committed Goal mutation into an apparent write failure.
    }
    return goal
  }

  private createGoalRow(input: ReturnType<typeof normalizeCreate>) {
    const retry = this.database.prepare("SELECT * FROM growth_goal WHERE request_id = ?").get(input.requestId) as unknown as GrowthGoalRow | undefined
    if (retry) {
      if (sameCreate(retry, input)) return retry
      throw new Error("growth_conflict: requestId was already used for different Goal input")
    }
    this.validateWorldEntry(input)
    const current = this.database.prepare(`
      SELECT 1 FROM growth_goal WHERE project_id = ? AND status IN ('active', 'paused', 'waiting') LIMIT 1
    `).get(input.projectId)
    if (current) throw new Error("growth_conflict: project already has an unterminated Goal")
    const timestamp = new Date().toISOString()
    const row: GrowthGoalRow = {
      goal_id: `goal_${randomUUID()}`,
      request_id: input.requestId,
      project_id: input.projectId,
      session_id: input.sessionId,
      instruction: input.instruction,
      status: "active",
      status_reason: null,
      owner_reply_pending: 0,
      plan_file_id: input.planFileId ?? null,
      work_root_path: input.workRootPath ?? null,
      world_entry_mode: input.worldEntryMode ?? null,
      world_entry_stage: input.worldEntryStage ?? null,
      predecessor_goal_id: input.predecessorGoalId ?? null,
      required_image_task_ids: JSON.stringify(input.requiredImageTaskIds),
      created_at: timestamp,
      updated_at: timestamp,
      version: 1,
    }
    this.database.prepare(`
      INSERT INTO growth_goal (
        goal_id, request_id, project_id, session_id, instruction, status,
        plan_file_id, work_root_path, world_entry_mode, world_entry_stage, predecessor_goal_id,
        required_image_task_ids, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.goal_id, row.request_id, row.project_id, row.session_id, row.instruction, row.status,
      row.plan_file_id, row.work_root_path, row.world_entry_mode, row.world_entry_stage, row.predecessor_goal_id,
      row.required_image_task_ids, row.created_at, row.updated_at, row.version,
    )
    return row
  }

  private bindStartActivationRow(activation: GrowthOwnerActivationRow, goal: GrowthGoalRow, toolCallId: string, replaceGoalId?: string) {
    if (activation.goal_id) {
      if (activation.goal_id === goal.goal_id) return
      if (activation.goal_id !== replaceGoalId) throw new Error("growth_conflict: Start activation is already bound to another Goal")
      const rebound = this.database.prepare(`
        UPDATE growth_owner_activation SET goal_id = ?, updated_at = ?, version = version + 1
        WHERE activation_id = ? AND status = 'running' AND tool_call_id = ? AND goal_id = ? AND version = ?
      `).run(goal.goal_id, new Date().toISOString(), activation.activation_id, toolCallId, replaceGoalId, activation.version)
      if (rebound.changes !== 1) throw new Error("growth_conflict: Start activation changed before replacement Goal binding")
      return
    }
    const result = this.database.prepare(`
      UPDATE growth_owner_activation SET goal_id = ?, updated_at = ?, version = version + 1
      WHERE activation_id = ? AND status = 'running' AND tool_call_id = ? AND goal_id IS NULL AND version = ?
    `).run(goal.goal_id, new Date().toISOString(), activation.activation_id, toolCallId, activation.version)
    if (result.changes !== 1) throw new Error("growth_conflict: Start activation changed before atomic Goal binding")
  }

  private cancelReplacedGoal(goalId: string, activation: GrowthOwnerActivationRow, projectId: string) {
    const row = this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined
    if (!row) throw new Error("growth_invalid: replacement Goal does not exist")
    if (row.project_id !== projectId || row.session_id !== activation.session_id) throw new Error("growth_conflict: replacement Goal belongs to another Owner conversation")
    if (!unterminatedStatuses.has(row.status) || row.owner_reply_pending === 1) throw new Error("growth_conflict: replacement Goal is not safely replaceable")
    const timestamp = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE growth_goal SET status = 'cancelled', status_reason = ?, updated_at = ?, version = version + 1
      WHERE goal_id = ? AND version = ? AND status IN ('active', 'paused', 'waiting') AND owner_reply_pending = 0
    `).run("旧版恢复入口误建的空 Goal 已由新的世界接管流程替代。", timestamp, row.goal_id, row.version)
    if (result.changes !== 1) throw new Error("growth_conflict: replacement Goal changed before atomic successor creation")
    return project({ ...row, status: "cancelled", status_reason: "旧版恢复入口误建的空 Goal 已由新的世界接管流程替代。", updated_at: timestamp, version: row.version + 1 })
  }

  private initialize() {
    const version = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (version.user_version < 0 || version.user_version > growthSchemaVersion) {
      throw new Error(`unsupported Growth schema version ${version.user_version}`)
    }
    if (version.user_version === 0) this.database.exec(growthSchemaV1)
    const current = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (current.user_version === 1) this.database.exec(growthSchemaV2Migration)
    const reports = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (reports.user_version === 2) this.database.exec(growthSchemaV3Migration)
    const reasons = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (reasons.user_version === 3) this.database.exec(growthSchemaV4Migration)
    const steers = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (steers.user_version === 4) this.database.exec(growthSchemaV5Migration)
    const roots = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (roots.user_version === 5) this.database.exec(growthSchemaV6Migration)
    const entries = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (entries.user_version === 6) this.database.exec(growthSchemaV7Migration)
    const issues = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (issues.user_version === 7) this.database.exec(growthSchemaV8Migration)
    const attempts = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (attempts.user_version === 8) this.database.exec(this.hasColumn("growth_issue", "stage_attempt_id") ? growthSchemaV9RecoveryMigration : growthSchemaV9Migration)
    const activations = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (activations.user_version === 9) this.database.exec(this.hasColumn("growth_goal", "owner_reply_pending") ? growthSchemaV10RecoveryMigration : growthSchemaV10Migration)
    const deliveries = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (deliveries.user_version === 10) this.database.exec(this.hasColumn("growth_owner_activation", "delivery_source_activation_id") ? growthSchemaV11RecoveryMigration : growthSchemaV11Migration)
    const deliveryRetries = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (deliveryRetries.user_version === 11) this.database.exec(growthSchemaV12Migration)
    const migrated = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (migrated.user_version !== growthSchemaVersion) throw new Error(`unsupported Growth schema version ${migrated.user_version}`)
    const integrity = this.database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
    if (integrity.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${integrity.quick_check}`)
  }

  private hasColumn(table: string, column: string) {
    return (this.database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>).some((entry) => entry.name === column)
  }

  private hasUnsettledOwnerWork(column: "session_id" | "project_id", value: string) {
    const goal = this.read(() => this.database.prepare(`
      SELECT 1 FROM growth_goal
      WHERE ${column} = ?
        AND (status IN ('active', 'paused', 'waiting') OR owner_reply_pending = 1)
      LIMIT 1
    `).get(value))
    if (goal) return true
    return this.read(() => Boolean(this.database.prepare(`
      SELECT 1 FROM growth_owner_activation
      WHERE ${column} = ? AND status IN ('pending', 'running', 'result_ready')
      LIMIT 1
    `).get(value)))
  }

  private findByRequestId(requestId: string) {
    return this.read(() => this.database.prepare("SELECT * FROM growth_goal WHERE request_id = ?").get(requestId) as unknown as GrowthGoalRow | undefined)
  }

  private findRow(goalId: string) {
    return this.read(() => this.database.prepare("SELECT * FROM growth_goal WHERE goal_id = ?").get(goalId) as unknown as GrowthGoalRow | undefined)
  }

  private findOwnerActivation(activationId: string) {
    return this.read(() => this.database.prepare("SELECT * FROM growth_owner_activation WHERE activation_id = ?").get(activationId) as unknown as GrowthOwnerActivationRow | undefined)
  }

  private requireOwnerActivation(activationId: string) {
    const row = this.database.prepare("SELECT * FROM growth_owner_activation WHERE activation_id = ?").get(activationId) as unknown as GrowthOwnerActivationRow | undefined
    if (!row) throw new Error("growth_invalid: Owner activation does not exist")
    return row
  }

  private findIssue(issueId: string) {
    return this.read(() => this.database.prepare("SELECT * FROM growth_issue WHERE issue_id = ?").get(issueId) as unknown as GrowthIssueRow | undefined)
  }

  private findIssueByDedupe(goalId: string, dedupeKey: string) {
    return this.read(() => this.database.prepare("SELECT * FROM growth_issue WHERE goal_id = ? AND dedupe_key = ?").get(goalId, dedupeKey) as unknown as GrowthIssueRow | undefined)
  }

  private publishIssueGoal(goalId: string) {
    const goal = this.get(goalId)
    if (goal) this.publish(goal)
  }

  private requireCurrent(goalId: string, expectedVersion: number) {
    const row = this.findRow(requireText(goalId, "goalId"))
    if (!row) throw new Error("growth_invalid: Goal does not exist")
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("growth_invalid: expectedVersion must be a positive integer")
    if (row.version !== expectedVersion) throw new Error(`growth_conflict: expected version ${expectedVersion}, current version is ${row.version}`)
    return row
  }

  private validateWorldEntry(input: ReturnType<typeof normalizeCreate>) {
    if (!input.worldEntryMode) {
      if (input.predecessorGoalId || input.workRootPath || input.worldEntryStage) {
        throw new Error("growth_invalid: a Growth World entry mode is required for predecessor or initial work root")
      }
      return
    }
    if (!input.worldEntryStage) throw new Error("growth_invalid: Growth World entry requires an explicit stage")
    if (input.worldEntryMode !== "continue") {
      if (input.predecessorGoalId) throw new Error(`growth_invalid: ${input.worldEntryMode} cannot have a predecessor Goal`)
      return
    }
    if (!input.predecessorGoalId || !input.workRootPath) {
      throw new Error("growth_invalid: continue requires a predecessor Goal and workRootPath")
    }
    const predecessor = this.findRow(input.predecessorGoalId)
    if (!predecessor) throw new Error("growth_invalid: predecessor Goal does not exist")
    if (unterminatedStatuses.has(predecessor.status)) throw new Error("growth_invalid: predecessor Goal must be terminal")
    if (predecessor.project_id !== input.projectId) throw new Error("growth_invalid: predecessor Goal belongs to another project")
    if (!predecessor.work_root_path || requireRelativePath(predecessor.work_root_path, "predecessor workRootPath") !== input.workRootPath) {
      throw new Error("growth_invalid: continue workRootPath must match the predecessor Goal")
    }
  }

  private update(row: GrowthGoalRow, status: GrowthGoalStatus, planFileId?: string, requiredImageTaskIds?: string[], reason?: string) {
    if (row.owner_reply_pending === 1) throw new Error("growth_conflict: Goal is waiting for its Owner reply")
    const nextPlanFileId = planFileId === undefined ? row.plan_file_id : requireText(planFileId, "planFileId")
    const nextImageTaskIds = requiredImageTaskIds === undefined ? row.required_image_task_ids : JSON.stringify(normalizeIds(requiredImageTaskIds))
    const updatedAt = new Date().toISOString()
    const statusReason = reason === undefined ? null : requireText(reason, "reason")
    const result = this.write(() => this.database.prepare(`
      UPDATE growth_goal
      SET status = ?, status_reason = ?, plan_file_id = ?, required_image_task_ids = ?, updated_at = ?, version = version + 1
      WHERE goal_id = ? AND version = ?
    `).run(status, statusReason, nextPlanFileId, nextImageTaskIds, updatedAt, row.goal_id, row.version))
    if (result.changes !== 1) throw new Error("growth_conflict: Goal changed before update was committed")
    const updated = this.findRow(row.goal_id)
    if (!updated) throw new Error("growth_persistence: updated Goal could not be reloaded")
    return project(updated)
  }

  private read<T>(operation: () => T) {
    try {
      return operation()
    } catch (error) {
      throw persistenceError(error)
    }
  }

  private write<T>(operation: () => T) {
    try {
      return operation()
    } catch (error) {
      const detail = errorMessage(error)
      if (detail.includes("UNIQUE constraint failed")) throw new Error(`growth_conflict: ${detail}`)
      throw persistenceError(error)
    }
  }

  private transaction<T>(operation: () => T) {
    let began = false
    try {
      this.database.exec("BEGIN IMMEDIATE")
      began = true
      const result = operation()
      this.database.exec("COMMIT")
      return result
    } catch (error) {
      if (began) this.database.exec("ROLLBACK")
      const detail = errorMessage(error)
      if (detail.startsWith("growth_")) throw new Error(detail)
      throw persistenceError(error)
    }
  }
}

function reportStatus(outcome: GrowthProgressOutcome): GrowthGoalStatus {
  if (outcome === "continue") return "active"
  return outcome
}

function normalizeCreate(command: CreateGrowthGoalCommand) {
  return {
    requestId: requireText(command.requestId, "requestId"),
    projectId: requireText(command.projectId, "projectId"),
    sessionId: requireText(command.sessionId, "sessionId"),
    instruction: requireText(command.instruction, "instruction"),
    planFileId: optionalText(command.planFileId, "planFileId"),
    workRootPath: command.workRootPath === undefined ? undefined : requireRelativePath(command.workRootPath, "workRootPath"),
    worldEntryMode: optionalWorldEntryMode(command.worldEntryMode),
    worldEntryStage: optionalWorldEntryStage(command.worldEntryStage),
    predecessorGoalId: optionalText(command.predecessorGoalId, "predecessorGoalId"),
    requiredImageTaskIds: normalizeIds(command.requiredImageTaskIds ?? []),
  }
}

function sameCreate(row: GrowthGoalRow, command: ReturnType<typeof normalizeCreate>) {
  return row.project_id === command.projectId
    && row.session_id === command.sessionId
    && row.instruction === command.instruction
    && row.plan_file_id === (command.planFileId ?? null)
    && row.work_root_path === (command.workRootPath ?? null)
    && row.world_entry_mode === (command.worldEntryMode ?? null)
    && row.world_entry_stage === (command.worldEntryStage ?? null)
    && row.predecessor_goal_id === (command.predecessorGoalId ?? null)
    && row.required_image_task_ids === JSON.stringify(command.requiredImageTaskIds)
}

function project(row: GrowthGoalRow): GrowthGoalProjection {
  const requiredImageTaskIds = decodeImageTaskIds(row.required_image_task_ids)
  if (!unterminatedStatuses.has(row.status) && row.status !== "completed" && row.status !== "cancelled" && row.status !== "failed") {
    throw new Error("growth_persistence: Goal status is corrupt")
  }
  return {
    goalId: row.goal_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    instruction: row.instruction,
    status: row.status,
    ...(row.status_reason ? { statusReason: row.status_reason } : {}),
    ...(row.owner_reply_pending === 1 ? { ownerReplyPending: true } : {}),
    ...(row.plan_file_id ? { planFileId: row.plan_file_id } : {}),
    ...(row.work_root_path ? { workRootPath: requireRelativePath(row.work_root_path, "persisted workRootPath") } : {}),
    ...(row.world_entry_mode ? { worldEntryMode: requireWorldEntryMode(row.world_entry_mode) } : {}),
    ...(row.world_entry_stage ? { worldEntryStage: requireWorldEntryStage(row.world_entry_stage) } : {}),
    ...(row.predecessor_goal_id ? { predecessorGoalId: requireText(row.predecessor_goal_id, "persisted predecessorGoalId") } : {}),
    requiredImageTaskIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function projectIssue(row: GrowthIssueRow): GrowthIssueProjection {
  return {
    issueId: requireText(row.issue_id, "persisted issueId"),
    goalId: requireText(row.goal_id, "persisted issue goalId"),
    ...(row.stage_attempt_id ? { stageAttemptId: requireText(row.stage_attempt_id, "persisted issue stageAttemptId") } : {}),
    ...(row.work_item_id ? { workItemId: requireText(row.work_item_id, "persisted issue workItemId") } : {}),
    errorCode: requireText(row.error_code, "persisted issue errorCode"),
    impact: requireIssueImpact(row.impact),
    status: requireIssueStatus(row.status),
    summary: requireText(row.summary, "persisted issue summary"),
    ...(row.detail ? { detail: requireText(row.detail, "persisted issue detail") } : {}),
    affectedObjectIds: decodeIssueObjectIds(row.affected_object_ids),
    attemptCount: requireNonNegativeInteger(row.attempt_count, "persisted issue attemptCount"),
    createdAt: requireText(row.created_at, "persisted issue createdAt"),
    updatedAt: requireText(row.updated_at, "persisted issue updatedAt"),
    ...(row.resolved_at ? { resolvedAt: requireText(row.resolved_at, "persisted issue resolvedAt") } : {}),
    version: requirePositiveInteger(row.version, "persisted issue version"),
  }
}

const issueTransitions: Readonly<Record<GrowthIssueStatus, readonly GrowthIssueStatus[]>> = {
  detected: ["repairing", "resolved", "bypassed", "needs_help", "waiting_user"],
  repairing: ["resolved", "bypassed", "needs_help", "waiting_user"],
  needs_help: ["repairing", "resolved", "bypassed", "waiting_user"],
  waiting_user: ["resolved", "needs_help"],
  resolved: [],
  bypassed: [],
}

function assertIssueTransition(from: GrowthIssueStatus, to: GrowthIssueStatus) {
  if (issueTransitions[from].includes(to)) return
  throw new Error(`growth_invalid: cannot transition issue from ${from} to ${to}`)
}

function requireIssueImpact(value: string): GrowthIssueImpact {
  if (value === "repairable" || value === "local" || value === "blocking") return value
  throw new Error("growth_invalid: issue impact is invalid")
}

function requireIssueStatus(value: string): GrowthIssueStatus {
  if (value === "detected" || value === "repairing" || value === "resolved" || value === "bypassed" || value === "needs_help" || value === "waiting_user") return value
  throw new Error("growth_persistence: issue status is corrupt")
}

function decodeIssueObjectIds(json: string) {
  try {
    const value: unknown = JSON.parse(json)
    if (!Array.isArray(value)) throw new Error("not an array")
    return normalizeIds(value as string[])
  } catch (error) {
    throw new Error(`growth_persistence: issue affected object IDs are corrupt: ${errorMessage(error)}`)
  }
}

function decodeImageTaskIds(json: string) {
  try {
    const value: unknown = JSON.parse(json)
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id)) throw new Error("invalid image task ID list")
    return value as string[]
  } catch (error) {
    throw new Error(`growth_persistence: required image task IDs are corrupt: ${errorMessage(error)}`)
  }
}

function optionalProject(row: GrowthGoalRow | undefined) {
  return row ? project(row) : undefined
}

function normalizeIds(ids: string[]) {
  const normalized = ids.map((id) => requireText(id, "requiredImageTaskId"))
  if (new Set(normalized).size !== normalized.length) throw new Error("growth_invalid: required image task IDs must be unique")
  return normalized
}

function requireNonNegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`growth_invalid: ${name} must be a non-negative integer`)
  return value
}

function requirePositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`growth_persistence: ${name} must be a positive integer`)
  return value
}

function requireExpectedVersion(actual: number, expected: number, name: string) {
  if (!Number.isSafeInteger(expected) || expected < 1) throw new Error(`growth_invalid: ${name} expectedVersion must be positive`)
  if (actual !== expected) throw new Error(`growth_conflict: expected ${name} version ${expected}, current version is ${actual}`)
}

function requireText(value: string, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`growth_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function optionalText(value: string | undefined, name: string) {
  return value === undefined ? undefined : requireText(value, name)
}

function optionalWorldEntryMode(value: GrowthWorldEntryMode | undefined) {
  return value === undefined ? undefined : requireWorldEntryMode(value)
}

function requireWorldEntryMode(value: string): GrowthWorldEntryMode {
  if (value === "create" || value === "continue" || value === "reconcile") return value
  throw new Error("growth_invalid: worldEntryMode must be create, continue, or reconcile")
}

function optionalWorldEntryStage(value: GrowthWorldEntryStage | undefined) {
  return value === undefined ? undefined : requireWorldEntryStage(value)
}

function requireWorldEntryStage(value: string): GrowthWorldEntryStage {
  if (value === "blueprint-create" || value === "blueprint-review" || value === "materialization") return value
  throw new Error("growth_invalid: worldEntryStage is invalid")
}

function requireRelativePath(value: string, name: string) {
  const normalized = requireText(value, name).replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "")
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`growth_invalid: ${name} must be a project-relative directory path`)
  }
  return normalized
}

function persistenceError(error: unknown) {
  const detail = errorMessage(error)
  if (detail.startsWith("growth_persistence:")) return new Error(detail)
  return new Error(`growth_persistence: ${detail}`)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
