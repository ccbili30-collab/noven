import { DatabaseSync } from "node:sqlite"
import { growthSchemaVersion } from "./schema.ts"

type SqlRow = Record<string, string | number | null>

export interface PromoteGrowthLiveArchiveInput {
  sourceDatabasePath: string
  targetDatabasePath: string
  goalId: string
  sourceProjectId: string
  targetProjectId: string
}

export function promoteGrowthLiveArchive(input: PromoteGrowthLiveArchiveInput) {
  const source = new DatabaseSync(input.sourceDatabasePath, { readOnly: true })
  const target = new DatabaseSync(input.targetDatabasePath)
  try {
    requireSchema(source, "source")
    requireSchema(target, "target")
    source.exec("PRAGMA foreign_keys = ON")
    target.exec("PRAGMA foreign_keys = ON")
    const goal = requireRow(source, "SELECT * FROM growth_goal WHERE goal_id = ?", input.goalId)
    if (goal.project_id !== input.sourceProjectId) throw new Error("live_archive_invalid: Growth Goal has the wrong source Project ID")
    if (goal.status !== "completed" || goal.owner_reply_pending !== 0) throw new Error("live_archive_invalid: Growth Goal is not completed with a delivered Owner reply")
    const attempts = rows(source, "SELECT * FROM growth_stage_attempt WHERE goal_id = ? ORDER BY sequence", input.goalId)
    const reports = rows(source, "SELECT * FROM growth_report_receipt WHERE goal_id = ? ORDER BY resulting_version, report_id", input.goalId)
    const issues = rows(source, "SELECT * FROM growth_issue WHERE goal_id = ? ORDER BY created_at, issue_id", input.goalId)
    const steers = rows(source, "SELECT * FROM growth_goal_steer WHERE goal_id = ?", input.goalId)
    const activations = rows(source, "SELECT * FROM growth_owner_activation WHERE goal_id = ? ORDER BY delivery_source_activation_id IS NOT NULL, created_at, activation_id", input.goalId)
      .map((row) => ({ ...row, project_id: input.targetProjectId }))
    transaction(target, () => {
      insertExact(target, "growth_goal", { ...goal, project_id: input.targetProjectId }, "goal_id")
      attempts.forEach((row) => insertExact(target, "growth_stage_attempt", row, "attempt_id"))
      reports.forEach((row) => insertExact(target, "growth_report_receipt", row, "goal_id", "report_id"))
      issues.forEach((row) => insertExact(target, "growth_issue", row, "issue_id"))
      steers.forEach((row) => insertExact(target, "growth_goal_steer", row, "goal_id"))
      activations.forEach((row) => insertExact(target, "growth_owner_activation", row, "activation_id"))
    })
    return { goalId: input.goalId, issueCount: issues.length, reportCount: reports.length, attemptCount: attempts.length, activationCount: activations.length }
  } finally {
    source.close()
    target.close()
  }
}

function requireSchema(database: DatabaseSync, label: string) {
  const version = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
  if (version.user_version !== growthSchemaVersion) throw new Error(`live_archive_incompatible: ${label} Growth schema is ${version.user_version}, expected ${growthSchemaVersion}`)
  const integrity = database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
  if (integrity.quick_check !== "ok") throw new Error(`live_archive_invalid: ${label} Growth database failed quick_check: ${integrity.quick_check}`)
}

function insertExact(database: DatabaseSync, table: string, row: SqlRow, ...keys: string[]) {
  const existing = database.prepare(`SELECT * FROM ${table} WHERE ${keys.map((key) => `${key} = ?`).join(" AND ")}`).get(...keys.map((key) => sqlValue(row, key))) as unknown as SqlRow | undefined
  if (existing) {
    if (!sameRow(existing, row)) throw new Error(`live_archive_conflict: ${table} ${keys.map((key) => row[key]).join("/")} already exists with different content`)
    return
  }
  const columns = Object.keys(row)
  database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...columns.map((column) => sqlValue(row, column)))
}

function requireRow(database: DatabaseSync, sql: string, ...params: string[]) {
  const row = database.prepare(sql).get(...params) as unknown as SqlRow | undefined
  if (!row) throw new Error("live_archive_invalid: Growth Goal is missing")
  return row
}

function rows(database: DatabaseSync, sql: string, ...params: string[]) {
  return database.prepare(sql).all(...params) as unknown as SqlRow[]
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

function sameRow(left: SqlRow, right: SqlRow) {
  const keys = Object.keys(right)
  return keys.length === Object.keys(left).length && keys.every((key) => left[key] === right[key])
}

function sqlValue(row: SqlRow, key: string) {
  const value = row[key]
  if (value === undefined) throw new Error(`live_archive_invalid: ${key} is missing from a database row`)
  return value
}
