import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import type { ClineSessionRecord } from "@creatx/cline-adapter/contracts"
import {
  type CreatXError,
  type ProjectPackageExchangeProjection,
  type ProjectPackageJobProjection,
  type ProjectPackageOverview,
  type PortableConversationV1,
  type ProjectSnapshot,
  type SaveProjectPackageOverviewCommand,
  type SetProjectPackageCaseCommand,
  type StartProjectPackageExportCommand,
  type StartProjectPackageImportCommand,
  type WorkbenchSnapshot,
} from "@creatx/contracts"
import type { ProjectFileService } from "@creatx/project-files"
import {
  exportPortableProjectPackage,
  importPortableProjectPackage,
  PortableProjectMetadataStore,
  ProjectCatalogStore,
} from "@creatx/project-package-runtime"
import type { WorkbenchRegistryService } from "@creatx/workbench"

interface ProjectCaseAdapter {
  listSessions(limit?: number): Promise<ClineSessionRecord[]>
  listProjectCaseSessions(projectId: string): Promise<ClineSessionRecord[]>
  setProjectCase(sessionId: string, included: boolean): Promise<boolean>
  exportProjectCase(input: {
    projectId: string
    sessionId: string
    title: string
    purpose: string
    conclusion: string
    continuationBrief: string
    exportedFilePaths: readonly string[]
  }, signal?: AbortSignal): Promise<PortableConversationV1>
}

export function requireSaveProjectPackageOverviewCommand(value: unknown): SaveProjectPackageOverviewCommand {
  const input = requireRecord(value, ["projectId", "overview"], "overview command")
  const overview = requireRecord(input.overview, ["purpose", "currentResults", "usageGuide"], "overview")
  return {
    projectId: requireText(input.projectId, "projectId", 256),
    overview: {
      purpose: requireText(overview.purpose, "overview.purpose", 64 * 1024),
      currentResults: requireText(overview.currentResults, "overview.currentResults", 64 * 1024),
      usageGuide: requireText(overview.usageGuide, "overview.usageGuide", 64 * 1024),
    },
  }
}

export function requireSetProjectPackageCaseCommand(value: unknown): SetProjectPackageCaseCommand {
  const input = requireRecord(value, ["projectId", "sessionId", "included"], "case command")
  if (typeof input.included !== "boolean") throw new Error("package_invalid: included must be boolean")
  return { projectId: requireText(input.projectId, "projectId", 256), sessionId: requireText(input.sessionId, "sessionId", 256), included: input.included }
}

export function requireStartProjectPackageExportCommand(value: unknown): StartProjectPackageExportCommand {
  const input = requireRecord(value, ["projectId", "destinationPath", "cases"], "export command")
  if (!Array.isArray(input.cases) || input.cases.length > 1_000) throw new Error("package_invalid: cases must contain at most 1000 entries")
  return {
    projectId: requireText(input.projectId, "projectId", 256),
    destinationPath: requireText(input.destinationPath, "destinationPath", 32_768),
    cases: input.cases.map((value, index) => {
      const item = requireRecord(value, ["sessionId", "title", "purpose", "conclusion", "continuationBrief"], `cases[${index}]`)
      return {
        sessionId: requireText(item.sessionId, `cases[${index}].sessionId`, 256),
        title: requireText(item.title, `cases[${index}].title`, 64 * 1024),
        purpose: requireText(item.purpose, `cases[${index}].purpose`, 64 * 1024),
        conclusion: requireText(item.conclusion, `cases[${index}].conclusion`, 64 * 1024),
        continuationBrief: requireText(item.continuationBrief, `cases[${index}].continuationBrief`, 64 * 1024),
      }
    }),
  }
}

export function requireStartProjectPackageImportCommand(value: unknown): StartProjectPackageImportCommand {
  const input = requireRecord(value, ["packagePath", "destinationPath", "displayName", "conflictResolution"], "import command", ["conflictResolution"])
  if (input.conflictResolution !== undefined && input.conflictResolution !== "independent-copy") throw new Error("package_invalid: conflictResolution is invalid")
  return {
    packagePath: requireText(input.packagePath, "packagePath", 32_768),
    destinationPath: requireText(input.destinationPath, "destinationPath", 32_768),
    displayName: requireText(input.displayName, "displayName", 256),
    ...(input.conflictResolution ? { conflictResolution: input.conflictResolution } : {}),
  }
}

