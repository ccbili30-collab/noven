import { createHash, randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { link, lstat, mkdir, readdir, readFile, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { FilePreview, ProjectFile, ProjectFileKind, ProjectPackageExclusionProjection, ProjectSnapshot } from "@creatx/contracts"

const ignoredDirectories = new Set([".git", ".creatx", "node_modules"])
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
const textExtensions = new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml", ".csv"])
const MAX_PARALLEL_FILE_OPERATIONS = 8
const CREATX_TEMPORARY_SUFFIX = ".creatx-tmp"

export function appendProjectRevisionContext(prompt: string, context: string | undefined) {
  if (!context?.trim()) return prompt
  return `${prompt}\n<mode_notice>${context.trim()}</mode_notice>`
}

export interface ProjectFileWriteRequest {
  projectId: string
  relativePath: string
  content: string | Uint8Array
  expectedModifiedAt?: string | null
}

export type ProjectDirectoryVisibility = "content" | "internal"

export interface ProjectDirectoryEntry {
  kind: "directory" | "file"
  name: string
  relativePath: string
  fileId?: string
  modifiedAt?: string
}

export interface ProjectDirectorySnapshot {
  relativePath: string
  entries: ProjectDirectoryEntry[]
}

export interface ProjectFileMutation {
  file: ProjectFile
  created: boolean
  previousModifiedAt?: string
}

export interface ProjectFileQueryPort {
  refreshProject(projectId: string): Promise<ProjectSnapshot>
  readFile(projectId: string, fileId: string): Promise<FilePreview>
  readBytes(projectId: string, relativePath: string): Promise<Uint8Array>
  listDirectory(projectId: string, relativePath: string, visibility: ProjectDirectoryVisibility): Promise<ProjectDirectorySnapshot | undefined>
}

export interface PortableProjectFileQueryPort {
  portableEntries(projectId: string): Promise<PortableProjectSnapshot>
  readPortableFile(projectId: string, entry: PortableProjectFileEntry): Promise<Uint8Array>
}

export type PortableProjectExclusionReason = ProjectPackageExclusionProjection["reason"]

export type PortableProjectEntry = PortableProjectDirectoryEntry | PortableProjectFileEntry

export interface PortableProjectDirectoryEntry {
  kind: "directory"
  relativePath: string
  bytes: 0
  modifiedAt: string
}

export interface PortableProjectFileEntry {
  kind: "file"
  relativePath: string
  bytes: number
  modifiedAt: string
}

export interface PortableProjectExclusion {
  relativePath: string
  reason: PortableProjectExclusionReason
  bytes?: number
}

export interface PortableProjectSnapshot {
  entries: PortableProjectEntry[]
  exclusions: {
    entries: PortableProjectExclusion[]
    knownBytes: number
    unscannedItems: number
  }
}

export interface ProjectFileCommandPort {
  writeFile(request: ProjectFileWriteRequest): Promise<ProjectFileMutation>
}

export interface ProjectInternalStateRecord {
  key: string
  bytes: Uint8Array
  modifiedAt: string
}

export interface ProjectInternalStateWriteRequest {
  projectId: string
  namespace: string
  key: string
  content: string | Uint8Array
  expectedModifiedAt?: string | null
}

export interface ProjectInternalStateDeleteRequest {
  projectId: string
  namespace: string
  key: string
  expectedModifiedAt: string
}

export interface ProjectInternalStatePort {
  readFile(projectId: string, namespace: string, key: string): Promise<ProjectInternalStateRecord | undefined>
  listDirectory(projectId: string, namespace: string, directory: string): Promise<ProjectDirectorySnapshot | undefined>
  writeFile(request: ProjectInternalStateWriteRequest): Promise<ProjectInternalStateRecord>
  deleteFile(request: ProjectInternalStateDeleteRequest): Promise<void>
  moveContentFileToBackup(projectId: string, relativePath: string, namespace: string, backupKey: string, expectedSha256: string): Promise<void>
}

export interface ProjectFileServiceOptions {
  onContentChanged?: (projectId: string) => void
}

export interface SaveProjectTextRequest {
  projectId: string
  fileId: string
  content: string
  expectedModifiedAt: string
}

export class ProjectFileService {
  private readonly roots = new Map<string, string>()
  private readonly fileOperation = createFileOperationGate()
  private readonly revisionQueues = new Map<string, Promise<void>>()

  constructor(private readonly options: ProjectFileServiceOptions = {}) {}

  readonly queries: ProjectFileQueryPort & PortableProjectFileQueryPort = {
    refreshProject: async (projectId) => scanResolvedProject(this.projectRoot(projectId), this.fileOperation),
    readFile: async (projectId, fileId) => readResolvedProjectFile(this.projectRoot(projectId), fileId, this.fileOperation),
    readBytes: async (projectId, relativePath) => this.fileOperation(() => readProjectBytes(this.projectRoot(projectId), requireContentPath(relativePath))),
    listDirectory: async (projectId, relativePath, visibility) => listProjectDirectory(this.projectRoot(projectId), relativePath, visibility, this.fileOperation),
    portableEntries: async (projectId) => collectPortableProject(this.projectRoot(projectId), this.fileOperation),
    readPortableFile: async (projectId, entry) => this.fileOperation(() => readPortableProjectFile(this.projectRoot(projectId), entry)),
  }

  readonly commands: ProjectFileCommandPort = {
    writeFile: async (request) => {
      const result = await this.fileOperation(() => writeProjectFile(this.projectRoot(request.projectId), { ...request, relativePath: requireContentPath(request.relativePath) }))
      await this.recordProjectRevision(request.projectId, result.file.relativePath, "agent", result.created ? "created" : "updated", request.content)
      this.options.onContentChanged?.(request.projectId)
      return result
    },
  }

  readonly internal: ProjectInternalStatePort = {
    readFile: async (projectId, namespace, key) => this.fileOperation(() => readInternalStateFile(this.projectRoot(projectId), namespace, key)),
    listDirectory: async (projectId, namespace, directory) => listInternalStateDirectory(this.projectRoot(projectId), namespace, directory, this.fileOperation),
    writeFile: async (request) => this.fileOperation(() => writeInternalStateFile(this.projectRoot(request.projectId), request)),
    deleteFile: async (request) => this.fileOperation(() => deleteInternalStateFile(this.projectRoot(request.projectId), request)),
    moveContentFileToBackup: async (projectId, relativePath, namespace, backupKey, expectedSha256) => {
      await this.fileOperation(() => moveContentFileToInternalBackup(this.projectRoot(projectId), relativePath, namespace, backupKey, expectedSha256))
      this.options.onContentChanged?.(projectId)
    },
  }

  async openProject(inputRoot: string) {
    const root = await this.fileOperation(() => requireProjectRoot(inputRoot))
    const project = await scanResolvedProject(root, this.fileOperation)
    this.roots.set(projectId(root), root)
    return project
  }

  async saveTextFile(request: SaveProjectTextRequest) {
    const project = await this.queries.refreshProject(request.projectId)
    const file = project.files.find((candidate) => candidate.id === request.fileId)
    if (!file) throw new Error("file_invalid: file identity does not belong to the current project")
    if (file.kind !== "markdown" && file.kind !== "text") throw new Error("file_invalid: only text files can be edited")
    const result = await this.fileOperation(() => writeProjectFile(this.projectRoot(request.projectId), {
      projectId: request.projectId,
      relativePath: file.relativePath,
      content: request.content,
      expectedModifiedAt: request.expectedModifiedAt,
    }))
    await this.recordProjectRevision(request.projectId, result.file.relativePath, "user", "updated", request.content)
    this.options.onContentChanged?.(request.projectId)
    return this.queries.readFile(request.projectId, request.fileId)
  }

  async projectRevisionContext(projectId: string) {
    const record = await this.internal.readFile(projectId, "project-revisions", "state.json")
    if (!record) return undefined
    const state = decodeProjectRevisionState(new TextDecoder().decode(record.bytes))
    const changes = state.changes.slice(-20).map((change) => `- v${change.revision} ${change.origin === "user" ? "用户" : "AI"}${change.operation === "created" ? "创建" : "修改"}：${change.relativePath}`)
    return `项目版本 ${state.revision}。以下是真实文件最近的变更索引；继续工作前应读取相关文件的当前内容，不要依赖旧对话中的副本：\n${changes.join("\n")}`
  }

  rememberProjectRoot(root: string) {
    if (!root.trim() || !isAbsolute(root)) throw new Error("project_invalid: an absolute project directory is required")
    const normalized = resolve(root)
    const id = projectId(normalized)
    this.roots.set(id, normalized)
    return id
  }

  projectRoot(projectId: string) {
    const root = this.roots.get(projectId)
    if (!root) throw new Error("project_invalid: unknown project identity")
    return root
  }

  private async recordProjectRevision(projectId: string, relativePath: string, origin: "user" | "agent", operation: "created" | "updated", content: string | Uint8Array) {
    const previous = this.revisionQueues.get(projectId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const record = await this.internal.readFile(projectId, "project-revisions", "state.json")
      const state = record ? decodeProjectRevisionState(new TextDecoder().decode(record.bytes)) : { schemaVersion: 1 as const, revision: 0, changes: [] }
      const revision = state.revision + 1
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content
      const next = {
        schemaVersion: 1 as const,
        revision,
        changes: [...state.changes, { revision, origin, operation, relativePath, changedAt: new Date().toISOString(), sha256: createHash("sha256").update(bytes).digest("hex") }].slice(-100),
      }
      await this.internal.writeFile({ projectId, namespace: "project-revisions", key: "state.json", content: `${JSON.stringify(next, undefined, 2)}\n`, ...(record ? { expectedModifiedAt: record.modifiedAt } : { expectedModifiedAt: null }) })
    })
    this.revisionQueues.set(projectId, current)
    try {
      await current
    } finally {
      if (this.revisionQueues.get(projectId) === current) this.revisionQueues.delete(projectId)
    }
  }
}

interface ProjectRevisionState {
  schemaVersion: 1
  revision: number
  changes: Array<{
    revision: number
    origin: "user" | "agent"
    operation: "created" | "updated"
    relativePath: string
    changedAt: string
    sha256: string
  }>
}

function decodeProjectRevisionState(content: string): ProjectRevisionState {
  const value = JSON.parse(content) as Partial<ProjectRevisionState>
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision! < 0 || !Array.isArray(value.changes)) throw new Error("file_invalid: project revision state is invalid")
  return value as ProjectRevisionState
}

