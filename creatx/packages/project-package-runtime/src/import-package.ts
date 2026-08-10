import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { PortableConversationItemV1, PortableConversationV1, ProjectCatalogEntryProjection } from "@creatx/contracts"
import type { ProjectFileService, ProjectInternalStatePort } from "@creatx/project-files"
import type { PortableWorkbenchImport, WorkbenchRegistryService } from "@creatx/workbench"
import { inflateSync, Unzip, UnzipInflate, type UnzipFile } from "fflate"
import { PortableProjectMetadataStore } from "./project-metadata.ts"
import type { ProjectCatalogImportInspection, ProjectCatalogRegistrationInput, ProjectCatalogStore } from "./project-catalog.ts"
import { NP_PACKAGE_LIMITS, parsePortableChecksumsV1, parsePortableManifestV1, parsePortablePackagePath, type PortableChecksumEntryV1, type PortableChecksumsV1, type PortableManifestV1 } from "./schema.ts"

export interface ImportPortableProjectPackageInput {
  packagePath: string
  destinationPath: string
  displayName: string
  projectFiles: Pick<ProjectFileService, "openProject" | "internal">
  workbenches: Pick<WorkbenchRegistryService, "importPortableWorkbenches">
  catalog: {
    inspectImport(projectId: string, packageId: string): ProjectCatalogImportInspection
    register(input: ProjectCatalogRegistrationInput): ReturnType<ProjectCatalogStore["register"]>
  }
  conflictResolution?: "independent-copy"
  signal?: AbortSignal
}

export type ImportPortableProjectPackageResult =
  | {
      status: "imported"
      destinationPath: string
      runtimeProjectId: string
      localPortableProjectId: string
      importedProjectId: string
      importedPackageId: string
      workbenchDiagnostics: PortableWorkbenchImport["diagnostics"]
    }
  | { status: "existing"; entry: ProjectCatalogEntryProjection }
  | {
      status: "committed-unregistered"
      destinationPath: string
      runtimeProjectId?: string
      localPortableProjectId: string
      importedProjectId: string
      importedPackageId: string
      failure: string
    }

interface CentralEntry {
  name: string
  identity: string
  method: 0 | 8
  compressedBytes: number
  uncompressedBytes: number
  dataOffset: number
  localOffset: number
  directory: boolean
}

interface InspectedPackage {
  manifest: PortableManifestV1
  checksums: PortableChecksumsV1
  entries: CentralEntry[]
}

interface ExtractedExchange {
  conversations: PortableConversationV1[]
  workbenches: unknown[]
}

const archiveChunkBytes = 64 * 1024
const requiredRoots = ["files/", "conversations/", "workbenches/"] as const
const stagingSuffix = ".noven-import-tmp"
const markerRelativePath = join(".creatx", "portable-project", "import-state.v1.json")
const caseNamespace = "portable-project"

