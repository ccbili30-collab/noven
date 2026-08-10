import { createHash } from "node:crypto"
import type { ProjectPackageOverview } from "@creatx/contracts"

export const NP_PACKAGE_LIMITS = {
  maxEntries: 60_000,
  maxEntryBytes: 2 * 1024 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxPathBytes: 1_024,
  maxOverviewFieldBytes: 64 * 1024,
  maxStructuredRecordBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 1_000,
} as const

export type PortableProjectOverviewV1 = ProjectPackageOverview

export interface PortableChecksumEntryV1 {
  path: string
  bytes: number
  sha256: string
}

export interface PortableChecksumsV1 {
  schemaVersion: 1
  directories: string[]
  entries: PortableChecksumEntryV1[]
}

export interface PortableManifestV1 {
  schemaVersion: 1
  format: "noven-project-package"
  projectId: string
  forkedFromProjectId?: string
  packageId: string
  overview: PortableProjectOverviewV1
  counts: {
    files: number
    conversations: number
    workbenches: number
  }
  exchangeVersions: {
    checksums: 1
    conversations: 1
    workbenches: 1
  }
  exportedAt: string
  exporterVersion: string
}

export interface PortablePackageIdentityInput {
  projectId: string
  forkedFromProjectId?: string
  overview: PortableProjectOverviewV1
  checksums: PortableChecksumsV1
}

export interface CreatePortableManifestV1Input extends PortablePackageIdentityInput {
  exportedAt: string
  exporterVersion: string
}

const manifestKeys = new Set(["schemaVersion", "format", "projectId", "forkedFromProjectId", "packageId", "overview", "counts", "exchangeVersions", "exportedAt", "exporterVersion"])
const overviewKeys = new Set(["purpose", "currentResults", "usageGuide"])
const countsKeys = new Set(["files", "conversations", "workbenches"])
const exchangeVersionKeys = new Set(["checksums", "conversations", "workbenches"])
const checksumsKeys = new Set(["schemaVersion", "directories", "entries"])
const checksumEntryKeys = new Set(["path", "bytes", "sha256"])
const portableRoots = new Set(["files", "conversations", "workbenches"])

export function createPortableManifestV1(input: CreatePortableManifestV1Input): PortableManifestV1 {
  const identity = requireIdentityInput(input)
  const exportedAt = requireIsoDate(input.exportedAt, "exportedAt")
  const exporterVersion = requireText(input.exporterVersion, "exporterVersion", 256)
  return {
    schemaVersion: 1,
    format: "noven-project-package",
    projectId: identity.projectId,
    ...(identity.forkedFromProjectId ? { forkedFromProjectId: identity.forkedFromProjectId } : {}),
    packageId: hashIdentity(identity),
    overview: identity.overview,
    counts: countEntries(identity.checksums.entries),
    exchangeVersions: { checksums: 1, conversations: 1, workbenches: 1 },
    exportedAt,
    exporterVersion,
  }
}

export function parsePortableManifestV1(value: unknown, checksumsValue: unknown): PortableManifestV1 {
  const record = requireRecord(value, "manifest")
  if (record.schemaVersion !== 1) throw new Error("package_version_unsupported: manifest schemaVersion is not supported")
  requireExactKeys(record, manifestKeys, "manifest")
  if (record.format !== "noven-project-package") throw new Error("package_invalid: manifest format is invalid")
  const checksums = parsePortableChecksumsV1(checksumsValue)
  const identity = requireIdentityInput({
    projectId: record.projectId,
    ...(record.forkedFromProjectId !== undefined ? { forkedFromProjectId: record.forkedFromProjectId } : {}),
    overview: record.overview,
    checksums,
  })
  const counts = requireCounts(record.counts)
  if (JSON.stringify(counts) !== JSON.stringify(countEntries(checksums.entries))) throw new Error("package_invalid: manifest counts do not match checksums")
  const exchangeVersions = requireExchangeVersions(record.exchangeVersions)
  const packageId = requireSha256(record.packageId, "packageId")
  if (packageId !== hashIdentity(identity)) throw new Error("package_identity_mismatch: packageId does not match canonical content")
  return {
    schemaVersion: 1,
    format: "noven-project-package",
    projectId: identity.projectId,
    ...(identity.forkedFromProjectId ? { forkedFromProjectId: identity.forkedFromProjectId } : {}),
    packageId,
    overview: identity.overview,
    counts,
    exchangeVersions,
    exportedAt: requireIsoDate(record.exportedAt, "exportedAt"),
    exporterVersion: requireText(record.exporterVersion, "exporterVersion", 256),
  }
}

