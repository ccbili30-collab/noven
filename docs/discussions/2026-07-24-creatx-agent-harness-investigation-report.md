# CreatX Agent Harness 调查报告

状态：候选初筛与 Kernel Lab（内核实验室）输入，不是最终选型决定，也不是实现完成声明。

日期：2026-07-24

2026-07-25 决策更新：报告中关于 Artifact 注册和关系由 CreatX Runtime 持有的假设已被 `docs/adr/0002-project-files-are-the-content-model.md` 取代。当前边界是 CreatX 管理真实项目文件、文件事件和工作台视图，不建立 Work/Artifact 注册表。该变更不证明任何 Harness 候选通过硬门槛，也不改变必须运行统一 Kernel Lab 的结论。

2026-07-26 决策更新：`/study`、`/growth` 和 `/living` 已被定义为同一个 Coding Agent 的内置 Skill，不再预设 Study 与 Growth 各自拥有独立 Runtime、任务类型或状态机。报告中对应的 CreatX 所有权描述只保留为历史候选方案；长期执行应优先复用选定 Harness 的 Run、Goal、子 Agent、事件、取消和恢复能力。图片 Provider 的异步队列仍是待验证的 CreatX 扩展边界。

## 1. 调查目标

CreatX 需要的不是一个聊天 SDK，也不是把现有代码编辑器改名。目标是选择一个可嵌入的 Harness（智能体运行框架），承接模型循环、会话、工具、上下文和子 Agent，同时让 CreatX 自己掌握创作文件、Artifact（创作产物）、工作台、图片队列、Growth、Study 和用户界面。

本报告回答三个问题：

1. CreatX 的底层硬需求是什么。
2. 哪些能力必须由上游 Harness 提供，哪些必须由 CreatX 自己拥有。
3. 当前候选在官方文档和源码证据上的表现、风险与预选顺序是什么。

本报告没有进行真实 Provider（模型服务）、进程强杀、长时间内存或安装包测试。因此，下文的分数是“公开证据适配度”，不是 Live（真实运行）性能分数。

## 2. CreatX 底层系统边界

建议的所有权边界如下：

```text
CreatX Desktop / Future Web / Future Mobile
  对话、编辑器、Artifact 工作台、任务进度、用户决策
                    |
                    | CreatX Event Protocol
                    v
CreatX Runtime Gateway
  Run 状态、事件日志、任务队列、文件锁、图片队列、版本与审计
                    |
                    | Replaceable Harness Adapter
                    v
Upstream Agent Harness
  模型循环、Provider 调用、工具协议、上下文压缩、子 Agent
```

不得让 Renderer（渲染层）直接依赖某个上游 Harness 的私有会话对象、消息格式或工具状态。否则更换 Harness 时，项目数据、前端和 Growth 都会被一起拖入迁移。

## 3. 对比项与需求

### 3.1 上游 Harness 的硬门槛

以下任一项失败，候选不能成为 CreatX 主内核。总分不能抵消硬门槛失败。

| 编号 | 对比项 | CreatX 要求 | Kernel Lab 最小验收 |
| --- | --- | --- | --- |
| G1 | Provider 与模型抽象 | 不能只支持一个厂商或一种协议；文本、视觉理解、生图分别配置；任务可选不同模型 | 同一工具循环分别跑通 OpenAI-compatible Responses、Chat Completions 和 Anthropic Messages 类协议；无配置时失败关闭 |
| G2 | Durable Session（持久会话） | 项目、会话、Run、Turn、模型请求、工具调用层级明确；重启后可恢复 | 关闭并重启客户端与 Runtime 后，会话历史和未完成状态可查询；不得生成第二个冲突 Run |
| G3 | 结构化事件流 | 文本增量、工具、文件、子 Agent、错误和终态均为结构化事件 | UI 断线后能重放历史，再接实时流；事件不能只存在前端内存 |
| G4 | 插话、取消与恢复 | 运行中可以 steer、queue、pause、cancel、resume；取消后重新开始不能撞旧 Run | 在模型流和工具执行阶段分别取消；旧 Run 不得在新 Run 启动后继续回写 |
| G5 | Tool Loop（工具循环） | 工具调用与结果严格配对；参数验证；权限、超时、取消和结果未知状态明确 | 在副作用完成但结果未持久化时强杀进程，恢复后不得静默重复执行 |
| G6 | Headless 与前端解耦 | Runtime 可作为后台服务运行；前端可完全替换 | UI 进程退出后任务继续；新 UI 连接后能查询状态和恢复事件 |
| G7 | Windows 支持 | Windows 原生运行、打包、路径、PowerShell、进程回收可靠 | Windows 安装或 sidecar 启停通过；无残留进程；中文路径和长路径通过 |
| G8 | 可诊断性 | 禁止“模型不理人但系统不知道原因” | 每个 Run 必须处于可解释的运行、等待、暂停、失败、完成或结果未知状态 |

