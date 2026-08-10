---
title: Growth Goal Store 实现证据
doc_type: implementation-evidence
owner: creative-skills
status: task-1-verified
last_verified: 2026-07-28
source_of_truth: docs/adr/0009-dynamic-growth-goal-runtime.md
---

# Growth Goal Store 实现证据

## 已实现边界

`@creatx/contracts` 已冻结 Growth Goal 的 Command（命令）、Projection（投影）、Event（事件）与分类错误。`@creatx/growth-runtime` 独占 Goal 产品状态、V1 SQLite Schema（数据合同）、状态转换和乐观并发版本。

V1 表只保存 Goal 身份、项目与会话关联、原始目标、状态、计划文件 ID、必需图片任务 ID、时间戳和版本。它不保存 Cline 消息、Run、工具调用、Provider 字段或 Renderer 状态。

数据库通过部分唯一索引强制每个项目最多一个 `active | paused | waiting` Goal。创建使用 `requestId` 对完全相同请求幂等；同一 ID 的不同内容、第二个未终结 Goal和过期版本写入均失败关闭。普通状态转换不能离开终态，只有独立的用户重开命令可以把 `completed` 恢复为同一 `goalId`；`cancelled` 与 `failed` 不可重开。

## 验收结果

2026-07-28 在 Windows、Node `24.15.0`、Bun `1.3.14` 验证：

- `bun test packages/contracts/tests/errors.test.ts packages/growth-runtime/tests/state.test.ts`：`16 pass / 0 fail / 24 assertions`。
- `bun run test:growth-store`：Node 原生 `node:sqlite`，`7 pass / 0 fail`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun test`：CreatX 全量 `59 pass / 0 fail / 177 assertions`。

持久测试覆盖创建幂等、单未终结 Goal、乐观版本、迟到终态写入、显式用户重开、不可重开状态、关闭重启读取、损坏 SQLite、损坏行数据和未知 Schema 版本拒绝。损坏库不会被自动重建；构造失败会释放 Windows 文件句柄。独立真实项目文件在损坏测试后仍可读取。

## 未完成与限制

本证据不是 Provider（模型服务）或 Electron Live（真实运行）。`/growth` 解析、Growth Skill、阶段汇报、调度器、自由模式、Steer、暂停/继续、生图队列、Main/Preload、Renderer 和完整世界生成均未接入。

当前 Store 尚未连接项目打开链，因此“普通文件仍可用”只验证了独立磁盘文件不受损坏 Growth 数据影响，没有形成 Electron UI 故障验收。Schema 目前只有 V1 新建和版本拒绝；后续版本迁移必须另行设计与测试，不能覆盖未知版本。
