# Dynamic Growth Goal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现由 `/growth` 显式启动、可跨多个 Cline Run 滚动执行、可 Steer/暂停/继续并能异步生成图片的持久创作目标。

**Architecture:** Creative Skills 拥有 Growth 方法和产品语义；CreatX 持久 Goal 只编排有界 Cline Run，不复制 Cline 消息、Run 或工具事实；Image Runtime 拥有持久单 Worker 图片队列。所有桌面行为通过现有 Contracts、Main/Preload 和 Renderer 投影接入。

**Tech Stack:** TypeScript、Bun、Electron、React、Cline SDK `0.0.65`、SQLite、现有 `@creatx/contracts`、`@creatx/cline-adapter`、`@creatx/project-files`、`@creatx/image-runtime`。

---

## 批次边界

允许范围：Growth Goal、`/growth`、阶段调度、审批/自由切换、Steer、暂停/继续、持久单 Worker 生图队列、最小 Renderer 投影和完整 Live。

明确不做：固定世界模板、子 Agent、并行 Growth 阶段、多图片 Worker、后台托盘继续、精确恢复中断 Run、图片编辑、图生图、队列专页、四档权限和 Cline Core 修改。

停止条件：需要修改 Cline Core；必须复制 Cline 消息/Run 才能实现；自由模式无法通过公开 Tool Policy 保留完整 Act 与 Skills；数据迁移会破坏现有会话、工作台或图片；付费图片的结果未知无法失败关闭。

每个任务遵循 Red-Green-Refactor（红-绿-重构）：先写会失败的定向测试，再实现最小行为，最后只整理当前能力边界。测试从对应 `creatx` 包运行，不从仓库根运行旧 NovelX 测试。

## Task 1：冻结 Growth 合同和持久 Schema

**状态：** Implemented and targeted-test verified（已实现并通过定向测试），2026-07-28。完整 Growth Live 尚未开始；证据见 `../baseline/creatx-growth-goal-store-2026-07-28.md`。

**主要能力：** `creative-skills`；相邻：`contracts`、桌面持久化。

**修改：**

- `creatx/packages/contracts/src/**`：增加稳定 Growth Command、Projection、Event 和错误码。
- 新建或选定 `creatx/packages/growth-runtime/**`：只保存 Goal 产品状态和调度接口。
- 对应包测试与迁移文件。

**合同至少包含：** `goalId`、`projectId`、`sessionId`、原始目标、状态、`planFileId`、必需图片任务 ID、创建/更新时间和乐观并发版本；不得保存 Cline Run 复制体、消息或工具日志。

**先写测试：** 一个项目只有一个未终结 Goal；创建幂等；非法状态迁移失败；完成/取消/失败终态不被迟到阶段覆盖；只有显式用户动作可把 completed 重新打开为同一 Goal，cancelled/failed 不可重开；重启读取同一 Goal；损坏记录失败关闭且普通项目文件仍可打开。

**验收：** 定向测试全部通过；Schema 与 ADR-0009 一致；没有 Renderer、Cline 私有类型或图片 Provider 字段进入 Goal 表。

## Task 2：实现 Growth Skill 与显式命令解析

**状态：** Implemented and contract-test verified（已实现并通过合同测试），2026-07-28。解析尚未接入 Goal 启动；证据见 `../baseline/creatx-growth-skill-contract-2026-07-28.md`。

**主要能力：** `creative-skills`。

**修改：**

- `creatx/packages/creative-skills/src/**`
- Skill 安装清单和对应测试。

**行为：** 只有 `/growth` 加载 Growth Skill；教程包含滚动规划、`创作计划.md`、复读真实文件、阶段汇报、必需图片和完成检查。普通自然语言不创建 Goal。已有未终结 Goal 时 `/growth` 作为补充，不创建第二个。

**先写测试：** Skill 可被现有允许列表发现；中文内容 UTF-8 完整；普通消息不触发；显式命令保留用户正文；Living 不被自动组合。

**验收：** `ACC-CSK-301`、`302` 的合同测试通过；不引入固定目录或世界模板。

## Task 3：实现 `report_growth_progress` 与 Goal Store

**状态：** Implemented and runtime-test verified（已实现并通过 Runtime 测试），2026-07-28。尚未注册生产 Main或启动下一 Run；证据见 `../baseline/creatx-growth-progress-runtime-2026-07-28.md`。