export async function importPortableProjectPackage(input: ImportPortableProjectPackageInput): Promise<ImportPortableProjectPackageResult> {
  requireNotCancelled(input.signal)
  const packagePath = await requirePackagePath(input.packagePath)
  const inspected = await inspectPackage(packagePath, input.signal)
  const existing = input.catalog.inspectImport(inspected.manifest.projectId, inspected.manifest.packageId)
  if (existing.kind === "existing") return { status: "existing", entry: existing.entry }
  if (existing.kind === "conflict" && input.conflictResolution !== "independent-copy") {
    throw new Error(`package_import_conflict: project lineage already contains different content in ${existing.existingLocalProjectIds.join(", ")}`)
  }
  const destinationPath = await requireNewDestination(input.destinationPath)
  const displayName = requireDisplayName(input.displayName)
  const localPortableProjectId = input.conflictResolution === "independent-copy" ? randomUUID() : inspected.manifest.projectId
  const forkedFromProjectId = input.conflictResolution === "independent-copy" ? inspected.manifest.projectId : inspected.manifest.forkedFromProjectId
  const stagingPath = resolve(dirname(destinationPath), `.${basename(destinationPath)}.${randomUUID()}${stagingSuffix}`)
  let committed = false
  await mkdir(stagingPath)
  try {
    await writeImportMarker(stagingPath, {
      schemaVersion: 1,
      status: "staging",
      importedProjectId: inspected.manifest.projectId,
      importedPackageId: inspected.manifest.packageId,
      localPortableProjectId,
      createdAt: new Date().toISOString(),
    })
    const exchange = await extractPackage(packagePath, stagingPath, inspected, input.signal)
    requireNotCancelled(input.signal)
    if (await pathExists(destinationPath)) throw new Error("package_destination_conflict: destination already exists")
    await rename(stagingPath, destinationPath).catch((error: unknown) => {
      throw new Error(`package_destination_invalid: project directory could not be atomically committed: ${messageOf(error)}`)
    })
    committed = true
    let runtimeProjectId: string | undefined
    try {
      const project = await input.projectFiles.openProject(destinationPath)
      runtimeProjectId = project.id
      await new PortableProjectMetadataStore(input.projectFiles.internal).initialize({
        localProjectId: project.id,
        projectId: localPortableProjectId,
        ...(forkedFromProjectId ? { forkedFromProjectId } : {}),
        overview: inspected.manifest.overview,
      })
      await new ImportedProjectCaseStore(input.projectFiles.internal).import(project.id, exchange.conversations)
      const workbenches = await input.workbenches.importPortableWorkbenches(project.id, exchange.workbenches, exportedProjectPaths(inspected.checksums))
      await updateImportMarker(input.projectFiles.internal, project.id, "committed-unregistered")
      await input.catalog.register({
        localProjectId: localPortableProjectId,
        ...(forkedFromProjectId ? { forkedFromProjectId } : {}),
        rootPath: destinationPath,
        displayName,
        source: "imported-package",
        importedProjectId: inspected.manifest.projectId,
        importedPackageId: inspected.manifest.packageId,
      })
      await updateImportMarker(input.projectFiles.internal, project.id, "registered")
      return {
        status: "imported",
        destinationPath,
        runtimeProjectId: project.id,
        localPortableProjectId,
        importedProjectId: inspected.manifest.projectId,
        importedPackageId: inspected.manifest.packageId,
        workbenchDiagnostics: workbenches.diagnostics,
      }
    } catch (error) {
      if (runtimeProjectId) await updateImportMarker(input.projectFiles.internal, runtimeProjectId, "committed-unregistered", messageOf(error)).catch(() => undefined)
      return {
        status: "committed-unregistered",
        destinationPath,
        ...(runtimeProjectId ? { runtimeProjectId } : {}),
        localPortableProjectId,
        importedProjectId: inspected.manifest.projectId,
        importedPackageId: inspected.manifest.packageId,
        failure: messageOf(error),
      }
    }
  } finally {
    if (!committed) await rm(stagingPath, { recursive: true, force: true })
  }
}

export class ImportedProjectCaseStore {
  private readonly internal: ProjectInternalStatePort

  constructor(internal: ProjectInternalStatePort) {
    this.internal = internal
  }

  async import(projectId: string, conversations: readonly PortableConversationV1[]) {
    for (const conversation of conversations) {
      await this.internal.writeFile({
        projectId,
        namespace: caseNamespace,
        key: `cases/${conversation.caseId}.json`,
        content: `${JSON.stringify(conversation, undefined, 2)}\n`,
        expectedModifiedAt: null,
      })
    }
  }

  async list(projectId: string) {
    const directory = await this.internal.listDirectory(projectId, caseNamespace, "cases")
    if (!directory) return []
    return Promise.all(directory.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map(async (entry) => {
      const record = await this.internal.readFile(projectId, caseNamespace, entry.relativePath)
      if (!record) throw new Error(`package_case_invalid: imported case disappeared: ${entry.relativePath}`)
      return parseConversation(parseJson(record.bytes, entry.relativePath), undefined)
    }))
  }
}

