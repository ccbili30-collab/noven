import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoreSessionService, SqliteSessionStore } from "@cline/sdk"
import { claimPersistedSessionProcess } from "../src/index.ts"

test("reconciles and claims a dead running Session in both SQLite and the manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-session-claim-"))
  const store = new SqliteSessionStore({ sessionsDir: join(root, "database") })
  store.init()
  const service = new CoreSessionService(store, { sessionArtifactsDir: join(root, "sessions") })
  try {
    await service.createRootSessionWithArtifacts({
      sessionId: "session-1",
      source: "desktop",
      pid: 2_147_483_647,
      interactive: true,
      provider: "openai-compatible",
      model: "model",
      cwd: root,
      workspaceRoot: root,
      enableTools: true,
      enableSpawn: false,
      enableTeams: false,
    })
    const result = await claimPersistedSessionProcess(store, service, "session-1", 22222, () => false)

    assert.equal(result.pid, 22222)
    assert.equal(store.get("session-1")?.pid, 22222)
    assert.equal(service.readSessionManifest("session-1")?.pid, 22222)
    assert.equal(result.status, "failed")
    assert.equal(service.readSessionManifest("session-1")?.status, "failed")
  } finally {
    store.close()
    await rm(root, { recursive: true, force: true })
  }
})

test("fails closed when another live process still owns the Session", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-session-owner-"))
  const store = new SqliteSessionStore({ sessionsDir: join(root, "database") })
  store.init()
  const service = new CoreSessionService(store, { sessionArtifactsDir: join(root, "sessions") })
  try {
    await service.createRootSessionWithArtifacts({
      sessionId: "session-2",
      source: "desktop",
      pid: 33333,
      interactive: true,
      provider: "openai-compatible",
      model: "model",
      cwd: root,
      workspaceRoot: root,
      enableTools: true,
      enableSpawn: false,
      enableTeams: false,
    })

    await assert.rejects(() => claimPersistedSessionProcess(store, service, "session-2", 44444, (pid) => pid === 33333), /session_conflict/u)
    assert.equal(store.get("session-2")?.pid, 33333)
  } finally {
    store.close()
    await rm(root, { recursive: true, force: true })
  }
})
