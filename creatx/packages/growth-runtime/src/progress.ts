import { createHash } from "node:crypto"
import type {
  CreatXError,
  CreatXToolContribution,
  GrowthProgressOutcome,
  GrowthProgressReport,
  GrowthProgressResult,
} from "@creatx/contracts"
import { GrowthGoalStore } from "./store.ts"
import type { GrowthStageArtifactEvidence, GrowthStagePolicyPort } from "./scheduler.ts"

export type GrowthImageTaskStatus = "queued" | "generating" | "succeeded" | "failed" | "interrupted" | "cancelled"

export interface GrowthImageTaskEvidence {
  status: GrowthImageTaskStatus
  relativePath: string
}

export interface GrowthEvidenceQueryPort {
  artifactExists(projectId: string, relativePath: string): Promise<boolean>
  artifactText?(projectId: string, relativePath: string): Promise<string | undefined>
  registeredWorkbenchFolders?(projectId: string): Promise<readonly string[]>
  trustedStageArtifacts?(projectId: string, goalId: string, source: "world-blueprint", workRootPath: string): Promise<readonly GrowthStageArtifactEvidence[]>
  imageTaskEvidence(projectId: string, imageTaskId: string): Promise<GrowthImageTaskEvidence | undefined>
}

export class GrowthProgressService {
  private readonly store: GrowthGoalStore
  private readonly evidence: GrowthEvidenceQueryPort
  private readonly policy: GrowthStagePolicyPort | undefined

  constructor(store: GrowthGoalStore, evidence: GrowthEvidenceQueryPort, policy?: GrowthStagePolicyPort) {
    this.store = store
    this.evidence = evidence
    this.policy = policy
  }

  hasReport(goalId: string, reportId: string) {
    return this.store.hasProgressReport(goalId, reportId)
  }

