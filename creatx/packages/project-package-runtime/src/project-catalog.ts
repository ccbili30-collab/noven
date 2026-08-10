import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import type { ProjectCatalogAvailability, ProjectCatalogEntryProjection, ProjectCatalogSource } from "@creatx/contracts"
import { parsePortableProjectId } from "./schema.ts"

export interface ProjectCatalogRegistrationInput {
  localProjectId: string
  forkedFromProjectId?: string
  rootPath: string
  displayName: string
  source: ProjectCatalogSource
  importedProjectId?: string
  importedPackageId?: string
}

export type ProjectCatalogImportInspection =
  | { kind: "new" }
  | { kind: "existing"; entry: ProjectCatalogEntryProjection }
  | { kind: "conflict"; existingLocalProjectIds: string[] }

interface StoredProjectCatalogEntry extends ProjectCatalogEntryProjection {
  registeredAt: string
}

interface StoredProjectCatalogV1 {
  schemaVersion: 1
  entries: StoredProjectCatalogEntry[]
}

const catalogKeys = new Set(["schemaVersion", "entries"])
const entryKeys = new Set(["localProjectId", "forkedFromProjectId", "rootPath", "displayName", "source", "importedProjectId", "importedPackageId", "availability", "registeredAt"])

export class ProjectCatalogStore {
  private readonly path: string
  private state: StoredProjectCatalogV1
  private queue = Promise.resolve()

  constructor(userData: string) {
    if (!userData.trim() || !isAbsolute(userData)) throw new Error("project_catalog_invalid: an absolute userData path is required")
    this.path = join(resolve(userData), "creatx", "projects.v1.json")
    this.state = existsSync(this.path) ? readCatalog(this.path) : { schemaVersion: 1, entries: [] }
  }

  inspectImport(importedProjectIdValue: string, importedPackageIdValue: string): ProjectCatalogImportInspection {
    const importedProjectId = parseCatalogProjectId(importedProjectIdValue, "importedProjectId")
    const importedPackageId = parsePackageId(importedPackageIdValue)
    const exact = this.state.entries.find((entry) => entry.importedProjectId === importedProjectId && entry.importedPackageId === importedPackageId)
    if (exact) return { kind: "existing", entry: projectCatalogProjection(exact) }
    const conflicts = this.state.entries.filter((entry) => entry.importedProjectId === importedProjectId)
    if (conflicts.length) return { kind: "conflict", existingLocalProjectIds: conflicts.map((entry) => entry.localProjectId).sort(compareText) }
    return { kind: "new" }
  }

  register(input: ProjectCatalogRegistrationInput) {
    return this.serial(async () => {
      const identity = requireRegistrationIdentity(input)
      if (identity.source === "imported-package") {
        const exact = this.state.entries.find((entry) => entry.importedProjectId === identity.importedProjectId && entry.importedPackageId === identity.importedPackageId)
        if (exact) return { status: "existing" as const, entry: projectCatalogProjection(exact) }
      }
      const rootPath = await requireCatalogRoot(input.rootPath)
      const entry: StoredProjectCatalogEntry = {
        ...identity,
        rootPath,
        availability: "available",
        registeredAt: new Date().toISOString(),
      }
      const localIdentity = this.state.entries.find((candidate) => candidate.localProjectId === entry.localProjectId)
      if (localIdentity) {
        if (sameRegistration(localIdentity, entry)) return { status: "existing" as const, entry: projectCatalogProjection(localIdentity) }
        throw new Error("project_catalog_conflict: local project identity is already registered with different data")
      }
      if (this.state.entries.some((candidate) => normalizeWindowsPath(candidate.rootPath) === normalizeWindowsPath(entry.rootPath))) throw new Error("project_catalog_conflict: project directory is already registered with a different identity")
      if (entry.importedProjectId && !entry.forkedFromProjectId && this.state.entries.some((candidate) => candidate.importedProjectId === entry.importedProjectId)) {
        throw new Error("project_catalog_conflict: imported lineage already has different package content")
      }
      await this.persist({ schemaVersion: 1, entries: [...this.state.entries, entry] })
      return { status: "registered" as const, entry: projectCatalogProjection(entry) }
    })
  }