export async function cleanupPortableProjectImportStaging(parentInput: string, options: { now?: Date; minimumAgeMs?: number } = {}) {
  const parent = await requireRealDirectory(parentInput)
  const now = options.now ?? new Date()
  const minimumAgeMs = options.minimumAgeMs ?? 24 * 60 * 60 * 1000
  if (!Number.isSafeInteger(minimumAgeMs) || minimumAgeMs < 0) throw new Error("package_cleanup_invalid: minimumAgeMs is invalid")
  const entries = await readdir(parent, { withFileTypes: true })
  const removed: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith(".") || !entry.name.endsWith(stagingSuffix)) continue
    const path = resolve(parent, entry.name)
    requireChild(parent, path)
    const marker = join(path, markerRelativePath)
    const info = await lstat(marker).catch(() => undefined)
    if (!info?.isFile() || info.isSymbolicLink() || info.size > NP_PACKAGE_LIMITS.maxOverviewFieldBytes || now.getTime() - info.mtimeMs < minimumAgeMs) continue
    const value = parseJson(new Uint8Array(await readFileHandle(marker)), "import staging marker")
    if (!isPlainRecord(value) || value.schemaVersion !== 1 || value.status !== "staging") continue
    await rm(path, { recursive: true })
    removed.push(path)
  }
  return removed.sort(compareText)
}

async function inspectPackage(path: string, signal?: AbortSignal): Promise<InspectedPackage> {
  const entries = await readCentralDirectory(path, signal)
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json")
  const checksumsEntry = entries.find((entry) => entry.name === "checksums.json")
  if (!manifestEntry || !checksumsEntry) throw new Error("package_invalid: manifest.json and checksums.json are required")
  const checksums = parsePortableChecksumsV1(parseJson(await readStructuredEntry(path, checksumsEntry, signal), "checksums.json"))
  const manifest = parsePortableManifestV1(parseJson(await readStructuredEntry(path, manifestEntry, signal), "manifest.json"), checksums)
  requireArchiveMatchesProjection(entries, checksums)
  return { manifest, checksums, entries }
}

async function readCentralDirectory(path: string, signal?: AbortSignal) {
  const file = await open(path, "r")
  try {
    const size = (await file.stat()).size
    const tailBytes = Math.min(size, 65_557)
    const tail = await readExactly(file, size - tailBytes, tailBytes)
    const endOffset = findEndRecord(tail)
    const disk = tail.readUInt16LE(endOffset + 4)
    const centralDisk = tail.readUInt16LE(endOffset + 6)
    const diskEntries = tail.readUInt16LE(endOffset + 8)
    const entryCount = tail.readUInt16LE(endOffset + 10)
    const centralBytes = tail.readUInt32LE(endOffset + 12)
    const centralOffset = tail.readUInt32LE(endOffset + 16)
    const commentBytes = tail.readUInt16LE(endOffset + 20)
    if (entryCount > NP_PACKAGE_LIMITS.maxEntries + 5) throw new Error("package_size_invalid: ZIP entry count exceeds the V1 limit")
    if (disk || centralDisk || diskEntries !== entryCount || commentBytes !== tail.byteLength - endOffset - 22 || centralOffset + centralBytes !== size - tailBytes + endOffset) {
      throw new Error("package_invalid: ZIP central directory is invalid or uses unsupported ZIP64")
    }
    const entries: CentralEntry[] = []
    const identities = new Set<string>()
    let offset = centralOffset
    for (let index = 0; index < entryCount; index += 1) {
      requireNotCancelled(signal)
      const header = await readExactly(file, offset, 46)
      if (header.readUInt32LE(0) !== 0x02014b50) throw new Error("package_invalid: ZIP central entry is invalid")
      const versionMadeBy = header.readUInt16LE(4)
      const flags = header.readUInt16LE(8)
      const method = header.readUInt16LE(10)
      const compressedBytes = header.readUInt32LE(20)
      const uncompressedBytes = header.readUInt32LE(24)
      const nameBytes = header.readUInt16LE(28)
      const extraBytes = header.readUInt16LE(30)
      const commentLength = header.readUInt16LE(32)
      const externalAttributes = header.readUInt32LE(38)
      const localOffset = header.readUInt32LE(42)
      if (flags & 1) throw new Error("package_encryption_unsupported: encrypted ZIP entries are not supported")
      if ((method !== 0 && method !== 8) || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset >= centralOffset) throw new Error("package_invalid: ZIP entry uses unsupported features")
      const name = decodeZipName(await readExactly(file, offset + 46, nameBytes), flags)
      const canonical = requireArchivePath(name)
      const identity = archiveIdentity(canonical)
      if (identities.has(identity)) throw new Error(`package_path_duplicate: ${name}`)
      identities.add(identity)
      requireRegularZipType(versionMadeBy, externalAttributes, name)
      if (uncompressedBytes > NP_PACKAGE_LIMITS.maxEntryBytes) throw new Error(`package_size_invalid: ${name} exceeds the V1 entry limit`)
      if (uncompressedBytes && (!compressedBytes || uncompressedBytes / compressedBytes > NP_PACKAGE_LIMITS.maxCompressionRatio)) throw new Error(`package_compression_invalid: ${name} exceeds the safe compression ratio`)
      const local = await readLocalEntry(file, localOffset, name, flags, method, compressedBytes, centralOffset)
      entries.push({ name, identity, method: method as 0 | 8, compressedBytes, uncompressedBytes, dataOffset: local.dataOffset, localOffset, directory: name.endsWith("/") })
      offset += 46 + nameBytes + extraBytes + commentLength
    }
    if (offset !== centralOffset + centralBytes) throw new Error("package_invalid: ZIP central directory length is invalid")
    const regions = [...entries].sort((left, right) => left.localOffset - right.localOffset)
    for (let index = 1; index < regions.length; index += 1) {
      const previous = regions[index - 1]!
      if (regions[index]!.localOffset < previous.dataOffset + previous.compressedBytes) throw new Error("package_invalid: ZIP local entries overlap")
    }
    return entries
  } finally {
    await file.close()
  }
}

