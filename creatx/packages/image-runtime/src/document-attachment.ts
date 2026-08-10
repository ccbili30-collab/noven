import { posix } from "node:path"
import type { CreatXError, CreatXToolContribution, ImageAttachmentIntent } from "@creatx/contracts"
import type { ProjectFileCommandPort, ProjectFileQueryPort } from "@creatx/project-files"

export interface AttachImageCommand extends ImageAttachmentIntent {
  projectId: string
  imagePath: string
}

export interface ImageAttachmentResult {
  documentPath: string
  imagePath: string
  reference: string
  changed: boolean
}

export class ImageAttachmentService {
  constructor(
    private readonly queries: ProjectFileQueryPort,
    private readonly commands: ProjectFileCommandPort,
  ) {}

  tool(): CreatXToolContribution {
    return {
      name: "attach_image_to_document",
      audiences: ["ordinary", "growth-stage", "world-writer", "world-recovery"],
      description: "Attach an existing project image to one Markdown or MDX document using a standard relative image reference. Choose end, after_heading, or after_anchor. Heading and anchor placement require one exact unique anchor. This tool never guesses by filename and never overwrites a document that changed concurrently.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["imagePath", "documentPath", "alt", "placement"],
        properties: {
          imagePath: { type: "string", minLength: 1, description: "Exact project-relative image path." },
          documentPath: { type: "string", minLength: 1, description: "Exact project-relative Markdown or MDX path." },
          alt: { type: "string", minLength: 1, description: "Concise accessible image description." },
          placement: { type: "string", enum: ["end", "after_heading", "after_anchor"] },
          anchor: { type: "string", minLength: 1, description: "Required exact heading text or exact document anchor for non-end placement." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: attachmentToolError("image_attachment_invalid: project identity is required") }
        try {
          return { ok: true, value: await this.attach({ ...requireAttachmentToolInput(input), projectId: context.projectId }) }
        } catch (error) {
          return { ok: false, error: attachmentToolError(error) }
        }
      },
    }
  }

  async attach(command: AttachImageCommand): Promise<ImageAttachmentResult> {
    const input = requireAttachImageCommand(command)
    for (const attempt of [0, 1]) {
      const prepared = await this.prepare(input)
      if (!prepared.changed) return prepared
      try {
        await this.commands.writeFile({
          projectId: input.projectId,
          relativePath: input.documentPath,
          content: prepared.content,
          expectedModifiedAt: prepared.modifiedAt,
        })
        return { documentPath: input.documentPath, imagePath: input.imagePath, reference: prepared.reference, changed: true }
      } catch (error) {
        if (!errorMessage(error).startsWith("file_conflict") || attempt === 1) {
          if (errorMessage(error).startsWith("file_conflict")) throw new Error("image_attachment_conflict: document changed twice while the image was being attached")
          throw error
        }
      }
    }
    throw new Error("image_attachment_conflict: document could not be updated")
  }

  private async prepare(input: Required<Pick<AttachImageCommand, "projectId" | "imagePath" | "documentPath" | "alt" | "placement">> & { anchor?: string }) {
    const project = await this.queries.refreshProject(input.projectId)
    const image = project.files.find((file) => file.relativePath.replaceAll("\\", "/") === input.imagePath)
    if (!image || image.kind !== "image") throw new Error("image_attachment_invalid: imagePath does not identify a project image")
    const document = project.files.find((file) => file.relativePath.replaceAll("\\", "/") === input.documentPath)
    if (!document || document.kind !== "markdown" || !/\.mdx?$/iu.test(document.relativePath)) throw new Error("image_attachment_invalid: documentPath must identify a Markdown or MDX file")
    const preview = await this.queries.readFile(input.projectId, document.id)
    if (preview.content === undefined) throw new Error("image_attachment_invalid: document text is unavailable")
    const destination = posix.relative(posix.dirname(input.documentPath), input.imagePath) || posix.basename(input.imagePath)
    const reference = `![${escapeAlt(input.alt)}](${encodeURI(destination)})`
    if (hasImageReference(preview.content, destination)) return { documentPath: input.documentPath, imagePath: input.imagePath, reference, changed: false, content: preview.content, modifiedAt: preview.file.modifiedAt }
    return {
      documentPath: input.documentPath,
      imagePath: input.imagePath,
      reference,
      changed: true,
      content: insertReference(preview.content, reference, input.placement, input.anchor),
      modifiedAt: preview.file.modifiedAt,
    }
  }
}

