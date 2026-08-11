---
title: Provider Harness 验收矩阵
doc_type: capability-acceptance
owner: provider-harness
status: utility-process-heavy-history-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/provider-harness/product-spec.md
---

# Provider Harness 验收矩阵

| ID | 场景 | 通过条件 | 类型 |
| --- | --- | --- | --- |
| ACC-PHS-001 | 固定版本启动 | Windows 使用 `0.0.65` 创建 ClineCore，版本、数据目录和健康状态可读 | 本地真实运行 |
| ACC-PHS-002 | 正常退出 | Dispose 后 Cline、Node 和工具子进程均退出，无失管进程 | Windows 进程检查 |
| ACC-PHS-003 | 真实 Provider | 真实模型产生流式或最终回复，Provider、模型、用量与终态可解释 | Live Provider |
| ACC-PHS-004 | Provider 失败 | 缺凭据、未授权、额度、网络和模型错误至少能分到不同类别 | 定向失败测试 |
| ACC-PHS-005 | 真实文件工具 | Cline 原生文件工具经审批写入真实项目文件，只有真实执行结束后才收到成功结果 | Live 工具与文件 |
| ACC-PHS-006 | 工具失败 | 工具不写入或部分失败时返回明确失败/未知，不产生成功式回执 | 失败关闭测试 |
| ACC-PHS-007 | 个人会话隔离 | 个人会话无法调用文件、命令、浏览器和项目工具 | 越权测试 |
| ACC-PHS-008 | 审批模式 | 未知工具和副作用工具在审批前不执行；拒绝、超时和应用退出均无该次工具副作用 | Cline 原生审批集成 |
| ACC-PHS-009 | 事件投影 | 回复、审批、工具、完成、失败和取消均转换为稳定 CreatX 事件 | 合同测试 |
| ACC-PHS-010 | 未知事件 | 新增或无法识别的 Cline 事件产生显式兼容错误，不被静默忽略 | 兼容测试 |
| ACC-PHS-011 | Queue 与 Steer | 排队消息和插话在边界与顺序上可观察，不相互伪装 | Live/集成测试 |
| ACC-PHS-012 | 取消 | 模型或工具运行中取消后进入明确终态，旧 Run 不继续写文件 | Live 取消测试 |
| ACC-PHS-013 | 历史继续 | 新进程能读取已完成会话历史和项目文件；用户发送新的“继续”后完成一轮，不自动恢复旧 Run 或重放旧工具 | 持久化测试 |
| ACC-PHS-014 | Adapter 隔离 | Cline 包只被 `cline-adapter` 导入，其他包只依赖 CreatX 合同 | 静态依赖检查 |
| ACC-PHS-015 | 升级门禁 | 候选版本破坏事件或合同测试时升级失败且当前固定版本不变 | 版本兼容测试 |
| ACC-PHS-016 | 项目上下文不是沙箱 | Cline 从项目 `cwd` 启动；审批界面明确批准文件或 Shell 工具后可能访问整台机器，不宣称越界自动阻止 | Windows 信任边界检查 |
| ACC-PHS-017 | 受监督 Cline 子进程 | Cline 只在 Utility Process 运行；Main 不加载 Cline SDK。工具、审批、事件、取消和持久化回调跨稳定合同真实执行；子进程崩溃时窗口继续响应、未决操作失败关闭、Main 工具取消且未知副作用不重放 | Electron 进程与失败关闭集成 |
| ACC-PHS-018 | 中立工具注册 | 不导入 Cline 类型的 CreatX 工具进入真实 Cline Session 配置；非法、重复或内置冲突名称在启动前失败 | 本地真实 Cline 集成 |
| ACC-PHS-019 | 中立工具真实调用 | 真实 Provider 选择项目工具，Adapter 注入正确 `projectId`，原生审批生效，真实 Port 结果返回模型 | Live Provider 与工具 |
| ACC-PHS-020 | 自由模式公开映射 | 完整 Act 工具集与 Skills 保持启用，wildcard auto-approve 生效且不切换到 Cline `yolo` Agent Tool Preset | Cline 配置与真实工具集成 |
| ACC-PHS-021 | 代理网页抓取 | Windows 代理环境下 `fetch_web_content` 通过 Cline 公开 Tool Executor 覆盖点使用 CreatX 代理；真实 Provider 能从搜索结果读取一个来源正文，站点拒绝时返回真实 HTTP 失败 | Live Provider 与网页抓取 |
| ACC-PHS-022 | 用户连接与会话模型切换 | 密钥经系统加密存储且不进入 Renderer；空闲会话下一轮使用新 Base URL、Key 和模型，历史不丢失；重启按 Profile ID 恢复；活动 Run/Growth 失败关闭 | 本地 Cline 集成与 Electron 持久化 |
| ACC-PHS-023 | 对象 Worker 最小权限 | 研究、写作、恢复 Worker 分别只获得命名 Profile 的白名单工具；`report_growth_progress`、工作台、蓝图、Shell 等全局能力关闭，权限模式切换不能扩大白名单；普通自由会话不受影响 | Adapter 策略与物化派发测试 |
| ACC-PHS-024 | 对象 Worker 失败隔离 | Adapter 保留同批成功结果；可信 attempt 贯穿派发与工具上下文；迟到提交失败关闭，同 attempt 精确重放；单对象失败进入有限重试或阻塞，不使其他 runnable 对象回滚 | Adapter 投影测试与 Materialization V3 状态机测试 |
| ACC-PHS-025 | 中文用户可见模型输出 | 真实 Cline Provider 请求的统一系统消息要求推理、进度、工具说明、错误解释和最终回复使用简体中文，同时允许代码、路径、专名和引文保持原样；不增加语言失败门禁或前端翻译 | 本地 Provider 请求合同测试 |
| ACC-PHS-026 | 命名 Growth Worker 工具可见性 | 同一 Profile 白名单同时过滤模型可见 CreatX extraTools 和执行 Tool Policy；禁用工具不出现在模型工具定义且直接执行仍失败关闭，普通自由项目会话不受影响 | Adapter 真实 Session 配置与策略测试 |
| ACC-PHS-027 | 全局模型与失效会话回退 | 有效单会话 Profile 重启后继续使用；已删除 Profile 的恢复会话在首个请求前改用全局默认并持久写回；对话框切换不改变全局默认；全局也无凭据时请求数和新增消息均为零 | Adapter 持久化集成与模型设置测试 |
| ACC-PHS-030 | PHS-022 | 进程 A 留下旧 PID 后退出，进程 B 恢复同一 Session 并开始新 Turn | 启动前真实 stale 状态被收束；新 Turn 由进程 B 接管，运行期间读取/列举历史不产生旧 PID 外部退出失败，完成状态和消息保持一致 |
| ACC-PHS-031 | PHS-022 | 另一个 CreatX 实例仍存活并拥有同一 Profile 或 Session | 第二实例或第二次接管在 Provider 和工具副作用前失败关闭，不覆盖活动会话 PID |
| ACC-PHS-032 | PHS-023 | Windows 长路径项目从空依赖目录执行 `bun install --frozen-lockfile` | 固定 Bun 与 Lockfile 使用仓库声明的布局一次安装成功；Cline、SAP AI SDK、Vite 与 Windows Shim 全部完整；不修改系统设置或手工复制包 |
| ACC-PHS-033 | PHS-024 | 发送真实 PNG/JPEG 与文本附件，并重读 Cline 历史；另提交非法 Data URL 与超限批次 | 图片只进入 `userImages` image block，文本只进入 `userFiles`；历史图片可按消息身份解析；非法或超限输入在 Provider 前失败关闭；无二进制 UTF-8 读取错误 |
| ACC-PHS-034 | PHS-009 / PHS-025 | 用至少 19 MB、包含多轮 `read_files` 图片结果的真实历史副本重开并发送新回合 | Provider 请求不含旧回合项目图且保持在 512 KiB 内；Main 不随 Cline 历史增长超过 128 MiB；重型内存归属 Utility Process；正式历史不被改写；退出无残留 |
| ACC-PHS-035 | PHS-026 | 保存未知 Provider；启动含可唯一修复、不可唯一判断和普通自定义错误档案的旧设置 | 新保存失败关闭；仅唯一匹配项原位修复且 Profile ID、密钥与会话引用不变；其他项只报告并保持原字节语义 |

