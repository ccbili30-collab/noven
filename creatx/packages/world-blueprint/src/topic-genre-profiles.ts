import { PUBLICATION_GENRE_LIBRARY, publicationGenreKeys } from "./publication-genres.ts"
import { WORLD_BLUEPRINT_LAYERS, type WorldBlueprintLayer } from "./schema.ts"

export const TOPIC_GENRE_PROFILE_KEYS = [
  "classic-medieval-fantasy",
  "chinese-xianxia",
  "chinese-wuxia",
  "eastern-fantasy",
  "mythic-epic",
  "dark-fantasy",
  "low-fantasy",
  "heroic-fantasy",
  "fairy-tale",
  "folklore-fantasy",
  "urban-fantasy",
  "magic-academy",
  "steampunk-fantasy",
  "historical-fantasy",
  "ancient-alternate-history",
  "modern-alternate-history",
  "maritime-age-of-sail",
  "hard-science-fiction",
  "space-opera",
  "planetary-romance",
  "first-contact",
  "cyberpunk",
  "biopunk",
  "solarpunk",
  "dieselpunk",
  "post-apocalyptic",
  "dystopian",
  "utopian",
  "superhero",
  "cosmic-horror",
  "gothic-horror",
  "supernatural-horror",
  "weird-fiction",
  "modern-realism",
  "crime-noir",
  "political-thriller",
] as const

export type TopicGenreProfileKey = typeof TOPIC_GENRE_PROFILE_KEYS[number]

