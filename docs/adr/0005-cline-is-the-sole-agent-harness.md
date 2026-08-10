# ADR-0005：Cline 是 CreatX 唯一 Agent Harness

## 2026-08-09 运行拓扑门禁执行记录

正式 `0.1.16` 的 19 MB 图片历史现场证明 Electron Main 内拓扑不再满足本 ADR 的窗口响应和内存门禁。当前实现已按既定决策把 Cline Adapter、Session、权限存储和档案恢复迁入受监督 Utility Process；Main 通过稳定 CreatX 合同代理工具、事件、审批、取消和 Owner 持久化回调，没有修改 Cline Core、引入第二 Harness 或建立第二消息权威。证据见 `docs/discussions/2026-08-09-cline-heavy-history-performance.md` 与 `docs/baseline/creatx-cline-runtime-isolation-2026-08-09.md`。

## Status

Accepted

日期：2026-07-26

部分取代说明（2026-07-28）：ADR-0009 取代本文把“所有第一版副作用都逐次审批”作为唯一产品行为的部分。唯一 Cline Harness、事实所有权、Adapter 边界、不修改 Cline Core 和全机信任边界继续有效；当前已接受目标为 Session 直接切换审批/自由，Growth 只在自由模式运行。

## Context

CreatX 第一版需要可替换前端、真实 Provider（模型服务）、真实文件和可扩展创作工具，同时避免重写成熟 Coding Agent（编码智能体）的会话、模型循环、工具、上下文和取消能力。

OpenHands、OpenCode、Goose 和 Cline 已按简化后的第一版要求调查。Cline SDK `0.0.65` 能在 Windows Node Runtime（运行时）中直接创建 `ClineCore`，提供会话、SQLite、Provider、工具、Plugin（插件）、Skill（技能）、MCP（模型上下文协议）、Queue（排队）、Steer（插话）、Abort（取消）和历史接口。它最接近 Electron 中的可嵌入 Harness，但其公开 Core 仍标为 `experimental`。

ADR-0004 原先让 Rust Runtime 同时拥有持久 Run、权限、文件副作用、事件和 SQLite。如果直接接入 Cline 而仍复制这些事实，会产生两个会话和 Run 权威，违背“一个业务规则只有一个权威实现”。

## Decision

### 唯一 Harness

- Cline 是 CreatX 唯一 Agent Harness（智能体运行框架）。
- 第一版固定使用官方 Tag `sdk/sdk/v0.0.65`、Commit `f33ab3a872091952f44e43d0c8f5438099a60ada` 和 npm `@cline/core@0.0.65` / `@cline/sdk@0.0.65`。
- OpenHands、OpenCode、Goose、Codex app-server 和其他框架保留为历史调查证据，不再进入实现分支、运行时回退或双 Harness 抽象。
- 不建设“随时切换多 Harness”的通用平台。CreatX 只保留隔离 Cline 私有类型的 Adapter（适配层），其目的在于可维护和升级，不是并行支持其他 Harness。

### 事实所有权

- Cline 拥有模型循环、Provider 调用、会话消息、工具调用与结果、上下文压缩、Queue/Steer、Abort/Stop、Checkpoint 和 Cline 会话 SQLite。
- CreatX 不建立可独立执行的第二套 Agent Run 状态机，也不把 Cline 会话消息复制成另一份运行权威。
- CreatX 拥有项目身份、项目与 Cline 会话的必要关联、真实文件产品语义、`.creatx/` 工作台元数据、图片任务、用户与项目画像、桌面生命周期和稳定 UI Projection（界面投影）合同。第一条骨架只在内存中转换和投影 Cline 事件，不持久化第二套消息、Run、执行事件或 UI 投影缓存。
- Cline 与 CreatX 可以各自拥有存储，但每份数据只有一个声明写入者。ADR-0004 中“Rust Runtime 是全部 Run、权限、文件副作用、事件和唯一 SQLite 的所有者”被本 ADR 取代。
- Rust 不再是第一版 Agent Runtime 的必选前置。只有后续真实能力证明需要原生服务时，Rust 才拥有该明确产品能力，不能重新接管或镜像 Cline 会话事实。

### 接入边界

