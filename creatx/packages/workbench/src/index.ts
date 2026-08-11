import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import type {
  CreatXError,
  CreatXToolContribution,
  WorkbenchDiagnostic,
  WorkbenchEntry,
  WorkbenchProjection,
  WorkbenchSnapshot,
} from "@creatx/contracts"
import type { ProjectFileQueryPort, ProjectInternalStatePort } from "@creatx/project-files"

const recordsNamespace = "workbenches"
const recordV1Keys = new Set(["schemaVersion", "id", "folder", "title"])
const recordV2Keys = new Set(["schemaVersion", "id", "folder", "title", "home"])
const recordV3Keys = new Set(["schemaVersion", "id", "folder", "title", "home", "visibility"])
const homeKeys = new Set(["entry", "mode"])
const automaticVisibilityKeys = new Set(["include", "exclude", "autoIncludeNewFiles"])
const frozenVisibilityKeys = new Set([...automaticVisibilityKeys, "files"])
const workbenchIdPattern = /^wb_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const maximumVisibilityPatterns = 64
const maximumFrozenFiles = 10_000

interface WorkbenchHomeRecord {
  entry: string
  mode: "interactive"
}

type WorkbenchVisibility = {
  include: string[]
  exclude: string[]
  autoIncludeNewFiles: true
} | {
  include: string[]
  exclude: string[]
  autoIncludeNewFiles: false
  files: string[]
}

interface WorkbenchRecordV1 {
  schemaVersion: 1
  id: string
  folder: string
  title?: string
}

interface WorkbenchRecordV2 {
  schemaVersion: 2
  id: string
  folder: string
  title?: string
  home: WorkbenchHomeRecord
}

interface WorkbenchRecordV3 {
  schemaVersion: 3
  id: string
  folder: string
  title?: string
  home?: WorkbenchHomeRecord
  visibility: WorkbenchVisibility
}

type WorkbenchRecord = WorkbenchRecordV1 | WorkbenchRecordV2 | WorkbenchRecordV3

export interface PortableWorkbenchV1 {
  exchangeVersion: 1
  record: WorkbenchRecord
}

export interface PortableWorkbenchExport {
  records: PortableWorkbenchV1[]
  diagnostics: WorkbenchDiagnostic[]
}

export interface PortableWorkbenchImport {
  importedIds: string[]
  diagnostics: WorkbenchDiagnostic[]
}

export interface RegisterWorkbenchRequest {
  projectId: string
  folder: string
  title?: string
}

export interface RenameWorkbenchRequest {
  projectId: string
  folder: string
  title: string
}

export interface UnregisterWorkbenchRequest {
  projectId: string
  folder: string
}

export interface UnregisterWorkbenchResult {
  projectId: string
  workbenchId: string
  folder: string
  title: string
}

export interface SetWorkbenchHomeRequest {
  projectId: string
  folder: string
  entry: string
}

export interface SetWorkbenchVisibilityRequest {
  projectId: string
  folder: string
  include?: string[]
  exclude?: string[]
  autoIncludeNewFiles?: boolean
}

export interface ShowInWorkbenchRequest {
  projectId: string
  sessionId: string
  folder: string
  entry: string
}

export interface ResolveWorkbenchPresentationRequest {
  projectId: string
  workbenchId: string
  entry: string
}

export interface ResolvedWorkbenchPresentation {
  projectId: string
  workbenchId: string
  folder: string
  entry: string
}

export interface WorkbenchQueryPort {
  snapshot(projectId: string): Promise<WorkbenchSnapshot>
  resolvePresentation(request: ResolveWorkbenchPresentationRequest): Promise<ResolvedWorkbenchPresentation>
}

export interface WorkbenchCommandPort {
  register(request: RegisterWorkbenchRequest): Promise<WorkbenchProjection>
  rename(request: RenameWorkbenchRequest): Promise<WorkbenchProjection>
  unregister(request: UnregisterWorkbenchRequest): Promise<UnregisterWorkbenchResult>
  setHome(request: SetWorkbenchHomeRequest): Promise<WorkbenchProjection>
  setVisibility(request: SetWorkbenchVisibilityRequest): Promise<WorkbenchProjection>
  show(request: ShowInWorkbenchRequest): Promise<ResolvedWorkbenchPresentation>
}

export interface WorkbenchRegistryOptions {
  onChanged?: (projectId: string) => void
  onPresentationRequested?: (request: ShowInWorkbenchRequest & { workbenchId: string }) => void
}

export class WorkbenchRegistryService {
  private readonly queues = new Map<string, Promise<void>>()

  readonly queries: WorkbenchQueryPort = {
    snapshot: (projectId) => this.snapshot(projectId),
    resolvePresentation: (request) => this.resolvePresentation(request),
  }

  readonly commands: WorkbenchCommandPort = {
    register: (request) => this.serialize(request.projectId, () => this.register(request)),
    rename: (request) => this.serialize(request.projectId, () => this.rename(request)),
    unregister: (request) => this.serialize(request.projectId, () => this.unregister(request)),
    setHome: (request) => this.serialize(request.projectId, () => this.setHome(request)),
    setVisibility: (request) => this.serialize(request.projectId, () => this.setVisibility(request)),
    show: (request) => this.show(request),
  }

  constructor(
    private readonly projectFiles: ProjectFileQueryPort,
    private readonly internalState: ProjectInternalStatePort,
    private readonly options: WorkbenchRegistryOptions = {},
  ) {}

