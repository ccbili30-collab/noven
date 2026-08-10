---
title: Growth 一次性阶段会话 Runtime 基线
doc_type: baseline-evidence
owner: creative-skills
status: targeted-runtime-verified
last_verified: 2026-07-29
---

# Growth 一次性阶段会话 Runtime 基线

## 目标与边界

本批解决 Growth 长任务在同一个 Cline Session 中持续累积完整对话上下文的问题。保持一个持久 Growth Goal 和一个用户可见 Owner Session；每个阶段创建新的隐藏 Cline Worker Session，阶段结束后停止 Worker。没有新增数据库迁移、第二 Harness（智能体运行框架）、子 Agent、并行阶段、前端或图谱能力。

## 实现

- `runGrowthStage` 通过 Cline SDK `0.0.65` 的公开 `ClineCore.start` 创建普通独立 Session。
- Worker 持久元数据标记内部角色、Owner Session、Goal ID 和版本；普通会话列表过滤该角色。
- Worker 使用 Owner 的项目、Provider、Skill、工具与当前权限模式，但不接收 Owner 或前一 Worker 的消息历史。
- Worker 的审批、工具活动、错误和 Run 状态在当前进程映射为 Owner Session 事件。
- Steer、Abort 和 Cancel 在 Worker 活动时路由到 Worker，否则使用 Owner。
- 阶段 `finally` 调用公开 `ClineCore.stop`，释放活动资源并保留 Cline 历史用于审计。
- `report_growth_progress` 仍依赖 Runtime 注入的 Goal ID、版本和项目 ID；不信任模型输入中的身份，也不要求 Worker ID 等于 Owner ID。

## 验收

从 `D:\CodexW\Creatx\creat1\creatx` 执行：

```text
bun test packages/cline-adapter/tests/attachments.test.ts packages/cline-adapter/tests/projection.test.ts
29 pass, 0 fail

bun run test:growth-store
33 pass, 0 fail

bun run typecheck
PASS

bun run build
PASS

bun run test:imports
Cline import boundary: PASS
```

集成测试使用真实 Cline Store 和两个 Provider 请求探针，证明：

- 两个串行阶段创建不同 Session。
- 第二阶段 Provider 请求不包含第一阶段提示或回复。
- `listSessions` 只返回 Owner。
- 对外事件中的 Session ID 只有 Owner。
- 正常完成后 `ClineCore.stop` 成功。

控制路由使用确定性测试证明活动 Worker 优先；没有用 Mock（模拟）Abort 把不稳定的全局异常冒充完整取消证据。

## 未完成与风险

- 本批没有调用真实远程 Provider，也没有运行完整 Electron Growth Live。
- 尚未在真实活动工具中证明 Steer、暂停 Abort、继续新建 Worker、重启和退出回收的连续用户流程。
- Cline 保存停止 Worker 的历史，但 `readMessages(ownerSessionId)` 不会聚合 Worker 历史。运行时事件可见，重启后阶段过程正文不会重新出现在 Owner 对话；正式项目文件和 Goal 状态仍可恢复。
- `bun run build` 继续输出既有的根 `tsconfig` 基础配置警告，但构建成功；本批没有修改该配置。
- 没有运行仓库全量测试；验证范围是 Adapter、Growth Runtime、类型、生产构建和 Import Boundary。

## 下一入口

在同一个真实 Electron Growth World 任务中依次证明：Owner 启动 → Worker A → Worker B 且上下文隔离 → Steer 命中当前 Worker → 暂停中止当前 Worker → 继续创建 Worker C → 重启恢复项目文件与 Goal → 退出无残留进程。图谱与图检索另开产品讨论，不属于本批实现。
