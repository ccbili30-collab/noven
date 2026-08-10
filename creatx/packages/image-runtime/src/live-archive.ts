import { DatabaseSync } from "node:sqlite"
import { imageQueueSchemaVersion } from "./queue-schema.ts"

type SqlRow = Record<string, string | number | null>

const taskColumnsV3 = [
  "queue_rank", "image_task_id", "project_id", "idempotency_key", "prompt", "relative_path", "model", "size",
  "status", "error_code", "error_message", "created_at", "updated_at", "started_at", "completed_at",
  "growth_goal_id", "growth_work_item_id", "growth_attempt_id",
  "attachment_document_path", "attachment_alt", "attachment_placement", "attachment_anchor", "attachment_status",
  "attachment_error_code", "attachment_error_message",
] as const
const gateColumnsV4 = ["project_id", "state", "blocking_task_id", "probe_task_id", "error_code", "error_message", "agent_probe_used", "opened_at", "updated_at"] as const

export interface PromoteImageLiveArchiveInput {
  sourceDatabasePath: string
  targetDatabasePath: string
  sourceProjectId: string
  targetProjectId: string
  interruptedAt: string
}

export function promoteImageLiveArchive(input: PromoteImageLiveArchiveInput) {
  const source = new DatabaseSync(input.sourceDatabasePath, { readOnly: true })
  const target = new DatabaseSync(input.targetDatabasePath)
  try {
    const sourceVersion = requireSourceSchema(source)
    requireTargetSchema(target)
    const sourceTasks = source.prepare("SELECT * FROM image_task WHERE project_id = ? ORDER BY queue_sequence").all(input.sourceProjectId) as unknown as SqlRow[]
    const tasks = sourceTasks.map((row) => transformTask(normalizeTask(row, sourceVersion), input))
    const attempts = sourceVersion === 1
      ? sourceTasks.flatMap((row) => legacyAttempt(row, input))
      : sourceTasks.flatMap((row) => (source.prepare(`
          SELECT * FROM image_task_attempt WHERE image_task_id = ? ORDER BY attempt_number
        `).all(sqlValue(row, "image_task_id")) as unknown as SqlRow[]).map((attempt) => transformAttempt(attempt, sqlValue(row, "status"), input)))
    const gates = sourceVersion === 4
      ? (source.prepare("SELECT * FROM image_project_gate WHERE project_id = ?").all(input.sourceProjectId) as unknown as SqlRow[]).map((row) => transformGate(row, input))
      : []
    transaction(target, () => {
      tasks.forEach((row) => insertExactTask(target, row))
      attempts.forEach((row) => insertExactAttempt(target, row))
      gates.forEach((row) => insertExactGate(target, row))
    })
    return {
      taskCount: tasks.length,
      succeededTasks: tasks.filter((row) => row.status === "succeeded").length,
      failedTasks: tasks.filter((row) => row.status === "failed").length,
      interruptedTasks: tasks.filter((row) => row.status === "interrupted").length,
    }
  } finally {
    source.close()
    target.close()
  }
}

function normalizeTask(row: SqlRow, sourceVersion: 1 | 2 | 3 | 4): SqlRow {
  if (sourceVersion === 3 || sourceVersion === 4) return Object.fromEntries(taskColumnsV3.map((column) => [column, sqlValue(row, column)]))
  if (sourceVersion === 2) return {
    ...Object.fromEntries(taskColumnsV3.filter((column) => !column.startsWith("growth_")).map((column) => [column, sqlValue(row, column)])),
    growth_goal_id: null,
    growth_work_item_id: null,
    growth_attempt_id: null,
  }
  return {
    queue_rank: sqlValue(row, "queue_sequence"),
    image_task_id: sqlValue(row, "image_task_id"),
    project_id: sqlValue(row, "project_id"),
    idempotency_key: sqlValue(row, "idempotency_key"),
    prompt: sqlValue(row, "prompt"),
    relative_path: sqlValue(row, "relative_path"),
    model: sqlValue(row, "model"),
    size: sqlValue(row, "size"),
    status: sqlValue(row, "status"),
    error_code: sqlValue(row, "error_code"),
    error_message: sqlValue(row, "error_message"),
    created_at: sqlValue(row, "created_at"),
    updated_at: sqlValue(row, "updated_at"),
    started_at: sqlValue(row, "started_at"),
    completed_at: sqlValue(row, "completed_at"),
    growth_goal_id: null,
    growth_work_item_id: null,
    growth_attempt_id: null,
    attachment_document_path: null,
    attachment_alt: null,
    attachment_placement: null,
    attachment_anchor: null,
    attachment_status: null,
    attachment_error_code: null,
    attachment_error_message: null,
  }
}

function transformTask(row: SqlRow, input: PromoteImageLiveArchiveInput): SqlRow {
  if (row.status !== "queued" && row.status !== "generating") return { ...row, project_id: input.targetProjectId }
  return {
    ...row,
    project_id: input.targetProjectId,
    status: "interrupted",
    error_code: "image_archive_interrupted",
    error_message: "Live 档案已保留该图片任务，但不会自动继续可能产生费用的 Provider 请求。",
    updated_at: input.interruptedAt,
    completed_at: input.interruptedAt,
  }
}

