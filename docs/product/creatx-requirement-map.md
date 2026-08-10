---
title: CreatX 产品需求与修改归属图
doc_type: product-requirement-map
owner: integration
status: dynamic-growth-accepted-not-implemented
last_verified: 2026-08-10
source_of_truth: docs/product/creatx-requirement-map.md
---

# CreatX 产品需求与修改归属图

当前检查点：第一条骨架已由提交 `c9a4ae4` 完成，共享接口提交 `f289dd3` 已验证；ADR-0007 的注册工作台与标题纠正纵向闭环已经实现并通过真实 Electron Provider 验收。下表中的“第一骨架”继续表示范围归属，不表示对应能力的全部 V1 验收都通过。

## 1. 用途

本文把长篇产品发现压缩成可路由的修改边界。它回答三个问题：一项需求主要归谁、Cline 已经提供什么、CreatX 应在哪里修改。

产品细节继续由对应能力线的 `product-spec.md` 拥有；本文不复制完整规则。历史讨论只解释意图演变，不能替代当前规格。

## 2. 不可变产品核心

1. CreatX 是完整 Coding Agent（编码智能体）上的通用艺术创作工作台，不建立平行的创作执行内核。
2. 核心交互是“用户表达，AI 创作；用户直接修改，AI 重新读取正式作品并继续”。
3. 真实项目文件和目录是唯一内容模型；工作台、预览、封面和主题只投影或绑定这些文件。
4. 普通界面以完整会话为主，注册工作台从右侧按需展开；前端布局不拥有会话或文件事实。
5. 第一条骨架只证明生产 Electron 前端、Cline、真实 Provider（模型服务）、一个获批 Cline 文件工具、真实项目文件和同一文件的界面投影。
6. 一个业务规则只有一个权威实现；Cline 私有类型不能扩散到 CreatX Renderer（渲染层）和产品模块。

## 3. Cline 使用级别

| 级别 | 含义 |
| --- | --- |
| `Reuse` | 直接使用固定版本 Cline 的公开能力，不在 CreatX 重写。 |
| `Configure` | 通过公开会话配置、Tool Policy（工具策略）或 Hook（钩子）改变行为。 |
| `Plugin` | 新增 CreatX Cline Plugin（插件）、Skill（技能）或 MCP（模型上下文协议）工具，不修改 Cline Core。 |
| `Tool` | 产品模块输出中立 CreatX 工具定义，唯一 Adapter 通过 Cline `createTool/extraTools` 接入；产品模块不导入 Cline。 |
| `Adapter` | 在唯一 Cline Adapter（适配层）中转换命令、事件、错误和稳定 ID。 |
| `CreatX` | 完全属于 CreatX 产品层，Cline 不成为事实权威。 |
| `Deferred` | 已保存产品语义，但不进入第一版。 |

## 4. 全部需求归属

`V1 目标` 表示第一版最终希望拥有的范围；`第一骨架` 只表示当前最小真实链路。两列不能互相替代。

