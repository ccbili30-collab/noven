import type { SessionSummary } from "@creatx/contracts"

export const creativeLibraryShareRowHeight = 64

export function filterShareSessions<T extends Pick<SessionSummary, "title" | "displayPath">>(sessions: readonly T[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return sessions
  return sessions.filter((session) => `${session.title}\n${session.displayPath}`.toLocaleLowerCase().includes(normalized))
}

export function shareListWindow(length: number, scrollTop: number, viewportHeight: number) {
  if (length <= 0) return { start: 0, end: 0, offset: 0, totalHeight: 0 }
  const totalHeight = length * creativeLibraryShareRowHeight
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)))
  const start = Math.max(0, Math.floor(top / creativeLibraryShareRowHeight) - 3)
  const end = Math.min(length, Math.ceil((top + viewportHeight) / creativeLibraryShareRowHeight) + 3)
  return { start, end, offset: start * creativeLibraryShareRowHeight, totalHeight }
}