  list() {
    return this.serial(async () => {
      const entries = await Promise.all(this.state.entries.map(async (entry) => ({ ...entry, availability: await projectAvailability(entry.rootPath) })))
      if (entries.some((entry, index) => entry.availability !== this.state.entries[index]!.availability)) await this.persist({ schemaVersion: 1, entries })
      return this.state.entries.map(projectCatalogProjection)
    })
  }

  remove(localProjectIdValue: string) {
    return this.serial(async () => {
      const localProjectId = parseCatalogProjectId(localProjectIdValue, "localProjectId")
      const entries = this.state.entries.filter((entry) => entry.localProjectId !== localProjectId)
      if (entries.length === this.state.entries.length) return false
      await this.persist({ schemaVersion: 1, entries })
      return true
    })
  }

  private serial<T>(operation: () => Promise<T>) {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async persist(next: StoredProjectCatalogV1) {
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(temporary, `${JSON.stringify(next, undefined, 2)}\n`, { encoding: "utf8", flag: "wx" })
      await rename(temporary, this.path)
      this.state = next
    } catch (error) {
      throw new Error(`project_catalog_persistence: ${messageOf(error)}`, { cause: error })
    } finally {
      await rm(temporary, { force: true })
    }
  }
}

function requireRegistrationIdentity(input: ProjectCatalogRegistrationInput) {
  const localProjectId = parseCatalogProjectId(input.localProjectId, "localProjectId")
  const forkedFromProjectId = input.forkedFromProjectId === undefined ? undefined : parseCatalogProjectId(input.forkedFromProjectId, "forkedFromProjectId")
  if (forkedFromProjectId === localProjectId) throw new Error("project_catalog_invalid: forked lineage must differ from local project identity")
  const displayName = requireText(input.displayName, "displayName", 256)
  if (input.source === "opened-folder") {
    if (input.importedProjectId !== undefined || input.importedPackageId !== undefined) throw new Error("project_catalog_invalid: opened folders cannot claim an imported package identity")
    return { localProjectId, ...(forkedFromProjectId ? { forkedFromProjectId } : {}), displayName, source: input.source }
  }
  if (input.source !== "imported-package") throw new Error("project_catalog_invalid: source is invalid")
  const importedProjectId = parseCatalogProjectId(input.importedProjectId, "importedProjectId")
  const importedPackageId = parsePackageId(input.importedPackageId)
  if (forkedFromProjectId) {
    if (forkedFromProjectId !== importedProjectId) throw new Error("project_catalog_invalid: independent copy must point to the imported lineage")
  } else if (localProjectId !== importedProjectId) {
    throw new Error("project_catalog_invalid: ordinary import must retain the imported project identity")
  }
  return {
    localProjectId,
    ...(forkedFromProjectId ? { forkedFromProjectId } : {}),
    displayName,
    source: input.source,
    importedProjectId,
    importedPackageId,
  }
}

function readCatalog(path: string): StoredProjectCatalogV1 {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`project_catalog_persistence: catalog could not be read: ${messageOf(error)}`, { cause: error })
  }
  try {
    const record = requireRecord(value, "catalog")
    requireExactKeys(record, catalogKeys, "catalog")
    if (record.schemaVersion !== 1 || !Array.isArray(record.entries)) throw new Error("unsupported or malformed catalog")
    const entries = record.entries.map(parseStoredEntry)
    requireStoredUniqueness(entries)
    return { schemaVersion: 1, entries }
  } catch (error) {
    throw new Error(`project_catalog_persistence: ${messageOf(error)}`, { cause: error })
  }
}

function parseStoredEntry(value: unknown): StoredProjectCatalogEntry {
  const record = requireRecord(value, "catalog entry")
  requireExactKeys(record, entryKeys, "catalog entry")
  const identity = requireRegistrationIdentity({
    localProjectId: requireText(record.localProjectId, "localProjectId", 128),
    ...(record.forkedFromProjectId === undefined ? {} : { forkedFromProjectId: requireText(record.forkedFromProjectId, "forkedFromProjectId", 128) }),
    rootPath: requireText(record.rootPath, "rootPath", 32_768),
    displayName: requireText(record.displayName, "displayName", 256),
    source: record.source as ProjectCatalogSource,
    ...(record.importedProjectId === undefined ? {} : { importedProjectId: requireText(record.importedProjectId, "importedProjectId", 128) }),
    ...(record.importedPackageId === undefined ? {} : { importedPackageId: requireText(record.importedPackageId, "importedPackageId", 64) }),
  })
  const rootPath = requireText(record.rootPath, "rootPath", 32_768)
  if (!isAbsolute(rootPath)) throw new Error("catalog rootPath is not absolute")
  const availability = requireAvailability(record.availability)
  const registeredAt = requireIsoDate(record.registeredAt, "registeredAt")
  return { ...identity, rootPath: resolve(rootPath), availability, registeredAt }
}

