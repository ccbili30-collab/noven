import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { inspectArtImage } from "./image.ts"
import { decodeArtCandidate, decodeArtItemMetadata, type ArtImageRecord, type ArtSourceRecord } from "./schema.ts"
import type { ArtLibraryService } from "./service.ts"

const ART_ATLAS_SEED_SNAPSHOT = "2026-08-08.art-concept-data.v1"
export const ART_ATLAS_RESET_SNAPSHOT = "2026-08-10.visual-curation.v2"

export interface ArtAtlasSeedManifestEntry {
  id: string
  bytes: Uint8Array
  image: ArtImageRecord
  source: ArtSourceRecord
  legacyState: "approved" | "approval"
}

export interface ArtAtlasSeedManifest {
  snapshot: typeof ART_ATLAS_SEED_SNAPSHOT
  generatedAt: string
  entries: ArtAtlasSeedManifestEntry[]
}

export async function readBundledArtAtlasSeedManifest(sourceRoots: readonly string[]): Promise<ArtAtlasSeedManifest> {
  const sourceRoot = await firstSeedRoot(sourceRoots)
  if (!sourceRoot) throw new Error("art_library_seed_unavailable: bundled Art Atlas source is unavailable")
  const seed = decodeSeedSources(await readFile(join(sourceRoot, "art-concept-data.json"), "utf8"))
  const details = new Map(seed.details.map((item) => [item.title, item]))
  const inputs = [
    ...seed.orbits.map((item) => {
      const detail = details.get(item.title)
      if (!detail) throw new Error(`art_library_seed_invalid: detail is missing for ${item.title}`)
      return { asset: item.image, title: item.title, pageUrl: detail.sourceUrl, platform: platformFromMeta(item.meta), legacyState: "approved" as const, imageNamespace: "art-atlas" }
    }),
    ...seed.approvals.map((item) => ({ asset: item.coverHref, title: item.sourceTitle, pageUrl: item.sourceUrl, platform: item.sourcePlatform, legacyState: "approval" as const, imageNamespace: "art-approval" })),
  ]
  if (seed.orbits.length !== 57 || seed.approvals.length !== 6 || inputs.length !== 63) throw new Error("art_library_seed_invalid: expected exactly 57 approved and 6 approval seed images")
  const entries = await Promise.all(inputs.map(async (input) => {
    const bytes = new Uint8Array(await readFile(seedAssetPath(sourceRoot, input.asset)))
    const info = inspectArtImage(bytes)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    return {
      id: `art_${sha256.slice(0, 16)}`,
      bytes,
      image: { fileName: `original.${info.extension}`, mediaType: info.mediaType, bytes: bytes.byteLength, width: info.width, height: info.height, sha256 },
      source: { pageUrl: input.pageUrl, imageUrl: `creatx-seed://${input.imageNamespace}/${basename(input.asset)}`, pageTitle: input.title, platform: input.platform, kind: "seed" as const, displayName: input.title },
      legacyState: input.legacyState,
    }
  }))
  if (new Set(entries.map((entry) => entry.id)).size !== 63) throw new Error("art_library_seed_invalid: bundled seed images must have 63 unique identities")
  return { snapshot: ART_ATLAS_SEED_SNAPSHOT, generatedAt: seed.generatedAt, entries }
}

