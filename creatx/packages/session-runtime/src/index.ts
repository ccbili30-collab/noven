import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { SessionKind, SessionPermissionMode, SessionPermissionPort, SessionPermissionState } from "@creatx/contracts"

interface SessionPermissionRow {
  session_id: string
  kind: string
  mode: string
}

interface ProjectConversationCounterRow {
  next_number: number
}

export class SessionPermissionStore implements SessionPermissionPort {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    let database: DatabaseSync | undefined
    try {
      mkdirSync(dirname(databasePath), { recursive: true })
      database = new DatabaseSync(databasePath)
      this.database = database
      const version = this.database.prepare("PRAGMA user_version").get() as unknown as { user_version: number }
      if (version.user_version < 0 || version.user_version > 2) {
        throw new Error(`unsupported Session schema version ${version.user_version}`)
      }
      if (version.user_version === 0) this.database.exec(`
        CREATE TABLE IF NOT EXISTS session_permission (
          session_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('personal', 'project')),
          mode TEXT NOT NULL CHECK (mode IN ('approval', 'free'))
        );
        PRAGMA user_version = 1;
      `)
      if (version.user_version < 2) this.database.exec(`
        CREATE TABLE project_conversation_counter (
          project_id TEXT PRIMARY KEY,
          next_number INTEGER NOT NULL CHECK (next_number > 0)
        );
        PRAGMA user_version = 2;
      `)
      const integrity = this.database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
      if (integrity.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${integrity.quick_check}`)
    } catch (error) {
      database?.close()
      throw sessionPersistenceError(error)
    }
  }

  ensure(sessionIdInput: string, kindInput: SessionKind) {
    const sessionId = requireText(sessionIdInput, "sessionId")
    const kind = requireKind(kindInput)
    const current = this.get(sessionId)
    if (current) {
      if (current.kind !== kind) throw new Error("session_conflict: session kind cannot change")
      return current
    }
    this.write(() => this.database.prepare(`
      INSERT INTO session_permission (session_id, kind, mode) VALUES (?, ?, 'free')
    `).run(sessionId, kind))
    return { sessionId, kind, mode: "free" as const }
  }

  get(sessionIdInput: string): SessionPermissionState | undefined {
    const sessionId = requireText(sessionIdInput, "sessionId")
    const row = this.read(() => this.database.prepare(`
      SELECT session_id, kind, mode FROM session_permission WHERE session_id = ?
    `).get(sessionId) as unknown as SessionPermissionRow | undefined)
    return row ? project(row) : undefined
  }

  setMode(sessionIdInput: string, modeInput: SessionPermissionMode) {
    const sessionId = requireText(sessionIdInput, "sessionId")
    const mode = requireMode(modeInput)
    const result = this.write(() => this.database.prepare(`
      UPDATE session_permission SET mode = ? WHERE session_id = ?
    `).run(mode, sessionId))
    if (result.changes !== 1) throw new Error("session_missing: session permission configuration does not exist")
    const updated = this.get(sessionId)
    if (!updated) throw new Error("session_persistence: updated session permission disappeared")
    return updated
  }

  allocateProjectConversationTitle(projectIdInput: string) {
    const projectId = requireText(projectIdInput, "projectId")
    return this.write(() => {
      this.database.exec("BEGIN IMMEDIATE")
      try {
        const row = this.database.prepare(`
          SELECT next_number FROM project_conversation_counter WHERE project_id = ?
        `).get(projectId) as unknown as ProjectConversationCounterRow | undefined
        const number = row?.next_number ?? 1
        this.database.prepare(`
          INSERT INTO project_conversation_counter (project_id, next_number) VALUES (?, ?)
          ON CONFLICT(project_id) DO UPDATE SET next_number = excluded.next_number
        `).run(projectId, number + 1)
        this.database.exec("COMMIT")
        return `创作（${number}）`
      } catch (error) {
        this.database.exec("ROLLBACK")
        throw error
      }
    })
  }

  close() {
    this.database.close()
  }

  private read<T>(operation: () => T) {
    try {
      return operation()
    } catch (error) {
      throw sessionPersistenceError(error)
    }
  }

  private write<T>(operation: () => T) {
    try {
      return operation()
    } catch (error) {
      const detail = errorMessage(error)
      if (detail.includes("UNIQUE constraint failed")) throw new Error(`session_conflict: ${detail}`)
      throw sessionPersistenceError(error)
    }
  }
}

export function promoteSessionPermissionArchive(input: { sourceDatabasePath: string; targetDatabasePath: string; sessionIds: readonly string[] }) {
  const source = new SessionPermissionStore(input.sourceDatabasePath)
  const target = new SessionPermissionStore(input.targetDatabasePath)
  try {
    return input.sessionIds.flatMap((sessionId) => {
      const permission = source.get(sessionId)
      if (!permission) return []
      const existing = target.get(sessionId)
      if (existing) {
        if (existing.kind !== permission.kind || existing.mode !== permission.mode) throw new Error(`live_archive_conflict: session permission ${sessionId} already differs`)
        return [existing]
      }
      const imported = target.ensure(sessionId, permission.kind)
      return [permission.mode === imported.mode ? imported : target.setMode(sessionId, permission.mode)]
    })
  } finally {
    source.close()
    target.close()
  }
}

function project(row: SessionPermissionRow): SessionPermissionState {
  return { sessionId: requireText(row.session_id, "stored sessionId"), kind: requireKind(row.kind), mode: requireMode(row.mode) }
}

function requireKind(value: unknown): SessionKind {
  if (value === "personal" || value === "project") return value
  throw new Error(`session_persistence: unknown session kind ${String(value)}`)
}

function requireMode(value: unknown): SessionPermissionMode {
  if (value === "approval" || value === "free") return value
  throw new Error(`session_persistence: unknown permission mode ${String(value)}`)
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`session_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function sessionPersistenceError(error: unknown) {
  const detail = errorMessage(error)
  if (detail.startsWith("session_")) return new Error(detail)
  return new Error(`session_persistence: ${detail}`)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