export async function scanProject(inputRoot: string): Promise<ProjectSnapshot> {
  const fileOperation = createFileOperationGate()
  const root = await fileOperation(() => requireProjectRoot(inputRoot))
  return scanResolvedProject(root, fileOperation)
}

async function scanResolvedProject(root: string, fileOperation: FileOperationGate): Promise<ProjectSnapshot> {
  const files = await collectFiles(root, root, fileOperation)
  return {
    id: projectId(root),
    name: basename(root),
    displayPath: root,
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN")),
    refreshedAt: new Date().toISOString(),
  }
}

export async function readProjectFile(inputRoot: string, fileId: string): Promise<FilePreview> {
  const fileOperation = createFileOperationGate()
  const root = await fileOperation(() => requireProjectRoot(inputRoot))
  return readResolvedProjectFile(root, fileId, fileOperation)
}

async function readResolvedProjectFile(root: string, fileId: string, fileOperation: FileOperationGate): Promise<FilePreview> {
  const project = await scanResolvedProject(root, fileOperation)
  const file = project.files.find((item) => item.id === fileId)
  if (!file) throw new Error("file_invalid: file does not belong to the current project")
  if (file.kind === "other" || file.kind === "html") return { file }
  const bytes = await fileOperation(() => readProjectBytes(project.displayPath, file.relativePath))
  if (file.kind === "image") {
    return { file, dataUrl: `data:${imageMime(file.relativePath)};base64,${Buffer.from(bytes).toString("base64")}` }
  }
  return { file, content: Buffer.from(bytes).toString("utf8") }
}

