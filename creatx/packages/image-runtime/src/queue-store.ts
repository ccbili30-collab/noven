import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { ImageAttachmentIntent, ImageTaskProjection, ImageTaskStatus, SubmitImageTaskCommand } from "@creatx/contracts"
import { imageQueueMigrationV1ToV2, imageQueueMigrationV2ToV3, imageQueueMigrationV3ToV4, imageQueueSchemaV4, imageQueueSchemaVersion } from "./queue-schema.ts"

interface ImageTaskRow {
  queue_sequence: number
  queue_rank: number
  image_task_id: string
  project_id: string
  idempotency_key: string
  prompt: string
  relative_path: string
  model: "gpt-image-2-cheap" | "gpt-image-2"
  size: string | null
  status: ImageTaskStatus
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  growth_goal_id: string | null
  growth_work_item_id: string | null
  growth_attempt_id: string | null
  attachment_document_path: string | null
  attachment_alt: string | null
  attachment_placement: "end" | "after_heading" | "after_anchor" | null
  attachment_anchor: string | null
  attachment_status: "pending" | "succeeded" | "failed" | null
  attachment_error_code: string | null
  attachment_error_message: string | null
}

interface ImageTaskAttemptRow {
  attempt_sequence: number
  image_task_id: string
  attempt_number: number
  status: "generating" | "succeeded" | "failed" | "interrupted" | "cancelled"
  error_code: string | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface ImageProjectGateRow {
  project_id: string
  state: "blocked" | "probing"
  blocking_task_id: string
  probe_task_id: string | null
  error_code: string
  error_message: string
  agent_probe_used: 0 | 1
  opened_at: string
  updated_at: string
}

export interface ImageProjectGateProjection {
  projectId: string
  state: "blocked" | "probing"
  blockingTaskId: string
  probeTaskId?: string
  errorCode: string
  errorMessage: string
  agentProbeUsed: boolean
  openedAt: string
  updatedAt: string
}

export interface ImageTaskAttemptProjection {
  imageTaskId: string
  attemptNumber: number
  status: ImageTaskAttemptRow["status"]
  errorCode?: string
  errorMessage?: string
  startedAt: string
  completedAt?: string
}

export interface ImageTaskGrowthSource {
  growthGoalId: string
  growthWorkItemId?: string
  growthAttemptId?: string
}

export interface GrowthImageTaskProjection {
  task: ImageTaskProjection
  source: ImageTaskGrowthSource
}

const statuses = new Set<ImageTaskStatus>(["queued", "generating", "succeeded", "failed", "interrupted", "cancelled"])

export class ImageTaskStore {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    let database: DatabaseSync | undefined
    try {
      mkdirSync(dirname(databasePath), { recursive: true })
      database = new DatabaseSync(databasePath)
      this.database = database
      this.initialize()
    } catch (error) {
      database?.close()
      throw persistenceError(error)
    }
  }