`ACC-PHS-035` 已由 Model Settings 10/10 定向测试及 653/653 集成全量覆盖。自动化证明未知 Provider 新保存失败；唯一同模型、同 Base URL 档案原位修复且 Profile ID 与密钥保留；无唯一对应和不满足旧错误形状的档案只报告不改写。没有使用正式 Profile 或外部 Provider。

## 当前证据

2026-08-09 Utility Process 与重型历史批次：`ACC-PHS-034` 通过；`002`、`009`、`014`、`017`、`018` 在本批范围回归通过，其中 `017` 的活动 Main 工具执行中强杀子进程时序尚未单独自动化，仍为部分验证。正式 19,262,810 字节历史副本的新回合请求体为 121,317 字节，Main Working Set 增长 0，Utility Process 从 273,825,792 增至 594,944,000 字节；真实跨进程 `register_workbench`、审批、结果返回、子进程强杀失败关闭和退出无残留通过。全量 470/470（3,361 次断言）、Typecheck、Import Boundary、Production Build 与聊天图片 Electron 回归通过。没有外部 Provider、打包产物或完整 Desktop 全套通过；详见 `../../baseline/creatx-cline-runtime-isolation-2026-08-09.md`。

实现提交：`c9a4ae4`。完整命令和连续 Electron Live 证据见 `../../baseline/creatx-walking-skeleton-2026-07-26.md`。

