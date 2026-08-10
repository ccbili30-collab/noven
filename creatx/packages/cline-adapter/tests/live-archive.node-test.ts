import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { SqliteSessionStore } from "@cline/sdk"
import { promoteClineLiveArchive } from "../src/live-archive.ts"

test("promotes the Owner history without retaining disposable Growth Worker sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-cline-archive-"))
  const sourceDataDir = join(root, "source", "cline")
  const targetDataDir = join(root, "target", "cline")
  const source = new SqliteSessionStore({ sessionsDir: join(sourceDataDir, "database") })
  source.init()
  await createSession(source, sourceDataDir, "owner", { title: "Owner", creatxProjectId: "source-project" }, true)
  await createSession(source, sourceDataDir, "worker", { title: "Worker", creatxProjectId: "source-project", creatxInternalRole: "growth-stage", creatxGrowthOwnerSessionId: "owner", creatxGrowthGoalId: "goal-live" }, false)
  source.close()

  const input = { archiveId: "live-goal-live", goalId: "goal-live", ownerSessionId: "owner", sourceProjectId: "source-project", targetProjectId: "target-project", targetProjectRoot: join(root, "target", "project"), sourceDataDir, targetDataDir }
  const expected = { ownerSessionId: "owner", sessionIds: ["owner"], completedSessions: 0, failedSessions: 0 }
  assert.deepEqual(await promoteClineLiveArchive(input), expected)
  assert.deepEqual(await promoteClineLiveArchive(input), expected)

  const target = new SqliteSessionStore({ sessionsDir: join(targetDataDir, "database") })
  target.init()
  const owner = target.queryOne<{ cwd: string; workspace_root: string; messages_path: string; metadata_json: string }>("SELECT cwd,workspace_root,messages_path,metadata_json FROM sessions WHERE session_id = 'owner'")!
  assert.equal(owner.cwd, input.targetProjectRoot)
  assert.equal(owner.workspace_root, input.targetProjectRoot)
  assert.equal(JSON.parse(owner.metadata_json).creatxProjectId, "target-project")
  assert.equal(JSON.parse(owner.metadata_json).creatxLiveArchiveId, "live-goal-live")
  assert.match(owner.messages_path, /target[\\/]cline[\\/]sessions[\\/]owner/u)
  assert.match(await readFile(owner.messages_path, "utf8"), /final reply/u)
  assert.equal(target.queryOne("SELECT 1 FROM sessions WHERE session_id = 'worker'"), undefined)
  target.close()
})

async function createSession(store: SqliteSessionStore, dataDir: string, sessionId: string, metadata: Record<string, unknown>, owner: boolean) {
  const sessionDir = join(dataDir, "sessions", sessionId)
  const messagesPath = join(sessionDir, `${sessionId}.messages.json`)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(messagesPath, JSON.stringify({ version: 1, messages: owner ? [{ role: "assistant", content: [{ type: "text", text: "final reply" }] }] : [] }), "utf8")
  store.run(`INSERT INTO sessions (session_id,source,pid,started_at,ended_at,exit_code,status,status_lock,interactive,provider,model,cwd,workspace_root,team_name,enable_tools,enable_spawn,enable_teams,parent_session_id,parent_agent_id,agent_id,conversation_id,is_subagent,prompt,metadata_json,transcript_path,hook_path,messages_path,updated_at) VALUES (${Array.from({ length: 28 }, () => "?").join(",")})`, [
    sessionId, "desktop", 1, "2026-08-06T10:00:00.000Z", "2026-08-06T11:00:00.000Z", 0, owner ? "idle" : "completed", 0, 1, "provider", "model", "C:\\source", "C:\\source", null, 1, 0, 0, null, null, null, null, 0, "/growth", JSON.stringify(metadata), "", "", messagesPath, "2026-08-06T11:00:00.000Z",
  ])
}