| Primary Capability（主要能力） | 产品需求 | V1 目标 | 第一骨架 | Cline 关系 | 唯一修改位置 | 不得修改 |
| --- | --- | --- | --- | --- | --- | --- |
| `provider-harness` | Cline 版本、启动、Provider、模型、公开 API、原始事件和错误映射 | 是 | 是 | `Reuse + Adapter` | `creatx/packages/cline-adapter` | Renderer、会话产品规格、工作台组件 |
| `session` | 普通个人/项目会话、历史和手动继续 | 是 | 项目会话最小链 | `Reuse + Configure` | Cline 原生会话加 CreatX 项目关联 | Cline Core、第二套消息库 |
| `session` | 压缩继承、完整复制转移、侧聊、会话家族 | 后续 | 否，入口隐藏 | `Deferred` | 未来 Session 能力 | 当前 Adapter 公共合同 |
| `agent-runtime` | Run、流式事件、工具、等待、失败、取消和结果未知投影 | 是 | 是，内存投影 | `Reuse + Adapter` | `creatx/packages/cline-adapter` 与稳定合同 | 持久 CreatX Run 数据库 |
| `session` | 审批/自由直接切换，新会话默认自由 | 是；Runtime 与 IPC 已实现，Renderer 控件待做 | 骨架历史只有审批 | `Configure` | Session 产品配置 + `creatx/packages/cline-adapter` Tool Policy 映射 | Cline `yolo` Agent Tool Preset、自建工具循环、项目沙箱声明 |
| `permissions` | 计划、审批、协作、自由四档 | 后续 | 否 | `Deferred` | 未来独立评估 | 当前两档实现、Cline Core |
| `project-files` | 项目根、真实文件、Query/Command Port、扫描和读取 | 是 | 是；Command Port 为骨架后接口批次 | Cline 写工具 `Reuse`；产品投影为 `CreatX` | `creatx/packages/project-files` | 会话数据库、正文副本、第二路径 Map |
| `project-files` | 可靠监听、内容级冲突、每次修改版本、回收站和恢复 | 是 | 否；仅有修改时间冲突门禁 | `CreatX` | 骨架后 `project-files` Worktree | 第一骨架或共享 Port 完成声明 |
| `workspace-ui` | 真实主会话、审批、文件和预览 | 是 | 是 | `CreatX` | `creatx/apps/desktop/renderer` | Cline 私有事件、Fixture 生产入口 |
| `workspace-ui` | 侧聊界面 | 后续 | 否，入口隐藏 | `Deferred` | 未来 Session + UI 批次 | 假会话或禁用占位入口 |
| `workbench-registry` | 内置“文件”表面与同一文件投影 | 是 | 是，最小版 | `CreatX` | 骨架由 Project Files + Renderer 直接投影；注册能力再进入 `creatx/packages/workbench` | Work/Artifact 注册表、内容副本 |
| `workbench-registry` | `.creatx/` V1/V2/V3 注册、标题、交互主页、可见范围、内置/通用文件夹投影、幂等和损坏隔离 | 是 | 是；V3 工具已接 Runtime，外部 Provider 自主调用未 Live | `CreatX + Tool` | `creatx/packages/workbench` | 手写 JSON、内容移动、Renderer 规则权威、Fixture Live |
| `creative-skills` | 工作台教程、小说启动、`/study`、`/living`、地图和因果 | 分批 | 小说启动已通过 Live，其余否 | `Plugin` | `creatx/packages/creative-skills` | 固定 NovelX 流水线、第二 Harness |
| `creative-skills` | Dynamic Growth Goal、滚动计划、阶段汇报和多 Run 调度 | 是；已接受未实现 | 否 | `Plugin + CreatX` | Growth Skill + Goal Runtime；Cline Adapter 只执行 Run/Steer/Abort | 复制 Cline Run/消息、自然语言自动启动、并行阶段 |
| `creative-tools` | 后续地图、因果及其他创作编排工具 | 是 | 否；仅中立 Tool Port 已验证 | `Tool` | 按主要能力分别实现；不集中复制 Workbench/Image 规则 | 客户端假回执、Cline Core、绝对项目根 |
| `image-runtime` | 独立图片 Provider、同步单图、持久单 Worker 队列和失败状态 | 是；队列未实现 | 同步 Provider/工具/预览已 Live | `CreatX + Tool` | `creatx/packages/image-runtime`；Main 拥有 Worker | Growth Goal 状态、Renderer 临时状态、多 Worker |
| `art-library` | 全局个人艺术库、公开图片采集、识图候审、分类审批和确定性风格词导出 | Runtime 已实现；前端与视觉 Live 待验收 | 公网单图采集和构建内 57+6 迁移已验证，不等于识图 Live | `CreatX + Tool` | `creatx/packages/art-library-runtime`；Electron Main 拥有应用数据根 | 专属艺术库 Chat、项目绑定、第二 Harness、`my-art` 运行依赖、AI 库级风格摘要 |
| `personal-ai` | 默认旅鸽、初次认识和可持续身份 | 后续 | 否 | `CreatX` | 未来 `creatx/packages/personal-ai` | Cline 系统身份硬编码 |
| `memory` | 个人画像、项目画像、轻量复盘和跨项目蒸馏 | 后续 | 否 | `Deferred` | 未来 `creatx/packages/memory` | Cline 压缩和会话历史表 |
| `desktop-runtime` | Electron 窗口、前台 Cline 生命周期和干净退出 | 是 | 是，主进程实验默认 | `Reuse + Adapter` | `creatx/apps/desktop/main` | Renderer 直接创建或销毁 Cline |
| `desktop-runtime` | 后台继续、托盘、通知、更新和崩溃续接 | 后续 | 否 | `Deferred` | 未来桌面批次 | 第一骨架创作闭环 |
| `interactive-preview` | HTML/CSS/JS 作品隔离预览 | 后续 | 否 | `CreatX` | `creatx/packages/preview-sandbox` | Cline 工具权限、Electron 原生 API |
| `project-theme` | 官方、个人和项目主题继承 | V1 后续批次 | 否 | `CreatX` | Renderer 主题合同 | Cline、作品文件身份 |
| `import-export` | 项目包、会话勾选、隐私提示和隔离导入 | 后续 | 否 | `Deferred` | 未来 `creatx/packages/import-export` | Cline 原始数据库直接打包 |