### 3.2 上游 Harness 的加权对比项

硬门槛通过后，再按下表比较。每项按 0 到 5 分评估，最终分按权重折算为 100 分。

| 对比项 | 权重 | 评估内容 |
| --- | ---: | --- |
| Provider 与模型抽象 | 12 | 原生协议数量、自定义 Provider、任务级模型路由、切换模型时的上下文兼容 |
| 会话与 Run 持久性 | 14 | 会话持久化、分叉、恢复、并发边界和历史读取 |
| 事件流与诊断 | 10 | 结构化事件、历史读取、重连、错误分类、事件顺序 |
| 插话、取消与恢复 | 10 | steer、queue、interrupt、pause、resume 和终态一致性 |
| 工具与权限 | 10 | 工具合同、审批、沙箱、超时、取消、配对和副作用边界 |
| 子 Agent | 8 | 独立上下文、并行、可见状态、停止、权限收窄和生命周期 |
| 上下文与压缩 | 8 | 自动压缩、工具噪声处理、长会话恢复和模型切换 |
| Headless 与后台运行 | 10 | SDK、RPC、REST/WebSocket、daemon、UI 断开继续运行 |
| Windows 与资源风险 | 8 | Windows CI、原生工具、打包方式、已知 OOM 和依赖体量风险 |
| API 成熟度与可维护性 | 10 | 版本稳定性、公开合同、兼容检查、变更速度和嵌入边界 |

### 3.3 必须由 CreatX 自己掌握的能力

下面这些能力不能交给上游 Harness 成为事实权威：

| 能力 | CreatX 所有权要求 |
| --- | --- |
| Project 与 Artifact | 真实项目文件是内容真相；Artifact 注册、关系和工作台投影由 CreatX 管理 |
| 文件事务 | 文件锁、租约、Change Set（变更集）、原子写入、最新一次撤回和冲突处理由 CreatX 管理 |
| 图片队列 | 生图 Prompt 卡、图片 Provider、排队、重试、变体和挂载由独立队列管理，不依附文本模型会话 |
| Growth | 长期自主创作是 CreatX 的持久任务图，不是一个无限 Prompt |
| Study | 来源获取、阅读记录、风格总结、来源信任和提示注入防护由 CreatX 管理 |
| 风格记忆 | 个人、项目、作品三级风格可查看、编辑、版本化，不能退化为隐藏系统 Prompt |
| 会话继承记忆 | 从旧会话和正式 Artifact 生成干净继承上下文，由专门任务完成 |
| UI 与工作台 | 对话、编辑器、图片、HTML 预览、任务状态和多个工作台完全由 CreatX 定义 |
| 审计与错误投影 | CreatX 保存稳定的 Run、事件和错误分类，不能只显示上游的一段异常字符串 |

## 4. 候选分类

### 4.1 可直接竞争主内核的候选

- OpenHands Software Agent SDK + Agent Server
- Cline SDK + ClineCore / Hub
- Goose Core
- Codex `app-server`
- OpenCode Server / SDK
- Claude Agent SDK

这些候选至少提供了较完整的模型循环、工具、会话或 Headless 接口，可以进入同类能力检查。

### 4.2 需要自行组装的通用框架

- OpenAI Agents SDK
- Deep Agents / LangGraph
- Mastra
- VoltAgent
- PydanticAI
- Microsoft Agent Framework
- Agno

