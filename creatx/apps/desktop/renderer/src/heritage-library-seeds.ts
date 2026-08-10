import catalogSource from "./heritage-library-catalog.v1.json"

export interface HeritageLibrarySeed {
  id: string
  platform: string
  category: string
  title: string
  author: string
  sourceUrl: string
  coverUrl?: string
  analysisPreview: string
  skillDirection: string
  verifiedAt: string
  learningEvidence?: {
    kind: "ted-transcript"
    transcriptUrl: string
    language: "en"
    cueCount: number
  }
}

interface HeritageLibraryCatalog {
  schemaVersion: number
  categories: string[]
  items: HeritageLibrarySeed[]
}

const catalog = catalogSource as HeritageLibraryCatalog
validateCatalog(catalog)

export const heritageLibraryCatalogVersion = catalog.schemaVersion
export const heritageLibrarySeeds = catalog.items
export const heritageLibraryCategories = ["全部", ...catalog.categories]
export const heritageLibraryPlatforms = ["全部", ...new Set(catalog.items.map((item) => item.platform))]
export type HeritageLibraryCategory = string
export type HeritageLibraryPlatform = string

export function filterHeritageLibrarySeeds(query: string, category: string, platform: string) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN")
  return heritageLibrarySeeds.filter((item) => {
    if (category !== "全部" && item.category !== category) return false
    if (platform !== "全部" && item.platform !== platform) return false
    if (!normalized) return true
    return [item.title, item.author, item.category, item.platform, item.skillDirection].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))
  }).sort((left, right) => Number(Boolean(right.learningEvidence)) - Number(Boolean(left.learningEvidence)))
}

export function heritageLibraryFilters(imported: readonly { category: string; platform: string }[]) {
  return {
    categories: ["全部", ...new Set([...catalog.categories, ...imported.map((item) => item.category)])],
    platforms: ["全部", ...new Set([...catalog.items.map((item) => item.platform), ...imported.map((item) => item.platform)])],
  }
}

function validateCatalog(input: HeritageLibraryCatalog) {
  if (input.schemaVersion !== 2 || input.items.length !== 20 || input.categories.length !== 4 || new Set(input.categories).size !== input.categories.length) {
    throw new Error("heritage_catalog_invalid")
  }
  const ids = new Set<string>()
  for (const item of input.items) {
    if (ids.has(item.id) || !input.categories.includes(item.category) || !item.sourceUrl.startsWith("https://") || !/^\d{4}-\d{2}-\d{2}$/u.test(item.verifiedAt)) {
      throw new Error("heritage_catalog_invalid")
    }
    if (item.learningEvidence && (item.learningEvidence.kind !== "ted-transcript" || item.learningEvidence.language !== "en" || item.learningEvidence.cueCount < 1 || item.learningEvidence.transcriptUrl !== `${item.sourceUrl}?view=transcript`)) throw new Error("heritage_catalog_invalid")
    ids.add(item.id)
  }
  if (input.categories.some((category) => input.items.filter((item) => item.category === category).length !== 5)) throw new Error("heritage_catalog_invalid")
}
