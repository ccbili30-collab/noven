import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { WorkbenchRegistryService } from "@creatx/workbench"
import { zipSync } from "fflate"
import {
  NP_PACKAGE_LIMITS,
  ProjectCatalogStore,
  cleanupPortableProjectImportStaging,
  createPortableManifestV1,
  exportPortableProjectPackage,
  importPortableProjectPackage,
  type PortableChecksumsV1,
} from "../src"

const roots: string[] = []
const empty = new Uint8Array()
const overview = { purpose: "建立硬科幻世界", currentResults: "完成星图", usageGuide: "先阅读案例" }

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("portable Noven package import", () => {
  test("imports the exact archive produced by the authoritative exporter", async () => {
    const fixture = await setup()
    const sourceRoot = join(fixture.root, "source")
    await mkdir(join(sourceRoot, "作品"), { recursive: true })
    await writeFile(join(sourceRoot, "世界.md"), "导出再导入", "utf8")
    await writeFile(join(sourceRoot, "作品", "星图.bin"), new Uint8Array([9, 8, 7]))
    const sourceFiles = new ProjectFileService()
    const source = await sourceFiles.openProject(sourceRoot)
    await exportPortableProjectPackage({
      destinationPath: fixture.packagePath,
      localProjectId: source.id,
      metadata: { schemaVersion: 1, projectId: "roundtrip-lineage", overview },
      projectFiles: sourceFiles.queries,
      conversations: [conversation],
      workbenches: [workbench],
      exportedAt: "2026-08-10T01:00:00.000Z",
      exporterVersion: "0.1.19",
    })

    const result = await importPackage(fixture)

    expect(result.status).toBe("imported")
    expect(await readFile(join(fixture.destinationPath, "世界.md"), "utf8")).toBe("导出再导入")
    expect(await readFile(join(fixture.destinationPath, "作品", "星图.bin"))).toEqual(Buffer.from([9, 8, 7]))
  })

  test("preflights, extracts and registers a complete project without creating a Cline session", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes())

    const result = await importPackage(fixture)

    expect(result.status).toBe("imported")
    if (result.status !== "imported") throw new Error("expected imported result")
    expect(await readFile(join(fixture.destinationPath, "世界.md"), "utf8")).toBe("轨道城邦")
    expect(await readFile(join(fixture.destinationPath, "作品", "星图.bin"))).toEqual(Buffer.from([0, 1, 2, 255]))
    expect((await stat(join(fixture.destinationPath, "作品", "空目录"))).isDirectory()).toBe(true)
    expect(JSON.parse(await readFile(join(fixture.destinationPath, ".creatx", "portable-project", "metadata.v1.json"), "utf8"))).toMatchObject({ projectId: "portable-lineage-1", overview })
    expect(JSON.parse(await readFile(join(fixture.destinationPath, ".creatx", "portable-project", "cases", "case-1.json"), "utf8"))).toMatchObject({ caseId: "case-1", title: "建立世界" })
    expect(JSON.parse(await readFile(join(fixture.destinationPath, ".creatx", "workbenches", `${workbench.record.id}.json`), "utf8"))).toMatchObject(workbench.record)
    expect((await fixture.catalog.list()).map((entry) => entry.localProjectId)).toEqual(["portable-lineage-1"])
    expect(result.workbenchDiagnostics).toEqual([])
    expect(await controlledStaging(fixture.parent)).toEqual([])

    const repeated = await importPackage({ ...fixture, destinationPath: join(fixture.parent, "重复目标") })
    expect(repeated.status).toBe("existing")
    expect(await pathExists(join(fixture.parent, "重复目标"))).toBe(false)
  })

  test("requires an explicit independent copy for the same lineage with different content", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes())
    await importPackage(fixture)
    const changedPath = join(fixture.root, "changed.np")
    await writePackage(changedPath, packageBytes({ files: { "世界.md": bytes("第二版") } }))

    await expect(importPackage({ ...fixture, packagePath: changedPath, destinationPath: join(fixture.parent, "冲突") })).rejects.toThrow("package_import_conflict")
    const forked = await importPackage({ ...fixture, packagePath: changedPath, destinationPath: join(fixture.parent, "独立副本") }, { conflictResolution: "independent-copy" })

    expect(forked.status).toBe("imported")
    if (forked.status !== "imported") throw new Error("expected imported result")
    expect(forked.localPortableProjectId).not.toBe("portable-lineage-1")
    expect(JSON.parse(await readFile(join(fixture.parent, "独立副本", ".creatx", "portable-project", "metadata.v1.json"), "utf8"))).toMatchObject({ projectId: forked.localPortableProjectId, forkedFromProjectId: "portable-lineage-1" })
  })

  test("returns a recoverable committed result when catalog persistence fails after directory commit", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes())
    const catalog = {
      inspectImport: (...args: Parameters<ProjectCatalogStore["inspectImport"]>) => fixture.catalog.inspectImport(...args),
      register: async () => { throw new Error("disk unavailable") },
    }

    const result = await importPackage(fixture, { catalog })

    expect(result.status).toBe("committed-unregistered")
    expect(await readFile(join(fixture.destinationPath, "世界.md"), "utf8")).toBe("轨道城邦")
    expect(await readFile(join(fixture.destinationPath, ".creatx", "portable-project", "import-state.v1.json"), "utf8")).toContain("committed-unregistered")
    expect(await controlledStaging(fixture.parent)).toEqual([])
  })

  test("keeps a committed project recoverable when controlled metadata persistence fails", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes())
    const internal = fixture.projectFiles.internal
    const projectFiles = {
      openProject: (path: string) => fixture.projectFiles.openProject(path),
      internal: {
        ...internal,
        writeFile: (request: Parameters<typeof internal.writeFile>[0]) => request.key === "metadata.v1.json" ? Promise.reject(new Error("metadata disk failure")) : internal.writeFile(request),
      },
    }

    const result = await importPackage(fixture, { projectFiles })

    expect(result.status).toBe("committed-unregistered")
    expect(await readFile(join(fixture.destinationPath, "世界.md"), "utf8")).toBe("轨道城邦")
    expect(await readFile(join(fixture.destinationPath, ".creatx", "portable-project", "import-state.v1.json"), "utf8")).toContain("metadata disk failure")
  })

  test("degrades a checksum-valid damaged workbench but rejects a damaged conversation before commit", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes({ workbenchBytes: bytes("not json") }))
    const imported = await importPackage(fixture)
    expect(imported.status).toBe("imported")
    if (imported.status !== "imported") throw new Error("expected imported result")
    expect(imported.workbenchDiagnostics).toHaveLength(1)

    const second = await setup()
    await writePackage(second.packagePath, packageBytes({ conversationBytes: bytes("not json") }))
    await expect(importPackage(second)).rejects.toThrow("package_case_invalid")
    expect(await pathExists(second.destinationPath)).toBe(false)
  })

  test("does not alter an existing destination and cleans a post-preflight cancellation", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes({ files: { "large.bin": new Uint8Array(8 * 1024 * 1024) } }))
    await mkdir(fixture.destinationPath)
    await writeFile(join(fixture.destinationPath, "keep.txt"), "保留", "utf8")
    await expect(importPackage(fixture)).rejects.toThrow("package_destination_conflict")
    expect(await readFile(join(fixture.destinationPath, "keep.txt"), "utf8")).toBe("保留")

    await rm(fixture.destinationPath, { recursive: true })
    const controller = new AbortController()
    const catalog = {
      inspectImport: (...args: Parameters<ProjectCatalogStore["inspectImport"]>) => {
        const result = fixture.catalog.inspectImport(...args)
        controller.abort()
        return result
      },
      register: (input: Parameters<ProjectCatalogStore["register"]>[0]) => fixture.catalog.register(input),
    }
    await expect(importPackage(fixture, { signal: controller.signal, catalog })).rejects.toThrow("package_import_cancelled")
    expect(await pathExists(fixture.destinationPath)).toBe(false)
    expect(await controlledStaging(fixture.parent)).toEqual([])
  })

  test("rejects unsafe or unsupported ZIP structures before creating a project", async () => {
    const fixture = await setup()
    const valid = packageBytes()
    const cases: Array<[string, string, Uint8Array]> = [
      ["伪扩展", "package_extension_invalid", valid],
      ["加密条目", "package_encryption_unsupported", patchFlags(valid, 1)],
      ["绝对路径", "package_path_invalid", packageBytes({ extra: { "C:/outside.txt": bytes("x") } })],
      ["父级穿越", "package_path_invalid", packageBytes({ extra: { "../outside.txt": bytes("x") } })],
      ["反斜杠", "package_path_invalid", packageBytes({ extra: { "files\\outside.txt": bytes("x") } })],
      ["Windows 设备名", "package_path_invalid", packageBytes({ extra: { "files/CON.txt": bytes("x") } })],
      ["备用数据流", "package_path_invalid", packageBytes({ extra: { "files/世界.md:secret": bytes("x") } })],
      ["尾随句点", "package_path_invalid", packageBytes({ extra: { "files/尾点.": bytes("x") } })],
      ["大小写重复", "package_path_duplicate", packageBytes({ extra: { "files/世界.MD": bytes("x") } })],
      ["符号链接", "package_link_unsupported", patchFirstContentAsSymlink(valid)],
      ["条目数超限", "package_size_invalid", patchEntryCount(valid, NP_PACKAGE_LIMITS.maxEntries + 6)],
      ["声明大小超限", "package_size_invalid", patchFirstContentSize(valid, NP_PACKAGE_LIMITS.maxEntryBytes + 1)],
      ["Checksum 错误", "package_checksum_invalid", packageBytes({ wrongFileHash: true })],
      ["中央目录截断", "package_invalid", valid.subarray(0, valid.byteLength - 12)],
    ]

    for (const [name, code, archive] of cases) {
      const packagePath = name === "伪扩展" ? join(fixture.root, `${name}.zip`) : join(fixture.root, `${name}.np`)
      const destinationPath = join(fixture.parent, name)
      await writePackage(packagePath, archive)
      await expect(importPackage({ ...fixture, packagePath, destinationPath })).rejects.toThrow(code)
      expect(await pathExists(destinationPath)).toBe(false)
    }
    expect(await controlledStaging(fixture.parent)).toEqual([])
  })

  test("rejects an excessive compression ratio before extraction", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes({ files: { "压缩炸弹.bin": new Uint8Array(2 * 1024 * 1024) }, level: 9 }))

    await expect(importPackage(fixture)).rejects.toThrow("package_compression_invalid")
    expect(await pathExists(fixture.destinationPath)).toBe(false)
  })

  test("cancels and only cleans controlled staging directories", async () => {
    const fixture = await setup()
    await writePackage(fixture.packagePath, packageBytes())
    const controller = new AbortController()
    controller.abort()
    await expect(importPackage(fixture, { signal: controller.signal })).rejects.toThrow("package_import_cancelled")

    const stale = join(fixture.parent, ".old.noven-import-tmp")
    const recent = join(fixture.parent, ".recent.noven-import-tmp")
    const unrelated = join(fixture.parent, ".keep-me")
    await Promise.all([mkdir(join(stale, ".creatx", "portable-project"), { recursive: true }), mkdir(join(recent, ".creatx", "portable-project"), { recursive: true }), mkdir(unrelated)])
    await Promise.all([stale, recent].map((path) => writeFile(join(path, ".creatx", "portable-project", "import-state.v1.json"), JSON.stringify({ schemaVersion: 1, status: "staging" }))))
    const old = new Date("2026-08-08T00:00:00.000Z")
    await utimes(join(stale, ".creatx", "portable-project", "import-state.v1.json"), old, old)

    const cleaned = await cleanupPortableProjectImportStaging(fixture.parent, { now: new Date("2026-08-10T00:00:00.000Z"), minimumAgeMs: 24 * 60 * 60 * 1000 })

    expect(cleaned).toEqual([stale])
    expect(await pathExists(stale)).toBe(false)
    expect(await pathExists(recent)).toBe(true)
    expect(await pathExists(unrelated)).toBe(true)
  })
})

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
const workbench = { exchangeVersion: 1 as const, record: { schemaVersion: 1 as const, id: "wb_550e8400-e29b-41d4-a716-446655440101", folder: "作品", title: "作品" } }

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "noven-package-import-"))
  roots.push(root)
  const parent = join(root, "projects")
  const userData = join(root, "user-data")
  await Promise.all([mkdir(parent), mkdir(userData)])
  return {
    root,
    parent,
    userData,
    packagePath: join(root, "project.np"),
    destinationPath: join(parent, "星环工程"),
    projectFiles: new ProjectFileService(),
    catalog: new ProjectCatalogStore(userData),
  }
}

