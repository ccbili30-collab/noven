import type { ProjectFileQueryPort } from "@creatx/project-files"

export const PROJECT_VISUAL_STYLE_HEADER = "[项目统一画风（最高视觉约束，不得被本次图片内容覆盖）]" as const
const IMAGE_CONTENT_HEADER = "[本次图片内容]" as const

export async function resolveProjectVisualPrompt(fileQueries: ProjectFileQueryPort, projectId: string, relativePath: string, prompt: string) {
  const contentPrompt = imageContentPrompt(prompt)
  const segments = requireSafeRelativePath(relativePath).split("/").slice(0, -1)
  try {
    const snapshot = await fileQueries.refreshProject(projectId)
    const available = new Set(snapshot.files.map((file) => file.relativePath.replaceAll("\\", "/")))
    const stylePath = Array.from({ length: segments.length + 1 }, (_, offset) => {
      const prefix = segments.slice(0, segments.length - offset).join("/")
      return prefix ? `${prefix}/视觉设定/统一画风.md` : "视觉设定/统一画风.md"
    }).find((candidate) => available.has(candidate))
    if (!stylePath) return { prompt: contentPrompt, visualStyleApplied: false }
    const style = new TextDecoder("utf-8", { fatal: true }).decode(await fileQueries.readBytes(projectId, stylePath)).trim()
    return style
      ? { prompt: compileVisualPrompt(style, contentPrompt), visualStyleApplied: true }
      : { prompt: contentPrompt, visualStyleApplied: false }
  } catch {
    return { prompt: contentPrompt, visualStyleApplied: false }
  }
}

export function compileVisualPrompt(style: string, prompt: string) {
  return `${PROJECT_VISUAL_STYLE_HEADER}\n${style}\n\n${IMAGE_CONTENT_HEADER}\n${imageContentPrompt(prompt)}`
}

export function promptUsesProjectVisualStyle(prompt: string) {
  return prompt.startsWith(`${PROJECT_VISUAL_STYLE_HEADER}\n`)
}

export function imageContentPrompt(prompt: string) {
  const marker = `\n\n${IMAGE_CONTENT_HEADER}\n`
  const index = prompt.lastIndexOf(marker)
  return index < 0 ? prompt : prompt.slice(index + marker.length)
}

function requireSafeRelativePath(value: string) {
  const path = value.trim().replaceAll("\\", "/")
  if (!path || path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) {
    throw new Error("image_queue_invalid: relativePath must be a safe project-relative path")
  }
  return path
}
