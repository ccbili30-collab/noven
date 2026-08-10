---
title: Dynamic Growth Goal 产品发现
doc_type: discovery-record
status: promoted-to-adr-0009
date: 2026-07-28
---

# Dynamic Growth Goal 产品发现

## 1. 本轮要解决的问题

冻结 NovelX 的 Growth（持续创作）能按照预设的“世界、人物、小说”路线完成比赛任务，但真正的 CreatX 不能要求所有长期创作都走同一条流水线。用户需要的是：给出一个可能很小、也可能跨越很多文件和图片的目标后，AI 能自由决定路线，持续工作、接受中途纠正，并在真实完成后自行停止。

本记录保存 2026-07-28 的产品讨论与纠正。已经稳定的结论提升到 ADR-0009、Creative Skills、Session 和 Image Runtime（图片运行时）规格；本记录本身不是实现完成证据。

## 2. 已确认的产品含义

### 2.1 Growth 不是一段长 Prompt

Growth 由两部分组成：

```text
Growth Creative Skill（创作方法）
              +
Persistent Goal Runtime（持久目标运行时）
```

Skill 教 Agent 怎样理解长期目标、维护计划、复读真实产物和滚动调整路线；Goal Runtime 保存目标生命周期并在一个 Cline Run 结束后决定是否开启下一阶段。它不建立第二套模型循环、工具协议或消息数据库。

### 2.2 动态路线而非固定世界模板

- `/growth 写完 1-10 章` 可以只处理小说章节。
- `/growth 推导这个世界的因果关系` 可以只读取现有世界并补充关系。
- `/growth 创建一个自洽的中世纪世界` 可以自主建立世界核心、环境、历史、群体、角色、冲突、地图和代表性图片。
- 比赛版的严谨世界生成、地图或小说路线可以成为可选方法，但不能成为所有 Growth 的硬编码状态机。

世界生成只是第一条 Live（真实运行）基准，不是强制目录结构或产品类型。

### 2.3 滚动规划

Growth 保留长期目标，但只详细规划当前里程碑和少量下一步：

```text
理解目标与现有项目
→ 写入或更新当前计划
→ 执行一个有界阶段
→ 重读真实文件、图片任务和用户 Steer
→ 汇报阶段结果
→ 继续、等待或完成
```

小目标可以直接完成。较大的目标必须创建用户可见的 `创作计划.md`，并在方向变化、暂停和里程碑完成时更新。创建计划后立即执行，不增加计划审批门。

### 2.4 显式启动与单活动目标

- 只有 `/growth` 启动持久 Goal；普通自然语言任务不会被自动升级成长任务。
- Growth 启动成功后，界面必须立即显示已经启动及其真实状态，不能静默运行。
- 每个项目最多一个未终结 Growth Goal；活动、暂停和等待都占用该位置。
- 活动 Goal 存在时再次发送 `/growth`，默认视为对同一 Goal 的补充或转向；用户明确结束旧 Goal 后才能创建新 Goal。
- Agent 在重读关键产物并检查目标条件后可以自主完成 Goal，不需要用户点击“验收通过”。
- 用户可以显式重新打开已完成 Goal，再发送“继续”或新的补充方向；取消或失败的 Goal 不重开。

### 2.5 会话自由模式

- 新个人或项目会话默认使用“自由”：所有已启用的 Cline Act 工具自动批准；个人会话仍没有项目工具。
- 用户在会话界面可直接切换“审批 / 自由”；不恢复计划、审批、协作、自由四档。
- Growth 只以自由方式运行，不显示逐工具审批弹窗。用户若主动切到审批模式，`/growth` 在创建 Goal 前失败并提示切回自由，不静默改动用户选择。
- 这不是项目沙箱。Cline 的文件和 Shell 工具可能访问整台机器，用户明确接受自由模式属于全机信任边界。
- 不把 Cline Agent Tool Preset（智能体工具预设）切成 `yolo`，因为固定源码证据显示该工具集会禁用 Skills 等 Growth 需要的工具；应保留完整 Act 工具集并设置全局自动批准。这里不否定 Cline 同名 Tool Policy Preset（工具策略预设）的自动批准语义。

### 2.6 阶段汇报与卡住处理

每个 Cline Run 只是一个有界阶段。阶段结束前通过 `report_growth_progress` 返回：

- `continue`：目标未完成，Runtime 根据当前计划和真实项目状态启动下一 Run。
- `waiting`：需要用户信息、额度、凭据或其他可恢复条件。
- `completed`：目标条件已满足，停止继续调度。
- `failed`：当前 Goal 无法继续且不是等待用户即可恢复的问题。