export function projectId(root: string): string {
  return createHash("sha256").update(normalizeWindowsIdentity(root)).digest("hex").slice(0, 20)
}

function normalizeWindowsIdentity(path: string) {
  return resolve(path).replaceAll("/", "\\").toLocaleLowerCase("en-US")
}

async function requireProjectRoot(inputRoot: string) {
  if (!inputRoot.trim() || !isAbsolute(inputRoot)) throw new Error("project_invalid: an absolute project directory is required")
  const root = await realpath(inputRoot)
  if (!(await stat(root)).isDirectory()) throw new Error("project_invalid: project root is not a directory")
  return root
}

function requireChildPath(root: string, relativePath: string) {
  if (!relativePath.trim() || isAbsolute(relativePath)) throw new Error("file_invalid: a project-relative file path is required")
  const path = resolve(root, relativePath)
  const relation = relative(root, path)
  if (!relation || relation.startsWith(`..${sep}`) || relation === ".." || isAbsolute(relation)) {
    throw new Error("file_invalid: path escapes the project root")
  }
  return path
}

async function readProjectBytes(root: string, relativePath: string) {
  const path = requireChildPath(root, relativePath)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error("file_invalid: file does not exist")
    throw error
  })
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("file_invalid: path is not a regular project file")
  const real = await realpath(path)
  requirePathInsideRoot(root, real)
  return new Uint8Array(await readFile(real))
}

