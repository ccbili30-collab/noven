import type { CreatXError, CreatXToolContribution, CreatXToolExecutionContext, ImageAttachmentIntent, ImageGenerationModel, ImageTaskEvent, ImageTaskProjection, SubmitImageTaskCommand } from "@creatx/contracts"
import type { ProjectFileQueryPort } from "@creatx/project-files"
import type { GenerateProjectImageRequest, GeneratedProjectImage } from "./index.ts"
import { ImageRuntimeError } from "./index.ts"
import { imageContentPrompt, promptUsesProjectVisualStyle, resolveProjectVisualPrompt } from "./visual-prompt.ts"
import { ImageTaskStore, type ImageTaskGrowthSource } from "./queue-store.ts"
import type { ImageAttachmentService } from "./document-attachment.ts"

export { ImageTaskStore } from "./queue-store.ts"
export { imageQueueSchemaV1, imageQueueSchemaV2, imageQueueSchemaV3, imageQueueSchemaV4, imageQueueSchemaVersion } from "./queue-schema.ts"

export interface ImageGenerationPort {
  generateToProject(request: GenerateProjectImageRequest): Promise<GeneratedProjectImage>
}

export interface ImageTaskQueueOptions {
  onEvent?: (event: ImageTaskEvent) => void
  defaultModel?: () => ImageGenerationModel
  visualStyleSource?: ProjectFileQueryPort
  onWarning?: (warning: ImageTaskQueueWarning) => void
  attachments?: Pick<ImageAttachmentService, "attach">
}

export interface ImageTaskQueueWarning {
  code: "project_visual_style_missing"
  projectId: string
  relativePath: string
}

export type ImageTaskAction = "retry" | "skip" | "cancel"

interface ActiveImageRequest {
  imageTaskId: string
  controller: AbortController
  execution: Promise<void>
}

const globalImageConcurrency = 2

export { PROJECT_VISUAL_STYLE_HEADER } from "./visual-prompt.ts"
export { promptUsesProjectVisualStyle } from "./visual-prompt.ts"

export class ImageTaskQueue {
  private accepting = true
  private running = false
  private wakeScheduled = false
  private readonly activeRequests = new Map<string, ActiveImageRequest>()
  private readonly attachmentExecutions = new Map<string, Promise<ImageTaskProjection>>()
  private readonly store: ImageTaskStore
  private readonly images: ImageGenerationPort
  private readonly options: ImageTaskQueueOptions

  constructor(
    store: ImageTaskStore,
    images: ImageGenerationPort,
    options: ImageTaskQueueOptions = {},
  ) {
    this.store = store
    this.images = images
    this.options = options
  }