function importPackage(fixture: Awaited<ReturnType<typeof setup>>, overrides: Partial<Parameters<typeof importPortableProjectPackage>[0]> = {}) {
  const workbenches = new WorkbenchRegistryService(fixture.projectFiles.queries, fixture.projectFiles.internal)
  return importPortableProjectPackage({
    packagePath: fixture.packagePath,
    destinationPath: fixture.destinationPath,
    displayName: "星环工程",
    projectFiles: fixture.projectFiles,
    workbenches,
    catalog: fixture.catalog,
    ...overrides,
  })
}

function packageBytes(options: {
  files?: Record<string, Uint8Array>
  extra?: Record<string, Uint8Array>
  wrongFileHash?: boolean
  conversationBytes?: Uint8Array
  workbenchBytes?: Uint8Array
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
} = {}) {
  const files = options.files ?? { "世界.md": bytes("轨道城邦"), "作品/星图.bin": new Uint8Array([0, 1, 2, 255]) }
  const values: Record<string, Uint8Array> = {
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [`files/${path}`, value])),
    "conversations/case-1.json": options.conversationBytes ?? jsonBytes(conversation),
    [`workbenches/${workbench.record.id}.json`]: options.workbenchBytes ?? jsonBytes(workbench),
  }
  const checksums: PortableChecksumsV1 = {
    schemaVersion: 1,
    directories: ["files/作品", "files/作品/空目录"],
    entries: Object.entries(values).map(([path, value]) => ({ path, bytes: value.byteLength, sha256: options.wrongFileHash && path.startsWith("files/") ? "0".repeat(64) : hash(value) })),
  }
  const manifest = createPortableManifestV1({ projectId: "portable-lineage-1", overview, checksums, exportedAt: "2026-08-10T01:00:00.000Z", exporterVersion: "0.1.19" })
  return zipSync({
    "files/": empty,
    "conversations/": empty,
    "workbenches/": empty,
    "files/作品/": empty,
    "files/作品/空目录/": empty,
    ...values,
    "checksums.json": jsonBytes(checksums),
    "manifest.json": jsonBytes(manifest),
    ...(options.extra ?? {}),
  }, { level: options.level ?? 0 })
}

