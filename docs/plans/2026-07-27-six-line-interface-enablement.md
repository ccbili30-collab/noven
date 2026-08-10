---
title: Six-Line Interface Enablement Implementation Plan
doc_type: implementation-plan
owner: integration
status: complete
last_verified: 2026-07-27
implementation_commit: f289dd3
---

# Six-Line Interface Enablement Implementation Plan

**Goal:** 为六个候选 Worktree 冻结并实现最小、真实、可测试的共享接口，同时保持 `.creatx` Schema、图片 Provider 和未选产品行为继续阻塞。

**Architecture:** `@creatx/project-files` 成为项目根映射和内部文件 Query/Command Port 的唯一实现者；Renderer 仍只通过 `CreatXDesktopApi` 使用 `projectId/fileId`。`@creatx/contracts` 定义不依赖 Cline 的工具贡献合同，唯一 `cline-adapter` 把贡献转换为 Cline `extraTools` 并注入项目上下文和原生审批策略。

**Tech Stack:** TypeScript、Bun Test、Electron Main/Preload、Cline SDK `0.0.65`、Windows 原生文件系统。

## 当前范围

### 实现

- `ProjectFileQueryPort`：按 `projectId` 刷新项目、按 `fileId` 预览、按安全相对路径读取内部字节。
- `ProjectFileCommandPort`：按 `projectId + relativePath` 安全写入文本或二进制；支持可选修改时间冲突检查。
- `ProjectFileService`：由 Main 注册真实项目根并向下游提供 Query/Command Port；绝对路径不进入 Renderer 命令。
- `CreatXToolContribution`：中立工具名称、说明、对象 JSON Schema、项目/应用作用域、审批要求和失败关闭结果。
- Cline Adapter：把中立工具映射到公开 `createTool/extraTools`，为项目工具注入 `projectId`，并把工具审批合并进原生 Tool Policy。
- 六份候选任务书：改成引用真实接口、明确可开工范围和剩余门禁。

### 不实现

- `.creatx` Schema、Workbench 数据模型或注册命令。
- 任何 Creative Skill、图片 Provider、图片任务或 UI 入口。
- Watcher、版本、回收站、删除、重命名或目录移动。
- 新 Renderer IPC 命令；本批次只替换 Main 内部项目文件所有权。
- Cline Core 修改、第二 Harness 或工具权限旁路。

## 实现步骤

1. 在 `creatx/packages/project-files/tests/project-files.test.ts` 增加未知项目、绝对路径、路径逃逸、读写、二进制与冲突失败测试，并先确认失败。
2. 在 `creatx/packages/project-files/src/index.ts` 实现 Service、Query Port 和 Command Port；保留现有无状态查询函数供兼容调用。
3. 修改 `creatx/apps/desktop/src/main.ts`，移除 Main 自有路径 Map，改由 `ProjectFileService` 独占根映射。
4. 在 Contracts 测试和 Adapter 测试中定义中立工具贡献、项目作用域、审批策略、重复/内置名称拒绝和失败关闭行为，并先确认失败。
5. 修改 `creatx/packages/contracts/src/index.ts` 与 `creatx/packages/cline-adapter/src/index.ts`，使用 Cline 公开 `createTool` 和 `extraTools` 完成适配。
6. 更新六份任务书、协调入口、能力规格、`CONTEXT.md` 和对应 ADR；不解除仍缺 Schema/Provider 的门禁。
7. 运行 `bun run typecheck`、`bun test`、`bun run test:imports`、`bun run build`、`bun run test:desktop`、`bun run test:live`、`bun run test:electron-live`，并检查无残留进程。

## 完成条件

- 两类 Port 有真实实现和失败路径测试，不只是类型声明。
- 一个中立项目工具能进入真实 Cline Session 配置；工具执行缺少项目关联时失败关闭。
- Main 不再拥有第二份项目根 Map，Renderer 合同不扩散绝对路径。
- 六份任务书只声明当前接口确实支持的工作，后三条线不因接口名字存在而伪装为可执行。

## 停止条件

- Cline `0.0.65` 公开 `extraTools` 无法承载中立工具。
- 安全文件写入需要确定 `.creatx` Schema、版本数据库或不可逆迁移。
- 任一接口必须暴露绝对项目根给 Renderer 或让其他 Package 导入 Cline 类型。

## 执行结果

计划范围已由提交 `f289dd3` 完成。全部命令、首次 Live 脆弱断言及修正、Acceptance 映射和未完成边界见 `../baseline/creatx-six-line-interface-enablement-2026-07-27.md`。
