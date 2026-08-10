import { createHash, randomUUID } from "node:crypto"
import { open, readFile, stat } from "node:fs/promises"
import { basename, extname, isAbsolute } from "node:path"
import { CHAT_IMAGE_ATTACHMENT_MAX_BYTES, CHAT_IMAGE_ATTACHMENTS_MAX_BYTES, type AttachmentReference } from "@creatx/contracts"

type AttachmentMediaType = "image/png" | "image/jpeg"

export interface ResolvedAttachments {
  userFiles: string[]
  userImages: string[]
  imageSnapshots: ArtTurnImageSnapshot[]
}

export interface ArtTurnImageSnapshot {
  index: number
  displayName: string
  mediaType: AttachmentMediaType
  bytes: Uint8Array
  sha256: string
}

interface AttachmentAuthorizationBase {
  displayName: string
  size: number
  modifiedAt: string
  expiresAt: number
  kind: "file" | "image"
  mediaType?: AttachmentMediaType
  consumed: boolean
}

interface FileAttachmentAuthorization extends AttachmentAuthorizationBase {
  source: "file"
  path: string
  mtimeMs: number
}

interface GeneratedAttachmentAuthorization extends AttachmentAuthorizationBase {
  source: "generated"
  bytes: Buffer
  kind: "image"
  mediaType: "image/png"
}

type AttachmentAuthorization = FileAttachmentAuthorization | GeneratedAttachmentAuthorization

export class AttachmentAuthorizationStore {
  private readonly authorizations = new Map<string, AttachmentAuthorization>()
  private readonly id: () => string
  private readonly now: () => number
  private readonly ttlMs: number
  private readonly maxImageBytes: number
  private readonly maxImageBatchBytes: number

  constructor(options: { id?: () => string; now?: () => number; ttlMs?: number; maxImageBytes?: number; maxImageBatchBytes?: number } = {}) {
    this.id = options.id ?? randomUUID
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000
    this.maxImageBytes = options.maxImageBytes ?? CHAT_IMAGE_ATTACHMENT_MAX_BYTES
    this.maxImageBatchBytes = options.maxImageBatchBytes ?? CHAT_IMAGE_ATTACHMENTS_MAX_BYTES
  }

  async authorize(paths: readonly string[]): Promise<AttachmentReference[]> {
    const files = await Promise.all([...new Set(paths)].map(async (path) => ({ path, metadata: await attachmentMetadata(path, this.maxImageBytes) })))
    const imageBytes = files.filter((file) => file.metadata.kind === "image").reduce((total, file) => total + file.metadata.size, 0)
    if (imageBytes > this.maxImageBatchBytes) throw new Error("attachment_invalid: image attachments exceed the total size limit")
    return files.map((file) => {
      const id = this.id()
      this.authorizations.set(id, { source: "file", displayName: basename(file.path), ...file.metadata, path: file.path, expiresAt: this.now() + this.ttlMs, consumed: false })
      return {
        id,
        name: basename(file.path),
        displayPath: basename(file.path),
        size: file.metadata.size,
        modifiedAt: file.metadata.modifiedAt,
        kind: file.metadata.kind,
        ...(file.metadata.mediaType ? { mediaType: file.metadata.mediaType, previewUrl: `creatx-attachment://pending/${id}` } : {}),
      }
    })
  }

  authorizeGeneratedPng(bytes: Buffer, name: string): AttachmentReference {
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("attachment_invalid: generated image is not a PNG")
    if (bytes.length > this.maxImageBytes) throw new Error("attachment_invalid: generated image exceeds the per-image size limit")
    const safeName = basename(name.trim())
    if (!safeName || !safeName.toLocaleLowerCase("en-US").endsWith(".png")) throw new Error("attachment_invalid: generated image name must end in .png")
    const id = this.id()
    const modifiedAt = new Date(this.now()).toISOString()
    this.authorizations.set(id, {
      source: "generated",
      displayName: safeName,
      bytes: Buffer.from(bytes),
      size: bytes.length,
      modifiedAt,
      expiresAt: this.now() + this.ttlMs,
      kind: "image",
      mediaType: "image/png",
      consumed: false,
    })
    return { id, name: safeName, displayPath: "工作台批注", size: bytes.length, modifiedAt, kind: "image", mediaType: "image/png", previewUrl: `creatx-attachment://pending/${id}` }
  }

