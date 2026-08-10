# Owner Conversation And Growth Run Reconstruction Plan

状态：生产重建与自动验收已完成；外部 Provider 长跑 Live 验收待单独执行。

日期：2026-08-05。

## 0. 执行状态

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| Task 0 | 已完成 | `1804d0b`、`b940911`、`a307e6f`；Typecheck、Import Boundary、277/277 自动测试、Build、Desktop PASS |
| Task 1 | 已完成（受控 Provider 合同证据） | `../baseline/creatx-owner-growth-result-kernel-2026-08-05.md` |
| Task 2 | 已完成 | 五条能力线的稳定规则与验收 ID |
| Task 3–8 | 已完成（生产代码与受控 Provider/Electron 证据） | `../baseline/creatx-owner-growth-authority-rebuild-2026-08-05.md` |
| Task 9 | 部分完成 | Typecheck、Import Boundary、全量自动测试、Build、受控 Provider Desktop 与退出重启 PASS；外部 Provider 长跑未执行 |

## 1. 目标

从底层重建普通对话与 Growth 的运行关系，使一次 Growth 在同一个 Owner Conversation（所有者会话）中拥有正式的启动消息、Growth Run（生长运行）、Child Worker（子工作者）、结构化活动、真实文件副作用和最终 Assistant 回复。

修复后的用户体验必须是：

```text
先在普通对话中讨论，也可以直接输入显式 /growth* 命令
-> 启动命令作为正式用户消息留在原对话
-> Growth 活动区展开，持续展示可理解的执行活动
-> 内部阶段与 Worker 自主运行
-> 真实项目文件持续写入，工作台同步展示
-> Child Worker 的有界结果回到 Owner Growth Run
-> Owner 在原对话中形成正式最终回复
-> Growth 活动进入终态并自动折叠
-> 用户继续普通聊天，下一轮自然读到刚才的最终回复
```

这不是 UI 补丁。Cline 继续拥有消息、模型回合和工具结果；Growth Runtime 只拥有 Goal、领域阶段、进度、恢复和终态；项目文件拥有作品内容；Renderer 只做投影。

## 2. 三套结构的逐项对比

| 环节 | 用户预期 | 当前错误结构 | 本计划目标结构 |
| --- | --- | --- | --- |
| 开始前聊天 | 可以先讨论需求 | 可以 | 保持普通 Owner 对话 |
| 启动 | 一句明确命令即可 | Main 截获命令并在会话外创建 Goal | 显式 `/growth*` 先成为 Owner 正式用户消息，再创建绑定该消息的 Growth Run |
| 普通消息 | 不误启动 Growth | 路由未误启动，但模型仍能加载 Growth Skill | 普通 Session 注册表中不存在 Growth 内部 Skill 和工具 |
| 运行主体 | AI 持续规划、调用和写作 | 外部 Scheduler 创建一组缺少原生回传关系的 Session | 一个 Owner Growth Run 管理领域阶段，Worker 都有正式父子身份 |
| Worker 上下文 | 每个 Worker 只读取必要资料 | 已有部分有界上下文 | 保留有界上下文，并由 Worker Profile 精确决定 Skill 和工具 |
| 过程展示 | 运行时看见它在做什么 | UI 手工拼接 Owner 与 Worker 时间线 | UI 读取同一运行谱系的结构化活动，不显示原始思维链 |
| 文件生长 | 工作台同步出现内容 | 基本可用 | Worker 通过真实工具写项目文件，工作台只读文件事件 |
| 最终回复 | 跑完给出正常总结 | Summary Worker 文字只投影到 Owner UI | 子结果正式回到 Owner，Owner 产生持久 Assistant 最终消息 |
| 自动折叠 | 完成后折叠过程并保留结果 | 部分由前端局部状态模拟 | Growth 终态驱动活动折叠；最终回复仍是普通对话消息 |
| 后续追问 | 可以继续问“完成了吗” | Owner 模型看不到 UI 中的总结，重新扫描并误调用 | 新 Owner Turn 从同一 Cline 历史读取最终回复，不运行 Scheduler |
| 重启恢复 | 仍能看到结果、进度和文件 | Cline、Goal、UI 来源不一致 | 对话从 Cline 恢复，Goal 从 Growth Store 恢复，作品从项目文件恢复 |

