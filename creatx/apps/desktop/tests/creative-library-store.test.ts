import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, test } from "bun:test"
import { CreativeLibraryStore } from "../src/creative-library-store"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("CreativeLibraryStore", () => {
  test("persists imported items, reactions, and art chat bindings", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-libraries-"))
    roots.push(root)
    const path = join(root, "libraries.json")
    const store = new CreativeLibraryStore(path)

    const imported = await store.import("idea", [{ sentence: "一扇门在每个雨夜通向不同年代。", author: "测试作者", category: "世界观" }])
    const item = imported.ideaItems[0]!
    await store.setReaction({ kind: "idea", itemId: item.id, reaction: "saved", value: true })
    await store.bindArtChat({ projectId: "project-1", sessionId: "session-1" })

    const reopened = await new CreativeLibraryStore(path).snapshot()
    expect(reopened.ideaItems).toHaveLength(1)
    expect(reopened.reactions).toEqual([{ kind: "idea", itemId: item.id, liked: false, saved: true }])
    expect(reopened.artChatSessions).toEqual({ "project-1": "session-1" })
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1)
  })

  test("rejects malformed imports without replacing valid state", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-libraries-"))
    roots.push(root)
    const path = join(root, "libraries.json")
    const store = new CreativeLibraryStore(path)
    await store.import("heritage", [{ title: "构图课程", sourceUrl: "https://example.com/video" }])

    await expect(store.import("heritage", [{ title: "缺少来源" }])).rejects.toThrow("library_invalid")
    expect((await store.snapshot()).heritageItems).toHaveLength(1)
  })

  test("deduplicates repeated imports and serializes concurrent reactions", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-libraries-"))
    roots.push(root)
    const store = new CreativeLibraryStore(join(root, "libraries.json"))
    const input = [{ sentence: "同一个点子不会因重复导入变成两张卡。", author: "测试作者" }]
    const first = await store.import("idea", input)
    await store.import("idea", input)
    await Promise.all([
      store.setReaction({ kind: "idea", itemId: first.ideaItems[0]!.id, reaction: "liked", value: true }),
      store.setReaction({ kind: "idea", itemId: first.ideaItems[0]!.id, reaction: "saved", value: true }),
    ])

    const snapshot = await store.snapshot()
    expect(snapshot.ideaItems).toHaveLength(1)
    expect(snapshot.reactions[0]).toMatchObject({ liked: true, saved: true })
  })

  test("fails closed when the persisted document is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-libraries-"))
    roots.push(root)
    const path = join(root, "libraries.json")
    await writeFile(path, "{broken", "utf8")

    await expect(new CreativeLibraryStore(path).snapshot()).rejects.toThrow("library_persistence")
  })
})
