import type { ProjectFileCommandPort, ProjectFileQueryPort } from "@creatx/project-files"
import type { CreatXError, CreatXToolContribution, ImageGenerationModel } from "@creatx/contracts"
import { resolveProjectVisualPrompt } from "./visual-prompt.ts"

export { ImageAttachmentService } from "./document-attachment.ts"
export type { AttachImageCommand, ImageAttachmentResult } from "./document-attachment.ts"

const supportedModels = ["gpt-image-2-cheap", "gpt-image-2"] as const
const maximumImageBytes = 25 * 1024 * 1024
const maximumEditInputBytes = 30 * 1024 * 1024
const maximumProviderResponseBytes = 36 * 1024 * 1024
const maximumProviderErrorBytes = 64 * 1024
type ImageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type CreatXImageModel = ImageGenerationModel
export type ImageTransport = "b64_json" | "url"
export type ImageRequestFailureKind = "dns" | "connection_refused" | "connection_reset" | "timeout" | "tls" | "aborted" | "unknown"

export const IMAGE_CORE_GUIDANCE = `CreatX image generation rules:
- When the user asks to create or generate an image in the current project, call generate_image directly. The tool creates required parent directories, so do not inspect the project or use Shell merely to prepare the output path.
- During an active Growth goal, use submit_image_generation when image work should continue in the background while text stages proceed. Reuse the same idempotencyKey only for an exact submission retry; a changed prompt requires a new key.
- When a background image belongs inside one known Markdown or MDX article, include the exact attachment intent in submit_image_generation. Use attach_image_to_document for an image that already exists. Never guess a document or anchor from a similar filename.
- Use manage_image_generation to inspect or control persistent tasks. Retry moves a failed or interrupted task to the project tail, skip moves an already queued task to the project tail, and cancel permanently abandons it. A generating task can only be cancelled.
- Choose a meaningful project-relative filename and prefer PNG unless the user requests another supported format.
- Use gpt-image-2-cheap by default for ordinary image work and disposable direction tests. When the Draw Comic Skill is loaded, use gpt-image-2 for final panels, recurring-character identity, anatomy-sensitive action, and final page assets; cheap generation remains appropriate only for comic thumbnails and disposable composition tests. Outside that explicit comic exception, use gpt-image-2 only when the user asks for the standard model or higher quality.
- Never overwrite an existing project image. Choose a new path or ask the user when the intended target already exists.
- A successful generate_image result already means the image bytes were validated, written, and reread from the project. Do not call another tool merely to verify that result.
- When the user asks to edit an existing project image with a project PNG mask, call edit_image. Pass project-relative source and mask paths; never embed image bytes, absolute paths, credentials, or Data URLs in tool input.
- edit_image sends transparent mask pixels as editable and opaque pixels as keep guidance, but the Provider may still alter any pixel or the canvas size. Use a new output path because the source image is never overwritten.
- During an active Growth goal, do not call synchronous edit_image. Persistent edited-image tasks require a later queue contract.
- One generated image does not by itself require a new workbench. Do not call register_workbench unless the user asks for one or the image belongs to a broader sustained work that needs its own existing directory entrance.
- Report that an image was created only after generate_image succeeds.
- In the final reply, show each successfully created project image with Markdown using its exact project-relative path, for example ![灯塔](图片/灯塔.png). Do not use absolute paths, file URLs, or invented paths.`

export interface ImageRuntimeOptions {
  baseUrl?: string
  apiKey?: string
  defaultModel?: ImageGenerationModel
  resolveConnection?: () => ImageRuntimeConnection | undefined
  fileQueries: ProjectFileQueryPort
  fileCommands: ProjectFileCommandPort
  fetch?: ImageFetch
}

export interface ImageRuntimeConnection {
  baseUrl: string
  apiKey: string
  defaultModel: ImageGenerationModel
}

export interface GenerateProjectImageRequest {
  projectId: string
  relativePath: string
  model: CreatXImageModel
  prompt: string
  size?: string
  signal?: AbortSignal
}

export interface EditProjectImageRequest extends GenerateProjectImageRequest {
  sourceImagePath: string
  maskImagePath: string
}

