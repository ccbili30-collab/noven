# Live Run Product Archive Implementation Plan

状态：2026-08-06 已实现并完成首个正式 Profile 真实迁移。本文件只拥有 Live Archive 批次；已接受的 `.np` 便携项目包由 `../../plans/2026-08-10-portable-noven-project-package.md` 单独规划，不复用本状态机。

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 将完整 Growth Live 运行从隔离 Profile 安全、幂等地晋升为正式产品档案。

**Architecture:** 成功运行先导出最小 Inbox Bundle（收件箱包），正式桌面在 Store 打开前接收。每个事实由原 Store 所属包负责导入，协调层只复制项目、重算 Project ID、安排顺序并记录档案状态。

**Tech Stack:** TypeScript、Node `node:sqlite`、Bun、Electron、Cline SDK 0.0.65。

---

### Task 1: 各 Store 的幂等导入

**Files:**
- Create: `creatx/packages/cline-adapter/src/live-archive.ts`
- Create: `creatx/packages/growth-runtime/src/live-archive.ts`
- Create: `creatx/packages/image-runtime/src/live-archive.ts`
- Modify: `creatx/packages/session-runtime/src/index.ts`
- Test: 各包对应 `tests/*live-archive*`

先写失败测试，覆盖精确重试、ID 冲突、Project ID/路径重映射和图片排队任务中断；再实现最小 Store 所有者入口。

### Task 2: Inbox 导出和晋升协调器

**Files:**
- Create: `creatx/packages/live-archive-runtime/package.json`
- Create: `creatx/packages/live-archive-runtime/src/index.ts`
- Create: `creatx/packages/live-archive-runtime/tests/live-archive.node-test.ts`
- Modify: `creatx/tsconfig.json`

测试完整包只包含项目、选定数据库和关联会话 Artifact，不包含模型设置；测试重复晋升和失败保留。

### Task 3: 桌面与整本 Live 接线

**Files:**
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/package.json`
- Modify: `creatx/scripts/growth-world-pro-full-live-test.ts`

桌面在初始化各 Store 前接收 Inbox；整本脚本仅在既有 PASS 门禁之后导出。归档失败不得删除原运行。

### Task 4: 验收和首个真实迁移

从 `creatx/` 运行定向测试、`bun run typecheck`、`bun run test:imports` 和 `bun run build`。随后把 `nOIEx8 / OBvv9u` 导出到正式 Inbox，启动正式桌面完成晋升，核对项目、Owner 最终回复、Worker 数量、Goal/Issue/回执、图片状态和源目录仍存在。
