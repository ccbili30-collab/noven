---
title: Creative Skills 能力线入口
doc_type: capability-entry
owner: creative-skills
status: growth-world-pro-v2-review-live
last_verified: 2026-08-08
source_of_truth: docs/capabilities/creative-skills/product-spec.md
---

# Creative Skills（创作技能）能力线

本能力线回答：CreatX 如何在同一个 Coding Agent（编码智能体）上按需加载创作方法，哪些 Skill（技能）只能由用户开启，`/study`、`/growth`、`/growth_world`、`/living`、`/draw-map`、`/causality` 和工作台协助分别必须产生什么结果，以及这些行为怎样验收。首个应用本地小说 Skill 与自然语言 Live 已完成；轻量 Study 已用真实视觉 Provider 自动读取项目图片并形成研究文件、生图与工作台；Dynamic Growth 的 Goal Store、显式命令、Skill、阶段汇报、串行 Scheduler（调度器）、生命周期、图片队列 Runtime、生产 Main 接线和最小状态界面已实现。每个 Growth 阶段现由新的隐藏 Cline Session（会话）执行，结束后释放活动资源；可见 Owner Session 和持久 Goal 保持不变，避免阶段间继承完整对话上下文。Growth World 的通用世界脊柱与原创、原著整理、二创扩展三路线已通过四个有效 Provider/Electron 案例；完整 `ACC-CSK-318` 仍缺同一基准内的用户主动 Steer、暂停/继续和重启恢复。Cline 原生子 Agent Kernel Lab 只通过递归、干净继承和结果回传，兄弟并发、后代用量与取消传播失败，生产分裂继承仍未启用。

Harness 已由 ADR-0005 固定为 Cline。本能力线不拥有 Cline Adapter，也不定义图片 Provider（模型服务）队列格式；它只定义 CreatX Skill 的创作行为。规格条目本身不等于 Runtime（运行时）或 Live（真实运行）证据，具体实现状态与验收边界以本页状态表和对应基线记录为准。

第一版优先实现可见创作能力和真实工具链。`/living` 简化为普通角色扮演 Skill，不切换工具集或建立零工具 Runtime；四档权限、长期记忆、后台恢复和特殊会话都不是本能力线的第一版前置条件。

## AI 任务路由

以下任务首先进入本能力线：

- 内置 Skill 的发现、加载、触发、教程与组合。
- `/study` 的研究方法和项目内容产出。
- `/growth` 显式启动持久 Goal，由 Rolling Planning（滚动规划）串行编排多个 Cline Run；子 Agent、并行阶段和后台继续延期。
- `/growth_world` 复用同一 Goal Runtime，形成原创、已有作品整理或二创扩展的完整世界成品路线。
- `/living`、`/unliving`、自由视角与可选的 `@` 项目绑定视角。
- `/draw-map` 的隐藏泰森命中、完整高亮地图变体与可选择地图结果。
- `/draw-comic` 的原创画风、页面导演、分镜节拍、连续性资产和生图 Prompt。
- `/causality` 的因果推导、图谱结果及与普通关系的区分。
- Agent 如何使用工作台注册工具展示创作内容。

以下任务不由本能力线独立决定：

| 相邻能力 | 对方拥有 | Creative Skills 只拥有 |
| --- | --- | --- |
| `provider-harness` | Cline Skill、Plugin、Run、Automation、子 Agent、模型与工具循环的真实支持 | 需要 Cline 提供的创作 Skill 行为 |
| `agent-runtime` | Run 状态、事件、取消、恢复、并发与工具执行 | Skill 如何组合已有执行能力 |
| `permissions` | Session 的审批/自由 Tool Policy；未来可选的四档及 Change Set（变更集） | 普通 Skill 不改变当前模式；Growth 要求自由模式 |
| `project-files` | 文件写入、版本、回收站、路径和冲突 | Skill 产生哪些真实项目内容 |
| `workspace-ui` | 工作台组件、面板、交互和视觉布局 | Skill 何时注册或更新工作台及必须展示什么 |
| `memory` | 用户画像、项目画像、复盘和容量 | Living 角色语境不能污染个人画像 |
| `image-runtime` | 图片模型、持久单 Worker 队列、成本、失败和文件落盘 | Growth 声明何时提交及哪些图片是完成前置 |
| `interactive-preview` | HTML/CSS/JavaScript 沙箱与生命周期 | 创作 Skill 可以生成交互作品文件 |

## 阅读顺序

1. `product-spec.md`：当前权威规则与开放问题。
2. `acceptance.md`：未来实现必须证明的可观察结果。
3. `plan.md`：从 Harness 证据到各 Skill 的实现顺序。
4. `../../discussions/2026-07-26-creatx-coding-agent-product-model.md`：原始定义、纠正和参考代码评估。
5. `../../discussions/2026-07-24-creatx-agent-harness-investigation-report.md`：Harness 候选与 Kernel Lab（内核实验室）边界。

