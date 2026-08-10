import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { ART_IMAGE_MAX_BYTES, inspectArtImage } from "./image.ts"
import type { ArtApprovalEdits, ArtKeywordFrequency, ArtLibraryInspection, ArtLibraryItemProjection, ArtLibrarySnapshot, ArtLibrarySourceKind, ArtStyleEvidence, ArtStyleRepresentative, ReviewArtApprovalCommand } from "@creatx/contracts"
import { ArtNetworkClient, requirePublicHttpUrl, type ArtNetworkOptions } from "./network.ts"
import { decodeArtCandidate, decodeArtItemMetadata, requireArtApprovalEdits, requireArtItemMetadata, requireArtSourceRecord, safeArtDirectoryName, type ArtCandidateRecord, type ArtItemMetadata, type ArtSourceRecord } from "./schema.ts"

const PAGE_MAX_BYTES = 2_000_000
const candidateIdPattern = /^art_[0-9a-f]{16}$/u

export interface CollectArtImagesInput {
  query: string
  count?: number
  sourceUrls?: string[]
  signal?: AbortSignal
}

export interface ImportArtImagesInput {
  query: string
  images: Array<{ bytes: Uint8Array; source: ArtSourceRecord }>
  signal?: AbortSignal
}

export interface ArtLibraryServiceOptions extends ArtNetworkOptions {
  root: string
  now?: () => Date
  onChanged?: (revision: number) => void
}

export class ArtLibraryService {
  readonly root: string
  private readonly network: ArtNetworkClient
  private readonly now: () => Date
  private readonly onChanged: ((revision: number) => void) | undefined
  private mutations = Promise.resolve()
  private revision = 0

  constructor(options: ArtLibraryServiceOptions) {
    this.root = resolve(options.root)
    this.network = new ArtNetworkClient(options)
    this.now = options.now ?? (() => new Date())
    this.onChanged = options.onChanged
  }

  async initialize() {
    await Promise.all(["incoming", "approval", "libraries", ".state/rejected"].map((folder) => mkdir(join(this.root, folder), { recursive: true })))
  }

  collect(input: CollectArtImagesInput) {
    return this.serialize(async () => {
      await this.initialize()
      const query = requireText(input.query, "query", 300)
      const count = input.count === undefined ? 12 : Number(input.count)
      if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("art_library_invalid: count must be an integer from 1 to 30")
      const pages: Array<{ url: string; title?: string }> = input.sourceUrls?.length
        ? input.sourceUrls.slice(0, 20).map((url) => ({ url: requirePublicHttpUrl(url).href }))
        : await this.searchPages(query, input.signal)
      const batchId = `batch_${this.now().getTime()}_${randomUUID().slice(0, 8)}`
      const batchRoot = join(this.root, "incoming", batchId)
      const successes: Array<{ id: string; pageUrl: string; imageUrl: string; width: number; height: number; bytes: number }> = []
      const skipped: Array<{ url: string; reason: string; existingId?: string }> = []
      const failures: Array<{ url: string; error: string }> = []
      const attemptedImages = new Set<string>()

      for (const page of pages) {
        if (successes.length >= count) break
        input.signal?.throwIfAborted()
        try {
          const response = await this.network.read(page.url, ART_IMAGE_MAX_BYTES, input.signal)
          const directImage = response.contentType?.startsWith("image/") ? [response.finalUrl] : []
          if (!directImage.length && response.bytes.byteLength > PAGE_MAX_BYTES) throw new Error("art_network_too_large: HTML page exceeds limit")
          const imageUrls = directImage.length ? directImage : extractPageImageUrls(new TextDecoder().decode(response.bytes), response.finalUrl)
          for (const imageUrl of imageUrls) {
            if (successes.length >= count) break
            if (attemptedImages.has(imageUrl)) continue
            attemptedImages.add(imageUrl)
            try {
              const imageResponse = directImage.length && imageUrl === response.finalUrl ? response : await this.network.read(imageUrl, ART_IMAGE_MAX_BYTES, input.signal)
              const result = await this.ingestBytes(batchRoot, batchId, query, imageResponse.bytes, { pageUrl: response.finalUrl, imageUrl: imageResponse.finalUrl, ...(page.title ? { pageTitle: page.title } : {}) })
              if (result.state === "duplicate") {
                skipped.push({ url: imageResponse.finalUrl, reason: "duplicate", existingId: result.existingId })
                continue
              }
              successes.push(result.success)
            } catch (error) {
              if (input.signal?.aborted) throw input.signal.reason
              failures.push({ url: imageUrl, error: messageOf(error) })
            }
          }
        } catch (error) {
          if (input.signal?.aborted) throw input.signal.reason
          failures.push({ url: page.url, error: messageOf(error) })
        }
      }
      if (!successes.length) await rm(batchRoot, { recursive: true, force: true })
      if (successes.length) this.changed()
      return { batchId, query, requested: count, collected: successes.length, successes, skipped, failures }
    })
  }

