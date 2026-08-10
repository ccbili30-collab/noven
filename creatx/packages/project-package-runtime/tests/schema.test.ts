import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { Unzip, UnzipInflate, Zip, ZipDeflate, zipSync } from "fflate"
import {
  NP_PACKAGE_LIMITS,
  computePackageId,
  createPortableManifestV1,
  parsePortableChecksumsV1,
  parsePortableManifestV1,
  type PortableChecksumsV1,
  type PortableProjectOverviewV1,
} from "../src"

const overview: PortableProjectOverviewV1 = {
  purpose: "共同创作一套科幻世界",
  currentResults: "世界设定与第一章已完成",
  usageGuide: "先阅读项目首页，再从案例继续创作",
}

const content = {
  "files/世界.md": "世界",
  "conversations/case-1.json": "案例",
  "workbenches/world.json": "工作台",
}

const checksums = checksumsFor(content, ["files/空目录"])

describe("portable Noven package V1 schema", () => {
  test("keeps ordinary ZIP limits below the accepted V1 ceiling", () => {
    expect(NP_PACKAGE_LIMITS.maxEntries).toBe(60_000)
    expect(NP_PACKAGE_LIMITS.maxTotalBytes).toBe(2 * 1024 * 1024 * 1024)
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: Array.from({ length: NP_PACKAGE_LIMITS.maxEntries + 1 }, () => "files/overflow"),
      entries: [],
    })).toThrow("package_size_invalid")
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: [],
      entries: ["a", "b"].map((name) => ({ path: `files/${name}`, bytes: NP_PACKAGE_LIMITS.maxTotalBytes / 2 + 1, sha256: "0".repeat(64) })),
    })).toThrow("package_size_invalid")
  })

  test("accepts a strict manifest and checksum list", () => {
    const manifest = createPortableManifestV1({
      projectId: "project-lineage-1",
      overview,
      checksums,
      exportedAt: "2026-08-10T00:00:00.000Z",
      exporterVersion: "0.1.19",
    })

    expect(parsePortableManifestV1(manifest, checksums)).toEqual(manifest)
    expect(parsePortableChecksumsV1(checksums)).toEqual(checksums)
    expect(manifest.counts).toEqual({ files: 1, conversations: 1, workbenches: 1 })
    expect(manifest.packageId).toMatch(/^[a-f0-9]{64}$/)
  })

  test("rejects unknown versions, extra fields and an incorrect package identity", () => {
    const manifest = createPortableManifestV1({
      projectId: "project-lineage-1",
      overview,
      checksums,
      exportedAt: "2026-08-10T00:00:00.000Z",
      exporterVersion: "0.1.19",
    })

    expect(() => parsePortableManifestV1({ ...manifest, schemaVersion: 2 }, checksums)).toThrow("package_version_unsupported")
    expect(() => parsePortableManifestV1({ ...manifest, unexpected: true }, checksums)).toThrow("package_invalid")
    expect(() => parsePortableManifestV1({ ...manifest, overview: { ...manifest.overview, unexpected: true } }, checksums)).toThrow("package_invalid")
    expect(() => parsePortableManifestV1({ ...manifest, packageId: "0".repeat(64) }, checksums)).toThrow("package_identity_mismatch")
    expect(() => parsePortableChecksumsV1({ ...checksums, unexpected: true })).toThrow("package_invalid")
    expect(() => parsePortableChecksumsV1({ ...checksums, entries: [{ ...checksums.entries[0], unexpected: true }] })).toThrow("package_invalid")
  })

  test.each([
    "C:/outside.txt",
    "/outside.txt",
    "files\\outside.txt",
    "files/../outside.txt",
    "files/./outside.txt",
    "files//outside.txt",
    "other/outside.txt",
  ])("rejects unsafe checksum path %s", (path) => {
    expect(() => parsePortableChecksumsV1(checksumsFor({ [path]: "unsafe" }))).toThrow("package_path_invalid")
  })

  test.each(["files/CON.txt", "files/作品.md:secret", "files/尾随. ", "files/星图?"])("rejects Windows-unsafe portable path %s", (path) => {
    expect(() => parsePortableChecksumsV1({ schemaVersion: 1, directories: [], entries: [{ path, bytes: 1, sha256: "0".repeat(64) }] })).toThrow("package_path_invalid")
  })

  test("rejects duplicate canonical paths, unsafe sizes and malformed SHA-256", () => {
    const first = checksums.entries[0]!
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: [],
      entries: [first, { ...first, path: first.path.replace("世界.md", "世界.MD") }],
    })).toThrow("package_path_duplicate")
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: [first.path],
      entries: [first],
    })).toThrow("package_path_duplicate")
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: [],
      entries: [{ ...first, bytes: NP_PACKAGE_LIMITS.maxEntryBytes + 1 }],
    })).toThrow("package_size_invalid")
    expect(() => parsePortableChecksumsV1({
      schemaVersion: 1,
      directories: [],
      entries: [{ ...first, sha256: "A".repeat(64) }],
    })).toThrow("package_checksum_invalid")
  })

  test("makes packageId independent from export and ZIP metadata but sensitive to all identity content", () => {
    const first = createPortableManifestV1({
      projectId: "project-lineage-1",
      overview,
      checksums,
      exportedAt: "2026-08-10T00:00:00.000Z",
      exporterVersion: "0.1.19",
    })
    const second = createPortableManifestV1({
      projectId: "project-lineage-1",
      overview,
      checksums: { ...checksums, entries: [...checksums.entries].reverse() },
      exportedAt: "2030-01-01T00:00:00.000Z",
      exporterVersion: "9.9.9",
    })
    const firstZip = zipSync({ "manifest.json": new TextEncoder().encode(JSON.stringify(first)) }, { level: 0, mtime: new Date("2026-01-01T00:00:00.000Z") })
    const secondZip = zipSync({ "manifest.json": new TextEncoder().encode(JSON.stringify(second)) }, { level: 9, mtime: new Date("2030-01-01T00:00:00.000Z") })

    expect(first.packageId).toBe(second.packageId)
    expect(createHash("sha256").update(firstZip).digest("hex")).not.toBe(createHash("sha256").update(secondZip).digest("hex"))

    const mutations = [
      { projectId: "project-lineage-2", overview, checksums },
      { projectId: "project-lineage-1", overview: { ...overview, purpose: `${overview.purpose}！` }, checksums },
      { projectId: "project-lineage-1", overview, checksums: checksumsFor({ ...content, "files/世界.md": "世界！" }, checksums.directories) },
      { projectId: "project-lineage-1", overview, checksums: checksumsFor({ ...content, "conversations/case-1.json": "案例！" }, checksums.directories) },
      { projectId: "project-lineage-1", overview, checksums: checksumsFor({ ...content, "workbenches/world.json": "工作台！" }, checksums.directories) },
      { projectId: "project-lineage-1", overview, checksums: { ...checksums, directories: ["files/另一个空目录"] } },
    ]
    expect(mutations.map(computePackageId)).not.toContain(first.packageId)
  })

  test("streams a 32 MB deflated entry without retaining the decompressed file", async () => {
    const sourceChunk = new Uint8Array(64 * 1024).fill(0x61)
    const sourceBytes = 32 * 1024 * 1024
    const compressed: Uint8Array[] = []
    const zip = new Zip((error, chunk) => {
      if (error) throw error
      compressed.push(chunk)
    })
    const entry = new ZipDeflate("files/probe.bin", { level: 6 })
    zip.add(entry)
    for (let offset = 0; offset < sourceBytes; offset += sourceChunk.byteLength) {
      entry.push(sourceChunk, offset + sourceChunk.byteLength === sourceBytes)
    }
    zip.end()

    let decodedBytes = 0
    let largestDecodedChunk = 0
    await new Promise<void>((resolve, reject) => {
      const unzip = new Unzip((file) => {
        file.ondata = (error, chunk, final) => {
          if (error) return reject(error)
          decodedBytes += chunk.byteLength
          largestDecodedChunk = Math.max(largestDecodedChunk, chunk.byteLength)
          if (final) resolve()
        }
        file.start()
      })
      unzip.register(UnzipInflate)
      const archive = Buffer.concat(compressed)
      for (let offset = 0; offset < archive.byteLength; offset += 256) {
        unzip.push(archive.subarray(offset, offset + 256), offset + 256 >= archive.byteLength)
      }
    })

    expect(decodedBytes).toBe(sourceBytes)
    expect(largestDecodedChunk).toBeLessThan(sourceBytes / 4)
  }, 15_000)
})

function checksumsFor(files: Record<string, string>, directories: string[] = []): PortableChecksumsV1 {
  return {
    schemaVersion: 1,
    directories: [...directories],
    entries: Object.entries(files).map(([path, value]) => ({
      path,
      bytes: Buffer.byteLength(value),
      sha256: createHash("sha256").update(value).digest("hex"),
    })),
  }
}