  submit(command: SubmitImageTaskCommand, sourceInput?: ImageTaskGrowthSource): ImageTaskProjection {
    const input = normalizeSubmit(command)
    const source = sourceInput ? normalizeGrowthSource(sourceInput) : undefined
    return this.transaction(() => {
      const retry = this.findByIdempotency(input.projectId, input.idempotencyKey)
      if (retry) {
        if (sameSubmit(retry, input, source)) return project(retry)
        throw new Error("image_queue_conflict: idempotencyKey was already used for different image input")
      }
      const timestamp = new Date().toISOString()
      const imageTaskId = `image_${randomUUID()}`
      const rank = this.database.prepare("SELECT COALESCE(MAX(queue_rank), 0) + 1 AS rank FROM image_task WHERE project_id = ?").get(input.projectId) as unknown as { rank: number }
      this.database.prepare(`
        INSERT INTO image_task (
          queue_rank, image_task_id, project_id, idempotency_key, prompt, relative_path, model, size,
          status, error_code, error_message, created_at, updated_at, started_at, completed_at,
          growth_goal_id, growth_work_item_id, growth_attempt_id,
          attachment_document_path, attachment_alt, attachment_placement, attachment_anchor, attachment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rank.rank, imageTaskId, input.projectId, input.idempotencyKey, input.prompt, input.relativePath, input.model, input.size ?? null, timestamp, timestamp,
        source?.growthGoalId ?? null, source?.growthWorkItemId ?? null, source?.growthAttemptId ?? null,
        input.attachment?.documentPath ?? null, input.attachment?.alt ?? null, input.attachment?.placement ?? null, input.attachment?.anchor ?? null, input.attachment ? "pending" : null,
      )
      return project(this.requireRow(imageTaskId))
    })
  }

  get(imageTaskId: string) {
    return optionalProject(this.read(() => this.database.prepare("SELECT * FROM image_task WHERE image_task_id = ?").get(
      requireText(imageTaskId, "imageTaskId"),
    ) as unknown as ImageTaskRow | undefined))
  }

  findProjectByIdempotency(projectId: string, idempotencyKey: string) {
    return optionalProject(this.findByIdempotency(
      requireText(projectId, "projectId"),
      requireText(idempotencyKey, "idempotencyKey"),
    ))
  }

  listProject(projectId: string) {
    return this.read(() => (this.database.prepare(`
      SELECT * FROM image_task WHERE project_id = ? ORDER BY queue_rank, queue_sequence
    `).all(requireText(projectId, "projectId")) as unknown as ImageTaskRow[]).map(project))
  }

  getProjectGate(projectIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    return this.read(() => optionalProjectGate(this.database.prepare("SELECT * FROM image_project_gate WHERE project_id = ?").get(projectId) as unknown as ImageProjectGateRow | undefined))
  }

  blockProject(projectIdInput: string, blockingTaskIdInput: string, errorCodeInput: string, errorMessageInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    const blockingTaskId = requireText(blockingTaskIdInput, "blockingTaskId")
    const errorCode = requireText(errorCodeInput, "errorCode")
    const errorMessage = requireText(errorMessageInput, "errorMessage")
    return this.transaction(() => {
      this.requireProjectRow(projectId, blockingTaskId)
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        INSERT INTO image_project_gate (
          project_id, state, blocking_task_id, probe_task_id, error_code, error_message, agent_probe_used, opened_at, updated_at
        ) VALUES (?, 'blocked', ?, NULL, ?, ?, 0, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          state = 'blocked', blocking_task_id = excluded.blocking_task_id, probe_task_id = NULL,
          error_code = excluded.error_code, error_message = excluded.error_message, updated_at = excluded.updated_at
      `).run(projectId, blockingTaskId, errorCode, errorMessage, timestamp, timestamp)
      return projectGate(this.requireProjectGateRow(projectId))
    })
  }

