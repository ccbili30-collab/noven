import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

interface GrowthWorkerSessionQuery {
  queryAll<T>(sql: string, params?: unknown[]): T[]
}

interface GrowthWorkerRow {
  session_id: string
  status: string
  messages_path: string | null
  goal_id: string
  started_at: string
  metadata_json: string | null
}

export interface GrowthWorkerCleanupEntry {
  version: 1
  ownerSessionId: string
  goalId: string
  workers: Array<{ sessionId: string; messagesPath: string }>
  requestedAt: string
}

export interface GrowthWorkerCleanupResult {
  deletedSessionIds: string[]
  deferredSessionIds: string[]
  failedSessionIds: string[]
}

export class GrowthWorkerRetention {
  private readonly journalDirectory: string
  private readonly sessionDirectory: string
  private readonly executions = new Map<string, Promise<GrowthWorkerCleanupResult>>()

  constructor(
    private readonly dataDir: string,
    private readonly sessions: GrowthWorkerSessionQuery,
    private readonly deleteSession: (sessionId: string) => Promise<boolean>,
  ) {
    this.journalDirectory = join(dataDir, "maintenance", "growth-worker-cleanup-v1")
    this.sessionDirectory = resolve(dataDir, "sessions")
  }

  list(ownerSessionId: string, goalId: string) {
    return this.sessions.queryAll<GrowthWorkerRow>(`
      SELECT session_id, status, messages_path, started_at, metadata_json,
        json_extract(metadata_json, '$.creatxGrowthGoalId') AS goal_id
      FROM sessions
      WHERE json_extract(metadata_json, '$.creatxInternalRole') = 'growth-stage'
        AND json_extract(metadata_json, '$.creatxGrowthOwnerSessionId') = ?
        AND json_extract(metadata_json, '$.creatxGrowthGoalId') = ?
      ORDER BY started_at, session_id
    `, [requireIdentity(ownerSessionId, "ownerSessionId"), requireIdentity(goalId, "goalId")])
  }

  listOwner(ownerSessionId: string) {
    return this.sessions.queryAll<GrowthWorkerRow>(`
      SELECT session_id, status, messages_path, started_at, metadata_json,
        json_extract(metadata_json, '$.creatxGrowthGoalId') AS goal_id
      FROM sessions
      WHERE json_extract(metadata_json, '$.creatxInternalRole') = 'growth-stage'
        AND json_extract(metadata_json, '$.creatxGrowthOwnerSessionId') = ?
      ORDER BY started_at, session_id
    `, [requireIdentity(ownerSessionId, "ownerSessionId")])
  }

  listActiveOwner(ownerSessionId: string) {
    return this.listOwner(ownerSessionId)
      .filter((row) => isActiveStatus(row.status))
      .map((row) => ({
        sessionId: row.session_id,
        status: row.status,
        startedAt: row.started_at,
        ...(row.messages_path ? { messagesPath: row.messages_path } : {}),
        metadata: decodeMetadata(row.metadata_json),
      }))
  }

  async cleanupOwner(ownerSessionIdInput: string) {
    const ownerSessionId = requireIdentity(ownerSessionIdInput, "ownerSessionId")
    const results: GrowthWorkerCleanupResult[] = []
    for (const goalId of [...new Set(this.listOwner(ownerSessionId).map((row) => row.goal_id).filter(Boolean))]) {
      results.push(await this.cleanup(ownerSessionId, goalId))
    }
    return results.reduce<GrowthWorkerCleanupResult>((combined, result) => ({
      deletedSessionIds: [...combined.deletedSessionIds, ...result.deletedSessionIds],
      deferredSessionIds: [...combined.deferredSessionIds, ...result.deferredSessionIds],
      failedSessionIds: [...combined.failedSessionIds, ...result.failedSessionIds],
    }), { deletedSessionIds: [], deferredSessionIds: [], failedSessionIds: [] })
  }

  cleanup(ownerSessionIdInput: string, goalIdInput: string) {
    const ownerSessionId = requireIdentity(ownerSessionIdInput, "ownerSessionId")
    const goalId = requireIdentity(goalIdInput, "goalId")
    const key = `${ownerSessionId}\u0000${goalId}`
    const current = this.executions.get(key)
    if (current) return current
    const execution = this.cleanupExact(ownerSessionId, goalId).finally(() => {
      if (this.executions.get(key) === execution) this.executions.delete(key)
    })
    this.executions.set(key, execution)
    return execution
  }

