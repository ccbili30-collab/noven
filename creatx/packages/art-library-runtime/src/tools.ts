import { createHash } from "node:crypto"
import type { CreatXError, CreatXToolContribution } from "@creatx/contracts"
import type { ProjectFileQueryPort } from "@creatx/project-files"
import type { ArtLibraryService } from "./service.ts"
import { ART_VISUAL_CURATION_METHOD } from "./visual-curation.ts"
import { requireReviewArtApprovalCommand } from "./schema.ts"

export const ART_LIBRARY_CORE_GUIDANCE = `CreatX has one global personal art library shared by ordinary conversations. Use collect_art_images for public-web discovery and import_art_images for images attached to the current admitted turn or already inside the current trusted project. Inspect and submit each candidate separately. Collection never means approval: do not call review_art_approval with approve unless the user explicitly approves a pending item. Use export_art_style_keywords for a deterministic union of approved item tags. ${ART_VISUAL_CURATION_METHOD}`

export interface ArtTurnImageSourcePort {
  read(sessionId: string, index: number): { index: number; displayName: string; mediaType: "image/png" | "image/jpeg"; bytes: Uint8Array; sha256: string }
}

export function createArtLibraryTools(service: ArtLibraryService, options: { projectFiles?: ProjectFileQueryPort; turnImages?: ArtTurnImageSourcePort } = {}): CreatXToolContribution[] {
  return [collectTool(service), importTool(service, options), readTool(service), submitTool(service), inspectTool(service), reviewTool(service), exportTool(service)]
}

function collectTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "collect_art_images",
    audiences: ["ordinary"],
    description: "Search public web pages and download image candidates into the one global personal art library's private incoming area. Use when the user asks to collect an artist, artwork, or visual style. Defaults to 12 and allows at most 30. This validates public-network targets, image bytes, dimensions, size, redirects, and SHA-256 duplicates. It never approves, classifies, or places an item in a permanent library. After success, inspect candidate ids with read_art_images.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 300, description: "Artist, artwork, visual style, or precise public-web search query." },
        count: { type: "integer", minimum: 1, maximum: 30, default: 12 },
        sourceUrls: { type: "array", maxItems: 20, items: { type: "string", format: "uri" }, description: "Optional known public source pages or direct image URLs. When present, skip web search and collect only from these sources." },
      },
    },
    scope: "application",
    approval: "required",
    timeoutMs: 180_000,
    execute: async (input, context) => {
      try {
        const value = asRecord(input)
        return { ok: true, value: await service.collect({ query: value.query as string, ...(value.count === undefined ? {} : { count: Number(value.count) }), ...(Array.isArray(value.sourceUrls) ? { sourceUrls: value.sourceUrls as string[] } : {}), ...(context.signal ? { signal: context.signal } : {}) }) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function importTool(service: ArtLibraryService, options: { projectFiles?: ProjectFileQueryPort; turnImages?: ArtTurnImageSourcePort }): CreatXToolContribution {
  return {
    name: "import_art_images",
    audiences: ["ordinary"],
    description: "Copy one to twenty images from the current admitted chat turn or current trusted CreatX project into the global personal art library's incoming area. Select turn attachments by image index or project files by relative path. Trusted session context supplies both source boundaries; other turns, absolute paths, traversal, missing files, non-images, and changing source bytes fail closed. This never modifies a source file, approves an item, or creates a category. After success, inspect candidate ids with read_art_images.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query", "sources"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 300 },
        sources: {
          type: "array", minItems: 1, maxItems: 20,
          items: {
            oneOf: [
              { type: "object", additionalProperties: false, required: ["kind", "index"], properties: { kind: { const: "turn_attachment" }, index: { type: "integer", minimum: 0, maximum: 19 } } },
              { type: "object", additionalProperties: false, required: ["kind", "relativePath"], properties: { kind: { const: "project_file" }, relativePath: { type: "string", minLength: 1, maxLength: 4_000 } } },
            ],
          },
        },
      },
    },
    scope: "application",
    approval: "required",
    execute: async (input, context) => {
      try {
        const value = asRecord(input)
        if (!Array.isArray(value.sources) || !value.sources.length || value.sources.length > 20) throw new Error("art_library_invalid: sources must contain 1 to 20 project images")
        const images = await Promise.all(value.sources.map(async (inputSource) => {
          context.signal?.throwIfAborted()
          const source = asRecord(inputSource)
          if (source.kind === "turn_attachment") {
            if (!options.turnImages) throw new Error("art_library_persistence: current turn image queries are unavailable")
            const index = Number(source.index)
            if (!Number.isInteger(index) || index < 0 || index > 19) throw new Error("art_library_invalid: current turn image index is invalid")
            const snapshot = options.turnImages.read(context.sessionId, index)
            if (createHash("sha256").update(snapshot.bytes).digest("hex") !== snapshot.sha256) throw new Error("art_library_conflict: current turn image hash differs")
            const uri = `creatx-chat://turn/${index}`
            return { bytes: snapshot.bytes, source: { pageUrl: uri, imageUrl: uri, kind: "chat-attachment" as const, displayName: snapshot.displayName } }
          }
          if (source.kind !== "project_file") throw new Error("art_library_invalid: local source kind is invalid")
          if (!options.projectFiles) throw new Error("art_library_persistence: project file queries are unavailable")
          const projectId = context.projectId
          if (!projectId) throw new Error("project_invalid: current session has no project")
          const project = await options.projectFiles.refreshProject(projectId)
          const relativePath = requireProjectRelativePath(source.relativePath)
          const file = project.files.find((candidate) => candidate.relativePath.toLocaleLowerCase("en-US") === relativePath.toLocaleLowerCase("en-US"))
          if (!file) throw new Error(`file_invalid: project image ${relativePath} does not exist`)
          if (file.kind !== "image") throw new Error(`file_invalid: project file ${relativePath} is not an image`)
          const bytes = await options.projectFiles.readBytes(projectId, file.relativePath)
          const repeated = await options.projectFiles.readBytes(projectId, file.relativePath)
          const hash = createHash("sha256").update(bytes).digest("hex")
          if (hash !== createHash("sha256").update(repeated).digest("hex")) throw new Error(`file_conflict: project image ${file.relativePath} changed while being collected`)
          const refreshed = await options.projectFiles.refreshProject(projectId)
          const current = refreshed.files.find((candidate) => candidate.relativePath.toLocaleLowerCase("en-US") === file.relativePath.toLocaleLowerCase("en-US"))
          if (!current || current.size !== file.size || current.modifiedAt !== file.modifiedAt) throw new Error(`file_conflict: project image ${file.relativePath} changed while being collected`)
          const uri = `creatx-project://project/${encodeURIComponent(projectId)}/${encodeURIComponent(file.relativePath)}`
          return { bytes, source: { pageUrl: uri, imageUrl: uri, kind: "project-file" as const, displayName: file.name, projectRelativePath: file.relativePath } }
        }))
        return { ok: true, value: await service.importImages({ query: String(value.query ?? ""), images, ...(context.signal ? { signal: context.signal } : {}) }) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function readTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "read_art_images",
    audiences: ["ordinary"],
    description: `Return exactly one real downloaded personal-art-library candidate as visual tool-result content for the current model. Call this before writing analysis. The trusted session model must support image input; otherwise this fails closed. Candidate ids come from collect_art_images or inspect_art_library. ${ART_VISUAL_CURATION_METHOD}`,
    inputSchema: { type: "object", additionalProperties: false, required: ["candidateIds"], properties: { candidateIds: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", pattern: "^art_[0-9a-f]{16}$" } } } },
    scope: "application",
    approval: "automatic",
    execute: async (input, context) => {
      try {
        const value = asRecord(input)
        return { ok: true, value: await service.readCandidates(value.candidateIds as string[], context.modelSupportsImages === true) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function submitTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "submit_art_approval",
    audiences: ["ordinary"],
    description: `After visually reading exactly one candidate, validate its three independent results and atomically move it from the private incoming area into the global human approval queue. This never approves an item or creates a permanent category. Use the exact candidate id and only visual/source facts actually observed. ${ART_VISUAL_CURATION_METHOD}`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array", minItems: 1, maxItems: 1,
          items: {
            type: "object", additionalProperties: false, required: ["candidateId", "metadata"],
            properties: {
              candidateId: { type: "string", pattern: "^art_[0-9a-f]{16}$" },
              metadata: {
                type: "object", additionalProperties: false,
                required: ["title", "artist", "styleAnalysis", "palette", "patternTags", "compositionTags", "moodTags", "reversePrompt", "suggestedLibrary"],
                properties: {
                  title: { type: "string", minLength: 1, maxLength: 160 }, artist: { type: "string", minLength: 1, maxLength: 160 }, publishedDate: { type: "string", maxLength: 40 },
                  styleAnalysis: { type: "string", minLength: 1, maxLength: 4000, description: "Human-readable interpretation grounded in at least three concrete visual observations from this image." }, movementNote: { type: "string", maxLength: 4000 }, palette: stringArray(12), patternTags: stringArray(40), compositionTags: stringArray(40), moodTags: stringArray(40),
                  reversePrompt: { type: "object", additionalProperties: false, required: ["style", "composition", "scene", "negative"], properties: { style: { type: "string", minLength: 1, maxLength: 4000 }, composition: { type: "string", minLength: 1, maxLength: 4000 }, scene: { type: "string", minLength: 1, maxLength: 4000 }, negative: stringArray(40) } },
                  suggestedLibrary: { type: "object", additionalProperties: false, required: ["title", "confidence"], properties: { title: { type: "string", minLength: 1, maxLength: 80 }, confidence: { type: "number", minimum: 0, maximum: 1 } } },
                },
              },
            },
          },
        },
      },
    },
    scope: "application",
    approval: "automatic",
    execute: async (input) => {
      try {
        return { ok: true, value: await service.submitApproval(asRecord(input).items as Array<{ candidateId: string; metadata: unknown }>) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function inspectTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "inspect_art_library",
    audiences: ["ordinary"],
    description: "Read current approved-art evidence for classification or on-demand style extraction. Returns three-group keyword frequencies and up to four representative visual summaries per selected category, plus pending ids and incoming batches. Use scope=library for one category or scope=all for the whole personal library. The current conversation model may synthesize an interpretation and STYLE / COMPOSITION / SCENE / NEGATIVE Prompt from this evidence, but must not persist it as a fixed profile. This is read-only and never exposes absolute paths or image bytes.",
    inputSchema: { type: "object", additionalProperties: false, properties: { scope: { oneOf: [{ type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["all"] } } }, { type: "object", additionalProperties: false, required: ["kind", "title"], properties: { kind: { type: "string", enum: ["library"] }, title: { type: "string", minLength: 1, maxLength: 80 } } }] } } },
    scope: "application",
    approval: "automatic",
    execute: async (input) => {
      try {
        const value = asRecord(input)
        return { ok: true, value: await service.snapshot(value.scope as { kind: "all" } | { kind: "library"; title: string } | undefined) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function reviewTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "review_art_approval",
    audiences: ["ordinary"],
    description: "Apply an explicit human decision to one pending personal-art-library item. approve moves the complete item into the chosen or suggested category and creates a missing category; reject permanently removes the downloaded image while retaining only an image-free idempotency tombstone; hold makes no change. Never infer approval from a collection request. This tool always requires native approval.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["itemId", "action"],
      properties: {
        itemId: { type: "string", pattern: "^art_[0-9a-f]{16}$" }, action: { type: "string", enum: ["approve", "reject", "hold"] }, targetLibrary: { type: "string", minLength: 1, maxLength: 80 },
        edits: { type: "object", additionalProperties: false, properties: { title: { type: "string", minLength: 1, maxLength: 160 }, styleAnalysis: { type: "string", minLength: 1, maxLength: 4000 }, palette: stringArray(12), patternTags: stringArray(40), compositionTags: stringArray(40), moodTags: stringArray(40), reversePrompt: { type: "object", additionalProperties: false, required: ["style", "composition", "scene", "negative"], properties: { style: { type: "string", minLength: 1, maxLength: 4000 }, composition: { type: "string", minLength: 1, maxLength: 4000 }, scene: { type: "string", minLength: 1, maxLength: 4000 }, negative: stringArray(40) } } } },
      },
    },
    scope: "application",
    approval: "required",
    execute: async (input) => {
      try {
        return { ok: true, value: await service.review(requireReviewArtApprovalCommand(input)) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function exportTool(service: ArtLibraryService): CreatXToolContribution {
  return {
    name: "export_art_style_keywords",
    audiences: ["ordinary"],
    description: "Deterministically export the first-seen union of style keywords from approved items in one personal-art-library category. It reads pattern, composition, and mood tags only, removes whitespace and case-insensitive duplicates, and returns both an array and comma-separated text. It does not call a model, invent words, summarize style, or include pending items.",
    inputSchema: { type: "object", additionalProperties: false, required: ["library"], properties: { library: { type: "string", minLength: 1, maxLength: 80 } } },
    scope: "application",
    approval: "automatic",
    execute: async (input) => {
      try {
        return { ok: true, value: await service.exportStyleKeywords(String(asRecord(input).library ?? "")) }
      } catch (error) {
        return { ok: false, error: artLibraryError(error) }
      }
    },
  }
}

function stringArray(maxItems: number) {
  return { type: "array", maxItems, items: { type: "string", minLength: 1, maxLength: 160 } }
}

function asRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("art_library_invalid: tool input must be an object")
  return input as Record<string, unknown>
}

function requireProjectRelativePath(input: unknown) {
  if (typeof input !== "string" || !input.trim()) throw new Error("art_library_invalid: project relativePath is required")
  const normalized = input.trim().replaceAll("\\", "/")
  if (normalized.startsWith("/") || /^[a-z]:\//iu.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("art_library_path: project image path must stay relative")
  return normalized
}

function artLibraryError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("art_network")) return { code: "art_library_network", message: "艺术库无法安全读取网络图片。", detail }
  if (detail.startsWith("provider_capability")) return { code: "art_library_model", message: "当前模型不支持图片识读。", detail }
  if (detail.startsWith("art_library_conflict")) return { code: "art_library_conflict", message: "艺术库条目与现有状态冲突。", detail }
  if (detail.startsWith("art_library_invalid") || detail.startsWith("art_image") || detail.startsWith("art_library_path")) return { code: "art_library_invalid", message: "艺术库请求或图片无效。", detail }
  if (detail.startsWith("art_library_missing")) return { code: "art_library_invalid", message: "艺术库条目不存在或已经失效。", detail }
  if (detail.startsWith("project_") || detail.startsWith("file_")) return { code: "art_library_invalid", message: "当前项目图片无法安全收藏。", detail }
  if (detail.toLowerCase().includes("abort") || detail.toLowerCase().includes("cancel")) return { code: "cancelled", message: "艺术库操作已取消。", detail }
  return { code: "art_library_persistence", message: "个人艺术库无法安全读取或保存。", detail }
}