## 3. 权威模型

### 3.1 Cline Conversation

唯一拥有：

- 用户消息；
- Assistant 回复；
- Provider Turn（模型回合）；
- 工具调用与工具结果；
- 父子 Session 或公开的等价结果回传记录；
- 后续对话上下文。

Growth 最终汇报如果没有进入这条权威历史，就不算已经交付给 Owner。

### 3.2 Growth Runtime

唯一拥有：

- Goal 身份与版本；
- 领域阶段与执行顺序；
- 当前进度；
- 暂停、结束、等待、恢复和失败终态；
- Worker attempt 身份及副作用门禁。

Growth Runtime 不复制 Cline Transcript（会话全文），也不拥有第二套 Assistant 消息。

### 3.3 Project Files

唯一拥有作品正文、图片、索引、工作台元数据和用户编辑结果。Growth 运行状态不能代替文件，Renderer 缓存也不能成为文件真相。

### 3.4 Renderer

Renderer 不创建消息事实，不把多个无关 Session 拼成一条伪会话。它只投影：

- Owner Conversation 的用户消息和 Assistant 回复；
- 与当前 Owner Growth Run 有正式谱系关系的活动；
- Growth Runtime 的进度和终态；
- Project Files 的工作台内容。

## 4. 产品不变量

- `INV-SA-01`：只有命令目录识别出的显式 `/growth*` 输入可以创建、继续或转向 Growth Goal；普通自然语言不触发 Growth。
- `INV-SA-02`：Growth 启动消息必须作为用户可见且持久的 Owner 消息存在。
- `INV-SA-03`：一次 Growth 必须绑定唯一 Owner Session、启动消息和 Goal；不得只靠项目目录猜测归属。
- `INV-SA-04`：普通 Owner Session 不注册 Growth 内部 Skill、蓝图写入、阶段回执或物化完成工具。
- `INV-SA-05`：每个 Worker 只能获得其受信任 Profile 允许的 Skill、工具、输入和副作用能力。
- `INV-SA-06`：Child Worker 的过程保持独立，只有结构化状态和有界结果返回 Owner Growth Run。
- `INV-SA-07`：用户看到的最终 Growth 汇报必须是 Owner Cline 历史中的正式 Assistant 回复或 Cline 公共合同认可的等价父结果，不能只是 Renderer 拼接项。
- `INV-SA-08`：下一次普通 Owner Turn 直接从 Cline 权威历史读取最终回复，不使用每轮隐藏摘要补丁。
- `INV-SA-09`：工作台只投影真实项目文件；对话消息、运行活动和文件内容不得相互冒充。
- `INV-SA-10`：运行中活动默认展开；进入 completed、failed 或 cancelled 终态后按产品规则折叠，最终回复不折叠进思考或工具活动。
- `INV-SA-11`：重启后不依赖 Renderer 内存即可恢复对话、Goal 终态和工作台文件。
- `INV-SA-12`：已完成 Goal 后发送“完成了？”不得创建 Goal、运行 Scheduler、调用 Growth Skill 或改变任何项目文件。
- `INV-SA-13`：等待、可修复、可绕过、阻塞和失败必须保持不同语义；不得用笼统红错或假完成掩盖。

## 5. 范围与非目标

主能力线：`session`。

相邻合同：`provider-harness`、`creative-skills`、`growth-runtime`、`workspace-ui`、`project-files`。

本批允许修改：

- `creatx/packages/contracts/src/index.ts`
- `creatx/packages/cline-adapter/src/**`
- `creatx/packages/cline-adapter/tests/**`
- `creatx/packages/creative-skills/src/**`
- `creatx/packages/creative-skills/tests/**`
- `creatx/packages/growth-runtime/src/**`
- `creatx/packages/growth-runtime/tests/**`
- `creatx/apps/desktop/src/main.ts`
- `creatx/apps/desktop/tests/**`
- `creatx/apps/desktop/renderer/src/timeline-channels.ts`
- `creatx/apps/desktop/renderer/tests/**`
- 对应 capability、baseline、discussion、`CONTEXT.md` 和 `BASELINE.md`

明确不做：