export interface GeneratedProjectImage {
  projectId: string
  relativePath: string
  model: CreatXImageModel
  mimeType: "image/png" | "image/jpeg" | "image/webp"
  bytes: number
  transport: ImageTransport
  visualStyleApplied: boolean
}

export type ImageRuntimeErrorCode =
  | "image_config"
  | "image_request"
  | "image_result_unknown"
  | "image_provider"
  | "image_protocol"
  | "image_download"
  | "image_validation"
  | "image_storage"

export class ImageRuntimeError extends Error {
  readonly code: ImageRuntimeErrorCode
  readonly requestFailureKind: ImageRequestFailureKind | undefined

  constructor(code: ImageRuntimeErrorCode, message: string, options?: ErrorOptions & { requestFailureKind?: ImageRequestFailureKind }) {
    super(`${code}: ${message}`, options)
    this.name = "ImageRuntimeError"
    this.code = code
    this.requestFailureKind = options?.requestFailureKind
  }
}

export class ImageRuntime {
  private readonly request: ImageFetch
  private readonly options: ImageRuntimeOptions
  private readonly staticConnection: ImageRuntimeConnection | undefined

  constructor(options: ImageRuntimeOptions) {
    this.options = options
    this.staticConnection = options.resolveConnection ? undefined : {
      baseUrl: requireBaseUrl(options.baseUrl ?? ""),
      apiKey: requireApiKey(options.apiKey ?? ""),
      defaultModel: requireModel(options.defaultModel ?? "gpt-image-2-cheap"),
    }
    this.request = options.fetch ?? fetch
  }

