import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, test } from "node:test"
import { SessionPermissionStore } from "../src/index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Session Permission "))
  roots.push(root)
  return { databasePath: join(root, "session.sqlite") }
}

test("creates legacy sessions as free and persists explicit switches across restart", async () => {
  const { databasePath } = await setup()
  const first = new SessionPermissionStore(databasePath)
  assert.deepEqual(first.ensure("session-1", "project"), { sessionId: "session-1", kind: "project", mode: "free" })
  assert.equal(first.setMode("session-1", "approval").mode, "approval")
  first.close()
  const reopened = new SessionPermissionStore(databasePath)
  assert.equal(reopened.get("session-1")?.mode, "approval")
  reopened.close()
})

test("allocates monotonic conversation titles independently per project across restart", async () => {
  const { databasePath } = await setup()
  const first = new SessionPermissionStore(databasePath)
  assert.equal(first.allocateProjectConversationTitle("project-a"), "创作（1）")
  assert.equal(first.allocateProjectConversationTitle("project-a"), "创作（2）")
  assert.equal(first.allocateProjectConversationTitle("project-b"), "创作（1）")
  first.close()

  const reopened = new SessionPermissionStore(databasePath)
  assert.equal(reopened.allocateProjectConversationTitle("project-a"), "创作（3）")
  assert.equal(reopened.allocateProjectConversationTitle("project-b"), "创作（2）")
  assert.throws(() => reopened.allocateProjectConversationTitle(" "), /session_invalid/)
  reopened.close()
})

test("migrates the permission-only schema before allocating conversation titles", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE session_permission (
      session_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('personal', 'project')),
      mode TEXT NOT NULL CHECK (mode IN ('approval', 'free'))
    );
    INSERT INTO session_permission (session_id, kind, mode) VALUES ('legacy', 'project', 'approval');
    PRAGMA user_version = 1;
  `)
  database.close()

  const migrated = new SessionPermissionStore(databasePath)
  assert.equal(migrated.get("legacy")?.mode, "approval")
  assert.equal(migrated.allocateProjectConversationTitle("project-a"), "创作（1）")
  migrated.close()
})

test("rejects kind changes, unknown sessions, and corrupt stored modes", async () => {
  const { databasePath } = await setup()
  const store = new SessionPermissionStore(databasePath)
  store.ensure("session-1", "personal")
  assert.throws(() => store.ensure("session-1", "project"), /session_conflict/)
  assert.throws(() => store.setMode("missing", "approval"), /session_missing/)
  store.close()
  const database = new DatabaseSync(databasePath)
  database.exec("PRAGMA ignore_check_constraints = ON")
  database.prepare("UPDATE session_permission SET mode = 'unknown' WHERE session_id = 'session-1'").run()
  database.close()
  assert.throws(() => new SessionPermissionStore(databasePath), /session_persistence/)
})

test("fails closed for an unknown schema version", async () => {
  const { databasePath } = await setup()
  const database = new DatabaseSync(databasePath)
  database.exec("PRAGMA user_version = 3")
  database.close()
  assert.throws(() => new SessionPermissionStore(databasePath), /session_persistence: unsupported Session schema version 3/)
})