async function writeProjectFile(root: string, request: ProjectFileWriteRequest): Promise<ProjectFileMutation> {
  const path = await requireWritableChildPath(root, request.relativePath)
  const existing = await stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (existing && !existing.isFile()) throw new Error("file_invalid: target is not a regular file")
  const previousModifiedAt = existing?.mtime.toISOString()
  if (request.expectedModifiedAt === null && existing) {
    throw new Error("file_conflict: project file already exists")
  }
  if (request.expectedModifiedAt !== undefined && request.expectedModifiedAt !== null && previousModifiedAt !== request.expectedModifiedAt) {
    throw new Error("file_conflict: project file changed after it was read")
  }

  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.creatx-tmp`)
  try {
    await writeFile(temporaryPath, request.content)
    if (request.expectedModifiedAt === null) {
      await link(temporaryPath, path).catch((error: unknown) => {
        if (isAlreadyExists(error)) throw new Error("file_conflict: project file already exists")
        throw error
      })
    } else {
      await rename(temporaryPath, path)
    }
  } finally {
    await rm(temporaryPath, { force: true })
  }

  return {
    file: await describeProjectFile(root, path),
    created: !existing,
    ...(previousModifiedAt ? { previousModifiedAt } : {}),
  }
}

async function readInternalStateFile(root: string, namespace: string, key: string): Promise<ProjectInternalStateRecord | undefined> {
  const path = internalStatePath(root, namespace, key)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("file_invalid: internal state path is not a regular file")
  requirePathInsideRoot(root, await realpath(path))
  return { key: normalizeInternalKey(key), bytes: new Uint8Array(await readFile(path)), modifiedAt: info.mtime.toISOString() }
}

async function writeInternalStateFile(root: string, request: ProjectInternalStateWriteRequest): Promise<ProjectInternalStateRecord> {
  const key = normalizeInternalKey(request.key)
  const path = internalStatePath(root, request.namespace, key)
  const existing = await stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (existing && !existing.isFile()) throw new Error("file_invalid: internal state target is not a regular file")
  const previousModifiedAt = existing?.mtime.toISOString()
  if (request.expectedModifiedAt === null && existing) throw new Error("file_conflict: internal state file already exists")
  if (request.expectedModifiedAt !== undefined && request.expectedModifiedAt !== null && previousModifiedAt !== request.expectedModifiedAt) {
    throw new Error("file_conflict: internal state file changed after it was read")
  }
  requirePathInsideRoot(root, await realpath(await nearestExistingDirectory(dirname(path))))
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.creatx-tmp`)
  try {
    await writeFile(temporaryPath, request.content)
    if (request.expectedModifiedAt === null) {
      await link(temporaryPath, path).catch((error: unknown) => {
        if (isAlreadyExists(error)) throw new Error("file_conflict: internal state file already exists")
        throw error
      })
    } else {
      await rename(temporaryPath, path)
    }
  } finally {
    await rm(temporaryPath, { force: true })
  }
  return (await readInternalStateFile(root, request.namespace, key))!
}