  importImages(input: ImportArtImagesInput) {
    return this.serialize(async () => {
      await this.initialize()
      const query = requireText(input.query, "query", 300)
      if (!Array.isArray(input.images) || !input.images.length || input.images.length > 20) throw new Error("art_library_invalid: import from 1 to 20 images")
      const batchId = `batch_${this.now().getTime()}_${randomUUID().slice(0, 8)}`
      const batchRoot = join(this.root, "incoming", batchId)
      const successes: Array<{ id: string; pageUrl: string; imageUrl: string; width: number; height: number; bytes: number }> = []
      const skipped: Array<{ url: string; reason: string; existingId?: string }> = []
      const failures: Array<{ url: string; error: string }> = []
      for (const image of input.images) {
        input.signal?.throwIfAborted()
        const source = requireArtSourceRecord(image.source)
        try {
          const result = await this.ingestBytes(batchRoot, batchId, query, image.bytes, source)
          if (result.state === "duplicate") skipped.push({ url: source.imageUrl, reason: "duplicate", existingId: result.existingId })
          if (result.state === "collected") successes.push(result.success)
        } catch (error) {
          if (input.signal?.aborted) throw input.signal.reason
          failures.push({ url: source.imageUrl, error: messageOf(error) })
        }
      }
      if (!successes.length) await rm(batchRoot, { recursive: true, force: true })
      if (successes.length) this.changed()
      return { batchId, query, requested: input.images.length, collected: successes.length, successes, skipped, failures }
    })
  }

