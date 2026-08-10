import { describe, expect, test } from "bun:test"
import { filterHeritageLibrarySeeds, heritageLibraryCategories, heritageLibraryCatalogVersion, heritageLibraryFilters, heritageLibraryPlatforms, heritageLibrarySeeds } from "../src/heritage-library-seeds"

describe("heritage library catalog", () => {
  test("loads a versioned twenty-item catalog split evenly across four creative uses", () => {
    expect(heritageLibraryCatalogVersion).toBe(2)
    expect(heritageLibrarySeeds).toHaveLength(20)
    expect(heritageLibraryCategories).toEqual(["全部", "OC创作", "艺术欣赏", "世界观", "图画创作"])
    expect(heritageLibraryPlatforms[0]).toBe("全部")
    expect(new Set(heritageLibrarySeeds.map((item) => item.id)).size).toBe(20)
    for (const category of heritageLibraryCategories.slice(1)) {
      expect(heritageLibrarySeeds.filter((item) => item.category === category)).toHaveLength(5)
      const filtered = filterHeritageLibrarySeeds("", category, "全部")
      expect(filtered[0]?.learningEvidence).toMatchObject({ kind: "ted-transcript", language: "en" })
      expect(filtered.filter((item) => item.learningEvidence)).toHaveLength(1)
    }
    expect(heritageLibrarySeeds.filter((item) => item.learningEvidence)).toHaveLength(4)
    for (const item of heritageLibrarySeeds) {
      expect(item.sourceUrl).toStartWith("https://")
      expect(item.verifiedAt).toMatch(/^2026-08-(09|10)$/u)
      expect(item.analysisPreview.length).toBeGreaterThan(20)
      expect(item.skillDirection.length).toBeGreaterThan(4)
      expect(item.analysisPreview).not.toMatch(/从题目看|可能适合|仍需读取|具体结论需/u)
      if (item.learningEvidence) {
        expect(item.sourceUrl).toStartWith("https://www.ted.com/talks/")
        expect(item.learningEvidence.transcriptUrl).toBe(`${item.sourceUrl}?view=transcript`)
        expect(item.learningEvidence.cueCount).toBeGreaterThan(100)
      }
    }
  })

  test("filters by source, category, title, author, and skill direction", () => {
    const source = heritageLibrarySeeds[0]!.platform
    expect(filterHeritageLibrarySeeds("", "全部", source).every((item) => item.platform === source)).toBe(true)
    expect(filterHeritageLibrarySeeds("", "艺术欣赏", "全部")).toHaveLength(5)
    expect(filterHeritageLibrarySeeds("角色", "全部", "全部").length).toBeGreaterThan(0)
  })

  test("keeps imported personal categories and sources reachable without mutating the built-in catalog", () => {
    expect(heritageLibraryFilters([{ category: "用户分类", platform: "本机导入" }])).toMatchObject({
      categories: ["全部", "OC创作", "艺术欣赏", "世界观", "图画创作", "用户分类"],
      platforms: expect.arrayContaining(["全部", "本机导入"]),
    })
    expect(heritageLibraryCategories).not.toContain("用户分类")
  })
})
