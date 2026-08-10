import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { WorkbenchRegistryService } from "../../workbench/src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("round-trips registered workbench display metadata while keeping builtin views generated", async () => {
  const source = await setup("Noven Portable Workbench Source ")
  await mkdir(join(source.root, "小说"))
  await mkdir(join(source.root, "图谱"))
  await writeFile(join(source.root, "小说", "第一章.md"), "第一章", "utf8")
  await writeFile(join(source.root, "图谱", "index.html"), "<h1>图谱</h1>", "utf8")
  await source.registry.commands.register({ projectId: source.project.id, folder: "小说", title: "小说" })
  await source.registry.commands.setVisibility({ projectId: source.project.id, folder: "小说", include: ["**/*.md"], autoIncludeNewFiles: false })
  await source.registry.commands.register({ projectId: source.project.id, folder: "图谱", title: "图谱" })
  await source.registry.commands.setHome({ projectId: source.project.id, folder: "图谱", entry: "index.html" })
  const exportedPaths = ["小说", "小说/第一章.md", "图谱", "图谱/index.html"]
  const portable = await source.registry.exportPortableWorkbenches(source.project.id, exportedPaths)

  const target = await setup("Noven Portable Workbench Target ")
  await mkdir(join(target.root, "小说"))
  await mkdir(join(target.root, "图谱"))
  await writeFile(join(target.root, "小说", "第一章.md"), "第一章", "utf8")
  await writeFile(join(target.root, "图谱", "index.html"), "<h1>图谱</h1>", "utf8")
  const imported = await target.registry.importPortableWorkbenches(target.project.id, [...portable.records, { exchangeVersion: 1, record: { schemaVersion: 1, id: "bad", folder: "小说" } }], exportedPaths)
  const snapshot = await target.registry.queries.snapshot(target.project.id)

  expect(portable.diagnostics).toEqual([])
  expect(portable.records).toHaveLength(2)
  expect(imported.importedIds).toHaveLength(2)
  expect(imported.diagnostics).toHaveLength(1)
  expect(snapshot.workbenches[0]?.id).toBe("builtin:files")
  expect(snapshot.workbenches.filter((workbench) => workbench.source === "registered").map((workbench) => workbench.title)).toEqual(["图谱", "小说"])
  expect(snapshot.workbenches.find((workbench) => workbench.title === "小说")?.entries.map((entry) => entry.relativePath)).toEqual(["小说/第一章.md"])
  expect(snapshot.workbenches.find((workbench) => workbench.title === "图谱")?.home).toEqual({ entry: "index.html", mode: "interactive", state: "ready" })
})

async function setup(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  return { root, project, registry: new WorkbenchRegistryService(files.queries, files.internal) }
}
