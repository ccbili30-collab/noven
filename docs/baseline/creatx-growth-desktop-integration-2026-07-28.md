---
title: Dynamic Growth 生产桌面接线证据
doc_type: implementation-evidence
owner: workspace-ui
status: task-8-production-integration-verified
last_verified: 2026-07-28
source_of_truth: docs/capabilities/workspace-ui/product-spec.md
---

# Dynamic Growth 生产桌面接线证据

## 已实现边界

生产 Electron Main 现在创建唯一 `GrowthGoalStore`、`GrowthProgressService`、`GrowthScheduler` 和 `GrowthLifecycleController`。`/growth` 只在项目 Session（会话）为自由模式时创建持久 Goal；审批模式失败关闭且不写 Goal。Main 注册 `report_growth_progress`，使用真实项目文件、计划和图片任务状态生成进度指纹，并通过稳定 Desktop API 提供 Goal 查询、暂停、继续和结束。

Goal Store 的成功写入产生 `growth.goal.changed` Event（事件）。Renderer 只读取稳定 Projection（投影），无 Goal 时不显示状态；存在 Goal 时显示真实状态、版本、waiting 原因和合法操作。会话的审批/自由切换已经可见；活动 Growth 不能离开自由模式，暂停或 waiting 后若切到审批，继续操作失败关闭。对话运行中的停止按钮在活动 Growth 中执行暂停，不会只中断当前 Cline Run 后让 Scheduler 继续。

图片队列事件复用现有活动行，成功后继续刷新同一文件投影；没有新增 Growth 页面或图片队列页面。本批没有用真实图片任务验证该组合路径。

第一个阶段由绑定可信 Goal 身份的 Cline Run 保存用户可见的 `/growth` 目标。后续内部阶段带稳定 `<creatx_internal_growth_stage>` 标记，Adapter 在历史投影中隐藏该内部用户 Prompt（提示词），但保留 Agent 回复、工具活动、文件和错误。Cline 仍是消息与 Run 的唯一权威，CreatX 没有保存第二份消息历史。

结束操作先把 Goal 持久化为 `cancelled`，再 Abort（中止）当前 Run，项目产物不删除。退出操作先把活动 Goal 持久化为 `paused`，再请求 Cline Abort；重启读取同一 Goal 且不自动续跑。

## 验收结果

2026-07-28 在 Windows、Bun `1.3.14`、Electron `42.3.3` 验证：

- `bun test`：`77 pass / 0 fail / 222 expect() calls`。
- `bun run test:growth-store`：Node 原生 SQLite 与生命周期 `28 pass / 0 fail`。
- `bun run test:image-queue`：`11 pass / 0 fail`。
- `bun run test:session-runtime`：`3 pass / 0 fail`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun run build`：生产构建通过；仍有仓库既有的上级 `@tsconfig/bun/tsconfig.json` 缺失警告。
- `bun run test:desktop`：生产 Main/Preload/Renderer、真实 Cline Adapter、真实 SQLite 和两个 Electron 启动通过；审批 `/growth` 无 Goal，切回自由后观察到 `active -> waiting`，waiting 原因、继续门禁、结束、三个视口、退出暂停、同一 `userData` 重启暂停和两个主进程回收均通过。

Electron 测试使用明确无效的 DeepSeek 测试凭据，真实上游返回未授权；错误被分类为 `provider_unauthorized`，没有用 Mock、Fixture（测试夹具）或本地模板冒充 Agent 成功。截图 `artifacts/walking-skeleton/desktop-growth-waiting.png` 证明用户目标保留、内部阶段 Prompt 隐藏、状态带与输入框无重叠；`1360x860`、`900x700`、`860x620` 均无页面溢出。

本批为 `ACC-CSK-301` 提供 Goal 启动与生产 Cline Run 尝试证据，为 `ACC-CSK-307`、`312`、`315` 提供生产 Electron 失败/恢复证据；`ACC-CSK-311` 的按钮和状态门禁已验证，但没有成功 Provider Run 中的暂停/继续证据。Workspace UI 的 Growth 状态验收 `ACC-WUI-012` 通过。

## 未完成与限制

本批没有使用有效文本 Provider，也没有调用真实 JMRAI 图片队列，因此不是 Dynamic Growth Live（真实运行）。没有证明至少两个成功 Cline Run、真实 Steer、成功工具自动批准、真实文件持续创作、文字与图片 HTTP 并行、地图/代表图、Agent 自主完成或图片任务活动行。

已有 active Goal 再次输入 `/growth` 时，活动 Run 可通过 Steer 接收补充；paused/waiting Goal 的新 `/growth` 仍失败关闭，必须先继续。当前 Goal Schema 不持久化“补充目标”，因此 `ACC-CSK-305` 的完整补充/转向语义尚未完成，不能用临时 Prompt 或第二套历史掩盖。

下一入口是 `docs/plans/2026-07-28-dynamic-growth-goal.md` Task 9：用有效 DeepSeek 与 JMRAI 在同一 Electron 项目运行完整长世界目标。若 Task 9 暴露 paused/waiting 补充需求，应先形成明确的数据模型决定，不在测试中临时改写 Goal instruction。
