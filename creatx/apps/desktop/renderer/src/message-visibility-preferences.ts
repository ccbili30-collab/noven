import type { TimelineItem } from "@creatx/contracts"

export const messageVisibilityStorageKey = "creatx.message-visibility.v1"

export interface MessageVisibilityPreferences {
  version: 1
  deletionBoundaryAcknowledged: boolean
  hiddenBySession: Record<string, string[]>
}

interface ReadableStorage {
  getItem(key: string): string | null
}

export function readMessageVisibilityPreferences(storage: ReadableStorage): MessageVisibilityPreferences {
  const fallback: MessageVisibilityPreferences = { version: 1, deletionBoundaryAcknowledged: false, hiddenBySession: {} }
  const saved = storage.getItem(messageVisibilityStorageKey)
  if (!saved) return fallback
  try {
    const value = JSON.parse(saved) as { version?: unknown; deletionBoundaryAcknowledged?: unknown; hiddenBySession?: unknown }
    if (value.version !== 1 || !value.hiddenBySession || typeof value.hiddenBySession !== "object" || Array.isArray(value.hiddenBySession)) return fallback
    const hiddenBySession = Object.entries(value.hiddenBySession).reduce<Record<string, string[]>>((result, [sessionId, itemIds]) => {
      if (!sessionId.trim() || ["__proto__", "constructor", "prototype"].includes(sessionId) || !Array.isArray(itemIds)) return result
      result[sessionId] = [...new Set(itemIds.filter((itemId): itemId is string => typeof itemId === "string" && isStableUserMessageId(itemId)))]
      return result
    }, {})
    return { version: 1, deletionBoundaryAcknowledged: value.deletionBoundaryAcknowledged === true, hiddenBySession }
  } catch {
    return fallback
  }
}

export function hideUserMessage(preferences: MessageVisibilityPreferences, sessionId: string, itemId: string) {
  requireVisibilityIdentity(sessionId, itemId)
  return {
    ...preferences,
    hiddenBySession: {
      ...preferences.hiddenBySession,
      [sessionId]: [...new Set([...(preferences.hiddenBySession[sessionId] ?? []), itemId])],
    },
  }
}

export function restoreUserMessage(preferences: MessageVisibilityPreferences, sessionId: string, itemId: string) {
  requireVisibilityIdentity(sessionId, itemId)
  return {
    ...preferences,
    hiddenBySession: {
      ...preferences.hiddenBySession,
      [sessionId]: (preferences.hiddenBySession[sessionId] ?? []).filter((hiddenId) => hiddenId !== itemId),
    },
  }
}

export function acknowledgeDeletionBoundary(preferences: MessageVisibilityPreferences) {
  return { ...preferences, deletionBoundaryAcknowledged: true }
}

export function visibleTimeline(items: readonly TimelineItem[], preferences: MessageVisibilityPreferences, sessionId?: string) {
  if (!sessionId) return [...items]
  const hidden = new Set(preferences.hiddenBySession[sessionId] ?? [])
  return items.filter((item) => item.kind !== "message" || item.presentation !== "user" || !hidden.has(item.itemId))
}

export function isStableUserMessageId(itemId: string) {
  return itemId.startsWith("message:") && itemId.length > "message:".length
}

function requireVisibilityIdentity(sessionId: string, itemId: string) {
  if (!sessionId.trim() || !isStableUserMessageId(itemId)) throw new Error("message_visibility_invalid: a persisted session and stable user message ID are required")
}