export function parsePortableChecksumsV1(value: unknown): PortableChecksumsV1 {
  const record = requireRecord(value, "checksums")
  if (record.schemaVersion !== 1) throw new Error("package_version_unsupported: checksums schemaVersion is not supported")
  requireExactKeys(record, checksumsKeys, "checksums")
  if (!Array.isArray(record.directories) || !Array.isArray(record.entries) || record.directories.length + record.entries.length > NP_PACKAGE_LIMITS.maxEntries) throw new Error("package_size_invalid: checksum entry count is invalid")
  const canonicalPaths = new Set<string>()
  const directories = record.directories.map((value) => {
    const path = requirePortablePath(value)
    if (!path.startsWith("files/")) throw new Error(`package_path_invalid: portable directories must be inside files/: ${path}`)
    registerCanonicalPath(canonicalPaths, path)
    return path
  })
  let totalBytes = 0
  const entries = record.entries.map((value, index) => {
    const entry = requireRecord(value, `checksums.entries[${index}]`)
    requireExactKeys(entry, checksumEntryKeys, `checksums.entries[${index}]`)
    const path = requirePortablePath(entry.path)
    registerCanonicalPath(canonicalPaths, path)
    const bytes = requireEntryBytes(entry.bytes)
    totalBytes += bytes
    if (!Number.isSafeInteger(totalBytes) || totalBytes > NP_PACKAGE_LIMITS.maxTotalBytes) throw new Error("package_size_invalid: total declared bytes exceed the V1 limit")
    return { path, bytes, sha256: requireSha256(entry.sha256, `checksums.entries[${index}].sha256`) }
  })
  return { schemaVersion: 1, directories, entries }
}

export function computePackageId(input: PortablePackageIdentityInput) {
  return hashIdentity(requireIdentityInput(input))
}

export function parsePortableProjectOverviewV1(value: unknown) {
  return requireOverview(value)
}

export function parsePortableProjectId(value: unknown, name = "projectId") {
  return requireProjectId(value, name)
}

export function parsePortablePackagePath(value: unknown) {
  return requirePortablePath(value)
}

export function canonicalPackageIdentityBytes(input: PortablePackageIdentityInput) {
  const identity = requireIdentityInput(input)
  const descriptor = {
    schemaVersion: 1,
    projectId: identity.projectId,
    ...(identity.forkedFromProjectId ? { forkedFromProjectId: identity.forkedFromProjectId } : {}),
    overview: identity.overview,
    directories: [...identity.checksums.directories].sort(compareCanonicalPath),
    entries: [...identity.checksums.entries]
      .sort((left, right) => compareCanonicalPath(left.path, right.path))
      .map((entry) => ({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 })),
  }
  return new TextEncoder().encode(JSON.stringify(descriptor))
}

function requireIdentityInput(value: { projectId: unknown; forkedFromProjectId?: unknown; overview: unknown; checksums: unknown }): PortablePackageIdentityInput {
  const projectId = requireProjectId(value.projectId, "projectId")
  const forkedFromProjectId = value.forkedFromProjectId === undefined ? undefined : requireProjectId(value.forkedFromProjectId, "forkedFromProjectId")
  if (forkedFromProjectId === projectId) throw new Error("package_invalid: forkedFromProjectId must identify a different lineage")
  return {
    projectId,
    ...(forkedFromProjectId ? { forkedFromProjectId } : {}),
    overview: requireOverview(value.overview),
    checksums: parsePortableChecksumsV1(value.checksums),
  }
}

function hashIdentity(input: PortablePackageIdentityInput) {
  return createHash("sha256").update(canonicalPackageIdentityBytes(input)).digest("hex")
}