  tool(): CreatXToolContribution {
    return {
      name: "submit_image_generation",
      audiences: ["ordinary", "growth-stage", "world-writer", "world-recovery"],
      description: "Submit one persistent background image-generation task for the current CreatX project and return its imageTaskId immediately. Provide a stable idempotencyKey only for an exact submission retry. The task creates a new project-relative image file and never overwrites an existing file. Ordinary image requests may include an optional exact Markdown attachment; Growth World Pro derives its attachment from the trusted materialization receipt instead. The queue runs one image at a time per project while other projects may run in parallel. Use manage_image_generation to inspect, retry at the project tail, move queued work to the project tail, or cancel an existing task.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "prompt", "relativePath"],
        properties: {
          idempotencyKey: { type: "string", minLength: 1, description: "Stable key reused only when retrying this exact submission." },
          prompt: { type: "string", minLength: 1, description: "Complete image-generation prompt." },
          relativePath: { type: "string", minLength: 1, description: "New project-relative image path." },
          model: { type: "string", enum: ["gpt-image-2-cheap", "gpt-image-2"], description: "Optional image model." },
          attachment: {
            type: "object",
            additionalProperties: false,
            required: ["documentPath", "alt", "placement"],
            properties: {
              documentPath: { type: "string", minLength: 1, description: "Exact Markdown or MDX path to update after image success." },
              alt: { type: "string", minLength: 1 },
              placement: { type: "string", enum: ["end", "after_heading", "after_anchor"] },
              anchor: { type: "string", minLength: 1, description: "Required exact unique anchor for non-end placement." },
            },
          },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: queueToolError("image_queue_invalid: project identity is required") }
        try {
          const parsed = requireToolInput(input, this.options.defaultModel?.() ?? "gpt-image-2-cheap")
          return { ok: true, value: await this.submit({ projectId: context.projectId, ...parsed }, trustedGrowthSource(context)) }
        } catch (error) {
          return { ok: false, error: queueToolError(error) }
        }
      },
    }
  }

  managementTool(): CreatXToolContribution {
    return {
      name: "manage_image_generation",
      audiences: ["ordinary", "growth-stage", "world-writer", "world-recovery"],
      description: "Inspect or control persistent image tasks in the current CreatX project. Use action=list when the task ID or current state is uncertain. An image_result_unknown blocks this project's remaining queue across application restarts. retry moves one failed or interrupted task to the project tail and uses only that task as the recovery probe; success or a definite HTTP result reopens the queue, while another unknown result keeps it blocked. Do not loop retry. skip moves only an already queued task to this project's tail. cancel permanently abandons a queued, generating, failed, or interrupted task. A generating task cannot be retried or skipped because its Provider result may already cost money. This tool never exposes or changes another project.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["list", "retry", "skip", "cancel"] },
          imageTaskId: { type: "string", minLength: 1, description: "Required for retry, skip, or cancel; omit for list." },
        },
      },
      scope: "project",
      approval: "required",
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: queueToolError("image_queue_invalid: project identity is required") }
        try {
          const command = requireManagementInput(input)
          if (command.action === "list") {
            return { ok: true, value: { tasks: this.store.listProject(context.projectId).filter(isActionableTask).map(compactTask) } }
          }
          return { ok: true, value: compactTask(this.control(context.projectId, command.imageTaskId, command.action, "agent")) }
        } catch (error) {
          return { ok: false, error: queueToolError(error) }
        }
      },
    }
  }

  async submit(command: SubmitImageTaskCommand, source?: ImageTaskGrowthSource) {
    if (!this.accepting) throw new Error("image_queue_conflict: image queue is shutting down")
    const normalizedCommand = {
      ...command,
      relativePath: requireSafeRelativePath(command.relativePath),
      ...(command.attachment ? { attachment: requireAttachmentInput(command.attachment) } : {}),
    }
    const prompt = imageContentPrompt(requireText(command.prompt, "prompt"))
    const existing = this.store.findProjectByIdempotency(normalizedCommand.projectId, normalizedCommand.idempotencyKey)
    if (existing) {
      if (imageContentPrompt(existing.prompt) !== prompt) throw new Error("image_queue_conflict: idempotencyKey was already used for different image input")
      return this.store.submit({ ...normalizedCommand, prompt: existing.prompt }, source)
    }
    const visualPrompt = this.options.visualStyleSource
      ? await resolveProjectVisualPrompt(this.options.visualStyleSource, normalizedCommand.projectId, normalizedCommand.relativePath, prompt)
      : { prompt, visualStyleApplied: false }
    if (!this.accepting) throw new Error("image_queue_conflict: image queue is shutting down")
    if (!visualPrompt.visualStyleApplied) this.options.onWarning?.({ code: "project_visual_style_missing", projectId: normalizedCommand.projectId, relativePath: normalizedCommand.relativePath })
    const task = this.store.submit({ ...normalizedCommand, prompt: visualPrompt.prompt }, source)
    this.emit(task)
    this.wake()
    return task
  }

  start() {
    if (this.running) return
    this.accepting = true
    for (const task of this.store.interruptGenerating("Application restarted before image generation completed")) this.emit(task)
    this.running = true
    this.wake()
  }

  async shutdown() {
    this.accepting = false
    this.running = false
    for (const task of this.store.interruptGenerating()) this.emit(task)
    this.activeRequests.forEach((active) => active.controller.abort(new Error("Image queue is shutting down")))
    await Promise.allSettled([
      ...Array.from(this.activeRequests.values(), (active) => active.execution),
      ...this.attachmentExecutions.values(),
    ])
  }

  listGrowthGoal(projectId: string, growthGoalId: string) {
    return this.store.listGrowthGoal(projectId, growthGoalId)
  }

  control(projectId: string, imageTaskId: string, action: ImageTaskAction, origin: "agent" | "user" = "user") {
    if (!this.accepting) throw new Error("image_queue_conflict: image queue is shutting down")
    const gate = action === "retry" ? this.store.getProjectGate(projectId) : undefined
    if (gate?.agentProbeUsed && origin === "agent") throw new Error("image_queue_blocked: automatic recovery probe already failed; wait for explicit user retry")
    const task = action === "retry"
      ? this.store.retryNow(projectId, imageTaskId)
      : action === "skip"
        ? this.store.skipToProjectTail(projectId, imageTaskId)
        : this.store.cancel(projectId, imageTaskId)
    if (action === "retry" && gate) this.store.beginProjectProbe(projectId, imageTaskId, origin)
    this.emit(task)
    if (action === "cancel") {
      this.store.releaseProjectGateForTask(projectId, imageTaskId)
      const active = this.activeRequests.get(projectId)
      if (active?.imageTaskId === imageTaskId) active.controller.abort(new Error("Image task was cancelled by the user"))
    }
    this.wake()
    return task
  }

  async bindAttachmentIntent(projectId: string, imageTaskId: string, attachment: ImageAttachmentIntent) {
    if (!this.accepting) throw new Error("image_queue_conflict: image queue is shutting down")
    const task = this.store.bindAttachmentIntent(projectId, imageTaskId, requireAttachmentInput(attachment))
    this.emit(task)
    if (task.status !== "succeeded" || task.attachment?.status === "succeeded") return task
    return this.runAttachment(task.imageTaskId)
  }

  async reconcileAttachmentIntent(projectId: string, imageTaskId: string, attachment: ImageAttachmentIntent) {
    if (!this.accepting) throw new Error("image_queue_conflict: image queue is shutting down")
    const task = this.store.reconcileAuthoritativeAttachmentIntent(projectId, imageTaskId, requireAttachmentInput(attachment))
    this.emit(task)
    if (task.status !== "succeeded" || task.attachment?.status === "succeeded") return task
    return this.runAttachment(task.imageTaskId)
  }

  private wake() {
    if (!this.running || this.wakeScheduled) return
    this.wakeScheduled = true
    queueMicrotask(() => {
      this.wakeScheduled = false
      if (this.running) this.fillSlots()
    })
  }

  private fillSlots() {
    const capacity = globalImageConcurrency - this.activeRequests.size
    if (capacity < 1) return
    const projects = this.store.listRunnableProjects(capacity + this.activeRequests.size)
      .filter((projectId) => !this.activeRequests.has(projectId))
      .slice(0, capacity)
    projects.forEach((projectId) => {
      const task = this.store.claimNextForProject(projectId)
      if (!task) return
      this.emit(task)
      const controller = new AbortController()
      const execution = this.generate(task, controller).finally(() => {
        const active = this.activeRequests.get(projectId)
        if (active?.execution === execution) this.activeRequests.delete(projectId)
        this.wake()
      })
      this.activeRequests.set(projectId, { imageTaskId: task.imageTaskId, controller, execution })
    })
  }

  private async generate(task: ImageTaskProjection, controller: AbortController) {
    try {
      await this.images.generateToProject({
        projectId: task.projectId,
        relativePath: task.relativePath,
        model: task.model,
        prompt: task.prompt,
        ...(task.size ? { size: task.size } : {}),
        signal: controller.signal,
      })
      if (this.store.get(task.imageTaskId)?.status === "generating") {
        const completed = this.store.succeed(task.imageTaskId)
        this.store.resolveProjectProbe(task.projectId, task.imageTaskId)
        this.emit(completed)
        if (completed.attachment) await this.runAttachment(completed.imageTaskId)
      }
    } catch (error) {
      if (this.store.get(task.imageTaskId)?.status === "generating") {
        this.emit(this.store.fail(task.imageTaskId, errorCode(error), errorMessage(error)))
        if (error instanceof ImageRuntimeError && error.code === "image_result_unknown" && error.requestFailureKind !== "aborted") {
          this.store.blockProject(task.projectId, task.imageTaskId, error.code, error.message)
        } else {
          this.store.resolveProjectProbe(task.projectId, task.imageTaskId)
        }
      }
    }
  }

  private runAttachment(imageTaskId: string) {
    const previous = this.attachmentExecutions.get(imageTaskId) ?? Promise.resolve(this.store.get(imageTaskId)!)
    const execution = previous.then(async () => {
      const task = this.store.get(imageTaskId)
      if (!task || task.status !== "succeeded" || !task.attachment || task.attachment.status === "succeeded") {
        if (!task) throw new Error("image_queue_conflict: image task disappeared before document attachment")
        return task
      }
      try {
        if (!this.options.attachments) throw new Error("image_attachment_unavailable: attachment service is not configured")
        await this.options.attachments.attach({
          projectId: task.projectId,
          imagePath: task.relativePath,
          documentPath: task.attachment.documentPath,
          alt: task.attachment.alt,
          placement: task.attachment.placement,
          ...(task.attachment.anchor ? { anchor: task.attachment.anchor } : {}),
        })
        const completed = this.store.finishAttachment(task.imageTaskId, "succeeded")
        this.emit(completed)
        return completed
      } catch (error) {
        const failed = this.store.finishAttachment(task.imageTaskId, "failed", errorCode(error), errorMessage(error))
        this.emit(failed)
        return failed
      }
    }).finally(() => {
      if (this.attachmentExecutions.get(imageTaskId) === execution) this.attachmentExecutions.delete(imageTaskId)
    })
    this.attachmentExecutions.set(imageTaskId, execution)
    return execution
  }

  private emit(task: ImageTaskProjection) {
    this.options.onEvent?.({ type: "image.task.changed", task })
  }

}