export async function resetBundledArtAtlasSeed(service: ArtLibraryService, sourceRoots: readonly string[]) {
  const root = resolve(service.root)
  const completedMarker = join(root, ".state", "seeds", `${ART_ATLAS_RESET_SNAPSHOT}.json`)
  if (await exists(completedMarker)) return { status: "already-reset" as const, candidates: 63, removed: 0 }
  const sourceRoot = await firstSeedRoot(sourceRoots)
  if (!sourceRoot) return { status: "unavailable" as const, candidates: 0, removed: 0 }
  const manifest = await readBundledArtAtlasSeedManifest([sourceRoot])
  const expected = new Map(manifest.entries.map((entry) => [entry.id, entry]))
  const oldMarker = join(root, ".state", "seeds", `${manifest.snapshot}.json`)
  const progressMarker = join(root, ".state", "seeds", `${ART_ATLAS_RESET_SNAPSHOT}.progress.json`)
  const progress = await hasValidResetProgress(progressMarker, manifest)
  const items = await readStoredItems(root)

  if (!progress && await exists(oldMarker)) {
    const matching = items.filter((item) => expected.has(item.id))
    if (matching.length !== 63) throw new Error(`art_library_seed_ownership: expected 63 legacy seed items before reset, found ${matching.length}`)
    for (const item of matching) await verifyLegacySeedItem(item, expected.get(item.id)!, manifest.snapshot)
  }
  if (!progress && !(await exists(oldMarker))) {
    const collision = items.find((item) => expected.has(item.id))
    if (collision) throw new Error(`art_library_seed_ownership: bundled seed identity ${collision.id} is already owned by non-seed data`)
  }

  if (!progress) await writeJson(progressMarker, { schemaVersion: 1, snapshot: ART_ATLAS_RESET_SNAPSHOT, expectedIds: manifest.entries.map((entry) => entry.id) })

  const removable = (await readStoredItems(root)).filter((item) => expected.has(item.id) && item.kind !== "incoming")
  for (const item of removable) {
    await verifyLegacySeedItem(item, expected.get(item.id)!, manifest.snapshot)
    assertInside(root, item.root)
    await rm(item.root, { recursive: true, force: true })
  }
  await removeEmptyLibraries(root)

  for (let offset = 0; offset < manifest.entries.length; offset += 20) {
    const result = await service.importImages({
      query: "内置艺术原图重新整理",
      images: manifest.entries.slice(offset, offset + 20).map((entry) => ({ bytes: entry.bytes, source: entry.source })),
    })
    if (result.failures.length) throw new Error(`art_library_seed_reset: candidate import failed: ${result.failures.map((failure) => failure.error).join("; ")}`)
  }

  const candidates = (await readStoredItems(root)).filter((item) => item.kind === "incoming" && expected.has(item.id))
  if (candidates.length !== 63 || candidates.some((item) => item.sourceKind !== "seed")) throw new Error(`art_library_seed_reset: expected 63 seed candidates after reset, found ${candidates.length}`)
  await writeJson(completedMarker, { schemaVersion: 1, snapshot: ART_ATLAS_RESET_SNAPSHOT, sourceSnapshot: manifest.snapshot, resetAt: new Date().toISOString(), candidates: 63, removed: removable.length })
  await rm(progressMarker, { force: true })
  await rm(oldMarker, { force: true })
  return { status: "reset" as const, candidates: 63, removed: removable.length }
}

async function verifyLegacySeedItem(item: StoredItem, expected: ArtAtlasSeedManifestEntry, snapshot: string) {
  if (item.kind === "incoming") {
    if (item.sourceKind !== "seed" || item.sha256 !== expected.image.sha256) throw new Error(`art_library_seed_ownership: incoming item ${item.id} is not the expected seed candidate`)
    return
  }
  if (item.seedSnapshot !== snapshot) throw new Error(`art_library_seed_ownership: item ${item.id} has no matching seed ownership`)
  if (item.sha256 !== expected.image.sha256) throw new Error(`art_library_seed_hash: metadata hash changed for ${item.id}`)
  const bytes = new Uint8Array(await readFile(join(item.root, item.fileName)))
  if (createHash("sha256").update(bytes).digest("hex") !== expected.image.sha256) throw new Error(`art_library_seed_hash: original image hash changed for ${item.id}`)
}

async function hasValidResetProgress(path: string, manifest: ArtAtlasSeedManifest) {
  if (!(await exists(path))) return false
  const value = record(JSON.parse(await readFile(path, "utf8")) as unknown, "seed reset progress")
  if (value.schemaVersion !== 1 || value.snapshot !== ART_ATLAS_RESET_SNAPSHOT || !Array.isArray(value.expectedIds)) throw new Error("art_library_seed_reset: progress marker is invalid")
  const expectedIds = manifest.entries.map((entry) => entry.id)
  if (value.expectedIds.length !== expectedIds.length || value.expectedIds.some((id, index) => id !== expectedIds[index])) throw new Error("art_library_seed_reset: progress marker identities changed")
  return true
}

type StoredItem = { id: string; root: string; kind: "incoming" | "approval" | "approved"; sha256: string; fileName: string; sourceKind?: string; seedSnapshot?: string }