function requireStoredUniqueness(entries: StoredProjectCatalogEntry[]) {
  const localIds = new Set<string>()
  const roots = new Set<string>()
  const importedPairs = new Set<string>()
  entries.forEach((entry) => {
    if (localIds.has(entry.localProjectId)) throw new Error("duplicate local project identity")
    localIds.add(entry.localProjectId)
    const root = normalizeWindowsPath(entry.rootPath)
    if (roots.has(root)) throw new Error("duplicate project root")
    roots.add(root)
    if (!entry.importedProjectId || !entry.importedPackageId) return
    const pair = `${entry.importedProjectId}\u0000${entry.importedPackageId}`
    if (importedPairs.has(pair)) throw new Error("duplicate imported package identity")
    importedPairs.add(pair)
  })
}

async function requireCatalogRoot(rootPathValue: string) {
  if (!rootPathValue.trim() || !isAbsolute(rootPathValue)) throw new Error("project_catalog_invalid: an absolute project directory is required")
  const path = resolve(rootPathValue)
  const info = await lstat(path).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error("project_catalog_invalid: project directory does not exist")
    throw error
  })
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("project_catalog_invalid: project root must be a regular directory")
  return realpath(path)
}

async function projectAvailability(rootPath: string): Promise<ProjectCatalogAvailability> {
  const info = await lstat(rootPath).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw new Error(`project_catalog_persistence: project status could not be checked: ${messageOf(error)}`, { cause: error })
  })
  return info?.isDirectory() && !info.isSymbolicLink() ? "available" : "missing"
}

function sameRegistration(left: StoredProjectCatalogEntry, right: StoredProjectCatalogEntry) {
  return left.localProjectId === right.localProjectId
    && left.forkedFromProjectId === right.forkedFromProjectId
    && normalizeWindowsPath(left.rootPath) === normalizeWindowsPath(right.rootPath)
    && left.displayName === right.displayName
    && left.source === right.source
    && left.importedProjectId === right.importedProjectId
    && left.importedPackageId === right.importedPackageId
}

function projectCatalogProjection(entry: StoredProjectCatalogEntry): ProjectCatalogEntryProjection {
  return {
    localProjectId: entry.localProjectId,
    ...(entry.forkedFromProjectId ? { forkedFromProjectId: entry.forkedFromProjectId } : {}),
    rootPath: entry.rootPath,
    displayName: entry.displayName,
    source: entry.source,
    ...(entry.importedProjectId ? { importedProjectId: entry.importedProjectId } : {}),
    ...(entry.importedPackageId ? { importedPackageId: entry.importedPackageId } : {}),
    availability: entry.availability,
  }
}

function parseCatalogProjectId(value: unknown, name: string) {
  try {
    return parsePortableProjectId(value, name)
  } catch (error) {
    throw new Error(`project_catalog_invalid: ${messageOf(error)}`, { cause: error })
  }
}

function parsePackageId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("project_catalog_invalid: importedPackageId must be lowercase SHA-256")
  return value
}

function requireAvailability(value: unknown): ProjectCatalogAvailability {
  if (value !== "available" && value !== "missing") throw new Error("catalog availability is invalid")
  return value
}

function requireText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${name} is invalid`)
  return value
}

function requireIsoDate(value: unknown, name: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${name} is invalid`)
  return value
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${name} must be a plain object`)
  return value as Record<string, unknown>
}

function requireExactKeys(record: Record<string, unknown>, allowed: Set<string>, name: string) {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`${name} contains unknown field ${unknown[0]}`)
  const required = [...allowed].filter((key) => !["forkedFromProjectId", "importedProjectId", "importedPackageId"].includes(key))
  const missing = required.filter((key) => !(key in record))
  if (missing.length) throw new Error(`${name} is missing ${missing[0]}`)
}

function normalizeWindowsPath(path: string) {
  return resolve(path).replaceAll("/", "\\").toLocaleLowerCase("en-US")
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
