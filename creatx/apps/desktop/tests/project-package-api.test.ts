import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ClineSessionRecord } from "@creatx/cline-adapter/contracts"
import type { CreatXError, PortableConversationV1, ProjectPackageJobProjection } from "@creatx/contracts"
import { ProjectFileService } from "@creatx/project-files"
import { exportPortableProjectPackage, PortableProjectMetadataStore, ProjectCatalogStore } from "@creatx/project-package-runtime"
import { WorkbenchRegistryService } from "@creatx/workbench"
import { ProjectPackageDesktopService } from "../src/project-package-api.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("desktop project package workflow", () => {
  test("projects exchange state and exports a real package without invoking a Provider", async () => {
    const fixture = await createFixture("export")
    const session = fixture.adapter.addSession(fixture.project.id, fixture.project.displayPath)
    await fixture.service.saveOverview(fixture.project.id, overview)
    await fixture.service.setProjectCase({ projectId: fixture.project.id, sessionId: session.id, included: true })

    const exchange = await fixture.service.readExchange(fixture.project.id)
    expect(exchange).toMatchObject({ files: 1, directories: 0, bytes: 12, overview, publisherVerified: false })
    expect(exchange.cases.map((item) => item.sessionId)).toEqual([session.id])

    const destinationPath = join(fixture.root, "分享.np")
    const started = fixture.service.startExport({
      projectId: fixture.project.id,
      destinationPath,
      cases: [{ sessionId: session.id, title: "创作案例", purpose: "展示协作", conclusion: "已完成", continuationBrief: "继续扩写" }],
    })
    expect(started).toMatchObject({ operation: "export", state: "running", phase: "preparing", progress: 0 })
    const completed = await waitForTerminal(fixture.events, started.jobId)
    expect(completed).toMatchObject({ state: "succeeded", phase: "complete", progress: 100, result: { kind: "export", status: "created", destinationPath } })
    expect(fixture.events.filter((event) => event.jobId === started.jobId).length).toBeLessThanOrEqual(4)
    expect(fixture.adapter.providerCalls).toBe(0)
  })

  test("rejects a second job and cancellation settles through the same bounded lifecycle", async () => {
    const fixture = await createFixture("cancel")
    const session = fixture.adapter.addSession(fixture.project.id, fixture.project.displayPath)
    await fixture.service.saveOverview(fixture.project.id, overview)
    await fixture.service.setProjectCase({ projectId: fixture.project.id, sessionId: session.id, included: true })
    const release = fixture.adapter.blockNextExport()
    const started = fixture.service.startExport({
      projectId: fixture.project.id,
      destinationPath: join(fixture.root, "cancel.np"),
      cases: [{ sessionId: session.id, title: "案例", purpose: "目的", conclusion: "结论", continuationBrief: "继续" }],
    })
    expect(() => fixture.service.startImport({ packagePath: "D:\\missing.np", destinationPath: join(fixture.root, "other"), displayName: "other" })).toThrow("already running")
    fixture.service.cancel(started.jobId)
    release()
    const completed = await waitForTerminal(fixture.events, started.jobId)
    expect(completed).toMatchObject({ state: "cancelled", phase: "complete" })
    expect(fixture.adapter.providerCalls).toBe(0)
  })

  test("opens a real imported directory only after a successful commit", async () => {
    const source = await createFixture("source")
    await new PortableProjectMetadataStore(source.files.internal).initializeLocal(source.project.id, overview)
    const packagePath = join(source.root, "source.np")
    await exportPortableProjectPackage({
      destinationPath: packagePath,
      localProjectId: source.project.id,
      metadata: (await new PortableProjectMetadataStore(source.files.internal).read(source.project.id))!.metadata,
      projectFiles: source.files.queries,
      conversations: [],
      workbenches: [],
      exportedAt: "2026-08-10T00:00:00.000Z",
      exporterVersion: "test",
    })

    const target = await createFixture("target")
    const destinationPath = join(target.root, "导入项目")
    const started = target.service.startImport({ packagePath, destinationPath, displayName: "导入项目" })
    const completed = await waitForTerminal(target.events, started.jobId)
    expect(completed).toMatchObject({ state: "succeeded", result: { kind: "import", status: "imported", destinationPath } })
    expect(target.openedPaths).toEqual([destinationPath])

    const failed = target.service.startImport({ packagePath: join(target.root, "missing.np"), destinationPath: join(target.root, "不得出现"), displayName: "失败" })
    expect(await waitForTerminal(target.events, failed.jobId)).toMatchObject({ state: "failed" })
    expect(target.openedPaths).toEqual([destinationPath])
    expect(target.adapter.providerCalls).toBe(0)
  })
})