- 不修改 Cline Core 或固定上游源码。
- 不手工修改 Cline SQLite。
- 不建立第二套消息数据库、持久 Timeline 缓存或可独立执行的第二 Run 权威。
- 不用关键词猜测自然语言是否要启动 Growth。
- 不用 Prompt 要求模型“记住刚才完成了”代替持久会话事实。
- 不把 Worker Prompt、原始 Reasoning（推理）、工具日志或对象级正文回执灌入 Owner 对话。
- 不合并另一 worktree，不处理艺术库、点子库、工作台 V2 或无关视觉调整。
- 不在本批迁移 Electron Main Process（主进程）中的 Cline Runtime。

## 6. 架构硬门禁

生产实现前必须用固定 Cline SDK `0.0.65` 证明至少一种公开、持久、可重启的 Owner 结果回传路径：

1. 首选：Owner Run 中的正式 Tool Result（工具结果）承接 Growth 终态，并由同一 Turn 形成最终 Assistant 回复。
2. 次选：Cline 原生父子 Session/Agent 结果回传，使顶层 Growth 结果成为 Owner 历史的一部分。
3. 只有 Cline 公共合同明确支持时，才允许使用等价的持久 Context Source（上下文来源）；它必须与 UI 展示读取同一权威记录，且不能伪造消息或维护第二数据库。

以下情况立即停止并返回用户，不进入兼容补丁：

- 只能通过修改 Cline SQLite 或 Cline Core 写回 Owner 历史；
- 只能在每次普通发送时临时拼接隐藏摘要；
- 只能由 Renderer 保存或恢复最终汇报；
- 正式回传要求改变公开 Desktop IPC、现有项目数据格式或权限边界；
- 当前目标文件存在无法确认归属的并发修改；
- 核心 typecheck 或合同测试无法恢复绿色。

## 7. 实施任务

### Task 0：冻结并审计当前基线

- 输出：目标文件逐项 Diff（差异）归属、现有功能批次、当前测试状态和可回退语义检查点。
- 测试：从 `creatx` 目录运行 `bun run typecheck`、`bun run test:imports`、`bun run test`、`bun run build`、`bun run test:desktop`。
- 停止：目标文件有未知并发归属，或基线失败无法归因。

### Task 1：完成 Cline Owner 结果回传 Kernel Lab

- 输出：一个隔离实验，使用真实 Cline 持久 Session 证明“Owner 启动消息 -> Growth/Child 执行 -> Owner 正式最终回复 -> 重启 -> 普通追问读取最终回复”。
- 测试：成功、失败、取消、重启和下一轮追问；检查 Cline 历史中存在正式父结果，且没有第二消息存储。
- 停止：三种公开路径均无法满足第 6 节硬门禁。

### Task 2：把权威模型提升为 Capability Specification（能力规格）

- 输出：更新 `session`、`provider-harness`、`creative-skills`、`growth-runtime` 和 `workspace-ui` 的产品规格与验收矩阵；每条本批规则获得稳定 Capability ID 和 Acceptance ID。
- 测试：ID 唯一性、交叉引用和状态声明检查。

### Task 3：先建立失败回归测试

- 输出：覆盖启动消息持久化、普通会话内部能力不可见、Worker Profile 隔离、正式结果回传、终态折叠、重启恢复和完成后普通追问的失败测试。
- 测试：生产修改前必须因当前真实缺陷失败，不能只因 Fixture（测试夹具）不完整失败。

### Task 4：从注册层隔离命令、Skill 和工具

- 输出：命令目录、普通 Agent Skill、内部 Worker Skill 三套可见性；工具贡献增加单一 audience 权威；未声明或不匹配时失败关闭。
- 测试：普通 Owner 工具表没有 Growth 内部能力；各 Worker 只得到 Profile allowlist；可信 Goal/stage/attempt 门禁继续存在。

### Task 5：建立 Owner Conversation 与 Growth Run 的正式绑定

- 输出：显式 Growth 命令作为 Owner 正式消息持久化；Goal 绑定 Owner Session、启动消息和唯一运行身份；重复提交保持幂等。
- 测试：普通消息、首次启动、活动期 Steer、重复命令、已完成后新 Growth 和跨项目隔离。

### Task 6：重建 Child Worker 谱系与结果回传