这些框架可以构建 Agent，但 CreatX 仍需自行补齐 IDE 工作区、后台 Runtime、持久 Run、文件工具、权限和崩溃恢复。它们不与完整 Harness 直接排名，只作为“自研 Runtime”的备选组件。

### 4.3 能力参考，不作为主内核

- Hermes Agent：参考跨会话搜索、长期记忆、子 Agent 和原生 Windows 产品体验。
- Pi：参考轻量模型循环和 Provider 抽象；其官方 README 明确不内置权限系统。
- Letta：参考长期记忆和 stateful agent；不是完整文件工作台 Harness。
- DeerFlow：参考复杂研究和多 Agent 编排；其运行与部署成本不适合作为桌面基础内核的默认选择。

## 5. 候选表现

### 5.1 OpenHands Software Agent SDK

官方证据：

- MIT 许可的独立 SDK 与 Agent Server，不等同于旧 OpenHands Docker 产品壳。
- `Conversation` 支持持久化后重新构建并继续。
- 官方示例覆盖运行中发送消息、上下文 condenser、模型切换、会话分叉、异步取消和取消后继续。
- Agent Server 提供 REST、WebSocket、事件读取、会话 CRUD 和本地文件存储。
- 通过 LiteLLM 提供广泛 Provider 与自定义 `base_url`。
- 官方仓库包含 Windows CI、Windows Terminal 实现和 Windows PyInstaller `.exe` 构建。
- PyPI 当前公开版本为 `1.37.0`；仓库包含 API breakage 检查工作流。

尚未验证：

- 工具执行中强杀 Agent Server 后，是否能正确处理未配对工具调用。
- 已完成副作用但 Tool Result 尚未持久化时，恢复是否会重复执行。
- UI 断开后后台 Run 的真实生命周期和事件重放边界。
- 多会话、子 Agent 和长上下文并发时的实际 RSS 内存。
- LiteLLM 对用户真实代理端点、工具流和错误分类的兼容质量。

判断：当前最符合 CreatX 架构边界的第一实测候选。它有较清晰的 sidecar、事件和 Windows 打包路径，但崩溃恢复不能从示例代码推断为已经可靠。

### 5.2 Cline SDK

官方证据：

- `@cline/sdk` 明确用于嵌入自定义应用。
- `ClineCore` 提供会话、SQLite、消息历史、内置文件和命令工具、审批、RPC 和插件。
- Hub-Spoke 架构允许 UI 客户端退出后，后台 spoke 继续运行。
- 官方文档称客户端重连后可收到完整会话历史并继续实时事件流。
- 提供 abort、stop、send、subscribe、restore、snapshot 和多 Agent 扩展。
- Provider 网关覆盖 Anthropic、OpenAI、Google、Bedrock、Mistral 和其他 Provider。
- 提供 Tauri 桌面 sidecar 示例，前端可替换性较好。

风险证据：

- npm 当前版本为 `0.0.65`，SDK 首次公开发布记录始于 2026-05-07，公开 API 仍很年轻。
- Cline 变更记录显示 SDK 正在替换旧运行路径，迁移仍然活跃。
- 变更记录中的长会话 OOM 修复包含把 Node.js 最大堆从约 2 GB 提升到 8 GB。这降低了立即崩溃概率，但不能证明内存增长根因已经解决。
- 子 Agent 和部分协作能力在历史变更中曾标记为 experimental。

尚未验证：

- Hub 或 spoke 自身崩溃后的精确恢复，而不仅是 UI 客户端崩溃。
- 事件是否具备适合 CreatX 的稳定序号、游标和 exactly-once 投影语义。
- 多项目长时间运行的真实内存曲线。
- `0.0.x` 升级时的 API 兼容成本。

判断：嵌入体验和后台架构非常接近 CreatX，但版本成熟度与内存风险决定了它只能作为第二实测候选，不能先验选中。

### 5.3 Goose Core

官方证据：

- Rust 实现，内核包含 SQLite SessionManager、CancellationToken、权限管理和结构化 AgentEvent。
- 支持多 Provider、OpenAI-compatible Provider、Windows Desktop 和 Headless 运行。
- 提供自动上下文压缩、工具输出压缩和可配置上下文策略。
- 子 Agent 支持独立实例、并行执行、权限收窄、最大回合数和超时。
- 支持 Agent Client Protocol（Agent 客户端协议）及外部 Agent 接入。