## 5. Cline 事实与 CreatX 事实

### Cline 是权威

- 模型调用与 Provider 协议；
- Agent 迭代和上下文压缩；
- 会话消息、工具调用与工具结果；
- Cline 会话历史、队列、Steer（插话）、Abort（取消）和 Stop（停止）；
- Cline 自己的会话 SQLite 和 Checkpoint（检查点）。

### CreatX 是权威

- 项目身份和用户授权的项目根目录；
- `.creatx/` 工作台视图元数据；
- 文件监听、版本、回收站和外部编辑投影；
- 图片任务、全部候选文件和封面绑定；
- Growth Goal 身份、产品状态、计划文件引用和必需图片任务引用；
- 用户画像、项目画像和旅鸽身份；
- CreatX 稳定 UI Command（命令）、Projection（投影）与错误分类。

CreatX 不复制 Cline 的消息和 Run 形成可独立执行的第二套事实。第一条骨架只维护当前进程内的 UI Projection；重启后读取 Cline 历史。未来若有性能证据需要持久缓存，它必须可丢弃、可由 Cline 持久历史重建，并且不能反向驱动 Agent。

## 6. 修改规则

1. 只有 `cline-adapter` 可以导入 `@cline/core`、`@cline/sdk` 或 Cline 私有类型。
2. 产品模块只依赖稳定 CreatX 合同；Renderer 使用 `CreatXDesktopApi`，内部文件能力使用 `@creatx/project-files` Port，创作工具输出 `CreatXToolContribution`。
3. 第一版所有扩展使用公开配置、Tool、Plugin、Skill、MCP 和 Adapter；需要修改 Cline Core 时立即停止并形成单独 ADR。
4. 每个能力拥有自己的规格、代码、测试和失败行为；跨能力只通过合同交互。
5. Web 前端可以独立变化，但不得创建第二套会话、文件、任务或工作台注册事实。

## 7. 当前权威入口

| 需求 | 入口 |
| --- | --- |
| 产品核心 | `creatx-product-understanding.md` |
| Cline 选择和所有权 | `../adr/0005-cline-is-the-sole-agent-harness.md` |
| Cline 适配 | `../capabilities/provider-harness/README.md` |
| 会话 | `../capabilities/session/README.md` |
| 创作 Skill | `../capabilities/creative-skills/README.md` |
| 文件内容模型 | `../adr/0002-project-files-are-the-content-model.md` |
| 工作台界面发现 | `../discussions/2026-07-26-workspace-project-switching-discovery.md` |
| 第一版优先级 | `../discussions/2026-07-26-first-version-priority-correction.md` |