async function readLocalEntry(file: FileHandle, localOffset: number, expectedName: string, expectedFlags: number, expectedMethod: number, compressedBytes: number, centralOffset: number) {
  const header = await readExactly(file, localOffset, 30)
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("package_invalid: ZIP local entry is invalid")
  const flags = header.readUInt16LE(6)
  const method = header.readUInt16LE(8)
  const nameBytes = header.readUInt16LE(26)
  const extraBytes = header.readUInt16LE(28)
  if (flags !== expectedFlags || method !== expectedMethod || flags & 1) throw new Error("package_invalid: ZIP local and central entry flags do not match")
  const name = decodeZipName(await readExactly(file, localOffset + 30, nameBytes), flags)
  if (name !== expectedName) throw new Error("package_invalid: ZIP local and central entry names do not match")
  const dataOffset = localOffset + 30 + nameBytes + extraBytes
  if (dataOffset + compressedBytes > centralOffset) throw new Error("package_invalid: ZIP entry data overlaps the central directory")
  return { dataOffset }
}

function requireRegularZipType(versionMadeBy: number, externalAttributes: number, name: string) {
  if ((externalAttributes & 0x400) !== 0) throw new Error(`package_link_unsupported: ${name}`)
  const directory = name.endsWith("/")
  const dosDirectory = (externalAttributes & 0x10) !== 0
  if (dosDirectory && !directory) throw new Error(`package_invalid: ZIP directory attributes do not match ${name}`)
  if ((versionMadeBy >>> 8) !== 3) return
  const type = (externalAttributes >>> 16) & 0o170000
  if (!type || (!directory && type === 0o100000) || (directory && type === 0o040000)) return
  throw new Error(`package_link_unsupported: ${name}`)
}

