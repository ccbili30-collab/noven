import { createHash } from "node:crypto"
import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { SqliteSessionStore } from "@cline/sdk"

interface ClineSessionRow {
  session_id: string
  source: string
  pid: number
  started_at: string
  ended_at: string | null
  exit_code: number | null
  status: string
  status_lock: number
  interactive: number
  provider: string
  model: string
  cwd: string
  workspace_root: string
  team_name: string | null
  enable_tools: number
  enable_spawn: number
  enable_teams: number
  parent_session_id: string | null
  parent_agent_id: string | null
  agent_id: string | null
  conversation_id: string | null
  is_subagent: number
  prompt: string | null
  metadata_json: string | null
  transcript_path: string
  hook_path: string
  messages_path: string | null
  updated_at: string
}

export interface PromoteClineLiveArchiveInput {
  archiveId: string
  goalId: string
  ownerSessionId: string
  sourceProjectId: string
  targetProjectId: string
  targetProjectRoot: string
  sourceDataDir: string
  targetDataDir: string
}

export interface PromoteClineLiveArchiveResult {
  ownerSessionId: string
  sessionIds: string[]
  completedSessions: number
  failedSessions: number
}

export async function promoteClineLiveArchive(input: PromoteClineLiveArchiveInput): Promise<PromoteClineLiveArchiveResult> {
  const source = new SqliteSessionStore({ sessionsDir: join(input.sourceDataDir, "database") })
  const target = new SqliteSessionStore({ sessionsDir: join(input.targetDataDir, "database") })
  source.init()
  target.init()
  try {
    const owner = source.queryOne<ClineSessionRow>("SELECT * FROM sessions WHERE session_id = ?", [input.ownerSessionId])
    if (!owner) throw new Error("live_archive_invalid: Cline owner session is missing")
    const rows = [owner]
    if (owner.status !== "completed" && owner.status !== "idle") throw new Error(`live_archive_invalid: Cline owner session is ${owner.status}, expected completed or idle history`)
    if (rows.some((row) => row.cwd !== owner.cwd || row.workspace_root !== owner.workspace_root)) {
      throw new Error("live_archive_invalid: Cline archive sessions do not share one project root")
    }
    await requireOwnerFinalReply(join(input.sourceDataDir, "sessions", owner.session_id), owner.messages_path)
    for (const row of rows) await importSession(source, target, row, input)
    return {
      ownerSessionId: owner.session_id,
      sessionIds: rows.map((row) => row.session_id),
      completedSessions: rows.filter((row) => row.status === "completed").length,
      failedSessions: rows.filter((row) => row.status === "failed").length,
    }
  } finally {
    source.close()
    target.close()
  }
}

async function importSession(source: SqliteSessionStore, target: SqliteSessionStore, row: ClineSessionRow, input: PromoteClineLiveArchiveInput) {
  const metadata = decodeMetadata(row.metadata_json)
  if (metadata.creatxProjectId !== input.sourceProjectId) throw new Error(`live_archive_invalid: Cline session ${row.session_id} has the wrong source Project ID`)
  const sourceSessionDir = join(input.sourceDataDir, "sessions", row.session_id)
  const targetSessionDir = join(input.targetDataDir, "sessions", row.session_id)
  await copyDirectoryIdempotently(sourceSessionDir, targetSessionDir)
  const transformed = {
    ...row,
    cwd: input.targetProjectRoot,
    workspace_root: input.targetProjectRoot,
    metadata_json: JSON.stringify({ ...metadata, creatxProjectId: input.targetProjectId, creatxLiveArchiveId: input.archiveId }),
    transcript_path: mapArtifactPath(row.transcript_path, targetSessionDir),
    hook_path: mapArtifactPath(row.hook_path, targetSessionDir),
    messages_path: row.messages_path ? mapArtifactPath(row.messages_path, targetSessionDir) : null,
  }
  const existing = target.queryOne<ClineSessionRow>("SELECT * FROM sessions WHERE session_id = ?", [row.session_id])
  if (existing) {
    if (decodeMetadata(existing.metadata_json).creatxLiveArchiveId !== input.archiveId || !sameSession(existing, transformed)) {
      throw new Error(`live_archive_conflict: Cline session ${row.session_id} already exists with different content`)
    }
    return
  }
  target.run(`
    INSERT INTO sessions (
      session_id, source, pid, started_at, ended_at, exit_code, status, status_lock, interactive,
      provider, model, cwd, workspace_root, team_name, enable_tools, enable_spawn, enable_teams,
      parent_session_id, parent_agent_id, agent_id, conversation_id, is_subagent, prompt, metadata_json,
      transcript_path, hook_path, messages_path, updated_at
    ) VALUES (${Array.from({ length: 28 }, () => "?").join(", ")})
  `, [
    transformed.session_id, transformed.source, transformed.pid, transformed.started_at, transformed.ended_at,
    transformed.exit_code, transformed.status, transformed.status_lock, transformed.interactive, transformed.provider,
    transformed.model, transformed.cwd, transformed.workspace_root, transformed.team_name, transformed.enable_tools,
    transformed.enable_spawn, transformed.enable_teams, transformed.parent_session_id, transformed.parent_agent_id,
    transformed.agent_id, transformed.conversation_id, transformed.is_subagent, transformed.prompt, transformed.metadata_json,
    transformed.transcript_path, transformed.hook_path, transformed.messages_path, transformed.updated_at,
  ])
  if (!source.queryOne<ClineSessionRow>("SELECT * FROM sessions WHERE session_id = ?", [row.session_id])) {
    throw new Error(`live_archive_invalid: source Cline session ${row.session_id} disappeared during import`)
  }
}

function mapArtifactPath(sourcePath: string, targetSessionDir: string) {
  return sourcePath ? join(targetSessionDir, basename(sourcePath)) : ""
}

async function requireOwnerFinalReply(sourceSessionDir: string, messagesPath: string | null) {
  if (!messagesPath) throw new Error("live_archive_invalid: Cline owner session has no messages Artifact")
  const envelope = JSON.parse(await readFile(join(sourceSessionDir, basename(messagesPath)), "utf8")) as { messages?: Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }> }
  const finalReply = envelope.messages?.findLast((message) => message.role === "assistant" && message.content?.some((item) => item.type === "text" && item.text?.trim()))
  if (!finalReply) throw new Error("live_archive_invalid: Cline owner session has no final Assistant reply")
}

async function copyDirectoryIdempotently(source: string, target: string) {
  if (!(await optionalStat(source))?.isDirectory()) throw new Error(`live_archive_invalid: Cline session Artifact directory is missing: ${source}`)
  const targetInfo = await optionalStat(target)
  if (!targetInfo) {
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target, { recursive: true, errorOnExist: true })
    return
  }
  if (!targetInfo.isDirectory() || await directoryDigest(source) !== await directoryDigest(target)) {
    throw new Error(`live_archive_conflict: Cline session Artifact directory differs: ${target}`)
  }
}

async function directoryDigest(root: string) {
  const files = await listFiles(root)
  const hash = createHash("sha256")
  for (const path of files) {
    hash.update(path.slice(root.length).replaceAll("\\", "/"))
    hash.update(await readFile(path))
  }
  return hash.digest("hex")
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name)).map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

function sameSession(left: ClineSessionRow, right: ClineSessionRow) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function decodeMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>
  const metadata: unknown = JSON.parse(value)
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("live_archive_invalid: Cline session metadata is invalid")
  return metadata as Record<string, unknown>
}

async function optionalStat(path: string) {
  return stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
