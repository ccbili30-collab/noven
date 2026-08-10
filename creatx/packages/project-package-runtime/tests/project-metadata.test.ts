import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { PortableProjectMetadataStore } from "../src"

const roots: string[] = []
const overview = {
  purpose: "整理一个经典硬科幻世界",
  currentResults: "完成世界设定和第一章",
  usageGuide: "先查看项目首页，再阅读案例",
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("portable project metadata", () => {
  test("persists a controlled lineage and overview without exposing it as project content", async () => {
    const root = await mkdtemp(join(tmpdir(), "诺文 项目元数据 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const metadata = new PortableProjectMetadataStore(files.internal)

    const created = await metadata.initialize({
      localProjectId: project.id,
      projectId: "portable-lineage-1",
      overview,
    })

    expect(created.metadata).toEqual({ schemaVersion: 1, projectId: "portable-lineage-1", overview })
    expect(await metadata.read(project.id)).toEqual(created)
    expect(JSON.parse(await readFile(join(root, ".creatx", "portable-project", "metadata.v1.json"), "utf8"))).toEqual(created.metadata)
    await expect(files.queries.readBytes(project.id, ".creatx/portable-project/metadata.v1.json")).rejects.toThrow("reserved for internal state")
    await expect(files.commands.writeFile({ projectId: project.id, relativePath: ".creatx/portable-project/metadata.v1.json", content: "forged" })).rejects.toThrow("reserved for internal state")
  })

  test("updates only the overview and preserves imported fork identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "noven-fork-metadata-"))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const metadata = new PortableProjectMetadataStore(files.internal)
    await metadata.initialize({
      localProjectId: project.id,
      projectId: "portable-copy-1",
      forkedFromProjectId: "portable-lineage-1",
      overview,
    })

    const updated = await metadata.saveOverview(project.id, { ...overview, currentResults: "新增地图" })

    expect(updated.metadata).toEqual({
      schemaVersion: 1,
      projectId: "portable-copy-1",
      forkedFromProjectId: "portable-lineage-1",
      overview: { ...overview, currentResults: "新增地图" },
    })
  })

  test("initializes a local project once and fails closed for identity conflict or damaged storage", async () => {
    const root = await mkdtemp(join(tmpdir(), "noven-local-metadata-"))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const metadata = new PortableProjectMetadataStore(files.internal)

    const first = await metadata.initializeLocal(project.id, overview)
    const repeated = await metadata.initializeLocal(project.id, overview)
    expect(repeated.metadata.projectId).toBe(first.metadata.projectId)
    await expect(metadata.initialize({ localProjectId: project.id, projectId: "different-lineage", overview })).rejects.toThrow("package_identity_conflict")

    await mkdir(join(root, ".creatx", "portable-project"), { recursive: true })
    await writeFile(join(root, ".creatx", "portable-project", "metadata.v1.json"), JSON.stringify({ ...first.metadata, unexpected: true }), "utf8")
    await expect(metadata.read(project.id)).rejects.toThrow("package_metadata_invalid")
  })
})
