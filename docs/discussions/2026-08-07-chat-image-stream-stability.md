---
title: 对话图片流式稳定性
doc_type: discussion
status: implemented-and-automated-verified
date: 2026-08-07
capability: workspace-ui
---

# 对话图片流式稳定性

## 现场问题

包含多张项目图片的流式消息在“正在读取图片……”与完整图片之间反复切换，持续改变消息高度；Chat 中的图片同时沿用了接近作品展示的 `760px / 72vh` 上限，挤占对话阅读空间。

## 根因

`MessageMarkdown` 在每次渲染时都创建新的匿名 `img` 组件。流式文本追加使 React 看到不同组件类型，卸载并重新挂载 `ProjectMarkdownImage`，其 `dataUrl` 状态回到空值并再次调用 `readFile`。修复前确定性探针得到 `imageRendererStable=false`，回归测试能够稳定失败。

这不是图片文件、图片队列或 Provider 故障，不会损坏正文；影响是重复本机文件读取、加载文字闪回和对话布局抖动。

## 已接受行为

- Markdown 链接与图片使用模块级稳定渲染器，项目和文档归属通过 React Context 传递。
- 流式文本增长、普通父组件重渲染和未改变文件身份的项目投影刷新不得卸载已加载图片。
- 图片只在项目、文件 ID 或 `modifiedAt` 真实变化时重新读取，并重新判断宽图/普通图布局。
- Chat 图片最大宽度为 `460px`、最大高度为 `46vh`，窄区域继续受 `100%` 宽度约束。
- 工作台 Markdown 的 `760px` 通用上限及图文环绕规则保持不变。

## 验收边界

修复前回归测试为 2/3，新增用例稳定失败；修复后定向 3/3（15 次断言）、Typecheck、Import Boundary、全量 365/365（2,980 次断言）、Production Build 和 `git diff --check` 通过。没有启动 Electron 重放现场消息，因此真实多图流式视觉结果仍需下一 Build 实机验收。
