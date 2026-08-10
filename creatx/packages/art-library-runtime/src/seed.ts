import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { inspectArtImage } from "./image.ts"
import { decodeArtCandidate, decodeArtItemMetadata, safeArtDirectoryName, type ArtImageRecord, type ArtItemMetadataV1, type ArtSourceRecord } from "./schema.ts"
import type { ArtLibraryService } from "./service.ts"

const ART_ATLAS_SEED_SNAPSHOT = "2026-08-08.art-concept-data.v1"
export const ART_ATLAS_RESET_SNAPSHOT = "2026-08-10.visual-curation.v2"
export const ART_ATLAS_CURATED_SNAPSHOT = "2026-08-11.preapproved-atlas.v3"

export interface ArtAtlasSeedManifestEntry {
  id: string
  bytes: Uint8Array
  image: ArtImageRecord
  source: ArtSourceRecord
  library: "巨构艺术" | "暖色风格" | "纪念碑谷"
  metadata: Omit<ArtItemMetadataV1, "id" | "image">
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
  const seed = decodeSeed(await readFile(join(sourceRoot, "art-concept-data.json"), "utf8"))
  const details = new Map(seed.details.map((item) => [item.title, item]))
  const inputs = [
    ...seed.orbits.map((item) => {
      const detail = details.get(item.title)
      if (!detail) throw new Error(`art_library_seed_invalid: detail is missing for ${item.title}`)
      return {
        asset: item.image,
        library: requireSeedLibrary(item.library),
        legacyState: "approved" as const,
        metadata: buildOrbitMetadata(item, detail),
        imageNamespace: "art-atlas",
      }
    }),
    ...seed.approvals.map((item) => ({
      asset: item.coverHref,
      library: libraryFromGroups(item.galleryGroups),
      legacyState: "approval" as const,
      metadata: buildApprovalMetadata(item, seed.generatedAt),
      imageNamespace: "art-approval",
    })),
  ]
  if (seed.orbits.length !== 57 || seed.approvals.length !== 6 || inputs.length !== 63) throw new Error("art_library_seed_invalid: expected exactly 57 orbit and 6 former approval seed images")
  const entries = await Promise.all(inputs.map(async (input): Promise<ArtAtlasSeedManifestEntry> => {
    const bytes = new Uint8Array(await readFile(seedAssetPath(sourceRoot, input.asset)))
    const info = inspectArtImage(bytes)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const source = {
      pageUrl: input.metadata.source.pageUrl,
      imageUrl: `creatx-seed://${input.imageNamespace}/${basename(input.asset)}`,
      ...(input.metadata.source.pageTitle ? { pageTitle: input.metadata.source.pageTitle } : {}),
      ...(input.metadata.source.platform ? { platform: input.metadata.source.platform } : {}),
      kind: "seed" as const,
      displayName: input.metadata.title,
    }
    return {
      id: `art_${sha256.slice(0, 16)}`,
      bytes,
      image: { fileName: `original.${info.extension}`, mediaType: info.mediaType, bytes: bytes.byteLength, width: info.width, height: info.height, sha256 },
      source,
      library: input.library,
      metadata: { ...input.metadata, suggestedLibrary: { ...input.metadata.suggestedLibrary, title: input.library }, source },
      legacyState: input.legacyState,
    }
  }))
  if (new Set(entries.map((entry) => entry.id)).size !== 63) throw new Error("art_library_seed_invalid: bundled seed images must have 63 unique identities")
  const counts = entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.library]: (result[entry.library] ?? 0) + 1 }), {})
  if (counts["巨构艺术"] !== 41 || counts["暖色风格"] !== 18 || counts["纪念碑谷"] !== 4 || Object.keys(counts).length !== 3) throw new Error("art_library_seed_invalid: expected pre-approved library counts 41/18/4")
  return { snapshot: ART_ATLAS_SEED_SNAPSHOT, generatedAt: seed.generatedAt, entries }
}

