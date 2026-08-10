import type { DesktopBootstrapSelection, SessionSummary } from "@creatx/contracts"

export const applicationRestartSelectionStorageKey = "creatx.application-restart-selection.v1"

type RestartSelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function saveApplicationRestartSelection(storage: Pick<RestartSelectionStorage, "setItem">, selection: DesktopBootstrapSelection) {
  storage.setItem(applicationRestartSelectionStorageKey, JSON.stringify(selection))
}

export function readApplicationRestartSelection(storage: Pick<RestartSelectionStorage, "getItem" | "removeItem">) {
  const saved = storage.getItem(applicationRestartSelectionStorageKey)
  if (!saved) return undefined
  try {
    const selection = JSON.parse(saved) as unknown
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new Error("invalid restart selection")
    const candidate = selection as Partial<DesktopBootstrapSelection>
    if (Object.keys(selection).some((key) => key !== "projectId" && key !== "sessionId")) throw new Error("unknown restart selection field")
    if (candidate.projectId !== undefined && (typeof candidate.projectId !== "string" || !candidate.projectId.trim())) throw new Error("invalid projectId")
    if (candidate.sessionId !== undefined && (typeof candidate.sessionId !== "string" || !candidate.sessionId.trim())) throw new Error("invalid sessionId")
    const projectId = candidate.projectId?.trim()
    const sessionId = candidate.sessionId?.trim()
    if (!projectId && !sessionId) throw new Error("empty restart selection")
    return {
      ...(projectId ? { projectId } : {}),
      ...(sessionId ? { sessionId } : {}),
    }
  } catch {
    storage.removeItem(applicationRestartSelectionStorageKey)
    return undefined
  }
}

export function clearApplicationRestartSelection(storage: Pick<RestartSelectionStorage, "removeItem">) {
  storage.removeItem(applicationRestartSelectionStorageKey)
}

export function resolveApplicationRestartSession(selection: DesktopBootstrapSelection | undefined, sessions: SessionSummary[]) {
  if (!selection?.projectId || !selection.sessionId) return undefined
  return sessions.find((session) => session.id === selection.sessionId && session.projectId === selection.projectId)
}
