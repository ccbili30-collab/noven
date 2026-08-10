import { describe, expect, test } from "bun:test"
import { requirePerformanceFirstBrief, validatePostWriteExtraction, validatePublicWorldBody } from "../src"

describe("Growth World Pro V4 performance-first writing", () => {
  test("accepts sparse material and treats genre data as suggestions", () => {
    const brief = requirePerformanceFirstBrief({
      schemaVersion: 4,
      objectId: "entry-1",
      purpose: "写出一篇有空间感的港口地理志",
      materialPaths: ["世界/世界基准.md"],
      lockedFacts: [{ id: "locked-1", text: "白崖港位于大陆西岸", sourcePaths: ["世界/世界基准.md"] }],
      genreSuggestions: { primary: "区域地理志", alternatives: ["旅行纪行"], techniques: ["由海面进入街巷"], avoid: ["百科条目堆叠"] },
    }, new Set(["世界/世界基准.md"]))

    expect(brief.lockedFacts).toHaveLength(1)
    expect(brief.genreSuggestions.alternatives).toEqual(["旅行纪行"])
    expect(brief).not.toHaveProperty("criticalGaps")
    expect(brief).not.toHaveProperty("contentCards")
  })

  test("adds trusted identity and provenance only after a public body exists", () => {
    const body = "# 白崖港\n\n白崖港位于大陆西岸。潮线之上，新建的红盐灯塔在冬季引导归航船只。"
    validatePublicWorldBody(body)
    const extraction = validatePostWriteExtraction({
      facts: [
        { id: "fact-source", text: "白崖港位于大陆西岸" },
        { id: "fact-derived", text: "港区依赖冬季灯塔维持航运" },
        { id: "fact-created", text: "灯塔使用红盐作为灯芯" },
      ],
      relations: [{ fromFactId: "fact-created", toFactId: "fact-derived", type: "supports", reason: "红盐灯芯使冬季引航持续" }],
      contradictions: [],
      lockedFactConflicts: [],
    }, { objectId: "entry-1", bodySha256: "body-hash", body })

    expect(extraction).toMatchObject({ schemaVersion: 4, objectId: "entry-1", bodySha256: "body-hash" })
    expect(extraction.facts.every((fact) => fact.sourceLevel === "created" && fact.sourcePaths.length === 0)).toBe(true)
    expect(extraction.relations).toHaveLength(1)
  })

  test("fails closed for public production labels and declared contradictions", () => {
    expect(() => validatePublicWorldBody("# 正文\n\nsource: created\ncriticalGap: none")).toThrow("production labels")
    expect(() => validatePublicWorldBody("# 卷首：先问五件事\n\n1. 这座山是否真实存在？")).toThrow("self-questioning scaffolding")
    expect(() => validatePublicWorldBody("# 对象定位\n\n现有事实支持这座城位于北方。")).toThrow("editorial or production scaffolding")
    expect(() => validatePublicWorldBody("# 山脉\n\n在现实世界中，这里本应存在另一块大陆。")).toThrow("external creative framing")
    expect(() => validatePublicWorldBody("# 山脉\n\n在这个世界里，群山把北风挡在峡谷之外，本世界的商旅因此沿南坡通行。")).not.toThrow()
    expect(() => validatePublicWorldBody("# 山脉\n\n无法读取的字符：�")).toThrow("invalid UTF-8")
    expect(() => validatePostWriteExtraction({
      facts: [],
      relations: [],
      contradictions: ["同一事件中人物年龄前后不一"],
      lockedFactConflicts: [],
    }, { objectId: "entry-1", bodySha256: "body-hash", body: "# 正文\n\n人物在同一事件中的年龄出现冲突。" })).toThrow("within-article contradiction")
  })
})
