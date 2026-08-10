import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { link, lstat, open, rm, type FileHandle } from "node:fs/promises"
import { basename, dirname, extname, resolve } from "node:path"
import type { PortableConversationV1 } from "@creatx/contracts"
import type { PortableProjectFileEntry, PortableProjectFileQueryPort, PortableProjectSnapshot } from "@creatx/project-files"
import type { PortableWorkbenchV1 } from "@creatx/workbench"
import { Unzip, UnzipInflate, Zip, ZipPassThrough } from "fflate"
import { createPortableManifestV1, NP_PACKAGE_LIMITS, parsePortableChecksumsV1, parsePortableManifestV1, type PortableChecksumsV1, type PortableManifestV1 } from "./schema.ts"
import type { PortableProjectMetadataV1 } from "./project-metadata.ts"

export interface ExportPortableProjectPackageInput {
  destinationPath: string
  localProjectId: string
  metadata: PortableProjectMetadataV1
  projectFiles: PortableProjectFileQueryPort
  conversations: readonly PortableConversationV1[]
  workbenches: readonly PortableWorkbenchV1[]
  exportedAt: string
  exporterVersion: string
  signal?: AbortSignal
}

export interface ExportPortableProjectPackageResult {
  status: "created" | "existing"
  destinationPath: string
  packageId: string
  bytes: number
  manifest: PortableManifestV1
  checksums: PortableChecksumsV1
}

interface InspectedPortableProjectPackage {
  manifest: PortableManifestV1
  checksums: PortableChecksumsV1
  bytes: number
}

const archiveChunkBytes = 64 * 1024
const maximumControlBytes = 128 * 1024 * 1024
const requiredRoots = ["files/", "conversations/", "workbenches/"] as const
const archiveMtime = new Date("1980-01-01T00:00:00.000Z")

export async function exportPortableProjectPackage(input: ExportPortableProjectPackageInput): Promise<ExportPortableProjectPackageResult> {
  requireNotCancelled(input.signal)
  const destinationPath = requireDestinationPath(input.destinationPath)
  await requireDestinationDirectory(dirname(destinationPath))
  const initialFiles = await input.projectFiles.portableEntries(input.localProjectId)
  const conversations = portableConversationEntries(input.conversations)
  const workbenches = portableWorkbenchEntries(input.workbenches)
  requireDeclaredLimits(initialFiles, conversations, workbenches)
  const temporaryPath = resolve(dirname(destinationPath), `.${basename(destinationPath)}.${randomUUID()}.noven-tmp`)
  const writer = await ArchiveWriter.create(temporaryPath, archiveMtime)
  let writerFinished = false
  try {
    for (const root of requiredRoots) {
      requireNotCancelled(input.signal)
      await writer.addDirectory(root)
    }
    const directories = initialFiles.entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => `files/${entry.relativePath}`)
      .sort(comparePath)
    for (const directory of directories) {
      requireNotCancelled(input.signal)
      await writer.addDirectory(`${directory}/`)
    }
    const checksumEntries = []
    for (const entry of initialFiles.entries.filter((candidate): candidate is PortableProjectFileEntry => candidate.kind === "file").sort((left, right) => comparePath(left.relativePath, right.relativePath))) {
      requireNotCancelled(input.signal)
      const bytes = await input.projectFiles.readPortableFile(input.localProjectId, entry)
      requireNotCancelled(input.signal)
      checksumEntries.push(await writer.addFile(`files/${entry.relativePath}`, bytes, input.signal))
    }
    for (const entry of [...conversations, ...workbenches].sort((left, right) => comparePath(left.path, right.path))) {
      requireNotCancelled(input.signal)
      checksumEntries.push(await writer.addFile(entry.path, entry.bytes, input.signal))
    }
    const checksums = parsePortableChecksumsV1({ schemaVersion: 1, directories, entries: checksumEntries })
    const manifest = createPortableManifestV1({
      projectId: input.metadata.projectId,
      ...(input.metadata.forkedFromProjectId ? { forkedFromProjectId: input.metadata.forkedFromProjectId } : {}),
      overview: input.metadata.overview,
      checksums,
      exportedAt: input.exportedAt,
      exporterVersion: input.exporterVersion,
    })
    await writer.addFile("checksums.json", encodeJson(checksums), input.signal)
    await writer.addFile("manifest.json", encodeJson(manifest), input.signal)
    requireNotCancelled(input.signal)
    await writer.finish()
    writerFinished = true
    requireNotCancelled(input.signal)
    if (JSON.stringify(await input.projectFiles.portableEntries(input.localProjectId)) !== JSON.stringify(initialFiles)) {
      throw new Error("package_file_conflict: project file set changed during export")
    }
    const inspected = await inspectPortableProjectPackage(temporaryPath, input.signal)
    if (JSON.stringify(inspected.manifest) !== JSON.stringify(manifest) || JSON.stringify(inspected.checksums) !== JSON.stringify(checksums)) {
      throw new Error("package_checksum_invalid: written package does not match the export projection")
    }
    requireNotCancelled(input.signal)
    const status = await commitPackage(temporaryPath, destinationPath, manifest.packageId, input.signal)
    if (status === "existing") {
      const existing = await inspectPortableProjectPackage(destinationPath, input.signal)
      return { status, destinationPath, packageId: existing.manifest.packageId, ...existing }
    }
    return { status, destinationPath, packageId: manifest.packageId, bytes: inspected.bytes, manifest, checksums }
  } finally {
    if (!writerFinished) await writer.abort()
    await rm(temporaryPath, { force: true })
  }
}