async function deleteInternalStateFile(root: string, request: ProjectInternalStateDeleteRequest) {
  const key = normalizeInternalKey(request.key)
  const path = internalStatePath(root, request.namespace, key)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (!info) throw new Error("file_conflict: internal state file no longer exists")
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("file_invalid: internal state target is not a regular file")
  requirePathInsideRoot(root, await realpath(path))
  if (info.mtime.toISOString() !== request.expectedModifiedAt) throw new Error("file_conflict: internal state file changed after it was read")
  await rm(path)
}

async function listInternalStateDirectory(root: string, namespace: string, directory: string, fileOperation: FileOperationGate) {
  const normalizedDirectory = directory === "." ? "." : normalizeInternalKey(directory)
  const namespaceRoot = internalNamespaceRoot(root, namespace)
  const path = normalizedDirectory === "." ? namespaceRoot : internalStatePath(root, namespace, normalizedDirectory)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (!info) return undefined
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("file_invalid: internal state path is not a regular directory")
  requirePathInsideRoot(root, await realpath(path))
  const entries = await fileOperation(() => readdir(path, { withFileTypes: true }))
  const projected = await Promise.all(entries.map(async (entry): Promise<ProjectDirectoryEntry | undefined> => {
    if (entry.isSymbolicLink()) return undefined
    const key = normalizedDirectory === "." ? entry.name : `${normalizedDirectory}/${entry.name}`
    if (entry.isDirectory()) return { kind: "directory", name: entry.name, relativePath: key }
    if (!entry.isFile()) return undefined
    const record = await readInternalStateFile(root, namespace, key)
    return record ? { kind: "file", name: entry.name, relativePath: key, modifiedAt: record.modifiedAt } : undefined
  }))
  return { relativePath: normalizedDirectory, entries: projected.filter((entry): entry is ProjectDirectoryEntry => Boolean(entry)).sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN")) }
}

async function moveContentFileToInternalBackup(root: string, relativePath: string, namespace: string, backupKey: string, expectedSha256: string) {
  if (!/^[0-9a-f]{64}$/u.test(expectedSha256)) throw new Error("file_invalid: expected content hash must be SHA-256")
  const source = requireChildPath(root, requireContentPath(relativePath))
  const destination = internalStatePath(root, namespace, backupKey)
  const sourceInfo = await lstat(source).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  const destinationInfo = await lstat(destination).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (sourceInfo) {
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error("file_invalid: migration source is not a regular file")
    if (createHash("sha256").update(await readFile(source)).digest("hex") !== expectedSha256) throw new Error("file_conflict: migration source hash changed")
  }
  if (destinationInfo) {
    if (!destinationInfo.isFile() || destinationInfo.isSymbolicLink()) throw new Error("file_invalid: migration backup is not a regular file")
    if (createHash("sha256").update(await readFile(destination)).digest("hex") !== expectedSha256) throw new Error("file_conflict: migration backup hash differs")
    if (sourceInfo) await rm(source)
    await removeEmptyAncestors(root, dirname(source))
    return
  }
  if (!sourceInfo) throw new Error("file_conflict: migration source and backup are both missing")
  requirePathInsideRoot(root, await realpath(await nearestExistingDirectory(dirname(destination))))
  await mkdir(dirname(destination), { recursive: true })
  await rename(source, destination)
  await removeEmptyAncestors(root, dirname(source))
}

async function removeEmptyAncestors(root: string, start: string) {
  if (start === root) return
  await rmdir(start).catch((error: unknown) => {
    if (isNotFound(error) || (error instanceof Error && "code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST"))) return
    throw error
  })
  const exists = await stat(start).then(() => true).catch((error: unknown) => isNotFound(error) ? false : Promise.reject(error))
  if (!exists) await removeEmptyAncestors(root, dirname(start))
}