function requireSafeRelativePath(value: string) {
  const path = requireText(value, "relativePath").replaceAll("\\", "/")
  if (path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) {
    throw new Error("image_queue_invalid: relativePath must be a safe project-relative path")
  }
  return path
}

function requireToolInput(value: unknown, defaultModel: ImageGenerationModel = "gpt-image-2-cheap") {
  if (!isRecord(value) || Array.isArray(value)) throw new Error("image_queue_invalid: tool input must be an object")
  if (Object.keys(value).some((key) => !["idempotencyKey", "prompt", "relativePath", "model", "attachment"].includes(key))) {
    throw new Error("image_queue_invalid: tool input contains unknown fields")
  }
  const model: ImageGenerationModel = value.model === undefined ? requireModel(defaultModel) : requireModel(value.model)
  return {
    idempotencyKey: requireText(value.idempotencyKey, "idempotencyKey"),
    prompt: requireText(value.prompt, "prompt"),
    relativePath: requireText(value.relativePath, "relativePath"),
    model,
    ...(value.attachment === undefined ? {} : { attachment: requireAttachmentInput(value.attachment) }),
  }
}

function trustedGrowthSource(context: CreatXToolExecutionContext): ImageTaskGrowthSource | undefined {
  if (!context.growthGoalId) return undefined
  return {
    growthGoalId: context.growthGoalId,
    ...(context.growthWorkItemId ? { growthWorkItemId: context.growthWorkItemId } : {}),
    ...(context.growthAttemptId ? { growthAttemptId: context.growthAttemptId } : {}),
  }
}