| 结果 | Acceptance ID | 边界 |
| --- | --- | --- |
| 通过 | `ACC-PHS-002`、`005`、`009`、`013`、`014`、`016` | 干净退出、真实 editor、稳定投影、重启新回合、导入隔离和全机信任提示已验证 |
| 部分通过 | `ACC-PHS-001` | 固定 `0.0.65`、显式 SQLite 与启动通过；尚未暴露独立 Harness 健康指标 |
| 部分通过 | `ACC-PHS-003` | DeepSeek `deepseek-chat` 真实回复通过；CreatX 尚未展示用量 |
| 部分通过 | `ACC-PHS-004` | 缺凭据失败关闭与错误分类测试通过；未逐类执行真实未授权、额度、网络和模型故障 |
| 部分通过 | `ACC-PHS-008` | 拒绝后无文件副作用通过；审批超时与应用在审批中退出未单独验证 |
| 部分通过 | `ACC-PHS-012` | 等待审批阶段取消通过；模型流和已执行工具的取消时序未完整验证 |
| 部分通过 | `ACC-PHS-017` | 主进程内窗口响应和干净退出通过；长时间资源与发布级异常传播未验证 |
| 通过 | `ACC-PHS-018` | 中立工具经公开 `createTool/extraTools` 进入真实 Cline Session 配置；名称、Schema、超时与冲突校验通过 |
| 通过 | `ACC-PHS-019` | 真实 DeepSeek 选择 `register_workbench`，Adapter 注入项目 ID，原生审批拒绝/批准和真实 Port 返回均通过 |
| 通过 | `ACC-PHS-021` | 真实 JMRAI `gpt-5.6-luna` 连续调用 `fetch_web_content` 读取 Bing RSS 与 Wikipedia 正文；直连/代理对照证明代理覆盖生效，Britannica `403` 保持失败 |
| 部分通过 | `ACC-PHS-022` | Cline 公共更新接口已用本地 HTTP Provider 证明下一轮切换、三轮历史保留和重启按 Profile ID 恢复；Electron 证明系统加密、投影脱敏和设置重启恢复。尚未用外部有效 Provider 验证切换后的代理网络路径。 |
| 通过 | `ACC-PHS-023` | Adapter 48 项测试覆盖三个命名 Profile、未知 Profile 失败关闭、越权工具关闭、模式切换不扩权与普通自由会话不回归；World Materialization 24 项测试证明研究、写作和恢复派发携带正确 Profile。 |
| 通过（自动） | `ACC-PHS-024` | Adapter 定向测试证明 rejection 转为同位置失败结果且保留成功兄弟；World Materialization 28 项测试覆盖混合失败、critical gap 阻塞、迟到 attempt、精确重放、unknown 接管和三次有限重试。尚未用真实 Provider 恢复旧 Goal。 |
| 通过（自动） | `ACC-PHS-025` | 本地 Provider 请求合同测试证明普通项目会话收到统一简体中文用户可见输出约束；Growth Worker 复用同一 `startSession` 系统提示入口。没有外部 Provider 遵循率证据。 |
| 未通过声明 | `ACC-PHS-020` | ADR-0009 已接受自由模式，但当前 Adapter 仍配置 wildcard `autoApprove: false` |
| 未通过声明 | `ACC-PHS-006`、`007`、`010`、`011`、`015` | 工具执行失败、个人会话、未知事件、Queue/Steer 和升级门禁不属于本次已证实闭环 |

