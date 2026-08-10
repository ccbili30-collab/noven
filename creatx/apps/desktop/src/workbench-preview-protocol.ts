import { randomUUID } from "node:crypto"
import { extname, posix } from "node:path"
import type { FilePreview, ProjectFile, WorkbenchPresentationProjection } from "@creatx/contracts"
import type { ProjectFileQueryPort } from "@creatx/project-files"
import type { ResolvedWorkbenchPresentation } from "@creatx/workbench"

const tokenLifetimeMs = 24 * 60 * 60 * 1000

export class WorkbenchPreviewProtocol {
  private readonly tokens = new Map<string, ResolvedWorkbenchPresentation & { createdAt: number }>()

  constructor(
    private readonly projectFiles: ProjectFileQueryPort,
    private readonly now: () => number = Date.now,
    private readonly createToken: () => string = randomUUID,
  ) {}

  issue(resolved: ResolvedWorkbenchPresentation): WorkbenchPresentationProjection {
    return this.issueBinding(resolved)
  }

  async issueProjectHtml(projectId: string, fileId: string): Promise<WorkbenchPresentationProjection> {
    const project = await this.projectFiles.refreshProject(projectId)
    const file = project.files.find((candidate) => candidate.id === fileId)
    if (!file || file.kind !== "html") throw new Error("file_invalid: file is not a project HTML presentation")
    const folder = posix.dirname(file.relativePath)
    return this.issueBinding({ projectId, workbenchId: "builtin:files", folder: folder === "." ? "" : folder, entry: posix.basename(file.relativePath) })
  }

  async issueProjectImage(projectId: string, fileId: string, validatedFile?: ProjectFile): Promise<FilePreview> {
    const file = validatedFile?.id === fileId
      ? validatedFile
      : (await this.projectFiles.refreshProject(projectId)).files.find((candidate) => candidate.id === fileId)
    if (!file || file.kind !== "image") throw new Error("file_invalid: file is not a project image")
    const folder = posix.dirname(file.relativePath)
    const presentation = this.issueBinding({ projectId, workbenchId: "builtin:files", folder: folder === "." ? "" : folder, entry: posix.basename(file.relativePath) })
    return { file, assetUrl: presentation.url }
  }

  private issueBinding(resolved: ResolvedWorkbenchPresentation): WorkbenchPresentationProjection {
    const now = this.now()
    for (const [key, value] of this.tokens) if (now - value.createdAt > tokenLifetimeMs) this.tokens.delete(key)
    const token = this.createToken()
    this.tokens.set(token, { ...resolved, createdAt: now })
    return { workbenchId: resolved.workbenchId, entry: resolved.entry, url: `creatx-workbench://${token}/${resolved.entry.split("/").map(encodeURIComponent).join("/")}` }
  }

  async handle(request: Request) {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
      const binding = this.tokens.get(url.hostname)
      if (binding && this.now() - binding.createdAt > tokenLifetimeMs) {
        this.tokens.delete(url.hostname)
        return notFound()
      }
      if (!binding || !segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) return notFound()
      const bytes = await this.projectFiles.readBytes(binding.projectId, binding.folder ? `${binding.folder}/${segments.join("/")}` : segments.join("/"))
      return new Response(Uint8Array.from(bytes).buffer, {
        headers: {
          "Content-Type": workbenchMimeType(segments.at(-1) ?? ""),
          "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      })
    } catch {
      return notFound()
    }
  }
}

function workbenchMimeType(path: string) {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  }
  return types[extname(path).toLocaleLowerCase("en-US")] ?? "application/octet-stream"
}

function notFound() {
  return new Response("Not found", { status: 404 })
}
