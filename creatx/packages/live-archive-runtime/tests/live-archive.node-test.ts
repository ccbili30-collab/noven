import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DatabaseSync } from "node:sqlite"
import { ClineAdapter } from "@creatx/cline-adapter"
import { GrowthGoalStore } from "@creatx/growth-runtime"
import { ImageTaskStore } from "@creatx/image-runtime/queue"
import { projectId } from "@creatx/project-files"
import { SessionPermissionStore } from "@creatx/session-runtime"
import { promotePendingLiveArchives, queueCompletedLiveArchive } from "../src/index.ts"

test("queues and promotes one complete Live run without copying credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-live-archive-"))
  const sourceProjectRoot = join(root, "source-project")
  const sourceUserData = join(root, "source-profile")
  const targetUserData = join(root, "target-profile")
  await mkdir(sourceProjectRoot, { recursive: true })
  await writeFile(join(sourceProjectRoot, "世界.md"), "# 世界\n\n真实正文", "utf8")
  await mkdir(join(sourceUserData, "creatx"), { recursive: true })
  await writeFile(join(sourceUserData, "creatx", "models.json"), "secret-must-not-migrate", "utf8")
  const sourceProjectId = projectId(sourceProjectRoot)
  const permissions = new SessionPermissionStore(join(sourceUserData, "creatx", "session.sqlite"))
  const adapter = await ClineAdapter.create({
    dataDir: join(sourceUserData, "cline"),
    providerId: "provider",
    modelId: "model",
    apiKey: "test-only-key",
    sessionPermissions: permissions,
    onEvent: () => undefined,
  })
  const owner = await adapter.createProjectSession({ projectId: sourceProjectId, projectRoot: sourceProjectRoot })
  await adapter.dispose()
  permissions.close()
  const cline = new DatabaseSync(join(sourceUserData, "cline", "database", "sessions.db"))
  const messagesPath = (cline.prepare("SELECT messages_path FROM sessions WHERE session_id = ?").get(owner.id) as { messages_path: string }).messages_path
  cline.close()
  await writeFile(messagesPath, JSON.stringify({ version: 1, messages: [{ role: "user", content: [{ type: "text", text: "/growth_world_pro" }] }, { role: "assistant", content: [{ type: "text", text: "完成汇报" }] }] }), "utf8")

  const growthPath = join(sourceUserData, "creatx", "growth.sqlite")
  new GrowthGoalStore(growthPath).close()
  const growth = new DatabaseSync(growthPath)
  growth.prepare(`INSERT INTO growth_goal (goal_id,request_id,project_id,session_id,instruction,status,plan_file_id,required_image_task_ids,created_at,updated_at,version,status_reason,work_root_path,world_entry_mode,world_entry_stage,predecessor_goal_id,owner_reply_pending) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "goal-live", "request-live", sourceProjectId, owner.id, "instruction", "completed", null, "[]", "2026-08-06T10:00:00.000Z", "2026-08-06T11:00:00.000Z", 1, null, "世界", "create", "materialization", null, 0,
  )
  growth.close()
  const images = new ImageTaskStore(join(sourceUserData, "creatx", "image-queue.sqlite"))
  images.submit({ projectId: sourceProjectId, idempotencyKey: "image-1", prompt: "prompt", relativePath: "世界/图片.png", model: "gpt-image-2-cheap" })
  images.close()

  const queued = await queueCompletedLiveArchive({ sourceProjectRoot, sourceUserData, targetUserData, goalId: "goal-live" })
  assert.equal(await exists(join(queued.inbox, "creatx", "models.json")), false)
  const promoted = await promotePendingLiveArchives(targetUserData)
  assert.equal(promoted.length, 1)
  assert.equal(promoted[0]!.sessionCount, 1)
  assert.equal(promoted[0]!.imageTaskCount, 1)
  assert.equal(await readFile(join(promoted[0]!.projectRoot, "世界.md"), "utf8"), "# 世界\n\n真实正文")
  const targetImages = new ImageTaskStore(join(targetUserData, "creatx", "image-queue.sqlite"))
  assert.equal(targetImages.listProject(promoted[0]!.projectId)[0]!.status, "interrupted")
  targetImages.close()
  const repeated = await queueCompletedLiveArchive({ sourceProjectRoot, sourceUserData, targetUserData, goalId: "goal-live" })
  assert.match(repeated.inbox, /live-archives[\\/]completed/u)
  assert.deepEqual(await promotePendingLiveArchives(targetUserData), [])
})

async function exists(path: string) {
  return stat(path).then(() => true).catch(() => false)
}
