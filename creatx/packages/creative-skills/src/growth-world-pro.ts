import {
  validateFrozenWorldBlueprintArtifacts,
  validateReviewWorldBlueprintArtifacts,
  WORLD_BLUEPRINT_LAYERS,
  WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS,
  type WorldBlueprintArtifactEvidence,
} from "@creatx/world-blueprint"
import type { GrowthWorkerProfile } from "@creatx/contracts"
import { GROWTH_WORLD_PRO_GOAL_PREFIX } from "./growth-goal-instruction.ts"

export const GROWTH_WORLD_PRO_SKILL_NAME = "creatx-growth-world-pro" as const
export const GROWTH_WORLD_PRO_STAGE_COUNT = 4
export const GROWTH_WORLD_PRO_WORLD_LAYERS = WORLD_BLUEPRINT_LAYERS
export const GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS = WORLD_BLUEPRINT_LAYER_MINIMUM_OBJECTS
export const GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS = { minimum: 10, maximum: 14 } as const
export const GROWTH_WORLD_PRO_BLUEPRINT_RELATION_TYPES = ["causes"] as const

const layerChecklist = GROWTH_WORLD_PRO_WORLD_LAYERS.map((layer, index) => `${index + 1}. ${layer}：通常规划 ${GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS.minimum} 至 ${GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS.maximum} 个正文 entry，按题材自然浮动`).join("\n")

export const GROWTH_WORLD_PRO_STAGES = [
  "路线、资料与世界方向：判断来源路线，记录当前可用资料边界，并确定世界前提、题材、主题与基调。",
  "十二层骨架：建立固定十二层入口、对象身份、父子层级、计划路径与候选文类建议，不写正式正文。",
  "全世界蓝图：扩充完整世界覆盖和必要因果；审查与冻结是本阶段的收尾门禁，不是独立创作阶段。",
  "自由物化：检索少量锁定事实和已完成正文，按文类建议自由写作，正文完成后抽取事实与实际关系。",
] as const

interface GrowthWorldProStageDecision {
  stageKey: "route-and-sources" | "twelve-layer-skeleton" | "world-blueprint-create" | "world-blueprint-confirm" | "free-materialization"
  executionMode?: "cline" | "world-materialization"
  stageInstruction: string
  waitAfterContinueReason?: string
  preventCompletion: boolean
  successfulReportOutcome?: "continue"
  workRootArtifactName?: string
  requireWorkRoot?: boolean
  requiredWorkbenchRoot?: boolean
  maxIterations?: number
  workerProfile?: GrowthWorkerProfile
  trustedArtifactSource?: "world-blueprint"
  validateArtifacts?: (artifacts: readonly WorldBlueprintArtifactEvidence[]) => string | undefined
}