  async readCandidates(ids: string[], modelSupportsImages: boolean) {
    if (!modelSupportsImages) throw new Error("provider_capability: current model does not support image input")
    if (!Array.isArray(ids) || ids.length !== 1) throw new Error("art_library_invalid: read exactly one candidate id")
    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mediaType: string }> = []
    for (const id of ids) {
      const located = await this.findIncoming(requireCandidateId(id))
      if (!located) throw new Error(`art_library_missing: candidate ${id} does not exist`)
      const bytes = await readFile(join(located.root, located.record.image.fileName))
      if (createHash("sha256").update(bytes).digest("hex") !== located.record.image.sha256) throw new Error(`art_library_invalid: candidate ${id} image hash changed`)
      content.push({ type: "text", text: JSON.stringify({ candidateId: id, query: located.record.query, source: located.record.source, image: located.record.image }) })
      content.push({ type: "image", data: bytes.toString("base64"), mediaType: located.record.image.mediaType })
    }
    return content
  }

  submitApproval(items: Array<{ candidateId: string; metadata: unknown }>) {
    return this.serialize(async () => {
      await this.initialize()
      if (!Array.isArray(items) || items.length !== 1) throw new Error("art_library_invalid: submit exactly one candidate")
      const results = []
      for (const item of items) results.push(await this.submitOne(item.candidateId, item.metadata))
      if (results.some((result) => !result.replayed)) this.changed()
      return results
    })
  }

  review(input: ReviewArtApprovalCommand) {
    return this.serialize(async () => {
      await this.initialize()
      if (input.action !== "approve" && input.action !== "reject" && input.action !== "hold") throw new Error("art_library_invalid: review action is invalid")
      const id = requireCandidateId(input.itemId)
      if (input.action === "hold") return { itemId: id, state: "approval" as const, replayed: true }
      const approved = await this.findApproved(id)
      if (approved) {
        if (input.action === "approve" && (!input.targetLibrary || safeArtDirectoryName(input.targetLibrary) === approved.library)) return { itemId: id, state: "approved" as const, library: approved.library, replayed: true }
        throw new Error(`art_library_conflict: item ${id} is already approved in ${approved.library}`)
      }
      const approvalRoot = this.inside("approval", id)
      const metadata = await readMetadata(approvalRoot)
      if (!metadata) {
        const rejected = await exists(this.inside(".state", "rejected", `${id}.json`))
        if (input.action === "reject" && rejected) return { itemId: id, state: "rejected" as const, replayed: true }
        throw new Error(`art_library_missing: approval item ${id} does not exist`)
      }
      if (input.action === "reject") {
        await writeJson(this.inside(".state", "rejected", `${id}.json`), { schemaVersion: 1, id, rejectedAt: this.now().toISOString() })
        await rm(approvalRoot, { recursive: true, force: true })
        this.changed()
        return { itemId: id, state: "rejected" as const, replayed: false }
      }
      const targetLibrary = safeArtDirectoryName(input.targetLibrary ?? metadata.suggestedLibrary.title)
      const next = applyReviewEdits(metadata, input.edits, targetLibrary)
      await writeJson(join(approvalRoot, "metadata.json"), next)
      const libraryRoot = this.inside("libraries", targetLibrary)
      await mkdir(join(libraryRoot, "items"), { recursive: true })
      const libraryRecord = join(libraryRoot, "library.json")
      if (!(await exists(libraryRecord))) await writeJson(libraryRecord, { schemaVersion: 1, title: targetLibrary, createdAt: this.now().toISOString() })
      const targetRoot = join(libraryRoot, "items", `${safeArtDirectoryName(next.title, "作品")}-${id}`)
      if (await exists(targetRoot)) throw new Error(`art_library_conflict: target item directory already exists for ${id}`)
      await rename(approvalRoot, targetRoot)
      this.changed()
      return { itemId: id, state: "approved" as const, library: targetLibrary, replayed: false }
    })
  }

  async exportStyleKeywords(libraryInput: string) {
    await this.initialize()
    const library = safeArtDirectoryName(libraryInput)
    const itemsRoot = this.inside("libraries", library, "items")
    if (!(await exists(itemsRoot))) throw new Error(`art_library_missing: library ${library} does not exist`)
    const items = (await readdir(itemsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(itemsRoot, entry.name))
    const records = (await Promise.all(items.map(readMetadata))).filter((item): item is ArtItemMetadata => Boolean(item)).sort((a, b) => a.collectedAt.localeCompare(b.collectedAt) || a.id.localeCompare(b.id))
    const seen = new Set<string>()
    const keywords = records.flatMap((item) => [...item.patternTags, ...item.compositionTags, ...item.moodTags]).flatMap((keyword) => {
      const display = keyword.normalize("NFKC").trim()
      const key = display.toLocaleLowerCase("en-US")
      if (!display || seen.has(key)) return []
      seen.add(key)
      return [display]
    })
    return { library, itemCount: records.length, keywords, text: keywords.join(", ") }
  }

  async snapshot(scopeInput: { kind: "all" } | { kind: "library"; title: string } = { kind: "all" }): Promise<ArtLibraryInspection> {
    await this.initialize()
    const scope = requireStyleScope(scopeInput)
    const libraries = await readdir(this.inside("libraries"), { withFileTypes: true })
    const approval = await readdir(this.inside("approval"), { withFileTypes: true })
    const incoming = await readdir(this.inside("incoming"), { withFileTypes: true })
    const records = (await Promise.all(libraries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const itemsRoot = join(this.root, "libraries", entry.name, "items")
      const items = (await Promise.all((await readdir(itemsRoot, { withFileTypes: true }).catch(() => []))
        .filter((item) => item.isDirectory())
        .map((item) => readMetadata(join(itemsRoot, item.name)))))
        .filter((item): item is ArtItemMetadata => Boolean(item))
        .sort(compareArtItems)
      return { title: entry.name, items }
    }))).sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
    const selected = scope.kind === "all" ? records : records.filter((library) => library.title === scope.title)
    if (scope.kind === "library" && !selected.length) throw new Error(`art_library_missing: library ${scope.title} does not exist`)
    const projected = selected.map((library) => buildStyleEvidence("library", library.items.map((metadata) => ({ metadata, library: library.title })), library.title) as ArtStyleEvidence & { kind: "library"; title: string })
    return {
      libraries: projected,
      styleScope: scope.kind === "all"
        ? buildStyleEvidence("all", records.flatMap((library) => library.items.map((metadata) => ({ metadata, library: library.title }))))
        : projected[0]!,
      approvalIds: approval.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
      incomingBatches: incoming.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    }
  }

  private async searchPages(query: string, signal?: AbortSignal) {
    const response = await this.network.read(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, PAGE_MAX_BYTES, signal)
    return parseBingRss(new TextDecoder().decode(response.bytes)).slice(0, 12)
  }

  private async submitOne(idInput: string, input: unknown) {
    const id = requireCandidateId(idInput)
    const existing = await readMetadata(this.inside("approval", id))
    if (existing) {
      const located = await this.findApproved(id)
      if (located) throw new Error(`art_library_conflict: item ${id} is already approved`)
      const candidate = candidateFromMetadata(existing)
      const next = requireArtItemMetadata(input, candidate)
      if (JSON.stringify(existing) !== JSON.stringify(next)) throw new Error(`art_library_conflict: approval ${id} was already submitted with different metadata`)
      return { itemId: id, state: "approval" as const, replayed: true }
    }
    const located = await this.findIncoming(id)
    if (!located) {
      const approved = await this.findApproved(id)
      if (approved) throw new Error(`art_library_conflict: item ${id} is already approved`)
      throw new Error(`art_library_missing: candidate ${id} does not exist`)
    }
    const metadata = requireArtItemMetadata(input, located.record)
    await writeJson(join(located.root, "metadata.json"), metadata)
    await writeJson(join(located.root, "source.json"), metadata.source)
    const target = this.inside("approval", id)
    if (await exists(target)) throw new Error(`art_library_conflict: approval ${id} already exists`)
    await rename(located.root, target)
    await rm(dirname(located.root), { recursive: false }).catch(() => undefined)
    return { itemId: id, state: "approval" as const, replayed: false }
  }

  private async findIncoming(id: string) {
    const incomingRoot = this.inside("incoming")
    const batches = await readdir(incomingRoot, { withFileTypes: true }).catch(() => [])
    for (const batch of batches.filter((entry) => entry.isDirectory())) {
      const root = join(incomingRoot, batch.name, id)
      if (!(await exists(root))) continue
      return { root, record: decodeArtCandidate(await readFile(join(root, "candidate.json"), "utf8")) }
    }
  }

  async projection(): Promise<ArtLibrarySnapshot> {
    await this.initialize()
    const approvalItems = (await Promise.all((await readdir(this.inside("approval"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => readMetadata(join(this.root, "approval", entry.name)))))
      .filter((item): item is ArtItemMetadata => Boolean(item))
      .sort(compareArtItems)
      .map((item) => projectArtItem(item, "approval"))
    const libraries = await Promise.all((await readdir(this.inside("libraries"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      .map(async (entry) => {
        const itemsRoot = join(this.root, "libraries", entry.name, "items")
        const items = (await Promise.all((await readdir(itemsRoot, { withFileTypes: true }).catch(() => []))
          .filter((item) => item.isDirectory())
          .map((item) => readMetadata(join(itemsRoot, item.name)))))
          .filter((item): item is ArtItemMetadata => Boolean(item))
          .sort(compareArtItems)
          .map((item) => projectArtItem(item, "approved", entry.name))
        return { title: entry.name, itemCount: items.length, items }
      }))
    const incomingCount = (await Promise.all((await readdir(this.inside("incoming"), { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => (await readdir(join(this.root, "incoming", entry.name), { withFileTypes: true }).catch(() => [])).filter((item) => item.isDirectory() && !item.name.startsWith(".partial-")).length)))
      .reduce((total, count) => total + count, 0)
    return { revision: this.revision, incomingCount, approvalItems, libraries, refreshedAt: this.now().toISOString() }
  }

  async readOriginal(idInput: string) {
    await this.initialize()
    const id = requireCandidateId(idInput)
    const approvalRoot = this.inside("approval", id)
    const approval = await readMetadata(approvalRoot)
    const approved = approval ? undefined : await this.findApproved(id)
    const root = approval ? approvalRoot : approved?.root
    const metadata = approval ?? approved?.metadata
    if (!root || !metadata) throw new Error(`art_library_missing: item ${id} does not exist`)
    const bytes = new Uint8Array(await readFile(join(root, metadata.image.fileName)))
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.image.sha256) throw new Error(`art_library_invalid: item ${id} image hash changed`)
    return { mediaType: metadata.image.mediaType, bytes }
  }

  private async ingestBytes(batchRoot: string, batchId: string, query: string, bytes: Uint8Array, source: ArtSourceRecord) {
    const info = inspectArtImage(bytes)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const existing = await this.findBySha256(sha256)
    if (existing) return { state: "duplicate" as const, existingId: existing.id }
    const id = `art_${sha256.slice(0, 16)}`
    const record: ArtCandidateRecord = {
      schemaVersion: 1,
      id,
      batchId,
      query,
      collectedAt: this.now().toISOString(),
      source,
      image: { fileName: `original.${info.extension}`, mediaType: info.mediaType, bytes: bytes.byteLength, width: info.width, height: info.height, sha256 },
    }
    const partialRoot = join(batchRoot, `.partial-${id}`)
    const candidateRoot = join(batchRoot, id)
    await mkdir(partialRoot, { recursive: true })
    try {
      await writeFile(join(partialRoot, record.image.fileName), bytes, { flag: "wx" })
      await writeJson(join(partialRoot, "candidate.json"), record)
      await rename(partialRoot, candidateRoot)
    } catch (error) {
      await rm(partialRoot, { recursive: true, force: true })
      throw error
    }
    return { state: "collected" as const, success: { id, pageUrl: source.pageUrl, imageUrl: source.imageUrl, width: info.width, height: info.height, bytes: bytes.byteLength } }
  }

  private async findApproved(id: string) {
    const librariesRoot = this.inside("libraries")
    const libraries = await readdir(librariesRoot, { withFileTypes: true }).catch(() => [])
    for (const library of libraries.filter((entry) => entry.isDirectory())) {
      const itemsRoot = join(librariesRoot, library.name, "items")
      const items = await readdir(itemsRoot, { withFileTypes: true }).catch(() => [])
      for (const item of items.filter((entry) => entry.isDirectory())) {
        const metadata = await readMetadata(join(itemsRoot, item.name))
        if (metadata?.id === id) return { library: library.name, root: join(itemsRoot, item.name), metadata }
      }
    }
  }

  private async findBySha256(sha256: string) {
    const incoming = await this.findRecord((record) => record.image.sha256 === sha256)
    if (incoming) return incoming
    const approval = await readdir(this.inside("approval"), { withFileTypes: true }).catch(() => [])
    for (const entry of approval.filter((value) => value.isDirectory())) {
      const metadata = await readMetadata(join(this.root, "approval", entry.name))
      if (metadata?.image.sha256 === sha256) return { id: metadata.id, state: "approval" }
    }
    const approved = await this.findApprovedBySha(sha256)
    return approved ? { id: approved.metadata.id, state: "approved" } : undefined
  }

  private async findRecord(predicate: (record: ArtCandidateRecord) => boolean) {
    const batches = await readdir(this.inside("incoming"), { withFileTypes: true }).catch(() => [])
    for (const batch of batches.filter((entry) => entry.isDirectory())) {
      const entries = await readdir(join(this.root, "incoming", batch.name), { withFileTypes: true }).catch(() => [])
      for (const entry of entries.filter((value) => value.isDirectory() && !value.name.startsWith(".partial-"))) {
        const record = decodeArtCandidate(await readFile(join(this.root, "incoming", batch.name, entry.name, "candidate.json"), "utf8"))
        if (predicate(record)) return { id: record.id, state: "incoming" }
      }
    }
  }

  private async findApprovedBySha(sha256: string) {
    const libraries = await readdir(this.inside("libraries"), { withFileTypes: true }).catch(() => [])
    for (const library of libraries.filter((entry) => entry.isDirectory())) {
      const itemsRoot = join(this.root, "libraries", library.name, "items")
      const items = await readdir(itemsRoot, { withFileTypes: true }).catch(() => [])
      for (const item of items.filter((entry) => entry.isDirectory())) {
        const metadata = await readMetadata(join(itemsRoot, item.name))
        if (metadata?.image.sha256 === sha256) return { library: library.name, metadata }
      }
    }
  }

  private inside(...segments: string[]) {
    const target = resolve(this.root, ...segments)
    const relation = relative(this.root, target)
    if (!relation || relation === ".") return target
    if (relation.startsWith("..") || resolve(this.root, relation) !== target) throw new Error("art_library_path: target escapes the personal art library")
    return target
  }

  private serialize<T>(operation: () => Promise<T>) {
    const next = this.mutations.then(operation, operation)
    this.mutations = next.then(() => undefined, () => undefined)
    return next
  }

  private changed() {
    this.revision += 1
    this.onChanged?.(this.revision)
  }
}

export function parseBingRss(xml: string) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)].flatMap((match) => {
    const url = decodeXml(match[1]?.match(/<link>([\s\S]*?)<\/link>/iu)?.[1] ?? "").trim()
    if (!url) return []
    return [{ url, title: decodeXml(match[1]?.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] ?? "").trim() }]
  })
}

export function extractPageImageUrls(html: string, pageUrl: string) {
  const candidates = [
    ...[...html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["'][^>]*>/giu)].map((match) => match[1]),
    ...[...html.matchAll(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]*>/giu)].map((match) => match[1]),
    ...[...html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/giu)].map((match) => match[1]),
  ].filter((candidate): candidate is string => typeof candidate === "string")
  const urls = new Set<string>()
  candidates.forEach((candidate) => {
    try {
      const decoded = decodeHtml(candidate).trim()
      if (!decoded || decoded.startsWith("data:") || decoded.startsWith("blob:")) return
      urls.add(requirePublicHttpUrl(new URL(decoded, pageUrl).href).href)
    } catch {}
  })
  return [...urls].slice(0, 40)
}

function applyReviewEdits(metadata: ArtItemMetadata, editsInput: ArtApprovalEdits | undefined, targetLibrary: string): ArtItemMetadata {
  const edits = editsInput === undefined ? undefined : requireArtApprovalEdits(editsInput)
  if (!edits) return { ...metadata, suggestedLibrary: { ...metadata.suggestedLibrary, title: targetLibrary } }
  if (metadata.schemaVersion === 1) {
    if (edits.reversePrompt) throw new Error("art_library_conflict: legacy item must be visually re-curated before reversePrompt edits")
    return {
      ...metadata,
      ...(edits.title === undefined ? {} : { title: edits.title }),
      ...(edits.styleAnalysis === undefined ? {} : { styleAnalysis: edits.styleAnalysis }),
      ...(edits.palette === undefined ? {} : { palette: edits.palette }),
      ...(edits.patternTags === undefined ? {} : { patternTags: edits.patternTags }),
      ...(edits.compositionTags === undefined ? {} : { compositionTags: edits.compositionTags }),
      ...(edits.moodTags === undefined ? {} : { moodTags: edits.moodTags }),
      suggestedLibrary: { ...metadata.suggestedLibrary, title: targetLibrary },
    }
  }
  const candidate = candidateFromMetadata(metadata)
  return requireArtItemMetadata({
    title: edits.title ?? metadata.title,
    artist: metadata.artist,
    ...(metadata.publishedDate ? { publishedDate: metadata.publishedDate } : {}),
    styleAnalysis: edits.styleAnalysis ?? metadata.styleAnalysis,
    ...(metadata.movementNote ? { movementNote: metadata.movementNote } : {}),
    palette: edits.palette ?? metadata.palette,
    patternTags: edits.patternTags ?? metadata.patternTags,
    compositionTags: edits.compositionTags ?? metadata.compositionTags,
    moodTags: edits.moodTags ?? metadata.moodTags,
    reversePrompt: edits.reversePrompt ?? metadata.reversePrompt,
    suggestedLibrary: { ...metadata.suggestedLibrary, title: targetLibrary },
  }, candidate)
}

function candidateFromMetadata(metadata: ArtItemMetadata): ArtCandidateRecord {
  return { schemaVersion: 1, id: metadata.id, batchId: "submitted", query: "", collectedAt: metadata.collectedAt, source: metadata.source, image: metadata.image }
}

function projectArtItem(metadata: ArtItemMetadata, state: "approval" | "approved", library?: string): ArtLibraryItemProjection {
  const sourceKind: ArtLibrarySourceKind = metadata.source.kind ?? (metadata.seed ? "seed" : "web")
  const sourceUrl = /^https?:\/\//iu.test(metadata.source.pageUrl) ? metadata.source.pageUrl : undefined
  return {
    id: metadata.id,
    state,
    title: metadata.title,
    artist: metadata.artist,
    ...(metadata.publishedDate ? { publishedDate: metadata.publishedDate } : {}),
    collectedAt: metadata.collectedAt,
    styleAnalysis: metadata.styleAnalysis,
    ...(metadata.movementNote ? { movementNote: metadata.movementNote } : {}),
    palette: metadata.palette,
    patternTags: metadata.patternTags,
    compositionTags: metadata.compositionTags,
    moodTags: metadata.moodTags,
    curation: metadata.schemaVersion === 1
      ? { status: "legacy-unverified", promptDraft: metadata.promptDraft, negativeTags: metadata.negativeTags }
      : { status: "current", method: metadata.curationMethod, reversePrompt: metadata.reversePrompt },
    suggestedLibrary: metadata.suggestedLibrary,
    sourceKind,
    sourceLabel: metadata.source.displayName ?? metadata.source.pageTitle ?? metadata.source.platform ?? metadata.source.pageUrl,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(metadata.source.projectRelativePath ? { projectRelativePath: metadata.source.projectRelativePath } : {}),
    imageUrl: `creatx-art-library://item/${metadata.id}/original`,
    image: { mediaType: metadata.image.mediaType, bytes: metadata.image.bytes, width: metadata.image.width, height: metadata.image.height, sha256: metadata.image.sha256 },
    ...(library ? { library } : {}),
  }
}

function compareArtItems(left: ArtItemMetadata, right: ArtItemMetadata) {
  return left.collectedAt.localeCompare(right.collectedAt) || left.id.localeCompare(right.id)
}

function requireStyleScope(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("art_library_invalid: style scope must be an object")
  const value = input as { kind?: unknown; title?: unknown }
  const keys = Object.keys(input)
  if (value.kind === "all" && keys.length === 1 && keys[0] === "kind") return { kind: "all" as const }
  if (value.kind === "library" && keys.length === 2 && keys.includes("kind") && keys.includes("title") && typeof value.title === "string" && value.title.trim()) return { kind: "library" as const, title: safeArtDirectoryName(value.title) }
  throw new Error("art_library_invalid: style scope is invalid")
}

function buildStyleEvidence(kind: "all" | "library", items: Array<{ metadata: ArtItemMetadata; library: string }>, title?: string): ArtStyleEvidence {
  return {
    kind,
    ...(title ? { title } : {}),
    itemCount: items.length,
    keywordFrequencies: {
      pattern: countKeywords(items.map((item) => item.metadata.patternTags)),
      composition: countKeywords(items.map((item) => item.metadata.compositionTags)),
      mood: countKeywords(items.map((item) => item.metadata.moodTags)),
    },
    representatives: selectStyleRepresentatives(items),
  }
}

function countKeywords(groups: string[][]): ArtKeywordFrequency[] {
  const records = new Map<string, ArtKeywordFrequency>()
  groups.forEach((keywords) => {
    const itemKeys = new Set<string>()
    keywords.forEach((keyword) => {
      const display = keyword.normalize("NFKC").trim()
      const key = display.toLocaleLowerCase("en-US")
      if (!display || itemKeys.has(key)) return
      itemKeys.add(key)
      const existing = records.get(key)
      if (existing) existing.count += 1
      else records.set(key, { keyword: display, count: 1 })
    })
  })
  return [...records.values()]
}

function selectStyleRepresentatives(items: Array<{ metadata: ArtItemMetadata; library: string }>): ArtStyleRepresentative[] {
  const remaining = [...items]
  const selected: Array<{ metadata: ArtItemMetadata; library: string }> = []
  const covered = new Set<string>()
  while (remaining.length && selected.length < 4) {
    const next = remaining.sort((left, right) => {
      const leftTags = normalizedArtTags(left.metadata)
      const rightTags = normalizedArtTags(right.metadata)
      const newDifference = rightTags.filter((tag) => !covered.has(tag)).length - leftTags.filter((tag) => !covered.has(tag)).length
      return newDifference || rightTags.length - leftTags.length || compareArtItems(left.metadata, right.metadata)
    })[0]!
    selected.push(next)
    normalizedArtTags(next.metadata).forEach((tag) => covered.add(tag))
    remaining.splice(remaining.indexOf(next), 1)
  }
  return selected.map((item) => ({
    id: item.metadata.id,
    title: item.metadata.title,
    library: item.library,
    styleAnalysis: item.metadata.styleAnalysis,
    patternTags: item.metadata.patternTags,
    compositionTags: item.metadata.compositionTags,
    moodTags: item.metadata.moodTags,
    curationStatus: item.metadata.schemaVersion === 2 ? "current" : "legacy-unverified",
  }))
}

function normalizedArtTags(metadata: ArtItemMetadata) {
  return [...new Set([...metadata.patternTags, ...metadata.compositionTags, ...metadata.moodTags].map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase("en-US")).filter(Boolean))]
}

async function readMetadata(root: string) {
  try {
    return decodeArtItemMetadata(await readFile(join(root, "metadata.json"), "utf8"))
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`, { encoding: "utf8" })
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

function requireCandidateId(input: string) {
  if (typeof input !== "string" || !candidateIdPattern.test(input)) throw new Error("art_library_invalid: candidate id is invalid")
  return input
}

function requireText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`art_library_invalid: ${name} is required`)
  return value.trim().slice(0, maxLength)
}

function decodeXml(value: string) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/gu, "").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'")
}

function decodeHtml(value: string) {
  return decodeXml(value).replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function isMissing(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
