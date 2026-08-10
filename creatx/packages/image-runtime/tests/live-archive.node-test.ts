import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DatabaseSync } from "node:sqlite"
import { promoteImageLiveArchive } from "../src/live-archive.ts"
import { ImageTaskStore } from "../src/queue-store.ts"
import { imageQueueSchemaV1 } from "../src/queue-schema.ts"

test("promotes a V1 image queue into the current schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-image-archive-v1-"))
  const sourcePath = join(root, "source.sqlite")
  const targetPath = join(root, "target.sqlite")
  const source = new DatabaseSync(sourcePath)
  source.exec(imageQueueSchemaV1)
  const timestamp = "2026-08-06T10:00:00.000Z"
  source.prepare(`
    INSERT INTO image_task (
      image_task_id, project_id, idempotency_key, prompt, relative_path, model, size,
      status, error_code, error_message, created_at, updated_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("image-v1", "source-project", "v1", "旧图片", "images/v1.png", "gpt-image-2-cheap", null, "failed", "image_provider", "旧错误", timestamp, timestamp, timestamp, timestamp)
  source.close()
  new ImageTaskStore(targetPath).close()

  assert.deepEqual(promoteImageLiveArchive({ sourceDatabasePath: sourcePath, targetDatabasePath: targetPath, sourceProjectId: "source-project", targetProjectId: "target-project", interruptedAt: timestamp }), {
    taskCount: 1,
    succeededTasks: 0,
    failedTasks: 1,
    interruptedTasks: 0,
  })
  const target = new ImageTaskStore(targetPath)
  assert.equal(target.listProject("target-project")[0]?.status, "failed")
  assert.deepEqual(target.listAttempts("image-v1").map((attempt) => attempt.status), ["failed"])
  target.close()
})

test("promotes image history idempotently without restarting queued Provider work", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-image-archive-"))
  const sourcePath = join(root, "source.sqlite")
  const targetPath = join(root, "target.sqlite")
  const source = new ImageTaskStore(sourcePath)
  source.submit({ projectId: "source-project", idempotencyKey: "done", prompt: "done prompt", relativePath: "images/done.png", model: "gpt-image-2-cheap" })
  source.claimNext()
  source.succeed(source.listProject("source-project")[0]!.imageTaskId)
  source.submit({ projectId: "source-project", idempotencyKey: "active", prompt: "active prompt", relativePath: "images/active.png", model: "gpt-image-2-cheap" })
  const blocked = source.claimNext()!
  source.fail(blocked.imageTaskId, "image_result_unknown", "Provider request ended without an HTTP result")
  source.blockProject("source-project", blocked.imageTaskId, "image_result_unknown", "Provider request ended without an HTTP result")
  source.submit({ projectId: "source-project", idempotencyKey: "queued", prompt: "queued prompt", relativePath: "images/queued.png", model: "gpt-image-2-cheap" })
  source.close()
  new ImageTaskStore(targetPath).close()

  const input = { sourceDatabasePath: sourcePath, targetDatabasePath: targetPath, sourceProjectId: "source-project", targetProjectId: "target-project", interruptedAt: "2026-08-06T12:00:00.000Z" }
  assert.deepEqual(promoteImageLiveArchive(input), { taskCount: 3, succeededTasks: 1, failedTasks: 1, interruptedTasks: 1 })
  assert.deepEqual(promoteImageLiveArchive(input), { taskCount: 3, succeededTasks: 1, failedTasks: 1, interruptedTasks: 1 })

  const target = new ImageTaskStore(targetPath)
  const tasks = target.listProject("target-project")
  assert.deepEqual(tasks.map((task) => task.status), ["succeeded", "failed", "interrupted"])
  assert.equal(tasks[2]!.errorCode, "image_archive_interrupted")
  assert.deepEqual(target.getProjectGate("target-project"), {
    projectId: "target-project",
    state: "blocked",
    blockingTaskId: blocked.imageTaskId,
    errorCode: "image_result_unknown",
    errorMessage: "Provider request ended without an HTTP result",
    agentProbeUsed: false,
    openedAt: target.getProjectGate("target-project")!.openedAt,
    updatedAt: input.interruptedAt,
  })
  assert.equal(target.hasQueued(), false)
  target.close()

  const database = new DatabaseSync(targetPath)
  database.prepare("UPDATE image_task SET prompt = 'conflict' WHERE idempotency_key = 'queued'").run()
  database.close()
  assert.throws(() => promoteImageLiveArchive(input), /live_archive_conflict/u)
})