function requireAttachmentInput(value: unknown): ImageAttachmentIntent {
  if (!isRecord(value) || Array.isArray(value)) throw new Error("image_queue_invalid: attachment must be an object")
  if (Object.keys(value).some((key) => !["documentPath", "alt", "placement", "anchor"].includes(key))) throw new Error("image_queue_invalid: attachment contains unknown fields")
  if (value.placement !== "end" && value.placement !== "after_heading" && value.placement !== "after_anchor") throw new Error("image_queue_invalid: unsupported attachment placement")
  const anchor = value.anchor === undefined ? undefined : requireText(value.anchor, "attachment.anchor")
  if (value.placement !== "end" && !anchor) throw new Error("image_queue_invalid: attachment.anchor is required for the selected placement")
  if (value.placement === "end" && anchor) throw new Error("image_queue_invalid: end attachment does not accept anchor")
  return {
    documentPath: requireText(value.documentPath, "attachment.documentPath"),
    alt: requireText(value.alt, "attachment.alt"),
    placement: value.placement,
    ...(anchor ? { anchor } : {}),
  }
}

function requireManagementInput(value: unknown):
  | { action: "list" }
  | { action: ImageTaskAction; imageTaskId: string } {
  if (!isRecord(value) || Array.isArray(value)) throw new Error("image_queue_invalid: tool input must be an object")
  if (Object.keys(value).some((key) => !["action", "imageTaskId"].includes(key))) {
    throw new Error("image_queue_invalid: tool input contains unknown fields")
  }
  if (value.action === "list") {
    if (value.imageTaskId !== undefined) throw new Error("image_queue_invalid: list does not accept imageTaskId")
    return { action: "list" }
  }
  if (value.action !== "retry" && value.action !== "skip" && value.action !== "cancel") {
    throw new Error("image_queue_invalid: unsupported image task action")
  }
  return { action: value.action, imageTaskId: requireText(value.imageTaskId, "imageTaskId") }
}

function isActionableTask(task: ImageTaskProjection) {
  return task.status === "queued" || task.status === "generating" || task.status === "failed" || task.status === "interrupted"
}

function compactTask(task: ImageTaskProjection) {
  return {
    imageTaskId: task.imageTaskId,
    relativePath: task.relativePath,
    status: task.status,
    ...(task.errorCode ? { errorCode: task.errorCode } : {}),
    ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
  }
}

function requireModel(value: unknown): ImageGenerationModel {
  if (value === "gpt-image-2-cheap" || value === "gpt-image-2") return value
  throw new Error("image_queue_invalid: unsupported image model")
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`image_queue_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function errorCode(error: unknown) {
  if (error instanceof ImageRuntimeError) return error.code
  const detail = errorMessage(error)
  return detail.split(":", 1)[0] || "runtime"
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
}

function queueToolError(error: unknown): CreatXError {
  const detail = errorMessage(error)
  if (detail.startsWith("image_queue_conflict")) return { code: "image_queue_conflict", message: "图片任务与现有队列状态冲突。", detail }
  if (detail.startsWith("image_queue_invalid")) return { code: "image_queue_invalid", message: "图片任务请求无效。", detail }
  if (detail.startsWith("image_queue_persistence")) return { code: "image_queue_persistence", message: "图片队列无法安全保存。", detail }
  return { code: "tool_failed", message: "图片任务提交失败。", detail }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
