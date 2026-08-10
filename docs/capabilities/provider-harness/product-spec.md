---
title: Provider Harness 产品规格
doc_type: capability-product-spec
owner: provider-harness
status: utility-process-heavy-history-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/provider-harness/product-spec.md
---

# Provider Harness 产品规格

## PHS-001 唯一 Cline Harness

CreatX 只使用 Cline，不提供 OpenHands、OpenCode、Goose 或其他 Harness 的运行时选择、回退或双写。第一版固定 Cline SDK `0.0.65`。

## PHS-002 单一 Adapter 边界

只有 Cline Adapter 可以读取 Cline 类型和事件。Renderer、Session、Project Files 和 Workbench 只读取稳定 CreatX Command（命令）、Event（事件）、Error（错误）和 Projection（投影）。

## PHS-003 Cline 执行事实

Cline 是模型循环、会话消息、工具调用与结果、上下文压缩、Queue、Steer、Abort、Stop、Checkpoint 和 Cline 会话 SQLite 的事实权威。CreatX 不建立第二套可执行 Run 或消息数据库。

## PHS-004 稳定事件投影

Adapter 必须在当前进程内把 Cline 原始事件转换为至少以下用户可解释状态：流式回复、工具请求、等待审批、工具运行、工具成功、工具失败、Run 完成、Run 失败、Run 取消和状态未知。第一条骨架不持久化第二套 UI Projection 或执行事件日志；重启后从 Cline 历史重新读取稳定结果。未知事件必须显式报告，不能静默丢弃或猜测完成。

## PHS-005 真实工具结果

第一条骨架直接使用 Cline 正式文件 Tool；后续 CreatX 创作工具通过中立 `CreatXToolContribution` 合同提供，由唯一 Adapter 转换为 Cline 公开 `createTool/extraTools`。Agent 只有在真实执行结束后才能收到成功、失败、取消或结果未知；客户端展示动作不能冒充工具成功。

## PHS-006 Provider 与模型

第一版至少支持用户真实使用的一个 Provider，并保留 Cline 已有多 Provider/多协议能力。缺凭据、未授权、额度、网络、限流、模型、协议和程序错误必须分类，不能统一显示为“AI 没有回复”。

## PHS-007 会话配置合同

Adapter 允许 Session 能力传入个人会话或项目会话配置。个人会话必须能关闭文件、命令、浏览器和项目工具；项目会话绑定 `cwd` 和 `workspaceRoot` 作为工作上下文，但不能把它们描述为沙箱。Adapter 必须把 Session 的审批/自由模式映射为 Cline 原生 Tool Policy：审批模式逐次确认副作用，自由模式保留完整 Act 工具集并自动批准已启用工具。具体默认值与切换语义由 Session 拥有，两种模式都属于全机信任边界。

## PHS-008 公开扩展优先

第一版只使用 Cline 公开 SDK、Plugin、Skill、MCP、Hook、Tool Policy 和 Runtime Host。需要修改 Cline Core 时必须停止当前批次，并以新 ADR 决定最小补丁、上游贡献、Fork 成本和升级策略。

## PHS-009 Windows 生命周期

Cline 必须在 Windows 前台启动、使用隔离数据目录、报告健康状态、正常释放并无残留失管进程。Cline Adapter、Cline Session、权限存储和 Cline 档案恢复固定运行于受监督 Electron Utility Process（工具子进程）；Electron Main 只保留窗口、系统对话框、Shell、受限协议和稳定 CreatX IPC Broker（进程间通信代理）。CreatX 工具通过稳定命令/结果合同回到其权威 Store 执行，不能把工具复制到第二套 Runtime。

子进程异常时 Main 和 Renderer 必须继续响应，未决 AI 请求失败关闭，Main 侧活动工具收到取消；不得自动重放结果未知的 Provider 或工具副作用。自动重启和活动 Run 恢复不属于当前版本。Electron 打包、更新和后台 Hub 属于 Desktop Runtime。

## PHS-010 固定版本和升级

生产依赖使用精确版本和 Lockfile。升级只能从独立 Worktree 进行，必须通过 Provider、工具、事件、会话持久化、权限、Windows 生命周期和资源回归后才能替换基线。

## PHS-011 失败关闭

初始化失败、Provider 不可用、事件不兼容、工具结果无法配对或会话目录无效时，相关 Run 不得开始或必须进入明确失败。不得用本地模板、旧事件或确定性回复冒充 Agent。

