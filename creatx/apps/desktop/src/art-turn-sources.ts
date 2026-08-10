import { createHash } from "node:crypto"
import type { ArtTurnImageSnapshot } from "./attachments"

export class ArtTurnSourceStore {
  private readonly sessions = new Map<string, ArtTurnImageSnapshot[]>()

  stage(sessionIdInput: string, snapshots: readonly ArtTurnImageSnapshot[]) {
    const sessionId = requireSessionId(sessionIdInput)
    if (this.sessions.has(sessionId)) throw new Error("art_library_conflict: session already has an active turn image snapshot")
    const images = snapshots.map((snapshot, index) => {
      if (snapshot.index !== index || !snapshot.displayName.trim() || (snapshot.mediaType !== "image/png" && snapshot.mediaType !== "image/jpeg")) throw new Error("attachment_invalid: current turn image snapshot is invalid")
      const bytes = new Uint8Array(snapshot.bytes)
      if (createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256) throw new Error("attachment_invalid: current turn image snapshot hash differs")
      return { ...snapshot, bytes }
    })
    this.sessions.set(sessionId, images)
  }

  read(sessionIdInput: string, index: number) {
    const sessionId = requireSessionId(sessionIdInput)
    if (!Number.isInteger(index) || index < 0) throw new Error("art_library_invalid: current turn image index is invalid")
    const snapshot = this.sessions.get(sessionId)?.[index]
    if (!snapshot) throw new Error("art_library_missing: current turn image is unavailable")
    return { ...snapshot, bytes: new Uint8Array(snapshot.bytes) }
  }

  clear(sessionIdInput: string) {
    this.sessions.delete(requireSessionId(sessionIdInput))
  }

  clearAll() {
    this.sessions.clear()
  }
}

export async function withArtTurnSources<T>(store: ArtTurnSourceStore, sessionId: string, snapshots: readonly ArtTurnImageSnapshot[], execute: () => Promise<T>) {
  if (!snapshots.length) return execute()
  store.stage(sessionId, snapshots)
  try {
    return await execute()
  } finally {
    store.clear(sessionId)
  }
}

function requireSessionId(input: string) {
  if (typeof input !== "string" || !input.trim()) throw new Error("session_missing: current turn image has no session")
  return input.trim()
}
