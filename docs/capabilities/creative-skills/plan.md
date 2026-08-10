---
title: Creative Skills 实现路线
doc_type: capability-plan
owner: creative-skills
status: growth-world-first-version-implemented
last_verified: 2026-07-29
source_of_truth: docs/capabilities/creative-skills/product-spec.md
---

# Creative Skills 实现路线

本文把创作 Skill 拆成 Cline Plugin/Skill 上的可安排批次，但不是实现完成声明。当前实施状态以本能力线的规格、验收矩阵和 `CONTEXT.md` 为准。

## 当前目标

让后续 AI 可以从稳定规则、验收 ID 和相邻合同实现一个 Skill，而不重新阅读全部聊天或恢复旧 NovelX 领域 Runtime。

## 依赖顺序

```text
C0 关闭关键开放问题
  ↓
C1 Cline Skill / Plugin / Tool Kernel Lab
  ↓
C2 最小 Skill Registry 与工作台协助工具
  ├─ C3 Living 角色扮演
  └─ C4 Study 普通研究闭环
  ↓
C5 Dynamic Growth Goal
  ├─ 持久 Goal 与多 Run 调度
  ├─ Session 自由模式与 Steer
  └─ Image Runtime 单 Worker 队列
       ↓
  C6 Draw Map / C7 Causality
```

地图、因果和 Growth 不进入第一条 Walking Skeleton（可运行骨架）。第一条骨架先证明普通 Coding Agent 的真实 Provider、文件、原生审批、事件、取消、历史重开和用户发起的新继续回合。

## C0：关闭阻塞产品问题

输出：只更新产品规格与验收。

- 决定 Skill 是否允许用户或项目自定义，以及导入 Skill 的信任边界。
- 决定 Study 最小来源和引用格式。
- 决定地图与因果结果是否需要可迁移 Manifest（清单）及其用户可见含义。
- Growth 的产品生命周期已由 ADR-0009 关闭；本阶段只剩具体持久 Schema 和预算上限在实施批次冻结。

停止条件：仍存在会改变项目文件兼容、权限或用户可见终态的合理分歧。

## C1：Cline Kernel Lab

状态：首个应用本地 Skill 所需公开路径已验证；Slash Command、组合、预算和跨版本仍待后续 Skill。

输出：固定 Cline `0.0.65` 的真实运行证据，不接正式 UI。

验证：

- 内置 Skill 的按需加载、移除和上下文预算；
- 用户显式触发与 Agent 自动激活的区分；
- 显式 `/growth` 加载 Skill 并创建 Goal；
- Cline 原生 Steer、Abort、完整 Act 工具集和 wildcard auto-approve；
- Windows 原生路径、中文 Skill 内容、前台启动和正常退出；
- Skill 版本变化后的会话恢复与失败关闭。

停止条件：必须修改 Cline Core、只能通过 Cline 私有 UI 对象工作，或真实创作工具无法等待并返回真实结果。

## C2：最小 Skill 与工作台协助

状态：Workbench Core Guidance、小说 Skill、公开 Cline 接线与工具说明已实现；自然语言完整 Live 待人工 Shell 审批。

前置：ADR-0005 与 Provider Harness 的 P1-P3 通过。

范围：

- Skill Registry、版本和按需上下文；
- 工作台协助教程；
- 受约束的检查、预览、应用和验证工具；
- 该已完成批次使用 Harness 原生逐次审批、已披露的全机信任边界和结构化错误；后续默认自由迁移不回写其历史 Live 证据；
- 真实文件不移动、不复制的验收。

主要验收：ACC-CSK-001 至 ACC-CSK-007、ACC-CSK-101 至 ACC-CSK-106。

## C3：Living

建议拆成两个竖向批次：

1. 自由视角、`/unliving`、继续和会话历史；工具与权限保持普通会话行为。
2. `@` 项目匹配、按权限创建 Markdown、冻结上下文与稳定纠错写回。

主要验收：ACC-CSK-401 至 ACC-CSK-414。

必须验证 Living 不提升普通会话权限；零工具沙箱不进入第一版验收。

## C4：Study