## PHS-012 中立 CreatX 工具扩展

CreatX 工具定义不能暴露 Cline 类型，只声明名称、说明、顶层对象 JSON Schema、应用/项目作用域、审批要求、超时和显式成功/失败结果。Adapter 在 Session 启动前拒绝非法名称、重复项、Cline 内置名称冲突和无效 Schema；项目工具缺少 `projectId` 时失败关闭。审批要求进入 Cline 原生 Tool Policy，不建立第二套工具循环或审批状态机。

## PHS-013 用户模型连接与会话切换

CreatX 保存用户级交流模型连接 Profile（配置档），每项包含显示名、Provider、模型、可选 Base URL 和加密 API Key。Renderer 只能读取“凭据是否已配置”，不能读取密钥。空闲会话可以通过 Cline `updateSessionConnection` 公共接口切换连接；下一轮必须保留原会话历史并使用新连接。活动 Run 或活动 Growth 禁止切换。连接的稳定 Profile ID 必须进入 Cline 会话元数据，使应用重启后从同一配置恢复，而不是只按 Provider/模型猜测。

## PHS-014 对象 Worker 最小权限

Growth World Pro 的一次性对象 Worker 必须由可信 Runtime 指定命名 Profile（配置档），并采用 deny-by-default（默认拒绝）的 Cline Tool Policy（工具策略）。研究 Worker 只可读取文件并提交研究结果；写作 Worker 只可读取、写入该对象正文、提交该对象图片任务并完成对象；恢复 Worker 只可读取、接管既有图片任务并完成对象。对象 Worker 不得调用 Goal 进度、工作台、蓝图、Shell、搜索、Skills 或其他全局工具，用户切换会话审批模式也不得扩大该 Profile。普通项目自由会话保持完整 Act 工具集。

每个命名 Worker Profile 必须由同一个权威工具名集合同时生成模型可见的 CreatX `extraTools` 和执行 Tool Policy。禁用的 CreatX 工具不能只在执行时拒绝而仍暴露给模型；deny-by-default 策略继续作为第二道门禁。蓝图 Worker 只看到明确允许的只读工具、`write_world_blueprint` 与 `report_growth_progress`，不看到工作台、编辑、图片或其他全局 CreatX 工具。Cline 内置工具继续由同一 Profile 的 Tool Policy 控制。

## PHS-015 对象尝试与批次失败隔离

每次研究、写作或结果未知恢复都必须由 Runtime 创建持久 `attemptId`，并通过 Adapter 注入可信工具上下文。工具提交必须匹配当前 Goal、版本、对象、阶段和 attempt；旧 Worker 的迟到提交失败关闭，同一 attempt 的完全相同提交可以幂等重放。

Adapter 必须按命令顺序返回逐 Worker 结果。一个 Worker 的 Provider rejection 不得丢弃同批其他 Worker 的成功结果。对象无持久证据时进入 `retryable`，最多尝试三次后进入 `blocked`；研究发现结构化 critical gap 时先保留研究包，再把该对象标成 `blocked`。只有最早未完成层已无 runnable 对象时，协调器才返回等待检查，不得无限派发。

## PHS-016 用户可见模型语言

Adapter 的统一系统提示必须要求模型使用用户当前语言完成所有用户可见输出，包括 Reasoning（推理文本）、进度叙述、工具说明、错误解释和最终回复。中文用户默认使用简体中文；代码、路径、专有名词和需要保持原样的引文可以保留原语言，用户明确要求时可以切换语言。

该规则同时作用于普通会话和 Growth Worker，不得在各 Skill 中复制。它是生成约束而不是运行门禁：偶发语言偏差不得阻塞 Run 或 Growth，Renderer 不得翻译、改写或伪造 Provider 输出。

## 开放问题

- Cline `0.0.65` Utility Process 的源码 Electron 隔离、崩溃失败关闭和重型历史资源基线已通过；打包产物入口与发布级长期资源仍待发布批次验证。
- Cline `0.0.65` 对工具中取消和结果未知的真实行为。活动 Run 重启自动续接已经明确延期。
- Cline `0.0.65` 的运行中连接更新不复用 Adapter 注入的代理 Fetch；需要系统代理的切换后 Provider 路径尚未单独 Live 验证。
- Adapter 稳定事件的最小字段和版本迁移格式。

## PHS-017 临时 Owner Growth 控制器