export function requireProjectPackageSuggestedName(value: unknown) {
  const name = basename(requireText(value, "suggestedName", 256)).replace(/\.np$/iu, "").trim()
  if (!name || name === "." || name === "..") throw new Error("package_invalid: suggestedName is invalid")
  return name
}

export function requireProjectPackageJobId(value: unknown) {
  return requireText(value, "jobId", 128)
}

function requireRecord(value: unknown, fields: readonly string[], name: string, optional: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`package_invalid: ${name} must be an object`)
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !fields.includes(key)) || fields.some((key) => !optional.includes(key) && !(key in record))) throw new Error(`package_invalid: ${name} schema is invalid`)
  return record
}

function requireText(value: unknown, name: string, maximumLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) throw new Error(`package_invalid: ${name} is invalid`)
  return value.trim()
}

interface ProjectPackageDesktopServiceOptions {
  projectFiles: ProjectFileService
  workbenches: WorkbenchRegistryService
  adapter: ProjectCaseAdapter
  catalog: ProjectCatalogStore
  exporterVersion: string
  classifyError(error: unknown): CreatXError
  sendJob(job: ProjectPackageJobProjection): void
  openImportedProject(rootPath: string): Promise<{ project: ProjectSnapshot; workbenches: WorkbenchSnapshot }>
}

export class ProjectPackageDesktopService {
  private activeJob: { projection: ProjectPackageJobProjection; controller: AbortController; settled: Promise<void> } | undefined
  private readonly metadata: PortableProjectMetadataStore

  constructor(private readonly options: ProjectPackageDesktopServiceOptions) {
    this.metadata = new PortableProjectMetadataStore(options.projectFiles.internal)
  }

  async readExchange(projectId: string): Promise<ProjectPackageExchangeProjection> {
    const project = await this.options.projectFiles.queries.refreshProject(projectId)
    const portable = await this.options.projectFiles.queries.portableEntries(projectId)
    const metadata = await this.metadata.read(projectId)
    const cases = await this.options.adapter.listProjectCaseSessions(projectId)
    const exportedPaths = portable.entries.filter((entry) => entry.kind === "file").map((entry) => entry.relativePath)
    const workbenches = await this.options.workbenches.exportPortableWorkbenches(projectId, exportedPaths)
    return {
      projectId: project.id,
      ...(metadata ? { overview: metadata.metadata.overview } : {}),
      files: exportedPaths.length,
      directories: portable.entries.length - exportedPaths.length,
      bytes: portable.entries.reduce((total, entry) => total + entry.bytes, 0),
      exclusions: portable.exclusions,
      cases: cases.map((session) => ({ sessionId: session.id, title: session.title, updatedAt: session.updatedAt })),
      workbenches: workbenches.records.length,
      workbenchDiagnostics: workbenches.diagnostics.length,
      publisherVerified: false,
    }
  }

  async saveOverview(projectId: string, overview: ProjectPackageOverview) {
    await this.metadata.saveOverview(projectId, overview)
    return this.readExchange(projectId)
  }

  async setProjectCase(command: SetProjectPackageCaseCommand) {
    const session = (await this.options.adapter.listSessions(1_000)).find((candidate) => candidate.id === command.sessionId)
    if (!session) throw new Error("session_missing: Cline history does not contain this session")
    if (this.options.projectFiles.rememberProjectRoot(session.projectRoot) !== command.projectId) throw new Error("session_invalid: project case does not belong to the requested project")
    await this.options.adapter.setProjectCase(command.sessionId, command.included)
    return this.readExchange(command.projectId)
  }