**主要能力：** `creative-skills`；相邻：`growth-runtime`、中立 Tool Contribution。

**修改：**

- Growth Runtime 的 Store、状态转换和错误。
- `@creatx/contracts` 中立工具定义。
- `@creatx/cline-adapter` 仅负责注入可信 `projectId/sessionId/goalId` 并适配公开 Cline Tool。

**先写测试：** 拒绝模型伪造身份；拒绝未知产物与跨项目引用；`completed` 在必需图片未成功时失败；迟到汇报不能覆盖暂停/取消；重复汇报幂等；持久化失败不推进 Goal。

**验收：** `continue | waiting | completed | failed` 均形成唯一 Goal 状态结果；工具不直接启动下一 Cline Run。

## Task 4：实现串行多 Run 调度器

**状态：** Implemented and deterministic-runtime verified（已实现并通过确定性 Runtime 测试），2026-07-28；阶段会话策略已于 2026-07-29 被一次性隐藏 Worker Session 取代，证据见 `../baseline/creatx-growth-disposable-stage-sessions-2026-07-29.md`。生产 Electron 生命周期组合仍未 Live。

**主要能力：** `growth-runtime`；相邻：`cline-adapter`。

**修改：**

- Growth 调度器和阶段输入组装。
- Adapter 保留公开的有界阶段命令，但每次调用创建新的隐藏 Cline Worker Session；可见 Owner Session 和持久 Goal 不变，不暴露 Cline 类型。

**先写测试：** `continue` 串行启动下一阶段；同 Goal 永远只有一个活动 Cline Run；一次缺报告产生一次恢复回合；连续两次缺报告进入 `waiting`；连续三阶段无文件/图片/计划变化进入 `waiting`；旧 Run 迟到结果不能调度新阶段。

**验收：** 至少两个确定性阶段在测试中连续完成；Cline Run 事实仍只来自 Adapter；没有后台并行调度。

## Task 5：实现默认自由和审批/自由切换

**状态：** Implemented and runtime verified（已实现并通过 Runtime 验证），2026-07-28。默认自由、SQLite、Tool Policy、Main/Preload IPC 和失败关闭已完成；Renderer 可见控件与真实 Provider 自由工具运行尚未验收，证据见 `../baseline/creatx-session-permission-runtime-2026-07-28.md`。

**主要能力：** `session`；相邻：`cline-adapter`、`workspace-ui`。

**修改：**

- Session 产品配置与 Contracts。
- `creatx/packages/cline-adapter/src/**` 的公开 Tool Policy 映射。
- Main/Preload 的会话命令；本任务只提供最小控制，不做视觉重构。

**先写测试：** 新项目会话默认为自由；自由映射为完整 Act 工具集加 wildcard auto-approve；Skills 保持启用；审批模式恢复逐次审批；个人会话即使自由也没有项目工具；切换只影响后续工具调用；未知档位失败关闭。

**验收：** `ACC-SES-004`、`006` 至 `009` 通过；不得把 Cline Agent Tool Preset（智能体工具预设）切成 `yolo`；全机信任文案进入稳定 Projection。

## Task 6：接入 Steer、暂停和继续

**状态：** Implemented and runtime verified（已实现并通过 Runtime 验证），2026-07-28。Adapter、生命周期控制器、Desktop Steer IPC 和活动 Run 输入已完成；Growth Main 接线与真实 Provider Live 尚未完成，证据见 `../baseline/creatx-growth-lifecycle-runtime-2026-07-28.md`。

**主要能力：** `growth-runtime`；相邻：`session`、`cline-adapter`。

**修改：**

- Adapter 暴露稳定 Steer 和 Abort 命令。
- Growth Runtime 处理运行中输入、暂停、取消和继续。
- Renderer composer 在 Growth 活动时保持可输入。

**先写测试：** 运行中消息以 `delivery: "steer"` 发送；Steer 不直接 Abort；暂停先阻止新调度再 Abort；迟到 Run 不能写 Goal 状态；继续重读计划/文件/图片后启动同一 Goal；关闭应用把活动 Goal 标为暂停；重启不自动继续。

**验收：** `ACC-CSK-306` 至 `311` 与 `315` 的既有 Runtime 不变量保持通过；本任务新增 `ACC-CSK-310` 至 `312` 的合同和 Runtime 部分证据。生产 Main 尚未实例化 Growth 生命周期，因此这些用户流程不得标为完整通过。