风险证据：

- `goose-sdk` 的公开定位更偏底层 Provider/绑定，完整 Core 的嵌入边界不如 OpenHands Agent Server 和 ClineCore 清晰。
- Goose 官方文档明确写明 ACP Provider 当前不能 resume 或 fork 会话；该限制适用于 ACP Provider 路径，不等于 Goose 原生会话完全不能恢复。
- Headless 文档偏一次任务执行，没有证明桌面关闭后长期后台 Run 的 daemon 合同。

尚未验证：

- 将完整 Goose Core 作为 CreatX sidecar 的最小公开接口。
- 事件历史重放和 UI 重连语义。
- Windows 下多会话、子 Agent、取消和残留进程。
- Rust 内核的实际资源优势是否能抵消适配开发量。

判断：第三候选。技术基础稳健，资源风险可能较低，但嵌入成本和协议缺口可能迫使 CreatX 维护较厚的适配层。

### 5.4 Codex app-server

官方证据：

- Apache-2.0 开源 Rust Runtime（运行时）。Codex CLI 与 `app-server` 源码开放，不能与未开放源码的 Codex 桌面产品混为一谈。
- `app-server` 提供明确 JSON-RPC：thread start/resume/fork/list、turn start/steer/interrupt、compact、archive 和 delete。
- 提供结构化 item、delta、tool、turn terminal 和 token usage 事件。
- 支持 SQLite 线程元数据、分页历史、子 Agent 父子关系和并发所有权检查。
- Windows、沙箱、权限、工具、审查和诊断接口完整。

硬门槛问题：

- 官方配置文档中，自定义 `model_providers` 的公开 `wire_api` 目前只有 `responses`。
- 可以配置代理、Azure、Ollama-compatible 和部分内置 Provider，但这不等于能稳定承接 Anthropic Messages、Gemini 等不同原生协议。
- CreatX 已明确要求不能只支持一种 OpenAI 协议，因此 Codex 当前不能成为唯一主内核。

尚未验证：

- 非 OpenAI 模型通过 Responses 兼容代理时，复杂工具和推理元数据是否稳定。
- App Server 在工具副作用中途被强杀时的恢复。
- 大量 experimental RPC 字段对嵌入客户端的兼容成本。

判断：会话、控制、事件和诊断能力是当前最强参考之一，但 Provider 硬门槛失败。适合作为可靠性标杆或可选 OpenAI 专用适配器，不适合作为 CreatX 唯一内核。

### 5.5 OpenCode Server / SDK

官方证据：

- 上游提供 HTTP Server、类型安全 SDK、会话 CRUD、abort、summarize、消息、权限、事件和多 Provider。
- SDK 和 Server 边界允许替换前端，已有桌面与 Windows 分发。
- 支持 Agent、子会话、工具和结构化输出。

当前项目证据：

- 旧 NovelX/OpenCode 集成确实跑通过世界、Study、人物、故事、地图和 UI 投影等复杂链路。
- 用户实际使用中反复出现会话无响应、取消后与旧 Growth 相撞、会话无法继续和较高内存占用。
- 这些问题发生在深度修改后的 NovelX 分支，不能直接证明干净上游 OpenCode 同样失败。
- 当前 CreatX 冻结参考仓库明确记录：现有 Session V2 的进程内 drain 没有 durable identity，post-crash continuation 仍需要单独设计。这证明旧代码不能直接作为新产品的已完成恢复内核。

尚未验证：

- 干净上游 OpenCode 在统一 Kernel Lab 下的表现。
- 上游当前会话内核与 NovelX 历史故障之间的真实归因。
- 长会话内存增长、取消竞态和进程重启恢复。

判断：不得复用旧 NovelX 修改线作为新底座。如果以后测试 OpenCode，只允许测试干净上游版本并通过独立适配器接入；当前预选顺序低于前三名。

### 5.6 Claude Agent SDK

官方证据：