function internalStatePath(root: string, namespace: string, key: string) {
  return resolve(internalNamespaceRoot(root, namespace), normalizeInternalKey(key))
}

function internalNamespaceRoot(root: string, namespace: string) {
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(namespace)) throw new Error("file_invalid: internal namespace is invalid")
  return resolve(root, ".creatx", namespace)
}

function normalizeInternalKey(key: string) {
  if (!key.trim() || isAbsolute(key)) throw new Error("file_invalid: internal state key is invalid")
  const segments = key.replaceAll("\\", "/").split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("file_invalid: internal state key is invalid")
  return segments.join("/")
}

function requireContentPath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/")
  if (normalized.split("/")[0]!.toLocaleLowerCase("en-US") === ".creatx") throw new Error("file_invalid: .creatx is reserved for internal state")
  return relativePath
}

async function listProjectDirectory(root: string, relativePath: string, visibility: ProjectDirectoryVisibility, fileOperation: FileOperationGate): Promise<ProjectDirectorySnapshot | undefined> {
  if (relativePath !== ".") requireContentPath(relativePath)
  const path = requireDirectoryPath(root, relativePath)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (!info) return undefined
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("file_invalid: path is not a regular project directory")
  const directory = await realpath(path)
  requirePathInsideRoot(root, directory)

  const entries = await fileOperation(() => readdir(directory, { withFileTypes: true }))
  const projected = await Promise.all(entries.map(async (entry): Promise<ProjectDirectoryEntry | undefined> => {
    if (entry.isSymbolicLink()) return undefined
    if (visibility === "content" && entry.isDirectory() && ignoredDirectories.has(entry.name)) return undefined
    const child = resolve(directory, entry.name)
    const childRelativePath = relative(root, child).split(sep).join("/")
    if (entry.isDirectory()) return { kind: "directory", name: entry.name, relativePath: childRelativePath }
    if (!entry.isFile()) return undefined
    const file = await fileOperation(() => describeProjectFile(root, child))
    return { kind: "file", name: entry.name, relativePath: childRelativePath, fileId: file.id, modifiedAt: file.modifiedAt }
  }))
  return {
    relativePath: relativePath === "." ? "." : relative(root, directory).split(sep).join("/"),
    entries: projected.filter((entry): entry is ProjectDirectoryEntry => entry !== undefined)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN")),
  }
}

function requireDirectoryPath(root: string, relativePath: string) {
  if (relativePath === ".") return root
  if (!relativePath.trim() || isAbsolute(relativePath)) throw new Error("file_invalid: a project-relative directory path is required")
  const segments = relativePath.replaceAll("\\", "/").split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("file_invalid: invalid project directory path")
  }
  return requireChildPath(root, relativePath)
}

async function requireWritableChildPath(root: string, relativePath: string) {
  const path = requireChildPath(root, relativePath)
  const existingTarget = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (existingTarget?.isSymbolicLink()) throw new Error("file_invalid: symbolic-link targets are not writable")
  if (existingTarget) requirePathInsideRoot(root, await realpath(path))

  const ancestor = await nearestExistingDirectory(dirname(path))
  requirePathInsideRoot(root, await realpath(ancestor))
  return path
}

async function nearestExistingDirectory(start: string): Promise<string> {
  const info = await stat(start).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  if (info) {
    if (!info.isDirectory()) throw new Error("file_invalid: parent path is not a directory")
    return start
  }
  const parent = dirname(start)
  if (parent === start) throw new Error("file_invalid: no existing project parent directory")
  return nearestExistingDirectory(parent)
}

function requirePathInsideRoot(root: string, path: string) {
  const relation = relative(root, path)
  if (relation.startsWith(`..${sep}`) || relation === ".." || isAbsolute(relation)) {
    throw new Error("file_invalid: path escapes the project root")
  }
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST"
}

