import type { RunState, SessionSummary } from "@creatx/contracts"

export type SessionRunStates = Readonly<Record<string, RunState>>

export function initializeSessionRunStates(sessions: ReadonlyArray<Pick<SessionSummary, "id" | "status">>) {
  return Object.fromEntries(sessions.map((session) => [session.id, runStateFromSessionStatus(session.status)])) satisfies SessionRunStates
}

export function runStateForSession(states: SessionRunStates, sessionId: string | undefined): RunState {
  if (!sessionId) return "idle"
  return states[sessionId] ?? "unknown"
}

export function updateSessionRunState(states: SessionRunStates, sessionId: string, state: RunState): SessionRunStates {
  if (states[sessionId] === state) return states
  return { ...states, [sessionId]: state }
}

export function settleSessionRunState(states: SessionRunStates, sessionId: string): SessionRunStates {
  if (states[sessionId] !== "running") return states
  return updateSessionRunState(states, sessionId, "unknown")
}

export function removeSessionRunState(states: SessionRunStates, sessionId: string): SessionRunStates {
  if (!(sessionId in states)) return states
  return Object.fromEntries(Object.entries(states).filter(([id]) => id !== sessionId))
}

function runStateFromSessionStatus(status: string): RunState {
  if (status === "idle" || status === "running" || status === "completed" || status === "cancelled" || status === "failed" || status === "unknown") return status
  return "unknown"
}