- TypeScript 与 Python SDK 提供 Claude Code 的文件、命令、工具循环、权限、Hooks、MCP、会话、流式输入输出和子 Agent。
- Python SDK 捆绑 Claude Code CLI，并提供双向 `ClaudeSDKClient`。
- 官方文档覆盖外部会话持久化、实时流、权限和控制。

硬门槛问题：

- 它是 Claude Agent SDK，运行和协议围绕 Claude 构建，不满足 CreatX 对任意 Provider 和任务级跨厂商路由的要求。
- README 明确说明使用受 Anthropic Commercial Terms 约束，不能按普通 Apache/MIT 内核看待可修改与再分发边界。

判断：能力完整，但 Provider 与许可边界使其不具备主内核资格。可作为 Claude 专用可选 Adapter 或交互质量参考。

## 6. 公开证据适配度评分

评分规则：0 表示无证据或明显不支持，5 表示存在明确官方接口、源码或测试证据。未知的 Live 行为不能按 5 分计算。

| 候选 | Provider 12 | 会话 14 | 事件 10 | 控制 10 | 工具 10 | 子 Agent 8 | 上下文 8 | Headless 10 | Windows/资源 8 | API 成熟度 10 | 折算分 | 硬门槛 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| OpenHands SDK | 5.0 | 4.0 | 4.0 | 5.0 | 4.0 | 4.0 | 4.0 | 5.0 | 4.0 | 4.0 | 86 | 待实测 |
| Codex app-server | 2.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 4.5 | 3.5 | 89 | G1 失败 |
| Cline SDK | 5.0 | 4.0 | 4.5 | 4.5 | 4.5 | 4.0 | 4.0 | 5.0 | 2.5 | 2.0 | 81 | 待实测 |
| Goose Core | 5.0 | 4.0 | 3.0 | 3.5 | 4.5 | 4.0 | 4.5 | 2.5 | 4.0 | 4.0 | 78 | 待实测 |
| Claude Agent SDK | 1.5 | 4.0 | 4.0 | 4.0 | 5.0 | 5.0 | 4.0 | 4.5 | 4.0 | 3.5 | 78 | G1 与许可边界失败 |
| OpenCode | 5.0 | 2.5 | 4.0 | 3.0 | 4.0 | 4.0 | 3.0 | 4.5 | 2.0 | 3.0 | 70 | 历史稳定性未澄清 |

注意：Codex 得分较高但仍被淘汰为唯一主内核，正是因为硬门槛优先于总分。OpenCode 的低分包含 NovelX 历史集成风险；它不是对干净上游版本的 Live 判决。

## 7. 当前排序

### 7.1 主内核 Kernel Lab 顺序

1. OpenHands Software Agent SDK + Agent Server
2. Cline SDK + ClineCore / Hub
3. Goose Core
4. 干净上游 OpenCode，仅在前三者失败或出现新的上游证据时进入

### 7.2 不具备唯一主内核资格

1. Codex app-server：Provider 协议硬门槛失败，但保留为可靠性标杆和 OpenAI 专用 Adapter。
2. Claude Agent SDK：Provider 与许可边界失败，但保留为 Claude 专用 Adapter 和产品体验参考。

### 7.3 自研组装路线

如果前三个候选均无法通过 Kernel Lab，再比较：

1. OpenAI Agents SDK 或 Deep Agents 作为模型循环和 Agent 组合层。
2. CreatX 自建 Durable Run、事件库、后台服务、工具事务和 Windows 工作区。
3. PydanticAI、Mastra 或 VoltAgent 只按具体缺失组件采用，不整套叠加。

这条路线拥有最高控制力，也意味着最大开发量，不能因为上游候选有缺陷就未经估算直接转向全自研。

## 8. Kernel Lab 测试任务

OpenHands 与 Cline 必须使用同一测试驱动和同一 CreatX 临时事件协议，不接正式前端，不实现 Growth、Study 或图片工作台。

### 8.1 功能测试

1. 创建项目、会话和 Run，连续完成多轮工具调用。
2. 在同一会话切换两个不同 Provider，并验证工具历史重新投影。
3. 运行中发送 steer 和 queue，验证边界和顺序。
4. 在模型流式阶段取消，并立即启动新 Run。
5. 在命令或文件工具执行阶段取消。
6. 创建三个子 Agent，停止其中一个，其他两个继续完成。
7. 触发上下文压缩，并在压缩后继续引用正式文件。
8. UI 客户端断开，后台继续；新客户端连接后恢复历史和实时事件。