Adapter 必须通过 Cline 公共 `extraTools` 为显式 Owner Growth Turn 临时注册一个受信任控制器。它只接受 Runtime 注入的 Owner、启动消息、项目和 Run 身份，等待 Growth 终态并返回结构化可信证据；普通 Turn 和 Worker Session 中均不可见。

## PHS-018 正式 Owner 结果回传

Growth 控制器结果必须成为同一 Owner Cline 历史的正式 Tool Result，并由该 Turn 的模型生成正式 Assistant 最终回复。Adapter 不得手工写 SQLite、拼接 Worker Timeline、建立第二消息存储或在下一轮补注隐藏摘要。

## PHS-019 能力目录按受众失败关闭

每项 CreatX Tool 与 Skill 必须有单一权威 audience/Profile。未声明受众或当前 Session 不匹配时不进入模型可见目录；执行策略继续作为第二道门禁。普通会话、Owner Growth 控制器、阶段 Worker 和对象 Worker 的能力集合分别测试。

## PHS-020 回复持久化确认

Adapter 必须能确认 Owner Assistant 最终回复已由 Cline 持久化，再向 Growth Runtime 提交可完成证据。结果未知时返回明确失败，不得由 `done.outputText` 的瞬时内存值推断持久成功。

## PHS-021 全局模型与失效会话回退

设置页当前选中的交流模型 Profile 是全局默认连接。新会话使用该连接；对话框模型下拉只为当前会话建立持久覆盖，不得反向改变全局默认。设置页保存一个 Profile 时，该 Profile 成为新的全局默认。

恢复会话引用的 Profile 仍存在且含有效凭据时必须保留单会话覆盖。原 Profile 已删除、未随档案迁移、无法解析或不再含有效凭据时，Adapter 必须在 Provider 请求前自动改用当前全局默认，并把 Provider、模型和 Profile ID 写回同一 Cline 会话。不得只保留旧 Provider/模型构造无 API Key 或无 Base URL 的连接。全局默认也无有效凭据时必须本地失败关闭，不发送 Provider 请求，也不把失败输入写成已接纳的 Cline 用户消息。

## PHS-022 恢复 Session 的进程所有权

Adapter 恢复持久 Session 前必须先收束上次进程真正遗留的 `running` 状态，再把该 Session 的执行 PID 和当前状态显式接管到本次 Cline Utility Process。接管后，Cline 的历史读取或死亡进程收束不得再用旧 PID 把当前 Turn 标记为 `failed_external_process_exit`。仍存活的其他 CreatX 实例或同 Session 的本地活动 Run 必须失败关闭；不得通过关闭 stale reconciler、复制会话数据库或修改 Cline Core 掩盖所有权缺失。

## PHS-023 Windows 可复现依赖安装

Windows 必须使用固定 Bun 版本、冻结 Lockfile（锁文件）和仓库内声明的 Linker（链接器）布局，从空依赖目录完成安装。安装不得依赖修改系统长路径设置、从历史 `node_modules` 或 Bun 缓存手工复制包，也不得把不完整安装后的现成目录记为通过。Cline SDK、SAP AI SDK 传递包、应用入口文件和 Windows 命令 Shim（命令入口）必须由只读完整性检查验证。

## PHS-024 对话视觉输入

Adapter 必须把已由 Main 授权并验证的 PNG/JPEG Data URL 作为 Cline `userImages` 发送，把文本路径作为 `userFiles` 发送；不得把聊天图片二进制交给 `userFileContentLoader`。Adapter 在 Cline 调用前再次限制媒体类型、单图和总字节数。Cline 持久用户消息中的 image content block 是历史图片事实，Adapter 只投影稳定类型和受限解析身份，不把 Base64 或本机路径暴露给 Renderer。当前模型不支持视觉时保留真实 Provider/Cline 错误，不按模型名猜测成功。

## PHS-025 项目图片历史预算

Cline `read_files` 读取的项目图片仍作为正式 Tool Result 持久保存，供当前历史和用户检查；Adapter 不得改写或迁移既有 Cline 会话。后续 Provider 请求不得重复携带旧回合项目图片，只可在当前回合按时间倒序保留有界代表图；直接用户 `userImages` 不受该投影规则改写。

单个 Run 通过 `read_files` 累计读取的项目图片 Base64 必须有独立硬上限，超限在继续读取和 Provider 调用前失败关闭。Provider 投影预算与单 Run 读取预算是防止新历史继续膨胀的保护，不得把它们描述成已经消除 Cline Session 自身的内存成本；窗口稳定性由 `PHS-009` 的进程隔离保证。
