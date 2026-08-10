import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { ProjectFileService } from "@creatx/project-files"
import {
  ImageAttachmentService,
  ImageRuntime,
  ImageRuntimeError,
} from "../src/index.ts"
import {
  ImageTaskQueue,
  ImageTaskStore,
  imageQueueSchemaV1,
  imageQueueSchemaV2,
  imageQueueSchemaVersion,
  type ImageGenerationPort,
} from "../src/queue.ts"

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"))
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setupStore() {
  const root = await mkdtemp(join(tmpdir(), "CreatX Image Queue "))
  roots.push(root)
  return { root, store: new ImageTaskStore(join(root, "image-queue.sqlite")) }
}

function request(overrides: Partial<Parameters<ImageTaskStore["submit"]>[0]> = {}) {
  return {
    projectId: "project-1",
    idempotencyKey: "image-request-1",
    prompt: "一座海上城市",
    relativePath: "图片/海上城市.png",
    model: "gpt-image-2-cheap" as const,
    ...overrides,
  }
}

test("submits idempotently and rejects conflicting key or live output reuse", async () => {
  const current = await setupStore()

  const first = current.store.submit(request())
  const retry = current.store.submit(request())

  assert.equal(retry.imageTaskId, first.imageTaskId)
  assert.equal(current.store.findProjectByIdempotency("project-1", "image-request-1")?.imageTaskId, first.imageTaskId)
  assert.equal(current.store.findProjectByIdempotency("project-2", "image-request-1"), undefined)
  assert.equal(current.store.listProject("project-1").length, 1)
  assert.throws(() => current.store.submit(request({ prompt: "不同画面" })), /image_queue_conflict/)
  assert.throws(() => current.store.submit(request({ idempotencyKey: "image-request-2" })), /image_queue_conflict/)
  current.store.close()
})