function requireArchiveMatchesProjection(entries: CentralEntry[], checksums: PortableChecksumsV1) {
  const byIdentity = new Map(entries.map((entry) => [entry.identity, entry]))
  const expected = new Set([
    ...requiredRoots.map(archiveIdentity),
    ...checksums.directories.map((path) => archiveIdentity(`${path}/`)),
    ...checksums.entries.map((entry) => archiveIdentity(entry.path)),
    archiveIdentity("checksums.json"),
    archiveIdentity("manifest.json"),
  ])
  if (expected.size !== entries.length || entries.some((entry) => !expected.has(entry.identity))) throw new Error("package_invalid: ZIP entries do not match checksums")
  for (const checksum of checksums.entries) {
    const entry = byIdentity.get(archiveIdentity(checksum.path))
    if (!entry || entry.directory || entry.uncompressedBytes !== checksum.bytes) throw new Error(`package_checksum_invalid: ${checksum.path} metadata does not match`)
  }
  for (const directory of [...requiredRoots, ...checksums.directories.map((path) => `${path}/`)]) {
    const entry = byIdentity.get(archiveIdentity(directory))
    if (!entry?.directory || entry.uncompressedBytes) throw new Error(`package_invalid: missing directory ${directory}`)
  }
}

async function readStructuredEntry(path: string, entry: CentralEntry, signal?: AbortSignal) {
  requireNotCancelled(signal)
  if (entry.uncompressedBytes > NP_PACKAGE_LIMITS.maxStructuredRecordBytes) throw new Error(`package_size_invalid: ${entry.name} exceeds the structured record limit`)
  const file = await open(path, "r")
  try {
    const compressed = await readExactly(file, entry.dataOffset, entry.compressedBytes)
    requireNotCancelled(signal)
    const value = entry.method === 0 ? compressed : Buffer.from(inflateSync(compressed))
    if (value.byteLength !== entry.uncompressedBytes) throw new Error(`package_invalid: ${entry.name} decompressed size does not match`)
    return new Uint8Array(value)
  } finally {
    await file.close()
  }
}

async function extractPackage(path: string, stagingPath: string, inspected: InspectedPackage, signal?: AbortSignal): Promise<ExtractedExchange> {
  const expected = new Map(inspected.checksums.entries.map((entry) => [archiveIdentity(entry.path), entry]))
  const central = new Map(inspected.entries.map((entry) => [entry.identity, entry]))
  const started: Promise<void>[] = []
  const completed: Promise<void>[] = []
  const exchange = new Map<string, Uint8Array>()
  let failure: Error | undefined
  let extractedBytes = 0
  let awaitedStarts = 0
  const active = new Set<UnzipFile>()
  const unzip = new Unzip((file) => {
    active.add(file)
    const entry = central.get(archiveIdentity(file.name))
    if (!entry) {
      failure = new Error(`package_invalid: unexpected local entry ${file.name}`)
      return
    }
    const start = startExtractedEntry(file, entry, expected.get(entry.identity), stagingPath, signal, (bytes) => {
      extractedBytes += bytes
      if (!Number.isSafeInteger(extractedBytes) || extractedBytes > NP_PACKAGE_LIMITS.maxTotalBytes) throw new Error("package_size_invalid: extracted bytes exceed the V1 limit")
    }, exchange, () => active.delete(file))
    started.push(start.started.catch((error: unknown) => { failure = asError(error) }))
    completed.push(start.completed.catch((error: unknown) => { failure = asError(error) }))
  })
  unzip.register(UnzipInflate)
  try {
    for await (const chunk of createReadStream(path, { highWaterMark: archiveChunkBytes })) {
      requireNotCancelled(signal)
      unzip.push(chunk, false)
      await Promise.all(started.slice(awaitedStarts))
      awaitedStarts = started.length
      if (failure) throw failure
    }
    unzip.push(new Uint8Array(), true)
    await Promise.all(started)
    await Promise.all(completed)
    if (failure) throw failure
  } catch (error) {
    for (const file of active) file.terminate()
    await Promise.allSettled(started)
    await Promise.allSettled(completed)
    throw error
  }
  const conversations = inspected.checksums.entries.filter((entry) => entry.path.startsWith("conversations/")).map((entry) => {
    const value = exchange.get(archiveIdentity(entry.path))
    if (!value) throw new Error(`package_case_invalid: missing ${entry.path}`)
    try {
      return parseConversation(parseJson(value, entry.path), exportedFileSet(inspected.checksums), basename(entry.path, ".json"))
    } catch (error) {
      throw new Error(`package_case_invalid: ${entry.path}: ${messageOf(error)}`)
    }
  })
  const workbenches = inspected.checksums.entries.filter((entry) => entry.path.startsWith("workbenches/")).map((entry) => {
    const value = exchange.get(archiveIdentity(entry.path))
    if (!value) return { invalidPortableWorkbench: entry.path }
    try {
      return parseJson(value, entry.path)
    } catch {
      return { invalidPortableWorkbench: entry.path }
    }
  })
  return { conversations, workbenches }
}

