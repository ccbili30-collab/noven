import { describe, expect, test } from "bun:test"
import {
  initializeSessionRunStates,
  removeSessionRunState,
  runStateForSession,
  settleSessionRunState,
  updateSessionRunState,
} from "../src/session-run-states"

describe("session run states", () => {
  test("keeps a running session from making a completed session look active", () => {
    const initial = initializeSessionRunStates([
      { id: "session-a", status: "running" },
      { id: "session-b", status: "completed" },
    ])

    expect(runStateForSession(initial, "session-a")).toBe("running")
    expect(runStateForSession(initial, "session-b")).toBe("completed")
  })

  test("records terminal events for a background session before it becomes active", () => {
    const initial = initializeSessionRunStates([
      { id: "session-a", status: "running" },
      { id: "session-b", status: "completed" },
    ])
    const completed = updateSessionRunState(initial, "session-a", "completed")

    expect(runStateForSession(completed, "session-b")).toBe("completed")
    expect(runStateForSession(completed, "session-a")).toBe("completed")
  })

  test("maps persisted session statuses without treating unknown terminal history as running", () => {
    const states = initializeSessionRunStates([
      { id: "idle", status: "idle" },
      { id: "running", status: "running" },
      { id: "completed", status: "completed" },
      { id: "failed", status: "failed" },
      { id: "cancelled", status: "cancelled" },
      { id: "unexpected", status: "archived" },
    ])

    expect(runStateForSession(states, "idle")).toBe("idle")
    expect(runStateForSession(states, "running")).toBe("running")
    expect(runStateForSession(states, "completed")).toBe("completed")
    expect(runStateForSession(states, "failed")).toBe("failed")
    expect(runStateForSession(states, "cancelled")).toBe("cancelled")
    expect(runStateForSession(states, "unexpected")).toBe("unknown")
    expect(runStateForSession(states, undefined)).toBe("idle")
  })

  test("removes state when a session is deleted", () => {
    const states = initializeSessionRunStates([{ id: "session-a", status: "running" }])

    expect(removeSessionRunState(states, "session-a")).toEqual({})
  })

  test("clears a stale running projection when a completed command returned without a terminal event", () => {
    const running = initializeSessionRunStates([{ id: "session-a", status: "running" }])
    const completed = updateSessionRunState(running, "session-a", "completed")

    expect(runStateForSession(settleSessionRunState(running, "session-a"), "session-a")).toBe("unknown")
    expect(settleSessionRunState(completed, "session-a")).toBe(completed)
  })
})
