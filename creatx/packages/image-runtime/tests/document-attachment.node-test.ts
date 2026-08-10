import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { ProjectFileService } from "@creatx/project-files"
import { ImageAttachmentService } from "../src/document-attachment.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("attaches an existing image after one exact heading and is idempotent", async () => {
  const current = await setup("# 第一章\n\n正文。\n")
  const attachments = new ImageAttachmentService(current.service.queries, current.service.commands)
  const command = { projectId: current.project.id, imagePath: "图片/山门.png", documentPath: "小说/第一章.md", alt: "云中山门", placement: "after_heading" as const, anchor: "第一章" }

  assert.equal((await attachments.attach(command)).changed, true)
  assert.equal((await attachments.attach(command)).changed, false)
  assert.equal(await readFile(join(current.root, "小说", "第一章.md"), "utf8"), "# 第一章\n\n![云中山门](../%E5%9B%BE%E7%89%87/%E5%B1%B1%E9%97%A8.png)\n\n正文。\n")
})

test("treats an existing unencoded reference to the same image as idempotent", async () => {
  const content = "# 第一章\n\n正文。\n\n![旧图注](../图片/山门.png)\n"
  const current = await setup(content)
  const attachments = new ImageAttachmentService(current.service.queries, current.service.commands)

  const result = await attachments.attach({
    projectId: current.project.id,
    imagePath: "图片/山门.png",
    documentPath: "小说/第一章.md",
    alt: "第一章",
    placement: "after_heading",
    anchor: "第一章",
  })

  assert.equal(result.changed, false)
  assert.equal(await readFile(join(current.root, "小说", "第一章.md"), "utf8"), content)
})

test("fails closed for missing images, non-Markdown documents, and ambiguous anchors", async () => {
  const current = await setup("# 重复\n\n正文\n\n# 重复\n")
  await writeFile(join(current.root, "小说", "说明.txt"), "说明", "utf8")
  const attachments = new ImageAttachmentService(current.service.queries, current.service.commands)
  const base = { projectId: current.project.id, imagePath: "图片/山门.png", documentPath: "小说/第一章.md", alt: "山门", placement: "after_heading" as const, anchor: "重复" }

  await assert.rejects(attachments.attach({ ...base, imagePath: "图片/不存在.png" }), /image_attachment_invalid/)
  await assert.rejects(attachments.attach({ ...base, documentPath: "小说/说明.txt" }), /image_attachment_invalid/)
  await assert.rejects(attachments.attach(base), /image_attachment_conflict/)
  assert.equal(await readFile(join(current.root, "小说", "第一章.md"), "utf8"), "# 重复\n\n正文\n\n# 重复\n")
})

test("rereads once after a write conflict and refuses a second conflict", async () => {
  const current = await setup("# 标题\n\n正文。\n")
  let writes = 0
  const oneConflict = new ImageAttachmentService(current.service.queries, {
    writeFile: async (request) => {
      writes += 1
      if (writes === 1) await current.service.commands.writeFile({ projectId: request.projectId, relativePath: request.relativePath, content: "# 标题\n\n用户补充。\n", ...(request.expectedModifiedAt !== undefined ? { expectedModifiedAt: request.expectedModifiedAt } : {}) })
      return current.service.commands.writeFile(request)
    },
  })
  await oneConflict.attach({ projectId: current.project.id, imagePath: "图片/山门.png", documentPath: "小说/第一章.md", alt: "山门", placement: "after_heading", anchor: "标题" })
  assert.match(await readFile(join(current.root, "小说", "第一章.md"), "utf8"), /用户补充。/)
  await writeFile(join(current.root, "图片", "另一座山门.png"), new Uint8Array([137, 80, 78, 71]))

  const alwaysConflict = new ImageAttachmentService(current.service.queries, {
    writeFile: async (request) => {
      const latest = await current.service.queries.refreshProject(request.projectId)
      const file = latest.files.find((entry) => entry.relativePath === request.relativePath)!
      await current.service.commands.writeFile({ projectId: request.projectId, relativePath: request.relativePath, content: `${Date.now()}\n`, expectedModifiedAt: file.modifiedAt })
      return current.service.commands.writeFile(request)
    },
  })
  await assert.rejects(alwaysConflict.attach({ projectId: current.project.id, imagePath: "图片/另一座山门.png", documentPath: "小说/第一章.md", alt: "另图", placement: "end" }), /image_attachment_conflict/)
})

async function setup(content: string) {
  const root = await mkdtemp(join(tmpdir(), "creatx-image-attachment-"))
  roots.push(root)
  await mkdir(join(root, "小说"), { recursive: true })
  await mkdir(join(root, "图片"), { recursive: true })
  await writeFile(join(root, "小说", "第一章.md"), content, "utf8")
  await writeFile(join(root, "图片", "山门.png"), new Uint8Array([137, 80, 78, 71]))
  const service = new ProjectFileService()
  return { root, service, project: await service.openProject(root) }
}
