import { describe, expect, test } from "bun:test"
import type { TimelineItem } from "@creatx/contracts"
import { hideUserMessage, messageVisibilityStorageKey, readMessageVisibilityPreferences, restoreUserMessage, visibleTimeline } from "../src/message-visibility-preferences"

describe("local message visibility preferences", () => {
  test("persists stable user message IDs independently per session", () => {
    const storage = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
    }
    const hidden = hideUserMessage(readMessageVisibilityPreferences(localStorage), "session-a", "message:persisted-user")
    localStorage.setItem(messageVisibilityStorageKey, JSON.stringify(hidden))

    const reopened = readMessageVisibilityPreferences(localStorage)
    expect(reopened.hiddenBySession["session-a"]).toEqual(["message:persisted-user"])
    expect(reopened.hiddenBySession["session-b"]).toBeUndefined()
    expect(restoreUserMessage(reopened, "session-a", "message:persisted-user").hiddenBySession["session-a"]).toEqual([])
  })

  test("rejects legacy position IDs and ignores corrupt storage", () => {
    expect(() => hideUserMessage(readMessageVisibilityPreferences({ getItem: () => null }), "session-a", "message-0")).toThrow("message_visibility_invalid")
    expect(readMessageVisibilityPreferences({ getItem: () => "not-json" })).toEqual({ version: 1, deletionBoundaryAcknowledged: false, hiddenBySession: {} })
  })

  test("filters only the selected user row and never its assistant or tool evidence", () => {
    const items: TimelineItem[] = [
      { sequence: 1, itemId: "message:persisted-user", kind: "message", presentation: "user", state: "completed", text: "隐藏我" },
      { sequence: 2, itemId: "tool:1", kind: "tool", presentation: "assistant", state: "completed", toolName: "editor" },
      { sequence: 3, itemId: "message:persisted-assistant", kind: "message", presentation: "assistant", state: "completed", text: "仍然可见" },
    ]
    const preferences = hideUserMessage(readMessageVisibilityPreferences({ getItem: () => null }), "session-a", "message:persisted-user")

    expect(visibleTimeline(items, preferences, "session-a").map((item) => item.itemId)).toEqual(["tool:1", "message:persisted-assistant"])
    expect(visibleTimeline(items, preferences, "session-b").map((item) => item.itemId)).toEqual(items.map((item) => item.itemId))
  })
})