状态：轻量应用本地 Skill、真实 Provider 文本整理、原生 `read_files` 自动项目图片学习、生图、工作台注册与重启恢复已 Live；Bing RSS 到来源正文的底层抓取已 Live，主动网络 Study 方法已内置但尚未完成真实 Provider Study 验收。

范围：按需研究 Skill、真实来源读取、恶意内容降权、代表性取样、设定/文风/视觉/生图方法提炼、普通项目笔记和工作台注册。不创建独立 Study 页面或 Runtime。

主要验收：ACC-CSK-201 至 ACC-CSK-209。

后续批次：用一句自然语言 Study 请求验证 Agent 自动判断资料缺口、搜索、读取正文、记录来源和注册工作台；再按真实需求决定是否仍需结构化 `web_search`，以及验证超大目录的多回合继续。Growth 或 `/growth_world` 自动组合 Study 不进入本批。

## C5：Growth

前置：Cline Run、真实 Provider、文件工具、原生审批、取消和工作台协助已经可靠。

范围：目标驱动创作教程、持久 Goal、滚动计划、串行多 Cline Run、每阶段一个隐藏一次性 Cline Session、阶段汇报、Steer、暂停/继续、自由模式和持久单 Worker 生图队列。不实现子 Agent、并行阶段、固定 NovelX 世界状态机、后台继续或中断 Run 精确恢复。

主要验收：ACC-CSK-301 至 ACC-CSK-316，以及 Session 自由模式和 Image Queue 对应验收。

详细 TDD（测试驱动开发）任务、文件边界和完整 Live 步骤见 `../../plans/2026-07-28-dynamic-growth-goal.md`。

### C5a：Growth World 第一版

状态：`/growth_world` 精确命令、V6 应用本地 `creatx-growth-world`、通用 Growth 组合规则、生产 Main Goal 创建/Steer 路由和跨阶段持久标记已实现。通用世界脊柱与原创、原著整理、二创扩展三路线已在中世纪、中国架空、《三体》和 Rain World 四个真实案例中通过内容与工具链验收。它继续复用 C5 的 Goal、Scheduler、生命周期、文件、工作台与图片队列，没有新增实体、子任务、提交或代际 Schema。

隔离 Cline SDK `0.0.65` 原生 `spawn_agent` Kernel Lab 已完成。递归父子 Session、三个独立叶子、干净任务输入、结果回传和最终进程回收通过；兄弟叶子没有并发，公开聚合用量没有包含后代，根 Abort 后阶段与叶子仍持久化为 `completed`。实验整体未通过硬门槛，生产 `enableSpawnAgent` / `enableAgentTeams` 保持关闭，也不形成取代 ADR-0009 的新 ADR。

串行有界 Run 使用“一个持久 Owner Goal + 一组隐藏一次性 Cline Session”。固定 Pro 先用一个全局架构 Worker 完成三路线判断、结构化资料整理和独立创作方向，再通过 `write_world_blueprint` 的 `initialize/append/prepare_review` 建立完整蓝图草案。工具自动创建十二层目录但只注册一个作品根工作台，生成 ID、路径、顺序和索引，并保存至少 24 条跨层 `causes` 因果；禁止 AI 手写蓝图 JSON 或提前写正文生成依据 `dependsOn`/`adopts`。草案进入 `review` 后统一等待。用户修正时用 `amend` 回到 `draft` 并重新审阅；没有新修正时才用 `freeze` 冻结。之后进入专用正文物化调度，层间串行、层内最多三个 Worker。

主要验收：ACC-CSK-317 已完成；ACC-CSK-318 的内容与工具链部分通过，完整生命周期仍未集中通过；专用蓝图工具 V2 的自动化批次覆盖 ACC-CSK-330，首次真实 Provider/Electron `review` 覆盖 ACC-CSK-321。ACC-CSK-329 仍需用户修订、重新审阅和冻结。

### Growth World Pro 正文物化批次

状态：V2 代码与自动化测试完成；旧 V1 Provider/Electron 连续两层只保留失败与历史工程证据。V2 真实 Provider/Electron、完整十二层、真实中断恢复组合与全部图片成功待验收。