async function readStoredItems(root: string): Promise<StoredItem[]> {
  const incomingBatches = await readdir(join(root, "incoming"), { withFileTypes: true }).catch(() => [])
  const incoming = (await Promise.all(incomingBatches.filter((batch) => batch.isDirectory()).map(async (batch) => {
    const entries = await readdir(join(root, "incoming", batch.name), { withFileTypes: true }).catch(() => [])
    return Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".partial-")).map(async (entry) => {
      const itemRoot = join(root, "incoming", batch.name, entry.name)
      const record = decodeArtCandidate(await readFile(join(itemRoot, "candidate.json"), "utf8"))
      return { id: record.id, root: itemRoot, kind: "incoming" as const, sha256: record.image.sha256, fileName: record.image.fileName, ...(record.source.kind ? { sourceKind: record.source.kind } : {}) }
    }))
  }))).flat()
  const approvalEntries = await readdir(join(root, "approval"), { withFileTypes: true }).catch(() => [])
  const approval = await Promise.all(approvalEntries.filter((entry) => entry.isDirectory()).map((entry) => readMetadataItem(join(root, "approval", entry.name), "approval")))
  const libraries = await readdir(join(root, "libraries"), { withFileTypes: true }).catch(() => [])
  const approved = (await Promise.all(libraries.filter((library) => library.isDirectory()).map(async (library) => {
    const itemsRoot = join(root, "libraries", library.name, "items")
    const entries = await readdir(itemsRoot, { withFileTypes: true }).catch(() => [])
    return Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readMetadataItem(join(itemsRoot, entry.name), "approved")))
  }))).flat()
  return [...incoming, ...approval, ...approved]
}

async function readMetadataItem(root: string, kind: "approval" | "approved"): Promise<StoredItem> {
  const metadata = decodeArtItemMetadata(await readFile(join(root, "metadata.json"), "utf8"))
  return { id: metadata.id, root, kind, sha256: metadata.image.sha256, fileName: metadata.image.fileName, ...(metadata.source.kind ? { sourceKind: metadata.source.kind } : {}), ...(metadata.seed ? { seedSnapshot: metadata.seed.snapshot } : {}) }
}

async function removeEmptyLibraries(root: string) {
  const libraries = await readdir(join(root, "libraries"), { withFileTypes: true }).catch(() => [])
  for (const library of libraries.filter((entry) => entry.isDirectory())) {
    const libraryRoot = join(root, "libraries", library.name)
    const items = await readdir(join(libraryRoot, "items"), { withFileTypes: true }).catch(() => [])
    if (items.some((item) => item.isDirectory())) continue
    assertInside(root, libraryRoot)
    await rm(libraryRoot, { recursive: true, force: true })
  }
}

function decodeSeedSources(input: string) {
  const value = record(JSON.parse(input) as unknown, "seed")
  return {
    generatedAt: text(value.generated_at, "generated_at"),
    orbits: array(value.orbitItems, "orbitItems").map((input) => {
      const item = record(input, "orbit item")
      return { title: text(item.title, "orbit.title"), image: text(item.image, "orbit.image"), meta: text(item.meta, "orbit.meta") }
    }),
    details: array(value.detailItems, "detailItems").map((input) => {
      const item = record(input, "detail item")
      return { title: text(item.title, "detail.title"), sourceUrl: text(item.sourceUrl, "detail.sourceUrl") }
    }),
    approvals: array(value.approvalItems, "approvalItems").map((input) => {
      const item = record(input, "approval item")
      return { coverHref: text(item.cover_href, "approval.cover_href"), sourceUrl: text(item.source_url, "approval.source_url"), sourceTitle: text(item.source_title, "approval.source_title"), sourcePlatform: text(item.source_platform, "approval.source_platform") }
    }),
  }
}

async function firstSeedRoot(sourceRoots: readonly string[]) {
  for (const candidate of sourceRoots.map((sourceRoot) => resolve(sourceRoot))) {
    if (await exists(join(candidate, "art-concept-data.json"))) return candidate
  }
}

function seedAssetPath(sourceRoot: string, reference: string) {
  const target = resolve(sourceRoot, reference.replace(/^\.\//u, ""))
  if (!target.startsWith(`${resolve(sourceRoot)}\\`)) throw new Error("art_library_seed_invalid: asset escapes bundled seed root")
  return target
}

function assertInside(root: string, target: string) {
  const relation = relative(root, resolve(target))
  if (!relation || relation.startsWith("..") || resolve(root, relation) !== resolve(target)) throw new Error("art_library_seed_path: target escapes the personal art library")
}

function record(input: unknown, name: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`art_library_seed_invalid: ${name} must be an object`)
  return input as Record<string, unknown>
}

function array(input: unknown, name: string) {
  if (!Array.isArray(input)) throw new Error(`art_library_seed_invalid: ${name} must be an array`)
  return input
}

function text(input: unknown, name: string) {
  if (typeof input !== "string" || !input.trim()) throw new Error(`art_library_seed_invalid: ${name} must be text`)
  return input.trim()
}

function platformFromMeta(input: string) {
  return input.split("/").map((item) => item.trim()).filter(Boolean).at(-1) ?? "Art Atlas"
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`, "utf8")
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}
