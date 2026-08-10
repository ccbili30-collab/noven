---
title: CreatX 低改动 Harness 对比
doc_type: investigation-report
status: superseded-by-cline-selection
last_verified: 2026-07-26
scope: Cline SDK 0.0.65, OpenCode 1.18.5, OpenHands 1.36.1, Goose main
---

# CreatX 低改动 Harness 对比

> 取代关系：本文保存选型前证据。2026-07-26 用户选择只保留 Cline，最终架构决定见 `../adr/0005-cline-is-the-sole-agent-harness.md`。

## 1. 当前问题

本轮不寻找理论能力最多的 Agent Harness（智能体运行框架），而是寻找最少修改即可形成 CreatX 第一版真实创作链的候选：

```text
可替换前端
-> 真实 Harness 与 Provider（模型服务）
-> 真实文件和创作工具
-> 工具等待真实成功或失败
-> 同一项目文件由工作台展示
-> Windows 前台正常启动和退出
```

四档权限、特殊会话继承、侧聊、后台生命、长期记忆、精确崩溃恢复和 Living 零工具沙箱不参与本轮淘汰。

## 2. 结论

当前最低改动排序为：

1. **Cline SDK：第一条可丢弃纵向实验的优先候选。**
2. **干净上游 OpenCode：强制对照组和首要回退。**
3. **OpenHands SDK + Agent Server：接口成熟，但 Windows 产品化和 Python Sidecar（伴随进程）增加集成面。**
4. **Goose Core：Rust 实现有吸引力，但公开嵌入边界最厚，不适合“少改”目标。**

这不是最终 Harness 选择。Cline 的公开 Core 仍标为 `experimental`，版本为 `0.0.65`；在真实 Provider、真实 CreatX 服务端工具、真实文件、事件订阅和取消路径通过前，不得写入生产架构 ADR。

## 3. 为什么先试 Cline

Cline 当前最接近“把一个成熟 Coding Agent（编码智能体）作为库嵌入 Electron，再换 CreatX 前端”：

- `ClineCore.create({ backendMode: "local" })` 可在普通 Node 进程中直接创建，不要求原 Cline UI、Docker 或 Python。
- `start`、`send`、`abort`、`stop`、`subscribe`、`readMessages`、`restore`、`listHistory` 和 SQLite 会话已由 Core 提供。
- `send` 原生区分 `queue` 与 `steer`，不需要 CreatX 先重写插话和排队内核。
- 插件可用单个 TypeScript 文件注册 Tool（工具）、Skill（技能）、Provider、消息压缩和生命周期 Hook（钩子）。
- 官方示例中的 `beforeTool` 可以硬阻止工具，不只依赖 Prompt（提示词）。
- 未传 `cwd` 和 `workspaceRoot` 时，Core 会创建共享聊天工作区；传入项目目录时则绑定真实项目。这与 CreatX 的“普通聊天”和“项目内创作”天然接近，虽然特殊会话转移仍不属于第一版。
- Electron 已带 Node Runtime（运行时），第一版可先在主进程或受监督 Node 子进程中运行 Core，不必先设计 Rust 与 Python 的跨进程协议。

最低改动不等于最低长期风险。Cline 的主要反对证据是：

- 包和 README 明确标记 `experimental`。
- `0.0.x` API 可能频繁变化，必须固定版本并由 CreatX Adapter（适配层）隔离。
- npm 安装引入 303 个包；它不是一个轻量模型循环。
- 空闲 Core 单点快照约为 `302.5 MB` Working Set（工作集）和 `287.1 MB` Private Bytes（私有提交内存）。这是启动后短时快照，不是资源基准，但足以否定“天然很轻”的假设。
- 缺 API Key 时 `start` 不抛异常，而是返回 `finishReason: "error"`；CreatX 必须检查 Run 结果，不能把 Promise 正常返回投影成成功。

## 4. OpenCode 为什么是第二名而不是淘汰

干净上游 OpenCode `1.18.5` 同样满足薄接入方向：

- `@opencode-ai/sdk` 可启动 Headless Server（无界面服务）并创建类型化 Client（客户端）。
- Client 提供项目、会话、事件、权限、文件、工具和 Provider 接口。
- `@opencode-ai/plugin` 的 Tool 合同包含项目目录、AbortSignal（取消信号）、权限询问、结构化结果和附件。
- Skill、Plugin（插件）和 MCP（模型上下文协议）足以承载 Growth、Study、图片和工作台注册工具，不要求修改 Agent 主循环。
- CreatX 已有 NovelX/OpenCode 的业务经验，可迁移用户能力和教程，而不复用冻结的会话修改线。

本机最新干净上游已验证：

- 官方 `postinstall` 后 `opencode 1.18.5` 可在 Windows 启动。
- SDK 约 `1.3-2.3s` 启动服务。
- 自定义 Client 能读取实验目录的真实 `package.json`、列出 14 个工具、创建并删除绑定该目录的会话。
- 本机环境中的 `DEEPSEEK_API_KEY` 被上游自动发现后，真实 Provider 调用成功返回 `Ready`，工具调用为零，成本约 `$0.0034`。
- 正常关闭 SDK Server 后，Node、CMD、OpenCode 和控制台后代进程均退出，无残留进程。

但它不是本轮第一名，原因是：

