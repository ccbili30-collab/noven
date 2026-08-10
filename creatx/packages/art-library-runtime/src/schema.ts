import type { ArtApprovalEdits, ArtReversePrompt, ReviewArtApprovalCommand } from "@creatx/contracts"

const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

export type { ArtReversePrompt } from "@creatx/contracts"

export interface ArtSourceRecord {
  pageUrl: string
  imageUrl: string
  pageTitle?: string
  platform?: string
  kind?: "web" | "chat-attachment" | "project-file" | "seed"
  displayName?: string
  projectRelativePath?: string
}

export interface ArtImageRecord {
  fileName: string
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  bytes: number
  width: number
  height: number
  sha256: string
}

export interface ArtCandidateRecord {
  schemaVersion: 1
  id: string
  batchId: string
  query: string
  collectedAt: string
  source: ArtSourceRecord
  image: ArtImageRecord
}

interface ArtItemMetadataBase {
  id: string
  title: string
  artist: string
  publishedDate?: string
  collectedAt: string
  styleAnalysis: string
  movementNote?: string
  palette: string[]
  patternTags: string[]
  compositionTags: string[]
  moodTags: string[]
  suggestedLibrary: { title: string; confidence: number }
  source: ArtSourceRecord
  image: ArtImageRecord
  seed?: { source: "art-atlas-static"; snapshot: string }
}

export interface ArtItemMetadataV1 extends ArtItemMetadataBase {
  schemaVersion: 1
  promptDraft: string
  negativeTags: string[]
}

export interface ArtItemMetadataV2 extends ArtItemMetadataBase {
  schemaVersion: 2
  curationMethod: "visual-curation-v1"
  reversePrompt: ArtReversePrompt
}

export type ArtItemMetadata = ArtItemMetadataV1 | ArtItemMetadataV2

export function safeArtDirectoryName(input: string, fallback = "未分类") {
  const normalized = input.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ").replace(/\s+/gu, " ").trim().replace(/[. ]+$/gu, "").slice(0, 80)
  const safe = normalized && !windowsReservedNames.test(normalized) ? normalized : fallback
  if (!safe || safe === "." || safe === "..") throw new Error("art_library_invalid: directory name is empty")
  return safe
}

export function requireArtItemMetadata(input: unknown, candidate: ArtCandidateRecord): ArtItemMetadataV2 {
  const value = requireRecord(input, "art approval metadata")
  const allowed = new Set(["title", "artist", "publishedDate", "styleAnalysis", "movementNote", "palette", "patternTags", "compositionTags", "moodTags", "reversePrompt", "suggestedLibrary"])
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("art_library_invalid: art approval metadata contains unsupported fields")
  const title = requireText(value.title, "title", 160)
  const artist = requireText(value.artist, "artist", 160)
  const styleAnalysis = requireText(value.styleAnalysis, "styleAnalysis", 4_000)
  const reversePrompt = requireReversePrompt(value.reversePrompt)
  if (reversePromptContainsIdentity(reversePrompt, title, artist)) throw new Error("art_library_invalid: reversePrompt must describe visible language instead of the title or artist")
  const library = requireRecord(value.suggestedLibrary, "suggestedLibrary")
  const confidence = Number(library.confidence)
  const publishedDate = optionalText(value.publishedDate, 40)
  const movementNote = optionalText(value.movementNote, 4_000)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("art_library_invalid: confidence must be between 0 and 1")
  return {
    schemaVersion: 2,
    curationMethod: "visual-curation-v1",
    id: candidate.id,
    title,
    artist,
    ...(publishedDate ? { publishedDate } : {}),
    collectedAt: candidate.collectedAt,
    styleAnalysis,
    ...(movementNote ? { movementNote } : {}),
    palette: requireStringArray(value.palette, "palette", 12),
    patternTags: requireStringArray(value.patternTags, "patternTags", 40),
    compositionTags: requireStringArray(value.compositionTags, "compositionTags", 40),
    moodTags: requireStringArray(value.moodTags, "moodTags", 40),
    reversePrompt,
    suggestedLibrary: { title: requireText(library.title, "suggestedLibrary.title", 80), confidence },
    source: candidate.source,
    image: candidate.image,
  }
}

export function decodeArtCandidate(input: string): ArtCandidateRecord {
  const value = JSON.parse(input) as ArtCandidateRecord
  if (value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.batchId !== "string" || typeof value.query !== "string" || typeof value.collectedAt !== "string" || !value.source || !value.image) throw new Error("art_library_invalid: candidate record is invalid")
  requireArtSourceRecord(value.source)
  return value
}

export function decodeArtItemMetadata(input: string): ArtItemMetadata {
  const value = JSON.parse(input) as ArtItemMetadata
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.artist !== "string" || typeof value.styleAnalysis !== "string" || !Array.isArray(value.palette) || !Array.isArray(value.patternTags) || !Array.isArray(value.compositionTags) || !Array.isArray(value.moodTags) || !value.suggestedLibrary || !value.source || !value.image) throw new Error("art_library_invalid: item metadata is invalid")
  requireArtSourceRecord(value.source)
  if (value.schemaVersion === 1 && (typeof value.promptDraft !== "string" || !Array.isArray(value.negativeTags))) throw new Error("art_library_invalid: legacy item metadata is invalid")
  if (value.schemaVersion === 2) {
    if (value.curationMethod !== "visual-curation-v1") throw new Error("art_library_invalid: curation method is invalid")
    requireReversePrompt(value.reversePrompt)
  }
  return value
}