async function collectFiles(root: string, directory: string, fileOperation: FileOperationGate): Promise<ProjectFile[]> {
  const entries = await fileOperation(() => readdir(directory, { withFileTypes: true }))
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.isSymbolicLink()) return []
    if (entry.name.startsWith(".") && entry.name.endsWith(CREATX_TEMPORARY_SUFFIX)) return []
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return []
      return collectFiles(root, resolve(directory, entry.name), fileOperation)
    }
    if (!entry.isFile()) return []
    const path = resolve(directory, entry.name)
    const file = await fileOperation(() => describeProjectFile(root, path).catch((error: unknown) => {
      if (isNotFound(error)) return undefined
      throw error
    }))
    return file ? [file] : []
  }))
  return nested.flat()
}

async function collectPortableProject(root: string, fileOperation: FileOperationGate): Promise<PortableProjectSnapshot> {
  const collected = await collectPortableDirectory(root, root, fileOperation)
  const exclusions = collected.exclusions.sort((left, right) => comparePortablePath(left.relativePath, right.relativePath))
  return {
    entries: collected.entries.sort((left, right) => comparePortablePath(left.relativePath, right.relativePath)),
    exclusions: {
      entries: exclusions,
      knownBytes: exclusions.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      unscannedItems: exclusions.filter((entry) => entry.bytes === undefined).length,
    },
  }
}

async function collectPortableDirectory(root: string, directory: string, fileOperation: FileOperationGate): Promise<{ entries: PortableProjectEntry[]; exclusions: PortableProjectExclusion[] }> {
  const directoryInfo = await fileOperation(() => lstat(directory))
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("package_file_conflict: project directory changed during enumeration")
  const children = await fileOperation(() => readdir(directory, { withFileTypes: true }))
  const collected = await Promise.all(children.map(async (child) => {
    const path = resolve(directory, child.name)
    const relativePath = portableRelativePath(root, path)
    const declaredReason = portableExclusionReason(child)
    if (declaredReason) return { entries: [], exclusions: [await describePortableExclusion(path, relativePath, declaredReason, fileOperation)] }
    const info = await fileOperation(() => lstat(path).catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`package_file_conflict: ${relativePath} changed during enumeration`)
      throw error
    }))
    if (info.isSymbolicLink()) return { entries: [], exclusions: [{ relativePath, reason: "symbolic-link" as const }] }
    if (info.isDirectory()) {
      const nested = await collectPortableDirectory(root, path, fileOperation)
      return {
        entries: [{ kind: "directory" as const, relativePath, bytes: 0 as const, modifiedAt: info.mtime.toISOString() }, ...nested.entries],
        exclusions: nested.exclusions,
      }
    }
    if (!info.isFile()) throw new Error(`package_file_invalid: ${relativePath} is not a regular file or directory`)
    return {
      entries: [{ kind: "file" as const, relativePath, bytes: info.size, modifiedAt: info.mtime.toISOString() }],
      exclusions: [],
    }
  }))
  return {
    entries: collected.flatMap((entry) => entry.entries),
    exclusions: collected.flatMap((entry) => entry.exclusions),
  }
}

async function describePortableExclusion(path: string, relativePath: string, reason: PortableProjectExclusionReason, fileOperation: FileOperationGate): Promise<PortableProjectExclusion> {
  const info = await fileOperation(() => lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error(`package_file_conflict: ${relativePath} changed during enumeration`)
    throw error
  }))
  if (info.isFile() && !info.isSymbolicLink()) return { relativePath, reason, bytes: info.size }
  return { relativePath, reason }
}

async function readPortableProjectFile(root: string, entry: PortableProjectFileEntry) {
  if (entry.kind !== "file" || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.modifiedAt !== "string") throw new Error("package_file_invalid: portable file entry is invalid")
  const relativePath = requirePortableFilePath(entry.relativePath)
  const path = requireChildPath(root, relativePath)
  await requirePortablePathWithoutLinks(root, relativePath)
  const before = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error(`package_file_conflict: ${relativePath} no longer exists`)
    throw error
  })
  requirePortableFileVersion(entry, before.size, before.mtime.toISOString(), before.isFile() && !before.isSymbolicLink())
  requirePathInsideRoot(root, await realpath(path))
  const bytes = new Uint8Array(await readFile(path))
  const after = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error(`package_file_conflict: ${relativePath} disappeared while reading`)
    throw error
  })
  requirePortableFileVersion(entry, after.size, after.mtime.toISOString(), after.isFile() && !after.isSymbolicLink())
  if (bytes.byteLength !== entry.bytes) throw new Error(`package_file_conflict: ${relativePath} byte count changed while reading`)
  return bytes
}