- 需要独立 OpenCode 二进制服务；SDK 的启动器本身还需要 Node 进程。
- 短时空闲快照中 OpenCode 进程约 `313.3 MB` Working Set、`576.8 MB` Private Bytes，另有约 `53 MB` 的 Node 启动进程；这不是长期基准，但资源风险不能忽略。
- 非 Git 文件夹下 `project.current()` 返回全局项目 `/`，虽然文件读取和会话目录仍正确。CreatX 必须以明确项目目录为权威，不能直接把 OpenCode Project 投影成产品项目。
- NovelX 历史故障不能证明干净上游失败，但也说明不能再次深改 Session（会话）内核、Growth 状态机和 UI 私有状态。

如果 Cline 的版本不稳定或真实工具链需要修改 Core，OpenCode 是最短回退路线。

## 5. OpenHands 与 Goose

### 5.1 OpenHands

OpenHands `1.36.1` 已在本机 Windows 连续运行 Agent Server，公开 Conversation、事件、会话分叉、中断、暂停、Skill、Plugin 和 MCP。完全替换前端可行。

它排在第三不是因为能力不足，而是第一版产品化成本更高：

- Electron 需要监督 Python Agent Server、固定 Python 依赖、数据目录、密钥、端口和升级。
- Agent Canvas `1.5.2` 一体启动器在 Windows 失败过，当前只能证明拆分进程可运行。
- `client_tools` 会在真实客户端副作用完成前返回“已分发”，不能用于图片、文件和工作台注册；必须使用服务端 Tool、Plugin 或 MCP。
- 当前本机服务长期空闲快照约 `18 MB` Working Set、`420.9 MB` Private Bytes；不能据此宣称比其他候选更轻。

若 Cline 和 OpenCode 都无法提供可靠事件与真实工具结果，OpenHands 才进入下一轮纵向实验。

### 5.2 Goose

Goose 的完整 `goose` crate 包含 Agent、会话、权限、Provider、Skill、Hook、Axum、SQLite、MCP、ACP 和大量语言分析依赖。公开 `goose-sdk` 当前为 `0.1.0-alpha.5`，主要提供 ACP Schema（协议结构）和可选 UniFFI 绑定。

这意味着采用 Goose 不是“直接获得轻量 Rust Harness”，而是需要 CreatX 自己定义和维护完整服务边界、事件重放、项目目录和前端协议。它可能在资源和长期 Rust 统一上有优势，但当前证据不支持它是最低改动路线。

## 6. 对比表

| 候选 | 前端替换 | 创作工具扩展 | Windows 实证 | 第一版新增边界 | 当前判断 |
| --- | --- | --- | --- | --- | --- |
| Cline SDK `0.0.65` | 直接嵌入 Core 或接 Hub | 单文件插件、MCP、Skill、Hook | 本机创建 Core、SQLite、错误结果返回、退出通过 | CreatX UI + 薄 Adapter + 插件 | 最少改，先实验 |
| OpenCode `1.18.5` | SDK + Headless Server | Plugin、Tool、Skill、MCP | 本机真实文件、会话、Provider、退出通过 | CreatX UI + 目录投影 + 插件 | 最强回退 |
| OpenHands `1.36.1` | REST/WebSocket Agent Server | 服务端 Tool、Plugin、MCP、Skill | Windows 拆分服务长期运行 | UI + Python Sidecar 监督 + Adapter | 第三候选 |
| Goose main | 需要自建服务或 ACP 适配 | Rust Core 内扩展 | 本轮未构建运行 | 较厚协议与服务层 | 暂不进入实验 |

## 7. 下一条最小实验

只在独立实验目录做同一条 Cline 纵向链：

```text
最小自定义前端/驱动
-> ClineCore 0.0.65
-> 本机真实 Provider
-> 一个 CreatX 插件工具
-> 工具写入一个真实 Markdown 或图片文件
-> 驱动读取同一文件作为工作台投影
-> 用户修改后再让 Agent 读取
-> 取消一次运行
-> 正常退出且无残留进程
```

通过条件：不修改 Cline 上游 Core；工具等待真实结果；错误和取消可区分；文件是唯一内容真相。

停止条件：若完成这条链需要 Fork Cline Core、绕过正式工具结果、依赖不稳定内部路径，或事件不足以恢复 UI，则停止 Cline 路线，用相同驱动改测干净 OpenCode。不要同时建设两个正式 Adapter。

## 8. 证据边界

本轮是候选调查和局部 Windows 实验，不是完整 Kernel Lab（内核实验室）：

- Cline 未调用真实 Provider，也未执行自定义创作工具。
- OpenCode 调用了真实 Provider，但未调用创作工具、图片 Provider 或完整工作台。
- 没有测试长会话、并发、取消中的文件副作用、崩溃恢复或安装包。
- 资源数字是不同生命周期下的单点快照，不能直接作为性能排名。
- 没有修改生产代码，没有接受最终 Harness，没有解除产品与架构基线门禁。

## 9. 官方来源

- [Cline SDK Core](https://github.com/cline/cline/tree/main/sdk/packages/core)
- [Cline Plugin Examples](https://github.com/cline/cline/tree/main/sdk/examples/plugins)
- [OpenCode SDK](https://github.com/anomalyco/opencode/tree/dev/packages/sdk/js)
- [OpenCode Plugin API](https://github.com/anomalyco/opencode/tree/dev/packages/plugin)
- [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk)
- [Goose](https://github.com/block/goose)
- [Goose SDK Cargo manifest](https://github.com/block/goose/blob/main/crates/goose-sdk/Cargo.toml)