function startExtractedEntry(file: UnzipFile, entry: CentralEntry, checksum: PortableChecksumEntryV1 | undefined, stagingPath: string, signal: AbortSignal | undefined, addBytes: (bytes: number) => void, exchange: Map<string, Uint8Array>, onSettled: () => void) {
  let resolveCompleted!: () => void
  let rejectCompleted!: (error: unknown) => void
  const completed = new Promise<void>((resolveValue, rejectValue) => {
    resolveCompleted = () => {
      onSettled()
      resolveValue()
    }
    rejectCompleted = (error) => {
      onSettled()
      rejectValue(error)
    }
  })
  const started = (async () => {
    if (entry.directory && entry.name.startsWith("files/") && entry.name !== "files/") {
      await mkdir(projectOutputPath(stagingPath, entry.name.slice("files/".length, -1)), { recursive: true })
    }
    const outputPath = entry.name.startsWith("files/") && !entry.directory ? projectOutputPath(stagingPath, entry.name.slice("files/".length)) : undefined
    const handle = outputPath ? await createOutputFile(outputPath) : undefined
    const chunks: Uint8Array[] = []
    const hash = createHash("sha256")
    let bytes = 0
    let writeTail = Promise.resolve()
    file.ondata = (error, chunk, final) => {
      if (error) {
        rejectCompleted(error)
        return
      }
      try {
        requireNotCancelled(signal)
        bytes += chunk.byteLength
        if (bytes > entry.uncompressedBytes || bytes > NP_PACKAGE_LIMITS.maxEntryBytes) throw new Error(`package_size_invalid: ${entry.name} exceeds its declared size`)
        if (checksum) addBytes(chunk.byteLength)
        hash.update(chunk)
        if (handle && chunk.byteLength) writeTail = writeTail.then(() => writeAll(handle, chunk))
        if ((entry.name.startsWith("conversations/") || entry.name.startsWith("workbenches/")) && chunk.byteLength) {
          if (bytes > NP_PACKAGE_LIMITS.maxStructuredRecordBytes) throw new Error(`package_size_invalid: ${entry.name} exceeds the structured record limit`)
          chunks.push(chunk.slice())
        }
        if (!final) return
        writeTail.then(async () => {
          await handle?.sync()
          await handle?.close()
          if (bytes !== entry.uncompressedBytes) throw new Error(`package_invalid: ${entry.name} extracted size does not match`)
          if (checksum && hash.digest("hex") !== checksum.sha256) throw new Error(`package_checksum_invalid: ${entry.name}`)
          if (entry.name.startsWith("conversations/") || entry.name.startsWith("workbenches/")) exchange.set(entry.identity, Buffer.concat(chunks))
          resolveCompleted()
        }).catch(rejectCompleted)
      } catch (caught) {
        writeTail.then(() => handle?.close()).then(() => rejectCompleted(caught), () => rejectCompleted(caught))
      }
    }
    file.start()
  })()
  return { started, completed }
}

async function createOutputFile(path: string) {
  await mkdir(dirname(path), { recursive: true })
  return open(path, "wx")
}

