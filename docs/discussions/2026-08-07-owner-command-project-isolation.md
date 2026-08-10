---
title: Owner 命令项目隔离
doc_type: discussion
status: implemented-and-automated-verified
date: 2026-08-07
capability: growth-runtime
---

# Owner 命令项目隔离

## 现场问题

用户在一个新项目发送 GWP 指令时，另一个项目正在恢复 Growth。Renderer 返回 `growth_conflict: another Owner command is still awaiting recovery`，导致互不相关的项目无法同时启动 Owner 主链。

现场证据确认旧 Growth 位于 `D:\ceshi`，新命令位于另一个项目；两者没有项目文件或 Goal 归属重叠。根因是 Renderer 只使用全局 `creatx.pending-owner-command.v1` 单槽保存未决命令，把“同一项目不能有冲撞的双主任务”错误扩大成“整个软件只能有一个待恢复 Owner 命令”。

## 接受的产品语义

- 不同项目的 GWP 可以同时存在、运行和恢复，彼此不构成冲突。
- Renderer 按 Owner Session 保存恢复身份，不建立跨项目全局互斥。
- 同一 Session 的另一条不同未决命令仍失败关闭，防止覆盖稳定 requestId。
- 同一项目是否存在冲撞的主任务，继续由 Growth Runtime 的 Goal 与写入门禁判断。
- 一个恢复记录失败、损坏或被清理，不得删除另一项目的记录；后台恢复错误不得投影到当前无关会话。

## 实现边界

`owner-command-recovery.ts` 使用版本化集合 `creatx.pending-owner-commands.v2` 保存多条记录，并按 Session 隔离。旧 `v1` 显式 Growth 命令在首次读取时迁移，原 requestId 保持不变；损坏记录逐条丢弃，不连带删除其他有效记录。启动时 Renderer 并行恢复各条命令，完成后统一刷新 Bootstrap（启动快照）。Resume 记录新增 Renderer 私有的 Session 归属，不改变公开 IPC 合同或 Growth 数据库。

本批没有修改正式 LocalStorage、Growth Store、用户项目文件或正在运行的 Goal，也没有自动重发现场失败的 GWP。

## 验收

- Owner 恢复定向测试：5/5，通过，17 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：通过。
- `bun run test`：364/364，通过，2,979 次断言。
- `bun run build`：通过。
- `git diff --check`：通过。

上述验证没有调用真实 Provider，也没有启动 Electron 执行两个真实项目的并行 GWP，因此真实付费并行运行仍需新 Build 的用户级验收。