Runtime 只检查文件、计划项和图片任务是否存在等低成本事实，不判断艺术质量。缺少阶段汇报时允许一次恢复回合；连续两次缺少汇报转为 `waiting`。连续三个阶段没有文件、图片或计划进展也转为 `waiting`，防止无限空转。

Goal 对自动调度的终态只有 `completed`、`cancelled` 和 `failed`；`paused` 与 `waiting` 都是可恢复状态。只有用户显式动作可以把 `completed` 重新打开，`cancelled` 与 `failed` 不重开。

### 2.7 Steer、暂停、退出与恢复

- Growth 运行时，用户发送的新消息默认走 Cline 原生 Steer（插话），在下一个安全模型边界生效，不强制中断当前工具。
- 暂停先阻止后续调度并立即请求 Abort（中止）当前 Cline Run，把 Goal 标为 `paused`，保留已经完成的文件和图片，并更新 `创作计划.md`。已经开始的工具副作用不回滚，真实取消时序必须验收。
- “继续”重读项目文件、计划与当前图片状态，在同一个 Goal 上启动新的 Cline Run。
- 结束 Growth 会 Abort 当前 Run，把 Goal 标为 `cancelled`，但不删除产物。
- 第一版关闭 CreatX 时停止当前 Run，把活动 Goal 保存为 `paused`；不在托盘或后台继续。重开后必须由用户明确发送“继续”。

### 2.8 生图队列

同步 `generate_image` 会阻塞当前 Cline Run，无法满足“图片生成时继续写作”。Growth 第一版改用 `submit_image_generation`：

- 提交后立即持久化任务并返回 `imageTaskId`。
- Electron Main Process（主进程）拥有一个后台 Worker（工作进程）；首版严格单 Worker、顺序生成。
- 状态为 `queued`、`generating`、`succeeded`、`failed`、`interrupted`。
- 成功结果沿用现有图片校验和 Project File Command Port（项目文件命令端口）落盘。
- Growth 可以在图片生成时继续文本阶段；目标声明为必需的图片必须成功后才能完成。
- 失败任务保持可见，Agent 可以修改 Prompt 后提交新的任务，不能把旧失败任务伪装为成功重试。
- 退出时排队任务保留，并在应用重开后继续顺序执行；正在生成的任务记为 `interrupted`，可能已经产生费用的中断任务不自动重提。
- 第一版不新增图片队列页面，状态通过已有活动、Growth 计划和文件投影展示。

## 3. 首条真实验收

用户只输入：

```text
/growth 创建一个自洽、可供后续小说和角色创作使用的中世纪世界。
请自主决定结构并持续完成整个目标，为重要内容配图。
```

验收必须在同一个真实 Electron 进程和项目中证明：

- 创建并持续更新 `创作计划.md`；
- 至少发生两个真实 Cline Run；
- Agent 自主创建互相关联的世界核心、环境、历史、群体、角色和冲突，不依赖固定文件模板；
- 生成一张真实地图和至少一张代表性图片；
- 使用真实 Provider、真实项目文件和注册工作台；
- 运行中接受“不要建立统一帝国，以多个相互竞争的城邦为核心”的 Steer；
- 暂停后从同一 Goal 继续；
- 全程不出现工具审批弹窗；
- Agent 重读结果、自主完成并停止继续调度；
- 重启后能看到完成 Goal、计划、文件、图片和工作台。

## 4. 明确不做

- 不恢复 NovelX 固定“世界 → 人物 → 小说”流水线。
- 不把普通自然语言请求自动升级成 Growth。
- 不实现子 Agent、并行阶段或多 Worker 生图。
- 不实现窗口关闭后的后台继续。
- 不实现精确续跑被中止的 Cline Run，也不自动重放在途工具或付费图片请求。
- 不实现图片编辑、图生图、复杂候选管理或专用队列页面。
- 不以 Runtime 的机械校验代替 AI 的创作判断。

## 5. 证据边界

固定 Cline `0.0.65` 已提供 Queue/Steer、Abort 和 Tool Policy；源码证据见：

- `D:\CodexW\Creatx\cline-baseline\sdk\packages\core\src\runtime\host\runtime-host.ts:192`
- `D:\CodexW\Creatx\cline-baseline\sdk\packages\core\src\runtime\host\local-runtime-host.ts:879`
- `D:\CodexW\Creatx\cline-baseline\sdk\packages\core\src\extensions\tools\presets.ts:84`
- `D:\CodexW\Creatx\cline-baseline\sdk\packages\shared\src\llms\tools.ts:7`

当前 CreatX 仍在 `creatx/packages/cline-adapter/src/index.ts` 把通配工具设为 `autoApprove: false`，Renderer 也会在 Run 期间禁用输入。因此本文只证明设计可以沿固定上游公开边界实现，不表示 Growth、自由模式、Steer UI 或队列已经完成。
