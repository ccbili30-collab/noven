export const transientErrorRecoveringMs = 6_000
export const transientErrorHiddenMs = 8_000

const transientErrorMessages = new Set([
  "图片任务请求无效。",
  "运行时发生错误。",
])

export function isTransientRecoveringError(message: string | undefined) {
  return Boolean(message && transientErrorMessages.has(message))
}

export function transientErrorPhase(elapsedMs: number) {
  if (elapsedMs >= transientErrorHiddenMs) return "hidden" as const
  if (elapsedMs >= transientErrorRecoveringMs) return "recovered" as const
  return "recovering" as const
}