function requireOverview(value: unknown): PortableProjectOverviewV1 {
  const record = requireRecord(value, "overview")
  requireExactKeys(record, overviewKeys, "overview")
  return {
    purpose: requireText(record.purpose, "overview.purpose", NP_PACKAGE_LIMITS.maxOverviewFieldBytes),
    currentResults: requireText(record.currentResults, "overview.currentResults", NP_PACKAGE_LIMITS.maxOverviewFieldBytes),
    usageGuide: requireText(record.usageGuide, "overview.usageGuide", NP_PACKAGE_LIMITS.maxOverviewFieldBytes),
  }
}

function requireCounts(value: unknown): PortableManifestV1["counts"] {
  const record = requireRecord(value, "counts")
  requireExactKeys(record, countsKeys, "counts")
  return {
    files: requireCount(record.files, "counts.files"),
    conversations: requireCount(record.conversations, "counts.conversations"),
    workbenches: requireCount(record.workbenches, "counts.workbenches"),
  }
}

function requireExchangeVersions(value: unknown): PortableManifestV1["exchangeVersions"] {
  const record = requireRecord(value, "exchangeVersions")
  requireExactKeys(record, exchangeVersionKeys, "exchangeVersions")
  if (record.checksums !== 1 || record.conversations !== 1 || record.workbenches !== 1) throw new Error("package_version_unsupported: exchange record version is not supported")
  return { checksums: 1, conversations: 1, workbenches: 1 }
}

function countEntries(entries: PortableChecksumEntryV1[]) {
  return {
    files: entries.filter((entry) => entry.path.startsWith("files/")).length,
    conversations: entries.filter((entry) => entry.path.startsWith("conversations/")).length,
    workbenches: entries.filter((entry) => entry.path.startsWith("workbenches/")).length,
  }
}

function requirePortablePath(value: unknown) {
  if (typeof value !== "string" || value !== value.normalize("NFC") || Buffer.byteLength(value) > NP_PACKAGE_LIMITS.maxPathBytes || /[\u0000-\u001f\u007f]/u.test(value) || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/u.test(value)) {
    throw new Error("package_path_invalid: checksum path is not canonical")
  }
  const segments = value.split("/")
  if (segments.length < 2 || !portableRoots.has(segments[0]!) || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`package_path_invalid: ${value}`)
  if (segments.some((segment) => /[<>:"|?*]/u.test(segment) || /[ .]$/u.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment))) throw new Error(`package_path_invalid: ${value} is not portable on Windows`)
  return value
}

function registerCanonicalPath(paths: Set<string>, path: string) {
  const canonicalPath = path.normalize("NFC").toLocaleLowerCase("en-US")
  if (paths.has(canonicalPath)) throw new Error(`package_path_duplicate: ${path}`)
  paths.add(canonicalPath)
}

function compareCanonicalPath(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function requireEntryBytes(value: unknown) {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0 || value > NP_PACKAGE_LIMITS.maxEntryBytes) throw new Error("package_size_invalid: entry byte count is invalid")
  return value
}

function requireCount(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0 || value > NP_PACKAGE_LIMITS.maxEntries) throw new Error(`package_invalid: ${name} is invalid`)
  return value
}

function requireProjectId(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value)) throw new Error(`package_invalid: ${name} is invalid`)
  return value
}

function requireSha256(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`package_checksum_invalid: ${name} is not lowercase SHA-256`)
  return value
}

function requireText(value: unknown, name: string, maxBytes: number) {
  if (typeof value !== "string" || Buffer.byteLength(value) > maxBytes) throw new Error(`package_invalid: ${name} is invalid`)
  return value
}

function requireIsoDate(value: unknown, name: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`package_invalid: ${name} is invalid`)
  return value
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`package_invalid: ${name} must be a plain object`)
  return value as Record<string, unknown>
}

function requireExactKeys(record: Record<string, unknown>, allowed: Set<string>, name: string) {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`package_invalid: ${name} contains unknown field ${unknown[0]}`)
  const missing = [...allowed].filter((key) => key !== "forkedFromProjectId" && !(key in record))
  if (missing.length) throw new Error(`package_invalid: ${name} is missing ${missing[0]}`)
}
