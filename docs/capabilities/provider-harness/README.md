---
title: Provider Harness 能力线入口
doc_type: capability-entry
owner: provider-harness
status: utility-process-heavy-history-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/provider-harness/product-spec.md
---

# Provider Harness（模型与智能体框架）能力线

本能力线拥有 Cline 版本、生命周期、Provider、模型选择、公开 API 适配、原始事件转换和 Cline 升级门禁。Cline 已由 ADR-0005 选为唯一 Harness。

2026-08-09 已执行 ADR-0005 的资源门禁：Cline Adapter、Session、权限存储和档案恢复固定进入受监督 Utility Process，Main 只保留稳定 CreatX IPC Broker。正式 19 MB 图片历史副本、跨进程工具与审批、子进程强杀失败关闭和无残留退出已有源码 Electron 证据；打包产物仍待发布批次验证。完整边界见 `../../baseline/creatx-cline-runtime-isolation-2026-08-09.md`。

第一条生产骨架已在 `c9a4ae4` 接通固定 Cline、显式 SQLite、真实 DeepSeek、原生审批、editor 文件工具、事件投影、历史继续和 Windows 退出。共享接口提交 `f289dd3` 通过公开 `createTool/extraTools` 接通中立 Tool Contribution Port（工具贡献端口）；注册工作台纵向批次进一步由真实 DeepSeek 调用 `register_workbench`，验证项目 ID 注入、原生审批拒绝/批准和真实 Port 返回。Growth Steer/Abort、阶段命令和生产调度已接入；外部文件引用已用真实 Cline Core、SQLite 和 Windows 文件验证公开 `userFiles` 路径及失败关闭，证据见 `../../baseline/creatx-cline-file-attachment-runtime-2026-07-28.md`。Cline 内置 `fetch_web_content` 现通过公开 Tool Executor（工具执行器）覆盖点复用 CreatX 代理，真实 JMRAI Run 已连续读取 Bing RSS 搜索结果和 Wikipedia 正文，证据见 `../../baseline/creatx-proxy-web-fetch-live-2026-07-29.md`。Provider 用量、完整真实失败矩阵、执行中工具取消及升级门禁仍未完整验收。

Windows 依赖安装已在 `2cf78df` 固定为 Bun Hoisted Linker（提升式链接器），避免 Cline 的 SAP AI SDK 传递包在 Isolated Store（隔离包存储）中超过传统路径上限。全新长路径 Clone 的冻结安装、关键包完整性、安装回归、Import Boundary 和 Typecheck 已定向通过；旧缓存复制旁路已删除。该结果对应 `PHS-023 / ACC-PHS-032`，不代表全量测试、Build、Electron 或外部 Provider 已重新验收。

用户级交流模型 Profile 已通过 Cline 公共连接更新接口接入当前空闲会话；下一轮切换、历史保留、Profile ID 重启恢复和 Electron 加密设置已有本地集成证据。切换后的系统代理路径尚无外部 Provider Live，见 `../../baseline/creatx-composer-model-settings-2026-08-03.md`。

它不拥有会话的产品种类、工作台布局、项目文件产品语义、创作 Skill 教程、图片队列或长期记忆。

## AI 任务路由

以下修改进入本能力线：

- 固定或升级 `@cline/core`、`@cline/sdk` 和官方源码基线；
- 创建、启动、停止和释放 `ClineCore`；
- Provider 配置、模型目录、认证与失败分类；
- Cline 命令、事件、工具状态和错误到 CreatX 合同的转换；
- Cline Plugin、Skill、MCP 和 Hook 的接入基础；
- Windows 进程、路径、数据目录和资源基线；
- 判断一个缺口能否通过公开 API 完成，是否需要停止并讨论 Fork。

以下修改不进入本能力线：

| 能力 | 对方拥有 |
| --- | --- |
| `session` | 个人/项目会话、无项目副作用和未来特殊会话语义 |
| `agent-runtime` | CreatX 用户可见 Run 状态和产品级终态 |
| `project-files` | 项目授权、版本、回收站、外部编辑和冲突 |
| `workspace-ui` | 聊天、工具面板、工作台和视觉投影 |
| `creative-skills` | Skill 的创作方法、触发和用户结果 |
| `image-runtime` | 图片任务、候选、重试和封面绑定 |

## 阅读顺序

1. `product-spec.md`：Cline 接入和所有权规则。
2. `acceptance.md`：真实 Provider、工具、事件、权限和 Windows 验收。
3. `plan.md`：适配批次与升级门禁。
4. `../../adr/0005-cline-is-the-sole-agent-harness.md`：选型与事实所有权。
5. `../../adr/0009-dynamic-growth-goal-runtime.md`：自由模式、Steer/Abort 与 Growth 的 Adapter 边界。
6. `../../baseline/cline-sdk-v0.0.65.md`：固定源码基线。

## 修改规则

- 只有未来 `creatx/packages/cline-adapter` 导入 Cline 包和类型。
- 产品行为变化回到对应能力线，不通过 Adapter 偷渡。
- 第一版禁止修改 Cline Core；公开接口不足时停止并报告。
- 不建立第二个 Harness Adapter，也不为历史候选保留运行时兼容层。