## Task 7：实现持久单 Worker 生图队列

**状态：** Implemented and runtime verified（已实现并通过 Runtime 验证），2026-07-28。SQLite Store、顺序 Worker、中立工具、Electron Main 生命周期和稳定 Event 已完成；真实 Cline/JMRAI 后台队列 Live 尚未完成，证据见 `../baseline/creatx-image-queue-runtime-2026-07-28.md`。

**主要能力：** `image-runtime`。

**修改：**

- `creatx/packages/image-runtime/src/**` 的任务 Store、队列和 `submit_image_generation`。
- Electron Main 的 Worker 生命周期接线。
- Contracts 中图片任务 Projection/Event；复用现有 Provider 与 Project File Command Port。

**先写测试：** 提交立即返回 ID；FIFO（先进先出）且最多一个 generating；重启后 Worker 继续 queued；退出把 generating 变为 interrupted；interrupted 不自动重提；成功落盘并重读；失败保留错误分类；相同幂等键不重复收费；目标路径冲突不覆盖。

**验收：** `ACC-IMG-011`、`012`、`015` 至 `017`、`019` 获得 Runtime 证据；`013`、`014` 和 `018` 只有部分合同或组合证据。Provider 凭据未进入 Renderer、Goal Store 或队列表；真实文字 Run 与图片 HTTP 并行等待 Task 9。

## Task 8：连接最小 Renderer Growth 状态

**状态：** Implemented and production-integration verified（已实现并通过生产集成验证），2026-07-28。使用无效测试凭据验证真实 Provider 未授权失败关闭，没有成功文本或图片 Provider，因此不是 Dynamic Growth Live；证据见 `../baseline/creatx-growth-desktop-integration-2026-07-28.md`。

**主要能力：** `workspace-ui`；相邻：`growth-runtime`、`session`、`image-runtime`。

**修改：**

- 生产 Renderer、Main/Preload 和 Desktop API 稳定合同。

**行为：** 必须显示 Growth 已启动、当前状态和真实活动；提供审批/自由切换、暂停、继续和结束；运行时 composer 可 Steer；图片任务通过现有活动/文件投影可见。第一版不新增专用 Growth 或队列页面。

**先写测试：** 启动状态可见；按钮状态与 Goal 状态一致；运行中可输入；waiting 显示真实原因；无 Growth 时不显示虚假进度；窄窗口不遮挡输入和控制。

**验收：** 组件与 Electron 集成测试通过，并以桌面/窄窗口截图检查无重叠；不得使用 Fixture 作为 Live。

## Task 9：完整真实 Electron Growth Live

**主要能力：** `creative-skills` 集成批次。

**前置：** Tasks 1-8 代码冻结，定向测试和生产构建通过；配置真实文本 Provider 与 JMRAI 图片 Provider。

**步骤：**

1. 新建干净项目并输入发现记录中的中世纪世界 `/growth` 指令。
2. 记录 Growth 启动可见、无审批弹窗、`创作计划.md` 与至少两个 Cline Run。
3. 中途发送城邦 Steer，确认后续真实文件采用新方向。
4. 暂停，确认没有继续调度；发送“继续”，确认同一 Goal 恢复。
5. 等待真实地图和代表性图片成功落盘，并核对预览读取同一文件。
6. 确认 Agent 自主完成并停止调度。
7. 正常退出，检查无残留 CreatX 测试进程；重启确认 Goal、计划、工作台、文件和图片恢复。

**验收：** `ACC-CSK-312` 至 `314` 和相关 Image/Session 验收具有同一进程连续证据；`ACC-CSK-315`、`316` 另有真实 Electron 集成证据。任何 Mock、Fixture、人工补文件、跳过图片或手工改数据库均判失败。

## Task 10：收口证据与提交

**修改：**

- 新增 `docs/baseline/creatx-growth-live-2026-*.md`。
- 更新 `CONTEXT.md`、`BASELINE.md`、能力 README、验收矩阵和需求归属图。

**检查：** 记录真实命令、测试数量、Provider、截图、失败与恢复、残留进程检查和 Commit（提交）哈希；区分定向、全量和 Live。

**完成条件：** 文档不把第一条世界基准描述为固定模板；不把 Goal Runtime 称为第二 Harness；不宣称后台继续、子 Agent、多 Worker、图片编辑或严格沙箱已完成。
