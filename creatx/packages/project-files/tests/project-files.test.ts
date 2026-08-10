import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { appendProjectRevisionContext, ProjectFileService, projectId, readProjectFile, scanProject } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("project file projection", () => {
  test("wraps revision awareness as hidden Cline runtime context", () => {
    expect(appendProjectRevisionContext("继续写", "项目版本 2。读取 chapter.md")).toBe("继续写\n<mode_notice>项目版本 2。读取 chapter.md</mode_notice>")
    expect(appendProjectRevisionContext("继续写", undefined)).toBe("继续写")
  })
  test("publishes visible content changes but not internal state writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-file-events-"))
    roots.push(root)
    const changed: string[] = []
    const service = new ProjectFileService({ onContentChanged: (id) => changed.push(id) })
    const project = await service.openProject(root)

    await service.internal.writeFile({
      projectId: project.id,
      namespace: "test-state",
      key: "record.json",
      content: "{}\n",
      expectedModifiedAt: null,
    })
    expect(changed).toEqual([])

    await service.commands.writeFile({ projectId: project.id, relativePath: "世界/规则.md", content: "规则" })
    expect(changed).toEqual([project.id])
  })

  test("scans and reads a Chinese path without creating a content copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 项目 "))
    roots.push(root)
    await mkdir(join(root, "小说"))
    await writeFile(join(root, "小说", "第一章.md"), "最初的内容", "utf8")

    const first = await scanProject(root)
    expect(first.id).toBe(projectId(root))
    expect(first.files.map((file) => file.relativePath)).toEqual(["小说/第一章.md"])
    expect((await readProjectFile(root, first.files[0]!.id)).content).toBe("最初的内容")

    await writeFile(join(root, "小说", "第一章.md"), "用户修改后的内容", "utf8")
    const refreshed = await scanProject(root)
    expect((await readProjectFile(root, refreshed.files[0]!.id)).content).toBe("用户修改后的内容")
  })

  test("classifies project HTML without exposing executable source as text", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-html-project-"))
    roots.push(root)
    await writeFile(join(root, "index.html"), "<script>window.test = true</script>", "utf8")
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const html = project.files.find((file) => file.name === "index.html")!

    expect(html.kind).toBe("html")
    expect(await service.queries.readFile(project.id, html.id)).toEqual({ file: html })
  })

  test("scans a large multi-directory project without dropping files", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-large-project-"))
    roots.push(root)
    for (let directoryIndex = 0; directoryIndex < 20; directoryIndex += 1) {
      const directory = join(root, `collection-${directoryIndex}`)
      await mkdir(directory)
      for (let fileIndex = 0; fileIndex < 30; fileIndex += 1) {
        await writeFile(join(directory, `entry-${fileIndex}.md`), `# ${directoryIndex}-${fileIndex}\n`, "utf8")
      }
    }

    const project = await scanProject(root)

    expect(project.files).toHaveLength(600)
    expect(new Set(project.files.map((file) => file.relativePath)).size).toBe(600)
  })

  test("shares file-operation capacity across concurrent service scans and reads", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-concurrent-project-"))
    roots.push(root)
    for (let directoryIndex = 0; directoryIndex < 20; directoryIndex += 1) {
      const directory = join(root, `collection-${directoryIndex}`)
      await mkdir(directory)
      await Promise.all(Array.from({ length: 30 }, (_value, fileIndex) => writeFile(join(directory, `entry-${fileIndex}.md`), `# ${directoryIndex}-${fileIndex}\n`, "utf8")))
    }
    const service = new ProjectFileService()
    const project = await service.openProject(root)

    const results = await Promise.all([
      ...Array.from({ length: 12 }, () => service.queries.refreshProject(project.id)),
      ...Array.from({ length: 12 }, () => service.queries.readBytes(project.id, "collection-0/entry-0.md")),
    ])

    expect(results.slice(0, 12).every((result) => "files" in result && result.files.length === 600)).toBe(true)
    expect(results.slice(12).every((result) => new TextDecoder().decode(result as Uint8Array) === "# 0-0\n")).toBe(true)
  })

  test("does not follow symlinks or expose ignored runtime directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-files-"))
    const outside = await mkdtemp(join(tmpdir(), "creatx-files-outside-"))
    roots.push(root, outside)
    await mkdir(join(root, ".creatx"))
    await mkdir(join(root, "node_modules"))
    await writeFile(join(root, ".creatx", "private.json"), "{}")
    await writeFile(join(root, "node_modules", "package.js"), "hidden")
    await writeFile(join(root, "visible.txt"), "visible")
    await writeFile(join(outside, "outside.txt"), "outside")
    await symlink(outside, join(root, "linked-outside"), "junction")

    expect((await scanProject(root)).files.map((file) => file.relativePath)).toEqual(["visible.txt"])

    const service = new ProjectFileService()
    const project = await service.openProject(root)
    await expect(service.queries.readBytes(project.id, "linked-outside/outside.txt")).rejects.toThrow("file_invalid")
    await expect(service.commands.writeFile({
      projectId: project.id,
      relativePath: "linked-outside/escaped.md",
      content: "no",
    })).rejects.toThrow("file_invalid")
    await expect(access(join(outside, "escaped.md"))).rejects.toThrow()
  })

  test("rejects relative project roots and unknown file identities", async () => {
    await expect(scanProject("relative/path")).rejects.toThrow("project_invalid")
    const root = await mkdtemp(join(tmpdir(), "creatx-files-"))
    roots.push(root)
    await expect(readProjectFile(root, "missing")).rejects.toThrow("file_invalid")
  })

  test("keeps project roots behind query and command ports", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX Port 项目 "))
    roots.push(root)
    const service = new ProjectFileService()
    const project = await service.openProject(root)

    const written = await service.commands.writeFile({
      projectId: project.id,
      relativePath: "章节/第二章.md",
      content: "由真实 Command Port 写入",
    })

    expect(written.created).toBe(true)
    expect(written.file.relativePath).toBe("章节/第二章.md")
    const refreshed = await service.queries.refreshProject(project.id)
    expect(refreshed.files.map((file) => file.relativePath)).toEqual(["章节/第二章.md"])
    expect((await service.queries.readFile(project.id, written.file.id)).content).toBe("由真实 Command Port 写入")
    expect(new TextDecoder().decode(await service.queries.readBytes(project.id, "章节/第二章.md"))).toBe("由真实 Command Port 写入")

    const updated = await service.commands.writeFile({
      projectId: project.id,
      relativePath: "章节/第二章.md",
      content: "第二次原子写入",
      expectedModifiedAt: written.file.modifiedAt,
    })
    expect(updated.created).toBe(false)
    expect(updated.previousModifiedAt).toBe(written.file.modifiedAt)
    expect((await service.queries.readFile(project.id, updated.file.id)).content).toBe("第二次原子写入")
  })

  test("saves an existing text file by identity and rejects stale or non-text edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-editor-"))
    roots.push(root)
    await writeFile(join(root, "chapter.md"), "first", "utf8")
    await writeFile(join(root, "cover.png"), new Uint8Array([1, 2, 3]))
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const chapter = project.files.find((file) => file.name === "chapter.md")!
    const cover = project.files.find((file) => file.name === "cover.png")!

    const saved = await service.saveTextFile({ projectId: project.id, fileId: chapter.id, content: "second", expectedModifiedAt: chapter.modifiedAt })
    expect(saved.content).toBe("second")
    expect(saved.file.modifiedAt).not.toBe(chapter.modifiedAt)
    expect(await service.projectRevisionContext(project.id)).toContain("项目版本 1")
    expect(await service.projectRevisionContext(project.id)).toContain("chapter.md")
    expect(await service.projectRevisionContext(project.id)).toContain("用户")
    await expect(service.saveTextFile({ projectId: project.id, fileId: chapter.id, content: "stale", expectedModifiedAt: chapter.modifiedAt })).rejects.toThrow("file_conflict")
    await expect(service.saveTextFile({ projectId: project.id, fileId: cover.id, content: "no", expectedModifiedAt: cover.modifiedAt })).rejects.toThrow("file_invalid")
  })

  test("writes binary content without exposing an absolute-path command", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-binary-port-"))
    roots.push(root)
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])

    await service.commands.writeFile({ projectId: project.id, relativePath: "images/candidate.bin", content: bytes })

    expect(await readFile(join(root, "images", "candidate.bin"))).toEqual(Buffer.from(bytes))
    expect(await service.queries.readBytes(project.id, "images/candidate.bin")).toEqual(bytes)
  })

  test("does not project CreatX atomic-write temporary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-temp-scan-"))
    roots.push(root)
    await writeFile(join(root, ".cover.png.00000000-0000-0000-0000-000000000000.creatx-tmp"), "transient", "utf8")
    await writeFile(join(root, "cover.png"), "stable", "utf8")

    const service = new ProjectFileService()
    const project = await service.openProject(root)

    expect(project.files.map((file) => file.relativePath)).toEqual(["cover.png"])
  })

  test("fails closed for unknown projects, absolute paths, and traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-safe-port-"))
    const outside = await mkdtemp(join(tmpdir(), "creatx-outside-port-"))
    roots.push(root, outside)
    const service = new ProjectFileService()
    const project = await service.openProject(root)

    await expect(service.commands.writeFile({ projectId: "missing", relativePath: "note.md", content: "no" })).rejects.toThrow("project_invalid")
    await expect(service.commands.writeFile({ projectId: project.id, relativePath: join(outside, "absolute.md"), content: "no" })).rejects.toThrow("file_invalid")
    await expect(service.commands.writeFile({ projectId: project.id, relativePath: "../escaped.md", content: "no" })).rejects.toThrow("file_invalid")
    await expect(access(join(outside, "absolute.md"))).rejects.toThrow()
    await expect(access(join(root, "..", "escaped.md"))).rejects.toThrow()
  })

  test("detects an external edit before an expected-version write", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-conflict-port-"))
    roots.push(root)
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const first = await service.commands.writeFile({ projectId: project.id, relativePath: "draft.md", content: "first" })
    const path = join(root, "draft.md")
    await writeFile(path, "external", "utf8")
    const future = new Date(Date.now() + 10_000)
    await utimes(path, future, future)

    await expect(service.commands.writeFile({
      projectId: project.id,
      relativePath: "draft.md",
      content: "stale overwrite",
      expectedModifiedAt: first.file.modifiedAt,
    })).rejects.toThrow("file_conflict")
    expect(await readFile(path, "utf8")).toBe("external")
  })

  test("lists content and internal directories without exposing absolute roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 目录项目 "))
    roots.push(root)
    await mkdir(join(root, "小说 空间"))
    await mkdir(join(root, "空目录"))
    await mkdir(join(root, ".creatx", "workbenches"), { recursive: true })
    await writeFile(join(root, "小说 空间", "第一章.md"), "正文", "utf8")
    await writeFile(join(root, ".creatx", "workbenches", "record.json"), "{}", "utf8")

    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const content = await service.queries.listDirectory(project.id, ".", "content")
    expect(content?.entries.map((entry) => [entry.kind, entry.relativePath])).toEqual([
      ["directory", "空目录"],
      ["directory", "小说 空间"],
    ])
    expect(JSON.stringify(content)).not.toContain(root)
    expect((await service.queries.listDirectory(project.id, "小说 空间", "content"))?.entries[0]).toMatchObject({
      kind: "file",
      relativePath: "小说 空间/第一章.md",
    })
    expect((await service.internal.listDirectory(project.id, "workbenches", "."))?.entries[0]).toMatchObject({
      kind: "file",
      relativePath: "record.json",
      modifiedAt: expect.any(String),
    })
    await expect(service.queries.readBytes(project.id, ".creatx/workbenches/record.json")).rejects.toThrow("reserved for internal state")
    await expect(service.commands.writeFile({ projectId: project.id, relativePath: ".creatx/forged.json", content: "{}" })).rejects.toThrow("reserved for internal state")
    await expect(service.queries.listDirectory(project.id, ".creatx", "internal")).rejects.toThrow("reserved for internal state")
  })

  test("stores namespaced internal state and moves exact legacy files into a recoverable backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 内部状态 "))
    roots.push(root)
    await mkdir(join(root, "世界", "世界蓝图"), { recursive: true })
    await writeFile(join(root, "世界", "世界蓝图", "state.json"), "legacy", "utf8")
    const service = new ProjectFileService()
    const project = await service.openProject(root)

    const created = await service.internal.writeFile({ projectId: project.id, namespace: "growth", key: "goals/goal-1/world/current.json", content: "current", expectedModifiedAt: null })
    expect(new TextDecoder().decode(created.bytes)).toBe("current")
    expect((await service.internal.listDirectory(project.id, "growth", "goals/goal-1/world"))?.entries).toEqual([
      expect.objectContaining({ kind: "file", relativePath: "goals/goal-1/world/current.json" }),
    ])

    const hash = createHash("sha256").update("legacy").digest("hex")
    await service.internal.moveContentFileToBackup(project.id, "世界/世界蓝图/state.json", "growth", "goals/goal-1/world/backup/state.json", hash)
    expect(await Bun.file(join(root, "世界", "世界蓝图", "state.json")).exists()).toBe(false)
    expect(new TextDecoder().decode((await service.internal.readFile(project.id, "growth", "goals/goal-1/world/backup/state.json"))!.bytes)).toBe("legacy")
    await service.internal.moveContentFileToBackup(project.id, "世界/世界蓝图/state.json", "growth", "goals/goal-1/world/backup/state.json", hash)

    await expect(service.internal.writeFile({ projectId: project.id, namespace: "../escape", key: "state.json", content: "x" })).rejects.toThrow("namespace")
    await expect(service.internal.writeFile({ projectId: project.id, namespace: "growth", key: "../escape.json", content: "x" })).rejects.toThrow("key")
    await expect(service.internal.moveContentFileToBackup(project.id, "世界/世界蓝图/state.json", "growth", "goals/goal-1/world/backup/state.json", "0".repeat(64))).rejects.toThrow("hash differs")
  })

  test("distinguishes a missing directory and rejects unsafe directory queries", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-directory-safe-"))
    const outside = await mkdtemp(join(tmpdir(), "creatx-directory-outside-"))
    roots.push(root, outside)
    await writeFile(join(root, "file.txt"), "file", "utf8")
    await symlink(outside, join(root, "linked-outside"), "junction")
    const service = new ProjectFileService()
    const project = await service.openProject(root)

    expect(await service.queries.listDirectory(project.id, "missing", "content")).toBeUndefined()
    await expect(service.queries.listDirectory(project.id, join(outside, "absolute"), "content")).rejects.toThrow("file_invalid")
    await expect(service.queries.listDirectory(project.id, "../outside", "content")).rejects.toThrow("file_invalid")
    await expect(service.queries.listDirectory(project.id, "file.txt", "content")).rejects.toThrow("file_invalid")
    await expect(service.queries.listDirectory(project.id, "linked-outside", "content")).rejects.toThrow("file_invalid")
  })

  test("allows exactly one concurrent create-only write", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-create-only-"))
    roots.push(root)
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const results = await Promise.allSettled([
      service.internal.writeFile({ projectId: project.id, namespace: "workbenches", key: "record.json", content: "first", expectedModifiedAt: null }),
      service.internal.writeFile({ projectId: project.id, namespace: "workbenches", key: "record.json", content: "second", expectedModifiedAt: null }),
    ])

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    expect(String(results.find((result) => result.status === "rejected")!.reason)).toContain("file_conflict")
    expect(["first", "second"]).toContain(await readFile(join(root, ".creatx", "workbenches", "record.json"), "utf8"))
  })

  test("enumerates portable files and directories while explaining fixed exclusions", async () => {
    const root = await mkdtemp(join(tmpdir(), "诺文 便携项目 "))
    const outside = await mkdtemp(join(tmpdir(), "noven-portable-outside-"))
    roots.push(root, outside)
    await mkdir(join(root, "作品", "空目录"), { recursive: true })
    await mkdir(join(root, ".git"))
    await mkdir(join(root, ".creatx"))
    await mkdir(join(root, "node_modules"))
    await mkdir(join(root, "真实目录"))
    await writeFile(join(root, ".灵感.md"), "普通隐藏文件", "utf8")
    await writeFile(join(root, "作品", "角色 图.png"), new Uint8Array([0, 1, 2, 253, 254, 255]))
    await writeFile(join(root, "真实目录", "设定.bin"), new Uint8Array([9, 8, 7]))
    await writeFile(join(root, ".git", "config"), "git-private", "utf8")
    await writeFile(join(root, ".creatx", "private.json"), "internal-private", "utf8")
    await writeFile(join(root, "node_modules", "package.js"), "dependency-private", "utf8")
    await writeFile(join(root, "Thumbs.db"), "thumb-cache", "utf8")
    await writeFile(join(root, ".cover.png.00000000-0000-0000-0000-000000000000.creatx-tmp"), "partial", "utf8")
    await writeFile(join(outside, "outside-secret.txt"), "outside-secret", "utf8")
    await symlink(outside, join(root, "外部连接"), "junction")
    await symlink(join(root, "真实目录"), join(root, "内部连接"), "junction")

    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const snapshot = await service.queries.portableEntries(project.id)

    expect(snapshot.entries.map((entry) => [entry.kind, entry.relativePath])).toEqual([
      ["file", ".灵感.md"],
      ["directory", "作品"],
      ["directory", "作品/空目录"],
      ["file", "作品/角色 图.png"],
      ["directory", "真实目录"],
      ["file", "真实目录/设定.bin"],
    ])
    expect(snapshot.exclusions.entries.map((entry) => [entry.reason, entry.relativePath])).toEqual([
      ["noven-temporary", ".cover.png.00000000-0000-0000-0000-000000000000.creatx-tmp"],
      ["internal-state", ".creatx"],
      ["version-control", ".git"],
      ["system-cache", "Thumbs.db"],
      ["dependencies", "node_modules"],
      ["symbolic-link", "内部连接"],
      ["symbolic-link", "外部连接"],
    ])
    expect(snapshot.exclusions.knownBytes).toBe(Buffer.byteLength("partial") + Buffer.byteLength("thumb-cache"))
    expect(snapshot.exclusions.unscannedItems).toBe(5)
    expect(JSON.stringify(snapshot)).not.toContain(root)
    expect(JSON.stringify(snapshot)).not.toContain(outside)
    const image = snapshot.entries.find((entry) => entry.kind === "file" && entry.relativePath === "作品/角色 图.png")!
    if (image.kind !== "file") throw new Error("expected a portable file entry")
    expect(await service.queries.readPortableFile(project.id, image)).toEqual(new Uint8Array([0, 1, 2, 253, 254, 255]))
    await expect(service.queries.readPortableFile(project.id, { ...image, relativePath: "作品\\角色 图.png" })).rejects.toThrow("package_file_invalid")
  })

  test("fails a portable file read after the enumerated content changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "noven-portable-conflict-"))
    roots.push(root)
    await writeFile(join(root, "chapter.md"), "first", "utf8")
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const file = (await service.queries.portableEntries(project.id)).entries.find((entry) => entry.kind === "file")!
    if (file.kind !== "file") throw new Error("expected a portable file entry")

    await writeFile(join(root, "chapter.md"), "second", "utf8")
    const future = new Date(Date.now() + 10_000)
    await utimes(join(root, "chapter.md"), future, future)

    await expect(service.queries.readPortableFile(project.id, file)).rejects.toThrow("package_file_conflict")
  })
})
