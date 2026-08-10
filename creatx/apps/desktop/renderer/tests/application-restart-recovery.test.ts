import { describe, expect, test } from "bun:test"
import type { SessionSummary } from "@creatx/contracts"
import {
  applicationRestartSelectionStorageKey,
  clearApplicationRestartSelection,
  readApplicationRestartSelection,
  resolveApplicationRestartSession,
  saveApplicationRestartSelection,
} from "../src/application-restart-recovery"

describe("application restart recovery", () => {
  test("saves and reads the selected project and session", () => {
    const storage = memoryStorage()
    saveApplicationRestartSelection(storage, { projectId: "project-b", sessionId: "session-b2" })

    expect(readApplicationRestartSelection(storage)).toEqual({ projectId: "project-b", sessionId: "session-b2" })
  })

  test("resolves only a session that still belongs to the selected project", () => {
    const sessions = [session("session-a", "project-a"), session("session-b2", "project-b")]

    expect(resolveApplicationRestartSession({ projectId: "project-b", sessionId: "session-b2" }, sessions)?.id).toBe("session-b2")
    expect(resolveApplicationRestartSession({ projectId: "project-a", sessionId: "session-b2" }, sessions)).toBeUndefined()
    expect(resolveApplicationRestartSession({ projectId: "project-b", sessionId: "deleted" }, sessions)).toBeUndefined()
  })

  test("clears corrupt JSON and falls back to normal startup", () => {
    const storage = memoryStorage([[applicationRestartSelectionStorageKey, "{broken"]])

    expect(readApplicationRestartSelection(storage)).toBeUndefined()
    expect(storage.getItem(applicationRestartSelectionStorageKey)).toBeNull()
  })

  test("clears unknown fields and whitespace identities instead of blocking bootstrap", () => {
    const unknown = memoryStorage([[applicationRestartSelectionStorageKey, JSON.stringify({ projectId: "project-a", extra: true })]])
    const whitespace = memoryStorage([[applicationRestartSelectionStorageKey, JSON.stringify({ projectId: "   " })]])

    expect(readApplicationRestartSelection(unknown)).toBeUndefined()
    expect(readApplicationRestartSelection(whitespace)).toBeUndefined()
    expect(unknown.getItem(applicationRestartSelectionStorageKey)).toBeNull()
    expect(whitespace.getItem(applicationRestartSelectionStorageKey)).toBeNull()
  })

  test("clears the one-time selection after bootstrap", () => {
    const storage = memoryStorage()
    saveApplicationRestartSelection(storage, { projectId: "project-a", sessionId: "session-a" })
    clearApplicationRestartSelection(storage)

    expect(readApplicationRestartSelection(storage)).toBeUndefined()
  })
})

function memoryStorage(initial: Array<[string, string]> = []) {
  const values = new Map(initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

function session(id: string, projectId: string): SessionSummary {
  return {
    id,
    projectId,
    title: id,
    displayPath: projectId,
    status: "idle",
    startedAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    providerId: "openai",
    modelId: "test",
    kind: "project",
    permission: { mode: "approval", projectTools: true, trustWarning: "" },
  }
}
