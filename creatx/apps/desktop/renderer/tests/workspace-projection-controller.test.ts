import { describe, expect, test } from "bun:test"
import type { FilePreview, ProjectSnapshot, WorkbenchSnapshot } from "@creatx/contracts"
import { WorkspaceProjectionController } from "../src/workspace-projection-controller"

describe("WorkspaceProjectionController", () => {
  test("clears a migrated selection atomically and never reads the removed file again", async () => {
    const initial = project(["旧回执.json", "正文.md"], "r1")
    const refreshed = project(["正文.md"], "r2")
    const reads: string[] = []
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => refreshed,
      readWorkbenches: async () => workbenches(refreshed.id, "w2"),
      readFile: async (_projectId, fileId) => {
        reads.push(fileId)
        return preview(initial, fileId)
      },
    })
    controller.open(initial, workbenches(initial.id, "w1"))
    await controller.select(initial.files[0]!.id)

    await controller.invalidate({ type: "project.projection.invalidated", projectId: initial.id, areas: ["files", "workbenches"] })

    expect(controller.snapshot().selectedFileId).toBeUndefined()
    expect(controller.snapshot().preview).toBeUndefined()
    expect(reads).toEqual([initial.files[0]!.id])
  })

  test("rejects an old preview result after the user selects a newer file", async () => {
    const current = project(["甲.md", "乙.md"], "r1")
    const pending = new Map<string, (value: FilePreview) => void>()
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => current,
      readWorkbenches: async () => workbenches(current.id, "w1"),
      readFile: (_projectId, fileId) => new Promise((resolve) => pending.set(fileId, resolve)),
    })
    controller.open(current, workbenches(current.id, "w1"))
    const first = controller.select(current.files[0]!.id)
    const second = controller.select(current.files[1]!.id)
    pending.get(current.files[1]!.id)!(preview(current, current.files[1]!.id))
    await second
    pending.get(current.files[0]!.id)!(preview(current, current.files[0]!.id))
    await first

    expect(controller.snapshot().selectedFileId).toBe(current.files[1]!.id)
    expect(controller.snapshot().preview?.file.id).toBe(current.files[1]!.id)
  })

  test("coalesces repeated project invalidations while a refresh is running", async () => {
    const current = project(["正文.md"], "r1")
    let refreshes = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => {
        refreshes += 1
        await gate
        return project(["正文.md"], `r${refreshes + 1}`)
      },
      readWorkbenches: async () => workbenches(current.id, `w${refreshes}`),
      readFile: async (_projectId, fileId) => preview(current, fileId),
    })
    controller.open(current, workbenches(current.id, "w1"))
    const first = controller.invalidate({ type: "project.projection.invalidated", projectId: current.id, areas: ["files"] })
    const second = controller.invalidate({ type: "project.projection.invalidated", projectId: current.id, areas: ["files"] })
    release!()
    await Promise.all([first, second])

    expect(refreshes).toBe(1)
  })

  test("runs one trailing refresh when a new write lands after the current refresh started", async () => {
    const current = project(["正文.md"], "r1")
    const releases: Array<() => void> = []
    let refreshes = 0
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => {
        refreshes += 1
        await new Promise<void>((resolve) => releases.push(resolve))
        return project(["正文.md", `新增-${refreshes}.md`], `r${refreshes + 1}`)
      },
      readWorkbenches: async () => workbenches(current.id, `w${refreshes}`),
      readFile: async (_projectId, fileId) => preview(current, fileId),
    })
    controller.open(current, workbenches(current.id, "w1"))
    const first = controller.invalidate({ type: "project.projection.invalidated", projectId: current.id, areas: ["files"] })
    await Promise.resolve()
    expect(refreshes).toBe(1)
    const second = controller.invalidate({ type: "project.projection.invalidated", projectId: current.id, areas: ["files"] })
    releases.shift()!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refreshes).toBe(2)
    releases.shift()!()
    await Promise.all([first, second])

    expect(controller.snapshot().project?.files.map((file) => file.name)).toContain("新增-2.md")
  })

  test("keeps the selected preview mounted across unrelated project writes", async () => {
    const initial = project(["正文.md", "插图.png"], "r1")
    const refreshed = {
      ...project(["正文.md", "插图.png", "新增.md"], "r2"),
      files: project(["正文.md", "插图.png", "新增.md"], "r2").files.map((file) => file.relativePath === "插图.png"
        ? { ...file, modifiedAt: initial.files[1]!.modifiedAt }
        : file),
    }
    let reads = 0
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => refreshed,
      readWorkbenches: async () => workbenches(initial.id, "w2"),
      readFile: async (_projectId, fileId) => {
        reads += 1
        return preview(initial, fileId)
      },
    })
    controller.open(initial, workbenches(initial.id, "w1"))
    await controller.select(initial.files[1]!.id)
    const selectedPreview = controller.snapshot().preview

    await controller.invalidate({ type: "project.projection.invalidated", projectId: initial.id, areas: ["files"] })

    expect(controller.snapshot().preview).toBe(selectedPreview)
    expect(reads).toBe(1)
  })

  test("replaces a changed selected preview without publishing an empty frame", async () => {
    const initial = project(["插图.png"], "r1")
    const refreshed = project(["插图.png"], "r2")
    const published: Array<FilePreview | undefined> = []
    let reads = 0
    const controller = new WorkspaceProjectionController({
      refreshFiles: async () => refreshed,
      readWorkbenches: async () => workbenches(initial.id, "w2"),
      readFile: async (_projectId, fileId) => {
        reads += 1
        return reads === 1 ? preview(initial, fileId) : preview(refreshed, fileId)
      },
    }, (state) => published.push(state.preview))
    controller.open(initial, workbenches(initial.id, "w1"))
    await controller.select(initial.files[0]!.id)
    published.length = 0

    await controller.invalidate({ type: "project.projection.invalidated", projectId: initial.id, areas: ["files"] })

    expect(reads).toBe(2)
    expect(published.some((value) => value === undefined)).toBe(false)
    expect(controller.snapshot().preview?.file.modifiedAt).toBe("r2")
  })
})

function project(paths: string[], refreshedAt: string): ProjectSnapshot {
  return {
    id: "project-1",
    name: "项目",
    displayPath: "C:\\项目",
    refreshedAt,
    files: paths.map((relativePath) => ({
      id: `file:${relativePath}`,
      relativePath,
      name: relativePath,
      kind: "markdown" as const,
      size: 10,
      modifiedAt: refreshedAt,
    })),
  }
}

function workbenches(projectId: string, refreshedAt: string): WorkbenchSnapshot {
  return { projectId, refreshedAt, diagnostics: [], workbenches: [] }
}

function preview(current: ProjectSnapshot, fileId: string): FilePreview {
  return { file: current.files.find((file) => file.id === fileId)!, content: fileId }
}