export async function materializeBundledArtAtlasSeed(service: ArtLibraryService, sourceRoots: readonly string[]) {
  const root = resolve(service.root)
  const sourceRoot = await firstSeedRoot(sourceRoots)
  if (!sourceRoot) return { status: "unavailable" as const, approved: 0, moved: 0 }
  const manifest = await readBundledArtAtlasSeedManifest([sourceRoot])
  const completedMarker = join(root, ".state", "seeds", `${ART_ATLAS_CURATED_SNAPSHOT}.json`)
  if (await exists(completedMarker)) {
    await requireCompletedMarker(completedMarker, manifest)
    return { status: "already-materialized" as const, approved: 63, moved: 0 }
  }

  await Promise.all(["incoming", "approval", "libraries", ".state/seeds"].map((folder) => mkdir(join(root, folder), { recursive: true })))
  let moved = 0
  for (const entry of manifest.entries) {
    const stored = (await readStoredItems(root)).filter((item) => item.id === entry.id)
    for (const item of stored) await verifySeedOwnership(item, entry, manifest.snapshot)
    const target = seedTarget(root, entry)
    const targetItem = stored.find((item) => resolve(item.root) === resolve(target))
    if (!targetItem) {
      if (await exists(target)) throw new Error(`art_library_seed_target: target already exists for ${entry.id}`)
      await writeSeedItem(target, entry)
    }
    for (const item of stored.filter((item) => resolve(item.root) !== resolve(target))) {
      assertInside(root, item.root)
      await rm(item.root, { recursive: true })
      moved += 1
    }
  }

  await removeEmptyIncomingBatches(root)
  await removeEmptyLibraries(root)
  await verifyMaterializedState(root, manifest)
  await writeJson(completedMarker, {
    schemaVersion: 1,
    snapshot: ART_ATLAS_CURATED_SNAPSHOT,
    sourceSnapshot: manifest.snapshot,
    expectedIds: manifest.entries.map((entry) => entry.id),
    libraries: { 巨构艺术: 41, 暖色风格: 18, 纪念碑谷: 4 },
    materializedAt: new Date().toISOString(),
  })
  await rm(join(root, ".state", "seeds", `${ART_ATLAS_RESET_SNAPSHOT}.progress.json`), { force: true })
  return { status: "materialized" as const, approved: 63, moved }
}

async function writeSeedItem(target: string, entry: ArtAtlasSeedManifestEntry) {
  const partial = join(dirname(target), `.partial-seed-${entry.id}`)
  if (await exists(partial)) {
    assertInside(dirname(target), partial)
    await rm(partial, { recursive: true })
  }
  await mkdir(partial, { recursive: true })
  try {
    await writeFile(join(partial, entry.image.fileName), entry.bytes, { flag: "wx" })
    await writeJson(join(partial, "metadata.json"), { ...entry.metadata, id: entry.id, image: entry.image })
    await writeJson(join(partial, "source.json"), entry.source)
    const libraryRoot = dirname(dirname(target))
    const libraryRecord = join(libraryRoot, "library.json")
    if (!(await exists(libraryRecord))) await writeJson(libraryRecord, { schemaVersion: 1, title: entry.library, createdAt: entry.metadata.collectedAt })
    await rename(partial, target)
  } catch (error) {
    await rm(partial, { recursive: true, force: true })
    throw error
  }
}

async function verifyMaterializedState(root: string, manifest: ArtAtlasSeedManifest) {
  const items = await readStoredItems(root)
  for (const entry of manifest.entries) {
    const matches = items.filter((item) => item.id === entry.id)
    if (matches.length !== 1 || resolve(matches[0]!.root) !== resolve(seedTarget(root, entry))) throw new Error(`art_library_seed_state: ${entry.id} is not uniquely materialized in ${entry.library}`)
    await verifySeedOwnership(matches[0]!, entry, manifest.snapshot)
  }
}

async function requireCompletedMarker(path: string, manifest: ArtAtlasSeedManifest) {
  const value = record(JSON.parse(await readFile(path, "utf8")) as unknown, "curated seed marker")
  const ids = manifest.entries.map((entry) => entry.id)
  if (value.schemaVersion !== 1 || value.snapshot !== ART_ATLAS_CURATED_SNAPSHOT || value.sourceSnapshot !== manifest.snapshot || !Array.isArray(value.expectedIds) || value.expectedIds.length !== ids.length || value.expectedIds.some((id, index) => id !== ids[index])) throw new Error("art_library_seed_state: completed marker is invalid")
}

