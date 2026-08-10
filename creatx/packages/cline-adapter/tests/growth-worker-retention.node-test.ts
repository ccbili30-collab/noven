import { afterEach, expect, test } from "bun:test"
import { SqliteSessionStore } from "@cline/sdk"
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { GrowthWorkerRetention } from "../src/growth-worker-retention.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), "CreatX Worker Retention "))
  roots.push(dataDir)
  const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
  store.init()
  const deleteSession = async (sessionId: string) => {
    const row = store.queryOne<{ messages_path: string | null }>("SELECT messages_path FROM sessions WHERE session_id = ?", [sessionId])
    if (!row) return false
    store.run("DELETE FROM sessions WHERE session_id = ?", [sessionId])
    if (row.messages_path) await rm(dirname(row.messages_path), { recursive: true, force: true })
    return true
  }
  return { dataDir, store, deleteSession }
}

async function insertSession(input: {
  dataDir: string
  store: SqliteSessionStore
  sessionId: string
  status?: string
  ownerSessionId?: string
  goalId?: string
  projectId?: string
  messagesPath?: string
}) {
  const messagesPath = input.messagesPath ?? join(input.dataDir, "sessions", input.sessionId, `${input.sessionId}.messages.json`)
  await mkdir(dirname(messagesPath), { recursive: true })
  await Bun.write(messagesPath, "{\"messages\":[]}")
  const metadata = input.ownerSessionId && input.goalId
    ? { creatxInternalRole: "growth-stage", creatxGrowthOwnerSessionId: input.ownerSessionId, creatxGrowthGoalId: input.goalId, creatxProjectId: input.projectId ?? "project-1" }
    : { creatxProjectId: input.projectId ?? "project-1" }
  const now = new Date().toISOString()
  input.store.run(`
    INSERT INTO sessions (
      session_id, source, pid, started_at, status, status_lock, interactive, provider, model,
      cwd, workspace_root, enable_tools, enable_spawn, enable_teams, is_subagent,
      metadata_json, transcript_path, hook_path, messages_path, updated_at
    ) VALUES (?, 'desktop', ?, ?, ?, 0, 1, 'deepseek', 'deepseek-chat', ?, ?, 1, 0, 0, 0, ?, '', '', ?, ?)
  `, [input.sessionId, process.pid, now, input.status ?? "completed", input.dataDir, input.dataDir, JSON.stringify(metadata), messagesPath, now])
  return messagesPath
}

test("queries only the exact Owner and Goal workers", async () => {
  const value = await setup()
  await insertSession({ ...value, sessionId: "worker-exact", ownerSessionId: "owner-1", goalId: "goal-1" })
  await insertSession({ ...value, sessionId: "worker-other-goal", ownerSessionId: "owner-1", goalId: "goal-2" })
  await insertSession({ ...value, sessionId: "worker-other-owner", ownerSessionId: "owner-2", goalId: "goal-1", projectId: "project-2" })
  await insertSession({ ...value, sessionId: "ordinary-session" })

  const retention = new GrowthWorkerRetention(value.dataDir, value.store, value.deleteSession)
  expect(retention.list("owner-1", "goal-1").map((row) => row.session_id)).toEqual(["worker-exact"])
  value.store.close()
})

test("deletes terminal workers only after an explicit cleanup and keeps active workers", async () => {
  const value = await setup()
  await insertSession({ ...value, sessionId: "worker-terminal", ownerSessionId: "owner-1", goalId: "goal-1" })
  await insertSession({ ...value, sessionId: "worker-active", ownerSessionId: "owner-1", goalId: "goal-1", status: "running" })
  const retention = new GrowthWorkerRetention(value.dataDir, value.store, value.deleteSession)

  expect(value.store.queryAll("SELECT session_id FROM sessions")).toHaveLength(2)
  const result = await retention.cleanup("owner-1", "goal-1")
  expect(result).toEqual({ deletedSessionIds: ["worker-terminal"], deferredSessionIds: ["worker-active"], failedSessionIds: [] })
  expect(retention.list("owner-1", "goal-1").map((row) => row.session_id)).toEqual(["worker-active"])
  expect(await retention.cleanup("owner-1", "goal-1")).toEqual({ deletedSessionIds: [], deferredSessionIds: ["worker-active"], failedSessionIds: [] })
  value.store.close()
})

test("cascades one Owner across its Goals without deleting another Owner's Worker", async () => {
  const value = await setup()
  await insertSession({ ...value, sessionId: "worker-goal-1", ownerSessionId: "owner-1", goalId: "goal-1" })
  await insertSession({ ...value, sessionId: "worker-goal-2", ownerSessionId: "owner-1", goalId: "goal-2" })
  await insertSession({ ...value, sessionId: "worker-other-owner", ownerSessionId: "owner-2", goalId: "goal-1" })
  const retention = new GrowthWorkerRetention(value.dataDir, value.store, value.deleteSession)

  expect(await retention.cleanupOwner("owner-1")).toEqual({
    deletedSessionIds: ["worker-goal-1", "worker-goal-2"],
    deferredSessionIds: [],
    failedSessionIds: [],
  })
  expect(retention.listOwner("owner-1")).toEqual([])
  expect(retention.listOwner("owner-2").map((row) => row.session_id)).toEqual(["worker-other-owner"])
  value.store.close()
})

test("replays a crash after the session row was deleted and removes only the captured Worker directory", async () => {
  const value = await setup()
  const messagesPath = await insertSession({ ...value, sessionId: "worker-crash", ownerSessionId: "owner-1", goalId: "goal-1" })
  let first = true
  const retention = new GrowthWorkerRetention(value.dataDir, value.store, async (sessionId) => {
    if (!first) return value.deleteSession(sessionId)
    first = false
    value.store.run("DELETE FROM sessions WHERE session_id = ?", [sessionId])
    throw new Error("simulated crash after DB deletion")
  })

  expect(await retention.cleanup("owner-1", "goal-1")).toEqual({ deletedSessionIds: [], deferredSessionIds: [], failedSessionIds: ["worker-crash"] })
  expect(await Bun.file(messagesPath).exists()).toBe(true)
  expect(await readdir(join(value.dataDir, "maintenance", "growth-worker-cleanup-v1"))).toHaveLength(1)

  const restored = new GrowthWorkerRetention(value.dataDir, value.store, value.deleteSession)
  expect(await restored.replay()).toEqual([{ deletedSessionIds: ["worker-crash"], deferredSessionIds: [], failedSessionIds: [] }])
  expect(await Bun.file(messagesPath).exists()).toBe(false)
  expect(await readdir(join(value.dataDir, "maintenance", "growth-worker-cleanup-v1"))).toHaveLength(0)
  value.store.close()
})

test("fails closed before deletion when a Worker Artifact path is outside its owned directory", async () => {
  const value = await setup()
  const outsidePath = join(value.dataDir, "outside", "messages.json")
  await insertSession({ ...value, sessionId: "worker-outside", ownerSessionId: "owner-1", goalId: "goal-1", messagesPath: outsidePath })
  let deleteCalls = 0
  const retention = new GrowthWorkerRetention(value.dataDir, value.store, async () => {
    deleteCalls += 1
    return true
  })

  await expect(retention.cleanup("owner-1", "goal-1")).rejects.toThrow("session_cleanup_path")
  expect(deleteCalls).toBe(0)
  expect(value.store.queryOne("SELECT session_id FROM sessions WHERE session_id = 'worker-outside'")).toBeTruthy()
  expect(await Bun.file(outsidePath).exists()).toBe(true)
  value.store.close()
})
