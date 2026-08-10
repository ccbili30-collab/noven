import type { CreativeLibraryReaction } from "@creatx/contracts"
import { onlineFantasySeeds, onlineInspirationSeeds } from "./idea-library-online-seeds"

export const ideaLibraryCategories = ["启发", "幻想"] as const

export type IdeaLibraryCategory = (typeof ideaLibraryCategories)[number]

export interface IdeaLibrarySeed {
  id: string
  sentence: string
  category: IdeaLibraryCategory
  tags: string[]
  sourceUrl?: string
  sourceTitle: string
  sourceType: "public-article" | "encyclopedia-entry" | "user-conversation"
  collectedAt: string
  status: "starter-sample"
  notes: string
}

const collectedAt = "2026-08-05T00:00:00.000+08:00"

export const ideaLibrarySeeds: IdeaLibrarySeed[] = [
  {
    id: "idea-026",
    sentence: "如果通过心灵感应让全球七十八亿人同时听到一句话，你会说什么？",
    category: "启发",
    tags: ["心灵感应", "全人类", "一句话"],
    sourceTitle: "用户共创讨论",
    sourceType: "user-conversation",
    collectedAt,
    status: "starter-sample",
    notes: "以一句同时抵达全人类的话引出用户自己的回答。",
  },
  {
    id: "idea-027",
    sentence: "假如明朝的船队率先抵达欧洲，整个世界会怎样发展？",
    category: "启发",
    tags: ["明朝船队", "欧洲", "历史分叉"],
    sourceTitle: "用户共创讨论",
    sourceType: "user-conversation",
    collectedAt,
    status: "starter-sample",
    notes: "以航海方向变化引出开放式历史推演。",
  },
  ...onlineInspirationSeeds,
  {
    id: "idea-001",
    sentence: "一栋普通住宅的前门突然通向另一颗荒漠行星，房主必须面对移民潮、边境法律、天气交易和围绕这扇门展开的国际争夺。",
    category: "幻想",
    tags: ["星际门户", "住宅", "边境"],
    sourceUrl: "https://en.wikipedia.org/wiki/The_Big_Front_Yard",
    sourceTitle: "The Big Front Yard",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "保留普通住宅入口连接外星世界及其社会后果。",
  },
  {
    id: "idea-002",
    sentence: "人类的寿命从来没有超过三十五岁，因此每一代人都还没来得及完成自己的事业，国家、家庭和文明便不断交给下一批年轻人接手。",
    category: "幻想",
    tags: ["寿命", "代际", "文明"],
    sourceUrl: "https://www.scifiideas.com/posts/50-ideas-for-alternate-history-scenarios/",
    sourceTitle: "50 Ideas for Alternate History Scenarios",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "以普遍短寿改变代际权力和文明积累。",
  },
  {
    id: "idea-003",
    sentence: "这个世界从未出现过马匹，古代帝国只能依靠运河、牛车、巨型鸟类或其他被驯化的生物运输粮食、军队和消息。",
    category: "幻想",
    tags: ["无马文明", "交通", "帝国"],
    sourceUrl: "https://www.scifiideas.com/posts/50-ideas-for-alternate-history-scenarios/",
    sourceTitle: "50 Ideas for Alternate History Scenarios",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "从缺少马匹推演运输、战争和帝国组织。",
  },
  {
    id: "idea-004",
    sentence: "地球没有月亮，却在夜空中拥有一颗可以居住的邻近行星，潮汐、历法、宗教、航海和人类对于‘世界边界’的理解因此完全不同。",
    category: "幻想",
    tags: ["无月地球", "邻近行星", "天文学"],
    sourceUrl: "https://www.scifiideas.com/posts/50-ideas-for-alternate-history-scenarios/",
    sourceTitle: "50 Ideas for Alternate History Scenarios",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "用可居住邻星替代月亮并推演文明基础。",
  },
  {
    id: "idea-005",
    sentence: "火焰魔法并不是凭空制造热量，而是从施法者和周围环境中借走热量，所以每一次点燃火焰都可能让施法者冻伤，甚至让整个村庄提前进入寒冬。",
    category: "幻想",
    tags: ["火焰魔法", "能量守恒", "代价"],
    sourceUrl: "https://natefoy.com/2025/05/20/using-real-world-science-as-inspiration-for-fantasy-world-building/",
    sourceTitle: "Using Real-World Science as Inspiration for Fantasy World-Building",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "以热量转移为火焰魔法建立可感知代价。",
  },
  {
    id: "idea-006",
    sentence: "世界各地的地壳断层会持续泄漏魔力，火山附近因此拥有最肥沃的土地、最强大的法师和最频繁发生的战争。",
    category: "幻想",
    tags: ["地质", "魔力", "资源战争"],
    sourceUrl: "https://natefoy.com/2025/05/20/using-real-world-science-as-inspiration-for-fantasy-world-building/",
    sourceTitle: "Using Real-World Science as Inspiration for Fantasy World-Building",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "把地质活动、魔力资源和战争连成因果。",
  },
  {
    id: "idea-007",
    sentence: "一片会在夜间发光的森林里，植物、昆虫和大型动物形成了精密的共生网络，住在那里的人类必须按照花粉季、光周期和迁徙路线安排农业、婚姻与法律。",
    category: "幻想",
    tags: ["发光森林", "共生", "社会制度"],
    sourceUrl: "https://natefoy.com/2025/05/20/using-real-world-science-as-inspiration-for-fantasy-world-building/",
    sourceTitle: "Using Real-World Science as Inspiration for Fantasy World-Building",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "由生态周期推演人类制度和日常生活。",
  },
  {
    id: "idea-008",
    sentence: "第一次世界大战没有发展出坦克，各国却制造了能够钻入山脉、掘穿战壕并把整条前线拖入地下的巨型机械。",
    category: "幻想",
    tags: ["一战", "地下机械", "战争技术"],
    sourceUrl: "https://www.eabaker.org/post/how-to-write-what-if-alt-history",
    sourceTitle: "How to Write What-If Alternate History",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "替换一战关键技术路径并保留战场后果。",
  },
  {
    id: "idea-009",
    sentence: "尼安德特人没有灭绝，而是与现代人类一起建立了城市、国家和宗教，几千年来双方始终在争论谁才有资格解释人类的起源。",
    category: "幻想",
    tags: ["尼安德特人", "共存", "宗教"],
    sourceUrl: "https://www.scifiideas.com/posts/50-ideas-for-alternate-history-scenarios/",
    sourceTitle: "50 Ideas for Alternate History Scenarios",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "延续另一人种并推演身份与历史解释权。",
  },
  {
    id: "idea-010",
    sentence: "一座城市的道路、医院、港口和司法权并不属于政府，而是由一代代拥有不同超自然能力的守护者家族继承，每次继承都会重新改变城市的秩序。",
    category: "幻想",
    tags: ["守护者家族", "城市权力", "继承"],
    sourceUrl: "https://academy.worldanvil.com/blog/worldbuilding-an-alternate-earth-setting",
    sourceTitle: "Worldbuilding an Alternate Earth Setting",
    sourceType: "public-article",
    collectedAt,
    status: "starter-sample",
    notes: "把超能力家族继承与城市公共权力结合。",
  },
  {
    id: "idea-011",
    sentence: "一座饥荒中的城市突然出现无法停止的舞者，议会为了‘治好’他们雇来乐师并搭建舞台，却让越来越多的市民在鼓声中加入这场持续数月的集体狂热。",
    category: "幻想",
    tags: ["舞蹈瘟疫", "城市", "集体狂热"],
    sourceUrl: "https://en.wikipedia.org/wiki/Dancing_plague_of_1518",
    sourceTitle: "Dancing plague of 1518",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据斯特拉斯堡舞蹈瘟疫及当局应对重新组织。",
  },
  {
    id: "idea-012",
    sentence: "遥远火山的一次喷发让整个北方失去夏天，粮仓、婚约和王位继承都在连续霜冻中崩溃，而没有人知道灾难真正来自海洋另一端。",
    category: "幻想",
    tags: ["火山冬季", "饥荒", "王位"],
    sourceUrl: "https://en.wikipedia.org/wiki/Year_Without_a_Summer",
    sourceTitle: "Year Without a Summer",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据坦博拉喷发后的全球降温和歉收重新组织。",
  },
  {
    id: "idea-013",
    sentence: "一名退役将军凭借地图、债券和一本精美国情手册卖出了一个并不存在的国家，直到第一批移民携家带口抵达那片只有密林和坟墓的海岸。",
    category: "幻想",
    tags: ["骗局", "虚构国家", "移民"],
    sourceUrl: "https://en.wikipedia.org/wiki/Gregor_MacGregor",
    sourceTitle: "Gregor MacGregor",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据波亚伊斯骗局及移民抵达后的后果重新组织。",
  },
  {
    id: "idea-014",
    sentence: "城市中心储存炼金糖浆的巨塔在冬日中突然破裂，黏稠浪潮吞没街巷后，幸存者发现糖浆吸收了死者最后一刻的记忆。",
    category: "幻想",
    tags: ["城市灾难", "炼金", "记忆"],
    sourceUrl: "https://en.wikipedia.org/wiki/Great_Molasses_Flood",
    sourceTitle: "Great Molasses Flood",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "糖蜜洪灾为现实触发点，记忆效果为重新创作。",
  },
  {
    id: "idea-015",
    sentence: "一艘仍能航行的商船带着食物、货物和船长一家留下的生活痕迹独自在海上漂流，唯独救生艇与所有活人不见了。",
    category: "幻想",
    tags: ["幽灵船", "失踪", "航海"],
    sourceUrl: "https://en.wikipedia.org/wiki/Mary_Celeste",
    sourceTitle: "Mary Celeste",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据船只基本适航但全员失踪的事实重新组织。",
  },
  {
    id: "idea-016",
    sentence: "新教皇把死去九个月的前任从墓中挖出受审，并宣布他生前签署的一切法令无效，于是整个国家开始争夺哪些婚姻、爵位和赦免仍然算数。",
    category: "幻想",
    tags: ["尸体审判", "宗教", "法律"],
    sourceUrl: "https://en.wikipedia.org/wiki/Cadaver_Synod",
    sourceTitle: "Cadaver Synod",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据尸体审判及追溯否定前任任职重新组织。",
  },
  {
    id: "idea-017",
    sentence: "一座自由城市的居民在黎明看见太阳周围爆发由球体、长矛和黑色三角组成的空战，但后世只能依靠一张木刻传单判断那究竟是天象、神迹还是战争。",
    category: "幻想",
    tags: ["天空异象", "木刻", "历史谜团"],
    sourceUrl: "https://en.wikipedia.org/wiki/1561_celestial_phenomenon_over_Nuremberg",
    sourceTitle: "1561 celestial phenomenon over Nuremberg",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据纽伦堡木刻传单记录的集体天空异象重新组织。",
  },
  {
    id: "idea-018",
    sentence: "山谷里的圣湖在夜间吐出一片看不见的沉重气体，低处村庄无声覆灭后，幸存者只能迁到高塔生活，并日夜聆听湖底再次翻身的声音。",
    category: "幻想",
    tags: ["湖底喷发", "高塔聚落", "灾难"],
    sourceUrl: "https://en.wikipedia.org/wiki/Lake_Nyos_disaster",
    sourceTitle: "Lake Nyos disaster",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据尼奥斯湖二氧化碳沿低地扩散的灾难重新组织。",
  },
  {
    id: "idea-019",
    sentence: "一座从未存在的岛屿因为航海日志和旧地图而被各国承认了数百年，当测量船终于前去删除它时，却收到岛上政府寄来的抗议信。",
    category: "幻想",
    tags: ["幽灵岛", "地图", "主权"],
    sourceUrl: "https://en.wikipedia.org/wiki/Phantom_island",
    sourceTitle: "Phantom island",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据错误观察和虚构岛屿长期留在地图上的现象重新组织。",
  },
  {
    id: "idea-020",
    sentence: "海底考古队发现北海之下埋着一整片曾连接诸国的故土，而那些被海水分开的民族至今仍在用不同语言讲述同一场逃亡。",
    category: "幻想",
    tags: ["沉没大陆", "迁徙", "共同记忆"],
    sourceUrl: "https://en.wikipedia.org/wiki/Doggerland",
    sourceTitle: "Doggerland",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据北海下被海平面淹没的陆地重新组织。",
  },
  {
    id: "idea-021",
    sentence: "一家报纸为了销量连续刊登月球城市、海岸和翼人社会的发现，数月后新望远镜看到的月面却开始逐项变成报道虚构出的模样。",
    category: "幻想",
    tags: ["月球", "报纸", "现实改写"],
    sourceUrl: "https://en.wikipedia.org/wiki/Great_Moon_Hoax",
    sourceTitle: "Great Moon Hoax",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据 1835 年报纸伪造月球文明报道重新创作。",
  },
  {
    id: "idea-022",
    sentence: "情报部门为一具无名尸体编造了军衔、恋人、债务和口袋里的车票，用他的死亡误导敌军，却没想到那个虚构恋人随后真的开始收到他的回信。",
    category: "幻想",
    tags: ["谍战", "虚构身份", "死者来信"],
    sourceUrl: "https://en.wikipedia.org/wiki/Operation_Mincemeat",
    sourceTitle: "Operation Mincemeat",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据尸体、虚构军官身份和伪造文件的军事欺骗重新创作。",
  },
  {
    id: "idea-023",
    sentence: "一个贫穷王国把全国积蓄押在连接两片大洋的热带殖民地上，远征失败后，破产的贵族只能用国家主权偿还普通人的投资。",
    category: "幻想",
    tags: ["殖民计划", "国家破产", "主权"],
    sourceUrl: "https://en.wikipedia.org/wiki/Darien_scheme",
    sourceTitle: "Darien scheme",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "依据苏格兰达连殖民计划的政治经济后果重新组织。",
  },
  {
    id: "idea-024",
    sentence: "边缘殖民地的人们把定期降落的无人货船视为祖先履行的古老承诺，只有负责维修信标的少女知道，母星早已停止发送任何船只。",
    category: "幻想",
    tags: ["殖民地", "货船", "信标少女"],
    sourceUrl: "https://en.wikipedia.org/wiki/Cargo_cult",
    sourceTitle: "Cargo cult",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "从殖民不平等环境中的货物与祖先归来信念谨慎转写。",
  },
  {
    id: "idea-025",
    sentence: "皇城军械库的一次不明爆炸摧毁了半座都城，皇帝禁止调查原因，却有一名工匠发现爆心留下的不是火药残渣，而是一座尚未建成的未来城区。",
    category: "幻想",
    tags: ["皇城", "爆炸", "未来遗迹"],
    sourceUrl: "https://en.wikipedia.org/wiki/Wanggongchang_Explosion",
    sourceTitle: "Wanggongchang Explosion",
    sourceType: "encyclopedia-entry",
    collectedAt,
    status: "starter-sample",
    notes: "王恭厂爆炸和原因不明为现实触发点，未来城区为重新创作。",
  },
  ...onlineFantasySeeds,
]