function patchFlags(archive: Uint8Array, flags: number) {
  const result = Buffer.from(archive)
  for (const offset of signatureOffsets(result, 0x04034b50)) result.writeUInt16LE(result.readUInt16LE(offset + 6) | flags, offset + 6)
  for (const offset of signatureOffsets(result, 0x02014b50)) result.writeUInt16LE(result.readUInt16LE(offset + 8) | flags, offset + 8)
  return new Uint8Array(result)
}

function patchFirstContentAsSymlink(archive: Uint8Array) {
  const result = Buffer.from(archive)
  const offset = signatureOffsets(result, 0x02014b50).find((candidate) => centralName(result, candidate) === "files/世界.md")!
  result.writeUInt16LE(0x031e, offset + 4)
  result.writeUInt32LE((0o120777 << 16) >>> 0, offset + 38)
  return new Uint8Array(result)
}

function patchEntryCount(archive: Uint8Array, count: number) {
  const result = Buffer.from(archive)
  const offset = signatureOffsets(result, 0x06054b50).at(-1)!
  result.writeUInt16LE(count, offset + 8)
  result.writeUInt16LE(count, offset + 10)
  return new Uint8Array(result)
}

function patchFirstContentSize(archive: Uint8Array, size: number) {
  const result = Buffer.from(archive)
  const central = signatureOffsets(result, 0x02014b50).find((candidate) => centralName(result, candidate) === "files/世界.md")!
  result.writeUInt32LE(size, central + 24)
  return new Uint8Array(result)
}

function signatureOffsets(buffer: Buffer, signature: number) {
  const offsets: number[] = []
  for (let offset = 0; offset <= buffer.byteLength - 4; offset += 1) if (buffer.readUInt32LE(offset) === signature) offsets.push(offset)
  return offsets
}

function centralName(buffer: Buffer, offset: number) {
  return buffer.subarray(offset + 46, offset + 46 + buffer.readUInt16LE(offset + 28)).toString("utf8")
}

async function writePackage(path: string, value: Uint8Array) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

async function controlledStaging(parent: string) {
  return (await readdir(parent)).filter((name) => name.endsWith(".noven-import-tmp"))
}

async function pathExists(path: string) {
  return stat(path).then(() => true, () => false)
}

function jsonBytes(value: unknown) {
  return bytes(`${JSON.stringify(value)}\n`)
}

function bytes(value: string) {
  return new TextEncoder().encode(value)
}

function hash(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}