1. 建立项目内私有 `materialization.json` 和逐对象完成回执，不修改公共 Growth Goal Schema。
2. 为每个对象建立相互隔离的研究与 Writer Session；研究只交付结构化事实包，Writer 不接收私有问题、来源路径、研究对话或固定讲述者。
3. 为一次性 Cline Session 增加可信 `workItemId` 与同 Owner 最多三 Worker 的批量运行能力，并实现层间屏障、单文件所有权、对象完成工具和统一 `关系/index.json` 投影。
4. 将每个正文的唯一图片任务纳入完成门禁；图片继续由现有 FIFO 单 Worker 执行。
5. 覆盖成功、并发上限、跨层阻止、幂等、迟到版本、暂停、无回执正文结果未知和进程恢复。

主要验收：ACC-CSK-326、ACC-CSK-331 至 ACC-CSK-334。停止条件：第三阶段能完成至少两个连续层的 V2 真实 Provider/Electron 运行，或出现需要改变公共 Goal Schema、Cline Core 或文件兼容性的阻塞。

## C6：Draw Map

地图在第一骨架和首批 Skill 之后单独排期。初始版本优先复刻已经验证过的简单地图效果，不为多算法选择预建复杂状态机；泰森网格或像素差分只有真实需求出现时再评估。

2026-07-30 已完成应用本地 `creatx-draw-map` 方法 Skill 与真实 Provider Pilot。用户已明确要求泰森结构路线，因此泰森网格、粗控制蒙版、AI 自然高亮和蒙版外像素保护不再只是理论候选。当前批次只提升 Skill 方法，不冻结地图 Manifest、图片编辑 Tool Schema 或 Renderer 合同。

范围：

- 受约束泰森网格与区域组合工具；
- 图片 Provider 图生图调用；
- 视觉与选择几何对齐验证；
- 真实图片与区域数据文件；
- 工作台悬浮、点击、触屏和详情投影。

主要验收：ACC-CSK-501 至 ACC-CSK-508。

不得直接把外部 Python 脚本交给协作模式终端执行；必须包装成受项目边界限制的内置工具或等价实现。

## C7：Causality

范围：项目内容读取、AI 因果理解、最小节点与边输出、普通关系排除、可选择图谱和来源文件跳转。

主要验收：ACC-CSK-601 至 ACC-CSK-606。

可以提取冻结 NovelX 图谱的交互和纯投影算法，但不得复用旧 Growth Schema、文件扫描回退或球面 UI 作为新产品架构权威。先恢复冻结参考测试环境，再决定提取范围。

## 每个实现批次的任务模板

| 字段 | 要求 |
| --- | --- |
| 目标规则 | 明确列出 `CSK-*` |
| 验收 | 明确列出 `ACC-CSK-*` |
| 主要能力线 | `creative-skills` |
| 相邻合同 | 只列实际触及的 Harness、Runtime、权限、文件、工作台、记忆或图片能力 |
| 允许修改 | 明确目录、Skill、工具和唯一所有者 |
| 非目标 | 明确不会顺手增加的新 Skill 或专业编辑器 |
| 真实证据 | 指明 Provider、文件、进程重启、零工具或视觉验收要求 |
| 停止条件 | 产品语义、权限、文件兼容或 Harness 私有 API 需要改变时停止 |

## 当前下一入口

自然语言小说启动、标题纠正和同步单图闭环已经 Live。Dynamic Growth Tasks 1-8 已形成合同、Runtime 和生产 Electron 失败/恢复证据；Goal、Scheduler、Lifecycle、图片状态查询和最小 Renderer 状态已经接线。串行调度现在为每个阶段创建新的隐藏 Cline Session，自动测试已证明阶段间 Provider 上下文不继承。Growth World 四案例已通过通用世界脊柱与三路线的真实内容和工具链验收，但不能冒充 `ACC-CSK-318` 完整生命周期通过。原生 `spawn_agent` Kernel Lab 已结束为部分失败，不能进入生产；下一入口是用真实 Electron 验证一次性 Worker 的 Steer、暂停/继续、重启恢复和退出回收。四档权限、Living 零工具、长期记忆、后台继续和特殊会话不影响该批次。