async function verifySeedOwnership(item: StoredItem, expected: ArtAtlasSeedManifestEntry, snapshot: string) {
  const ownsIncoming = item.kind === "incoming" && item.sourceKind === "seed"
  const ownsMetadata = item.kind !== "incoming" && item.seedSnapshot === snapshot
  if (!ownsIncoming && !ownsMetadata) throw new Error(`art_library_seed_ownership: item ${item.id} is not the expected bundled seed`)
  if (item.sha256 !== expected.image.sha256) throw new Error(`art_library_seed_hash: metadata hash changed for ${item.id}`)
  const bytes = new Uint8Array(await readFile(join(item.root, item.fileName)))
  if (createHash("sha256").update(bytes).digest("hex") !== expected.image.sha256) throw new Error(`art_library_seed_hash: original image hash changed for ${item.id}`)
}

type StoredItem = { id: string; root: string; kind: "incoming" | "approval" | "approved"; sha256: string; fileName: string; sourceKind?: string; seedSnapshot?: string }

async function readStoredItems(root: string): Promise<StoredItem[]> {
  const incomingBatches = await readdir(join(root, "incoming"), { withFileTypes: true }).catch(() => [])
  const incoming = (await Promise.all(incomingBatches.filter((batch) => batch.isDirectory()).map(async (batch) => {
    const entries = await readdir(join(root, "incoming", batch.name), { withFileTypes: true }).catch(() => [])
    return Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".partial-")).map(async (entry) => {
      const itemRoot = join(root, "incoming", batch.name, entry.name)
      const candidate = decodeArtCandidate(await readFile(join(itemRoot, "candidate.json"), "utf8"))
      return { id: candidate.id, root: itemRoot, kind: "incoming" as const, sha256: candidate.image.sha256, fileName: candidate.image.fileName, ...(candidate.source.kind ? { sourceKind: candidate.source.kind } : {}) }
    }))
  }))).flat()
  const approvalEntries = await readdir(join(root, "approval"), { withFileTypes: true }).catch(() => [])
  const approval = await Promise.all(approvalEntries.filter((entry) => entry.isDirectory()).map((entry) => readMetadataItem(join(root, "approval", entry.name), "approval")))
  const libraries = await readdir(join(root, "libraries"), { withFileTypes: true }).catch(() => [])
  const approved = (await Promise.all(libraries.filter((library) => library.isDirectory()).map(async (library) => {
    const itemsRoot = join(root, "libraries", library.name, "items")
    const entries = await readdir(itemsRoot, { withFileTypes: true }).catch(() => [])
    return Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".partial-")).map((entry) => readMetadataItem(join(itemsRoot, entry.name), "approved")))
  }))).flat()
  return [...incoming, ...approval, ...approved]
}

async function readMetadataItem(root: string, kind: "approval" | "approved"): Promise<StoredItem> {
  const metadata = decodeArtItemMetadata(await readFile(join(root, "metadata.json"), "utf8"))
  return { id: metadata.id, root, kind, sha256: metadata.image.sha256, fileName: metadata.image.fileName, ...(metadata.source.kind ? { sourceKind: metadata.source.kind } : {}), ...(metadata.seed ? { seedSnapshot: metadata.seed.snapshot } : {}) }
}

async function removeEmptyIncomingBatches(root: string) {
  const batches = await readdir(join(root, "incoming"), { withFileTypes: true }).catch(() => [])
  for (const batch of batches.filter((entry) => entry.isDirectory())) {
    const batchRoot = join(root, "incoming", batch.name)
    if ((await readdir(batchRoot)).length) continue
    assertInside(root, batchRoot)
    await rm(batchRoot, { recursive: true })
  }
}

