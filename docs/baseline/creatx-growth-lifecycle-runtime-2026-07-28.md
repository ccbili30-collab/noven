---
title: Growth Steer 与生命周期 Runtime 证据
doc_type: implementation-evidence
owner: creative-skills
status: task-6-runtime-verified
last_verified: 2026-07-28
source_of_truth: docs/adr/0009-dynamic-growth-goal-runtime.md
---

# Growth Steer 与生命周期 Runtime 证据

实现提交：`1dfe5c3`（`feat(growth): add lifecycle controls`）。

## 已实现边界

Cline Adapter 新增稳定 `steer` 与 `abortRun` 命令。Steer 只接受当前进程内确实有活动 Run 的 Session，并通过 Cline SDK `0.0.65` 公开的 `core.send({ delivery: "steer" })` 进入 Pending Prompt（待处理提示）；它不启动第二个 Run，也不先 Abort。普通发送在同一 Session 已有活动 Run 时失败关闭，所有成功、失败和取消路径都释放活动标记。

`@creatx/growth-runtime` 新增 `GrowthLifecycleController`。活动 Goal 可以 Steer；暂停先以乐观版本把 Goal 持久化为 `paused`，再请求 Cline Abort；Abort 失败时错误向上返回，但 Goal 不恢复为 active。继续只允许 `paused/waiting → active`，随后使用现有 Scheduler 重读当前持久状态并启动同一 Goal。启动恢复把遗留 `active` Goal 转为 `paused`，不会自动重放 Run；退出控制会先暂停所有活动 Goal，再并行请求 Abort，失败集中报告。

Renderer 在活动 Cline Run 期间保持输入可用，并通过新增 Main/Preload `steerMessage` IPC（进程间通信）发送新方向；停止按钮仍独立存在。当前 UI 对所有活动项目 Run 提供该能力，因为生产 Main 尚未接入 Growth Goal Projection（界面投影）。Growth 专属状态、暂停、继续和结束控件仍属于 Task 8。

## 验收结果

2026-07-28 在 Windows、Node `24.15.0`、Bun `1.3.14` 验证：

- `bun run test:growth-store`：真实 `node:sqlite`，`26 pass / 0 fail`。
- `bun test packages/cline-adapter/tests/projection.test.ts`：`21 pass / 0 fail / 46 assertions`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun test`：CreatX Bun 全量 `72 pass / 0 fail / 217 assertions`。
- `bun run build`：生产构建通过；仍有仓库既有的上级 `@tsconfig/bun/tsconfig.json` 缺失警告。
- `bun run test:desktop`：生产 Electron 验证 `steerMessage` 已从 Main/Preload 暴露、Renderer 无错误、三个视口无溢出、正常退出且工作区 Electron 进程无残留。

生命周期测试覆盖 Steer 不 Abort 或改写 Goal、暂停先持久化、迟到阶段不能续排、继续同一 Goal、重启只恢复为暂停、退出先暂停全部 Goal，以及单次和多次 Abort 失败。Adapter 测试覆盖显式 `delivery: "steer"`、空输入失败关闭和空闲 Session 拒绝 Steer。

## 未完成与限制

生产 Main 尚未实例化 `GrowthGoalStore`、`GrowthScheduler` 或 `GrowthLifecycleController`，`/growth` 也尚未创建并启动持久 Goal。因此应用退出时暂停 Goal、重启恢复和用户“继续”目前只有 Runtime 测试证据，不是 Electron 用户流程证据。

本批没有调用真实 Provider（模型服务），没有证明 Steer 被模型在安全边界消费，也没有证明执行中工具 Abort 的真实行为。`ACC-CSK-310`、`311` 和 `312` 只获得底层合同或 Runtime 部分证据，均未完整通过。Task 6 没有实现 Growth 结束命令、图片队列、Growth 状态条或暂停/继续按钮。

下一入口是 Dynamic Growth 计划 Task 7 的持久单 Worker 生图队列。Task 8 再把 Goal 生命周期与可见控制接入生产 Main/Renderer；Task 9 才能进行完整真实 Electron Growth Live。