function legacyAttempt(row: SqlRow, input: PromoteImageLiveArchiveInput): SqlRow[] {
  if (row.status === "queued") return []
  return [transformAttempt({
    image_task_id: sqlValue(row, "image_task_id"),
    attempt_number: 1,
    status: sqlValue(row, "status"),
    error_code: sqlValue(row, "error_code"),
    error_message: sqlValue(row, "error_message"),
    started_at: row.started_at ?? sqlValue(row, "updated_at"),
    completed_at: sqlValue(row, "completed_at"),
  }, sqlValue(row, "status"), input)]
}

function transformAttempt(row: SqlRow, sourceTaskStatus: string | number | null, input: PromoteImageLiveArchiveInput): SqlRow {
  if (sourceTaskStatus !== "generating" || row.status !== "generating") {
    return {
      image_task_id: sqlValue(row, "image_task_id"),
      attempt_number: sqlValue(row, "attempt_number"),
      status: sqlValue(row, "status"),
      error_code: sqlValue(row, "error_code"),
      error_message: sqlValue(row, "error_message"),
      started_at: sqlValue(row, "started_at"),
      completed_at: sqlValue(row, "completed_at"),
    }
  }
  return {
    image_task_id: sqlValue(row, "image_task_id"),
    attempt_number: sqlValue(row, "attempt_number"),
    status: "interrupted",
    error_code: "image_archive_interrupted",
    error_message: "Live 档案已保留该图片尝试，但不会自动继续可能产生费用的 Provider 请求。",
    started_at: sqlValue(row, "started_at"),
    completed_at: input.interruptedAt,
  }
}

function transformGate(row: SqlRow, input: PromoteImageLiveArchiveInput): SqlRow {
  return {
    ...Object.fromEntries(gateColumnsV4.map((column) => [column, sqlValue(row, column)])),
    project_id: input.targetProjectId,
    state: "blocked",
    probe_task_id: null,
    updated_at: input.interruptedAt,
  }
}

function insertExactTask(database: DatabaseSync, row: SqlRow) {
  const existing = database.prepare("SELECT * FROM image_task WHERE image_task_id = ?").get(sqlValue(row, "image_task_id")) as unknown as SqlRow | undefined
  if (existing) {
    if (!sameRow(existing, row, taskColumnsV3)) throw new Error(`live_archive_conflict: image task ${row.image_task_id} already exists with different content`)
    return
  }
  database.prepare(`
    INSERT INTO image_task (${taskColumnsV3.join(", ")}) VALUES (${taskColumnsV3.map(() => "?").join(", ")})
  `).run(...taskColumnsV3.map((column) => sqlValue(row, column)))
}

function insertExactAttempt(database: DatabaseSync, row: SqlRow) {
  const columns = ["image_task_id", "attempt_number", "status", "error_code", "error_message", "started_at", "completed_at"] as const
  const existing = database.prepare(`
    SELECT * FROM image_task_attempt WHERE image_task_id = ? AND attempt_number = ?
  `).get(sqlValue(row, "image_task_id"), sqlValue(row, "attempt_number")) as unknown as SqlRow | undefined
  if (existing) {
    if (!sameRow(existing, row, columns)) throw new Error(`live_archive_conflict: image attempt ${row.image_task_id}/${row.attempt_number} already exists with different content`)
    return
  }
  database.prepare(`
    INSERT INTO image_task_attempt (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
  `).run(...columns.map((column) => sqlValue(row, column)))
}

function insertExactGate(database: DatabaseSync, row: SqlRow) {
  const existing = database.prepare("SELECT * FROM image_project_gate WHERE project_id = ?").get(sqlValue(row, "project_id")) as unknown as SqlRow | undefined
  if (existing) {
    if (!sameRow(existing, row, gateColumnsV4)) throw new Error(`live_archive_conflict: image project gate ${row.project_id} already exists with different content`)
    return
  }
  database.prepare(`
    INSERT INTO image_project_gate (${gateColumnsV4.join(", ")}) VALUES (${gateColumnsV4.map(() => "?").join(", ")})
  `).run(...gateColumnsV4.map((column) => sqlValue(row, column)))
}

function sameRow(existing: SqlRow, imported: SqlRow, columns: readonly string[]) {
  return columns.every((column) => existing[column] === imported[column])
}

function requireSourceSchema(database: DatabaseSync): 1 | 2 | 3 | 4 {
  const version = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
  if (version.user_version !== 1 && version.user_version !== 2 && version.user_version !== 3 && version.user_version !== imageQueueSchemaVersion) {
    throw new Error(`live_archive_incompatible: source Image Queue schema is ${version.user_version}, expected 1, 2, 3 or ${imageQueueSchemaVersion}`)
  }
  requireIntegrity(database, "source")
  return version.user_version
}

function requireTargetSchema(database: DatabaseSync) {
  const version = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
  if (version.user_version !== imageQueueSchemaVersion) throw new Error(`live_archive_incompatible: target Image Queue schema is ${version.user_version}, expected ${imageQueueSchemaVersion}`)
  requireIntegrity(database, "target")
}

function requireIntegrity(database: DatabaseSync, label: string) {
  const integrity = database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
  if (integrity.quick_check !== "ok") throw new Error(`live_archive_invalid: ${label} Image Queue failed quick_check: ${integrity.quick_check}`)
}

function transaction(database: DatabaseSync, operation: () => void) {
  database.exec("BEGIN IMMEDIATE")
  try {
    operation()
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

function sqlValue(row: SqlRow, key: string) {
  const value = row[key]
  if (value === undefined) throw new Error(`live_archive_invalid: ${key} is missing from an image task row`)
  return value
}
