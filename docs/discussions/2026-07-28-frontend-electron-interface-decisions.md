---
title: 前端接入 Electron 的按钮语义与接口边界
doc_type: discovery-record
primary_capability: workspace-ui
status: confirmed-for-interface-planning
date: 2026-07-28
---

# 前端接入 Electron 的按钮语义与接口边界

本记录保存 Web Prototype（网页原型）接入生产 Electron 前，用户对项目、备忘录、附件、回收站、侧聊和壁纸的确认。它是后端接口计划的产品证据，不是 Runtime（运行时）实现或 Live（真实运行）声明。

## 已确认语义

### 项目入口

- 原型的 `project.create` 不创建目录、模板或项目副本。
- 它打开用户选择的已有文件夹，并沿用现有 `chooseProject()` 生产语义。
- 生产界面应使用“打开项目”或“添加已有项目”等不会暗示目录创建的可访问名称。

### 可对话备忘录

- 每个项目拥有一份可编辑备忘录。
- 备忘录同时是一个可与 AI 对话的项目表面，AI 的职责是帮助整理内容，而不是只把输入转发到普通主会话。
- 用户可以直接修改备忘录正文，AI 也可以修改同一份正文。
- 备忘录对话不混入普通会话树；用户从项目会话树内嵌的备忘录表面进入和恢复它。
- AI 对话历史继续由 Cline 拥有，CreatX 不复制消息或 Run（执行轮次）。
- 备忘录正文必须是项目内真实 Markdown 文件，不能只保存在 Renderer 状态或消息数据库中。

### 外部文件附件

- 用户选择附件时，不把外部真实文件复制进项目。
- 界面显示文件引用或链接。
- 用户的显式选择授权 Agent 在本次消息中读取该文件，不自动授予写入或删除权限。
- Cline SDK `0.0.65` 的公开 `SendSessionInput.userFiles` 已支持文件路径附件。CreatX 应复用该能力，不建立第二套附件内容库。
- 文件在发送前缺失或无法读取时必须失败并允许用户移除或重新选择，不能把空内容冒充成功附件。

### 回收站和侧聊

- 回收站、删除和恢复不进入本次接口接线；对应入口在生产界面隐藏。
- 侧聊继续延期；全部 `sidechat.*` 原型命令不进入本次生产接口。
- 不为延期能力增加返回固定失败或“即将推出”的占位 IPC（进程间通信）。

### AI 更换壁纸

- 不增加一个绕过 Agent 的“直接生成壁纸”后端流程。
- 应提供 Project Theme Skill（项目主题技能），让 AI 知道项目主题的权威文件、字段和壁纸文件约束。
- AI 调用现有图片生成能力，把图片保存到项目内约定位置，再更新同一份项目主题文件中的壁纸引用。
- 图片必须先成功成为项目真实文件，主题才能引用；外部临时 URL 不能成为正式壁纸。
- Renderer 手动调整与 AI 调整必须读取、预览和应用同一份主题合同，不能维护两套主题状态。

## 直接映射，不需要新增后端语义

| 原型命令 | 生产处理 |
| --- | --- |
| `project.select` | `openProject(projectId)` |
| `project.create` | 复用 `chooseProject()`，界面文案改为打开已有项目 |
| `session.open` | Renderer 选中后调用 `readMessages(sessionId)` |
| `composer.send` | 空闲调用 `sendMessage`，活动 Run 调用 `steerMessage` |
| `composer.permission` | `setSessionPermissionMode` |
| 文件、预览和 Artifact 点击 | `readFile(projectId, fileId)` |
| 工作台展开 | `readWorkbenches(projectId)`；展开状态归 Renderer |
| 折叠、拖动、复制、工具页签、工作台切换 | Renderer 本地行为 |
| 调参器、玻璃实验 | 仅原型能力，不进入生产后端 |
| 固定小说和世界按钮 | 不建立固定 NovelX 后端；继续投影真实文件与注册工作台 |

## 技术所有权，不再要求用户决定

- 备忘录文件的保留路径、Schema（数据合同）、乐观冲突门禁和原子写入由 Project Files 与 Project Memo 能力设计。
- 备忘录专用会话的 `purpose/visibility` 元数据由 Session 能力持久化；Cline 继续独占消息和 Run。
- 附件选择由 Electron Main Process（主进程）拥有；Renderer 不自行读取任意本机路径。
- 主题 Schema、版本、损坏隔离和迁移由 Project Theme 能力设计；字体使用可验证目录 ID，不持久化任意 CSS 字符串。
- Skill 只教 AI 使用稳定合同，不成为路径验证、权限或主题 Schema 的唯一执行保护。

## 明确非目标

- 新建目录、模板项目和项目导入。
- 外部附件复制、上传、修改或删除。
- 回收站、版本历史和删除恢复。
- 侧聊及其临时生命周期、回传和重启恢复。
- 固定小说、世界观或 NovelX 数据模型。
- 用浏览器 `creatx:ui-command` 代替生产 `CreatXDesktopApi`。
