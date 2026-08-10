import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { WorkbenchRegistryService } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "CreatX 工作台 "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  return { root, project, registry: new WorkbenchRegistryService(files.queries, files.internal) }
}

describe("workbench registry", () => {
  test("publishes only effective registration changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 工作台事件 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const changed: string[] = []
    const registry = new WorkbenchRegistryService(files.queries, files.internal, { onChanged: (id) => changed.push(id) })
    await mkdir(join(root, "世界"))

    await registry.commands.register({ projectId: project.id, folder: "世界", title: "世界" })
    await registry.commands.register({ projectId: project.id, folder: "世界", title: "忽略的重复标题" })
    await registry.commands.rename({ projectId: project.id, folder: "世界", title: "世界设定" })
    await registry.commands.rename({ projectId: project.id, folder: "世界", title: "世界设定" })

    expect(changed).toEqual([project.id, project.id])
  })

  test("always projects builtin files without writing metadata", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    await writeFile(join(root, "小说", "第一章.md"), "开篇", "utf8")

    const result = await registry.queries.snapshot(project.id)
    expect(result.workbenches[0]).toMatchObject({ id: "builtin:files", source: "builtin", title: "文件", folder: ".", state: "ready" })
    expect(result.workbenches[0]!.entries.map((entry) => entry.relativePath)).toEqual(["小说", "小说/第一章.md"])
    await expect(stat(join(root, ".creatx"))).rejects.toThrow()
  })

  test("projects directories before files at every hierarchy level", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界", "m-core"), { recursive: true })
    await mkdir(join(root, "世界", "n-history", "empire"), { recursive: true })
    await writeFile(join(root, "世界", "a-overview.md"), "导览", "utf8")
    await writeFile(join(root, "世界", "z-magic.md"), "魔法", "utf8")
    await writeFile(join(root, "世界", "m-core", "boundary.md"), "边界", "utf8")
    await writeFile(join(root, "世界", "n-history", "chronicle.md"), "纪年", "utf8")

    const workbench = await registry.commands.register({ projectId: project.id, folder: "世界" })

    expect(workbench.entries.map((entry) => entry.relativePath)).toEqual([
      "世界/m-core",
      "世界/m-core/boundary.md",
      "世界/n-history",
      "世界/n-history/empire",
      "世界/n-history/chronicle.md",
      "世界/a-overview.md",
      "世界/z-magic.md",
    ])
  })

  test("keeps JSON in Files but excludes it from registered workbench presentation", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界", "世界蓝图"), { recursive: true })
    await mkdir(join(root, "世界", "地区"), { recursive: true })
    await writeFile(join(root, "世界", "世界导览.md"), "导览", "utf8")
    await writeFile(join(root, "世界", "世界蓝图", "state.json"), "{}", "utf8")
    await writeFile(join(root, "世界", "地区", "北境.md"), "北境", "utf8")
    await writeFile(join(root, "世界", "地区", "蓝图.json"), "{}", "utf8")

    const snapshot = await registry.queries.snapshot(project.id)
    const files = snapshot.workbenches.find((workbench) => workbench.id === "builtin:files")
    const registered = await registry.commands.register({ projectId: project.id, folder: "世界" })

    expect(files?.entries.map((entry) => entry.relativePath)).toContain("世界/世界蓝图/state.json")
    expect(files?.entries.map((entry) => entry.relativePath)).toContain("世界/地区/蓝图.json")
    expect(registered.entries.map((entry) => entry.relativePath)).toEqual([
      "世界/地区",
      "世界/地区/北境.md",
      "世界/世界导览.md",
    ])
  })

  test("registers an existing folder and repeats idempotently", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    await writeFile(join(root, "小说", "第一章.md"), "开篇", "utf8")

    const first = await registry.commands.register({ projectId: project.id, folder: "小说", title: "小说" })
    const recordPath = join(root, ".creatx", "workbenches", `${first.id}.json`)
    const record = JSON.parse(await readFile(recordPath, "utf8"))
    const modifiedAt = (await stat(recordPath)).mtime.toISOString()
    const second = await registry.commands.register({ projectId: project.id, folder: "小说", title: "另一个标题" })

    expect(first).toMatchObject({ source: "registered", title: "小说", folder: "小说", state: "ready" })
    expect(first.entries.map((entry) => entry.relativePath)).toEqual(["小说/第一章.md"])
    expect(record).toEqual({ schemaVersion: 1, id: first.id, folder: "小说", title: "小说" })
    expect(second).toEqual(first)
    expect((await stat(recordPath)).mtime.toISOString()).toBe(modifiedAt)
  })

  test("renames only the display title and persists the same workbench identity", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    await writeFile(join(root, "小说", "第一章.md"), "未来来信正文", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "小说", title: "《未来来信》" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)

    const renamed = await registry.commands.rename({ projectId: project.id, folder: "小说", title: "小说" })
    const unchanged = await registry.commands.rename({ projectId: project.id, folder: "小说", title: "小说" })
    const record = JSON.parse(await readFile(recordPath, "utf8"))

    expect(renamed).toMatchObject({ id: created.id, folder: "小说", title: "小说", state: "ready" })
    expect(renamed.entries).toEqual(created.entries)
    expect(unchanged).toEqual(renamed)
    expect(record).toEqual({ schemaVersion: 1, id: created.id, folder: "小说", title: "小说" })
    expect(await readFile(join(root, "小说", "第一章.md"), "utf8")).toBe("未来来信正文")
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === created.id)?.title).toBe("小说")
  })

  test("rejects invalid rename targets without changing registration metadata", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    const created = await registry.commands.register({ projectId: project.id, folder: "小说", title: "未来来信" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)
    const before = await readFile(recordPath, "utf8")

    await expect(registry.commands.rename({ projectId: project.id, folder: "missing", title: "小说" })).rejects.toThrow("workbench_invalid")
    await expect(registry.commands.rename({ projectId: project.id, folder: "小说", title: " " })).rejects.toThrow("workbench_invalid")
    expect(await readFile(recordPath, "utf8")).toBe(before)
  })

  test("migrates V1 to V2 when setting a persistent interactive home", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界", "图谱"), { recursive: true })
    await writeFile(join(root, "世界", "图谱", "index.html"), "<h1>因果图</h1>", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界", title: "世界" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)

    const updated = await registry.commands.setHome({ projectId: project.id, folder: "世界", entry: "图谱/index.html" })
    const modifiedAt = (await stat(recordPath)).mtime.toISOString()
    const repeated = await registry.commands.setHome({ projectId: project.id, folder: "世界", entry: "图谱/index.html" })

    expect(updated).toMatchObject({ id: created.id, folder: "世界", home: { entry: "图谱/index.html", mode: "interactive", state: "ready" } })
    expect(repeated).toEqual(updated)
    expect((await stat(recordPath)).mtime.toISOString()).toBe(modifiedAt)
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toEqual({ schemaVersion: 2, id: created.id, folder: "世界", title: "世界", home: { entry: "图谱/index.html", mode: "interactive" } })
  })

  test("preserves a V2 home when renaming and reports a later missing entry", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    await writeFile(join(root, "世界", "index.html"), "<h1>世界</h1>", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界", title: "旧标题" })
    await registry.commands.setHome({ projectId: project.id, folder: "世界", entry: "index.html" })

    const renamed = await registry.commands.rename({ projectId: project.id, folder: "世界", title: "世界图谱" })
    expect(renamed.home).toEqual({ entry: "index.html", mode: "interactive", state: "ready" })
    await rm(join(root, "世界", "index.html"))
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === created.id)?.home).toEqual({ entry: "index.html", mode: "interactive", state: "missing" })
  })

  test("upgrades V1 to V3 and automatically projects new files matching the visible scope", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "作品", "章节"), { recursive: true })
    await mkdir(join(root, "作品", "空目录"), { recursive: true })
    await writeFile(join(root, "作品", "导览.md"), "导览", "utf8")
    await writeFile(join(root, "作品", "封面.PNG"), "image", "utf8")
    await writeFile(join(root, "作品", "章节", "第一章.MD"), "正文", "utf8")
    await writeFile(join(root, "作品", "章节", "state.json"), "{}", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "作品", title: "作品" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)

    const updated = await registry.commands.setVisibility({ projectId: project.id, folder: "作品", include: ["**/*.md"] })

    expect(updated.entries.map((entry) => entry.relativePath)).toEqual(["作品/章节", "作品/章节/第一章.MD", "作品/导览.md"])
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toEqual({
      schemaVersion: 3,
      id: created.id,
      folder: "作品",
      title: "作品",
      visibility: { include: ["**/*.md"], exclude: [], autoIncludeNewFiles: true },
    })
    const modifiedAt = (await stat(recordPath)).mtime.toISOString()
    await registry.commands.setVisibility({ projectId: project.id, folder: "作品", include: ["**/*.md"] })
    expect((await stat(recordPath)).mtime.toISOString()).toBe(modifiedAt)

    await writeFile(join(root, "作品", "章节", "第二章.md"), "正文", "utf8")
    await writeFile(join(root, "作品", "章节", "插图.webp"), "image", "utf8")
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === created.id)?.entries.map((entry) => entry.relativePath)).toEqual([
      "作品/章节",
      "作品/章节/第二章.md",
      "作品/章节/第一章.MD",
      "作品/导览.md",
    ])
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === "builtin:files")?.entries.map((entry) => entry.relativePath)).toContain("作品/封面.PNG")
  })

  test("freezes current matching files when automatic inclusion is disabled", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    await writeFile(join(root, "小说", "第一章.md"), "一", "utf8")
    await writeFile(join(root, "小说", "第二章.md"), "二", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "小说" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)

    await registry.commands.setVisibility({ projectId: project.id, folder: "小说", include: ["**/*.md"], autoIncludeNewFiles: false })
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
      schemaVersion: 3,
      visibility: { include: ["**/*.md"], exclude: [], autoIncludeNewFiles: false, files: ["第二章.md", "第一章.md"] },
    })

    await writeFile(join(root, "小说", "第三章.md"), "三", "utf8")
    await rename(join(root, "小说", "第二章.md"), join(root, "小说", "第二章修订.md"))
    await rm(join(root, "小说", "第一章.md"))
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === created.id)?.entries).toEqual([])

    const automatic = await registry.commands.setVisibility({ projectId: project.id, folder: "小说", include: ["**/*.md"], autoIncludeNewFiles: true })
    expect(automatic.entries.map((entry) => entry.relativePath)).toEqual(["小说/第二章修订.md", "小说/第三章.md"])
    expect(JSON.parse(await readFile(recordPath, "utf8")).visibility).toEqual({ include: ["**/*.md"], exclude: [], autoIncludeNewFiles: true })
  })

  test("applies exclusion after inclusion and keeps only directories with visible descendants", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "素材", "公开"), { recursive: true })
    await mkdir(join(root, "素材", "草稿"), { recursive: true })
    await writeFile(join(root, "素材", "公开", "角色.md"), "角色", "utf8")
    await writeFile(join(root, "素材", "草稿", "废案.md"), "废案", "utf8")
    await writeFile(join(root, "素材", "草稿", "保留.txt"), "文本", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "素材" })

    const updated = await registry.commands.setVisibility({
      projectId: project.id,
      folder: "素材",
      include: ["**/*.MD"],
      exclude: ["草稿/**"],
    })

    expect(updated.entries.map((entry) => entry.relativePath)).toEqual(["素材/公开", "素材/公开/角色.md"])
    expect((await registry.queries.snapshot(project.id)).workbenches.find((workbench) => workbench.id === created.id)?.entries).toEqual(updated.entries)
  })

  test("preserves V2 home in V3 and rejects visibility that would hide it", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    await writeFile(join(root, "世界", "index.html"), "<h1>世界</h1>", "utf8")
    await writeFile(join(root, "世界", "说明.md"), "说明", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界", title: "世界" })
    await registry.commands.setHome({ projectId: project.id, folder: "世界", entry: "index.html" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)
    const before = await readFile(recordPath, "utf8")

    await expect(registry.commands.setVisibility({ projectId: project.id, folder: "世界", include: ["**/*.md"] })).rejects.toThrow("workbench_invalid")
    expect(await readFile(recordPath, "utf8")).toBe(before)

    const updated = await registry.commands.setVisibility({ projectId: project.id, folder: "世界", include: ["**/*.html", "**/*.md"] })
    expect(updated.home).toEqual({ entry: "index.html", mode: "interactive", state: "ready" })
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
      schemaVersion: 3,
      home: { entry: "index.html", mode: "interactive" },
      visibility: { include: ["**/*.html", "**/*.md"], exclude: [], autoIncludeNewFiles: true },
    })
  })

  test("keeps V3 visibility when setting a home and renaming", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "图谱"))
    await writeFile(join(root, "图谱", "index.html"), "<h1>图谱</h1>", "utf8")
    await writeFile(join(root, "图谱", "说明.md"), "说明", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "图谱", title: "旧图谱" })
    await registry.commands.setVisibility({ projectId: project.id, folder: "图谱", include: ["**/*.html", "**/*.md"] })

    await registry.commands.setHome({ projectId: project.id, folder: "图谱", entry: "index.html" })
    await registry.commands.rename({ projectId: project.id, folder: "图谱", title: "星图" })

    expect(JSON.parse(await readFile(join(root, ".creatx", "workbenches", `${created.id}.json`), "utf8"))).toEqual({
      schemaVersion: 3,
      id: created.id,
      folder: "图谱",
      title: "星图",
      visibility: { include: ["**/*.html", "**/*.md"], exclude: [], autoIncludeNewFiles: true },
      home: { entry: "index.html", mode: "interactive" },
    })
  })

  test("rejects invalid visibility patterns without changing the record", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    await writeFile(join(root, "世界", "说明.md"), "说明", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)
    const before = await readFile(recordPath, "utf8")

    for (const include of [["../*.md"], ["C:/*.md"], ["a//*.md"], ["ab**cd/*.md"]]) {
      await expect(registry.commands.setVisibility({ projectId: project.id, folder: "世界", include })).rejects.toThrow("workbench_invalid")
    }
    expect(await readFile(recordPath, "utf8")).toBe(before)
  })

  test("isolates malformed V3 visibility without affecting other workbenches", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "有效"))
    await mkdir(join(root, "损坏"))
    const valid = await registry.commands.register({ projectId: project.id, folder: "有效" })
    const invalidId = "wb_550e8400-e29b-41d4-a716-446655440099"
    await writeFile(join(root, ".creatx", "workbenches", `${invalidId}.json`), JSON.stringify({
      schemaVersion: 3,
      id: invalidId,
      folder: "损坏",
      visibility: { include: ["**/*.md"], exclude: [], autoIncludeNewFiles: true, files: [] },
    }), "utf8")

    const snapshot = await registry.queries.snapshot(project.id)
    expect(snapshot.workbenches.map((workbench) => workbench.id)).toEqual(["builtin:files", valid.id])
    expect(snapshot.diagnostics).toContainEqual(expect.objectContaining({ code: "workbench_record_invalid", recordPath: `.creatx/workbenches/${invalidId}.json` }))
  })

  test("rejects invalid presentation entries without mutating the V1 record", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    await writeFile(join(root, "世界", "notes.txt"), "notes", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)
    const before = await readFile(recordPath, "utf8")

    for (const entry of ["../index.html", "/index.html", "C:/index.html", "missing.html", "notes.txt"]) {
      await expect(registry.commands.setHome({ projectId: project.id, folder: "世界", entry })).rejects.toThrow("workbench_invalid")
    }
    expect(await readFile(recordPath, "utf8")).toBe(before)
  })

  test("publishes transient presentation without changing registration metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 工作台展示 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const requests: unknown[] = []
    const registry = new WorkbenchRegistryService(files.queries, files.internal, { onPresentationRequested: (request) => requests.push(request) })
    await mkdir(join(root, "世界"))
    await writeFile(join(root, "世界", "index.html"), "<h1>世界</h1>", "utf8")
    const created = await registry.commands.register({ projectId: project.id, folder: "世界" })
    const recordPath = join(root, ".creatx", "workbenches", `${created.id}.json`)
    const before = await readFile(recordPath, "utf8")

    const shown = await registry.commands.show({ projectId: project.id, sessionId: "session-1", folder: "世界", entry: "index.html" })

    expect(shown).toEqual({ projectId: project.id, workbenchId: created.id, folder: "世界", entry: "index.html" })
    expect(requests).toEqual([{ projectId: project.id, sessionId: "session-1", folder: "世界", entry: "index.html", workbenchId: created.id }])
    expect(await readFile(recordPath, "utf8")).toBe(before)
    expect(registry.showTool().approval).toBe("automatic")
    expect(registry.setHomeTool().approval).toBe("required")
  })

  test("reloads missing workbenches and isolates corrupt records", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    const created = await registry.commands.register({ projectId: project.id, folder: "世界" })
    await rm(join(root, "世界"), { recursive: true })
    await writeFile(join(root, ".creatx", "workbenches", "broken.json"), "{broken", "utf8")

    const reloaded = await registry.queries.snapshot(project.id)
    expect(reloaded.workbenches.find((workbench) => workbench.id === created.id)).toMatchObject({ state: "missing", folder: "世界" })
    expect(reloaded.workbenches[0]?.id).toBe("builtin:files")
    expect(reloaded.diagnostics).toHaveLength(1)
    expect(reloaded.diagnostics[0]?.recordPath).toBe(".creatx/workbenches/broken.json")
  })

  test("rejects invalid and nonexistent folders without metadata writes", async () => {
    const { root, project, registry } = await setup()
    await writeFile(join(root, "file.txt"), "file", "utf8")
    for (const folder of ["", ".", "..", "../outside", "C:/outside", "missing", "file.txt"]) {
      await expect(registry.commands.register({ projectId: project.id, folder })).rejects.toThrow()
    }
    await expect(stat(join(root, ".creatx"))).rejects.toThrow()
  })

  test("rejects every externally duplicated folder record", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "世界"))
    await mkdir(join(root, ".creatx", "workbenches"), { recursive: true })
    const ids = ["wb_550e8400-e29b-41d4-a716-446655440000", "wb_550e8400-e29b-41d4-a716-446655440001"]
    await Promise.all(ids.map((id) => writeFile(join(root, ".creatx", "workbenches", `${id}.json`), JSON.stringify({ schemaVersion: 1, id, folder: "世界" }))))

    const result = await registry.queries.snapshot(project.id)
    expect(result.workbenches.map((workbench) => workbench.id)).toEqual(["builtin:files"])
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "workbench_record_conflict")).toHaveLength(2)
  })

  test("exposes a required-approval project tool", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))
    const tool = registry.tool()
    expect(tool.name).toBe("register_workbench")
    expect(tool.approval).toBe("required")
    expect(tool.description).toContain("directory must already exist")
    expect(tool.description).toContain("ordinary file tools")
    expect(tool.description).toContain("does not move, copy, modify, or create")
    expect(tool.description).toContain("returns the existing workbench")
    expect(tool.description).toContain("Never create or edit .creatx JSON directly")
    expect((await tool.execute({ folder: "小说", title: "小说" }, { sessionId: "s1", projectId: project.id })).ok).toBe(true)
    expect((await tool.execute({ folder: "missing" }, { sessionId: "s1", projectId: project.id })).ok).toBe(false)

    const renameTool = registry.renameTool()
    expect(renameTool.name).toBe("rename_workbench")
    expect(renameTool.approval).toBe("required")
    expect(renameTool.description).toContain("display title")
    expect((await renameTool.execute({ folder: "小说", title: "未来来信" }, { sessionId: "s1", projectId: project.id })).ok).toBe(true)
    expect((await renameTool.execute({ folder: "missing", title: "无效" }, { sessionId: "s1", projectId: project.id })).ok).toBe(false)

    const visibilityTool = registry.setVisibilityTool()
    expect(visibilityTool.name).toBe("set_workbench_visibility")
    expect(visibilityTool.approval).toBe("required")
    expect(visibilityTool.description).toContain("new matching files")
    expect((await visibilityTool.execute({ folder: "小说", include: ["**/*.md"] }, { sessionId: "s1", projectId: project.id })).ok).toBe(true)
    expect((await visibilityTool.execute({ folder: "小说", include: ["../*.md"] }, { sessionId: "s1", projectId: project.id })).ok).toBe(false)
  })

  test("exports only valid registered V1 V2 and V3 workbenches whose references are in the project package", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "甲"))
    await mkdir(join(root, "乙"))
    await mkdir(join(root, "丙"))
    await writeFile(join(root, "乙", "index.html"), "<h1>乙</h1>", "utf8")
    await writeFile(join(root, "丙", "保留.md"), "丙", "utf8")
    await mkdir(join(root, ".creatx", "workbenches"), { recursive: true })
    const records = [
      { schemaVersion: 1, id: "wb_550e8400-e29b-41d4-a716-446655440001", folder: "甲", title: "一号" },
      { schemaVersion: 2, id: "wb_550e8400-e29b-41d4-a716-446655440002", folder: "乙", title: "二号", home: { entry: "index.html", mode: "interactive" } },
      { schemaVersion: 3, id: "wb_550e8400-e29b-41d4-a716-446655440003", folder: "丙", title: "三号", visibility: { include: ["**/*.md"], exclude: [], autoIncludeNewFiles: false, files: ["保留.md"] } },
      { schemaVersion: 2, id: "wb_550e8400-e29b-41d4-a716-446655440004", folder: "乙", title: "缺失主页", home: { entry: "missing.html", mode: "interactive" } },
    ]
    await Promise.all(records.map((record) => writeFile(join(root, ".creatx", "workbenches", `${record.id}.json`), JSON.stringify(record), "utf8")))
    await writeFile(join(root, ".creatx", "workbenches", "broken.json"), "{broken", "utf8")

    const exported = await registry.exportPortableWorkbenches(project.id, ["甲", "乙", "乙/index.html", "丙", "丙/保留.md"])

    expect(exported.records.map((portable) => portable.record.id)).toEqual([records[1]!.id, records[2]!.id, records[0]!.id])
    expect(exported.records.every((portable) => portable.exchangeVersion === 1)).toBe(true)
    expect(JSON.stringify(exported.records)).not.toContain("builtin:files")
    expect(exported.diagnostics).toHaveLength(2)
    expect(exported.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["workbench_record_invalid", "workbench_record_invalid"])
  })

  test("imports valid portable workbenches without overwriting target records and isolates invalid metadata", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "现有"))
    await mkdir(join(root, "小说"))
    await mkdir(join(root, "图谱"))
    await writeFile(join(root, "图谱", "index.html"), "<h1>图谱</h1>", "utf8")
    const existing = await registry.commands.register({ projectId: project.id, folder: "现有", title: "现有" })
    const values = [
      { exchangeVersion: 1, record: { schemaVersion: 1, id: "wb_550e8400-e29b-41d4-a716-446655440011", folder: "小说", title: "小说" } },
      { exchangeVersion: 1, record: { schemaVersion: 2, id: "wb_550e8400-e29b-41d4-a716-446655440012", folder: "图谱", title: "图谱", home: { entry: "index.html", mode: "interactive" } } },
      { exchangeVersion: 1, record: { schemaVersion: 3, id: "wb_550e8400-e29b-41d4-a716-446655440013", folder: "小说", visibility: { include: [], exclude: [], autoIncludeNewFiles: false, files: ["missing.md"] } } },
      { exchangeVersion: 1, record: { schemaVersion: 1, id: existing.id, folder: "小说", title: "覆盖" } },
      { exchangeVersion: 1, record: { schemaVersion: 1, id: "wb_550e8400-e29b-41d4-a716-446655440014", folder: "小说", title: "重复" } },
      { exchangeVersion: 1, record: { schemaVersion: 1, id: "wb_550e8400-e29b-41d4-a716-446655440015", folder: "越界", title: "越界" }, unexpected: true },
    ]

    const imported = await registry.importPortableWorkbenches(project.id, values, ["现有", "小说", "图谱", "图谱/index.html"])
    const snapshot = await registry.queries.snapshot(project.id)

    expect(imported.importedIds).toEqual(["wb_550e8400-e29b-41d4-a716-446655440011", "wb_550e8400-e29b-41d4-a716-446655440012"])
    expect(imported.diagnostics).toHaveLength(4)
    expect(snapshot.workbenches.map((workbench) => workbench.title)).toEqual(["文件", "图谱", "现有", "小说"])
    expect(snapshot.workbenches.find((workbench) => workbench.id === existing.id)?.title).toBe("现有")
    expect(snapshot.workbenches.find((workbench) => workbench.id === "wb_550e8400-e29b-41d4-a716-446655440012")?.home).toEqual({ entry: "index.html", mode: "interactive", state: "ready" })
  })

  test("fails closed on non-canonical exported paths", async () => {
    const { root, project, registry } = await setup()
    await mkdir(join(root, "小说"))

    await expect(registry.exportPortableWorkbenches(project.id, [".\\小说"])).rejects.toThrow("canonical project-relative path")
    await expect(registry.importPortableWorkbenches(project.id, [], ["e\u0301"])).rejects.toThrow("canonical project-relative path")
    expect((await registry.queries.snapshot(project.id)).workbenches).toHaveLength(1)
  })

  test("does not overwrite corrupt target records and continues after an isolated write failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 工作台便携失败 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    await mkdir(join(root, "损坏占位"))
    await mkdir(join(root, "写入失败"))
    await mkdir(join(root, "有效"))
    await mkdir(join(root, ".creatx", "workbenches"), { recursive: true })
    const corruptId = "wb_550e8400-e29b-41d4-a716-446655440021"
    const failedId = "wb_550e8400-e29b-41d4-a716-446655440022"
    const validId = "wb_550e8400-e29b-41d4-a716-446655440023"
    await writeFile(join(root, ".creatx", "workbenches", `${corruptId}.json`), "{broken", "utf8")
    const registry = new WorkbenchRegistryService(files.queries, {
      ...files.internal,
      writeFile: (request) => request.key === `${failedId}.json`
        ? Promise.reject(new Error("simulated metadata write failure"))
        : files.internal.writeFile(request),
    })

    const imported = await registry.importPortableWorkbenches(project.id, [
      { exchangeVersion: 1, record: { schemaVersion: 1, id: corruptId, folder: "损坏占位" } },
      { exchangeVersion: 1, record: { schemaVersion: 1, id: failedId, folder: "写入失败" } },
      { exchangeVersion: 1, record: { schemaVersion: 1, id: validId, folder: "有效" } },
    ], ["损坏占位", "写入失败", "有效"])

    expect(imported.importedIds).toEqual([validId])
    expect(imported.diagnostics).toHaveLength(2)
    expect(await readFile(join(root, ".creatx", "workbenches", `${corruptId}.json`), "utf8")).toBe("{broken")
    expect((await registry.queries.snapshot(project.id)).workbenches.some((workbench) => workbench.id === validId)).toBe(true)
  })
})