async function inspectPortableProjectPackage(pathInput: string, signal?: AbortSignal): Promise<InspectedPortableProjectPackage> {
  requireNotCancelled(signal)
  const path = resolve(pathInput)
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("package_invalid: project package must be a regular file")
  const central = await readCentralDirectory(path)
  const extracted = await readArchiveEntries(path, signal)
  if (central.length !== extracted.size || central.some((entry) => !extracted.has(canonicalArchiveIdentity(entry.name)))) {
    throw new Error("package_invalid: ZIP central directory does not match local entries")
  }
  for (const entry of central) {
    const actual = extracted.get(canonicalArchiveIdentity(entry.name))!
    if (actual.name !== entry.name || actual.bytes !== entry.uncompressedBytes) throw new Error(`package_invalid: ZIP entry metadata does not match ${entry.name}`)
  }
  const manifestBytes = requireControlEntry(extracted, "manifest.json")
  const checksumsBytes = requireControlEntry(extracted, "checksums.json")
  const checksums = parsePortableChecksumsV1(parseJson(checksumsBytes, "checksums.json"))
  const manifest = parsePortableManifestV1(parseJson(manifestBytes, "manifest.json"), checksums)
  const expected = new Set([...requiredRoots.map(canonicalArchiveIdentity), ...checksums.directories.map((path) => canonicalArchiveIdentity(`${path}/`)), ...checksums.entries.map((entry) => canonicalArchiveIdentity(entry.path)), canonicalArchiveIdentity("checksums.json"), canonicalArchiveIdentity("manifest.json")])
  if (expected.size !== extracted.size || [...extracted.keys()].some((path) => !expected.has(path))) throw new Error("package_invalid: ZIP entries do not match checksums")
  for (const entry of checksums.entries) {
    const actual = extracted.get(canonicalArchiveIdentity(entry.path))
    if (!actual || actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) throw new Error(`package_checksum_invalid: ${entry.path}`)
  }
  for (const directory of [...requiredRoots, ...checksums.directories.map((path) => `${path}/`)]) {
    const actual = extracted.get(canonicalArchiveIdentity(directory))
    if (!actual || actual.bytes !== 0) throw new Error(`package_invalid: missing directory ${directory}`)
  }
  return { manifest, checksums, bytes: info.size }
}

