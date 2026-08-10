---
title: Session 审批与自由模式 Runtime 证据
doc_type: implementation-evidence
owner: session
status: task-5-runtime-verified
last_verified: 2026-07-28
source_of_truth: docs/capabilities/session/product-spec.md
---

# Session 审批与自由模式 Runtime 证据

实现提交：`81a3bda`（`feat(session): add free permission mode`）。

## 已实现边界

新项目会话默认保存为 `free`，会话可通过稳定 Desktop API 在 `approval` 与 `free` 间切换。独立 `@creatx/session-runtime` SQLite 只保存 CreatX 拥有的 `sessionId/kind/mode` 产品配置；Cline 继续独占消息、Run、工具事实和历史。旧会话首次读取时建立默认自由配置，模式重启后恢复；未知 Schema、损坏档位、会话种类变化和不存在的会话失败关闭。

Cline Adapter 使用同一个原地 Tool Policy 对象切换后续工具行为。项目自由模式保持完整 Act wildcard、Skills 和 CreatX 项目工具启用并自动批准；审批模式恢复逐次审批规则；个人会话即使为自由也关闭 wildcard 和项目工具。实现没有切换到 `yolo`，没有修改 Cline Core，也没有把项目目录声明为沙箱。

Main/Preload 已提供权限切换 IPC 和全机信任 Projection。新建 Session 后若权限持久化失败，Cline 记录与 Adapter 内活动映射一并清理。Electron Main bundle 显式包含所有直接导出 TypeScript 的 CreatX 工作区包，避免 Electron 原生加载未编译 TypeScript。

## 验收结果

2026-07-28 在 Windows、Node `24.15.0`、Bun `1.3.14` 验证：

- `bun run test:session-runtime`：真实 `node:sqlite`，`3 pass / 0 fail`。
- `bun test tests\projection.test.ts`（`creatx/packages/cline-adapter`）：`20 pass / 0 fail / 42 assertions`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun test`：CreatX 全量 `71 pass / 0 fail / 213 assertions`。
- `bun run build`：生产构建通过；仍有仓库既有的上级 `@tsconfig/bun/tsconfig.json` 缺失警告。
- `bun run test:desktop`：生产 Electron 中验证新项目会话默认为自由、切到审批、全机信任文案、真实文件/工作台投影、正常退出且 PID 不残留。

Desktop 探针没有调用 Provider。它证明 Main/Preload/SQLite/IPC 的真实生产路径，不是完整用户创作 Live。

## 未完成与限制

Renderer 尚无用户可见的审批/自由切换控件或自由模式持续标识，因此 `ACC-SES-004`、`006` 和 `007` 未完整通过。自由模式还没有用真实 Provider 执行文件、Shell、Skill 或 CreatX 工具；个人会话也没有创建 UI 或 Live，因此 `ACC-SES-008`、`009` 只有策略合同证据。

本批没有接入 Growth Scheduler、Steer、暂停/继续、图片队列或 Task 6。两档都不是项目沙箱；自由模式是明确的全机信任边界。下一入口是 Dynamic Growth 计划 Task 6，在接入 Growth 前仍需由后续 UI 批次补可见模式控制。
