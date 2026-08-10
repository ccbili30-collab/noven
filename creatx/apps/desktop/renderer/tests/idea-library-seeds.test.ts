import { describe, expect, test } from "bun:test"
import { classifyIdeaSentence, filterIdeaLibrarySeeds, ideaLibraryCategories, ideaLibrarySeeds, localIdeaHeat, rankIdeasByLocalHeat } from "../src/idea-library-seeds"

describe("idea library starter samples", () => {
  test("keeps 50 inspirations and 50 fantasies with traceable sources", () => {
    expect(ideaLibraryCategories).toEqual(["启发", "幻想"])
    expect(ideaLibrarySeeds).toHaveLength(100)
    expect(new Set(ideaLibrarySeeds.map((idea) => idea.id)).size).toBe(100)
    expect(new Set(ideaLibrarySeeds.map((idea) => idea.sentence)).size).toBe(100)
    expect(ideaLibrarySeeds.filter((idea) => classifyIdeaSentence(idea.sentence) === "启发")).toHaveLength(50)
    expect(ideaLibrarySeeds.filter((idea) => classifyIdeaSentence(idea.sentence) === "幻想")).toHaveLength(50)
    for (const idea of ideaLibrarySeeds) {
      expect(/[。？?]$/.test(idea.sentence)).toBe(true)
      expect(idea.sentence.length).toBeGreaterThan(20)
      if (idea.sourceType !== "user-conversation") expect(idea.sourceUrl?.startsWith("https://")).toBe(true)
      expect(idea.sourceTitle.length).toBeGreaterThan(0)
      expect(idea.status).toBe("starter-sample")
      expect(idea.category).toBe(classifyIdeaSentence(idea.sentence))
    }
  })

  test("classifies questions as inspirations and statements as fantasies", () => {
    expect(classifyIdeaSentence("如果全世界听见一句话，你会说什么？")).toBe("启发")
    expect(classifyIdeaSentence("我穿越到一座没有夜晚的异世界。")).toBe("幻想")
    expect(filterIdeaLibrarySeeds("全人类", "启发").map((idea) => idea.id)).toEqual(["idea-026"])
    expect(filterIdeaLibrarySeeds("荒漠行星", "幻想").map((idea) => idea.id)).toEqual(["idea-001"])
    expect(filterIdeaLibrarySeeds("明朝船队", "幻想")).toEqual([])
  })

  test("ranks by local saves then likes without inventing public heat", () => {
    const ideas = [{ id: "first" }, { id: "second" }, { id: "third" }]
    const reactions = [
      { kind: "idea" as const, itemId: "first", liked: true, saved: false },
      { kind: "idea" as const, itemId: "second", liked: false, saved: true },
    ]
    expect(localIdeaHeat(reactions[0])).toBe(1)
    expect(localIdeaHeat(reactions[1])).toBe(2)
    expect(rankIdeasByLocalHeat(ideas, reactions).map((idea) => idea.id)).toEqual(["second", "first", "third"])
  })
})