  async resolve(ids: readonly string[]): Promise<ResolvedAttachments> {
    if (new Set(ids).size !== ids.length) throw new Error("attachment_invalid: duplicate attachment authorization")
    const resolved = await Promise.all(ids.map((id) => this.requireCurrent(id, false)))
    const imageSnapshots = await Promise.all(resolved.filter((attachment): attachment is AttachmentAuthorization & { mediaType: AttachmentMediaType } => attachment.kind === "image" && Boolean(attachment.mediaType)).map(async (attachment, index) => {
      const bytes = await authorizationBytes(attachment)
      return { index, displayName: attachment.displayName, mediaType: attachment.mediaType, bytes: new Uint8Array(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }
    }))
    return {
      userFiles: resolved.filter((attachment): attachment is FileAttachmentAuthorization => attachment.source === "file" && attachment.kind === "file").map((attachment) => attachment.path),
      userImages: imageSnapshots.map((snapshot) => `data:${snapshot.mediaType};base64,${Buffer.from(snapshot.bytes).toString("base64")}`),
      imageSnapshots,
    }
  }

  async preview(id: string) {
    const attachment = await this.requireCurrent(id, true)
    if (attachment.kind !== "image" || !attachment.mediaType) throw new Error("attachment_invalid: attachment has no image preview")
    return { mediaType: attachment.mediaType, bytes: await authorizationBytes(attachment) }
  }

  consume(ids: readonly string[]) {
    ids.forEach((id) => {
      const authorization = this.authorizations.get(id)
      if (authorization) authorization.consumed = true
    })
  }

  clear() {
    this.authorizations.clear()
  }

  private async requireCurrent(id: string, allowConsumed: boolean) {
    const authorization = this.authorizations.get(id)
    if (!authorization || authorization.expiresAt <= this.now() || authorization.consumed && !allowConsumed) {
      if (authorization?.expiresAt && authorization.expiresAt <= this.now()) this.authorizations.delete(id)
      throw new Error("attachment_invalid: attachment authorization is missing, expired or already consumed")
    }
    if (authorization.source === "generated") return authorization
    const current = await attachmentMetadata(authorization.path, this.maxImageBytes)
    if (current.size !== authorization.size || current.mtimeMs !== authorization.mtimeMs || current.kind !== authorization.kind || current.mediaType !== authorization.mediaType) {
      this.authorizations.delete(id)
      throw new Error("attachment_invalid: selected file changed after authorization")
    }
    return authorization
  }
}

async function authorizationBytes(authorization: AttachmentAuthorization) {
  return authorization.source === "generated" ? authorization.bytes : readFile(authorization.path)
}

async function attachmentMetadata(path: string, maxImageBytes: number) {
  if (!isAbsolute(path)) throw new Error("attachment_invalid: attachment path must be absolute")
  try {
    const metadata = await stat(path)
    if (!metadata.isFile()) throw new Error("attachment_unreadable: attachment is not a file")
    const handle = await open(path, "r")
    const header = Buffer.alloc(Math.min(metadata.size, 8_192))
    try {
      await handle.read(header, 0, header.length, 0)
    } finally {
      await handle.close()
    }
    const extension = extname(path).toLocaleLowerCase("en-US")
    const mediaType = extension === ".png"
      ? header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ? "image/png" as const : undefined
      : extension === ".jpg" || extension === ".jpeg"
        ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff ? "image/jpeg" as const : undefined
        : undefined
    if ((extension === ".png" || extension === ".jpg" || extension === ".jpeg") && !mediaType) throw new Error("attachment_invalid: image extension does not match its file signature")
    if (mediaType && metadata.size > maxImageBytes) throw new Error("attachment_invalid: image attachment exceeds the per-image size limit")
    if (!mediaType && header.includes(0)) throw new Error("attachment_unreadable: unsupported binary attachment")
    return {
      size: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
      mtimeMs: metadata.mtimeMs,
      kind: mediaType ? "image" as const : "file" as const,
      ...(mediaType ? { mediaType } : {}),
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("attachment_")) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("attachment_missing: selected file no longer exists")
    throw new Error(`attachment_unreadable: ${error instanceof Error ? error.message : String(error)}`)
  }
}