async function requirePortablePathWithoutLinks(root: string, relativePath: string) {
  const segments = relativePath.split("/")
  let current = root
  for (const segment of segments) {
    current = resolve(current, segment)
    const info = await lstat(current).catch((error: unknown) => {
      if (isNotFound(error)) throw new Error(`package_file_conflict: ${relativePath} no longer exists`)
      throw error
    })
    if (info.isSymbolicLink()) throw new Error(`package_file_conflict: ${relativePath} now crosses a symbolic link`)
  }
}

function requirePortableFileVersion(entry: PortableProjectFileEntry, bytes: number, modifiedAt: string, regularFile: boolean) {
  if (!regularFile || bytes !== entry.bytes || modifiedAt !== entry.modifiedAt) throw new Error(`package_file_conflict: ${entry.relativePath} changed after enumeration`)
}

function requirePortableFilePath(relativePath: string) {
  if (!relativePath || relativePath.includes("\\") || relativePath !== relativePath.normalize("NFC")) throw new Error("package_file_invalid: portable path is not canonical")
  const segments = relativePath.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("package_file_invalid: portable path is not canonical")
  if (segments.some((segment) => portableNameExclusionReason(segment))) throw new Error("package_file_invalid: portable path is excluded")
  return requireContentPath(relativePath)
}

function portableExclusionReason(entry: Dirent): PortableProjectExclusionReason | undefined {
  if (entry.isSymbolicLink()) return "symbolic-link"
  return portableNameExclusionReason(entry.name)
}

function portableNameExclusionReason(name: string): PortableProjectExclusionReason | undefined {
  const normalized = name.toLocaleLowerCase("en-US")
  if (normalized === ".git") return "version-control"
  if (normalized === ".creatx") return "internal-state"
  if (normalized === "node_modules") return "dependencies"
  if ((normalized.startsWith(".") && normalized.endsWith(CREATX_TEMPORARY_SUFFIX)) || normalized.endsWith(".noven-tmp")) return "noven-temporary"
  if (normalized === "thumbs.db" || normalized === "desktop.ini" || normalized === ".ds_store" || normalized === "$recycle.bin" || normalized === "system volume information" || normalized === "__macosx") return "system-cache"
  return undefined
}

function portableRelativePath(root: string, path: string) {
  const value = relative(root, path).split(sep).join("/")
  if (!value || value !== value.normalize("NFC") || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("package_file_invalid: project contains a non-canonical portable path")
  return value
}

function comparePortablePath(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

type FileOperationGate = <T>(operation: () => Promise<T>) => Promise<T>

function createFileOperationGate(): FileOperationGate {
  let active = 0
  const waiters: Array<() => void> = []
  return async <T>(operation: () => Promise<T>) => {
    if (active >= MAX_PARALLEL_FILE_OPERATIONS) await new Promise<void>((resolveWaiter) => waiters.push(resolveWaiter))
    active += 1
    try {
      return await operation()
    } finally {
      active -= 1
      waiters.shift()?.()
    }
  }
}

async function describeProjectFile(root: string, path: string): Promise<ProjectFile> {
  const info = await stat(path)
  const relativePath = relative(root, path).split(sep).join("/")
  return {
    id: createHash("sha256").update(relativePath.toLocaleLowerCase("en-US")).digest("hex").slice(0, 20),
    relativePath,
    name: basename(path),
    kind: fileKind(path),
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
  }
}

function fileKind(path: string): ProjectFileKind {
  const extension = extname(path).toLowerCase()
  if (extension === ".md" || extension === ".mdx") return "markdown"
  if (extension === ".html" || extension === ".htm") return "html"
  if (imageExtensions.has(extension)) return "image"
  if (textExtensions.has(extension)) return "text"
  return "other"
}

function imageMime(path: string) {
  const extension = extname(path).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".gif") return "image/gif"
  return "image/png"
}