const overview = { purpose: "展示一个世界", currentResults: "完成设定", usageGuide: "从首页开始阅读" }

async function createFixture(name: string) {
  const root = await mkdtemp(join(tmpdir(), `noven-desktop-package-${name}-`))
  temporaryDirectories.push(root)
  const projectRoot = join(root, "项目")
  await mkdir(projectRoot)
  await writeFile(join(projectRoot, "世界.md"), "世界内容", "utf8")
  const files = new ProjectFileService()
  const project = await files.openProject(projectRoot)
  const workbenches = new WorkbenchRegistryService(files.queries, files.internal)
  const adapter = new ControlledProjectCaseAdapter()
  const events: ProjectPackageJobProjection[] = []
  const openedPaths: string[] = []
  const service = new ProjectPackageDesktopService({
    projectFiles: files,
    workbenches,
    adapter,
    catalog: new ProjectCatalogStore(join(root, "profile")),
    exporterVersion: "test",
    classifyError,
    sendJob: (job) => events.push(job),
    openImportedProject: async (path) => {
      openedPaths.push(path)
      const opened = await files.openProject(path)
      return { project: opened, workbenches: await workbenches.queries.snapshot(opened.id) }
    },
  })
  return { root, files, project, adapter, service, events, openedPaths }
}

class ControlledProjectCaseAdapter {
  providerCalls = 0
  private readonly sessions: Array<ClineSessionRecord & { projectId: string }> = []
  private readonly included = new Set<string>()
  private exportGate: Promise<void> | undefined
  private releaseExport: (() => void) | undefined

  addSession(projectId: string, projectRoot: string) {
    const session = {
      id: `session-${this.sessions.length + 1}`,
      title: "创作（1）",
      projectRoot,
      status: "idle",
      startedAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      providerId: "controlled-provider",
      modelId: "controlled-model",
      kind: "project" as const,
      permissionMode: "approval" as const,
      projectId,
    }
    this.sessions.push(session)
    return session
  }

  listSessions(limit = 100) {
    return Promise.resolve(this.sessions.slice(0, limit))
  }

  listProjectCaseSessions(projectId: string) {
    return Promise.resolve(this.sessions.filter((session) => session.projectId === projectId && this.included.has(session.id)))
  }

  setProjectCase(sessionId: string, included: boolean) {
    if (included) this.included.add(sessionId)
    else this.included.delete(sessionId)
    return Promise.resolve(included)
  }

  async exportProjectCase(input: { sessionId: string; title: string; purpose: string; conclusion: string; continuationBrief: string }) {
    await this.exportGate
    return {
      schemaVersion: 1 as const,
      caseId: input.sessionId,
      title: input.title,
      purpose: input.purpose,
      conclusion: input.conclusion,
      continuationBrief: input.continuationBrief,
      items: [
        { kind: "message" as const, role: "user" as const, text: "建立世界", fileReferences: [] },
        { kind: "message" as const, role: "assistant" as const, text: "世界已建立", fileReferences: [] },
      ],
    } satisfies PortableConversationV1
  }

  blockNextExport() {
    this.exportGate = new Promise((resolve) => { this.releaseExport = resolve })
    return () => this.releaseExport?.()
  }
}

async function waitForTerminal(events: readonly ProjectPackageJobProjection[], jobId: string) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const terminal = events.findLast((event) => event.jobId === jobId && event.state !== "running")
    if (terminal) return terminal
    await Bun.sleep(5)
  }
  throw new Error(`job did not settle: ${jobId}`)
}

function classifyError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  return { code: detail.includes("cancel") ? "package_cancelled" : "package_invalid", message: detail, detail }
}
