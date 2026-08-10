export type WorkspaceMode = "chat" | "workbench"
export type WorkspaceModeEvent = "open-workbench" | "collapse-workbench" | "change-session"

export const defaultWorkspaceMode: WorkspaceMode = "chat"
export const conversationContentMaxWidth = 1100
export const collapsedNavigationWidth = 52

export function workspaceColumnOrder(_mode: WorkspaceMode) {
  return ["project", "conversation", "canvas", "workbench-navigation"] as const
}

export function settleProjectNavigationResize(startWidth: number, proposedWidth: number) {
  if (proposedWidth <= collapsedNavigationWidth) return { collapsed: true, width: startWidth }
  return { collapsed: false, width: proposedWidth }
}

export function defaultAuxiliaryPanelWidth(viewportWidth: number, minimum: number) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return minimum
  return Math.min(472, Math.max(minimum, Math.round(viewportWidth * 0.185)))
}

export function scalePanelWidthForViewport(width: number, previousViewportWidth: number, viewportWidth: number, minimum: number, maximum: number) {
  if (!Number.isFinite(previousViewportWidth) || previousViewportWidth <= 0 || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return Math.min(maximum, Math.max(minimum, Math.round(width)))
  return Math.min(maximum, Math.max(minimum, Math.round(width * viewportWidth / previousViewportWidth)))
}

export function clampWorkspaceSplitRatio(requestedRatio: number, availableHeight: number) {
  if (!Number.isFinite(requestedRatio)) return .4
  if (!Number.isFinite(availableHeight) || availableHeight < 400) return Math.min(.7, Math.max(.25, requestedRatio))
  return Math.min(1 - 160 / availableHeight, Math.max(120 / availableHeight, requestedRatio))
}

export function workspaceLayoutProjection(mode: WorkspaceMode) {
  const workbenchCanvasOpen = mode === "workbench"
  return {
    projectNavigation: true,
    conversation: true,
    workbenchTree: true,
    canvas: workbenchCanvasOpen,
    inspector: workbenchCanvasOpen,
    conversationExpanded: !workbenchCanvasOpen,
  }
}

export function transitionWorkspaceMode(mode: WorkspaceMode, event: WorkspaceModeEvent, preserveWorkspaceOnSessionChange = false): WorkspaceMode {
  if (event === "open-workbench") return "workbench"
  if (event === "change-session" && preserveWorkspaceOnSessionChange) return mode
  return "chat"
}