  beginProjectProbe(projectIdInput: string, imageTaskIdInput: string, origin: "agent" | "user") {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.transaction(() => {
      const gate = this.requireProjectGateRow(projectId)
      if (origin === "agent" && gate.agent_probe_used === 1) throw new Error("image_queue_blocked: automatic recovery probe already failed; wait for explicit user retry")
      const task = this.requireProjectRow(projectId, imageTaskId)
      if (task.status !== "queued") throw new Error("image_queue_conflict: project recovery probe must be queued")
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        UPDATE image_project_gate
        SET state = 'probing', probe_task_id = ?, agent_probe_used = ?, updated_at = ?
        WHERE project_id = ?
      `).run(imageTaskId, origin === "agent" ? 1 : gate.agent_probe_used, timestamp, projectId)
      return projectGate(this.requireProjectGateRow(projectId))
    })
  }

  resolveProjectProbe(projectIdInput: string, imageTaskIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.transaction(() => {
      const gate = this.database.prepare("SELECT * FROM image_project_gate WHERE project_id = ?").get(projectId) as unknown as ImageProjectGateRow | undefined
      if (!gate || gate.state !== "probing" || gate.probe_task_id !== imageTaskId) return false
      this.database.prepare("DELETE FROM image_project_gate WHERE project_id = ?").run(projectId)
      return true
    })
  }

  releaseProjectGateForTask(projectIdInput: string, imageTaskIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.write(() => this.database.prepare(`
      DELETE FROM image_project_gate
      WHERE project_id = ? AND (blocking_task_id = ? OR probe_task_id = ?)
    `).run(projectId, imageTaskId, imageTaskId).changes === 1)
  }

  listGrowthGoal(projectIdInput: string, growthGoalIdInput: string): GrowthImageTaskProjection[] {
    const projectId = requireText(projectIdInput, "projectId")
    const growthGoalId = requireText(growthGoalIdInput, "growthGoalId")
    return this.read(() => (this.database.prepare(`
      SELECT * FROM image_task
      WHERE project_id = ? AND growth_goal_id = ?
      ORDER BY queue_sequence
    `).all(projectId, growthGoalId) as unknown as ImageTaskRow[]).map((row) => ({
      task: project(row),
      source: growthSource(row),
    })))
  }

  listAttempts(imageTaskId: string): ImageTaskAttemptProjection[] {
    return this.read(() => (this.database.prepare(`
      SELECT * FROM image_task_attempt WHERE image_task_id = ? ORDER BY attempt_number
    `).all(requireText(imageTaskId, "imageTaskId")) as unknown as ImageTaskAttemptRow[]).map(projectAttempt))
  }

  async imageTaskStatus(projectId: string, imageTaskId: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM image_task WHERE project_id = ? AND image_task_id = ?
    `).get(requireText(projectId, "projectId"), requireText(imageTaskId, "imageTaskId")) as unknown as ImageTaskRow | undefined)
    return row ? project(row).status : undefined
  }

  async imageTaskEvidence(projectId: string, imageTaskId: string) {
    const row = this.read(() => this.database.prepare(`
      SELECT * FROM image_task WHERE project_id = ? AND image_task_id = ?
    `).get(requireText(projectId, "projectId"), requireText(imageTaskId, "imageTaskId")) as unknown as ImageTaskRow | undefined)
    return row ? { status: row.status, relativePath: row.relative_path, ...(project(row).attachment ? { attachment: project(row).attachment } : {}) } : undefined
  }

  hasQueued() {
    return this.read(() => Boolean(this.database.prepare("SELECT 1 FROM image_task WHERE status = 'queued' LIMIT 1").get()))
  }

  hasGenerating() {
    return this.read(() => Boolean(this.database.prepare("SELECT 1 FROM image_task WHERE status = 'generating' LIMIT 1").get()))
  }

  listRunnableProjects(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("image_queue_invalid: runnable project limit must be a positive integer")
    return this.read(() => (this.database.prepare(`
      SELECT queued.project_id
      FROM image_task AS queued
      WHERE queued.status = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM image_task AS active
          WHERE active.project_id = queued.project_id AND active.status = 'generating'
        )
        AND NOT EXISTS (
          SELECT 1 FROM image_project_gate AS gate
          WHERE gate.project_id = queued.project_id
            AND (gate.state = 'blocked' OR gate.probe_task_id <> queued.image_task_id)
        )
      GROUP BY queued.project_id
      ORDER BY MIN(queued.updated_at), MIN(queued.queue_sequence)
      LIMIT ?
    `).all(limit) as unknown as Array<{ project_id: string }>).map((row) => row.project_id))
  }

  claimNext() {
    const projectId = this.listRunnableProjects(1)[0]
    return projectId ? this.claimNextForProject(projectId) : undefined
  }