const TOPIC_GENRE_FAMILIES = {
  "historical-fantasy": {
    "核心规则与边界": ["natural-philosophy", "rulebook"],
    "经济、技术与力量体系": ["power-system", "craft-treatise", "economic-life"],
    "社会、文化与日常生活": ["customs", "social-history"],
    "国家、组织与权力": ["state-profile", "organization-profile"],
    "历史、时代与重大事件": ["narrative-history", "era-history", "document-history", "legendary-chronicle"],
    "故事、传说与叙事入口": ["legend-retelling", "story-entry"],
  },
  "cultivation-and-martial": {
    "核心规则与边界": ["natural-philosophy", "rulebook"],
    "宇宙、自然与地理": ["physical-atlas", "regional-gazetteer"],
    "生态、资源与物种": ["natural-history", "resource-survey"],
    "经济、技术与力量体系": ["power-system", "craft-treatise", "economic-life"],
    "社会、文化与日常生活": ["customs", "social-history"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["legendary-chronicle", "narrative-history", "era-history", "document-history"],
    "人物、关系与阵营": ["biography", "group-portrait"],
    "故事、传说与叙事入口": ["legend-retelling", "story-entry"],
  },
  "myth-and-folklore": {
    "核心规则与边界": ["natural-philosophy", "rulebook"],
    "生态、资源与物种": ["natural-history", "resource-survey"],
    "社会、文化与日常生活": ["customs", "social-history"],
    "历史、时代与重大事件": ["legendary-chronicle", "narrative-history", "era-history", "document-history"],
    "人物、关系与阵营": ["group-portrait", "biography"],
    "故事、传说与叙事入口": ["legend-retelling", "story-entry"],
    "视觉、地图与关系索引": ["visual-catalogue", "atlas-caption", "relation-index"],
  },
  "modern-speculative": {
    "核心规则与边界": ["rulebook", "natural-philosophy"],
    "经济、技术与力量体系": ["economic-life", "power-system", "craft-treatise"],
    "社会、文化与日常生活": ["social-history", "customs"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["document-history", "narrative-history", "era-history", "legendary-chronicle"],
    "当前局势与核心冲突": ["current-affairs", "situation-brief"],
    "人物、关系与阵营": ["group-portrait", "biography"],
    "故事、传说与叙事入口": ["story-entry", "legend-retelling"],
  },
  "science-fiction": {
    "核心规则与边界": ["rulebook", "natural-philosophy"],
    "宇宙、自然与地理": ["physical-atlas", "regional-gazetteer"],
    "生态、资源与物种": ["resource-survey", "natural-history"],
    "经济、技术与力量体系": ["craft-treatise", "economic-life", "power-system"],
    "社会、文化与日常生活": ["social-history", "customs"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["document-history", "narrative-history", "era-history", "legendary-chronicle"],
    "当前局势与核心冲突": ["situation-brief", "current-affairs"],
    "故事、传说与叙事入口": ["story-entry", "legend-retelling"],
    "视觉、地图与关系索引": ["relation-index", "atlas-caption", "visual-catalogue"],
  },
  "industrial-speculative": {
    "核心规则与边界": ["rulebook", "natural-philosophy"],
    "经济、技术与力量体系": ["craft-treatise", "economic-life", "power-system"],
    "社会、文化与日常生活": ["social-history", "customs"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["document-history", "narrative-history", "era-history", "legendary-chronicle"],
    "地区、城市与重要地点": ["city-portrait", "local-gazetteer"],
    "当前局势与核心冲突": ["current-affairs", "situation-brief"],
    "视觉、地图与关系索引": ["visual-catalogue", "atlas-caption", "relation-index"],
  },
  "collapse-and-reconstruction": {
    "核心规则与边界": ["rulebook", "natural-philosophy"],
    "生态、资源与物种": ["resource-survey", "natural-history"],
    "经济、技术与力量体系": ["economic-life", "craft-treatise", "power-system"],
    "社会、文化与日常生活": ["social-history", "customs"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["document-history", "era-history", "narrative-history", "legendary-chronicle"],
    "当前局势与核心冲突": ["situation-brief", "current-affairs"],
  },
  "horror-and-weird": {
    "核心规则与边界": ["natural-philosophy", "rulebook"],
    "宇宙、自然与地理": ["physical-atlas", "regional-gazetteer"],
    "生态、资源与物种": ["natural-history", "resource-survey"],
    "社会、文化与日常生活": ["customs", "social-history"],
    "历史、时代与重大事件": ["legendary-chronicle", "document-history", "narrative-history", "era-history"],
    "地区、城市与重要地点": ["local-gazetteer", "city-portrait"],
    "人物、关系与阵营": ["biography", "group-portrait"],
    "故事、传说与叙事入口": ["legend-retelling", "story-entry"],
  },
  "realist-and-thriller": {
    "经济、技术与力量体系": ["economic-life", "craft-treatise", "power-system"],
    "社会、文化与日常生活": ["social-history", "customs"],
    "国家、组织与权力": ["organization-profile", "state-profile"],
    "历史、时代与重大事件": ["document-history", "narrative-history", "era-history", "legendary-chronicle"],
    "地区、城市与重要地点": ["city-portrait", "local-gazetteer"],
    "当前局势与核心冲突": ["current-affairs", "situation-brief"],
    "人物、关系与阵营": ["group-portrait", "biography"],
    "故事、传说与叙事入口": ["story-entry", "legend-retelling"],
  },
} as const satisfies Record<string, Partial<Record<WorldBlueprintLayer, readonly string[]>>>

type TopicGenreFamilyKey = keyof typeof TOPIC_GENRE_FAMILIES

export interface TopicGenreProfile {
  key: TopicGenreProfileKey
  version: 1
  label: string
  appliesTo: string
  familyKey: TopicGenreFamilyKey
  preferences: Partial<Record<WorldBlueprintLayer, readonly string[]>>
}

const TOPIC_PROFILE_DEFINITIONS: Record<TopicGenreProfileKey, readonly [string, string, TopicGenreFamilyKey]> = {
  "classic-medieval-fantasy": ["经典中古奇幻", "中古剑与魔法、史诗奇幻和伪历史世界", "historical-fantasy"],
  "chinese-xianxia": ["中式修仙", "修炼文明、宗门、仙朝、洞天与超尺度东方奇观", "cultivation-and-martial"],
  "chinese-wuxia": ["中式武侠", "江湖门派、武艺传承、地方秩序与侠义冲突", "cultivation-and-martial"],
  "eastern-fantasy": ["东方幻想", "东方古典文化、异族神怪、王朝与地方传说", "cultivation-and-martial"],
  "mythic-epic": ["神话史诗", "神祇、英雄时代、创世传说与文明命运", "myth-and-folklore"],
  "dark-fantasy": ["黑暗奇幻", "腐败秩序、危险超自然力量和沉重历史", "historical-fantasy"],
  "low-fantasy": ["低魔奇幻", "稀少超自然力量与可信社会秩序并存的世界", "historical-fantasy"],
  "heroic-fantasy": ["英雄奇幻", "冒险者、边疆、古代遗产与个人英雄行动", "historical-fantasy"],
  "fairy-tale": ["童话", "奇异生灵、地方风俗、口传故事和寓意", "myth-and-folklore"],
  "folklore-fantasy": ["民俗幻想", "乡土传说、仪式、禁忌与地方共同体", "myth-and-folklore"],
  "urban-fantasy": ["都市奇幻", "现代城市社会中的隐秘超自然秩序", "modern-speculative"],
  "magic-academy": ["魔法学院", "教育机构、知识谱系、学生生活与力量训练", "modern-speculative"],
  "steampunk-fantasy": ["蒸汽幻想", "蒸汽工业、机械工艺与超自然力量交织", "industrial-speculative"],
  "historical-fantasy": ["历史幻想", "真实历史质感与受控幻想要素结合", "historical-fantasy"],
  "ancient-alternate-history": ["古代历史架空", "古代制度、战争、贸易和文明分岔", "historical-fantasy"],
  "modern-alternate-history": ["现代历史架空", "近现代制度、社会变化、档案与国际关系分岔", "modern-speculative"],
  "maritime-age-of-sail": ["航海时代", "远洋贸易、海权、殖民接触、港口和未知地理", "historical-fantasy"],
  "hard-science-fiction": ["硬科幻", "自然规律、工程约束、机构与任务历史", "science-fiction"],
  "space-opera": ["太空歌剧", "星际文明、舰队、帝国、外交与宏大战争", "science-fiction"],
  "planetary-romance": ["行星冒险", "异星地理、文明、探险和地方传奇", "science-fiction"],
  "first-contact": ["第一次接触", "陌生文明相遇、翻译、误解和制度冲击", "science-fiction"],
  "cyberpunk": ["赛博朋克", "高技术、巨型组织、城市阶层和身体改造", "industrial-speculative"],
  "biopunk": ["生物朋克", "生物工程、物种边界、专利权力与生态后果", "science-fiction"],
  "solarpunk": ["太阳朋克", "可持续技术、社区治理、修复生态与新生活方式", "science-fiction"],
  "dieselpunk": ["柴油朋克", "内燃工业、总体战、宣传机器与机械美学", "industrial-speculative"],
  "post-apocalyptic": ["末世废土", "文明崩溃后的资源、生存、迁徙与重建", "collapse-and-reconstruction"],
  "dystopian": ["反乌托邦", "制度控制、社会分层、监视与反抗", "collapse-and-reconstruction"],
  "utopian": ["乌托邦", "理想制度、日常运行、代价与内部张力", "modern-speculative"],
  "superhero": ["超级英雄", "公开或隐秘超能力、城市秩序、组织与公众反应", "modern-speculative"],
  "cosmic-horror": ["宇宙恐怖", "认知边界、不可理解存在与文明脆弱性", "horror-and-weird"],
  "gothic-horror": ["哥特恐怖", "衰败家族、古老建筑、秘密历史与幽暗氛围", "horror-and-weird"],
  "supernatural-horror": ["超自然恐怖", "鬼怪、诅咒、地方禁忌与调查", "horror-and-weird"],
  "weird-fiction": ["怪奇幻想", "异质自然、陌生规则与难以归类的现实裂缝", "horror-and-weird"],
  "modern-realism": ["现代现实", "现实社会、职业、家庭、地区与日常冲突", "realist-and-thriller"],
  "crime-noir": ["犯罪黑色", "城市犯罪、侦查、灰色组织与道德困境", "realist-and-thriller"],
  "political-thriller": ["政治惊悚", "权力机构、情报、危机决策与公共后果", "realist-and-thriller"],
}

export const TOPIC_GENRE_PROFILES = Object.fromEntries(TOPIC_GENRE_PROFILE_KEYS.map((key) => {
  const definition = TOPIC_PROFILE_DEFINITIONS[key]
  return [key, topicProfile(key, definition[0], definition[1], definition[2])]
})) as Record<TopicGenreProfileKey, TopicGenreProfile>

export function topicGenreProfile(key: string) {
  const profile = TOPIC_GENRE_PROFILES[key as TopicGenreProfileKey]
  if (!profile) throw new Error(`growth_invalid: topic profile ${key} is not registered`)
  return profile
}

export function topicGenreCandidates(key: string, layer: WorldBlueprintLayer) {
  const preferred = topicGenreProfile(key).preferences[layer] ?? []
  const allowed = publicationGenreKeys(layer)
  const invalid = preferred.find((genreKey) => !allowed.includes(genreKey))
  if (invalid) throw new Error(`growth_invalid: topic profile ${key} references genreKey ${invalid} outside layer ${layer}`)
  if (new Set(preferred).size !== preferred.length) throw new Error(`growth_invalid: topic profile ${key} repeats a genreKey for layer ${layer}`)
  return [...preferred, ...allowed.filter((genreKey) => !preferred.includes(genreKey))]
}

export const TOPIC_GENRE_BLUEPRINT_GUIDANCE = Object.values(TOPIC_GENRE_PROFILES)
  .map((profile) => `${profile.key}=${profile.label}（${profile.appliesTo}）`)
  .join("\n")

for (const profile of Object.values(TOPIC_GENRE_PROFILES)) {
  for (const layer of WORLD_BLUEPRINT_LAYERS) topicGenreCandidates(profile.key, layer)
}

if (Object.keys(PUBLICATION_GENRE_LIBRARY).length !== WORLD_BLUEPRINT_LAYERS.length) {
  throw new Error("growth_invalid: topic profiles require the complete publication genre library")
}

function topicProfile(key: TopicGenreProfileKey, label: string, appliesTo: string, familyKey: TopicGenreFamilyKey): TopicGenreProfile {
  return { key, version: 1, label, appliesTo, familyKey, preferences: TOPIC_GENRE_FAMILIES[familyKey] }
}