async function removeEmptyLibraries(root: string) {
  const libraries = await readdir(join(root, "libraries"), { withFileTypes: true }).catch(() => [])
  for (const library of libraries.filter((entry) => entry.isDirectory())) {
    const libraryRoot = join(root, "libraries", library.name)
    const items = await readdir(join(libraryRoot, "items"), { withFileTypes: true }).catch(() => [])
    if (items.some((item) => item.isDirectory())) continue
    assertInside(root, libraryRoot)
    await rm(libraryRoot, { recursive: true })
  }
}

function seedTarget(root: string, entry: ArtAtlasSeedManifestEntry) {
  return join(root, "libraries", safeArtDirectoryName(entry.library), "items", `${safeArtDirectoryName(entry.metadata.title, "作品")}-${entry.id}`)
}

function decodeSeed(input: string) {
  const value = record(JSON.parse(input) as unknown, "seed")
  const generatedAt = text(value.generated_at, "generated_at")
  return {
    generatedAt,
    orbits: array(value.orbitItems, "orbitItems").map(decodeOrbit),
    details: array(value.detailItems, "detailItems").map((item) => decodeDetail(item, generatedAt)),
    approvals: array(value.approvalItems, "approvalItems").map(decodeApproval),
  }
}

function decodeOrbit(input: unknown): SeedOrbitItem {
  const value = record(input, "orbit item")
  return { title: text(value.title, "orbit.title"), image: text(value.image, "orbit.image"), library: text(value.library, "orbit.library"), meta: text(value.meta, "orbit.meta"), tags: text(value.tags, "orbit.tags") }
}

function decodeDetail(input: unknown, generatedAt: string): SeedDetailItem {
  const value = record(input, "detail item")
  const prompt = record(value.aigcPrompt, "detail.aigcPrompt")
  const structured = prompt.structured_read && typeof prompt.structured_read === "object" && !Array.isArray(prompt.structured_read) ? prompt.structured_read as Record<string, unknown> : undefined
  const shot = structured?.shot_parameters && typeof structured.shot_parameters === "object" && !Array.isArray(structured.shot_parameters) ? structured.shot_parameters as Record<string, unknown> : undefined
  const publishedDate = optionalText(value.date)
  const movementNote = optionalText(value.movementNote)
  return {
    title: text(value.title, "detail.title"), artist: text(value.artist, "detail.artist"), ...(publishedDate ? { publishedDate } : {}), generatedAt,
    analysis: text(value.analysis, "detail.analysis"), ...(movementNote ? { movementNote } : {}), palette: strings(value.palette, "detail.palette"), patternTags: strings(value.patternTags, "detail.patternTags"),
    compositionTags: splitTags(optionalText(shot?.camera_angle) ?? ""), moodTags: strings(value.moodTags, "detail.moodTags"), promptDraft: text(value.promptDraft, "detail.promptDraft"), negativeTags: strings(value.negativeTags, "detail.negativeTags"), sourceUrl: text(value.sourceUrl, "detail.sourceUrl"),
  }
}