export function classifyIdeaSentence(sentence: string): IdeaLibraryCategory {
  return /[?？]\s*$/.test(sentence) ? "启发" : "幻想"
}

export function filterIdeaLibrarySeeds(query: string, category: IdeaLibraryCategory) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN")
  return ideaLibrarySeeds.filter((idea) => {
    if (classifyIdeaSentence(idea.sentence) !== category) return false
    if (!normalized) return true
    return idea.sentence.toLocaleLowerCase("zh-CN").includes(normalized)
      || idea.tags.some((tag) => tag.toLocaleLowerCase("zh-CN").includes(normalized))
  })
}

export function localIdeaHeat(reaction: CreativeLibraryReaction | undefined) {
  return (reaction?.saved ? 2 : 0) + (reaction?.liked ? 1 : 0)
}

export function rankIdeasByLocalHeat<T extends { id: string }>(ideas: T[], reactions: CreativeLibraryReaction[]) {
  const originalOrder = new Map(ideas.map((idea, index) => [idea.id, index]))
  const reactionById = new Map(reactions.filter((reaction) => reaction.kind === "idea").map((reaction) => [reaction.itemId, reaction]))
  return [...ideas].sort((left, right) => localIdeaHeat(reactionById.get(right.id)) - localIdeaHeat(reactionById.get(left.id))
    || (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0))
}