- 只有 `creatx/packages/cline-adapter` 可以导入 Cline 包和 Cline 事件类型。
- Renderer 和其他产品模块只使用 `creatx/packages/contracts` 定义的 CreatX 命令、事件、错误和投影。
- 第一版使用 Cline Local Backend（本地后端）；Hub/Remote（后台或远程运行）在后台继续成为真实需求后单独评估。
- 个人会话通过公开配置和 Tool Policy（工具策略）关闭项目工具。项目会话显式传入项目 `cwd` 与 `workspaceRoot`，但二者只是工作上下文，不是安全沙箱。
- 第一条骨架直接使用 Cline 原生审批，不自建四档权限：明确只读工具可以自动允许；未知工具和副作用工具逐次审批。批准 Cline 文件工具或 Shell 后，该次调用可能访问整台机器；CreatX 必须展示真实工具输入和这一信任边界，不能声称严格项目隔离。
- 创作能力通过 Cline Plugin、Skill、MCP 和公开 Tool API 接入。工具必须等待真实执行结果，不能返回客户端假确认。
- 第一版不修改 Cline Core。若公开扩展面不能完成硬需求，当前批次停止，先记录缺口、最小补丁和升级成本，再由新 ADR 决定是否维护 Fork（分叉源码）。

### 第一条骨架的进程与恢复

- Cline Local Backend 先作为实验默认直接运行在 Electron Main Process（主进程）内，减少首批进程协议、序列化和重连代码。
- Renderer 仍然只能使用稳定 CreatX 合同，因此后续迁移到 Electron `utilityProcess` 或受监督 Node 子进程时不得要求重写前端、Skill 或工作台。
- 同进程方案必须真实验证窗口响应、内存、异常传播、正常释放和残留进程；任一结果不满足生产要求时停止接受该拓扑，再以独立批次引入进程隔离。
- 重启后只要求读取 Cline 已保存的会话历史和项目文件，并允许用户发出新的“继续”回合。退出或崩溃时活动 Run 停止，不自动重放工具；精确续跑和严格一次副作用恢复延期。

### 版本治理

- `D:\CodexW\Creatx\cline-baseline` 是只读来源基线，不是 `creat1` 的运行时相对依赖。
- 生产依赖固定精确版本和 Lockfile（锁文件），禁止 `^`、`~`、Nightly（每日构建）或自动跟随 `main`。
- 升级先在独立 Worktree（工作树）运行合同、真实 Provider、真实工具、Windows 生命周期和资源回归，再更新基线、ADR 证据和依赖版本。
- 未通过升级门禁时继续使用已固定版本，不在生产代码添加跨版本永久兼容垫片。

## Consequences

### Positive

- 第一版不重写 Agent 内核，改动集中在 CreatX 前端、Adapter、创作 Plugin、文件与工作台产品层。
- Cline 类型只存在于一个边界，SDK 变动不会扩散到所有 UI 和业务模块。
- 会话、工具和 Run 只有一个执行权威，避免双数据库和双状态机竞态。
- TypeScript 与 Electron 的直接集成减少 Python Sidecar 和跨语言 Agent 协议成本。

### Negative

- Cline `0.0.65` 仍是 Experimental（实验性）API，需要固定版本和升级合同测试。
- Cline 的内存、长会话、取消和重启行为尚未完成 CreatX Live（真实运行）验收。
- 第一条骨架的原生审批不是操作系统沙箱；用户批准的 Cline 工具属于本机信任边界。
- 放弃“Rust 统一拥有所有 Runtime 状态”意味着原 ADR 和未来 Rust 规划必须按真实产品能力重新收缩。
- 选择唯一 Harness 降低了短期抽象成本，也接受了对 Cline 公开 API 的产品依赖。

## Rejected Alternatives

- 同时支持 Cline 与 OpenHands/OpenCode：拒绝，因为会扩大协议、测试、打包和错误投影成本，第一版没有用户价值。
- Fork Cline 后直接改 Core：第一版拒绝；先使用公开 Plugin、Skill、Tool、Hook 和 Adapter。
- 让 Rust 镜像 Cline 会话和 Run：拒绝，因为会产生双重事实权威。
- Renderer 直接使用 Cline 事件：拒绝，因为会把实验性 API 扩散到前端并阻断独立改版。

## Verification Required Before Production

1. Windows 上使用固定版本启动、创建会话、退出且无残留进程。
2. 真实 Provider 完成一轮回复和错误分类。
3. Cline 原生文件工具经逐次审批修改真实项目文件，并返回可配对结果。
4. 个人会话无法产生项目文件、命令或浏览器副作用。
5. 项目会话从项目目录开始工作；未知工具和副作用工具在用户逐次批准前不执行，界面明确批准后的全机信任边界。
6. Adapter 能在内存中投影流式回复、工具、等待、完成、失败和取消，不建立第二套持久执行事实。
7. 正常退出或重新启动后能读取已完成会话历史并开启新的继续回合；活动 Run 不自动恢复或重放工具。
8. Cline 版本升级合同能检测事件和持久化不兼容。

## References

- `docs/product/creatx-requirement-map.md`
- `docs/discussions/2026-07-26-low-change-harness-comparison.md`
- `docs/adr/0004-modular-runtime-and-integrated-batches.md`
- `docs/baseline/cline-sdk-v0.0.65.md`
