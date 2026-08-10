import { isSilentImageAttachmentConflict, type ImageTaskProjection } from "@creatx/contracts"

const terminalFeedbackMs = 3_000

export function mergeProjectImageTask(tasks: ImageTaskProjection[], task: ImageTaskProjection, projectId: string | undefined) {
  if (task.projectId !== projectId) return tasks
  return tasks.some((entry) => entry.imageTaskId === task.imageTaskId)
    ? tasks.map((entry) => entry.imageTaskId === task.imageTaskId ? task : entry)
    : [...tasks, task]
}

export function projectImageTaskActivity(tasks: ImageTaskProjection[], projectId: string | undefined, now = Date.now()) {
  const projectTasks = projectId ? tasks.filter((task) => task.projectId === projectId) : []
  const visible = projectTasks.filter((task) => {
    if (task.attachment?.status === "failed" && !isSilentImageTaskAttachmentConflict(task)) return true
    if (task.status !== "succeeded" && task.status !== "cancelled") return true
    return now - new Date(task.completedAt ?? task.updatedAt).getTime() < terminalFeedbackMs
  })
  return {
    tasks: visible,
    total: visible.length,
    completed: visible.filter((task) => task.status === "succeeded").length,
    queued: visible.filter((task) => task.status === "queued").length,
    generating: visible.find((task) => task.status === "generating"),
  }
}

export function isSilentImageTaskAttachmentConflict(task: ImageTaskProjection) {
  return task.status === "succeeded"
    && task.attachment?.status === "failed"
    && isSilentImageAttachmentConflict(task.attachment.errorCode)
}