### 8.2 故障测试

分别在以下位置强杀 Runtime：

1. Provider 请求已发出、尚未返回。
2. 模型正在流式输出。
3. 工具已开始、尚未产生副作用。
4. 工具副作用已完成、Tool Result 尚未持久化。
5. 子 Agent 正在运行。
6. 上下文压缩正在进行。

恢复后必须明确进入继续、失败或结果未知，禁止自动猜测成功，禁止静默重复副作用。

### 8.3 资源和 Windows 测试

1. 空闲 Runtime、一个活动会话、三个活动会话分别记录 RSS 和句柄数。
2. 连续运行两小时，任务结束并静置后检查是否存在单调内存增长。
3. 使用中文、空格和长路径项目。
4. 验证 PowerShell 输出、取消、进程树终止和残留进程。
5. 打包 sidecar，验证首次启动、升级、数据目录和卸载边界。

### 8.4 通过标准

- 零次静默无响应。
- 每个 Run 都有持久 ID、最后活动时间和明确状态。
- 每个工具调用都有唯一调用 ID 和对应结果或结果未知记录。
- 取消后旧 Run 不得继续写入新 Run 的文件或消息。
- UI 重连不得丢失已持久事件，也不得重复显示同一事件。
- Runtime 重启不得自动重复已完成的外部副作用。
- Provider、协议、工具、权限、持久化和程序错误必须可区分。
- Windows 退出后不得残留失去管理权的工作进程。

## 9. 当前结论

当前证据只支持“OpenHands 第一、Cline 第二进入实测”，不支持直接确定最终 Harness。

OpenHands 的优势是已形成较稳定的 SDK、事件化 Conversation、Agent Server 和 Windows 可执行 sidecar。Cline 的优势是 TypeScript 嵌入体验、Hub-Spoke 后台架构和完整工具工作区，但 SDK 年龄、`0.0.x` API 与长会话内存风险更高。Goose 是 Rust 备用路线，可能更节省资源，但完整嵌入边界需要更多适配验证。

Codex 和 Claude Agent SDK 都有很强的 Agent 能力，但分别在 Provider 协议和厂商绑定上违反 CreatX 的硬需求。OpenCode 不能凭旧代码投入继续沿用，也不能凭旧项目故障直接判处干净上游失败；只有统一 Kernel Lab 能澄清它的真实位置。

最终选型必须由同一套 Windows Live 测试决定，而不是由 GitHub Stars、README 功能数量、已有 UI 或历史投入决定。

## 10. 官方资料索引

- [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk)
- [OpenHands SDK Documentation](https://docs.openhands.dev/sdk)
- [Cline SDK](https://github.com/cline/cline/tree/main/sdk)
- [Cline SDK Documentation](https://docs.cline.bot/sdk/overview)
- [Cline Hub-Spoke Architecture](https://docs.cline.bot/sdk/architecture/hub-spoke)
- [Cline Changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md)
- [Goose](https://github.com/aaif-goose/goose)
- [Goose Session Management](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/sessions/session-management.md)
- [Goose Context Management](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/sessions/smart-context-management.md)
- [Goose Subagents](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/subagents.mdx)
- [Codex](https://github.com/openai/codex)
- [Codex app-server Protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenCode](https://github.com/anomalyco/opencode)
- [OpenCode Server Documentation](https://opencode.ai/docs/server/)
- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK Python](https://github.com/anthropics/claude-agent-sdk-python)
- [OpenAI Agents SDK TypeScript](https://github.com/openai/openai-agents-js)
- [OpenAI Agents SDK Python](https://github.com/openai/openai-agents-python)
- [Deep Agents JS](https://github.com/langchain-ai/deepagentsjs)
- [Mastra](https://github.com/mastra-ai/mastra)
- [VoltAgent](https://github.com/VoltAgent/voltagent)
- [PydanticAI](https://github.com/pydantic/pydantic-ai)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [Pi](https://github.com/earendil-works/pi)
- [Letta](https://github.com/letta-ai/letta)