function decodeApproval(input: unknown): SeedApprovalItem {
  const value = record(input, "approval item")
  const automatic = record(value.auto, "approval.auto")
  const confidence = Number(automatic.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("art_library_seed_invalid: approval confidence is invalid")
  const publishedDate = optionalText(value.published_date)
  const movementNote = optionalText(value.movement_note)
  return {
    title: text(value.title_zh, "approval.title_zh"), artist: text(value.artist_display, "approval.artist_display"), ...(publishedDate ? { publishedDate } : {}), coverHref: text(value.cover_href, "approval.cover_href"),
    sourceUrl: text(value.source_url, "approval.source_url"), sourceTitle: text(value.source_title, "approval.source_title"), sourcePlatform: text(value.source_platform, "approval.source_platform"), galleryGroups: strings(value.gallery_groups, "approval.gallery_groups"), styleAnalysis: text(value.style_analysis, "approval.style_analysis"), ...(movementNote ? { movementNote } : {}),
    palette: strings(value.palette, "approval.palette"), patternTags: strings(value.pattern_tags, "approval.pattern_tags"), compositionTags: strings(value.composition_tags, "approval.composition_tags"), moodTags: strings(value.mood_tags, "approval.mood_tags"), promptDraft: text(value.prompt_draft, "approval.prompt_draft"), negativeTags: strings(value.negative_tags, "approval.negative_tags"), confidence,
  }
}

function buildOrbitMetadata(orbit: SeedOrbitItem, detail: SeedDetailItem): Omit<ArtItemMetadataV1, "id" | "image"> {
  return {
    schemaVersion: 1, title: orbit.title, artist: detail.artist, ...(detail.publishedDate ? { publishedDate: detail.publishedDate } : {}), collectedAt: detail.generatedAt,
    styleAnalysis: detail.analysis, ...(detail.movementNote ? { movementNote: detail.movementNote } : {}), palette: detail.palette, patternTags: detail.patternTags,
    compositionTags: detail.compositionTags.length ? detail.compositionTags : splitTags(orbit.tags), moodTags: detail.moodTags, promptDraft: detail.promptDraft, negativeTags: detail.negativeTags,
    suggestedLibrary: { title: orbit.library, confidence: 1 }, source: { pageUrl: detail.sourceUrl, imageUrl: `creatx-seed://art-atlas/${basename(orbit.image)}`, pageTitle: orbit.title, platform: platformFromMeta(orbit.meta), kind: "seed", displayName: orbit.title },
    seed: { source: "art-atlas-static", snapshot: ART_ATLAS_SEED_SNAPSHOT },
  }
}

function buildApprovalMetadata(item: SeedApprovalItem, generatedAt: string): Omit<ArtItemMetadataV1, "id" | "image"> {
  return {
    schemaVersion: 1, title: item.title, artist: item.artist, ...(item.publishedDate ? { publishedDate: item.publishedDate } : {}), collectedAt: generatedAt,
    styleAnalysis: item.styleAnalysis, ...(item.movementNote ? { movementNote: item.movementNote } : {}), palette: item.palette, patternTags: item.patternTags, compositionTags: item.compositionTags, moodTags: item.moodTags,
    promptDraft: item.promptDraft, negativeTags: item.negativeTags, suggestedLibrary: { title: libraryFromGroups(item.galleryGroups), confidence: item.confidence },
    source: { pageUrl: item.sourceUrl, imageUrl: `creatx-seed://art-approval/${basename(item.coverHref)}`, pageTitle: item.sourceTitle, platform: item.sourcePlatform, kind: "seed", displayName: item.title },
    seed: { source: "art-atlas-static", snapshot: ART_ATLAS_SEED_SNAPSHOT },
  }
}

interface SeedOrbitItem { title: string; image: string; library: string; meta: string; tags: string }
interface SeedDetailItem { title: string; artist: string; publishedDate?: string; generatedAt: string; analysis: string; movementNote?: string; palette: string[]; patternTags: string[]; compositionTags: string[]; moodTags: string[]; promptDraft: string; negativeTags: string[]; sourceUrl: string }
interface SeedApprovalItem { title: string; artist: string; publishedDate?: string; coverHref: string; sourceUrl: string; sourceTitle: string; sourcePlatform: string; galleryGroups: string[]; styleAnalysis: string; movementNote?: string; palette: string[]; patternTags: string[]; compositionTags: string[]; moodTags: string[]; promptDraft: string; negativeTags: string[]; confidence: number }

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

function requireSeedLibrary(input: string): ArtAtlasSeedManifestEntry["library"] {
  if (input === "巨构艺术" || input === "暖色风格" || input === "纪念碑谷") return input
  throw new Error(`art_library_seed_invalid: unsupported bundled library ${input}`)
}

function libraryFromGroups(groups: string[]) {
  if (groups.includes("巨构艺术")) return "巨构艺术" as const
  if (groups.includes("纪念碑谷")) return "纪念碑谷" as const
  throw new Error("art_library_seed_invalid: former approval item has no accepted library group")
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

function optionalText(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : undefined
}

function strings(input: unknown, name: string) {
  if (!Array.isArray(input) || input.some((item) => typeof item !== "string")) throw new Error(`art_library_seed_invalid: ${name} must be text array`)
  return input.map((item) => item.trim()).filter(Boolean)
}

function splitTags(input: string) {
  return [...new Set(input.split(/[·、，,；;]/u).map((item) => item.trim()).filter(Boolean))]
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