function parseConversation(value: unknown, exportedFiles?: ReadonlySet<string>, expectedCaseId?: string): PortableConversationV1 {
  const record = requireRecord(value, "conversation")
  requireKeys(record, new Set(["schemaVersion", "caseId", "title", "purpose", "conclusion", "continuationBrief", "items"]), "conversation")
  if (record.schemaVersion !== 1 || !Array.isArray(record.items)) throw new Error("package_case_invalid: conversation schema is invalid")
  const caseId = requireExchangeId(record.caseId, "caseId")
  if (expectedCaseId && caseId !== expectedCaseId) throw new Error("package_case_invalid: conversation caseId does not match its path")
  const items = record.items.map((item, index) => parseConversationItem(item, exportedFiles, index))
  if (!items.some((item) => item.kind === "message" && item.role === "user") || !items.some((item) => item.kind === "message" && item.role === "assistant")) throw new Error("package_case_invalid: conversation requires a visible user and Assistant message")
  return {
    schemaVersion: 1,
    caseId,
    title: requireText(record.title, "title"),
    purpose: requireText(record.purpose, "purpose"),
    conclusion: requireText(record.conclusion, "conclusion"),
    continuationBrief: requireText(record.continuationBrief, "continuationBrief"),
    items,
  }
}

function parseConversationItem(value: unknown, exportedFiles: ReadonlySet<string> | undefined, index: number): PortableConversationItemV1 {
  const record = requireRecord(value, `items[${index}]`)
  const references = parseFileReferences(record.fileReferences, exportedFiles)
  if (record.kind === "message") {
    requireKeys(record, new Set(["kind", "role", "text", "fileReferences"]), `items[${index}]`)
    if (record.role !== "user" && record.role !== "assistant") throw new Error("package_case_invalid: message role is invalid")
    return { kind: "message", role: record.role, text: requireText(record.text, "message text"), fileReferences: references }
  }
  requireKeys(record, new Set(["kind", "summary", "status", "fileReferences"]), `items[${index}]`)
  if (record.kind !== "tool-activity" || (record.status !== "succeeded" && record.status !== "failed")) throw new Error("package_case_invalid: tool activity is invalid")
  return { kind: "tool-activity", summary: requireText(record.summary, "tool summary"), status: record.status, fileReferences: references }
}

function parseFileReferences(value: unknown, exportedFiles?: ReadonlySet<string>) {
  if (!Array.isArray(value)) throw new Error("package_case_invalid: fileReferences must be an array")
  return value.map((item) => {
    const path = requireProjectRelativePath(item)
    if (exportedFiles && !exportedFiles.has(path.toLocaleLowerCase("en-US"))) throw new Error(`package_case_invalid: file reference is not exported: ${path}`)
    return path
  })
}