  tool(): CreatXToolContribution {
    return {
      name: "generate_image",
      audiences: ["ordinary", "growth-stage"],
      description: "Generate one real image synchronously and create it as a new file in the current CreatX project. Do not use this tool during a Growth stage; Growth must use submit_image_generation. Use a meaningful project-relative output path ending in .png, .jpg, .jpeg, or .webp; prefer .png unless the user asks for another format. This tool never overwrites an existing file. The optional model is gpt-image-2-cheap or gpt-image-2 and defaults to gpt-image-2-cheap. Do not claim the image exists until this tool succeeds.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "relativePath"],
        properties: {
          prompt: { type: "string", minLength: 1, description: "Complete image-generation prompt describing the intended visual result." },
          relativePath: { type: "string", minLength: 1, description: "New project-relative image path, for example 图片/灯塔.png." },
          model: { type: "string", enum: supportedModels, description: "Optional image model. Defaults to gpt-image-2-cheap." },
        },
      },
      scope: "project",
      approval: "required",
      timeoutMs: 180_000,
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: imageToolError("project_invalid: project identity is required") }
        if (context.growthGoalId) return { ok: false, error: imageToolError("image_request: Growth must use submit_image_generation instead of synchronous generate_image") }
        try {
          const parsed = requireToolInput(input, this.connection().defaultModel)
          return { ok: true, value: await this.generateToProject({ projectId: context.projectId, ...parsed }) }
        } catch (error) {
          return { ok: false, error: imageToolError(error) }
        }
      },
    }
  }

  editTool(): CreatXToolContribution {
    return {
      name: "edit_image",
      audiences: ["ordinary"],
      description: "Create one edited image from an existing project image and an existing project PNG mask. Transparent mask pixels request edits and opaque pixels provide keep guidance, but the Provider may still alter any pixel or the canvas size. Inputs and output are project-relative paths. The source and mask are never modified, and the output is create-only. Do not use during Growth because persistent edited-image queue tasks are not implemented.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["sourceImagePath", "maskImagePath", "prompt", "relativePath"],
        properties: {
          sourceImagePath: { type: "string", minLength: 1, description: "Existing project-relative PNG, JPEG, or WebP source image path." },
          maskImagePath: { type: "string", minLength: 1, description: "Existing project-relative PNG mask path with an alpha channel; transparent pixels are editable." },
          prompt: { type: "string", minLength: 1, description: "Describe the intended edit and what must remain unchanged." },
          relativePath: { type: "string", minLength: 1, description: "New project-relative output image path." },
          model: { type: "string", enum: supportedModels, description: "Optional image model. Defaults to gpt-image-2-cheap." },
        },
      },
      scope: "project",
      approval: "required",
      timeoutMs: 180_000,
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: imageToolError("project_invalid: project identity is required") }
        if (context.growthGoalId) return { ok: false, error: imageToolError("image_request: Growth edited-image queue tasks are not implemented") }
        try {
          const parsed = requireEditToolInput(input, this.connection().defaultModel)
          return { ok: true, value: await this.editToProject({ projectId: context.projectId, ...parsed }) }
        } catch (error) {
          return { ok: false, error: imageToolError(error) }
        }
      },
    }
  }

  async generateToProject(request: GenerateProjectImageRequest): Promise<GeneratedProjectImage> {
    requireRequest(request)
    const visualPrompt = await resolveProjectVisualPrompt(this.options.fileQueries, request.projectId, request.relativePath, request.prompt)
    const compiledRequest = { ...request, prompt: visualPrompt.prompt }
    const generated = await this.generate(compiledRequest)
    return this.saveGenerated(compiledRequest, generated, visualPrompt.visualStyleApplied)
  }

  async editToProject(request: EditProjectImageRequest): Promise<GeneratedProjectImage> {
    requireEditRequest(request)
    const source = await this.readEditInput(request.projectId, request.sourceImagePath, "Source image")
    const mask = await this.readEditInput(request.projectId, request.maskImagePath, "Mask image")
    if (mask.mimeType !== "image/png") throw new ImageRuntimeError("image_validation", "Mask image must be PNG")
    if (!pngHasAlpha(mask.content)) throw new ImageRuntimeError("image_validation", "Mask PNG must contain an alpha channel")
    if (source.content.byteLength + mask.content.byteLength > maximumEditInputBytes) {
      throw new ImageRuntimeError("image_validation", `Combined edit inputs exceed the ${formatMiB(maximumEditInputBytes)} limit`)
    }

    const generated = await this.requestImage({
      model: request.model,
      prompt: request.prompt,
      n: 1,
      size: request.size ?? "1024x1024",
      image: dataUrl(source.content, source.mimeType),
      mask: dataUrl(mask.content, mask.mimeType),
    }, request.signal)
    return this.saveGenerated(request, generated, false)
  }

  private async saveGenerated(request: GenerateProjectImageRequest, generated: Awaited<ReturnType<ImageRuntime["requestImage"]>>, visualStyleApplied: boolean) {
    requireMatchingExtension(request.relativePath, generated.mimeType)

    try {
      await this.options.fileCommands.writeFile({
        projectId: request.projectId,
        relativePath: request.relativePath,
        content: generated.content,
        expectedModifiedAt: null,
      })
      const saved = await this.options.fileQueries.readBytes(request.projectId, request.relativePath)
      if (!Buffer.from(saved).equals(Buffer.from(generated.content))) {
        throw new Error("saved bytes differ from the generated image")
      }
    } catch (error) {
      throw new ImageRuntimeError("image_storage", messageOf(error), { cause: error })
    }

    return {
      projectId: request.projectId,
      relativePath: request.relativePath,
      model: request.model,
      mimeType: generated.mimeType,
      bytes: generated.content.byteLength,
      transport: generated.transport,
      visualStyleApplied,
    }
  }

  private async generate(request: GenerateProjectImageRequest) {
    return this.requestImage({
      model: request.model,
      prompt: request.prompt,
      n: 1,
      size: request.size ?? "1024x1024",
    }, request.signal)
  }

  private async requestImage(body: Record<string, unknown>, signal?: AbortSignal) {
    const connection = this.connection()
    const response = await this.request(`${connection.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${connection.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }).catch((error: unknown) => {
      const failure = classifyRequestFailure(error)
      const diagnostic = failure.code ? `${failure.kind}, ${failure.code}` : failure.kind
      throw new ImageRuntimeError("image_result_unknown", `Provider request ended without an HTTP result (${diagnostic}); do not retry automatically.`, {
        cause: error,
        requestFailureKind: failure.kind,
      })
    })

    if (!response.ok) {
      throw new ImageRuntimeError("image_provider", `Provider returned HTTP ${response.status}: ${await safeProviderError(response)}`)
    }

    const payloadText = new TextDecoder().decode(await readLimitedBody(response, maximumProviderResponseBytes, "image_protocol", "Provider response"))
    const payload = parseProviderJson(payloadText)
    const item = firstImageItem(payload)

    if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      const content = decodeBase64(item.b64_json)
      return { content, mimeType: imageMime(content), transport: "b64_json" as const }
    }
    if (typeof item.url === "string" && item.url.length > 0) {
      const content = await this.download(item.url, signal)
      return { content, mimeType: imageMime(content), transport: "url" as const }
    }
    throw new ImageRuntimeError("image_protocol", "Provider response contains neither b64_json nor url")
  }

  private connection() {
    const connection = this.options.resolveConnection?.() ?? this.staticConnection
    if (!connection) throw new ImageRuntimeError("image_config", "Image Provider is not configured")
    return {
      baseUrl: requireBaseUrl(connection.baseUrl),
      apiKey: requireApiKey(connection.apiKey),
      defaultModel: requireModel(connection.defaultModel),
    }
  }

  private async readEditInput(projectId: string, relativePath: string, label: string) {
    try {
      const content = await this.options.fileQueries.readBytes(projectId, relativePath)
      if (content.byteLength > maximumImageBytes) throw new ImageRuntimeError("image_validation", `${label} exceeds the ${formatMiB(maximumImageBytes)} limit`)
      return { content, mimeType: imageMime(content) }
    } catch (error) {
      if (error instanceof ImageRuntimeError) throw error
      throw new ImageRuntimeError("image_request", `${label} could not be read: ${messageOf(error)}`, { cause: error })
    }
  }

  private async download(value: string, signal?: AbortSignal) {
    const url = requireHttpsUrl(value, "image_download")
    const response = await this.request(url, signal ? { signal } : {}).catch(() => {
      throw new ImageRuntimeError("image_download", "Image URL request failed")
    })
    if (!response.ok) throw new ImageRuntimeError("image_download", `Image URL returned HTTP ${response.status}`)
    return readLimitedBody(response, maximumImageBytes, "image_download", "Downloaded image")
  }
}

function classifyRequestFailure(error: unknown): { kind: ImageRequestFailureKind; code?: string } {
  const chain = errorChain(error)
  const code = chain.map((item) => typeof item.code === "string" ? item.code.toUpperCase() : undefined).find(Boolean)
  const names = chain.map((item) => typeof item.name === "string" ? item.name.toLowerCase() : "")
  const messages = chain.map((item) => typeof item.message === "string" ? item.message.toLowerCase() : "")
  const text = [...names, ...messages].join(" ")

  if (text.includes("abort") || code === "ABORT_ERR") return { kind: "aborted", ...(code ? { code } : {}) }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || text.includes("getaddrinfo")) return { kind: "dns", ...(code ? { code } : {}) }
  if (code === "ECONNREFUSED") return { kind: "connection_refused", code }
  if (code === "ECONNRESET" || code === "EPIPE" || code === "UND_ERR_SOCKET" || text.includes("socket closed")) {
    return { kind: "connection_reset", ...(code ? { code } : {}) }
  }
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || text.includes("timed out")) {
    return { kind: "timeout", ...(code ? { code } : {}) }
  }
  if (code?.startsWith("ERR_TLS") || code?.startsWith("CERT_") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || text.includes("certificate")) {
    return { kind: "tls", ...(code ? { code } : {}) }
  }
  return { kind: "unknown" }
}

function errorChain(error: unknown) {
  const chain: Array<{ name?: unknown; message?: unknown; code?: unknown; cause?: unknown }> = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (typeof current === "object" && current !== null && !seen.has(current) && chain.length < 6) {
    seen.add(current)
    const item = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown }
    chain.push(item)
    current = item.cause
  }
  return chain
}

function parseProviderJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
      throw new ImageRuntimeError("image_protocol", "Provider returned invalid JSON", { cause: error })
  }
}

function requireBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "")
  if (!trimmed) throw new ImageRuntimeError("image_config", "Base URL is missing")
  const url = requireHttpsUrl(trimmed, "image_config")
  return url.toString().replace(/\/$/, "")
}

function requireApiKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new ImageRuntimeError("image_config", "API key is missing")
  return trimmed
}

function requireModel(value: unknown): CreatXImageModel {
  if (value === "gpt-image-2-cheap" || value === "gpt-image-2") return value
  throw new ImageRuntimeError("image_config", "Unsupported default image model")
}

function requireHttpsUrl(value: string, code: "image_config" | "image_download") {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new ImageRuntimeError(code, "A valid HTTPS URL is required", { cause: error })
  }
  if (url.protocol !== "https:") throw new ImageRuntimeError(code, "Only HTTPS URLs are allowed")
  return url
}

function requireRequest(request: GenerateProjectImageRequest) {
  if (!supportedModels.includes(request.model)) throw new ImageRuntimeError("image_request", "Unsupported image model")
  if (!request.prompt.trim()) throw new ImageRuntimeError("image_request", "Prompt is required")
  if (!request.relativePath.trim()) throw new ImageRuntimeError("image_request", "Project-relative output path is required")
}

function requireEditRequest(request: EditProjectImageRequest) {
  requireRequest(request)
  if (!request.sourceImagePath.trim()) throw new ImageRuntimeError("image_request", "Source image path is required")
  if (!request.maskImagePath.trim()) throw new ImageRuntimeError("image_request", "Mask image path is required")
  if (request.sourceImagePath === request.relativePath || request.maskImagePath === request.relativePath) {
    throw new ImageRuntimeError("image_request", "Output path must differ from source and mask paths")
  }
}

function requireToolInput(input: unknown, defaultModel: CreatXImageModel = "gpt-image-2-cheap") {
  if (!isRecord(input) || Array.isArray(input)) throw new ImageRuntimeError("image_request", "Tool input must be an object")
  if (Object.keys(input).some((key) => key !== "prompt" && key !== "relativePath" && key !== "model")) {
    throw new ImageRuntimeError("image_request", "Tool input contains unknown fields")
  }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new ImageRuntimeError("image_request", "Prompt is required")
  if (typeof input.relativePath !== "string" || !input.relativePath.trim()) throw new ImageRuntimeError("image_request", "Project-relative output path is required")
  if (input.model !== undefined && (typeof input.model !== "string" || !supportedModels.includes(input.model as CreatXImageModel))) {
    throw new ImageRuntimeError("image_request", "Unsupported image model")
  }
  return {
    prompt: input.prompt.trim(),
    relativePath: input.relativePath.trim(),
    model: (input.model ?? defaultModel) as CreatXImageModel,
  }
}

function requireEditToolInput(input: unknown, defaultModel: CreatXImageModel = "gpt-image-2-cheap") {
  if (!isRecord(input) || Array.isArray(input)) throw new ImageRuntimeError("image_request", "Tool input must be an object")
  const allowed = ["sourceImagePath", "maskImagePath", "prompt", "relativePath", "model"]
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new ImageRuntimeError("image_request", "Tool input contains unknown fields")
  if (typeof input.sourceImagePath !== "string" || !input.sourceImagePath.trim()) throw new ImageRuntimeError("image_request", "Source image path is required")
  if (typeof input.maskImagePath !== "string" || !input.maskImagePath.trim()) throw new ImageRuntimeError("image_request", "Mask image path is required")
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new ImageRuntimeError("image_request", "Prompt is required")
  if (typeof input.relativePath !== "string" || !input.relativePath.trim()) throw new ImageRuntimeError("image_request", "Project-relative output path is required")
  if (input.model !== undefined && (typeof input.model !== "string" || !supportedModels.includes(input.model as CreatXImageModel))) {
    throw new ImageRuntimeError("image_request", "Unsupported image model")
  }
  return {
    sourceImagePath: input.sourceImagePath.trim(),
    maskImagePath: input.maskImagePath.trim(),
    prompt: input.prompt.trim(),
    relativePath: input.relativePath.trim(),
    model: (input.model ?? defaultModel) as CreatXImageModel,
  }
}

function firstImageItem(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.data[0])) {
    throw new ImageRuntimeError("image_protocol", "Provider response is missing data[0]")
  }
  return payload.data[0]
}

function decodeBase64(value: string) {
  try {
    const content = new Uint8Array(Buffer.from(value, "base64"))
    if (content.byteLength > maximumImageBytes) throw new ImageRuntimeError("image_validation", "Decoded image exceeds the 25 MiB limit")
    return content
  } catch (error) {
    if (error instanceof ImageRuntimeError) throw error
    throw new ImageRuntimeError("image_protocol", "Provider returned invalid base64 image data", { cause: error })
  }
}

function imageMime(content: Uint8Array): GeneratedProjectImage["mimeType"] {
  if (content.byteLength < 12) throw new ImageRuntimeError("image_validation", "Provider returned an empty or truncated image")
  if (content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47) return requirePng(content)
  if (content[0] === 0xff && content[1] === 0xd8) return requireJpeg(content)
  if (ascii(content, 0, 4) === "RIFF" && ascii(content, 8, 12) === "WEBP") return requireWebp(content)
  throw new ImageRuntimeError("image_validation", "Provider returned unsupported image bytes")
}

function requirePng(content: Uint8Array): "image/png" {
  if (content.byteLength < 45 || ascii(content, 12, 16) !== "IHDR" || uint32BigEndian(content, 16) === 0 || uint32BigEndian(content, 20) === 0 || ascii(content, content.byteLength - 8, content.byteLength - 4) !== "IEND") {
    throw new ImageRuntimeError("image_validation", "Provider returned a malformed or truncated PNG")
  }
  return "image/png"
}

function pngHasAlpha(content: Uint8Array) {
  return content[25] === 4 || content[25] === 6
}

function dataUrl(content: Uint8Array, mimeType: GeneratedProjectImage["mimeType"]) {
  return `data:${mimeType};base64,${Buffer.from(content).toString("base64")}`
}

function requireJpeg(content: Uint8Array): "image/jpeg" {
  if (content.byteLength < 20 || content[content.byteLength - 2] !== 0xff || content[content.byteLength - 1] !== 0xd9) {
    throw new ImageRuntimeError("image_validation", "Provider returned a malformed or truncated JPEG")
  }
  return "image/jpeg"
}

function requireWebp(content: Uint8Array): "image/webp" {
  if (content.byteLength < 20 || uint32LittleEndian(content, 4) + 8 !== content.byteLength) {
    throw new ImageRuntimeError("image_validation", "Provider returned a malformed or truncated WebP")
  }
  return "image/webp"
}

function requireMatchingExtension(relativePath: string, mimeType: GeneratedProjectImage["mimeType"]) {
  const extension = relativePath.toLocaleLowerCase("en-US").match(/\.[^.\\/]+$/)?.[0]
  const expected = mimeType === "image/png" ? [".png"] : mimeType === "image/jpeg" ? [".jpg", ".jpeg"] : [".webp"]
  if (!extension || !expected.includes(extension)) {
    throw new ImageRuntimeError("image_validation", `Output extension must match ${mimeType}`)
  }
}

async function safeProviderError(response: Response) {
  const bytes = await readLimitedBody(response, maximumProviderErrorBytes, "image_provider", "Provider error").catch(() => new Uint8Array())
  const text = new TextDecoder().decode(bytes).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").trim()
  return text.slice(0, 500) || "no response detail"
}

async function readLimitedBody(response: Response, maximumBytes: number, code: ImageRuntimeErrorCode, label: string) {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new ImageRuntimeError(code, `${label} exceeds the ${formatMiB(maximumBytes)} limit`)
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const item = await reader.read().catch(() => {
      throw new ImageRuntimeError(code, `${label} could not be read`)
    })
    if (item.done) break
    total += item.value.byteLength
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ImageRuntimeError(code, `${label} exceeds the ${formatMiB(maximumBytes)} limit`)
    }
    chunks.push(item.value)
  }

  const content = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.byteLength
  }
  return content
}

function formatMiB(bytes: number) {
  return `${bytes / 1024 / 1024} MiB`
}

function ascii(content: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...content.slice(start, end))
}

function uint32BigEndian(content: Uint8Array, offset: number) {
  return new DataView(content.buffer, content.byteOffset, content.byteLength).getUint32(offset)
}

function uint32LittleEndian(content: Uint8Array, offset: number) {
  return new DataView(content.buffer, content.byteOffset, content.byteLength).getUint32(offset, true)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function imageToolError(error: unknown): CreatXError {
  const detail = messageOf(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前图片工具没有有效项目。", detail }
  if (detail.startsWith("image_config")) return { code: "provider_missing_credentials", message: "尚未配置生图模型。", detail }
  if (detail.includes("file_conflict")) return { code: "file_conflict", message: "目标图片文件已经存在。", detail }
  return { code: "tool_failed", message: "图片处理失败。", detail }
}
