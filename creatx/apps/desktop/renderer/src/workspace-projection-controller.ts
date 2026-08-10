import type {
  FilePreview,
  ProjectFile,
  ProjectProjectionInvalidatedEvent,
  ProjectSnapshot,
  WorkbenchSnapshot,
} from "@creatx/contracts"

export interface WorkspaceProjectionState {
  project?: ProjectSnapshot
  workbenches?: WorkbenchSnapshot
  selectedFileId?: string
  preview?: FilePreview
}

export interface WorkspaceProjectionPort {
  refreshFiles(projectId: string): Promise<ProjectSnapshot>
  readWorkbenches(projectId: string): Promise<WorkbenchSnapshot>
  readFile(projectId: string, fileId: string): Promise<FilePreview>
}

export class WorkspaceProjectionController {
  private state: WorkspaceProjectionState = {}
  private generation = 0
  private selectionGeneration = 0
  private refresh: Promise<void> | undefined
  private readonly pendingAreas = new Set<ProjectProjectionInvalidatedEvent["areas"][number]>()

  constructor(
    private readonly port: WorkspaceProjectionPort,
    private readonly onChange: (state: WorkspaceProjectionState) => void = () => undefined,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  snapshot() {
    return this.state
  }

  open(project: ProjectSnapshot, workbenches?: WorkbenchSnapshot) {
    this.generation += 1
    this.selectionGeneration += 1
    this.pendingAreas.clear()
    this.state = { project, ...(workbenches ? { workbenches } : {}) }
    this.publish()
  }

  close() {
    this.generation += 1
    this.selectionGeneration += 1
    this.pendingAreas.clear()
    this.state = {}
    this.publish()
  }

  setWorkbenches(workbenches: WorkbenchSnapshot) {
    if (workbenches.projectId !== this.state.project?.id) return
    this.state = { ...this.state, workbenches }
    this.publish()
  }

  async select(file: ProjectFile | string) {
    const project = this.state.project
    if (!project) return
    const fileId = typeof file === "string" ? file : file.id
    if (!project.files.some((candidate) => candidate.id === fileId)) {
      this.clearSelection()
      return
    }
    const generation = this.generation
    const selectionGeneration = ++this.selectionGeneration
    const { preview: _preview, ...state } = this.state
    this.state = { ...state, selectedFileId: fileId }
    this.publish()
    try {
      const preview = await this.port.readFile(project.id, fileId)
      if (generation !== this.generation || selectionGeneration !== this.selectionGeneration) return
      if (this.state.project?.id !== project.id || this.state.selectedFileId !== fileId) return
      this.state = { ...this.state, preview }
      this.publish()
    } catch (error) {
      if (generation === this.generation && selectionGeneration === this.selectionGeneration) this.onError(error)
    }
  }

  invalidate(event: ProjectProjectionInvalidatedEvent) {
    if (event.projectId !== this.state.project?.id) return Promise.resolve()
    for (const area of event.areas) this.pendingAreas.add(area)
    if (!this.refresh) this.refresh = Promise.resolve().then(() => this.drain()).finally(() => { this.refresh = undefined })
    return this.refresh
  }

  private async drain() {
    while (this.pendingAreas.size) {
      const areas = new Set(this.pendingAreas)
      this.pendingAreas.clear()
      const project = this.state.project
      const generation = this.generation
      if (!project) break
      try {
        const [nextProject, nextWorkbenches] = await Promise.all([
          areas.has("files") ? this.port.refreshFiles(project.id) : Promise.resolve(this.state.project),
          areas.has("workbenches") ? this.port.readWorkbenches(project.id) : Promise.resolve(this.state.workbenches),
        ])
        if (generation !== this.generation || project.id !== this.state.project?.id) continue
        const selectedFileId = this.state.selectedFileId
        const selectionGeneration = this.selectionGeneration
        const selectedFile = selectedFileId ? nextProject?.files.find((file) => file.id === selectedFileId) : undefined
        const selectedExists = Boolean(selectedFileId && selectedFile)
        if (selectedFileId && !selectedExists) {
          if (generation !== this.generation || selectionGeneration !== this.selectionGeneration || project.id !== this.state.project?.id) continue
          this.selectionGeneration += 1
          this.state = {
            ...(nextProject ? { project: nextProject } : {}),
            ...(nextWorkbenches ? { workbenches: nextWorkbenches } : {}),
          }
          this.publish()
          continue
        }
        const preview = selectedExists && selectedFile?.modifiedAt !== this.state.preview?.file.modifiedAt
          ? await this.port.readFile(project.id, selectedFileId!).catch((error) => {
              this.onError(error)
              return this.state.preview
            })
          : this.state.preview
        if (generation !== this.generation || selectionGeneration !== this.selectionGeneration || project.id !== this.state.project?.id || selectedFileId !== this.state.selectedFileId) continue
        this.state = {
          ...(nextProject ? { project: nextProject } : {}),
          ...(nextWorkbenches ? { workbenches: nextWorkbenches } : {}),
          ...(selectedExists ? { selectedFileId, ...(preview ? { preview } : {}) } : {}),
        }
        this.publish()
      } catch (error) {
        if (generation === this.generation) this.onError(error)
      }
    }
  }

  private clearSelection() {
    this.selectionGeneration += 1
    const { selectedFileId: _selectedFileId, preview: _preview, ...state } = this.state
    this.state = state
    this.publish()
  }

  private publish() {
    this.onChange(this.state)
  }
}
