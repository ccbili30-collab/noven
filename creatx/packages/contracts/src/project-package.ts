export interface ProjectPackageOverview {
  purpose: string
  currentResults: string
  usageGuide: string
}

export interface ProjectPackageExclusionProjection {
  relativePath: string
  reason: "version-control" | "internal-state" | "dependencies" | "noven-temporary" | "system-cache" | "symbolic-link"
  bytes?: number
}

export interface ProjectPackageCaseProjection {
  sessionId: string
  title: string
  updatedAt: string
}

export interface ProjectPackageExchangeProjection {
  projectId: string
  overview?: ProjectPackageOverview
  files: number
  directories: number
  bytes: number
  exclusions: {
    entries: ProjectPackageExclusionProjection[]
    knownBytes: number
    unscannedItems: number
  }
  cases: ProjectPackageCaseProjection[]
  workbenches: number
  workbenchDiagnostics: number
  publisherVerified: false
}

export interface SaveProjectPackageOverviewCommand {
  projectId: string
  overview: ProjectPackageOverview
}

export interface SetProjectPackageCaseCommand {
  projectId: string
  sessionId: string
  included: boolean
}

export interface ProjectPackageCaseExportCommand {
  sessionId: string
  title: string
  purpose: string
  conclusion: string
  continuationBrief: string
}

export interface StartProjectPackageExportCommand {
  projectId: string
  destinationPath: string
  cases: ProjectPackageCaseExportCommand[]
}

export interface StartProjectPackageImportCommand {
  packagePath: string
  destinationPath: string
  displayName: string
  conflictResolution?: "independent-copy"
}

export type ProjectPackageOperation = "export" | "import"
export type ProjectPackageJobState = "running" | "succeeded" | "failed" | "cancelled"
export type ProjectPackageJobPhase = "preparing" | "transferring" | "finalizing" | "complete"

export interface ProjectPackageExportResultProjection {
  kind: "export"
  status: "created" | "existing"
  destinationPath: string
  packageId: string
  bytes: number
}

export type ProjectPackageImportResultProjection =
  | {
      kind: "import"
      status: "imported" | "existing"
      destinationPath: string
      projectId: string
      workbenchDiagnostics: number
    }
  | {
      kind: "import"
      status: "committed-unregistered"
      destinationPath: string
      failure: string
    }

export interface ProjectPackageJobProjection {
  jobId: string
  operation: ProjectPackageOperation
  state: ProjectPackageJobState
  phase: ProjectPackageJobPhase
  progress: number
  result?: ProjectPackageExportResultProjection | ProjectPackageImportResultProjection
  error?: {
    code: string
    message: string
    detail?: string
  }
}

export type ProjectPackageJobEvent = {
  type: "project-package.job"
  sessionId?: undefined
  job: ProjectPackageJobProjection
}