## 当前状态

| 层次 | 状态 |
| --- | --- |
| 产品语义 | 首轮已从讨论记录提升；少量输出格式仍开放 |
| 架构 | ADR-0008 已接受应用本地 Cline 原生 Skill；没有第二 Skill Runtime |
| Skill 合同 | Workbench Core Guidance、世界转小说、五加一人物群像、Growth、Growth World、轻量 Study、Draw Map V25、Draw Comic V23 和实验性 Causality 方法 Skill 已实现；Composer 挂篮可在同一正式会话顺序执行地图、人物、小说、漫画、研究和因果图。Draw Map 已用两个不同题材完成真实 Provider 底图、视觉边界蒙版、构建器和独立浏览器逐区验收；稳定边界是最多三次尝试后失败关闭，不承诺所有题材首次即成功。Causality 只投影已明确登记的 `causes`，离线生成器和失败关闭已通过真实文件测试，真实 Agent 注册工作台仍待 Live。人物 Viewer 与构建器已打包但外部 Provider 成品 Live 尚未完成；世界星图仍只为 Prototype，Living 未实现 |
| 工具合同 | `register_workbench` 已 Live；`write_world_blueprint` V3 已通过真实项目文件/工作台 Port 自动测试，负责结构化来源、创作方向、蓝图 ID、路径、索引、精确批次恢复、`draft -> review -> frozen` 修订链和单一世界根工作台注册；十二层只在根内展示，V1/V2 不迁移 |
| Runtime | Cline 公开 Skill 目录、允许列表、加载工具和生命周期已接入 |
| Growth Goal | V4 合同、SQLite、单未终结 Goal、幂等、乐观版本、终态、最新用户修正持久化、事件和重启读取已接入生产 Electron |
| Growth 命令 | `/growth` 在自由项目 Session 创建持久 Goal 并启动 Scheduler；审批模式无 Goal 失败关闭 |
| Growth World | `/growth_world_pro` 当前权威路线由一个全局架构 Run 判断三路线、整理结构化来源与创作方向，再调用专用工具建立和分批填充十二层 Blueprint V3；第三阶段 `prepare_review` 同时受信任地产生唯一《视觉设定/统一画风.md》，冻结前验证其存在且非空。题材配置、项目文风和 entry 的显式 `genreKey` 已持久化；Materialization V4 为全部 entry 固化表现优先写作简报与可信 attempt，图片由队列集中注入统一画风。自动合同通过；统一画风尚未进行新的外部图片 Provider 视觉一致性 Live，跨题材自动选型与受控文风对照继续冻结 |
| Growth 汇报 | 中立工具、可信阶段身份、证据 Port、图片完成门禁和原子幂等收据已注册生产 Main |
| Growth 调度 | Pro 蓝图草案使用一个隐藏一次性 Session 和 48 次有限循环预算，`prepare_review` 后等待；确认 Run 使用 12 次预算执行 `amend -> prepare_review` 或 `freeze`；冻结后正文物化按层屏障、层内最多三个一次性 Worker 运行，Result Unknown 与旧版本迟到回执失败关闭。普通 Growth 不受该策略影响 |
| Growth 生命周期 | Steer、持久最新修正、暂停、继续、结束、退出暂停和重启不自动续跑已接入 Desktop API；活动 Growth 的 Renderer Steer 已路由到 Growth Lifecycle |
| UI | 最小 Growth 状态带、waiting 原因、审批/自由切换和合法按钮已实现；隐藏 Worker 成功工具事件会刷新当前文件与工作台投影，但不显示为 Owner 工具活动；Draw Map 独立 Viewer 已通过真实浏览器交互，正式桌面内的地图专用工作台接入仍未验收；图谱仍只有冻结参考或 Fixture 原型 |
| 自动验收 | 本次传奇历史修改的定向测试为 `24/24`、343 个断言，全量测试为 `156/156`、799 个断言；类型检查、生产构建和导入边界通过。Desktop 未在本批重跑 |

## 修改规则

- 一个 Skill 的用户语义只在本能力线定义；权限、文件和 UI 通过相邻合同引用。
- 不把 Growth Goal 实现成第二套模型循环；Goal 只编排并引用 Cline Run。
- Skill 教程负责教会模型怎样工作；Runtime 与工具合同负责强制权限、路径和数据不变量。
- 不因旧 NovelX 存在同名 Growth、Study、地图或图谱代码就声称可以直接迁移。
- 新创作 Skill 先证明它需要不同用户结果，再加入本能力线；不要把所有 Prompt 都注册成产品能力。