async function writeImportMarker(root: string, value: unknown) {
  const path = join(root, markerRelativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`, { encoding: "utf8", flag: "wx" })
}

async function updateImportMarker(internal: ProjectInternalStatePort, projectId: string, status: "committed-unregistered" | "registered", failure?: string) {
  const existing = await internal.readFile(projectId, caseNamespace, "import-state.v1.json")
  if (!existing) throw new Error("package_import_recovery: import marker is missing")
  const value = requireRecord(parseJson(existing.bytes, "import-state.v1.json"), "import marker")
  await internal.writeFile({
    projectId,
    namespace: caseNamespace,
    key: "import-state.v1.json",
    content: `${JSON.stringify({ ...value, status, ...(failure ? { failure } : {}), updatedAt: new Date().toISOString() }, undefined, 2)}\n`,
    expectedModifiedAt: existing.modifiedAt,
  })
}

async function requirePackagePath(value: string) {
  const path = resolve(value)
  if (extname(path).toLocaleLowerCase("en-US") !== ".np") throw new Error("package_extension_invalid: import requires a .np file")
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("package_invalid: project package must be a regular file")
  return path
}

async function requireNewDestination(value: string) {
  if (!value.trim() || !isAbsolute(value)) throw new Error("package_destination_invalid: an absolute new project directory is required")
  const path = resolve(value)
  if (await pathExists(path)) throw new Error("package_destination_conflict: destination already exists")
  await requireRealDirectory(dirname(path))
  return path
}

async function requireRealDirectory(value: string) {
  const path = resolve(value)
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("package_destination_invalid: parent must be a real directory")
  return realpath(path)
}

function requireArchivePath(value: string) {
  if (!value || value !== value.normalize("NFC") || Buffer.byteLength(value) > NP_PACKAGE_LIMITS.maxPathBytes || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("package_path_invalid: ZIP entry name is not canonical")
  const path = value.endsWith("/") ? value.slice(0, -1) : value
  const segments = path.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`package_path_invalid: ${value}`)
  if (segments.length === 1 && value !== "manifest.json" && value !== "checksums.json" && !requiredRoots.includes(value as typeof requiredRoots[number])) throw new Error(`package_path_invalid: ${value}`)
  if (segments.length > 1 && !requiredRoots.some((root) => segments[0] === root.slice(0, -1))) throw new Error(`package_path_invalid: ${value}`)
  if (segments.length > 1) parsePortablePackagePath(path)
  return value
}

function projectOutputPath(root: string, relativePath: string) {
  const path = resolve(root, ...relativePath.split("/"))
  requireChild(root, path)
  return path
}

function requireChild(root: string, path: string) {
  const relation = relative(root, path)
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("package_path_invalid: path escapes the controlled directory")
}

function exportedProjectPaths(checksums: PortableChecksumsV1) {
  return [...checksums.directories, ...checksums.entries.filter((entry) => entry.path.startsWith("files/")).map((entry) => entry.path)].map((path) => path.slice("files/".length))
}

function exportedFileSet(checksums: PortableChecksumsV1) {
  return new Set(checksums.entries.filter((entry) => entry.path.startsWith("files/")).map((entry) => entry.path.slice("files/".length).toLocaleLowerCase("en-US")))
}

function requireProjectRelativePath(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/u.test(value)) throw new Error("package_case_invalid: file reference is not canonical")
  if (value.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("package_case_invalid: file reference is not canonical")
  return value
}

function requireDisplayName(value: string) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value.trim()) > 256) throw new Error("package_destination_invalid: displayName is invalid")
  return value.trim()
}

function requireExchangeId(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value)) throw new Error(`package_case_invalid: ${name} is invalid`)
  return value
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || Buffer.byteLength(value) > NP_PACKAGE_LIMITS.maxStructuredRecordBytes) throw new Error(`package_case_invalid: ${name} is invalid`)
  return value
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`package_invalid: ${name} must be a plain object`)
  return value
}

function requireKeys(record: Record<string, unknown>, keys: Set<string>, name: string) {
  if (Object.keys(record).some((key) => !keys.has(key)) || [...keys].some((key) => !(key in record))) throw new Error(`package_case_invalid: ${name} schema is invalid`)
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (error) {
    throw new Error(`package_invalid: ${name} is not valid UTF-8 JSON: ${messageOf(error)}`)
  }
}

function decodeZipName(bytes: Buffer, flags: number) {
  try {
    return new TextDecoder(flags & 0x800 ? "utf-8" : "windows-1252", { fatal: true }).decode(bytes)
  } catch (error) {
    throw new Error(`package_path_invalid: ZIP entry name is invalid: ${messageOf(error)}`)
  }
}

async function writeAll(file: FileHandle, bytes: Uint8Array) {
  let offset = 0
  while (offset < bytes.byteLength) {
    const written = await file.write(bytes, offset, bytes.byteLength - offset)
    if (!written.bytesWritten) throw new Error("package_write_failed: ZIP extraction made no write progress")
    offset += written.bytesWritten
  }
}

async function readExactly(file: FileHandle, position: number, bytes: number) {
  if (position < 0 || bytes < 0) throw new Error("package_invalid: ZIP offset is invalid")
  const buffer = Buffer.alloc(bytes)
  let offset = 0
  while (offset < bytes) {
    const read = await file.read(buffer, offset, bytes - offset, position + offset)
    if (!read.bytesRead) throw new Error("package_invalid: ZIP file ended unexpectedly")
    offset += read.bytesRead
  }
  return buffer
}

async function readFileHandle(path: string) {
  const file = await open(path, "r")
  try {
    return await readExactly(file, 0, (await file.stat()).size)
  } finally {
    await file.close()
  }
}

function findEndRecord(tail: Buffer) {
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) if (tail.readUInt32LE(offset) === 0x06054b50) return offset
  throw new Error("package_invalid: ZIP end record is missing")
}

function archiveIdentity(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("en-US")
}

function requireNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("package_import_cancelled: import was cancelled")
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value))
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : String(value)
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}
