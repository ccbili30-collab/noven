---
title: Workspace UI 实现计划
doc_type: capability-plan
owner: workspace-ui
status: conversation-markdown-image-live
last_verified: 2026-07-29
---

# Workspace UI 实现计划

## 第一批：集成骨架

由 `creat1` 集成线在同一批次接通生产 Renderer、Main/Preload、Cline Adapter 和真实文件投影。只实现主会话、输入、流式/终态、审批、取消、文件和预览；侧聊、主题系统、完整注册工作台和高级导航不进入本批。

状态：已由提交 `c9a4ae4` 完成并通过连续 Electron Live 验收。

## 当前集成批次

ADR-0007 的第一条工作台 UI 已由 `creat1` 按 `../../plans/2026-07-27-register-workbench-vertical-slice.md` 纵向集成，并通过三个视口与真实 Provider 验收。后续 `workspace-ui` Worktree 只能选择不需要新 Desktop API 或共享合同的具体 `ACC-WUI-*`，不能自动继续扩张。

停止条件：需要 Cline 私有事件、需要 Fixture 冒充生产状态、必须改变共享合同或真实 IPC 才能继续。

## 会话内容批次

生产 Renderer 使用成熟 Markdown/GFM 解析器显示消息。项目图片复用 `ProjectSnapshot` 和 `readFile(projectId, fileId)`，不改变 Desktop API、Cline 消息投影或持久化。图片工具只需在最终回复写出项目相对 Markdown 图片；不存在或越界来源失败关闭。
