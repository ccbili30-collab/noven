---
title: 艺术库正式化与本地图片收藏
doc_type: discussion
owner: art-library
status: proposed-for-review
date: 2026-08-10
supersedes: docs/discussions/2026-08-08-personal-art-library-tools.md 的“第一版只收集公开网页图片”边界
---

# 艺术库正式化与本地图片收藏

## 用户意图

- 现有个人总艺术库不能只支持公网 URL；用户发送到普通对话里的图片，以及当前项目里的图片，也应能由同一个 AI 工具完成识图、分类和送审。
- 艺术库必须成为正式功能：候审、分类、批准、驳回和风格词导出都应读取真实本机文件，而不是由静态 iframe 或 `localStorage` 决定事实。
- 仍保留一个全局个人总库，不建立专属艺术库 Agent，也不把艺术库绑定到某个创作项目。

## 从既有产品规则推导的不变量

- “收藏”复制图片字节到个人艺术库，不移动、删除或改写对话附件原文件和项目文件。
- 公网、对话附件和项目图片必须汇入同一个 `incoming → approval → libraries` 文件状态机，使用同一套签名校验、尺寸限制、SHA-256 去重、识图元数据和人类审批规则。
- Renderer（渲染进程）和模型不能提交任意绝对路径。当前项目身份、当前会话身份和当前回合附件集合必须由可信 Runtime（运行时）上下文提供。
- 人类在艺术库审批页明确点击批准或驳回，就是最终人类决策；Agent 调用审批工具时仍走既有 Tool Policy（工具策略）。
- 真实原图继续位于 Electron 用户数据根，Renderer 只通过受限只读协议读取，不获得绝对路径。

## 当前证据

- 当前 Runtime 只接受 `query/count/sourceUrls`，无法引用对话附件或项目文件。
- 当前正式 Profile 已有 57 个批准目录和 6 个候审目录，均包含真实原图、`metadata.json` 和 `source.json`。
- 当前艺术库页面仍是静态 iframe，审批决定写入 `localStorage`，没有接入真实 Runtime 快照。

## 待提升到权威规格的规则

- 增加当前回合附件和当前项目图片两种受信任来源。
- 增加真实艺术库查询、受限图片读取、审批命令、分类展示和风格词导出 Desktop 合同。
- 静态 Art Atlas 只保留为幂等种子来源，不再作为生产页面的数据权威。