  startExport(command: StartProjectPackageExportCommand) {
    return this.start("export", async (signal, phase) => {
      const portable = await this.options.projectFiles.queries.portableEntries(command.projectId)
      const metadata = await this.metadata.read(command.projectId)
      if (!metadata) throw new Error("package_metadata_invalid: project overview must be saved before export")
      const exportedFilePaths = portable.entries.filter((entry) => entry.kind === "file").map((entry) => entry.relativePath)
      phase("transferring", 15)
      const conversations = await Promise.all(command.cases.map((item) => this.options.adapter.exportProjectCase({
        ...item,
        projectId: command.projectId,
        exportedFilePaths,
      }, signal)))
      const workbenches = await this.options.workbenches.exportPortableWorkbenches(command.projectId, exportedFilePaths)
      const result = await exportPortableProjectPackage({
        destinationPath: command.destinationPath,
        localProjectId: command.projectId,
        metadata: metadata.metadata,
        projectFiles: this.options.projectFiles.queries,
        conversations,
        workbenches: workbenches.records,
        exportedAt: new Date().toISOString(),
        exporterVersion: this.options.exporterVersion,
        signal,
      })
      phase("finalizing", 90)
      return {
        kind: "export" as const,
        status: result.status,
        destinationPath: result.destinationPath,
        packageId: result.packageId,
        bytes: result.bytes,
      }
    })
  }

  startImport(command: StartProjectPackageImportCommand) {
    return this.start("import", async (signal, phase) => {
      phase("transferring", 15)
      const result = await importPortableProjectPackage({
        ...command,
        projectFiles: this.options.projectFiles,
        workbenches: this.options.workbenches,
        catalog: this.options.catalog,
        signal,
      })
      phase("finalizing", 90)
      if (result.status === "committed-unregistered") {
        return { kind: "import" as const, status: result.status, destinationPath: result.destinationPath, failure: result.failure }
      }
      if (signal.aborted && result.status === "imported") {
        return {
          kind: "import" as const,
          status: result.status,
          destinationPath: result.destinationPath,
          projectId: result.runtimeProjectId,
          workbenchDiagnostics: result.workbenchDiagnostics.length,
        }
      }
      signal.throwIfAborted()
      const destinationPath = result.status === "existing" ? result.entry.rootPath : result.destinationPath
      const opened = await this.options.openImportedProject(destinationPath)
      return {
        kind: "import" as const,
        status: result.status,
        destinationPath,
        projectId: opened.project.id,
        workbenchDiagnostics: result.status === "imported" ? result.workbenchDiagnostics.length : opened.workbenches.diagnostics.length,
      }
    })
  }

  cancel(jobId: string) {
    if (!this.activeJob || this.activeJob.projection.jobId !== jobId) throw new Error("package_job_invalid: project package job is not active")
    this.activeJob.controller.abort(new Error("package_job_cancelled: user cancelled project package job"))
  }

  async shutdown() {
    const active = this.activeJob
    if (!active) return
    active.controller.abort(new Error("package_job_cancelled: application is closing"))
    await active.settled
  }

  private start(operation: "export" | "import", task: (
    signal: AbortSignal,
    phase: (phase: "transferring" | "finalizing", progress: number) => void,
  ) => Promise<NonNullable<ProjectPackageJobProjection["result"]>>) {
    if (this.activeJob) throw new Error("package_job_conflict: another project package job is already running")
    const controller = new AbortController()
    const projection: ProjectPackageJobProjection = {
      jobId: randomUUID(),
      operation,
      state: "running",
      phase: "preparing",
      progress: 0,
    }
    const emit = () => this.options.sendJob({ ...projection })
    const settled = Promise.resolve().then(async () => {
      emit()
      try {
        const result = await task(controller.signal, (phase, progress) => {
          if (projection.phase === phase) return
          projection.phase = phase
          projection.progress = progress
          emit()
        })
        projection.state = "succeeded"
        projection.phase = "complete"
        projection.progress = 100
        projection.result = result
        emit()
      } catch (error) {
        projection.state = controller.signal.aborted ? "cancelled" : "failed"
        projection.phase = "complete"
        projection.error = this.options.classifyError(controller.signal.aborted ? controller.signal.reason : error)
        emit()
      } finally {
        if (this.activeJob?.projection.jobId === projection.jobId) this.activeJob = undefined
      }
    })
    this.activeJob = { projection, controller, settled }
    return { ...projection }
  }
}
