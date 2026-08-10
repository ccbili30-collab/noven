import { expect, test } from "bun:test"
import type { ImageTaskProjection } from "@creatx/contracts"
import { mergeProjectImageTask, projectImageTaskActivity } from "../src/image-task-activity"

test("projects only current project tasks and expires terminal feedback after three seconds", () => {
  const now = Date.parse("2026-08-07T12:00:03.000Z")
  const tasks = [
    task("active", "project-1", "generating", "2026-08-07T12:00:00.000Z"),
    task("done-visible", "project-1", "succeeded", "2026-08-07T12:00:00.001Z"),
    task("done-expired", "project-1", "succeeded", "2026-08-07T12:00:00.000Z"),
    task("other", "project-2", "failed", "2026-08-07T12:00:00.000Z"),
  ]

  const activity = projectImageTaskActivity(tasks, "project-1", now)
  expect(activity.tasks.map((entry) => entry.imageTaskId)).toEqual(["active", "done-visible"])
  expect(activity.completed).toBe(1)
  expect(activity.generating?.imageTaskId).toBe("active")
  expect(tasks).toHaveLength(4)
})

test("routes incremental task events only into the current project projection", () => {
  const current = [task("first", "project-1", "queued", "2026-08-07T12:00:00.000Z")]
  const updated = task("first", "project-1", "generating", "2026-08-07T12:00:01.000Z")
  expect(mergeProjectImageTask(current, updated, "project-1")).toEqual([updated])
  expect(mergeProjectImageTask(current, task("foreign", "project-2", "failed", "2026-08-07T12:00:01.000Z"), "project-1")).toBe(current)
})

test("expires a successful image whose only attachment failure is an ignored position mismatch", () => {
  const completed = { ...task("unattached", "project-1", "succeeded", "2026-08-07T12:00:00.000Z"), attachment: { documentPath: "小说/第一章.md", alt: "图", placement: "end" as const, status: "failed" as const, errorCode: "image_attachment_conflict" } }
  expect(projectImageTaskActivity([completed], "project-1", Date.parse("2026-08-07T13:00:00.000Z")).tasks).toEqual([])
})

test("keeps other document attachment failures visible", () => {
  const failed = { ...task("unattached", "project-1", "succeeded", "2026-08-07T12:00:00.000Z"), attachment: { documentPath: "小说/第一章.md", alt: "图", placement: "end" as const, status: "failed" as const, errorCode: "image_attachment_unavailable" } }
  expect(projectImageTaskActivity([failed], "project-1", Date.parse("2026-08-07T13:00:00.000Z")).tasks).toEqual([failed])
})

function task(imageTaskId: string, projectId: string, status: ImageTaskProjection["status"], completedAt: string): ImageTaskProjection {
  return { imageTaskId, projectId, idempotencyKey: imageTaskId, prompt: "hidden from component", relativePath: `图片/${imageTaskId}.png`, model: "gpt-image-2-cheap", status, createdAt: completedAt, updatedAt: completedAt, completedAt }
}