export function growthWorldProStagePolicy(instruction: string, completedReports: number, workRootPath?: string, worldEntryStage?: "blueprint-create" | "blueprint-review" | "materialization", worldEntryMode?: "create" | "continue" | "reconcile"): GrowthWorldProStageDecision | undefined {
  if (!instruction.startsWith(GROWTH_WORLD_PRO_GOAL_PREFIX)) return undefined
  const reviewing = worldEntryStage === "blueprint-review"
  const confirming = reviewing || worldEntryStage !== "materialization" && completedReports === 3
  const stage = worldEntryStage === "materialization" ? 3 : reviewing ? 2 : completedReports >= 4 ? 3 : Math.min(completedReports, 2)
  if (stage === 0) {
    return {
      stageKey: "route-and-sources",
      stageInstruction: `这是 Growth World Pro 产品阶段一：路线、资料与世界方向。判断 original / canon / fanwork，读取当前可获得的用户、项目和外部资料，记录资料边界，并确定世界前提、题材、主题和基调。资料不足只记录边界，不得产生 criticalGap 或阻塞创作。${worldEntryMode === "continue" ? "先 inspect 已有权威状态，禁止再次 initialize 或覆盖作品根。" : "调用 write_world_blueprint action=initialize 建立持久草案容器和十二层入口；作品根必须是安全的项目相对目录名，不得提交绝对路径。此阶段不得 append 正文对象、prepare_review、freeze、写正式正文或提交图片。"}${worldEntryMode === "reconcile" ? "这是整理入口，必须保留旧文件并选择不冲突的新作品根。" : ""}成功后调用 report_growth_progress，outcome 必须为 continue，artifactPaths 必须包含且只需包含 <作品根>/世界基准.md；不要等待用户确认，Scheduler 会自动进入阶段二。`,
      preventCompletion: true,
      successfulReportOutcome: "continue",
      workRootArtifactName: "世界基准.md",
      requiredWorkbenchRoot: true,
      maxIterations: 16,
      workerProfile: "world-blueprint",
    }
  }
  if (stage === 1) {
    return {
      stageKey: "twelve-layer-skeleton",
      stageInstruction: `这是 Growth World Pro 产品阶段二：十二层骨架。阶段一的 initialize 已经受信任地创建十二份空层蓝图和唯一作品根工作台。本阶段只调用 write_world_blueprint action=inspect，确认逐字十二层入口全部存在、状态为 draft、每层对象数均为 0。不得 append、map_sources、prepare_review、freeze、写具体对象、正式正文或图片；若任一层已经出现对象，必须报告 waiting，不得猜测、覆盖或继续扩充。成功后调用 report_growth_progress，outcome 必须为 continue；不要等待用户确认，Scheduler 会自动进入阶段三。`,
      preventCompletion: true,
      successfulReportOutcome: "continue",
      requireWorkRoot: true,
      maxIterations: 8,
      workerProfile: "world-blueprint",
    }
  }
  if (stage === 2 && !confirming) {
    const entryInstruction = worldEntryMode === "continue"
      ? `这是已有权威世界的后继 Run。Runtime 已把前驱 Goal 的蓝图交接到当前 Goal；第一步必须调用 write_world_blueprint action=inspect 读取当前草案状态和逐层数量。禁止再次 initialize、禁止重建作品根、禁止重做已经存在的批次，只继续缺失的层与对象。`
      : worldEntryMode === "reconcile"
        ? `这是已有项目内容的整理 Run，不是空项目创作。先递归检查项目真实文件，把每份相关资料登记为 project source，并将它匹配、归类到十二层中的具体对象。选择一个不会覆盖既有文件的新作品根；原文件不得移动、重命名、删除或改写。所有 entry 建立后，必须分批调用 write_world_blueprint action=map_sources，把每个对象标为 existing、partial、conflicting 或 missing，并为前三类提交实际存在的项目相对文件路径；missing 不得伪造来源。蓝图对象应体现已有材料的自然归类与待补缺口，后续正文只在新作品根中形成整理后的正式版本。`
        : `这是原创创建的蓝图扩充 Run。阶段一、二已经建立作品根与十二层骨架；先 inspect，禁止再次 initialize。`
    return {
      stageKey: "world-blueprint-create",
      stageInstruction: `这是 Growth World Pro 产品阶段三：全世界蓝图。审查与冻结属于本阶段收尾，不是独立创作阶段。必须由当前同一个 Worker 扩充完整世界覆盖，不得拆成十二个 Worker：

${entryInstruction}

先调用 action=inspect 读取阶段一、二已持久化的路线、资料边界、题材、文风、十二层骨架和候选文类。资料不足只记录边界并允许后续创造，不得产生 criticalGap；禁止再次 initialize。

从世界内部居民能够观察、记录和争论的视角统一规划全部对象。用户提到的现实历史、现代科学、消失事物或另一条世界线只是外部创作约束，必须先转译成当地可见的山海、气候、道路、制度、传闻和生活经验；不得把“印度板块不存在”“现实喜马拉雅”“本应存在的大陆”“旧世界线”等外部比较注册成正文对象、标题或世界内知识。当前版本不建立上帝视角真相文章，也不要求居民解释自己不可能知道的反事实。

先在头脑中统一世界内部名称、空间尺度、时代、地区、政体、组织、物种、人物与故事入口，再按逐字层名分批调用 action=append。世界名称和作品根必须是世界内部可成立的名称，不得直接使用“无某板块世界”等外部设定标签。每批只提交一个层的少量具体对象和已确定的世界内部认知关系；工具负责稳定 ID、同层 parentId、可读 plannedPath、顺序、定位前缀、索引统计与持久化。十二层建议规模：
${layerChecklist}

每层先提交 2 至 8 个有意义的 group，再提交归入同层树结构的 entry；至少一半对象必须是 entry。key 必须全世界唯一且在后续批次稳定复用。title 是具体名称或明确主题，rationale 要解释为何属于当前层。parentKey 可以引用同层任意已有对象或本批对象，以表达多级结构；不得跨层、指向自己或形成循环。每个 entry 根据对象语义，从工具返回的当前层 genreCandidates 中选择一个 genreKey；它是候选写作建议，可被 Writer 更换、混合或省略，不是必须逐项实现的合同。group 禁止 genreKey。不要提供 ID、文件路径、order、locator 或 status。

同一个真实实体只能登记一次并选择一个最主要的所属层。若一个法师会同时影响力量体系和国家权力，不要在两层各建同名对象；把它登记在主要层，再用 causes 连接它对其他层对象产生的作用。只有确实代表不同文献、时期、分支或视角时才建立第二个对象，并在标题与 rationale 中明确差异。

因果关系通过 causes 提交，fromKey 是原因，toKey 是结果，reason 写清具体作用。只能引用工具中已存在或本批新建的对象。parentKey 只表示同层目录结构，causes 只表示世界内部因果；不要提前写正文生成依据 adopts/dependsOn。越晚规划的层应从全局已登记对象中选择多个真实上游，不能把十二层压成单向链。

每条 causes 提交前先把它读成“from 导致、塑造或限制了 to”。若 reason 实际说的是 to 决定 from，例如山岭决定道路走向，就必须改成山岭 -> 道路；不要因为生成顺序而把方向写反。

当前没有独立客观真相层，因此 causes 只能表达世界内部记录能够支持的因果认识。若不同地区或身份存在分歧，分别规划对应记录或争议对象，不得由架构 Worker 冒充全知裁判。

十二层都形成具体、非空且可继续填充的结构，并至少已有 24 条跨层因果后，为整个作品形成一份统一视觉母版。它必须具体规定：美术流派与媒介质感、色彩和明暗体系、时代材质与工艺边界、建筑服饰武器的共同语言、纹样象征与标志、线条细节密度与构图倾向，以及禁止出现的现代或违和元素。视觉母版是地图、角色立绘、小说插图和漫画共享的最高视觉约束，不要写单张图片的场景内容。

调用 action=prepare_review，并把上述七类视觉决定放入 visualStyle；工具会受信任地创建 ${workRootPath ?? "<作品根>"}/视觉设定/统一画风.md，禁止用通用文件工具自行创建或改写。reconcile 入口必须先让 map_sources 覆盖每个 entry；工具会拒绝任何未映射对象。不要为了凑整数添加同义或无意义对象；每层下限只统计 entry，不统计 group。只有返回 review，才能调用 report_growth_progress。阶段回执的 artifacts 只列出真实公开文件：${workRootPath ?? "<作品根>"}/世界基准.md、${workRootPath ?? "<作品根>"}/资料索引.md、${workRootPath ?? "<作品根>"}/视觉设定/统一画风.md。蓝图 state、index、relations 和十二层 JSON 是 Runtime 管理的内部证据，禁止搜索、复制、编辑或作为公开 artifact 提交。报告 continue 后由 Scheduler 在同一个 Growth Run 中自动进入蓝图确认步骤；当前 Worker 不得自行 freeze，也不得等待用户再次输入 Continue。

当前阶段不得写正式正文、空 Markdown、图片任务或正文物化内容。`,
      preventCompletion: true,
      successfulReportOutcome: "continue",
      workRootArtifactName: "世界基准.md",
      requiredWorkbenchRoot: true,
      maxIterations: 48,
      workerProfile: "world-blueprint",
      trustedArtifactSource: "world-blueprint",
      validateArtifacts: validateGrowthWorldProReviewArtifacts,
    }
  }
  if (stage === 2) return {
    stageKey: "world-blueprint-confirm",
    stageInstruction: `这是 Growth World Pro 蓝图确认 Run。先调用 write_world_blueprint action=inspect，root=${workRootPath ?? "<缺失>"}，并读取 ${workRootPath ?? "<作品根>"}/视觉设定/统一画风.md，确认当前权威状态和统一视觉母版。若文件尚不存在，这是旧 review 的兼容入口：根据世界基准、题材与蓝图形成 visualStyle 七类字段，先调用 prepare_review 受信任地补建文件，再继续确认。若最新用户修正要求改变对象、因果、名称、来源、题材配置、项目文风或创作方向，先调用 write_world_blueprint action=amend，以当前层完整对象和全量因果替换修订；修改 topicProfileKey 或 worldStyleProfile 时，工具会事务性重验全部 entry 的 genreKey，任何失效都必须整体失败，禁止回落默认值。修订后从现有《统一画风.md》恢复 visualStyle 七类字段并调用 prepare_review，报告 continue 后重新等待检查。若没有新修正且状态为 review，调用 action=freeze；freeze 会验证统一画风文件真实存在且非空。只有返回 frozen 才报告 continue。回执 artifacts 只列出真实公开文件：${workRootPath ?? "<作品根>"}/世界基准.md、${workRootPath ?? "<作品根>"}/资料索引.md、${workRootPath ?? "<作品根>"}/视觉设定/统一画风.md。蓝图机器 JSON 由 Runtime 直接校验，禁止搜索、复制、编辑或提交。不得写正文或提交图片。`,
    preventCompletion: true,
    successfulReportOutcome: "continue",
    requireWorkRoot: true,
    workerProfile: "world-blueprint",
    trustedArtifactSource: "world-blueprint",
    validateArtifacts: validateGrowthWorldProBlueprintArtifacts,
    maxIterations: 12,
  }
  return {
    stageKey: "free-materialization",
    executionMode: "world-materialization",
    stageInstruction: `Growth World Pro 蓝图已经冻结，统一作品根为 ${workRootPath ?? "<缺失>"}。由 Runtime 选择当前最早未完成层并执行专用正文物化，不允许普通阶段 Run 绕过对象回执。`,
    preventCompletion: true,
    requireWorkRoot: true,
  }
}