  tool(): CreatXToolContribution {
    return {
      name: "report_growth_progress",
      audiences: ["growth-stage", "growth-recovery", "world-blueprint"],
      description: "Report the result of the current bounded Growth stage. CreatX injects the trusted project, session, Goal, and optimistic version; never include or guess those identities. Reference only real project artifacts and image tasks. This tool records progress but never starts the next Cline Run.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["reportId", "outcome", "summary", "artifactPaths", "imageTaskIds", "requiredImageTaskIds"],
        properties: {
          reportId: { type: "string", minLength: 1, maxLength: 200, description: "Stable idempotency ID for this exact stage report." },
          outcome: { type: "string", enum: ["continue", "waiting", "completed", "failed"] },
          summary: { type: "string", minLength: 1, maxLength: 4000 },
          nextStep: { type: "string", minLength: 1, maxLength: 2000 },
          artifactPaths: { type: "array", maxItems: 200, uniqueItems: true, description: "Project-relative paths of real files created or materially used by this stage. Never provide absolute paths or internal file IDs.", items: { type: "string", minLength: 1 } },
          imageTaskIds: { type: "array", maxItems: 200, uniqueItems: true, items: { type: "string", minLength: 1 } },
          requiredImageTaskIds: { type: "array", maxItems: 200, uniqueItems: true, items: { type: "string", minLength: 1 } },
        },
      },
      scope: "project",
      approval: "automatic",
      execute: async (input, context) => {
        try {
          if (!context.projectId) throw new Error("project_invalid: Growth progress requires a project")
          if (!context.growthGoalId || context.growthGoalVersion === undefined) {
            throw new Error("growth_invalid: trusted Growth stage identity is missing")
          }
          return { ok: true, value: await this.commit(parseReport(input), { projectId: context.projectId, goalId: context.growthGoalId, version: context.growthGoalVersion }) }
        } catch (error) {
          return { ok: false, error: growthError(error) }
        }
      },
    }
  }

  async commit(
    report: GrowthProgressReport,
    context: { projectId: string; goalId: string; version: number },
    options: { completionAuthority?: "world-materialization-final" } = {},
  ): Promise<GrowthProgressResult> {
    const goal = this.store.get(context.goalId)
    if (!goal) throw new Error("growth_invalid: Goal does not exist")
    if (goal.projectId !== context.projectId) throw new Error("growth_invalid: Growth stage identity does not match the current project")
    const policy = this.policy?.beforeStage(goal, this.store.countProgressReceipts(goal.goalId))
    const effectiveOutcome = policy?.successfulReportOutcome === "continue" && report.outcome !== "failed"
      ? "continue"
      : report.outcome
    const completionPrevented = effectiveOutcome === "completed"
      && policy?.preventCompletion === true
      && options.completionAuthority !== "world-materialization-final"
    const completionRequested = effectiveOutcome === "completed" && !completionPrevented
    const persistedOutcome = effectiveOutcome === "completed" ? "continue" : effectiveOutcome
    const reportedOutcome = completionRequested ? "completed" : persistedOutcome
    const payloadHash = reportHash(goal.goalId, context.version, report)
    const replayed = this.store.replayProgress(goal.goalId, report.reportId, payloadHash)
    if (replayed) return { goal: replayed.goal, outcome: report.outcome, duplicate: true }
    const artifacts = await Promise.all(report.artifactPaths.map(async (relativePath) => ({
      relativePath,
      exists: await this.evidence.artifactExists(goal.projectId, relativePath),
    })))
    const missingArtifact = artifacts.find((artifact) => !artifact.exists)
    if (missingArtifact) throw new Error(`growth_invalid: artifact ${missingArtifact.relativePath} is unknown or belongs to another project`)
    const workRootPath = policy?.workRootArtifactName
      ? resolveWorkRoot(report.artifactPaths, policy.workRootArtifactName, goal.workRootPath)
      : goal.workRootPath
    if (policy?.validateArtifacts) {
      const artifactEvidence = policy.trustedArtifactSource
        ? await trustedStageArtifacts(this.evidence, goal.projectId, goal.goalId, policy.trustedArtifactSource, workRootPath)
        : await publicArtifactEvidence(this.evidence, goal.projectId, report.artifactPaths)
      const validationError = policy.validateArtifacts(artifactEvidence)
      if (validationError) throw new Error(`growth_invalid: ${validationError}`)
    }
    if (policy?.requiredWorkbenchRoot) {
      if (!workRootPath) throw new Error("growth_invalid: workbench validation requires a verified work root")
      if (!this.evidence.registeredWorkbenchFolders) throw new Error("growth_invalid: workbench validation is unavailable")
      const registered = new Set((await this.evidence.registeredWorkbenchFolders(goal.projectId)).map((folder) => folder.replaceAll("\\", "/")))
      if (!registered.has(workRootPath)) throw new Error(`growth_invalid: required world workbench ${workRootPath} is not registered`)
    }
    const backgroundImageTaskIds = report.backgroundImageTaskIds ?? []
    const overlap = backgroundImageTaskIds.find((imageTaskId) => report.requiredImageTaskIds.includes(imageTaskId))
    if (overlap) throw new Error(`growth_invalid: image task ${overlap} cannot be both required and background`)
    const unreferencedBackground = backgroundImageTaskIds.find((imageTaskId) => !report.imageTaskIds.includes(imageTaskId))
    if (unreferencedBackground) throw new Error(`growth_invalid: background image task ${unreferencedBackground} is not referenced by this report`)
    const background = new Set(backgroundImageTaskIds)
    const requiredImageTaskIds = unique([...goal.requiredImageTaskIds.filter((imageTaskId) => !background.has(imageTaskId)), ...report.requiredImageTaskIds])
    const referencedImageTaskIds = unique([...report.imageTaskIds.filter((imageTaskId) => !background.has(imageTaskId)), ...requiredImageTaskIds])
    const images = await Promise.all(referencedImageTaskIds.map(async (imageTaskId) => ({ imageTaskId, evidence: await this.evidence.imageTaskEvidence(goal.projectId, imageTaskId) })))
    const missingImage = images.find((image) => !image.evidence)
    if (missingImage) throw new Error(`growth_invalid: image task ${missingImage.imageTaskId} is unknown or belongs to another project`)
    if (completionRequested) {
      const incomplete = images.find((image) => requiredImageTaskIds.includes(image.imageTaskId)
        && image.evidence?.status !== "succeeded"
        && !images.some((candidate) => candidate.evidence?.relativePath === image.evidence?.relativePath && candidate.evidence?.status === "succeeded"))
      if (incomplete) throw new Error(`growth_invalid: required image task ${incomplete.imageTaskId} is ${incomplete.evidence?.status}`)
    }
    const committed = this.store.commitProgress({
      goalId: goal.goalId,
      expectedVersion: context.version,
      reportId: report.reportId,
      payloadHash,
      outcome: persistedOutcome,
      reason: report.summary,
      ...(workRootPath ? { workRootPath } : {}),
      requiredImageTaskIds,
      ownerReplyPending: completionRequested,
    })
    return { goal: committed.goal, outcome: reportedOutcome, duplicate: committed.duplicate }
  }
}