  tool(): CreatXToolContribution {
    return {
      name: "register_workbench",
      audiences: ["ordinary", "growth-stage"],
      description: "Register an existing project-relative directory as a CreatX workbench. Create any needed content first with ordinary file tools because the directory must already exist. Registration only adds a visual entrance: it does not move, copy, modify, or create directory content. Repeating registration for the same directory returns the existing workbench. Never create or edit .creatx JSON directly; always use this tool.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["folder"],
        properties: {
          folder: { type: "string", minLength: 1, description: "Existing project-relative non-root folder using forward slashes." },
          title: { type: "string", minLength: 1, maxLength: 120, description: "Optional display title." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          const parsed = requireToolInput(input)
          return { ok: true, value: await this.commands.register({ projectId: context.projectId, ...parsed }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  renameTool(): CreatXToolContribution {
    return {
      name: "rename_workbench",
      audiences: ["ordinary", "growth-stage"],
      description: "Change only the display title of an already registered CreatX workbench. Identify the workbench by its registered project-relative folder. This preserves the workbench ID, folder, files, and directory content. Use this tool when the user corrects or changes a workbench name; do not repeat register_workbench and never edit .creatx JSON directly.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["folder", "title"],
        properties: {
          folder: { type: "string", minLength: 1, description: "Registered project-relative non-root folder using forward slashes." },
          title: { type: "string", minLength: 1, maxLength: 120, description: "New display title." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          const parsed = requireRenameToolInput(input)
          return { ok: true, value: await this.commands.rename({ projectId: context.projectId, ...parsed }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  unregisterTool(): CreatXToolContribution {
    return {
      name: "unregister_workbench",
      audiences: ["ordinary"],
      description: "Remove one registered CreatX workbench entrance while preserving its real project directory and every content file. This deletes only the matching .creatx workbench view record; it does not delete, move, rename, or modify project content. Missing registered folders may also be unregistered. Never edit .creatx JSON directly.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["folder"],
        properties: {
          folder: { type: "string", minLength: 1, description: "Registered project-relative workbench folder using forward slashes." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          return { ok: true, value: await this.commands.unregister({ projectId: context.projectId, folder: requireFolderToolInput(input) }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  setHomeTool(): CreatXToolContribution {
    return {
      name: "set_workbench_home",
      audiences: ["ordinary"],
      description: "Set an existing HTML file inside a registered workbench as its persistent default interactive home. This updates only the workbench view record; it does not modify the HTML or other project files. Never edit .creatx JSON directly.",
      inputSchema: workbenchPresentationInputSchema(),
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          return { ok: true, value: await this.commands.setHome({ projectId: context.projectId, ...requirePresentationToolInput(input) }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  async exportPortableWorkbenches(projectId: string, exportedPaths: readonly string[]): Promise<PortableWorkbenchExport> {
    return this.serialize(projectId, async () => {
      const paths = portablePathSet(exportedPaths)
      const diagnostics: WorkbenchDiagnostic[] = []
      const directory = await this.internalState.listDirectory(projectId, recordsNamespace, ".")
      if (!directory) return { records: [], diagnostics }
      const loaded = await Promise.all(directory.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map(async (entry) => {
        const recordPath = `.creatx/${recordsNamespace}/${entry.relativePath}`
        try {
          const stored = await this.internalState.readFile(projectId, recordsNamespace, entry.relativePath)
          if (!stored) throw new Error("registration record disappeared")
          const record = decodeRecord(new TextDecoder().decode(stored.bytes))
          if (`${record.id}.json` !== entry.name) throw new Error("record id does not match its file name")
          requirePortableRecordReferences(record, paths)
          return { record, recordPath }
        } catch (error) {
          diagnostics.push({ code: "workbench_record_invalid", recordPath, message: errorMessage(error) })
          return undefined
        }
      }))
      const valid = loaded.filter((item): item is NonNullable<typeof item> => item !== undefined)
      const folders = valid.reduce((groups, item) => {
        const identity = normalizeFolderIdentity(item.record.folder)
        groups.set(identity, [...(groups.get(identity) ?? []), item])
        return groups
      }, new Map<string, typeof valid>())
      const records = valid.flatMap((item): PortableWorkbenchV1[] => {
        if ((folders.get(normalizeFolderIdentity(item.record.folder)) ?? []).length === 1) return [{ exchangeVersion: 1, record: item.record }]
        diagnostics.push({ code: "workbench_record_conflict", recordPath: item.recordPath, message: `文件夹 ${item.record.folder} 存在重复工作台记录。` })
        return []
      }).sort((left, right) => (left.record.title ?? folderTitle(left.record.folder)).localeCompare(right.record.title ?? folderTitle(right.record.folder), "zh-CN") || left.record.id.localeCompare(right.record.id))
      return { records, diagnostics }
    })
  }

  async importPortableWorkbenches(projectId: string, values: readonly unknown[], exportedPaths: readonly string[]): Promise<PortableWorkbenchImport> {
    return this.serialize(projectId, async () => {
      const paths = portablePathSet(exportedPaths)
      const diagnostics: WorkbenchDiagnostic[] = []
      const current = await this.snapshot(projectId)
      const ids = new Set(current.workbenches.filter((workbench) => workbench.source === "registered").map((workbench) => workbench.id))
      const folders = new Set(current.workbenches.filter((workbench) => workbench.source === "registered").map((workbench) => normalizeFolderIdentity(workbench.folder)))
      const importedIds: string[] = []
      for (const [index, value] of values.entries()) {
        let record: WorkbenchRecord
        try {
          record = decodePortableWorkbench(value)
          requirePortableRecordReferences(record, paths)
        } catch (error) {
          diagnostics.push({ code: "workbench_record_invalid", recordPath: `workbenches/record-${index + 1}.json`, message: errorMessage(error) })
          continue
        }
        const recordPath = `workbenches/${record.id}.json`
        if (ids.has(record.id) || folders.has(normalizeFolderIdentity(record.folder))) {
          diagnostics.push({ code: "workbench_record_conflict", recordPath, message: `工作台 ${record.title ?? record.folder} 与目标项目现有记录冲突。` })
          continue
        }
        try {
          await this.internalState.writeFile({ projectId, namespace: recordsNamespace, key: `${record.id}.json`, content: `${JSON.stringify(record, undefined, 2)}\n`, expectedModifiedAt: null })
          ids.add(record.id)
          folders.add(normalizeFolderIdentity(record.folder))
          importedIds.push(record.id)
        } catch (error) {
          diagnostics.push({ code: "workbench_record_invalid", recordPath, message: errorMessage(error) })
        }
      }
      if (importedIds.length) this.options.onChanged?.(projectId)
      return { importedIds, diagnostics }
    })
  }

  setVisibilityTool(): CreatXToolContribution {
    return {
      name: "set_workbench_visibility",
      audiences: ["ordinary"],
      description: "Set which real files are visible in an already registered workbench without changing project content. Include and exclude patterns are relative to the workbench folder and support *, ?, and ** path segments. Exclude wins over include. autoIncludeNewFiles defaults to true so new matching files appear automatically; false freezes the currently matching file list. Never edit .creatx JSON directly.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["folder"],
        properties: {
          folder: { type: "string", minLength: 1, description: "Registered project-relative workbench folder using forward slashes." },
          include: visibilityPatternsSchema("Optional file patterns to include. Empty or omitted includes every ordinary workbench file before exclusions."),
          exclude: visibilityPatternsSchema("Optional file patterns to exclude. Exclusion always wins."),
          autoIncludeNewFiles: { type: "boolean", default: true, description: "When true, new matching files appear automatically. When false, only files matching at this moment are frozen into the workbench." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          return { ok: true, value: await this.commands.setVisibility({ projectId: context.projectId, ...requireVisibilityToolInput(input) }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  showTool(): CreatXToolContribution {
    return {
      name: "show_in_workbench",
      audiences: ["ordinary"],
      description: "Show an existing HTML file inside a registered workbench in the current CreatX session without changing the persistent workbench home. Use set_workbench_home when the view should open by default in future sessions.",
      inputSchema: workbenchPresentationInputSchema(),
      scope: "project",
      approval: "automatic",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: workbenchError("project_invalid: project identity is required") }
        try {
          return { ok: true, value: await this.commands.show({ projectId: context.projectId, sessionId: context.sessionId, ...requirePresentationToolInput(input) }) }
        } catch (error) {
          return { ok: false, error: workbenchError(error) }
        }
      },
    }
  }

  private async snapshot(projectId: string): Promise<WorkbenchSnapshot> {
    const diagnostics: WorkbenchDiagnostic[] = []
    const builtin = await projectWorkbench(this.projectFiles, projectId, "builtin:files", "builtin", "文件", ".")
    const directory = await this.internalState.listDirectory(projectId, recordsNamespace, ".")
    if (!directory) return snapshot(projectId, [builtin], diagnostics)

    const loaded = await Promise.all(directory.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map(async (entry) => {
      try {
        const record = decodeRecord(new TextDecoder().decode((await this.internalState.readFile(projectId, recordsNamespace, entry.relativePath))!.bytes))
        if (`${record.id}.json` !== entry.name) throw new Error("record id does not match its file name")
        return { record, recordPath: `.creatx/${recordsNamespace}/${entry.relativePath}` }
      } catch (error) {
        diagnostics.push({ code: "workbench_record_invalid", recordPath: `.creatx/${recordsNamespace}/${entry.relativePath}`, message: errorMessage(error) })
        return undefined
      }
    }))
    const valid = loaded.filter((item): item is NonNullable<typeof item> => item !== undefined)
    const folderGroups = valid.reduce((groups, item) => {
      const identity = normalizeFolderIdentity(item.record.folder)
      groups.set(identity, [...(groups.get(identity) ?? []), item])
      return groups
    }, new Map<string, typeof valid>())
    const unconflicted = valid.filter((item) => {
      const group = folderGroups.get(normalizeFolderIdentity(item.record.folder)) ?? []
      if (group.length === 1) return true
      diagnostics.push({ code: "workbench_record_conflict", recordPath: item.recordPath, message: `文件夹 ${item.record.folder} 存在重复工作台记录。` })
      return false
    })
    const registered = await Promise.all(unconflicted.map(async (item) => {
      try {
        return await projectWorkbench(this.projectFiles, projectId, item.record.id, "registered", item.record.title ?? folderTitle(item.record.folder), item.record.folder, recordHome(item.record), recordVisibility(item.record))
      } catch (error) {
        diagnostics.push({ code: "workbench_record_invalid", recordPath: item.recordPath, message: errorMessage(error) })
        return undefined
      }
    }))
    return snapshot(projectId, [builtin, ...registered.filter((item): item is WorkbenchProjection => item !== undefined)
      .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))], diagnostics)
  }

  private async register(request: RegisterWorkbenchRequest) {
    const folder = normalizeFolder(request.folder)
    const title = normalizeTitle(request.title)
    const directory = await this.projectFiles.listDirectory(request.projectId, folder, "content")
    if (!directory) throw new Error("workbench_invalid: folder does not exist")

    const current = await this.snapshot(request.projectId)
    const conflict = current.diagnostics.find((diagnostic) => diagnostic.code === "workbench_record_conflict"
      && diagnostic.message.toLocaleLowerCase("en-US").includes(directory.relativePath.toLocaleLowerCase("en-US")))
    if (conflict) throw new Error(`workbench_conflict: ${conflict.message}`)
    const existing = current.workbenches.find((workbench) => workbench.source === "registered" && normalizeFolderIdentity(workbench.folder) === normalizeFolderIdentity(directory.relativePath))
    if (existing) return existing

    const id = `wb_${randomUUID()}`
    const record: WorkbenchRecord = { schemaVersion: 1, id, folder: directory.relativePath, ...(title ? { title } : {}) }
    await this.internalState.writeFile({
      projectId: request.projectId,
      namespace: recordsNamespace,
      key: `${id}.json`,
      content: `${JSON.stringify(record, undefined, 2)}\n`,
      expectedModifiedAt: null,
    })
    const created = (await this.snapshot(request.projectId)).workbenches.find((workbench) => workbench.id === id)
    if (!created) throw new Error("workbench_invalid: created record could not be reloaded")
    this.options.onChanged?.(request.projectId)
    return created
  }

  private async rename(request: RenameWorkbenchRequest) {
    const folder = normalizeFolder(request.folder)
    const title = normalizeTitle(request.title)
    if (!title) throw new Error("workbench_invalid: title is required")
    const current = await this.snapshot(request.projectId)
    const conflict = current.diagnostics.find((diagnostic) => diagnostic.code === "workbench_record_conflict"
      && diagnostic.message.toLocaleLowerCase("en-US").includes(folder.toLocaleLowerCase("en-US")))
    if (conflict) throw new Error(`workbench_conflict: ${conflict.message}`)
    const existing = current.workbenches.find((workbench) => workbench.source === "registered"
      && normalizeFolderIdentity(workbench.folder) === normalizeFolderIdentity(folder))
    if (!existing) throw new Error("workbench_invalid: registered workbench does not exist")
    if (existing.title === title) return existing

    const directory = await this.internalState.listDirectory(request.projectId, recordsNamespace, ".")
    const entry = directory?.entries.find((item) => item.kind === "file" && item.name === `${existing.id}.json`)
    if (!entry?.modifiedAt) throw new Error("workbench_invalid: registration record does not exist")
    const record = decodeRecord(new TextDecoder().decode((await this.internalState.readFile(request.projectId, recordsNamespace, entry.relativePath))!.bytes))
    if (record.id !== existing.id || normalizeFolderIdentity(record.folder) !== normalizeFolderIdentity(existing.folder)) {
      throw new Error("workbench_conflict: registration identity changed")
    }
    await this.internalState.writeFile({
      projectId: request.projectId,
      namespace: recordsNamespace,
      key: entry.relativePath,
      content: `${JSON.stringify({ ...record, title }, undefined, 2)}\n`,
      expectedModifiedAt: entry.modifiedAt,
    })
    const renamed = (await this.snapshot(request.projectId)).workbenches.find((workbench) => workbench.id === existing.id)
    if (!renamed || renamed.title !== title) throw new Error("workbench_invalid: renamed record could not be reloaded")
    this.options.onChanged?.(request.projectId)
    return renamed
  }

  private async unregister(request: UnregisterWorkbenchRequest): Promise<UnregisterWorkbenchResult> {
    const folder = normalizeFolder(request.folder)
    const current = await this.snapshot(request.projectId)
    const conflict = current.diagnostics.find((diagnostic) => diagnostic.code === "workbench_record_conflict"
      && diagnostic.message.toLocaleLowerCase("en-US").includes(folder.toLocaleLowerCase("en-US")))
    if (conflict) throw new Error(`workbench_conflict: ${conflict.message}`)
    const existing = current.workbenches.find((workbench) => workbench.source === "registered"
      && normalizeFolderIdentity(workbench.folder) === normalizeFolderIdentity(folder))
    if (!existing) throw new Error("workbench_invalid: registered workbench does not exist")

    const directory = await this.internalState.listDirectory(request.projectId, recordsNamespace, ".")
    const entry = directory?.entries.find((item) => item.kind === "file" && item.name === `${existing.id}.json`)
    if (!entry?.modifiedAt) throw new Error("workbench_invalid: registration record does not exist")
    const stored = await this.internalState.readFile(request.projectId, recordsNamespace, entry.relativePath)
    if (!stored) throw new Error("workbench_invalid: registration record does not exist")
    const record = decodeRecord(new TextDecoder().decode(stored.bytes))
    if (record.id !== existing.id || normalizeFolderIdentity(record.folder) !== normalizeFolderIdentity(existing.folder)) {
      throw new Error("workbench_conflict: registration identity changed")
    }
    await this.internalState.deleteFile({ projectId: request.projectId, namespace: recordsNamespace, key: entry.relativePath, expectedModifiedAt: entry.modifiedAt })
    if ((await this.snapshot(request.projectId)).workbenches.some((workbench) => workbench.id === existing.id)) {
      throw new Error("workbench_invalid: unregistered record could still be reloaded")
    }
    this.options.onChanged?.(request.projectId)
    return { projectId: request.projectId, workbenchId: existing.id, folder: existing.folder, title: existing.title }
  }

  private async setHome(request: SetWorkbenchHomeRequest) {
    const existing = await this.requireRegisteredWorkbench(request.projectId, request.folder)
    const entry = normalizeEntry(request.entry)
    await this.requirePresentationEntry(request.projectId, existing, entry)
    if (existing.home?.entry === entry && existing.home.state === "ready") return existing
    const stored = await this.readRecord(request.projectId, existing)
    const record: WorkbenchRecord = stored.record.schemaVersion === 3
      ? { ...stored.record, home: { entry, mode: "interactive" } }
      : { schemaVersion: 2, id: stored.record.id, folder: stored.record.folder, ...(stored.record.title ? { title: stored.record.title } : {}), home: { entry, mode: "interactive" } }
    await this.internalState.writeFile({
      projectId: request.projectId,
      namespace: recordsNamespace,
      key: stored.key,
      content: `${JSON.stringify(record, undefined, 2)}\n`,
      expectedModifiedAt: stored.modifiedAt,
    })
    const updated = (await this.snapshot(request.projectId)).workbenches.find((workbench) => workbench.id === existing.id)
    if (!updated?.home || updated.home.entry !== entry || updated.home.state !== "ready") throw new Error("workbench_invalid: home record could not be reloaded")
    this.options.onChanged?.(request.projectId)
    return updated
  }

  private async setVisibility(request: SetWorkbenchVisibilityRequest) {
    const existing = await this.requireRegisteredWorkbench(request.projectId, request.folder)
    if (existing.state !== "ready") throw new Error("workbench_invalid: registered workbench folder is missing")
    const include = normalizeVisibilityPatterns(request.include ?? [], "include")
    const exclude = normalizeVisibilityPatterns(request.exclude ?? [], "exclude")
    const autoIncludeNewFiles = request.autoIncludeNewFiles ?? true
    const liveVisibility: WorkbenchVisibility = { include, exclude, autoIncludeNewFiles: true }
    const liveProjection = await projectWorkbench(this.projectFiles, request.projectId, existing.id, "registered", existing.title, existing.folder, existing.home ? { entry: existing.home.entry, mode: existing.home.mode } : undefined, liveVisibility)
    const visibility: WorkbenchVisibility = autoIncludeNewFiles
      ? liveVisibility
      : {
          include,
          exclude,
          autoIncludeNewFiles: false,
          files: liveProjection.entries.filter((entry) => entry.kind === "file").map((entry) => workbenchRelativePath(existing.folder, entry.relativePath)),
        }
    if (!visibility.autoIncludeNewFiles && visibility.files.length > maximumFrozenFiles) throw new Error(`workbench_invalid: frozen visibility cannot contain more than ${maximumFrozenFiles} files`)
    const projected = autoIncludeNewFiles
      ? liveProjection
      : await projectWorkbench(this.projectFiles, request.projectId, existing.id, "registered", existing.title, existing.folder, existing.home ? { entry: existing.home.entry, mode: existing.home.mode } : undefined, visibility)
    if (existing.home && projected.home?.state !== "ready") throw new Error("workbench_invalid: visibility cannot hide the registered workbench home")

    const stored = await this.readRecord(request.projectId, existing)
    const home = recordHome(stored.record)
    const record: WorkbenchRecordV3 = {
      schemaVersion: 3,
      id: stored.record.id,
      folder: stored.record.folder,
      ...(stored.record.title ? { title: stored.record.title } : {}),
      ...(home ? { home } : {}),
      visibility,
    }
    if (stored.record.schemaVersion === 3 && JSON.stringify(stored.record) === JSON.stringify(record)) return projected
    await this.internalState.writeFile({
      projectId: request.projectId,
      namespace: recordsNamespace,
      key: stored.key,
      content: `${JSON.stringify(record, undefined, 2)}\n`,
      expectedModifiedAt: stored.modifiedAt,
    })
    const updated = (await this.snapshot(request.projectId)).workbenches.find((workbench) => workbench.id === existing.id)
    if (!updated) throw new Error("workbench_invalid: visibility record could not be reloaded")
    const reloaded = await this.readRecord(request.projectId, updated)
    if (reloaded.record.schemaVersion !== 3 || JSON.stringify(reloaded.record.visibility) !== JSON.stringify(visibility)) throw new Error("workbench_invalid: visibility record could not be reloaded")
    this.options.onChanged?.(request.projectId)
    return updated
  }

  private async show(request: ShowInWorkbenchRequest) {
    const existing = await this.requireRegisteredWorkbench(request.projectId, request.folder)
    const resolved = await this.resolvePresentation({ projectId: request.projectId, workbenchId: existing.id, entry: request.entry })
    this.options.onPresentationRequested?.({ ...request, workbenchId: existing.id, entry: resolved.entry })
    return resolved
  }

  private async resolvePresentation(request: ResolveWorkbenchPresentationRequest) {
    const workbench = (await this.snapshot(request.projectId)).workbenches.find((candidate) => candidate.source === "registered" && candidate.id === request.workbenchId)
    if (!workbench) throw new Error("workbench_invalid: registered workbench does not exist")
    const entry = normalizeEntry(request.entry)
    await this.requirePresentationEntry(request.projectId, workbench, entry)
    return { projectId: request.projectId, workbenchId: workbench.id, folder: workbench.folder, entry }
  }

  private async requireRegisteredWorkbench(projectId: string, folderInput: string) {
    const folder = normalizeFolder(folderInput)
    const current = await this.snapshot(projectId)
    const conflict = current.diagnostics.find((diagnostic) => diagnostic.code === "workbench_record_conflict" && diagnostic.message.toLocaleLowerCase("en-US").includes(folder.toLocaleLowerCase("en-US")))
    if (conflict) throw new Error(`workbench_conflict: ${conflict.message}`)
    const workbench = current.workbenches.find((candidate) => candidate.source === "registered" && normalizeFolderIdentity(candidate.folder) === normalizeFolderIdentity(folder))
    if (!workbench) throw new Error("workbench_invalid: registered workbench does not exist")
    return workbench
  }

  private async requirePresentationEntry(projectId: string, workbench: WorkbenchProjection, entry: string) {
    if (workbench.state !== "ready") throw new Error("workbench_invalid: registered workbench folder is missing")
    const relativePath = `${workbench.folder}/${entry}`
    const file = workbench.entries.find((candidate) => candidate.kind === "file" && normalizeFolderIdentity(candidate.relativePath) === normalizeFolderIdentity(relativePath))
    if (!file) throw new Error("workbench_invalid: presentation entry does not exist inside the registered workbench")
    await this.projectFiles.readBytes(projectId, file.relativePath)
  }

  private async readRecord(projectId: string, workbench: WorkbenchProjection) {
    const directory = await this.internalState.listDirectory(projectId, recordsNamespace, ".")
    const entry = directory?.entries.find((item) => item.kind === "file" && item.name === `${workbench.id}.json`)
    if (!entry?.modifiedAt) throw new Error("workbench_invalid: registration record does not exist")
    const stored = await this.internalState.readFile(projectId, recordsNamespace, entry.relativePath)
    if (!stored) throw new Error("workbench_invalid: registration record does not exist")
    const record = decodeRecord(new TextDecoder().decode(stored.bytes))
    if (record.id !== workbench.id || normalizeFolderIdentity(record.folder) !== normalizeFolderIdentity(workbench.folder)) throw new Error("workbench_conflict: registration identity changed")
    return { record, key: entry.relativePath, modifiedAt: entry.modifiedAt }
  }

  private async serialize<T>(projectId: string, operation: () => Promise<T>) {
    const previous = this.queues.get(projectId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    this.queues.set(projectId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(projectId) === tail) this.queues.delete(projectId)
    }
  }
}

async function projectWorkbench(projectFiles: ProjectFileQueryPort, projectId: string, id: string, source: WorkbenchProjection["source"], title: string, folder: string, home?: WorkbenchHomeRecord, visibility?: WorkbenchVisibility): Promise<WorkbenchProjection> {
  const directory = await projectFiles.listDirectory(projectId, folder, "content")
  if (!directory) return { id, source, title, folder, state: "missing", entries: [], ...(home ? { home: { ...home, state: "missing" } } : {}) }
  const entries = await collectEntries(projectFiles, projectId, directory.relativePath, source, visibility)
  const homePath = home ? `${directory.relativePath}/${home.entry}` : undefined
  return {
    id,
    source,
    title,
    folder: directory.relativePath,
    state: "ready",
    entries,
    ...(home ? { home: { ...home, state: entries.some((entry) => entry.kind === "file" && normalizeFolderIdentity(entry.relativePath) === normalizeFolderIdentity(homePath!)) ? "ready" : "missing" } } : {}),
  }
}

async function collectEntries(projectFiles: ProjectFileQueryPort, projectId: string, folder: string, source: WorkbenchProjection["source"], visibility?: WorkbenchVisibility): Promise<WorkbenchEntry[]> {
  return (await collectDirectoryEntries(projectFiles, projectId, folder, folder, source, visibility ? createVisibilityMatcher(visibility) : undefined)).entries
}

async function collectDirectoryEntries(projectFiles: ProjectFileQueryPort, projectId: string, rootFolder: string, folder: string, source: WorkbenchProjection["source"], visible?: (relativePath: string) => boolean): Promise<{ entries: WorkbenchEntry[]; sourceEntryCount: number }> {
  const directory = await projectFiles.listDirectory(projectId, folder, "content")
  if (!directory) return { entries: [], sourceEntryCount: 0 }
  const entries = [...directory.entries].sort((left, right) => left.kind === right.kind
    ? left.name.localeCompare(right.name, "zh-CN")
    : left.kind === "directory" ? -1 : 1)
  const nested = await Promise.all(entries.map(async (entry): Promise<WorkbenchEntry[]> => {
    if (source === "registered" && entry.kind === "file" && entry.name.toLocaleLowerCase("en-US").endsWith(".json")) return []
    if (entry.kind === "file" && visible && !visible(workbenchRelativePath(rootFolder, entry.relativePath))) return []
    const directoryEntries = entry.kind === "directory" ? await collectDirectoryEntries(projectFiles, projectId, rootFolder, entry.relativePath, source, visible) : undefined
    if (visible && directoryEntries && !directoryEntries.entries.length) return []
    if (source === "registered" && directoryEntries && !directoryEntries.entries.length && directoryEntries.sourceEntryCount > 0) return []
    return [
      { kind: entry.kind, name: entry.name, relativePath: entry.relativePath, ...(entry.fileId ? { fileId: entry.fileId } : {}) },
      ...(directoryEntries?.entries ?? []),
    ]
  }))
  return { entries: nested.flat(), sourceEntryCount: directory.entries.length }
}

function snapshot(projectId: string, workbenches: WorkbenchProjection[], diagnostics: WorkbenchDiagnostic[]): WorkbenchSnapshot {
  return { projectId, workbenches, diagnostics, refreshedAt: new Date().toISOString() }
}

function decodeRecord(json: string): WorkbenchRecord {
  const value: unknown = JSON.parse(json)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be an object")
  const record = value as Record<string, unknown>
  const allowedKeys = record.schemaVersion === 1 ? recordV1Keys : record.schemaVersion === 2 ? recordV2Keys : record.schemaVersion === 3 ? recordV3Keys : undefined
  if (!allowedKeys) throw new Error("unsupported schemaVersion")
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) throw new Error("record contains unknown fields")
  if (typeof record.id !== "string" || !workbenchIdPattern.test(record.id)) throw new Error("invalid workbench id")
  const folder = normalizeFolder(record.folder)
  const title = normalizeTitle(record.title)
  if (record.schemaVersion === 1) return { schemaVersion: 1, id: record.id, folder, ...(title ? { title } : {}) }
  const home = record.home === undefined ? undefined : decodeHome(record.home)
  if (record.schemaVersion === 2) {
    if (!home) throw new Error("invalid workbench home")
    return { schemaVersion: 2, id: record.id, folder, ...(title ? { title } : {}), home }
  }
  return { schemaVersion: 3, id: record.id, folder, ...(title ? { title } : {}), ...(home ? { home } : {}), visibility: decodeVisibility(record.visibility) }
}

function decodePortableWorkbench(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("portable workbench must be an object")
  const portable = value as Record<string, unknown>
  if (Object.keys(portable).some((key) => key !== "exchangeVersion" && key !== "record") || portable.exchangeVersion !== 1 || !("record" in portable)) throw new Error("unsupported portable workbench exchange record")
  return decodeRecord(JSON.stringify(portable.record))
}

function portablePathSet(values: readonly string[]) {
  return new Set(values.map((value) => {
    const path = requireString(value, "exported path")
    if (path.includes("\\") || path !== path.normalize("NFC") || path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("workbench_invalid: exported path must be a canonical project-relative path")
    }
    return normalizeFolderIdentity(path)
  }))
}

function requirePortableRecordReferences(record: WorkbenchRecord, paths: ReadonlySet<string>) {
  if (!paths.has(normalizeFolderIdentity(record.folder))) throw new Error("workbench_invalid: registered folder is not exported")
  const home = recordHome(record)
  if (home && !paths.has(normalizeFolderIdentity(`${record.folder}/${home.entry}`))) throw new Error("workbench_invalid: workbench home is not exported")
  const visibility = recordVisibility(record)
  if (visibility && !visibility.autoIncludeNewFiles && visibility.files.some((file) => !paths.has(normalizeFolderIdentity(`${record.folder}/${file}`)))) {
    throw new Error("workbench_invalid: frozen visibility references a file that is not exported")
  }
}

function decodeHome(value: unknown): WorkbenchHomeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid workbench home")
  const home = value as Record<string, unknown>
  if (Object.keys(home).some((key) => !homeKeys.has(key)) || home.mode !== "interactive") throw new Error("invalid workbench home")
  return { entry: normalizeEntry(home.entry), mode: "interactive" }
}

function decodeVisibility(value: unknown): WorkbenchVisibility {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid workbench visibility")
  const visibility = value as Record<string, unknown>
  if (typeof visibility.autoIncludeNewFiles !== "boolean") throw new Error("invalid workbench visibility")
  const allowedKeys = visibility.autoIncludeNewFiles ? automaticVisibilityKeys : frozenVisibilityKeys
  if (Object.keys(visibility).some((key) => !allowedKeys.has(key))) throw new Error("invalid workbench visibility")
  const include = normalizeVisibilityPatterns(visibility.include, "include")
  const exclude = normalizeVisibilityPatterns(visibility.exclude, "exclude")
  if (visibility.autoIncludeNewFiles) return { include, exclude, autoIncludeNewFiles: true }
  return { include, exclude, autoIncludeNewFiles: false, files: normalizeFrozenFiles(visibility.files) }
}

function workbenchPresentationInputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["folder", "entry"],
    properties: {
      folder: { type: "string", minLength: 1, description: "Registered project-relative workbench folder using forward slashes." },
      entry: { type: "string", minLength: 1, description: "HTML file relative to that workbench folder." },
    },
  }
}

function visibilityPatternsSchema(description: string) {
  return {
    type: "array",
    maxItems: maximumVisibilityPatterns,
    uniqueItems: true,
    description,
    items: { type: "string", minLength: 1, maxLength: 240 },
  }
}

function requirePresentationToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workbench_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "folder" && key !== "entry")) throw new Error("workbench_invalid: tool input contains unknown fields")
  return { folder: requireString(value.folder, "folder"), entry: requireString(value.entry, "entry") }
}

function requireToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workbench_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "folder" && key !== "title")) throw new Error("workbench_invalid: tool input contains unknown fields")
  return { folder: requireString(value.folder, "folder"), ...(value.title === undefined ? {} : { title: requireString(value.title, "title") }) }
}

function requireFolderToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workbench_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "folder")) throw new Error("workbench_invalid: tool input contains unknown fields")
  return requireString(value.folder, "folder")
}

function requireRenameToolInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workbench_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "folder" && key !== "title")) throw new Error("workbench_invalid: tool input contains unknown fields")
  return { folder: requireString(value.folder, "folder"), title: requireString(value.title, "title") }
}

function requireVisibilityToolInput(input: unknown): Omit<SetWorkbenchVisibilityRequest, "projectId"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workbench_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "folder" && key !== "include" && key !== "exclude" && key !== "autoIncludeNewFiles")) throw new Error("workbench_invalid: tool input contains unknown fields")
  if (value.autoIncludeNewFiles !== undefined && typeof value.autoIncludeNewFiles !== "boolean") throw new Error("workbench_invalid: autoIncludeNewFiles must be a boolean")
  return {
    folder: requireString(value.folder, "folder"),
    ...(value.include === undefined ? {} : { include: normalizeVisibilityPatterns(value.include, "include") }),
    ...(value.exclude === undefined ? {} : { exclude: normalizeVisibilityPatterns(value.exclude, "exclude") }),
    ...(value.autoIncludeNewFiles === undefined ? {} : { autoIncludeNewFiles: value.autoIncludeNewFiles }),
  }
}

function normalizeFolder(value: unknown) {
  const folder = requireString(value, "folder").replaceAll("\\", "/")
  if (folder.startsWith("/") || /^[A-Za-z]:\//.test(folder)) throw new Error("workbench_invalid: folder must be project-relative")
  const segments = folder.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("workbench_invalid: folder contains an invalid segment")
  return segments.join("/")
}

function normalizeEntry(value: unknown) {
  const entry = requireString(value, "entry").replaceAll("\\", "/")
  if (entry.startsWith("/") || /^[A-Za-z]:\//.test(entry)) throw new Error("workbench_invalid: entry must be workbench-relative")
  const segments = entry.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("workbench_invalid: entry contains an invalid segment")
  if (!entry.toLocaleLowerCase("en-US").endsWith(".html")) throw new Error("workbench_invalid: entry must be an HTML file")
  return segments.join("/")
}

function normalizeVisibilityPatterns(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`workbench_invalid: ${name} must be an array`)
  if (value.length > maximumVisibilityPatterns) throw new Error(`workbench_invalid: ${name} cannot contain more than ${maximumVisibilityPatterns} patterns`)
  const patterns = value.map((pattern) => normalizeVisibilityPattern(pattern, name))
  if (new Set(patterns.map(normalizePatternIdentity)).size !== patterns.length) throw new Error(`workbench_invalid: ${name} contains duplicate patterns`)
  return patterns
}

function normalizeVisibilityPattern(value: unknown, name: string) {
  const pattern = requireString(value, name).replaceAll("\\", "/")
  if (pattern.length > 240) throw new Error(`workbench_invalid: ${name} pattern is too long`)
  if (pattern.startsWith("/") || /^[A-Za-z]:\//.test(pattern)) throw new Error(`workbench_invalid: ${name} patterns must be workbench-relative`)
  const segments = pattern.split("/")
  if (segments.length > 32 || segments.some((segment) => !segment || segment === "." || segment === ".." || (segment.includes("**") && segment !== "**"))) {
    throw new Error(`workbench_invalid: ${name} contains an invalid pattern`)
  }
  return segments.join("/")
}

function normalizeFrozenFiles(value: unknown) {
  if (!Array.isArray(value)) throw new Error("workbench_invalid: frozen visibility files must be an array")
  if (value.length > maximumFrozenFiles) throw new Error(`workbench_invalid: frozen visibility cannot contain more than ${maximumFrozenFiles} files`)
  const files = value.map((file) => normalizeFrozenFile(file))
  if (new Set(files.map(normalizePatternIdentity)).size !== files.length) throw new Error("workbench_invalid: frozen visibility contains duplicate files")
  return files
}

function normalizeFrozenFile(value: unknown) {
  const file = requireString(value, "file").replaceAll("\\", "/")
  if (file.length > 1024 || file.includes("*") || file.includes("?")) throw new Error("workbench_invalid: frozen visibility contains an invalid file")
  if (file.startsWith("/") || /^[A-Za-z]:\//.test(file)) throw new Error("workbench_invalid: frozen visibility files must be workbench-relative")
  const segments = file.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("workbench_invalid: frozen visibility contains an invalid file")
  return segments.join("/")
}

function normalizeTitle(value: unknown) {
  if (value === undefined) return undefined
  const title = requireString(value, "title").trim()
  if (!title || title.length > 120) throw new Error("workbench_invalid: title must contain 1 to 120 characters")
  return title
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`workbench_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function folderTitle(folder: string) {
  return basename(folder.replaceAll("/", "\\"))
}

function recordHome(record: WorkbenchRecord) {
  return record.schemaVersion === 1 ? undefined : record.home
}

function recordVisibility(record: WorkbenchRecord) {
  return record.schemaVersion === 3 ? record.visibility : undefined
}

function workbenchRelativePath(folder: string, relativePath: string) {
  const prefix = `${folder}/`
  if (!normalizePatternIdentity(relativePath).startsWith(normalizePatternIdentity(prefix))) throw new Error("workbench_invalid: projected file is outside the registered workbench")
  return relativePath.slice(prefix.length)
}

function createVisibilityMatcher(visibility: WorkbenchVisibility) {
  if (!visibility.autoIncludeNewFiles) {
    const files = new Set(visibility.files.map(normalizePatternIdentity))
    return (relativePath: string) => files.has(normalizePatternIdentity(relativePath))
  }
  const include = visibility.include.map(compileVisibilityPattern)
  const exclude = visibility.exclude.map(compileVisibilityPattern)
  return (relativePath: string) => {
    const path = normalizePatternIdentity(relativePath).split("/")
    const included = !include.length || include.some((pattern) => matchesVisibilityPattern(pattern, path))
    return included && !exclude.some((pattern) => matchesVisibilityPattern(pattern, path))
  }
}

function compileVisibilityPattern(pattern: string) {
  return normalizePatternIdentity(pattern).split("/")
}

function matchesVisibilityPattern(pattern: string[], path: string[]) {
  const results = new Map<string, boolean>()
  const match = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`
    const cached = results.get(key)
    if (cached !== undefined) return cached
    const result = patternIndex === pattern.length
      ? pathIndex === path.length
      : pattern[patternIndex] === "**"
        ? match(patternIndex + 1, pathIndex) || pathIndex < path.length && match(patternIndex, pathIndex + 1)
        : pathIndex < path.length && matchesVisibilitySegment(pattern[patternIndex]!, path[pathIndex]!) && match(patternIndex + 1, pathIndex + 1)
    results.set(key, result)
    return result
  }
  return match(0, 0)
}

function matchesVisibilitySegment(pattern: string, value: string) {
  const patterns = [...pattern]
  const values = [...value]
  const results = new Map<string, boolean>()
  const match = (patternIndex: number, valueIndex: number): boolean => {
    const key = `${patternIndex}:${valueIndex}`
    const cached = results.get(key)
    if (cached !== undefined) return cached
    const result = patternIndex === patterns.length
      ? valueIndex === values.length
      : patterns[patternIndex] === "*"
        ? match(patternIndex + 1, valueIndex) || valueIndex < values.length && match(patternIndex, valueIndex + 1)
        : valueIndex < values.length && (patterns[patternIndex] === "?" || patterns[patternIndex] === values[valueIndex]) && match(patternIndex + 1, valueIndex + 1)
    results.set(key, result)
    return result
  }
  return match(0, 0)
}

function normalizePatternIdentity(value: string) {
  return value.replaceAll("\\", "/").toLocaleLowerCase("en-US")
}

function normalizeFolderIdentity(folder: string) {
  return folder.replaceAll("/", "\\").toLocaleLowerCase("en-US")
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function workbenchError(error: unknown): CreatXError {
  const detail = errorMessage(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前工具没有有效项目。", detail }
  if (detail.startsWith("workbench_conflict") || detail.startsWith("file_conflict")) return { code: "workbench_conflict", message: "工作台记录与现有状态冲突。", detail }
  return { code: "workbench_invalid", message: "工作台信息无效。", detail }
}
