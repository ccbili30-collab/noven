import { describe, expect, test } from "bun:test"
import { WORLD_BLUEPRINT_LAYERS, type WorldBlueprintObject } from "../src/schema.ts"
import {
  PUBLICATION_GENRE_LIBRARY,
  publicationGenre,
  publicationGenreKeys,
} from "../src/publication-genres.ts"
import {
  TOPIC_GENRE_PROFILES,
  topicGenreCandidates,
} from "../src/topic-genre-profiles.ts"
import {
  hashWritingContract,
  resolveWritingContract,
  type WorldStyleProfile,
} from "../src/writing-contract.ts"

const historicalStyle: WorldStyleProfile = {
  schemaVersion: 1,
  narrativeDistance: "historical",
  register: "literary",
  knowledgePosition: "retrospective",
  languageConventions: ["使用世界内部纪年", "让制度变化落到人物行动"],
  forbiddenPatterns: ["现代项目管理术语"],
  sourceIds: ["source-user"],
}

describe("world writing contract", () => {
  test("keeps one globally unique publication genre library across all twelve layers", () => {
    expect(Object.keys(PUBLICATION_GENRE_LIBRARY)).toEqual([...WORLD_BLUEPRINT_LAYERS])
    const keys = WORLD_BLUEPRINT_LAYERS.flatMap((layer) => publicationGenreKeys(layer))
    expect(new Set(keys).size).toBe(keys.length)
    for (const layer of WORLD_BLUEPRINT_LAYERS) {
      expect(publicationGenre(layer, PUBLICATION_GENRE_LIBRARY[layer].defaultGenreKey).key).toBe(PUBLICATION_GENRE_LIBRARY[layer].defaultGenreKey)
    }
  })

  test("lets topic profiles rank only genres already allowed by the layer", () => {
    expect(Object.keys(TOPIC_GENRE_PROFILES).length).toBeGreaterThanOrEqual(30)
    expect(TOPIC_GENRE_PROFILES["chinese-xianxia"].label).toBe("中式修仙")
    for (const profile of Object.values(TOPIC_GENRE_PROFILES)) {
      for (const layer of WORLD_BLUEPRINT_LAYERS) {
        const candidates = topicGenreCandidates(profile.key, layer)
        expect(candidates.length).toBe(publicationGenreKeys(layer).length)
        expect(new Set(candidates)).toEqual(new Set(publicationGenreKeys(layer)))
      }
    }

    expect(topicGenreCandidates("classic-medieval-fantasy", "历史、时代与重大事件")).not.toEqual(
      topicGenreCandidates("hard-science-fiction", "历史、时代与重大事件"),
    )
    expect(() => topicGenreCandidates("unknown-topic", "历史、时代与重大事件")).toThrow("topic profile")
  })

  test("lets world style modify language without changing the frozen publication genre", () => {
    const object = historyObject("legendary-chronicle")
    const oral = resolveWritingContract({
      topicProfileKey: "classic-medieval-fantasy",
      worldStyleProfile: { ...historicalStyle, register: "oral", languageConventions: ["保留口述重复与地方称谓"] },
      object,
    })
    const documentary = resolveWritingContract({
      topicProfileKey: "classic-medieval-fantasy",
      worldStyleProfile: { ...historicalStyle, register: "documentary", languageConventions: ["使用克制的档案语汇"] },
      object,
    })

    expect(oral.genreKey).toBe("legendary-chronicle")
    expect(documentary.genreKey).toBe("legendary-chronicle")
    expect(oral.structure).toEqual(documentary.structure)
    expect(oral.researchDimensions).toEqual(documentary.researchDimensions)
    expect(oral.worldStyle.register).toBe("oral")
    expect(documentary.worldStyle.register).toBe("documentary")
    expect(hashWritingContract(oral)).not.toBe(hashWritingContract(documentary))
    expect(hashWritingContract(oral)).toBe(hashWritingContract(JSON.parse(JSON.stringify(oral))))
  })

  test("fails closed for a genre outside the layer or topic candidate set", () => {
    expect(() => resolveWritingContract({
      topicProfileKey: "classic-medieval-fantasy",
      worldStyleProfile: historicalStyle,
      object: historyObject("city-portrait"),
    })).toThrow("genreKey")
  })
})

function historyObject(genreKey: string): WorldBlueprintObject & { genreKey: string } {
  return {
    id: "history-ashes",
    key: "history:ashes",
    title: "灰烬起义",
    layer: "历史、时代与重大事件",
    kind: "entry",
    parentId: null,
    plannedPath: "阿斯特拉恩/历史、时代与重大事件/灰烬起义.md",
    genreKey,
    locator: "改变旧秩序并留下共同记忆的起义",
    order: 1,
    status: "planned",
  }
}
