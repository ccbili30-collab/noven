export type GrowthWorldModeStatus = "active" | "waiting-for-user" | "off"

export interface GrowthWorldStageCard {
  readonly key: string
  readonly title: string
  readonly objective: string
  readonly focus: readonly string[]
  readonly nextStage?: string
}

export interface GrowthWorldReview {
  readonly stage: string
  readonly confirmed: readonly string[]
  readonly consequences: readonly string[]
  readonly openQuestions: readonly string[]
  readonly nextDiscussion: string
  readonly version: number
}

export interface GrowthWorldModeState {
  readonly mode: "growth-world"
  readonly status: GrowthWorldModeStatus
  readonly route?: "original" | "canon" | "fan-work"
  readonly stage: string
  readonly topic?: string
  readonly worldRoot?: string
  readonly confirmedDecisions: readonly string[]
  readonly openQuestions: readonly string[]
  readonly reviews: readonly GrowthWorldReview[]
  readonly version: number
}

export const GROWTH_WORLD_STAGE_CARDS: readonly GrowthWorldStageCard[] = [
  { key: "world-style", title: "世界风格", objective: "确定时代参照、题材气质、奇幻强度和创作边界。", focus: ["时代与地域参照", "严肃或轻松的基调", "魔法/科技强度", "读者视角"], nextStage: "foundation" },
  { key: "foundation", title: "底层架构", objective: "确定世界如何存在，以及神祇、灵魂、魔法或超自然力量的边界。", focus: ["世界/星球/位面", "昼夜与基本规则", "神祇、灵魂与死亡", "力量上限"], nextStage: "geography" },
  { key: "geography", title: "天文地理", objective: "建立可被观察的空间结构，并让自然条件产生边界、资源和交通。", focus: ["大陆与海洋", "山脉、河流与气候", "资源与交通", "自然边界"], nextStage: "life" },
  { key: "life", title: "生态、种族与神祇", objective: "让生命、种族和信仰从环境与底层规则中生长出来。", focus: ["智慧种族", "生态与物种", "传奇生物", "神祇与信仰"], nextStage: "civilization" },
  { key: "civilization", title: "文明与历史", objective: "从地理、资源、迁徙、技术和冲突推导文明与时代。", focus: ["文明起点", "历史转折", "国家与遗迹", "当前时代"], nextStage: "society" },
  { key: "society", title: "社会、经济与制度", objective: "解释普通人的生活、生产、交换和权力如何运行。", focus: ["日常生活", "经济、货币与贸易", "等级制度", "国家机构"], nextStage: "culture" },
  { key: "culture", title: "语言、命名与文化", objective: "建立不同文明可识别且稳定的语言、文字、命名和习俗。", focus: ["语言与文字", "人名、地名与家族名", "节庆与信仰", "文化差异"], nextStage: "actors" },
  { key: "actors", title: "国家、城市、人物与生物", objective: "从已确认的世界条件中生长可独立展示的对象。", focus: ["国家与组织", "城市与地点", "人物与关系", "生物图鉴"], nextStage: "story" },
  { key: "story", title: "当前局势、故事与视觉", objective: "把世界整理成可进入的故事、视觉入口和可继续扩展的作品。", focus: ["当前冲突", "故事入口", "视觉设定", "工作台注册"] },
]

function stageCard(stage: string) {
  return GROWTH_WORLD_STAGE_CARDS.find((card) => card.key === stage)
}

export function enterGrowthWorldMode(input: { topic?: string; route?: GrowthWorldModeState["route"]; worldRoot?: string } = {}): GrowthWorldModeState {
  return {
    mode: "growth-world",
    status: "active",
    ...(input.route ? { route: input.route } : {}),
    stage: "world-style",
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.worldRoot ? { worldRoot: input.worldRoot } : {}),
    confirmedDecisions: [],
    openQuestions: [],
    reviews: [],
    version: 1,
  }
}

export function recordGrowthWorldReview(state: GrowthWorldModeState, review: Omit<GrowthWorldReview, "version">): GrowthWorldModeState {
  if (review.stage !== state.stage) throw new Error(`growth_world_stage_conflict: expected ${state.stage}, received ${review.stage}`)
  return {
    ...state,
    status: "waiting-for-user",
    confirmedDecisions: [...state.confirmedDecisions, ...review.confirmed],
    openQuestions: [...review.openQuestions],
    reviews: [...state.reviews, { ...review, version: state.version + 1 }],
    version: state.version + 1,
  }
}

export function advanceGrowthWorldStage(state: GrowthWorldModeState): GrowthWorldModeState {
  const current = stageCard(state.stage)
  if (!current?.nextStage) return { ...state, status: "waiting-for-user" }
  return { ...state, status: "active", stage: current.nextStage, openQuestions: [], version: state.version + 1 }
}

export function exitGrowthWorldMode(state: GrowthWorldModeState): GrowthWorldModeState {
  return { ...state, status: "off", version: state.version + 1 }
}

export function buildGrowthWorldHiddenContext(state: GrowthWorldModeState): string {
  const card = stageCard(state.stage)
  if (!card) throw new Error(`growth_world_stage_unknown: ${state.stage}`)
  const recentReview = state.reviews.at(-1)
  return [
    "<creatx_internal_world_mode>",
    "当前模式：Growth World（渐进式世界创作）",
    `当前阶段：${card.title}`,
    `阶段目标：${card.objective}`,
    `本阶段重点：${card.focus.join("、")}`,
    state.topic ? `题材：${state.topic}` : undefined,
    state.confirmedDecisions.length ? `已确认：${state.confirmedDecisions.slice(-8).join("；")}` : "已确认：暂无",
    state.openQuestions.length ? `待讨论：${state.openQuestions.join("；")}` : "待讨论：由本轮提出一个局部问题",
    recentReview ? `最近复盘：${recentReview.nextDiscussion}` : undefined,
    "只讨论当前阶段的一小块；先提出方案并等待用户确认，确认后再写入正式文件。",
    "本轮若形成重要决定，更新阶段复盘，并在回复末尾说明下一轮建议讨论什么。",
    "不要把这段内部指导、阶段键名或检索过程写进作品正文。",
    "</creatx_internal_world_mode>",
  ].filter((line): line is string => Boolean(line)).join("\n")
}