async function trustedStageArtifacts(
  evidence: GrowthEvidenceQueryPort,
  projectId: string,
  goalId: string,
  source: "world-blueprint",
  workRootPath: string | undefined,
) {
  if (!workRootPath) throw new Error("growth_invalid: trusted stage evidence requires a verified work root")
  if (!evidence.trustedStageArtifacts) throw new Error("growth_invalid: trusted stage evidence validation is unavailable")
  return evidence.trustedStageArtifacts(projectId, goalId, source, workRootPath)
}

async function publicArtifactEvidence(evidence: GrowthEvidenceQueryPort, projectId: string, artifactPaths: string[]) {
  if (!evidence.artifactText) throw new Error("growth_invalid: stage artifact validation is unavailable")
  const artifacts = await Promise.all(artifactPaths.map(async (relativePath) => {
    if (!/\.(?:md|json)$/iu.test(relativePath)) return { relativePath }
    const text = await evidence.artifactText!(projectId, relativePath)
    return text === undefined ? { relativePath } : { relativePath, text }
  }))
  const unreadable = artifacts.find((artifact) => /\.(?:md|json)$/iu.test(artifact.relativePath) && artifact.text === undefined)
  if (unreadable) throw new Error(`growth_invalid: artifact ${unreadable.relativePath} cannot be read as text`)
  return artifacts
}

function parseReport(input: unknown): GrowthProgressReport {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: progress report must be an object")
  const value = input as Record<string, unknown>
  const allowed = new Set(["reportId", "outcome", "summary", "nextStep", "artifactPaths", "imageTaskIds", "requiredImageTaskIds"])
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("growth_invalid: progress report contains an unknown field")
  return {
    reportId: requireText(value.reportId, "reportId", 200),
    outcome: requireOutcome(value.outcome),
    summary: requireText(value.summary, "summary", 4000),
    ...(value.nextStep === undefined ? {} : { nextStep: requireText(value.nextStep, "nextStep", 2000) }),
    artifactPaths: requireIds(value.artifactPaths, "artifactPaths"),
    imageTaskIds: requireIds(value.imageTaskIds, "imageTaskIds"),
    requiredImageTaskIds: requireIds(value.requiredImageTaskIds, "requiredImageTaskIds"),
  }
}

function requireOutcome(value: unknown): GrowthProgressOutcome {
  if (value === "continue" || value === "waiting" || value === "completed" || value === "failed") return value
  throw new Error("growth_invalid: progress outcome is invalid")
}

function requireText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`growth_invalid: ${name} must contain 1 to ${maxLength} characters`)
  }
  return value.trim()
}

function requireIds(value: unknown, name: string) {
  if (!Array.isArray(value) || value.length > 200 || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error(`growth_invalid: ${name} must be a list of at most 200 non-empty IDs`)
  }
  const ids = value.map((id) => (id as string).trim())
  if (new Set(ids).size !== ids.length) throw new Error(`growth_invalid: ${name} must not contain duplicates`)
  return ids
}

function unique(ids: string[]) {
  return [...new Set(ids)]
}

function resolveWorkRoot(artifactPaths: string[], artifactName: string, existing: string | undefined) {
  const normalizedName = artifactName.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")
  if (!normalizedName || normalizedName.includes("/")) throw new Error("growth_invalid: work root artifact name must be a file name")
  const matches = artifactPaths
    .map((path) => path.replaceAll("\\", "/").replace(/^\.\//u, ""))
    .filter((path) => path.endsWith(`/${normalizedName}`))
  if (matches.length !== 1) throw new Error(`growth_invalid: stage must report exactly one nested ${normalizedName} artifact to establish the work root`)
  const root = matches[0]!.slice(0, -(normalizedName.length + 1))
  if (!root || root.startsWith("/") || /^[A-Za-z]:\//u.test(root) || root.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("growth_invalid: resolved work root must be a project-relative directory")
  }
  if (existing && existing !== root) throw new Error(`growth_invalid: reported work root ${root} conflicts with persisted work root ${existing}`)
  return root
}

function reportHash(goalId: string, expectedVersion: number, report: GrowthProgressReport) {
  return createHash("sha256").update(JSON.stringify({ goalId, expectedVersion, report })).digest("hex")
}

function growthError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前阶段没有有效项目。", detail }
  if (detail.startsWith("growth_conflict")) return { code: "growth_conflict", message: "Growth 目标已发生变化，本阶段汇报未写入。", detail }
  if (detail.startsWith("growth_persistence")) return { code: "growth_persistence", message: "Growth 阶段汇报无法安全保存。", detail }
  return { code: "growth_invalid", message: "Growth 阶段汇报无效。", detail }
}