test("migrates a V1 queue without losing tasks and creates Provider attempt history", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Image Queue V1 "))
  roots.push(root)
  const databasePath = join(root, "image-queue.sqlite")
  const database = new DatabaseSync(databasePath)
  database.exec(imageQueueSchemaV1)
  const timestamp = "2026-08-07T00:00:00.000Z"
  const insert = database.prepare(`
    INSERT INTO image_task (
      image_task_id, project_id, idempotency_key, prompt, relative_path, model, size,
      status, error_code, error_message, created_at, updated_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const legacy = ["queued", "generating", "succeeded", "failed", "interrupted"] as const
  legacy.forEach((status) => insert.run(
    `image-${status}`, "project-1", status, `${status} 提示`, `图片/${status}.png`, "gpt-image-2-cheap", null, status,
    status === "failed" ? "image_provider" : null, status === "failed" ? "旧错误" : null, timestamp, timestamp,
    status === "queued" ? null : timestamp, status === "queued" || status === "generating" ? null : timestamp,
  ))
  database.close()

  const store = new ImageTaskStore(databasePath)

  assert.equal(imageQueueSchemaVersion, 4)
  assert.deepEqual(store.listProject("project-1").map((task) => task.status), legacy)
  assert.deepEqual(store.listAttempts("image-queued"), [])
  assert.deepEqual(store.listAttempts("image-failed").map((attempt) => ({ number: attempt.attemptNumber, status: attempt.status, errorCode: attempt.errorCode })), [
    { number: 1, status: "failed", errorCode: "image_provider" },
  ])
  assert.equal(store.listAttempts("image-generating")[0]?.status, "generating")
  assert.equal(store.listAttempts("image-succeeded")[0]?.status, "succeeded")
  assert.equal(store.listAttempts("image-interrupted")[0]?.status, "interrupted")
  const migrated = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal((migrated.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 4)
  migrated.close()
  store.close()
})

test("migrates V2 tasks to nullable Growth source columns without guessing ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Image Queue V2 "))
  roots.push(root)
  const databasePath = join(root, "image-queue.sqlite")
  const database = new DatabaseSync(databasePath)
  database.exec(imageQueueSchemaV2)
  const timestamp = "2026-08-07T00:00:00.000Z"
  database.prepare(`
    INSERT INTO image_task (
      queue_rank, image_task_id, project_id, idempotency_key, prompt, relative_path, model,
      status, created_at, updated_at
    ) VALUES (1, 'image-v2', 'project-1', 'v2', '旧任务', '图片/v2.png', 'gpt-image-2-cheap', 'queued', ?, ?)
  `).run(timestamp, timestamp)
  database.close()

  const store = new ImageTaskStore(databasePath)
  assert.equal(store.listGrowthGoal("project-1", "goal-1").length, 0)
  const migrated = new DatabaseSync(databasePath, { readOnly: true })
  const row = migrated.prepare("SELECT growth_goal_id, growth_work_item_id, growth_attempt_id FROM image_task WHERE image_task_id = 'image-v2'").get() as {
    growth_goal_id: string | null
    growth_work_item_id: string | null
    growth_attempt_id: string | null
  }
  assert.deepEqual({ ...row }, { growth_goal_id: null, growth_work_item_id: null, growth_attempt_id: null })
  assert.equal((migrated.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 4)
  migrated.close()
  store.close()
})

test("persists trusted Growth source and rejects the same key from another attempt", async () => {
  const current = await setupStore()
  const source = { growthGoalId: "goal-1", growthWorkItemId: "object-1", growthAttemptId: "attempt-1" }
  const first = current.store.submit(request(), source)
  const retry = current.store.submit(request(), source)

  assert.equal(retry.imageTaskId, first.imageTaskId)
  assert.deepEqual(current.store.listGrowthGoal("project-1", "goal-1"), [{ task: first, source }])
  assert.throws(() => current.store.submit(request(), { ...source, growthAttemptId: "attempt-2" }), /image_queue_conflict/)
  current.store.close()
})

test("normalizes new queued paths before idempotency, persistence, and Provider work", async () => {
  const current = await setupStore()
  let providerCalls = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => {
      providerCalls += 1
      return generated(input)
    },
  })

  const first = await queue.submit(request({ idempotencyKey: "normalized-path", relativePath: "世界\\地图\\主图.png" }))
  const retry = await queue.submit(request({ idempotencyKey: "normalized-path", relativePath: "世界/地图/主图.png" }))
  assert.equal(first.relativePath, "世界/地图/主图.png")
  assert.equal(retry.imageTaskId, first.imageTaskId)
  assert.equal(current.store.listProject("project-1").length, 1)
  await assert.rejects(() => queue.submit(request({ idempotencyKey: "unsafe-path", relativePath: "../项目外.png" })), /image_queue_invalid/)
  assert.equal(current.store.findProjectByIdempotency("project-1", "unsafe-path"), undefined)
  assert.equal(providerCalls, 0)
  current.store.close()
})

test("claims at most one task per project while allowing different projects", async () => {
  const current = await setupStore()
  const a1 = current.store.submit(request({ idempotencyKey: "a1", relativePath: "图片/a1.png" }))
  current.store.submit(request({ idempotencyKey: "a2", relativePath: "图片/a2.png" }))
  const b1 = current.store.submit(request({ projectId: "project-2", idempotencyKey: "b1", relativePath: "图片/b1.png" }))

  assert.equal(current.store.claimNextForProject("project-1")?.imageTaskId, a1.imageTaskId)
  assert.equal(current.store.claimNextForProject("project-1"), undefined)
  assert.equal(current.store.claimNextForProject("project-2")?.imageTaskId, b1.imageTaskId)
  current.store.close()
})

test("retries at the project tail, moves queued work to the tail, cancels, and preserves every attempt", async () => {
  const current = await setupStore()
  const first = current.store.submit(request({ idempotencyKey: "first", relativePath: "图片/first.png" }))
  const second = current.store.submit(request({ idempotencyKey: "second", relativePath: "图片/second.png" }))
  const third = current.store.submit(request({ idempotencyKey: "third", relativePath: "图片/third.png" }))
  current.store.claimNextForProject("project-1")
  current.store.fail(first.imageTaskId, "image_provider", "first failure")

  assert.equal(current.store.retryNow("project-1", first.imageTaskId).status, "queued")
  assert.deepEqual(current.store.listProject("project-1").map((task) => task.imageTaskId), [second.imageTaskId, third.imageTaskId, first.imageTaskId])
  current.store.skipToProjectTail("project-1", second.imageTaskId)
  assert.deepEqual(current.store.listProject("project-1").map((task) => task.imageTaskId), [third.imageTaskId, first.imageTaskId, second.imageTaskId])
  assert.deepEqual(current.store.listAttempts(first.imageTaskId).map((attempt) => attempt.status), ["failed"])
  assert.equal(current.store.cancel("project-1", third.imageTaskId).status, "cancelled")
  assert.throws(() => current.store.retryNow("project-2", first.imageTaskId), /image_queue_conflict/u)
  current.store.close()
})

test("binds one attachment intent idempotently and fails closed for a different relation", async () => {
  const current = await setupStore()
  const task = current.store.submit(request())
  const attachment = { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading" as const, anchor: "海上城市" }

  assert.deepEqual(current.store.bindAttachmentIntent("project-1", task.imageTaskId, attachment).attachment, { ...attachment, status: "pending" })
  assert.deepEqual(current.store.bindAttachmentIntent("project-1", task.imageTaskId, attachment).attachment, { ...attachment, status: "pending" })
  assert.throws(() => current.store.bindAttachmentIntent("project-1", task.imageTaskId, { ...attachment, documentPath: "世界/另一篇.md" }), /image_queue_conflict/u)
  assert.throws(() => current.store.bindAttachmentIntent("project-2", task.imageTaskId, attachment), /image_queue_conflict/u)
  current.store.close()
})

test("attaches when a receipt binds after image success and does not attach twice", async () => {
  const current = await setupStore()
  const attached: string[] = []
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async (input) => { attached.push(`${input.documentPath}:${input.imagePath}`); return { documentPath: input.documentPath, imagePath: input.imagePath, reference: "![海上城市](../图片/海上城市.png)", changed: true } } },
  })
  const task = await queue.submit(request())
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "succeeded")

  const intent = { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading" as const, anchor: "海上城市" }
  await queue.bindAttachmentIntent("project-1", task.imageTaskId, intent)
  await queue.bindAttachmentIntent("project-1", task.imageTaskId, intent)

  assert.deepEqual(attached, ["世界/海上城市.md:图片/海上城市.png"])
  assert.equal(current.store.get(task.imageTaskId)?.attachment?.status, "succeeded")
  await queue.shutdown()
  current.store.close()
})

test("reports only generating work as active restart-sensitive image work", async () => {
  const current = await setupStore()
  const task = current.store.submit(request())
  assert.equal(current.store.hasGenerating(), false)

  current.store.claimNextForProject("project-1")
  assert.equal(current.store.hasGenerating(), true)

  current.store.interruptGenerating("application restart")
  assert.equal(current.store.hasGenerating(), false)
  current.store.close()
})

test("repairs one failed same-document legacy attachment from an authoritative receipt", async () => {
  const current = await setupStore()
  const attached: string[] = []
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async (input) => {
      attached.push(`${input.documentPath}:${input.alt}:${input.anchor}`)
      return { documentPath: input.documentPath, imagePath: input.imagePath, reference: "![海上城市](../图片/海上城市.png)", changed: false }
    } },
  })
  const legacy = { documentPath: "世界/海上城市.md", alt: "海上城市旧图注", placement: "after_heading" as const, anchor: "# 海上城市" }
  const task = current.store.submit(request({ attachment: legacy }))
  current.store.claimNextForProject("project-1")
  current.store.succeed(task.imageTaskId)
  current.store.finishAttachment(task.imageTaskId, "failed", "image_attachment_conflict", "image_attachment_conflict: expected one exact heading anchor, found 0")

  const canonical = { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading" as const, anchor: "海上城市" }
  await queue.reconcileAttachmentIntent("project-1", task.imageTaskId, canonical)
  await queue.reconcileAttachmentIntent("project-1", task.imageTaskId, canonical)

  assert.deepEqual(attached, ["世界/海上城市.md:海上城市:海上城市"])
  assert.deepEqual(current.store.get(task.imageTaskId)?.attachment, { ...canonical, status: "succeeded" })
  await queue.shutdown()
  current.store.close()
})

test("preserves a successful same-document attachment and canonicalizes a pending one", async () => {
  const current = await setupStore()
  const legacy = { documentPath: "世界/海上城市.md", alt: "海上城市旧图注", placement: "after_heading" as const, anchor: "# 海上城市" }
  const canonical = { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading" as const, anchor: "海上城市" }
  const completed = current.store.submit(request({ idempotencyKey: "completed-attachment", attachment: legacy }))
  current.store.claimNextForProject("project-1")
  current.store.succeed(completed.imageTaskId)
  current.store.finishAttachment(completed.imageTaskId, "succeeded")
  const pending = current.store.submit(request({ idempotencyKey: "pending-attachment", relativePath: "图片/pending.png", attachment: legacy }))
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async () => { throw new Error("unexpected attachment execution") } },
  })

  await queue.reconcileAttachmentIntent("project-1", completed.imageTaskId, canonical)
  await queue.reconcileAttachmentIntent("project-1", pending.imageTaskId, canonical)

  assert.deepEqual(current.store.get(completed.imageTaskId)?.attachment, { ...legacy, status: "succeeded" })
  assert.deepEqual(current.store.get(pending.imageTaskId)?.attachment, { ...canonical, status: "pending" })
  await queue.shutdown()
  current.store.close()
})

test("keeps authoritative receipt recovery closed for another document or another failure category", async () => {
  const current = await setupStore()
  const legacy = { documentPath: "世界/海上城市.md", alt: "海上城市旧图注", placement: "after_heading" as const, anchor: "# 海上城市" }
  const documentConflict = current.store.submit(request({ idempotencyKey: "document-conflict", attachment: legacy }))
  current.store.claimNextForProject("project-1")
  current.store.succeed(documentConflict.imageTaskId)
  current.store.finishAttachment(documentConflict.imageTaskId, "failed", "image_attachment_conflict", "image_attachment_conflict: expected one exact heading anchor, found 0")
  const unavailable = current.store.submit(request({ idempotencyKey: "unavailable", relativePath: "图片/unavailable.png", attachment: legacy }))
  current.store.claimNextForProject("project-1")
  current.store.succeed(unavailable.imageTaskId)
  current.store.finishAttachment(unavailable.imageTaskId, "failed", "image_attachment_unavailable", "image_attachment_unavailable: attachment service is not configured")
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async () => { throw new Error("unexpected attachment execution") } },
  })

  await assert.rejects(
    queue.reconcileAttachmentIntent("project-1", documentConflict.imageTaskId, { ...legacy, documentPath: "世界/另一篇.md", anchor: "另一篇" }),
    /image_queue_conflict/u,
  )
  await assert.rejects(
    queue.reconcileAttachmentIntent("project-1", unavailable.imageTaskId, { ...legacy, alt: "海上城市", anchor: "海上城市" }),
    /image_queue_conflict/u,
  )
  assert.deepEqual(current.store.get(documentConflict.imageTaskId)?.attachment, {
    ...legacy,
    status: "failed",
    errorCode: "image_attachment_conflict",
    errorMessage: "image_attachment_conflict: expected one exact heading anchor, found 0",
  })
  await queue.shutdown()
  current.store.close()
})

test("attaches after image success when a receipt binds while the task is queued", async () => {
  const current = await setupStore()
  const attached: string[] = []
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async (input) => { attached.push(input.documentPath); return { documentPath: input.documentPath, imagePath: input.imagePath, reference: "![海上城市](../图片/海上城市.png)", changed: true } } },
  })
  const task = await queue.submit(request())
  await queue.bindAttachmentIntent("project-1", task.imageTaskId, { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading", anchor: "海上城市" })
  assert.deepEqual(attached, [])
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.attachment?.status === "succeeded")
  assert.deepEqual(attached, ["世界/海上城市.md"])
  await queue.shutdown()
  current.store.close()
})

test("writes one standard Markdown reference through the real project file port after late receipt binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Receipt Attachment "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  await files.commands.writeFile({ projectId: project.id, relativePath: "世界/海上城市.md", content: "# 海上城市\n\n港口沿着礁盘生长。\n", expectedModifiedAt: null })
  const current = await setupStore()
  const runtime = new ImageRuntime({
    baseUrl: "https://image.example/v1",
    apiKey: "secret",
    fileQueries: files.queries,
    fileCommands: files.commands,
    fetch: async () => Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }),
  })
  const queue = new ImageTaskQueue(current.store, runtime, { attachments: new ImageAttachmentService(files.queries, files.commands) })
  const task = await queue.submit(request({ projectId: project.id, relativePath: "世界/图片/海上城市.png" }))
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "succeeded")
  const attachment = { documentPath: "世界/海上城市.md", alt: "海上城市", placement: "after_heading" as const, anchor: "海上城市" }

  await queue.bindAttachmentIntent(project.id, task.imageTaskId, attachment)
  await queue.bindAttachmentIntent(project.id, task.imageTaskId, attachment)

  const content = new TextDecoder().decode(await files.queries.readBytes(project.id, "世界/海上城市.md"))
  assert.equal(content.match(/!\[海上城市\]\(/gu)?.length, 1)
  assert.match(content, /^# 海上城市\n\n!\[海上城市\]\([^\r\n]+\)/u)
  await queue.shutdown()
  current.store.close()
})

test("returns from the submission tool before any Provider work starts", async () => {
  const current = await setupStore()
  let calls = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => { calls += 1; return generated(input) },
  })

  const result = await queue.tool().execute({
    idempotencyKey: "tool-request-1",
    prompt: "漂浮图书馆",
    relativePath: "图片/漂浮图书馆.png",
  }, { sessionId: "session-1", projectId: "project-1" })

  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("submission unexpectedly failed")
  assert.equal((result.value as { status: string }).status, "queued")
  assert.equal(calls, 0)
  queue.start()
  await waitFor(() => calls === 1)
  await queue.shutdown()
  current.store.close()
})

test("uses the current configured default model when a submission omits model", async () => {
  const current = await setupStore()
  let defaultModel: "gpt-image-2-cheap" | "gpt-image-2" = "gpt-image-2-cheap"
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => generated(input),
  }, { defaultModel: () => defaultModel })
  defaultModel = "gpt-image-2"

  const result = await queue.tool().execute({
    idempotencyKey: "configured-model",
    prompt: "世界封面",
    relativePath: "图片/世界封面.png",
  }, { sessionId: "session-1", projectId: "project-1" })

  assert.equal(result.ok, true)
  assert.equal(current.store.findProjectByIdempotency("project-1", "configured-model")?.model, "gpt-image-2")
  await queue.shutdown()
  current.store.close()
})

test("injects the nearest project visual style for different workers before persistence and Provider execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Visual Style "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const style = "# 统一画风\n\n矿物颜料、蛋彩与旧金共同构成项目视觉语言。"
  await files.commands.writeFile({ projectId: project.id, relativePath: "作品/世界/视觉设定/统一画风.md", content: style, expectedModifiedAt: null })
  const current = await setupStore()
  const providerPrompts: string[] = []
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => { providerPrompts.push(input.prompt); return generated(input) },
  }, { visualStyleSource: files.queries })

  const map = await queue.submit(request({ projectId: project.id, idempotencyKey: "map-worker", prompt: "绘制大陆地图", relativePath: "作品/世界/地图/世界地图.png" }))
  const character = await queue.submit(request({ projectId: project.id, idempotencyKey: "character-worker", prompt: "绘制女王全身立绘", relativePath: "作品/世界/人物/图片/女王.png" }))

  assert.match(map.prompt, /^\[项目统一画风（最高视觉约束，不得被本次图片内容覆盖）\]/u)
  assert.match(map.prompt, /矿物颜料、蛋彩与旧金/u)
  assert.match(map.prompt, /\[本次图片内容\]\n绘制大陆地图$/u)
  assert.match(character.prompt, /\[本次图片内容\]\n绘制女王全身立绘$/u)
  queue.start()
  await waitFor(() => providerPrompts.length === 2)
  assert.deepEqual(providerPrompts, [current.store.get(map.imageTaskId)?.prompt, current.store.get(character.imageTaskId)?.prompt])
  await queue.shutdown()
  current.store.close()
})

test("reuses the persisted visual prompt for an exact idempotent retry even after the style file changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Visual Retry "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  await files.commands.writeFile({ projectId: project.id, relativePath: "作品/视觉设定/统一画风.md", content: "# 第一版画风", expectedModifiedAt: null })
  const current = await setupStore()
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, { visualStyleSource: files.queries })
  const command = request({ projectId: project.id, relativePath: "作品/图片/封面.png" })

  const first = await queue.submit(command)
  const snapshot = await files.queries.refreshProject(project.id)
  const styleFile = snapshot.files.find((file) => file.relativePath === "作品/视觉设定/统一画风.md")
  assert.ok(styleFile?.modifiedAt)
  await files.commands.writeFile({ projectId: project.id, relativePath: styleFile.relativePath, content: "# 第二版画风", expectedModifiedAt: styleFile.modifiedAt })
  const retry = await queue.submit(command)

  assert.equal(retry.imageTaskId, first.imageTaskId)
  assert.equal(retry.prompt, first.prompt)
  assert.match(retry.prompt, /第一版画风/u)
  assert.doesNotMatch(retry.prompt, /第二版画风/u)
  await assert.rejects(() => queue.submit({ ...command, prompt: "不同封面" }), /image_queue_conflict/u)
  await queue.shutdown()
  current.store.close()
})

test("continues with the original prompt when no visual style exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX No Visual Style "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const current = await setupStore()
  const warnings: string[] = []
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    visualStyleSource: files.queries,
    onWarning: (warning) => warnings.push(warning.code),
  })

  const task = await queue.submit(request({ projectId: project.id, relativePath: "独立图片.png" }))

  assert.equal(task.prompt, "一座海上城市")
  assert.deepEqual(warnings, ["project_visual_style_missing"])
  await queue.shutdown()
  current.store.close()
})

test("does not persist a task when shutdown wins during visual style lookup", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Visual Shutdown "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const current = await setupStore()
  let release: () => void = () => undefined
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    visualStyleSource: {
      refreshProject: async (projectId) => { await blocked; return files.queries.refreshProject(projectId) },
      readFile: (projectId, fileId) => files.queries.readFile(projectId, fileId),
      readBytes: (projectId, relativePath) => files.queries.readBytes(projectId, relativePath),
      listDirectory: (projectId, relativePath, visibility) => files.queries.listDirectory(projectId, relativePath, visibility),
    },
  })

  const submission = queue.submit(request({ projectId: project.id }))
  await queue.shutdown()
  release()

  await assert.rejects(submission, /image_queue_conflict/u)
  assert.equal(current.store.listProject(project.id).length, 0)
  current.store.close()
})

test("schedules an exact idempotent retry only once", async () => {
  const current = await setupStore()
  let calls = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => { calls += 1; return generated(input) },
  })

  const first = await queue.submit(request())
  const retry = await queue.submit(request())
  queue.start()
  await waitFor(() => current.store.get(first.imageTaskId)?.status === "succeeded")

  assert.equal(retry.imageTaskId, first.imageTaskId)
  assert.equal(calls, 1)
  await queue.shutdown()
  current.store.close()
})

test("processes persisted tasks FIFO with at most one generation active", async () => {
  const current = await setupStore()
  const order: string[] = []
  let active = 0
  let maximumActive = 0
  const runner: ImageGenerationPort = {
    generateToProject: async (input) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      order.push(input.relativePath)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return generated(input)
    },
  }
  const queue = new ImageTaskQueue(current.store, runner)
  const tasks = await Promise.all([1, 2, 3].map((index) => queue.submit(request({
    idempotencyKey: `request-${index}`,
    relativePath: `图片/${index}.png`,
  }))))

  queue.start()
  await waitFor(() => tasks.every((task) => current.store.get(task.imageTaskId)?.status === "succeeded"))

  assert.deepEqual(order, ["图片/1.png", "图片/2.png", "图片/3.png"])
  assert.equal(maximumActive, 1)
  await queue.shutdown()
  current.store.close()
})

test("takes Growth image ownership only from the trusted tool context", async () => {
  const current = await setupStore()
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => generated(input),
  })
  const result = await queue.tool().execute({
    idempotencyKey: "growth-source",
    prompt: "世界地图",
    relativePath: "图片/世界地图.png",
  }, {
    sessionId: "worker-1",
    projectId: "project-1",
    growthGoalId: "goal-1",
    growthWorkItemId: "object-1",
    growthAttemptId: "attempt-1",
  })

  assert.equal(result.ok, true)
  assert.deepEqual(current.store.listGrowthGoal("project-1", "goal-1").map((item) => item.source), [{
    growthGoalId: "goal-1",
    growthWorkItemId: "object-1",
    growthAttemptId: "attempt-1",
  }])
  await queue.shutdown()
  current.store.close()
})

test("persists an unknown-result project gate and resumes through exactly one explicit probe", async () => {
  const current = await setupStore()
  let calls = 0
  let queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => {
      calls += 1
      if (calls === 1) {
        throw new ImageRuntimeError("image_result_unknown", "Provider request ended without an HTTP result (connection_refused, ECONNREFUSED); do not retry automatically.", {
          requestFailureKind: "connection_refused",
        })
      }
      return generated(input)
    },
  })
  const first = await queue.submit(request({ idempotencyKey: "cooldown-1", relativePath: "图片/cooldown-1.png" }))
  const second = await queue.submit(request({ idempotencyKey: "cooldown-2", relativePath: "图片/cooldown-2.png" }))
  const third = await queue.submit(request({ idempotencyKey: "cooldown-3", relativePath: "图片/cooldown-3.png" }))

  queue.start()
  await waitFor(() => current.store.get(first.imageTaskId)?.status === "failed")
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(calls, 1)
  assert.equal(current.store.get(second.imageTaskId)?.status, "queued")
  assert.equal(current.store.get(third.imageTaskId)?.status, "queued")
  assert.deepEqual(
    (({ state, blockingTaskId, errorCode }) => ({ state, blockingTaskId, errorCode }))(current.store.getProjectGate("project-1")!),
    { state: "blocked", blockingTaskId: first.imageTaskId, errorCode: "image_result_unknown" },
  )

  await queue.shutdown()
  current.store.close()

  const reopened = new ImageTaskStore(join(current.root, "image-queue.sqlite"))
  calls = 0
  queue = new ImageTaskQueue(reopened, {
    generateToProject: async (input) => {
      calls += 1
      return generated(input)
    },
  })
  queue.start()
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(calls, 0)
  assert.equal(reopened.getProjectGate("project-1")?.state, "blocked")

  queue.control("project-1", first.imageTaskId, "retry")
  await waitFor(() => reopened.get(first.imageTaskId)?.status === "succeeded")
  await waitFor(() => reopened.get(third.imageTaskId)?.status === "succeeded")
  assert.equal(calls, 3)
  assert.equal(reopened.getProjectGate("project-1"), undefined)
  await queue.shutdown()
  reopened.close()
})

test("allows an Agent only one automatic recovery probe for an unknown-result project gate", async () => {
  const current = await setupStore()
  let calls = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async () => {
      calls += 1
      throw new ImageRuntimeError("image_result_unknown", "Provider request ended without an HTTP result (timeout); do not retry automatically.", {
        requestFailureKind: "timeout",
      })
    },
  })
  const task = await queue.submit(request({ idempotencyKey: "bounded-agent-probe", relativePath: "图片/bounded-agent-probe.png" }))
  const tool = queue.managementTool()
  const context = { sessionId: "session-1", projectId: "project-1" }

  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "failed")
  assert.equal((await tool.execute({ action: "retry", imageTaskId: task.imageTaskId }, context)).ok, true)
  await waitFor(() => calls === 2 && current.store.get(task.imageTaskId)?.status === "failed")

  const rejected = await tool.execute({ action: "retry", imageTaskId: task.imageTaskId }, context)
  assert.equal(rejected.ok, false)
  if (rejected.ok) throw new Error("second Agent probe unexpectedly succeeded")
  assert.match(rejected.error.detail ?? "", /automatic recovery probe already failed/)
  assert.equal(calls, 2)
  assert.equal(current.store.get(task.imageTaskId)?.status, "failed")
  assert.equal(current.store.getProjectGate("project-1")?.agentProbeUsed, true)
  await queue.shutdown()
  current.store.close()
})

test("runs two project lanes concurrently, keeps each project serial, and rotates waiting projects fairly", async () => {
  const current = await setupStore()
  const started: string[] = []
  const activeProjects = new Set<string>()
  const releases = new Map<string, () => void>()
  let maximumActive = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => {
      assert.equal(activeProjects.has(input.projectId), false)
      activeProjects.add(input.projectId)
      maximumActive = Math.max(maximumActive, activeProjects.size)
      started.push(input.relativePath)
      await new Promise<void>((resolve) => releases.set(input.relativePath, resolve))
      activeProjects.delete(input.projectId)
      return generated(input)
    },
  })
  const a1 = await queue.submit(request({ idempotencyKey: "a1", relativePath: "图片/a1.png" }))
  const a2 = await queue.submit(request({ idempotencyKey: "a2", relativePath: "图片/a2.png" }))
  const b1 = await queue.submit(request({ projectId: "project-2", idempotencyKey: "b1", relativePath: "图片/b1.png" }))
  const c1 = await queue.submit(request({ projectId: "project-3", idempotencyKey: "c1", relativePath: "图片/c1.png" }))
  await new Promise((resolve) => setTimeout(resolve, 5))

  queue.start()
  await waitFor(() => started.length === 2)
  assert.deepEqual(new Set(started), new Set([a1.relativePath, b1.relativePath]))
  releases.get(a1.relativePath)?.()
  await waitFor(() => started.length === 3)
  assert.equal(started[2], c1.relativePath)
  assert.equal(started.includes(a2.relativePath), false)
  releases.get(b1.relativePath)?.()
  await waitFor(() => started.includes(a2.relativePath))
  releases.get(c1.relativePath)?.()
  releases.get(a2.relativePath)?.()
  await waitFor(() => [a1, a2, b1, c1].every((task) => current.store.get(task.imageTaskId)?.status === "succeeded"))

  assert.equal(maximumActive, 2)
  await queue.shutdown()
  current.store.close()
})

test("does not start the next project task until a cancelled Provider promise settles", async () => {
  const current = await setupStore()
  const started: string[] = []
  const releases = new Map<string, () => void>()
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => {
      started.push(input.relativePath)
      await new Promise<void>((resolve) => releases.set(input.relativePath, resolve))
      if (input.signal?.aborted) throw input.signal.reason
      return generated(input)
    },
  })
  const first = await queue.submit(request({ idempotencyKey: "cancel-first", relativePath: "图片/cancel-first.png" }))
  const second = await queue.submit(request({ idempotencyKey: "cancel-second", relativePath: "图片/cancel-second.png" }))
  queue.start()
  await waitFor(() => started.length === 1)

  assert.equal(queue.control("project-1", first.imageTaskId, "cancel").status, "cancelled")
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(started, [first.relativePath])
  releases.get(first.relativePath)?.()
  await waitFor(() => started.length === 2)
  releases.get(second.relativePath)?.()
  await waitFor(() => current.store.get(second.imageTaskId)?.status === "succeeded")

  await queue.shutdown()
  current.store.close()
})

test("gives agents one bounded project tool to inspect, retry, skip, and cancel image tasks", async () => {
  const current = await setupStore()
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) })
  const first = await queue.submit(request({ idempotencyKey: "manage-first", relativePath: "图片/manage-first.png" }))
  const second = await queue.submit(request({ idempotencyKey: "manage-second", relativePath: "图片/manage-second.png" }))
  current.store.claimNextForProject("project-1")
  current.store.fail(first.imageTaskId, "image_provider", "temporary failure")
  const tool = queue.managementTool()

  assert.equal(tool.name, "manage_image_generation")
  assert.deepEqual(tool.audiences, ["ordinary", "growth-stage", "world-writer", "world-recovery"])
  const listed = await tool.execute({ action: "list" }, { sessionId: "session-1", projectId: "project-1" })
  assert.equal(listed.ok, true)
  if (!listed.ok) throw new Error("list unexpectedly failed")
  assert.deepEqual((listed.value as { tasks: Array<{ imageTaskId: string }> }).tasks.map((task) => task.imageTaskId), [first.imageTaskId, second.imageTaskId])
  assert.equal("prompt" in (listed.value as { tasks: object[] }).tasks[0]!, false)

  const retried = await tool.execute({ action: "retry", imageTaskId: first.imageTaskId }, { sessionId: "session-1", projectId: "project-1" })
  assert.equal(retried.ok, true)
  assert.equal(current.store.listProject("project-1").at(-1)?.imageTaskId, first.imageTaskId)
  const skipped = await tool.execute({ action: "skip", imageTaskId: second.imageTaskId }, { sessionId: "session-1", projectId: "project-1" })
  assert.equal(skipped.ok, true)
  assert.equal(current.store.listProject("project-1").at(-1)?.imageTaskId, second.imageTaskId)
  const cancelled = await tool.execute({ action: "cancel", imageTaskId: second.imageTaskId }, { sessionId: "session-1", projectId: "project-1" })
  assert.equal(cancelled.ok, true)
  assert.equal(current.store.get(second.imageTaskId)?.status, "cancelled")
  const crossProject = await tool.execute({ action: "cancel", imageTaskId: first.imageTaskId }, { sessionId: "session-2", projectId: "project-2" })
  assert.equal(crossProject.ok, false)

  await queue.shutdown()
  current.store.close()
})

test("emits persisted transitions and treats repeated start as a no-op", async () => {
  const current = await setupStore()
  const statuses: string[] = []
  let release: () => void = () => undefined
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => { await blocked; return generated(input) },
  }, { onEvent: (event) => statuses.push(event.task.status) })
  const task = await queue.submit(request())
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "generating")

  queue.start()
  assert.equal(current.store.get(task.imageTaskId)?.status, "generating")
  release()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "succeeded")

  assert.deepEqual(statuses, ["queued", "generating", "succeeded"])
  await queue.shutdown()
  current.store.close()
})

test("persists classified failure and requires a new task for a changed prompt", async () => {
  const current = await setupStore()
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async () => { throw new Error("image_provider: quota exhausted for sk-secret-value") },
  })
  const failed = await queue.submit(request())
  queue.start()
  await waitFor(() => current.store.get(failed.imageTaskId)?.status === "failed")

  const old = current.store.get(failed.imageTaskId)
  const replacement = await queue.submit(request({ idempotencyKey: "image-request-2", prompt: "夜晚的海上城市" }))

  assert.match(old?.errorMessage ?? "", /quota exhausted/)
  assert.doesNotMatch(old?.errorMessage ?? "", /sk-secret-value/)
  assert.notEqual(replacement.imageTaskId, failed.imageTaskId)
  assert.equal(old?.status, "failed")
  await queue.shutdown()
  current.store.close()
})

test("marks an inherited generating task interrupted and resumes only queued work", async () => {
  const current = await setupStore()
  const interrupted = current.store.submit(request())
  const queued = current.store.submit(request({ idempotencyKey: "image-request-2", relativePath: "图片/第二张.png" }))
  assert.equal(current.store.claimNext()?.imageTaskId, interrupted.imageTaskId)
  current.store.close()

  const reopened = new ImageTaskStore(join(current.root, "image-queue.sqlite"))
  const calls: string[] = []
  const queue = new ImageTaskQueue(reopened, {
    generateToProject: async (input) => { calls.push(input.relativePath); return generated(input) },
  })
  queue.start()
  await waitFor(() => reopened.get(queued.imageTaskId)?.status === "succeeded")

  assert.equal(reopened.get(interrupted.imageTaskId)?.status, "interrupted")
  assert.deepEqual(calls, ["图片/第二张.png"])
  await queue.shutdown()
  reopened.close()
})

test("interrupts and never retries the active paid request during shutdown", async () => {
  const current = await setupStore()
  let calls = 0
  const queue = new ImageTaskQueue(current.store, {
    generateToProject: async (input) => {
      calls += 1
      await new Promise<void>((_resolve, reject) => input.signal?.addEventListener("abort", () => reject(input.signal?.reason), { once: true }))
      return generated(input)
    },
  })
  const task = await queue.submit(request())
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "generating")

  await queue.shutdown()

  assert.equal(current.store.get(task.imageTaskId)?.status, "interrupted")
  queue.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(calls, 1)
  await queue.shutdown()
  current.store.close()
})

test("reuses the real image runtime and project file port on queue success", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Queue Project "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  const current = await setupStore()
  const runtime = new ImageRuntime({
    baseUrl: "https://images.example/v1",
    apiKey: "secret",
    fileQueries: files.queries,
    fileCommands: files.commands,
    fetch: async () => Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }),
  })
  const queue = new ImageTaskQueue(current.store, runtime)
  const task = await queue.submit(request({ projectId: project.id }))
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "succeeded")

  assert.deepEqual(await files.queries.readBytes(project.id, "图片/海上城市.png"), png)
  assert.equal(await current.store.imageTaskStatus(project.id, task.imageTaskId), "succeeded")
  await queue.shutdown()
  current.store.close()
})

test("fails a queued task without overwriting an existing project image", async () => {
  const root = await mkdtemp(join(tmpdir(), "CreatX Queue Conflict "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  await files.commands.writeFile({ projectId: project.id, relativePath: "图片/海上城市.png", content: png, expectedModifiedAt: null })
  const current = await setupStore()
  const runtime = new ImageRuntime({
    baseUrl: "https://images.example/v1",
    apiKey: "secret",
    fileQueries: files.queries,
    fileCommands: files.commands,
    fetch: async () => Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }),
  })
  const queue = new ImageTaskQueue(current.store, runtime)
  const task = await queue.submit(request({ projectId: project.id }))
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.status === "failed")

  assert.match(current.store.get(task.imageTaskId)?.errorMessage ?? "", /file_conflict/)
  assert.deepEqual(await files.queries.readBytes(project.id, "图片/海上城市.png"), png)
  await queue.shutdown()
  current.store.close()
})

test("keeps image success when automatic document attachment fails", async () => {
  const current = await setupStore()
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async () => { throw new Error("image_attachment_conflict: anchor changed") } },
  })
  const task = await queue.submit(request({ attachment: { documentPath: "小说/第一章.md", alt: "海上城市", placement: "after_heading", anchor: "第一章" } }))
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.attachment?.status === "failed")

  const failedAttachment = current.store.get(task.imageTaskId)!
  assert.equal(failedAttachment.status, "succeeded")
  assert.equal(failedAttachment.attachment?.status, "failed")
  assert.match(failedAttachment.attachment?.errorMessage ?? "", /anchor changed/)
  await queue.shutdown()
  current.store.close()
})

test("persists successful automatic attachment after image generation", async () => {
  const current = await setupStore()
  const attached: string[] = []
  const queue = new ImageTaskQueue(current.store, { generateToProject: async (input) => generated(input) }, {
    attachments: { attach: async (input) => {
      attached.push(`${input.documentPath}:${input.imagePath}`)
      return { documentPath: input.documentPath, imagePath: input.imagePath, reference: "![图](../图片/海上城市.png)", changed: true }
    } },
  })
  const task = await queue.submit(request({ attachment: { documentPath: "小说/第一章.md", alt: "海上城市", placement: "end" } }))
  queue.start()
  await waitFor(() => current.store.get(task.imageTaskId)?.attachment?.status === "succeeded")

  assert.deepEqual(attached, ["小说/第一章.md:图片/海上城市.png"])
  assert.equal((await current.store.imageTaskEvidence("project-1", task.imageTaskId))?.attachment?.status, "succeeded")
  await queue.shutdown()
  current.store.close()
})

test("fails closed on an unknown queue schema version", async () => {
  const current = await setupStore()
  current.store.close()
  const database = new DatabaseSync(join(current.root, "image-queue.sqlite"))
  database.exec("PRAGMA user_version = 99")
  database.close()

  assert.throws(() => new ImageTaskStore(join(current.root, "image-queue.sqlite")), /image_queue_persistence/)
})

function generated(input: Parameters<ImageGenerationPort["generateToProject"]>[0]) {
  return {
    projectId: input.projectId,
    relativePath: input.relativePath,
    model: input.model,
    mimeType: "image/png" as const,
    bytes: png.byteLength,
    transport: "b64_json" as const,
    visualStyleApplied: false,
  }
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for image queue state")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
