import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService, type PortableProjectFileQueryPort } from "@creatx/project-files"
import { unzipSync } from "fflate"
import { exportPortableProjectPackage, parsePortableChecksumsV1, parsePortableManifestV1 } from "../src"

const roots: string[] = []
const overview = {
  purpose: "共同创作经典硬科幻世界",
  currentResults: "完成世界设定、角色和第一章",
  usageGuide: "先阅读项目首页，再查看案例",
}
const conversation = {
  schemaVersion: 1 as const,
  caseId: "case-1",
  title: "建立世界",
  purpose: "确定科学边界",
  conclusion: "采用轨道城邦",
  continuationBrief: "继续完成第二章",
  items: [
    { kind: "message" as const, role: "user" as const, text: "建立世界", fileReferences: ["世界.md"] },
    { kind: "message" as const, role: "assistant" as const, text: "已完成", fileReferences: ["世界.md"] },
  ],
}
const workbench = {
  exchangeVersion: 1 as const,
  record: { schemaVersion: 1 as const, id: "wb_550e8400-e29b-41d4-a716-446655440101", folder: "作品", title: "作品" },
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("portable Noven package export", () => {
  test("writes a complete standard ZIP, verifies it from disk and atomically exposes the .np", async () => {
    const fixture = await setup()
    await mkdir(join(fixture.projectRoot, "作品", "空目录"), { recursive: true })
    await writeFile(join(fixture.projectRoot, "作品", "世界.md"), "轨道城邦", "utf8")
    await writeFile(join(fixture.projectRoot, ".hidden.txt"), "保留", "utf8")
    await writeFile(join(fixture.projectRoot, "作品", "星图.bin"), new Uint8Array([0, 1, 2, 255]))
    await mkdir(join(fixture.projectRoot, ".git"))
    await writeFile(join(fixture.projectRoot, ".git", "config"), "secret", "utf8")
    await mkdir(join(fixture.projectRoot, "node_modules", "ignored"), { recursive: true })
    await writeFile(join(fixture.projectRoot, "node_modules", "ignored", "large.bin"), "ignored", "utf8")

    const result = await exportPackage(fixture)
    const archive = unzipSync(await readFile(fixture.destinationPath))
    const checksums = parsePortableChecksumsV1(JSON.parse(new TextDecoder().decode(archive["checksums.json"]!)))
    const manifest = parsePortableManifestV1(JSON.parse(new TextDecoder().decode(archive["manifest.json"]!)), checksums)

    expect(result.status).toBe("created")
    expect(result.packageId).toBe(manifest.packageId)
    expect(result).toMatchObject({ manifest, checksums, bytes: (await stat(fixture.destinationPath)).size })
    expect(manifest.counts).toEqual({ files: 3, conversations: 1, workbenches: 1 })
    expect(checksums.directories).toContain("files/作品/空目录")
    expect(Object.keys(archive)).toEqual(expect.arrayContaining([
      "files/",
      "conversations/",
      "workbenches/",
      "files/作品/空目录/",
      "files/.hidden.txt",
      "files/作品/世界.md",
      "files/作品/星图.bin",
      "conversations/case-1.json",
      `workbenches/${workbench.record.id}.json`,
      "checksums.json",
      "manifest.json",
    ]))
    expect(Object.keys(archive).some((path) => path.includes(".git") || path.includes("node_modules") || path.includes(".creatx"))).toBe(false)
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })

  test("treats the same package identity as idempotent and never overwrites different content", async () => {
    const fixture = await setup()
    await writeFile(join(fixture.projectRoot, "世界.md"), "第一版", "utf8")
    const first = await exportPackage(fixture)
    const firstHash = await fileHash(fixture.destinationPath)
    const firstModifiedAt = (await stat(fixture.destinationPath)).mtimeMs

    const repeated = await exportPackage(fixture, { exportedAt: "2026-08-10T02:00:00.000Z" })
    expect(repeated.status).toBe("existing")
    expect(repeated.packageId).toBe(first.packageId)
    expect(repeated.manifest.exportedAt).toBe(first.manifest.exportedAt)
    expect((await stat(fixture.destinationPath)).mtimeMs).toBe(firstModifiedAt)

    await writeFile(join(fixture.projectRoot, "世界.md"), "第二版", "utf8")
    await expect(exportPackage(fixture)).rejects.toThrow("package_destination_conflict")
    expect(await fileHash(fixture.destinationPath)).toBe(firstHash)
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })

  test("cancels without a final package and removes only its controlled temporary file", async () => {
    const fixture = await setup()
    await writeFile(join(fixture.projectRoot, "世界.md"), "等待取消", "utf8")
    const controller = new AbortController()
    const projectFiles: PortableProjectFileQueryPort = {
      portableEntries: (projectId) => fixture.files.queries.portableEntries(projectId),
      readPortableFile: async (projectId, entry) => {
        const bytes = await fixture.files.queries.readPortableFile(projectId, entry)
        controller.abort()
        return bytes
      },
    }

    await expect(exportPackage(fixture, { projectFiles, signal: controller.signal })).rejects.toThrow("package_export_cancelled")
    await expect(stat(fixture.destinationPath)).rejects.toThrow()
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })

  test("fails when the real project set changes and leaves no partial package", async () => {
    const fixture = await setup()
    await writeFile(join(fixture.projectRoot, "世界.md"), "初始", "utf8")
    let changed = false
    const projectFiles: PortableProjectFileQueryPort = {
      portableEntries: (projectId) => fixture.files.queries.portableEntries(projectId),
      readPortableFile: async (projectId, entry) => {
        const bytes = await fixture.files.queries.readPortableFile(projectId, entry)
        if (!changed) {
          changed = true
          await writeFile(join(fixture.projectRoot, "后来.md"), "新增", "utf8")
        }
        return bytes
      },
    }

    await expect(exportPackage(fixture, { projectFiles })).rejects.toThrow("package_file_conflict")
    await expect(stat(fixture.destinationPath)).rejects.toThrow()
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })

  test("leaves no final package when the selected destination disappears before writing", async () => {
    const fixture = await setup()
    await writeFile(join(fixture.projectRoot, "世界.md"), "等待写入", "utf8")
    const projectFiles: PortableProjectFileQueryPort = {
      portableEntries: async (projectId) => {
        const snapshot = await fixture.files.queries.portableEntries(projectId)
        await rm(fixture.outputRoot, { recursive: true })
        return snapshot
      },
      readPortableFile: (projectId, entry) => fixture.files.queries.readPortableFile(projectId, entry),
    }

    await expect(exportPackage(fixture, { projectFiles })).rejects.toThrow()
    await expect(stat(fixture.destinationPath)).rejects.toThrow()
  })

  test("rejects invalid destinations and corrupted existing targets without replacing them", async () => {
    const fixture = await setup()
    await writeFile(join(fixture.projectRoot, "世界.md"), "完整", "utf8")
    await expect(exportPackage({ ...fixture, destinationPath: join(fixture.outputRoot, "bad.zip") })).rejects.toThrow("package_destination_invalid")
    await exportPackage(fixture)
    const file = await open(fixture.destinationPath, "r+")
    await file.truncate((await file.stat()).size - 12)
    await file.close()
    const corruptedHash = await fileHash(fixture.destinationPath)

    await expect(exportPackage(fixture)).rejects.toThrow("package_destination_conflict")
    expect(await fileHash(fixture.destinationPath)).toBe(corruptedHash)
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })

  test("rejects duplicate case and workbench identities before publishing a package", async () => {
    const fixture = await setup()
    await expect(exportPackage(fixture, { conversations: [conversation, { ...conversation, caseId: "CASE-1" }] })).rejects.toThrow("duplicate conversation")
    await expect(exportPackage(fixture, { workbenches: [workbench, { ...workbench, record: { ...workbench.record, id: workbench.record.id.toUpperCase() } }] })).rejects.toThrow("duplicate workbench")
    await expect(stat(fixture.destinationPath)).rejects.toThrow()
    expect(await temporaryPackages(fixture.outputRoot)).toEqual([])
  })
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "noven-package-export-"))
  roots.push(root)
  const projectRoot = join(root, "project")
  const outputRoot = join(root, "output")
  await mkdir(projectRoot)
  await mkdir(outputRoot)
  const files = new ProjectFileService()
  const project = await files.openProject(projectRoot)
  return { root, projectRoot, outputRoot, destinationPath: join(outputRoot, "世界工程.np"), files, project }
}

function exportPackage(fixture: Awaited<ReturnType<typeof setup>>, overrides: Partial<Parameters<typeof exportPortableProjectPackage>[0]> = {}) {
  return exportPortableProjectPackage({
    destinationPath: fixture.destinationPath,
    localProjectId: fixture.project.id,
    metadata: { schemaVersion: 1, projectId: "portable-lineage-1", overview },
    projectFiles: fixture.files.queries,
    conversations: [conversation],
    workbenches: [workbench],
    exportedAt: "2026-08-10T01:00:00.000Z",
    exporterVersion: "0.1.19",
    ...overrides,
  })
}

async function temporaryPackages(outputRoot: string) {
  return (await readdir(outputRoot)).filter((name) => name.endsWith(".noven-tmp"))
}

async function fileHash(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}