- 输出：Worker 有正式 Owner/Goal/attempt/Profile 身份；对象结果回到 Growth Run；顶层终态通过 Task 1 已证明的 Cline 公共路径返回 Owner。
- 测试：子结果有界、无跨 Owner 污染、失败不伪造成功、取消不允许旧 Worker 回写新 Run。

### Task 7：让 UI 只投影权威事实

- 输出：普通消息、最终回复、运行活动、进度和工作台文件来自各自唯一权威；删除手工把无正式回传关系 Worker 最终文字伪装成 Owner 消息的规则。
- 测试：运行中展开、终态折叠、最终回复保持可见、工具与 Reasoning 默认折叠、文件实时刷新。

### Task 8：完成后普通聊天与恢复闭环

- 输出：Goal 终态后普通输入开启新的 Owner Turn，直接读取正式历史；重启后得到相同行为；等待问题仍走独立修复语义。
- 测试：“完成了？”不改变 Goal 版本、Scheduler 次数、蓝图哈希或项目文件哈希；summary 缺失、失败和历史损坏准确失败关闭。

### Task 9：真实 Electron 重放、性能与冻结

- 输出：隔离用户目录中的真实 Electron + 真实 Provider 证据、资源记录、无残留进程、更新后的 `CONTEXT.md` 和 `BASELINE.md`，以及独立绿色提交。
- 测试：全量 typecheck、imports、unit、build、desktop；真实 `/growth*` 完成、自动折叠、工作台生长、普通追问和重启重放。
- 停止：错误调用消失后仍稳定出现主进程卡死时，不顺手迁移进程；另立 Cline Runtime 进程隔离批次。

## 8. 回归矩阵

| 场景 | 必须证明 |
| --- | --- |
| 普通项目聊天 | Growth 内部 Skill 和工具不存在，用户工具按权限可用 |
| 显式 `/growth_world_pro` | 输入作为 Owner 消息存在，并创建唯一绑定 Goal |
| Goal active 时输入 | 按既有 Steer/Queue 产品规则处理，不创建冲突 Run |
| Worker 执行 | 有正式谱系、精确能力、结构化结果和可信副作用身份 |
| 文件生长 | 工作台从真实文件事件更新，不依赖聊天文本推测 |
| Goal completed | Owner 历史中存在正式最终 Assistant 回复，活动进入终态 |
| 完成后普通追问 | 读取最终回复，不启动 Growth，不产生项目副作用 |
| 重启后追问 | 与重启前使用同一 Cline 权威历史 |
| summary 失败 | 不伪造完成；Goal、对话和 UI 状态一致 |
| 多 Owner Session | Worker 活动、结果、Goal 和文件上下文不跨会话污染 |
| 取消和旧 Worker | 旧执行不能在新 Goal 或新 attempt 中继续回写 |
| 进程退出 | 无测试 Electron、Provider helper、Shell 或端口残留 |

## 9. 合并边界

本修复形成独立绿色提交后，才允许准备另一 worktree 的前端合并。合并必须基于有来源的 Git 提交；优先合并纯 Renderer 文件，`main.ts`、Contracts、Session、Growth 和 capability 文档按语义复核。合并后重新执行 Task 9 全部验收，防止旧分支恢复“普通会话全工具”或 UI 私有会话事实。

## 10. 实现结果

- 显式 `/growth*` 先进入同一 Owner Cline Session，再由临时 `run_growth` 控制器等待 Growth Runtime。
- 普通、Owner Growth、Owner Issue 与五类 Worker 使用失败关闭的 audience/Profile 隔离；已删除 `world-summary` Worker。
- Worker 最终文本始终属于内部活动；物化收尾只返回可信证据，由 Owner 生成正式回复。
- Worker 请求完成后 Goal 保持 `active + owner-ready`；必需图片先校验；Owner 回复持久化后才提交 `completed`。
- 回复已持久化但终态回调崩溃时，重启只认“最后显式 Growth 用户消息 -> 成功 `run_growth` Tool Result -> 后续 Assistant 回复”，不重新调用 Provider。
- 等待问题回合只临时开放 `resolve_growth_issue`；普通回合不可见。
- 取消和退出同时中止 Owner 与全部 Child Worker；活动 Goal 退出时持久化为 `paused`。
- 受控 Provider Desktop 已通过。外部 Provider 长跑仍是 Task 9 未完成项。
