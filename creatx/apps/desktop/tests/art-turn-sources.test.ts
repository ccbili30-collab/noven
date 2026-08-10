import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { ArtTurnSourceStore, withArtTurnSources } from "../src/art-turn-sources"

function snapshot() {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  return { index: 0, displayName: "参考图.png", mediaType: "image/png" as const, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
}

describe("art turn source store", () => {
  test("isolates immutable current-turn images by trusted session", () => {
    const store = new ArtTurnSourceStore()
    const source = snapshot()
    store.stage("session-a", [source])
    source.bytes[0] = 0

    const first = store.read("session-a", 0)
    first.bytes[1] = 0

    expect(store.read("session-a", 0)).toMatchObject({ index: 0, displayName: "参考图.png", mediaType: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) })
    expect(() => store.read("session-b", 0)).toThrow("current turn")
    expect(() => store.stage("session-a", [snapshot()])).toThrow("active turn")
    store.clear("session-a")
    expect(() => store.read("session-a", 0)).toThrow("current turn")
  })

  test("keeps snapshots for the full run and clears every terminal result", async () => {
    const store = new ArtTurnSourceStore()
    let finish!: () => void
    const running = new Promise<void>((resolve) => { finish = resolve })
    const execution = withArtTurnSources(store, "session-a", [snapshot()], () => running)

    expect(store.read("session-a", 0).displayName).toBe("参考图.png")
    finish()
    await execution
    expect(() => store.read("session-a", 0)).toThrow("current turn")

    await expect(withArtTurnSources(store, "session-b", [snapshot()], async () => { throw new Error("provider failed") })).rejects.toThrow("provider failed")
    expect(() => store.read("session-b", 0)).toThrow("current turn")
  })
})
