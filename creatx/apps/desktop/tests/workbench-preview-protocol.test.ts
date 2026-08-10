import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProjectSnapshot } from "@creatx/contracts"
import { ProjectFileService } from "@creatx/project-files"
import type { ProjectFileQueryPort } from "@creatx/project-files"
import { WorkbenchPreviewProtocol } from "../src/workbench-preview-protocol"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("workbench preview protocol", () => {
  test("serves only token-bound workbench resources with restrictive headers", async () => {
    const reads: string[] = []
    const protocol = new WorkbenchPreviewProtocol(queryPort(reads), () => 1000, () => "opaque-token")
    const presentation = protocol.issue({ projectId: "project-1", workbenchId: "workbench-1", folder: "世界/图谱", entry: "index.html" })

    const html = await protocol.handle(new Request(presentation.url))
    const script = await protocol.handle(new Request("creatx-workbench://opaque-token/assets/app.js"))

    expect(html.status).toBe(200)
    expect(html.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    expect(html.headers.get("content-security-policy")).toContain("connect-src 'self'")
    expect(html.headers.get("content-security-policy")).toContain("form-action 'none'")
    expect(html.headers.get("x-content-type-options")).toBe("nosniff")
    expect(reads).toEqual(["project-1:世界/图谱/index.html", "project-1:世界/图谱/assets/app.js"])
  })

  test("rejects unknown tokens and encoded backslash paths", async () => {
    const reads: string[] = []
    const protocol = new WorkbenchPreviewProtocol(queryPort(reads), () => 1000, () => "opaque-token")
    protocol.issue({ projectId: "project-1", workbenchId: "workbench-1", folder: "世界/图谱", entry: "index.html" })

    expect((await protocol.handle(new Request("creatx-workbench://missing/index.html"))).status).toBe(404)
    expect((await protocol.handle(new Request("creatx-workbench://opaque-token/assets%5Csecret.txt"))).status).toBe(404)
    expect(reads).toEqual([])
  })

  test("expires old tokens when issuing a new presentation", async () => {
    const reads: string[] = []
    let now = 0
    let token = "first"
    const protocol = new WorkbenchPreviewProtocol(queryPort(reads), () => now, () => token)
    const first = protocol.issue({ projectId: "project-1", workbenchId: "workbench-1", folder: "世界", entry: "index.html" })
    now = 24 * 60 * 60 * 1000 + 1
    token = "second"
    protocol.issue({ projectId: "project-1", workbenchId: "workbench-1", folder: "世界", entry: "index.html" })

    expect((await protocol.handle(new Request(first.url))).status).toBe(404)
  })

  test("serves ordinary project HTML from its own directory and keeps the token project-bound", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-html-preview-"))
    roots.push(root)
    await mkdir(join(root, "交互", "assets"), { recursive: true })
    await writeFile(join(root, "交互", "index.html"), "<link rel=\"stylesheet\" href=\"assets/style.css\">", "utf8")
    await writeFile(join(root, "交互", "assets", "style.css"), "body { color: green; }", "utf8")
    await writeFile(join(root, "secret.txt"), "not for this presentation", "utf8")
    const service = new ProjectFileService()
    const project = await service.openProject(root)
    const html = project.files.find((file) => file.relativePath === "交互/index.html")!
    const protocol = new WorkbenchPreviewProtocol(service.queries, () => 1000, () => "html-token")
    const presentation = await protocol.issueProjectHtml(project.id, html.id)

    expect(presentation).toMatchObject({ workbenchId: "builtin:files", entry: "index.html" })
    expect((await protocol.handle(new Request(presentation.url))).status).toBe(200)
    expect(await (await protocol.handle(new Request("creatx-workbench://html-token/assets/style.css"))).text()).toBe("body { color: green; }")
    expect((await protocol.handle(new Request(new URL("../secret.txt", presentation.url)))).status).toBe(404)
  })

  test("rejects non-HTML identities and expires a project HTML token without issuing another", async () => {
    const reads: string[] = []
    let now = 0
    const protocol = new WorkbenchPreviewProtocol(queryPort(reads, project("project-1", "交互/index.html")), () => now, () => "html-token")

    await expect(protocol.issueProjectHtml("project-2", "html-file")).rejects.toThrow("project_invalid")
    await expect(protocol.issueProjectHtml("project-1", "missing")).rejects.toThrow("file_invalid")
    const presentation = await protocol.issueProjectHtml("project-1", "html-file")
    now = 24 * 60 * 60 * 1000 + 1
    expect((await protocol.handle(new Request(presentation.url))).status).toBe(404)
    expect(reads).toEqual([])
  })

  test("serves a project image through a stable protocol URL instead of a Base64 preview", async () => {
    const reads: string[] = []
    const snapshot = projectImage("project-1", "插图/城门.png")
    const protocol = new WorkbenchPreviewProtocol(queryPort(reads, snapshot), () => 1000, () => "image-token")

    const preview = await protocol.issueProjectImage("project-1", "image-file")

    expect(preview).toEqual({
      file: snapshot.files[0]!,
      assetUrl: "creatx-workbench://image-token/%E5%9F%8E%E9%97%A8.png",
    })
    const response = await protocol.handle(new Request(preview.assetUrl!))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(reads).toEqual(["project-1:插图/城门.png"])
  })

  test("rejects non-image files from the project image protocol", async () => {
    const protocol = new WorkbenchPreviewProtocol(queryPort([], project("project-1", "交互/index.html")), () => 1000, () => "image-token")

    await expect(protocol.issueProjectImage("project-1", "html-file")).rejects.toThrow("file_invalid")
  })
})

function queryPort(reads: string[], snapshot?: ProjectSnapshot): ProjectFileQueryPort {
  return {
    refreshProject: async (projectId) => {
      if (!snapshot || snapshot.id !== projectId) throw new Error("project_invalid")
      return snapshot
    },
    readFile: async () => { throw new Error("unused") },
    readBytes: async (projectId, relativePath) => {
      reads.push(`${projectId}:${relativePath}`)
      return new TextEncoder().encode(relativePath)
    },
    listDirectory: async () => undefined,
  }
}

function project(id: string, relativePath: string): ProjectSnapshot {
  return {
    id,
    name: "Project",
    displayPath: "D:\\Project",
    refreshedAt: new Date(0).toISOString(),
    files: [{ id: "html-file", relativePath, name: "index.html", kind: "html", size: 1, modifiedAt: new Date(0).toISOString() }],
  }
}

function projectImage(id: string, relativePath: string): ProjectSnapshot {
  return {
    id,
    name: "Project",
    displayPath: "D:\\Project",
    refreshedAt: new Date(0).toISOString(),
    files: [{ id: "image-file", relativePath, name: "城门.png", kind: "image", size: 1, modifiedAt: new Date(0).toISOString() }],
  }
}