export function validateGrowthWorldProBlueprintArtifacts(artifacts: readonly WorldBlueprintArtifactEvidence[]) {
  return validateFrozenWorldBlueprintArtifacts(artifacts)
}

export function validateGrowthWorldProReviewArtifacts(artifacts: readonly WorldBlueprintArtifactEvidence[]) {
  return validateReviewWorldBlueprintArtifacts(artifacts)
}

export const GROWTH_WORLD_PRO_SKILL_SOURCE = `---
name: ${GROWTH_WORLD_PRO_SKILL_NAME}
description: Build and freeze a large coherent twelve-layer world blueprint before prose by using the dedicated blueprint tool.
---

# CreatX Growth World Pro

本 Skill 复用同一个 Growth Goal、Cline Runtime 和真实项目文件。不要创建 Cline 原生子 Agent、第二套消息或 Run 权威。

Runtime 会在模型运行前选择执行入口：空项目使用 create；已有权威蓝图使用 continue，由新的 successor Goal 显式继承旧状态；只有真实文件而没有权威蓝图时使用 reconcile，把创建蓝图改成匹配、归类、整理和补缺。来源路线 original/canon/fanwork 与这三个执行入口相互独立。模型不得自行修改 .creatx、猜测 Goal ownership，或在 continue 中再次 initialize。

## 四阶段合同

Growth World Pro 依次执行四个可恢复产品阶段：路线、资料与世界方向；十二层骨架；全世界蓝图；自由物化。create / continue / reconcile 只是进入这四阶段的恢复路由，不是额外阶段。

1. 判断原创世界、原著整理或二创扩展，读取项目和必要的网页资料，确认来源边界、世界前提、题材、基调与主题。从工具允许值选择 topicProfileKey，并形成结构化 worldStyleProfile；调用 \`write_world_blueprint initialize\` 初始化方向容器、唯一作品根工作台和十二份空层蓝图。网页出现 403、登录墙或反爬拒绝时换用其他域名的可靠公开来源，不要重复请求同一站点，也不要把失败页面算作已核实资料。成功后调用 \`report_growth_progress\`，以 \`outcome=continue\` 提交阶段回执，不等待用户确认。
2. 阶段一的 \`initialize\` 已经建立蓝图容器、唯一作品根工作台和十二份空层蓝图。本阶段只用 \`inspect\` 确认十二层入口完整且对象数均为零，不创建具体对象、不注册十二个工作台、不手写蓝图 JSON。
3. 把全世界规划分成语义小批，通过 \`append\` 填入十二层对象和 cause -> result 因果；这是具体 group 和 entry 的唯一创建阶段。entry 的 genreKey 是候选写作建议，group 禁止 genreKey。reconcile 还必须用 \`map_sources\` 保存覆盖状态和真实来源路径。\`prepare_review\` 同时接收七类项目视觉决定并由工具创建唯一《统一画风.md》；用户修正、再次审阅和 \`freeze\` 都属于本阶段收尾，只有冻结后才能进入正文。
4. Runtime 按十二层顺序领取对象，Research 形成短简报，Writer 自由完成正文，正文后再抽取实际事实与关系并提交持久图片任务和回执。

用户输入中的现实历史、现代科学、缺失事物和另一条世界线只属于外部创作约束。规划前必须把它们转译成居民能够观察、记录和争论的世界内部现象。世界名称、对象标题、定位和因果不得出现“现实世界”“本应存在”“原本历史”“另一条世界线”等外部比较，也不得让古代或前现代讲述者知道现代板块构造等知识。当前版本不创建上帝视角真相文章。

## 十二层建议规模

${layerChecklist}

这些是创作目标，不是精确配额。具体数量由题材自然决定，不要为凑数制造同义对象；工具只保留每层 8 个正文 entry 的宽松防空壳下限，并保留单层 80、全世界 720 的运行保护上限。十二层是一个整体设计图，不是十二次互不相关的创作。

每层建立 2 至 8 个 group，并让约 10 至 14 个正文 entry 归入同层树结构。parentKey 可引用同层 group 或 entry，用于表达任意深度的清晰层级，但不得跨层、自指或成环。AI 只提交稳定语义 key、title、kind、parentKey、entry 必填的 genreKey 和具体 rationale；ID、路径、顺序、索引与 JSON 由工具生成。genreKey 逐项从工具返回候选中选择，不得省略或自造；它为后续 Writer 提供候选文类，不冻结正文形式。

同一个真实实体只登记一次，放在最主要的层；对其他层的影响通过 causes 连接，不得为满足十二层覆盖而复制同名实体。只有不同文献、时期、分支或视角才拆成多个对象，并明确标题差异。

## 因果与正文依据

\`parentKey\` 只表示同层结构。\`causes\` 的方向永远是原因指向结果，保存已确定的世界内部因果。它不等于正文生成依据；后续正文实际读取来源后才能记录 adopts。每个较晚层都应检索全局已登记对象，选择真正相关的多个上游，因果网不应退化为 1 到 12 的单链。

提交每条 causes 前，把它读成“from 导致、塑造或限制了 to”；若 reason 的自然语言含义相反，就交换端点，不能用生成顺序冒充因果方向。

## 正文物化

蓝图冻结后，Runtime 按十二层顺序调度。研究只形成短小写作简报：当前对象与正文目的、少量实际读取材料、显式锁定事实，以及候选文类和文风技巧。资料不足、未知细节、未覆盖建议项和普通语义缺口只记录为提示，不得产生 criticalGap 或阻塞 Writer。

文类与文风只提供建议。Writer 可以更换主文类、混合备选文类、调整顺序或忽略不适用技巧，并在少量锁定事实之外为完整性与表现力自由创造。正文可以省略锁定事实，但不得直接否定它；篇内明显矛盾和锁定事实冲突必须有界重写，仍失败则红色停止。公开正文不得出现来源标签、检索过程、生产术语或内部 JSON。

正文完成后，再执行轻量抽取并持久化实际出现的事实和关系。事实来源级别只有 source / derived / created；来源级别与锁定状态彼此独立，不进入公开正文，也不阻塞后续对象。后续对象可检索三类事实、已完成正文和实际关系。技术 Schema、Provider、文件、权限、所有权、状态损坏、持久回执和图片任务身份继续失败关闭。

## 停止条件

阶段一、二成功后分别调用 \`report_growth_progress\`，以 \`outcome=continue\` 提交阶段回执，禁止自行等待用户确认。阶段三只有在 \`prepare_review\` 返回 review、统一作品根工作台与《视觉设定/统一画风.md》真实存在且蓝图证据通过后才能提交创建回执；Runtime 随后自动执行确认与 \`freeze\`，不要求用户再次 Continue。十二层目录不得分别注册成工作台。阶段三回执提交世界基准、资料索引与统一画风三份公开文件；Runtime 从内部权威状态自动校验 state、index、relations 和十二层蓝图，模型不得复制或提交这些 JSON。只有 \`freeze\` 返回 frozen 后正文物化才能开始。不得在蓝图批次写正式正文或提交图片。`
