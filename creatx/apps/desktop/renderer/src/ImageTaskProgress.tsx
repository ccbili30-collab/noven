import { useEffect, useState } from "react"
import { Check, ChevronDown, ChevronUp, Image, RotateCcw, SkipForward, Square, X } from "lucide-react"
import type { ImageTaskAction, ImageTaskProjection } from "@creatx/contracts"
import { isSilentImageTaskAttachmentConflict, projectImageTaskActivity } from "./image-task-activity"

interface ImageTaskProgressProps {
  projectId: string | undefined
  tasks: ImageTaskProjection[]
  onAction: (imageTaskId: string, action: ImageTaskAction) => Promise<boolean>
}

export function ImageTaskProgress(props: ImageTaskProgressProps) {
  const [expanded, setExpanded] = useState(false)
  const [pendingTaskId, setPendingTaskId] = useState<string>()
  const [clock, setClock] = useState(Date.now())
  const activity = projectImageTaskActivity(props.tasks, props.projectId, clock)

  useEffect(() => {
    const expiry = props.tasks
      .filter((task) => task.projectId === props.projectId && (task.status === "succeeded" || task.status === "cancelled"))
      .map((task) => new Date(task.completedAt ?? task.updatedAt).getTime() + 3_000)
      .filter((value) => value > Date.now())
      .sort((left, right) => left - right)[0]
    if (!expiry) return
    const timeout = window.setTimeout(() => setClock(Date.now()), expiry - Date.now())
    return () => window.clearTimeout(timeout)
  }, [props.projectId, props.tasks])

  if (!activity.tasks.length) return null
  const current = activity.generating ?? activity.tasks[0]!
  const runAction = (task: ImageTaskProjection, action: ImageTaskAction) => {
    if (pendingTaskId) return
    setPendingTaskId(task.imageTaskId)
    void props.onAction(task.imageTaskId, action).finally(() => setPendingTaskId((value) => value === task.imageTaskId ? undefined : value))
  }

  const currentStatus = current.attachment?.status === "failed" && !isSilentImageTaskAttachmentConflict(current) ? "attachment-failed" : current.status
  return <section className={`wb-image-progress${expanded ? " is-expanded" : ""}`} data-image-status={currentStatus} aria-label="图片生成进度">
    <div className="wb-image-progress-summary">
      <Image size={14} />
      <strong>{imageTaskStatusLabel(current)}</strong>
      <span title={current.relativePath}>{current.relativePath}{taskError(current) ? <i> · {taskError(current)}</i> : null}</span>
      <small>{activity.generating ? `生成中 · 排队 ${activity.queued}` : `${activity.total} 项`}</small>
      <button className="wb-image-progress-toggle" title={expanded ? "收起图片任务" : "展开图片任务"} aria-label={expanded ? "收起图片任务" : "展开图片任务"} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}</button>
    </div>
    {expanded && <div className="wb-image-progress-sections">{imageTaskSections(activity.tasks).map((section) => <section key={section.label}>
      <h4>{section.label}<small>{section.tasks.length}</small></h4>
      <ul>{section.tasks.map((task) => <li key={task.imageTaskId} data-image-status={task.status}>
        <span>{statusIcon(task.status)}<em title={task.relativePath}>{task.relativePath}</em></span>
        {taskError(task) ? <details><summary>{imageTaskStatusLabel(task)} · {taskError(task)}</summary><code>{task.attachment?.errorMessage ?? task.errorMessage ?? task.attachment?.errorCode ?? task.errorCode}</code></details> : <small>{imageTaskStatusLabel(task)}</small>}
        <div>{imageTaskActions(task.status).map((action) => <button key={action} disabled={Boolean(pendingTaskId)} aria-label={`${imageTaskActionLabel(action)}：${task.relativePath}`} title={imageTaskActionLabel(action)} onClick={() => runAction(task, action)}>{actionIcon(action)}</button>)}</div>
      </li>)}</ul>
    </section>)}</div>}
  </section>
}

export function imageTaskActions(status: ImageTaskProjection["status"]): ImageTaskAction[] {
  if (status === "queued") return ["skip", "cancel"]
  if (status === "generating") return ["cancel"]
  if (status === "failed" || status === "interrupted") return ["retry", "cancel"]
  return []
}

export function imageTaskSections(tasks: ImageTaskProjection[]) {
  return [
    { label: "正在生成", tasks: tasks.filter((task) => task.status === "generating") },
    { label: "等待生成", tasks: tasks.filter((task) => task.status === "queued") },
    { label: "失败待处理", tasks: tasks.filter((task) => task.status === "failed" || task.status === "interrupted" || task.attachment?.status === "failed" && !isSilentImageTaskAttachmentConflict(task)) },
    { label: "已完成", tasks: tasks.filter((task) => task.status === "succeeded" && (task.attachment?.status !== "failed" || isSilentImageTaskAttachmentConflict(task)) || task.status === "cancelled") },
  ].filter((section) => section.tasks.length)
}

function imageTaskStatusLabel(task: ImageTaskProjection) {
  if (task.attachment?.status === "failed" && !isSilentImageTaskAttachmentConflict(task)) return "已生成，未插入文章"
  return ({ queued: "等待生成", generating: "正在生成", succeeded: "已生成", failed: "生成失败", interrupted: "生成中断", cancelled: "已取消" } as const)[task.status]
}

function imageTaskActionLabel(action: ImageTaskAction) {
  return ({ retry: "重试", skip: "排到最后", cancel: "取消" } as const)[action]
}

function taskError(task: ImageTaskProjection) {
  const detail = task.attachment?.status === "failed" && !isSilentImageTaskAttachmentConflict(task)
    ? task.attachment.errorMessage ?? task.attachment.errorCode
    : task.status === "failed" || task.status === "interrupted"
      ? task.errorMessage ?? task.errorCode
      : undefined
  return detail?.replace(/^[a-z_]+:\s*/u, "")
}

function statusIcon(status: ImageTaskProjection["status"]) {
  if (status === "succeeded") return <Check size={13} />
  if (status === "cancelled") return <X size={13} />
  return <Image size={13} />
}

function actionIcon(action: ImageTaskAction) {
  if (action === "retry") return <RotateCcw size={12} />
  if (action === "skip") return <SkipForward size={12} />
  return <Square size={11} />
}
