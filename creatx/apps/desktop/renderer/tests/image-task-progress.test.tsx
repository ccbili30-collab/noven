import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ImageTaskProjection } from "@creatx/contracts"
import { ImageTaskProgress, imageTaskActions, imageTaskSections } from "../src/ImageTaskProgress"

test("offers only legal image task controls", () => {
  expect(imageTaskActions("queued")).toEqual(["skip", "cancel"])
  expect(imageTaskActions("generating")).toEqual(["cancel"])
  expect(imageTaskActions("failed")).toEqual(["retry", "cancel"])
  expect(imageTaskActions("interrupted")).toEqual(["retry", "cancel"])
  expect(imageTaskActions("succeeded")).toEqual([])
})

test("groups tasks in generation, queue, failure, and terminal order", () => {
  const sections = imageTaskSections([task("done", "succeeded"), task("failed", "failed"), task("queued", "queued"), task("active", "generating")])
  expect(sections.map((section) => section.label)).toEqual(["正在生成", "等待生成", "失败待处理", "已完成"])
  expect(sections.flatMap((section) => section.tasks.map((entry) => entry.imageTaskId))).toEqual(["active", "queued", "failed", "done"])
})

test("groups an ignored attachment position mismatch as completed", () => {
  const completed = { ...task("done", "succeeded"), attachment: { documentPath: "小说/第一章.md", alt: "图", placement: "after_heading" as const, anchor: "第一章", status: "failed" as const, errorCode: "image_attachment_conflict" } }
  const sections = imageTaskSections([completed])
  expect(sections).toHaveLength(1)
  expect(sections[0]?.label).toBe("已完成")
})

test("renders a failed task error summary as visible text", () => {
  const failed = { ...task("failed", "failed"), errorMessage: "image_protocol: Provider returned invalid JSON" }
  const html = renderToStaticMarkup(<ImageTaskProgress projectId="failed" tasks={[failed]} onAction={async () => true} />)
  expect(html).toContain("Provider returned invalid JSON")
})

test("renders compact current-project progress without another project's task", () => {
  const html = renderToStaticMarkup(<ImageTaskProgress projectId="project-1" tasks={[task("project-1", "queued"), task("project-2", "failed")]} onAction={async () => true} />)
  expect(html).toContain("图片生成进度")
  expect(html).toContain("图片/project-1.png")
  expect(html).not.toContain("图片/project-2.png")
})

function task(projectId: string, status: ImageTaskProjection["status"]): ImageTaskProjection {
  return { imageTaskId: projectId, projectId, idempotencyKey: projectId, prompt: "prompt", relativePath: `图片/${projectId}.png`, model: "gpt-image-2-cheap", status, createdAt: "2026-08-07T12:00:00.000Z", updatedAt: "2026-08-07T12:00:00.000Z" }
}