function insertReference(content: string, reference: string, placement: AttachImageCommand["placement"], anchor?: string) {
  if (placement === "end") return `${content.trimEnd()}\n\n${reference}\n`
  if (!anchor) throw new Error("image_attachment_invalid: anchor is required for the selected placement")
  if (placement === "after_heading") {
    const matches = [...content.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gmu)].filter((match) => match[1] === anchor)
    if (matches.length !== 1) throw new Error(`image_attachment_conflict: expected one exact heading anchor, found ${matches.length}`)
    const match = matches[0]!
    const index = match.index! + match[0].length
    return `${content.slice(0, index)}\n\n${reference}${content.slice(index)}`
  }
  const indexes = Array.from(content.matchAll(new RegExp(escapeRegExp(anchor), "gu")), (match) => match.index)
  if (indexes.length !== 1) throw new Error(`image_attachment_conflict: expected one exact document anchor, found ${indexes.length}`)
  const index = indexes[0]! + anchor.length
  return `${content.slice(0, index)}\n\n${reference}${content.slice(index)}`
}

function requireAttachmentToolInput(value: unknown) {
  if (!isRecord(value) || Array.isArray(value)) throw new Error("image_attachment_invalid: tool input must be an object")
  if (Object.keys(value).some((key) => !["imagePath", "documentPath", "alt", "placement", "anchor"].includes(key))) {
    throw new Error("image_attachment_invalid: tool input contains unknown fields")
  }
  return requireAttachImageCommand(value)
}

function requireAttachImageCommand(value: Partial<AttachImageCommand>) {
  const placement = value.placement
  if (placement !== "end" && placement !== "after_heading" && placement !== "after_anchor") throw new Error("image_attachment_invalid: unsupported placement")
  const anchor = value.anchor === undefined ? undefined : requireText(value.anchor, "anchor")
  if (placement !== "end" && !anchor) throw new Error("image_attachment_invalid: anchor is required for the selected placement")
  if (placement === "end" && anchor) throw new Error("image_attachment_invalid: end placement does not accept anchor")
  return {
    projectId: value.projectId === undefined ? "" : requireText(value.projectId, "projectId"),
    imagePath: requireSafePath(value.imagePath, "imagePath"),
    documentPath: requireSafePath(value.documentPath, "documentPath"),
    alt: requireText(value.alt, "alt"),
    placement,
    ...(anchor ? { anchor } : {}),
  }
}

function requireSafePath(value: unknown, name: string) {
  const path = requireText(value, name).replaceAll("\\", "/")
  if (path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) {
    throw new Error(`image_attachment_invalid: ${name} must be a safe project-relative path`)
  }
  return path
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`image_attachment_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function escapeAlt(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

function hasImageReference(content: string, destination: string) {
  return [...content.matchAll(/!\[(?:\\.|[^\]])*\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+["'][^)\r\n]*["'])?\s*\)/gu)]
    .some((match) => match[1] === destination || match[2] === destination || match[1] === encodeURI(destination) || match[2] === encodeURI(destination))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function attachmentToolError(error: unknown): CreatXError {
  const detail = errorMessage(error)
  if (detail.startsWith("image_attachment_conflict")) return { code: "image_attachment_conflict", message: "文章在挂接图片前发生变化或锚点不唯一。", detail }
  if (detail.startsWith("image_attachment_invalid")) return { code: "image_attachment_invalid", message: "文章图片挂接请求无效。", detail }
  return { code: "tool_failed", message: "图片已保留，但未能挂接到文章。", detail }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