export function requireArtSourceRecord(input: unknown): ArtSourceRecord {
  const value = requireRecord(input, "source")
  const keys = new Set(["pageUrl", "imageUrl", "pageTitle", "platform", "kind", "displayName", "projectRelativePath"])
  if (Object.keys(value).some((key) => !keys.has(key))) throw new Error("art_library_invalid: source contains unsupported fields")
  requireText(value.pageUrl, "source.pageUrl", 4_000)
  requireText(value.imageUrl, "source.imageUrl", 4_000)
  if (value.pageTitle !== undefined) requireText(value.pageTitle, "source.pageTitle", 500)
  if (value.platform !== undefined) requireText(value.platform, "source.platform", 160)
  if (value.displayName !== undefined) requireText(value.displayName, "source.displayName", 500)
  if (value.kind !== undefined && value.kind !== "web" && value.kind !== "chat-attachment" && value.kind !== "project-file" && value.kind !== "seed") throw new Error("art_library_invalid: source kind is invalid")
  if (value.projectRelativePath !== undefined && value.kind !== "project-file") throw new Error("art_library_invalid: source project path requires project-file kind")
  if (value.projectRelativePath !== undefined) requireText(value.projectRelativePath, "source.projectRelativePath", 4_000)
  return value as unknown as ArtSourceRecord
}

export function requireArtApprovalEdits(input: unknown): ArtApprovalEdits {
  const value = requireRecord(input, "review edits")
  const allowed = new Set(["title", "styleAnalysis", "palette", "patternTags", "compositionTags", "moodTags", "reversePrompt"])
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("art_library_invalid: review edits contain unsupported fields")
  return {
    ...(value.title === undefined ? {} : { title: requireText(value.title, "review title", 160) }),
    ...(value.styleAnalysis === undefined ? {} : { styleAnalysis: requireText(value.styleAnalysis, "review styleAnalysis", 4_000) }),
    ...(value.palette === undefined ? {} : { palette: requireStringArray(value.palette, "review palette", 12) }),
    ...(value.patternTags === undefined ? {} : { patternTags: requireStringArray(value.patternTags, "review patternTags", 40) }),
    ...(value.compositionTags === undefined ? {} : { compositionTags: requireStringArray(value.compositionTags, "review compositionTags", 40) }),
    ...(value.moodTags === undefined ? {} : { moodTags: requireStringArray(value.moodTags, "review moodTags", 40) }),
    ...(value.reversePrompt === undefined ? {} : { reversePrompt: requireReversePrompt(value.reversePrompt) }),
  }
}

export function requireReviewArtApprovalCommand(input: unknown): ReviewArtApprovalCommand {
  const value = requireRecord(input, "review command")
  const allowed = new Set(["itemId", "action", "targetLibrary", "edits"])
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("art_library_invalid: review command contains unsupported fields")
  if (typeof value.itemId !== "string" || !/^art_[0-9a-f]{16}$/u.test(value.itemId)) throw new Error("art_library_invalid: review itemId is invalid")
  if (value.action !== "approve" && value.action !== "reject" && value.action !== "hold") throw new Error("art_library_invalid: review action is invalid")
  if (value.targetLibrary !== undefined && (typeof value.targetLibrary !== "string" || !value.targetLibrary.trim())) throw new Error("art_library_invalid: target library is invalid")
  const edits = value.edits === undefined ? undefined : requireArtApprovalEdits(value.edits)
  return { itemId: value.itemId, action: value.action, ...(typeof value.targetLibrary === "string" ? { targetLibrary: value.targetLibrary.trim() } : {}), ...(edits ? { edits } : {}) }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`art_library_invalid: ${name} must be an object`)
  return value as Record<string, unknown>
}

function requireReversePrompt(input: unknown): ArtReversePrompt {
  const value = requireRecord(input, "reversePrompt")
  const allowed = new Set(["style", "composition", "scene", "negative"])
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("art_library_invalid: reversePrompt contains unsupported fields")
  return {
    style: requireText(value.style, "reversePrompt.style", 4_000),
    composition: requireText(value.composition, "reversePrompt.composition", 4_000),
    scene: requireText(value.scene, "reversePrompt.scene", 4_000),
    negative: requireStringArray(value.negative, "reversePrompt.negative", 40),
  }
}

function reversePromptContainsIdentity(prompt: ArtReversePrompt, title: string, artist: string) {
  const text = [prompt.style, prompt.composition, prompt.scene, ...prompt.negative].join("\n").normalize("NFKC").toLocaleLowerCase("en-US")
  const ignored = new Set(["未知", "未知作者", "unknown", "unknown artist", "佚名", "anonymous"])
  return [title, artist].some((value) => {
    const identity = value.normalize("NFKC").trim().toLocaleLowerCase("en-US")
    return identity.length >= 3 && !ignored.has(identity) && text.includes(identity)
  })
}

function requireText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`art_library_invalid: ${name} is required`)
  return value.trim().slice(0, maxLength)
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined
}

function requireStringArray(value: unknown, name: string, maxItems: number) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`art_library_invalid: ${name} must be a string array`)
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].slice(0, maxItems)
}