class ArchiveWriter {
  private readonly zip: Zip
  private readonly file: FileHandle
  private readonly mtime: Date
  private writeTail = Promise.resolve()
  private failure: Error | undefined

  private constructor(file: FileHandle, mtime: Date) {
    this.file = file
    this.mtime = mtime
    this.zip = new Zip((error, chunk) => {
      if (error) {
        this.failure = error
        return
      }
      if (chunk.byteLength) this.writeTail = this.writeTail.then(() => writeAll(this.file, chunk))
    })
  }

  static async create(path: string, mtime: Date) {
    return new ArchiveWriter(await open(path, "wx"), mtime)
  }

  async addDirectory(path: string) {
    const entry = new ZipPassThrough(path)
    entry.mtime = this.mtime
    entry.attrs = 0x10
    this.zip.add(entry)
    await this.flush()
    entry.push(new Uint8Array(), true)
    await this.flush()
  }

  async addFile(path: string, bytes: Uint8Array, signal?: AbortSignal) {
    const entry = new ZipPassThrough(path)
    entry.mtime = this.mtime
    this.zip.add(entry)
    await this.flush()
    const hash = createHash("sha256")
    for (let offset = 0; offset < bytes.byteLength; offset += archiveChunkBytes) {
      requireNotCancelled(signal)
      const chunk = bytes.subarray(offset, Math.min(offset + archiveChunkBytes, bytes.byteLength))
      hash.update(chunk)
      entry.push(chunk, offset + chunk.byteLength === bytes.byteLength)
      await this.flush()
    }
    if (!bytes.byteLength) {
      entry.push(bytes, true)
      await this.flush()
    }
    return { path, bytes: bytes.byteLength, sha256: hash.digest("hex") }
  }

  async finish() {
    this.zip.end()
    await this.flush()
    await this.file.sync()
    await this.file.close()
  }

  async abort() {
    this.zip.terminate()
    await this.writeTail.catch(() => undefined)
    await this.file.close().catch(() => undefined)
  }

  private async flush() {
    await this.writeTail
    if (this.failure) throw this.failure
  }
}

function portableConversationEntries(values: readonly PortableConversationV1[]) {
  const ids = new Set<string>()
  return values.map((value) => {
    const id = requireExchangeId(value.caseId, "conversation caseId")
    if (ids.has(id.toLocaleLowerCase("en-US"))) throw new Error(`package_projection_invalid: duplicate conversation ${id}`)
    ids.add(id.toLocaleLowerCase("en-US"))
    return { path: `conversations/${id}.json`, bytes: encodeJson(value) }
  })
}

function portableWorkbenchEntries(values: readonly unknown[]) {
  const ids = new Set<string>()
  return values.map((value) => {
    if (!isPlainRecord(value) || value.exchangeVersion !== 1 || !isPlainRecord(value.record)) throw new Error("package_projection_invalid: portable workbench is invalid")
    const id = requireExchangeId(value.record.id, "workbench id")
    if (ids.has(id.toLocaleLowerCase("en-US"))) throw new Error(`package_projection_invalid: duplicate workbench ${id}`)
    ids.add(id.toLocaleLowerCase("en-US"))
    return { path: `workbenches/${id}.json`, bytes: encodeJson(value) }
  })
}

function requireDeclaredLimits(files: PortableProjectSnapshot, conversations: readonly { bytes: Uint8Array }[], workbenches: readonly { bytes: Uint8Array }[]) {
  const entryCount = files.entries.length + conversations.length + workbenches.length
  const totalBytes = files.entries.reduce((total, entry) => total + entry.bytes, 0)
    + conversations.reduce((total, entry) => total + entry.bytes.byteLength, 0)
    + workbenches.reduce((total, entry) => total + entry.bytes.byteLength, 0)
  if (!Number.isSafeInteger(entryCount) || entryCount > NP_PACKAGE_LIMITS.maxEntries) throw new Error("package_size_invalid: project exceeds the V1 entry limit")
  if (!Number.isSafeInteger(totalBytes) || totalBytes > NP_PACKAGE_LIMITS.maxTotalBytes) throw new Error("package_size_invalid: project exceeds the V1 total byte limit")
}

