import { describe, expect, test } from "bun:test"
import { clampWorkspaceSplitRatio, conversationContentMaxWidth, defaultAuxiliaryPanelWidth, defaultWorkspaceMode, scalePanelWidthForViewport, settleProjectNavigationResize, transitionWorkspaceMode, workspaceColumnOrder, workspaceLayoutProjection } from "../src/workspace-layout"
import { reconcileWorkbenchSurface, workspaceSeparatorDisabled } from "../src/WorkspaceShell"

describe("workspace layout", () => {
  test("starts each conversation in Chat mode with the canvas collapsed", () => {
    expect(defaultWorkspaceMode).toBe("chat")
    expect(workspaceLayoutProjection(defaultWorkspaceMode)).toEqual({
      projectNavigation: true,
      conversation: true,
      workbenchTree: true,
      canvas: false,
      inspector: false,
      conversationExpanded: true,
    })
  })

  test("opens files in Workbench mode and returns to Chat for collapse or session change", () => {
    expect(transitionWorkspaceMode("chat", "open-workbench")).toBe("workbench")
    expect(transitionWorkspaceMode("workbench", "collapse-workbench")).toBe("chat")
    expect(transitionWorkspaceMode("workbench", "change-session")).toBe("chat")
    expect(transitionWorkspaceMode("workbench", "change-session", true)).toBe("workbench")
    expect(workspaceLayoutProjection("workbench")).toEqual({
      projectNavigation: true,
      conversation: true,
      workbenchTree: true,
      canvas: true,
      inspector: true,
      conversationExpanded: false,
    })
  })

  test("keeps project, chat, canvas and workbench navigation in one fixed order", () => {
    expect(workspaceColumnOrder("chat")).toEqual(["project", "conversation", "canvas", "workbench-navigation"])
    expect(workspaceColumnOrder("workbench")).toEqual(["project", "conversation", "canvas", "workbench-navigation"])
  })

  test("collapses at 52 pixels while preserving the width from the start of the drag", () => {
    expect(settleProjectNavigationResize(286, 53)).toEqual({ collapsed: false, width: 53 })
    expect(settleProjectNavigationResize(286, 52)).toEqual({ collapsed: true, width: 286 })
    expect(settleProjectNavigationResize(286, 20)).toEqual({ collapsed: true, width: 286 })
  })

  test("uses Codex-like wide-screen proportions without breaking narrow windows", () => {
    expect(defaultAuxiliaryPanelWidth(2560, 220)).toBe(472)
    expect(defaultAuxiliaryPanelWidth(1355, 220)).toBe(251)
    expect(defaultAuxiliaryPanelWidth(860, 220)).toBe(220)
    expect(defaultAuxiliaryPanelWidth(2560, 168)).toBe(472)
    expect(scalePanelWidthForViewport(472, 2560, 1338, 220, 520)).toBe(247)
    expect(scalePanelWidthForViewport(247, 1338, 2560, 220, 520)).toBe(473)
    expect(conversationContentMaxWidth).toBe(1100)
  })

  test("keeps the project session and file panes usable while resizing proportionally", () => {
    expect(clampWorkspaceSplitRatio(.4, 800)).toBe(.4)
    expect(clampWorkspaceSplitRatio(.05, 800)).toBe(.15)
    expect(clampWorkspaceSplitRatio(.95, 800)).toBe(.8)
    expect(clampWorkspaceSplitRatio(.1, 320)).toBe(.25)
  })

  test("keeps the workbench canvas and navigation separator operable while both are open", () => {
    expect(workspaceSeparatorDisabled("workbench-canvas", true, true)).toBe(false)
    expect(workspaceSeparatorDisabled("workbench-canvas", true, false)).toBe(true)
    expect(workspaceSeparatorDisabled("project-conversation", false, true)).toBe(true)
  })

  test("falls back to builtin files only when a loaded snapshot proves the selected workbench disappeared", () => {
    const snapshot = { projectId: "project-1", workbenches: [{ id: "builtin:files" }, { id: "wb-ready" }], diagnostics: [], refreshedAt: "2026-08-11T00:00:00.000Z" }
    expect(reconcileWorkbenchSurface({ workbenchId: "wb-ready" }, snapshot)).toEqual({ workbenchId: "wb-ready" })
    expect(reconcileWorkbenchSurface({ workbenchId: "wb-removed" }, snapshot)).toEqual({ workbenchId: "builtin:files" })
    expect(reconcileWorkbenchSurface({ workbenchId: "wb-removed" }, undefined)).toEqual({ workbenchId: "wb-removed" })
    expect(reconcileWorkbenchSurface("preview", snapshot)).toBe("preview")
  })
})