  async replay() {
    await mkdir(this.journalDirectory, { recursive: true })
    const results: GrowthWorkerCleanupResult[] = []
    for (const file of (await readdir(this.journalDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      results.push(await this.replayEntry(join(this.journalDirectory, file.name), await readCleanupEntry(join(this.journalDirectory, file.name))))
    }
    return results
  }

  private async cleanupExact(ownerSessionId: string, goalId: string) {
    await mkdir(this.journalDirectory, { recursive: true })
    const journalPath = this.journalPath(ownerSessionId, goalId)
    if (await Bun.file(journalPath).exists()) return this.replayEntry(journalPath, await readCleanupEntry(journalPath))
    const rows = this.list(ownerSessionId, goalId)
    const terminal = rows.filter((row) => !isActiveStatus(row.status))
    const deferredSessionIds = rows.filter((row) => isActiveStatus(row.status)).map((row) => row.session_id)
    const workers = (await Promise.all(terminal.map(async (row) => {
      if (!row.messages_path) return undefined
      await this.requireOwnedSessionDirectory(row.session_id, row.messages_path)
      return { sessionId: row.session_id, messagesPath: row.messages_path }
    }))).filter((worker): worker is GrowthWorkerCleanupEntry["workers"][number] => Boolean(worker))
    deferredSessionIds.push(...terminal.filter((row) => !workers.some((worker) => worker.sessionId === row.session_id)).map((row) => row.session_id))
    if (!workers.length) return { deletedSessionIds: [], deferredSessionIds, failedSessionIds: [] }
    const entry: GrowthWorkerCleanupEntry = { version: 1, ownerSessionId, goalId, workers, requestedAt: new Date().toISOString() }
    await writeNewJournal(journalPath, entry)
    const result = await this.replayEntry(journalPath, entry)
    return { ...result, deferredSessionIds: [...new Set([...result.deferredSessionIds, ...deferredSessionIds])] }
  }

  private async replayEntry(journalPath: string, entry: GrowthWorkerCleanupEntry) {
    const deletedSessionIds: string[] = []
    const failedSessionIds: string[] = []
    for (const worker of entry.workers) {
      try {
        if (!await this.deleteSession(worker.sessionId)) {
          const sessionDirectory = await this.requireOwnedSessionDirectory(worker.sessionId, worker.messagesPath)
          await rm(sessionDirectory, { recursive: true, force: true })
        }
        deletedSessionIds.push(worker.sessionId)
      } catch {
        failedSessionIds.push(worker.sessionId)
      }
    }
    if (!failedSessionIds.length) await rm(journalPath, { force: true })
    return { deletedSessionIds, deferredSessionIds: [], failedSessionIds }
  }

  private async requireOwnedSessionDirectory(sessionIdInput: string, messagesPathInput: string) {
    const sessionId = requireIdentity(sessionIdInput, "sessionId")
    if (basename(sessionId) !== sessionId || sessionId.includes(sep)) throw new Error("session_cleanup_path: invalid Worker session identity")
    const sessionDirectory = resolve(this.sessionDirectory, sessionId)
    const messagesPath = resolve(messagesPathInput)
    const relation = relative(this.sessionDirectory, sessionDirectory)
    if (!relation || relation.startsWith(`..${sep}`) || relation === ".." || isAbsolute(relation) || dirname(messagesPath) !== sessionDirectory) {
      throw new Error("session_cleanup_path: Worker Artifact is outside its owned session directory")
    }
    const status = await lstat(sessionDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (status) {
      if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("session_cleanup_path: Worker session directory is not an owned directory")
    }
    return sessionDirectory
  }

  private journalPath(ownerSessionId: string, goalId: string) {
    return join(this.journalDirectory, `${createHash("sha256").update(`${ownerSessionId}\u0000${goalId}`).digest("hex")}.json`)
  }
}

function isActiveStatus(status: string) {
  return status === "idle" || status === "running" || status === "pending"
}

async function writeNewJournal(path: string, entry: GrowthWorkerCleanupEntry) {
  if (await Bun.file(path).exists()) return
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await Bun.write(temporaryPath, `${JSON.stringify(entry, null, 2)}\n`)
  try {
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (!await Bun.file(path).exists()) throw error
  }
}

async function readCleanupEntry(path: string): Promise<GrowthWorkerCleanupEntry> {
  const value = JSON.parse(await Bun.file(path).text()) as unknown
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("session_cleanup_journal: invalid cleanup entry")
  const entry = value as Partial<GrowthWorkerCleanupEntry>
  if (entry.version !== 1 || typeof entry.ownerSessionId !== "string" || typeof entry.goalId !== "string" || typeof entry.requestedAt !== "string" || !Array.isArray(entry.workers)) {
    throw new Error("session_cleanup_journal: invalid cleanup entry")
  }
  const workers = entry.workers.map((worker) => {
    if (!worker || typeof worker.sessionId !== "string" || typeof worker.messagesPath !== "string") throw new Error("session_cleanup_journal: invalid Worker entry")
    return { sessionId: worker.sessionId, messagesPath: worker.messagesPath }
  })
  return { version: 1, ownerSessionId: entry.ownerSessionId, goalId: entry.goalId, requestedAt: entry.requestedAt, workers }
}

function requireIdentity(value: string, name: string) {
  if (!value.trim()) throw new Error(`session_cleanup_invalid: ${name} is required`)
  return value.trim()
}

function decodeMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
