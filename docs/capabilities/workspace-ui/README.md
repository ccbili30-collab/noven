---
title: Workspace UI 能力线入口
doc_type: capability-entry
owner: workspace-ui
status: heritage-and-project-reference-bounded-electron-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/workspace-ui/product-spec.md
---

# Workspace UI（工作区界面）能力线

本能力线拥有生产 Electron Renderer（渲染层）中的主会话、Markdown 与项目图片显示、审批、文件/预览面板和按需工作台投影。它不拥有 Cline 执行事实、项目文件内容、工作台注册数据或桌面进程生命周期。

第一条骨架由 `creat1` 集成线同时接通真实前端与后端，不把 Renderer 交给独立 Worktree 先用 Fixture（测试夹具）猜合同。旧 `workspace-prototype` 已退出活动目录，其代码与未提交快照由清理标签和 `D:\CodexW\Creatx\archive` 保存，不是生产依赖。

2026-08-03 用户明确要求整个生产页面向 `creatx-redesign-preview` 新界面让步。生产 Renderer 采用全局项目导航、真实对话、动态工作台树和中央创作画布；文件与运行详情通过工作台标题栏按需打开，不再使用常驻检查器五区结构。旧玻璃壳、工具抽屉、右工作台轨、FLIP 形变和当前项目大卡片已退出入口。四个区间边界已成为带宽度门禁、键盘语义和 Renderer 本地持久化的可拖动分隔控件；项目导航使用用户提供的原始 SVG 飞鸟与 CreatX 文字品牌，并从持久会话投影项目/会话层级。置顶、显示别名和移除仅是 Renderer 本机偏好；删除是带确认和运行门禁的永久 Cline 历史删除，不实现归档。新版组件只消费真实 Runtime（运行时）投影，不带入预览 Fixture、固定世界分类、`data-command` 或假地图编辑。侧聊、主题设置与持久切换、模板和封面仍未进入生产。

同日新增同源 Web Preview（网页预览）：`preview/main.tsx` 用内存 Fixture 驱动同一个生产 `WorkspaceShell` 和 CSS，供浏览器热更新调整；Electron 仍由 `src/main.tsx → App` 接真实 Desktop API。Preview 不定义 `window.creatx`，不访问文件、Cline、Provider 或凭据，不是第二 UI Runtime，也不能作为 Live 证据。

当前前端/后端结合的产品证据见 `../../discussions/2026-07-28-frontend-electron-interface-decisions.md` 和 `../../baseline/creatx-chat-first-workspace-live-2026-08-05.md`。Prototype 的 `data-command` 不是 IPC；只有随真实 Main Handler 和失败路径一起落地的方法才能进入 Desktop API。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → 当前 Live 证据 → `../../product/creatx-product-understanding.md`。