因此 Provider Harness 仍是“骨架部分验收”，但中立 CreatX Tool Live（工具真实运行）已由 `ACC-PHS-019` 建立。共享合同证据见 `../../baseline/creatx-six-line-interface-enablement-2026-07-27.md`，真实调用见 `../../baseline/creatx-register-workbench-live-2026-07-27.md`。

`ACC-PHS-032` 已由提交 `2cf78df` 和 `D:\CodexW\Creatx\dependency-install-verify` 的全新 Hoisted Install（提升式安装）定向通过：冻结安装退出码 0，安装完整性 5/5、安装回归 13/13、Import Boundary 2/2 和 Typecheck 通过。未运行全量测试、Production Build（生产构建）、Electron 或外部 Provider，不扩大为 Harness 全面验收。

`ACC-PHS-033` 已由 Cline Adapter 真实本地 Session/SQLite 与受控 OpenAI-compatible Provider 合同测试通过：请求含真实 image content block，历史重读可恢复图片字节，未出现 `userFiles` 二进制错误。没有调用外部视觉 Provider，不能据此证明具体用户模型具备视觉能力。

## Owner Growth 重建验收

| ID | 规则 | 场景 | 证据要求 |
| --- | --- | --- | --- |
| ACC-PHS-027 | PHS-017, PHS-019 | 比较普通 Turn、Owner Growth Turn 与各 Worker 工具目录 | 只有 Owner Growth Turn 含控制器；Worker 严格按 Profile；未声明 audience 失败关闭 |
| ACC-PHS-028 | PHS-018 | 受控 Provider 完成 Growth 控制器调用 | 启动消息、Tool Result 和最终 Assistant 回复进入同一真实 Cline Session/SQLite |
| ACC-PHS-029 | PHS-018, PHS-020 | 销毁并重建 Adapter 后普通追问 | 新 Turn 读取正式历史；当前工具目录无控制器；没有第二消息存储 |
| ACC-PHS-030 | PHS-018, PHS-020 | 控制器失败、取消及最终回复持久化结果未知 | 分别保留正式失败/取消事实；结果未知不提交 completed；重启后可普通续聊 |

`ACC-PHS-028`、`029` 和取消恢复的 Kernel 部分已由受控 Provider 通过，见 `../../baseline/creatx-owner-growth-result-kernel-2026-08-05.md`；尚不是外部 Provider Live。
