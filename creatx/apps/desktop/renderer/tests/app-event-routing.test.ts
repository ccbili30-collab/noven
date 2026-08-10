import { describe, expect, test } from "bun:test"
import { conversationProjectForSession, formatTimelineToolError } from "../src/WorkspaceShell"

describe("Renderer event routing", () => {
  test("shows a bounded actionable error under a failed tool row", () => {
    expect(formatTimelineToolError("growth_invalid: trusted materialization identity is required")).toBe("trusted materialization identity is required")
    expect(formatTimelineToolError(`growth_invalid: ${"x".repeat(240)}`)).toHaveLength(178)
  })

  test("does not resolve a newly selected conversation against the previous project", () => {
    const project = { id: "project-a", name: "A", displayPath: "C:\\A", files: [], refreshedAt: "2026-08-10T00:00:00.000Z" }
    const session = {
      id: "session-b",
      title: "B",
      projectId: "project-b",
      displayPath: "C:\\B",
      status: "completed" as const,
      startedAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      providerId: "test",
      modelId: "test",
      kind: "project" as const,
      permission: { mode: "free" as const, projectTools: true, trustWarning: "test" },
    }

    expect(conversationProjectForSession(project, session)).toBeUndefined()
    expect(conversationProjectForSession({ ...project, id: "project-b" }, session)?.id).toBe("project-b")
  })
})