  claimNextForProject(projectIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    return this.transaction(() => {
      const row = this.database.prepare(`
        SELECT * FROM image_task AS queued
        WHERE queued.project_id = ? AND queued.status = 'queued'
          AND NOT EXISTS (
            SELECT 1 FROM image_task AS active
            WHERE active.project_id = ? AND active.status = 'generating'
          )
          AND NOT EXISTS (
            SELECT 1 FROM image_project_gate AS gate
            WHERE gate.project_id = queued.project_id
              AND (gate.state = 'blocked' OR gate.probe_task_id <> queued.image_task_id)
          )
        ORDER BY queued.queue_rank, queued.queue_sequence
        LIMIT 1
      `).get(projectId, projectId) as unknown as ImageTaskRow | undefined
      if (!row) return undefined
      const timestamp = new Date().toISOString()
      const updated = this.database.prepare(`
        UPDATE image_task SET status = 'generating', updated_at = ?, started_at = ?, error_code = NULL, error_message = NULL
        WHERE image_task_id = ? AND project_id = ? AND status = 'queued'
      `).run(timestamp, timestamp, row.image_task_id, projectId)
      if (updated.changes !== 1) throw new Error("image_queue_conflict: queued task changed before it could be claimed")
      this.database.prepare(`
        UPDATE image_task SET updated_at = ?
        WHERE project_id = ? AND status = 'queued' AND image_task_id <> ?
      `).run(timestamp, projectId, row.image_task_id)
      const nextAttempt = this.database.prepare(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number
        FROM image_task_attempt WHERE image_task_id = ?
      `).get(row.image_task_id) as unknown as { attempt_number: number }
      this.database.prepare(`
        INSERT INTO image_task_attempt (image_task_id, attempt_number, status, started_at)
        VALUES (?, ?, 'generating', ?)
      `).run(row.image_task_id, nextAttempt.attempt_number, timestamp)
      return project(this.requireRow(row.image_task_id))
    })
  }

  retryNow(projectIdInput: string, imageTaskIdInput: string) {
    return this.requeue(projectIdInput, imageTaskIdInput, "retry")
  }

  skipToProjectTail(projectIdInput: string, imageTaskIdInput: string) {
    return this.requeue(projectIdInput, imageTaskIdInput, "skip")
  }

  bindAttachmentIntent(projectIdInput: string, imageTaskIdInput: string, attachmentInput: ImageAttachmentIntent) {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    const attachment = normalizeAttachment(attachmentInput)
    return this.transaction(() => {
      const row = this.requireProjectRow(projectId, imageTaskId)
      if (row.status === "cancelled") throw new Error("image_queue_conflict: cancelled image task cannot be bound to a document")
      if (row.attachment_document_path) {
        if (row.attachment_document_path === attachment.documentPath
          && row.attachment_alt === attachment.alt
          && row.attachment_placement === attachment.placement
          && row.attachment_anchor === (attachment.anchor ?? null)) return project(row)
        throw new Error("image_queue_conflict: image task is already bound to a different document attachment")
      }
      return this.writeAttachmentIntent(projectId, imageTaskId, attachment)
    })
  }

  reconcileAuthoritativeAttachmentIntent(projectIdInput: string, imageTaskIdInput: string, attachmentInput: ImageAttachmentIntent) {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    const attachment = normalizeAttachment(attachmentInput)
    return this.transaction(() => {
      const row = this.requireProjectRow(projectId, imageTaskId)
      if (row.status === "cancelled") throw new Error("image_queue_conflict: cancelled image task cannot be bound to a document")
      if (!row.attachment_document_path) return this.writeAttachmentIntent(projectId, imageTaskId, attachment)
      if (row.attachment_document_path === attachment.documentPath
        && row.attachment_alt === attachment.alt
        && row.attachment_placement === attachment.placement
        && row.attachment_anchor === (attachment.anchor ?? null)) return project(row)
      if (row.attachment_document_path === attachment.documentPath && row.attachment_status === "succeeded") return project(row)
      if (row.attachment_document_path === attachment.documentPath && row.attachment_status === "pending") {
        return this.rewriteAttachmentIntent(projectId, imageTaskId, attachment, "pending")
      }
      if (row.status !== "succeeded"
        || row.attachment_document_path !== attachment.documentPath
        || row.attachment_status !== "failed"
        || row.attachment_error_code !== "image_attachment_conflict") {
        throw new Error("image_queue_conflict: image task is already bound to a different document attachment")
      }
      return this.rewriteAttachmentIntent(projectId, imageTaskId, attachment, "failed")
    })
  }

  private writeAttachmentIntent(projectId: string, imageTaskId: string, attachment: ReturnType<typeof normalizeAttachment>) {
    const timestamp = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE image_task
      SET attachment_document_path = ?, attachment_alt = ?, attachment_placement = ?, attachment_anchor = ?,
          attachment_status = 'pending', attachment_error_code = NULL, attachment_error_message = NULL, updated_at = ?
      WHERE image_task_id = ? AND project_id = ? AND attachment_document_path IS NULL
    `).run(attachment.documentPath, attachment.alt, attachment.placement, attachment.anchor ?? null, timestamp, imageTaskId, projectId)
    if (result.changes !== 1) throw new Error("image_queue_conflict: image attachment changed before it could be bound")
    return project(this.requireRow(imageTaskId))
  }

  private rewriteAttachmentIntent(projectId: string, imageTaskId: string, attachment: ReturnType<typeof normalizeAttachment>, previousStatus: "pending" | "failed") {
    const timestamp = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE image_task
      SET attachment_alt = ?, attachment_placement = ?, attachment_anchor = ?,
          attachment_status = 'pending', attachment_error_code = NULL, attachment_error_message = NULL, updated_at = ?
      WHERE image_task_id = ? AND project_id = ? AND attachment_document_path = ? AND attachment_status = ?
    `).run(attachment.alt, attachment.placement, attachment.anchor ?? null, timestamp, imageTaskId, projectId, attachment.documentPath, previousStatus)
    if (result.changes !== 1) throw new Error("image_queue_conflict: image attachment changed before it could be reconciled")
    return project(this.requireRow(imageTaskId))
  }

  cancel(projectIdInput: string, imageTaskIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.transaction(() => {
      const row = this.requireProjectRow(projectId, imageTaskId)
      if (row.status === "succeeded" || row.status === "cancelled") throw new Error("image_queue_conflict: completed image task cannot be cancelled")
      const timestamp = new Date().toISOString()
      if (row.status === "generating") {
        const attempt = this.database.prepare(`
          UPDATE image_task_attempt
          SET status = 'cancelled', error_code = 'image_cancelled', error_message = '用户取消了图片任务。', completed_at = ?
          WHERE image_task_id = ? AND status = 'generating'
        `).run(timestamp, imageTaskId)
        if (attempt.changes !== 1) throw new Error("image_queue_persistence: active image attempt is missing")
      }
      this.database.prepare(`
        UPDATE image_task
        SET status = 'cancelled', error_code = 'image_cancelled', error_message = '用户取消了图片任务。', updated_at = ?, completed_at = ?
        WHERE image_task_id = ? AND project_id = ?
      `).run(timestamp, timestamp, imageTaskId, projectId)
      return project(this.requireRow(imageTaskId))
    })
  }

  succeed(imageTaskId: string) {
    return this.finish(imageTaskId, "succeeded")
  }

  fail(imageTaskId: string, errorCode: string, errorMessage: string) {
    return this.finish(imageTaskId, "failed", requireText(errorCode, "errorCode"), requireText(errorMessage, "errorMessage"))
  }

  finishAttachment(imageTaskIdInput: string, status: "succeeded" | "failed", errorCode?: string, errorMessage?: string) {
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.transaction(() => {
      const row = this.requireRow(imageTaskId)
      if (row.status !== "succeeded" || !row.attachment_document_path || !row.attachment_status) {
        throw new Error("image_queue_conflict: only a succeeded image task with attachment intent can finish attachment")
      }
      if (row.attachment_status === "succeeded") return project(row)
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        UPDATE image_task
        SET attachment_status = ?, attachment_error_code = ?, attachment_error_message = ?, updated_at = ?
        WHERE image_task_id = ?
      `).run(status, errorCode ?? null, errorMessage ?? null, timestamp, imageTaskId)
      return project(this.requireRow(imageTaskId))
    })
  }

  interruptGenerating(reason = "Application stopped while image generation was active") {
    return this.transaction(() => {
      const rows = this.database.prepare("SELECT * FROM image_task WHERE status = 'generating' ORDER BY queue_sequence").all() as unknown as ImageTaskRow[]
      if (!rows.length) return []
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        UPDATE image_task_attempt
        SET status = 'interrupted', error_code = 'image_interrupted', error_message = ?, completed_at = ?
        WHERE status = 'generating'
      `).run(requireText(reason, "reason"), timestamp)
      this.database.prepare(`
        UPDATE image_task
        SET status = 'interrupted', error_code = 'image_interrupted', error_message = ?, updated_at = ?, completed_at = ?
        WHERE status = 'generating'
      `).run(requireText(reason, "reason"), timestamp, timestamp)
      return rows.map((row) => project(this.requireRow(row.image_task_id)))
    })
  }

  close() {
    this.database.close()
  }

  private finish(imageTaskIdInput: string, status: "succeeded" | "failed", errorCode?: string, errorMessage?: string) {
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    const timestamp = new Date().toISOString()
    return this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE image_task
        SET status = ?, error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
        WHERE image_task_id = ? AND status = 'generating'
      `).run(status, errorCode ?? null, errorMessage ?? null, timestamp, timestamp, imageTaskId)
      if (result.changes !== 1) throw new Error("image_queue_conflict: only a generating task can finish")
      const attempt = this.database.prepare(`
        UPDATE image_task_attempt
        SET status = ?, error_code = ?, error_message = ?, completed_at = ?
        WHERE image_task_id = ? AND status = 'generating'
      `).run(status, errorCode ?? null, errorMessage ?? null, timestamp, imageTaskId)
      if (attempt.changes !== 1) throw new Error("image_queue_persistence: active image attempt is missing")
      return project(this.requireRow(imageTaskId))
    })
  }

  private initialize() {
    const version = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (version.user_version === 0) this.database.exec(imageQueueSchemaV4)
    if (version.user_version === 1) {
      this.database.exec("BEGIN IMMEDIATE")
      try {
        this.database.exec(imageQueueMigrationV1ToV2)
        this.database.exec("COMMIT")
      } catch (error) {
        this.database.exec("ROLLBACK")
        throw error
      }
    }
    const intermediate = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (intermediate.user_version === 2) {
      this.database.exec("BEGIN IMMEDIATE")
      try {
        this.database.exec(imageQueueMigrationV2ToV3)
        this.database.exec("COMMIT")
      } catch (error) {
        this.database.exec("ROLLBACK")
        throw error
      }
    }
    const versionThree = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (versionThree.user_version === 3) {
      this.database.exec("BEGIN IMMEDIATE")
      try {
        this.database.exec(imageQueueMigrationV3ToV4)
        this.database.exec("COMMIT")
      } catch (error) {
        this.database.exec("ROLLBACK")
        throw error
      }
    }
    const migrated = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
    if (migrated.user_version !== imageQueueSchemaVersion) throw new Error(`unsupported image queue schema version ${migrated.user_version}`)
    const integrity = this.database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
    if (integrity.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${integrity.quick_check}`)
  }

  private findByIdempotency(projectId: string, idempotencyKey: string) {
    return this.read(() => this.database.prepare(`
      SELECT * FROM image_task WHERE project_id = ? AND idempotency_key = ?
    `).get(projectId, idempotencyKey) as unknown as ImageTaskRow | undefined)
  }

  private requireRow(imageTaskId: string) {
    const row = this.database.prepare("SELECT * FROM image_task WHERE image_task_id = ?").get(imageTaskId) as unknown as ImageTaskRow | undefined
    if (!row) throw new Error("image_queue_persistence: updated image task could not be reloaded")
    return row
  }

  private requireProjectRow(projectId: string, imageTaskId: string) {
    const row = this.database.prepare(`
      SELECT * FROM image_task WHERE project_id = ? AND image_task_id = ?
    `).get(projectId, imageTaskId) as unknown as ImageTaskRow | undefined
    if (!row) throw new Error("image_queue_conflict: image task does not belong to the project")
    return row
  }

  private requireProjectGateRow(projectId: string) {
    const row = this.database.prepare("SELECT * FROM image_project_gate WHERE project_id = ?").get(projectId) as unknown as ImageProjectGateRow | undefined
    if (!row) throw new Error("image_queue_conflict: project image channel is not blocked")
    return row
  }

  private requeue(projectIdInput: string, imageTaskIdInput: string, action: "retry" | "skip") {
    const projectId = requireText(projectIdInput, "projectId")
    const imageTaskId = requireText(imageTaskIdInput, "imageTaskId")
    return this.transaction(() => {
      const row = this.requireProjectRow(projectId, imageTaskId)
      const allowed = action === "retry"
        ? row.status === "failed" || row.status === "interrupted"
        : row.status === "queued"
      if (!allowed) throw new Error(`image_queue_conflict: ${action} is not allowed for ${row.status}`)
      const rank = this.database.prepare(`
        SELECT COALESCE(MAX(queue_rank), 0) + 1 AS rank
        FROM image_task WHERE project_id = ?
      `).get(projectId) as unknown as { rank: number }
      const timestamp = new Date().toISOString()
      this.database.prepare(`
        UPDATE image_task
        SET status = 'queued', queue_rank = ?, error_code = NULL, error_message = NULL,
            updated_at = ?, started_at = NULL, completed_at = NULL
        WHERE image_task_id = ? AND project_id = ?
      `).run(rank.rank, timestamp, imageTaskId, projectId)
      return project(this.requireRow(imageTaskId))
    })
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
      if (detail.includes("UNIQUE constraint failed")) throw new Error(`image_queue_conflict: ${detail}`)
      if (detail.startsWith("image_queue_")) throw new Error(detail)
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
      if (detail.includes("UNIQUE constraint failed")) throw new Error(`image_queue_conflict: ${detail}`)
      if (detail.startsWith("image_queue_")) throw new Error(detail)
      throw persistenceError(error)
    }
  }
}

function normalizeSubmit(command: SubmitImageTaskCommand) {
  const model = command.model
  if (model !== "gpt-image-2-cheap" && model !== "gpt-image-2") throw new Error("image_queue_invalid: unsupported image model")
  return {
    projectId: requireText(command.projectId, "projectId"),
    idempotencyKey: requireText(command.idempotencyKey, "idempotencyKey"),
    prompt: requireText(command.prompt, "prompt"),
    relativePath: requireText(command.relativePath, "relativePath"),
    model,
    size: command.size === undefined ? undefined : requireText(command.size, "size"),
    ...(command.attachment ? { attachment: normalizeAttachment(command.attachment) } : {}),
  }
}

function sameSubmit(row: ImageTaskRow, command: ReturnType<typeof normalizeSubmit>, source: ImageTaskGrowthSource | undefined) {
  return row.project_id === command.projectId
    && row.prompt === command.prompt
    && row.relative_path === command.relativePath
    && row.model === command.model
    && row.size === (command.size ?? null)
    && row.growth_goal_id === (source?.growthGoalId ?? null)
    && row.growth_work_item_id === (source?.growthWorkItemId ?? null)
    && row.growth_attempt_id === (source?.growthAttemptId ?? null)
    && row.attachment_document_path === (command.attachment?.documentPath ?? null)
    && row.attachment_alt === (command.attachment?.alt ?? null)
    && row.attachment_placement === (command.attachment?.placement ?? null)
    && row.attachment_anchor === (command.attachment?.anchor ?? null)
}

function normalizeGrowthSource(source: ImageTaskGrowthSource): ImageTaskGrowthSource {
  return {
    growthGoalId: requireText(source.growthGoalId, "growthGoalId"),
    ...(source.growthWorkItemId ? { growthWorkItemId: requireText(source.growthWorkItemId, "growthWorkItemId") } : {}),
    ...(source.growthAttemptId ? { growthAttemptId: requireText(source.growthAttemptId, "growthAttemptId") } : {}),
  }
}

function growthSource(row: ImageTaskRow): ImageTaskGrowthSource {
  if (!row.growth_goal_id) throw new Error("image_queue_persistence: Growth image task source is corrupt")
  return {
    growthGoalId: row.growth_goal_id,
    ...(row.growth_work_item_id ? { growthWorkItemId: row.growth_work_item_id } : {}),
    ...(row.growth_attempt_id ? { growthAttemptId: row.growth_attempt_id } : {}),
  }
}

function project(row: ImageTaskRow): ImageTaskProjection {
  if (!statuses.has(row.status)) throw new Error("image_queue_persistence: image task status is corrupt")
  return {
    imageTaskId: row.image_task_id,
    projectId: row.project_id,
    idempotencyKey: row.idempotency_key,
    prompt: row.prompt,
    relativePath: row.relative_path,
    model: row.model,
    ...(row.size ? { size: row.size } : {}),
    status: row.status,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.attachment_document_path && row.attachment_alt && row.attachment_placement && row.attachment_status ? { attachment: {
      documentPath: row.attachment_document_path,
      alt: row.attachment_alt,
      placement: row.attachment_placement,
      ...(row.attachment_anchor ? { anchor: row.attachment_anchor } : {}),
      status: row.attachment_status,
      ...(row.attachment_error_code ? { errorCode: row.attachment_error_code } : {}),
      ...(row.attachment_error_message ? { errorMessage: row.attachment_error_message } : {}),
    } } : {}),
  }
}

function normalizeAttachment(attachment: NonNullable<SubmitImageTaskCommand["attachment"]>) {
  const placement = attachment.placement
  if (placement !== "end" && placement !== "after_heading" && placement !== "after_anchor") throw new Error("image_queue_invalid: unsupported attachment placement")
  const anchor = attachment.anchor === undefined ? undefined : requireText(attachment.anchor, "attachment.anchor")
  if (placement !== "end" && !anchor) throw new Error("image_queue_invalid: attachment.anchor is required for the selected placement")
  if (placement === "end" && anchor) throw new Error("image_queue_invalid: end attachment does not accept anchor")
  return {
    documentPath: requireText(attachment.documentPath, "attachment.documentPath"),
    alt: requireText(attachment.alt, "attachment.alt"),
    placement,
    ...(anchor ? { anchor } : {}),
  }
}

function optionalProject(row: ImageTaskRow | undefined) {
  return row ? project(row) : undefined
}

function optionalProjectGate(row: ImageProjectGateRow | undefined) {
  return row ? projectGate(row) : undefined
}

function projectGate(row: ImageProjectGateRow): ImageProjectGateProjection {
  return {
    projectId: row.project_id,
    state: row.state,
    blockingTaskId: row.blocking_task_id,
    ...(row.probe_task_id ? { probeTaskId: row.probe_task_id } : {}),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    agentProbeUsed: row.agent_probe_used === 1,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
  }
}

function projectAttempt(row: ImageTaskAttemptRow): ImageTaskAttemptProjection {
  return {
    imageTaskId: row.image_task_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    startedAt: row.started_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  }
}

function requireText(value: string, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`image_queue_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function persistenceError(error: unknown) {
  const detail = errorMessage(error)
  if (detail.startsWith("image_queue_persistence:")) return new Error(detail)
  return new Error(`image_queue_persistence: ${detail}`)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