async function commitPackage(temporaryPath: string, destinationPath: string, packageId: string, signal?: AbortSignal): Promise<"created" | "existing"> {
  requireNotCancelled(signal)
  try {
    await link(temporaryPath, destinationPath)
    return "created"
  } catch (error) {
    if (!await pathExists(destinationPath)) throw new Error(`package_destination_unsupported: selected location cannot atomically commit the package: ${errorMessage(error)}`)
  }
  const existing = await inspectPortableProjectPackage(destinationPath, signal).catch((error: unknown) => {
    throw new Error(`package_destination_conflict: existing target is not the same valid package: ${errorMessage(error)}`)
  })
  if (existing.manifest.packageId !== packageId) throw new Error("package_destination_conflict: target already contains a different package")
  return "existing"
}

async function readArchiveEntries(path: string, signal?: AbortSignal) {
  const entries = new Map<string, { name: string; bytes: number; sha256: string; control?: Uint8Array }>()
  const discovered = new Set<string>()
  let failure: Error | undefined
  const unzip = new Unzip((file) => {
    const name = requireArchiveEntryName(file.name)
    const identity = canonicalArchiveIdentity(name)
    if (discovered.has(identity)) throw new Error(`package_path_duplicate: ${name}`)
    discovered.add(identity)
    const hash = createHash("sha256")
    const controlChunks: Uint8Array[] = []
    let bytes = 0
    file.ondata = (error, chunk, final) => {
      if (error) {
        failure = error
        return
      }
      bytes += chunk.byteLength
      hash.update(chunk)
      if (name === "manifest.json" || name === "checksums.json") {
        if (bytes > maximumControlBytes) throw new Error(`package_size_invalid: ${name} is too large`)
        controlChunks.push(chunk.slice())
      }
      if (final) entries.set(identity, { name, bytes, sha256: hash.digest("hex"), ...(controlChunks.length ? { control: Buffer.concat(controlChunks) } : {}) })
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for await (const chunk of createReadStream(path, { highWaterMark: archiveChunkBytes })) {
    requireNotCancelled(signal)
    unzip.push(chunk, false)
    if (failure) throw failure
  }
  unzip.push(new Uint8Array(), true)
  if (failure) throw failure
  return entries
}

async function readCentralDirectory(path: string) {
  const file = await open(path, "r")
  try {
    const size = (await file.stat()).size
    const tailBytes = Math.min(size, 65_557)
    const tail = await readExactly(file, size - tailBytes, tailBytes)
    const endOffset = findEndOfCentralDirectory(tail)
    const disk = tail.readUInt16LE(endOffset + 4)
    const centralDisk = tail.readUInt16LE(endOffset + 6)
    const diskEntries = tail.readUInt16LE(endOffset + 8)
    const entryCount = tail.readUInt16LE(endOffset + 10)
    const centralBytes = tail.readUInt32LE(endOffset + 12)
    const centralOffset = tail.readUInt32LE(endOffset + 16)
    const commentBytes = tail.readUInt16LE(endOffset + 20)
    if (disk || centralDisk || diskEntries !== entryCount || entryCount > NP_PACKAGE_LIMITS.maxEntries + 5 || commentBytes !== tail.byteLength - endOffset - 22 || centralOffset + centralBytes !== size - tailBytes + endOffset) {
      throw new Error("package_invalid: ZIP central directory is invalid or uses unsupported ZIP64")
    }
    const entries = []
    let offset = centralOffset
    for (let index = 0; index < entryCount; index += 1) {
      const header = await readExactly(file, offset, 46)
      if (header.readUInt32LE(0) !== 0x02014b50) throw new Error("package_invalid: ZIP central entry is invalid")
      const flags = header.readUInt16LE(8)
      const method = header.readUInt16LE(10)
      const compressedBytes = header.readUInt32LE(20)
      const uncompressedBytes = header.readUInt32LE(24)
      const nameBytes = header.readUInt16LE(28)
      const extraBytes = header.readUInt16LE(30)
      const commentLength = header.readUInt16LE(32)
      const localOffset = header.readUInt32LE(42)
      if (flags & 1 || (method !== 0 && method !== 8) || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset >= centralOffset) {
        throw new Error("package_invalid: ZIP entry uses unsupported features")
      }
      const name = new TextDecoder(flags & 0x800 ? "utf-8" : "windows-1252", { fatal: true }).decode(await readExactly(file, offset + 46, nameBytes))
      entries.push({ name: requireArchiveEntryName(name), compressedBytes, uncompressedBytes })
      offset += 46 + nameBytes + extraBytes + commentLength
    }
    if (offset !== centralOffset + centralBytes) throw new Error("package_invalid: ZIP central directory length is invalid")
    return entries
  } finally {
    await file.close()
  }
}

function requireArchiveEntryName(value: string) {
  if (!value || value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("package_path_invalid: ZIP entry name is not canonical")
  const path = value.endsWith("/") ? value.slice(0, -1) : value
  const segments = path.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`package_path_invalid: ${value}`)
  if (segments.length === 1 && value !== "manifest.json" && value !== "checksums.json" && !requiredRoots.includes(value as typeof requiredRoots[number])) throw new Error(`package_path_invalid: ${value}`)
  if (segments.length > 1 && !requiredRoots.some((root) => segments[0] === root.slice(0, -1))) throw new Error(`package_path_invalid: ${value}`)
  return value
}

function canonicalArchiveIdentity(path: string) {
  return path.normalize("NFC").toLocaleLowerCase("en-US")
}

function requireControlEntry(entries: Map<string, { control?: Uint8Array }>, path: string) {
  const bytes = entries.get(canonicalArchiveIdentity(path))?.control
  if (!bytes) throw new Error(`package_invalid: missing ${path}`)
  return bytes
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (error) {
    throw new Error(`package_invalid: ${name} is not valid UTF-8 JSON: ${errorMessage(error)}`)
  }
}

function encodeJson(value: unknown) {
  try {
    const json = JSON.stringify(value, undefined, 2)
    if (json === undefined) throw new Error("value is not serializable")
    return new TextEncoder().encode(`${json}\n`)
  } catch (error) {
    throw new Error(`package_projection_invalid: ${errorMessage(error)}`)
  }
}

function requireExchangeId(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value)) throw new Error(`package_projection_invalid: ${name} is invalid`)
  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function requireDestinationPath(value: string) {
  const path = resolve(value)
  if (extname(path).toLocaleLowerCase("en-US") !== ".np") throw new Error("package_destination_invalid: destination must use the .np extension")
  return path
}

async function requireDestinationDirectory(path: string) {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("package_destination_invalid: destination directory must be a real directory")
}

async function writeAll(file: FileHandle, bytes: Uint8Array) {
  let offset = 0
  while (offset < bytes.byteLength) offset += (await file.write(bytes, offset, bytes.byteLength - offset)).bytesWritten
}

async function readExactly(file: FileHandle, position: number, bytes: number) {
  const buffer = Buffer.alloc(bytes)
  let offset = 0
  while (offset < bytes) {
    const read = await file.read(buffer, offset, bytes - offset, position + offset)
    if (!read.bytesRead) throw new Error("package_invalid: ZIP file ended unexpectedly")
    offset += read.bytesRead
  }
  return buffer
}

function findEndOfCentralDirectory(tail: Buffer) {
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error("package_invalid: ZIP end record is missing")
}

function requireNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("package_export_cancelled: export was cancelled")
}

function comparePath(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

async function pathExists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
