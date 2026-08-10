# Owner Growth Relay Architecture Repair Plan

日期：2026-08-05。

状态：第二十轮独立主链审查为 `Critical 0 / High 0 / Medium 2 / Low 1`，架构门禁通过。受控验收通过；下一步不再继续 Activation 加固，而是执行外部 Provider 四阶段长跑与文本质量验收。

主能力线：`growth-runtime`。

相邻合同：`growth-runtime`、`provider-harness`、`creative-skills`、`workspace-ui`、`project-files`。

## 1. 目标

首要目标不是让 Activation 规格无限严密，而是让一句显式需求由一个 Owner 稳定跑完四阶段，驱动 Worker 写出质量合格的真实内容，并在原对话形成正式总结。下列 Relay 结构只为这条主链和六条产品底线服务；不保护底线、却扩大常见路径失败面的极端恢复要求不得继续阻塞主链。

把首次 `/growth*`、按钮恢复和 Issue 恢复统一为同一个持久 Owner Completion Relay（所有者完成回传）：

```text
Owner control action
-> durable Growth Activation
-> same live Cline Owner Session
-> exactly-once controller execution
-> Scheduler and bounded Child Workers
-> trusted Tool Result bound to Activation and Goal
-> Owner Assistant reply in the same control Turn
-> atomic Activation + Goal completion
-> ordinary follow-up in the same Cline history
```

## 2. 范围

允许修改：

- Growth Runtime Schema、Store、Lifecycle、Issue Resolution 与测试；
- Cline Adapter 的 Tool Policy、Owner 控制回合、精确历史证据与测试；
- Desktop Main 的首次启动、恢复、Issue 与启动恢复；
- Renderer 的 Goal 投影、终态折叠和 Timeline 归属；
- 对应 Contracts、Capability、Baseline、`CONTEXT.md` 和 `BASELINE.md`。

明确不做：

- 不修改 Cline Core 或其 SQLite；
- 不增加第二消息库；
- 不恢复活动 Provider Run 或重放未知副作用；
- 不改创作文类、作品内容、工作台视觉或外部 Provider 配置；
- 不把受控 Provider 证据标为外部 Live。

## 3. 权威数据模型

新增 Growth Activation 私有持久记录：

- `activationId`：一次 Owner 控制回合的稳定身份；
- `kind`：`start`、`resume` 或 `issue`；
- `sessionId`、`projectId`、可选 `goalId`；
- `promptHash` 与嵌入 Cline 用户消息的隐藏 marker；
- `controllerToolName` 与唯一 `toolCallId`；
- `status`：`pending`、`running`、`result_ready`、`completed`、`failed`、`cancelled`；
- 可信控制器结果、Owner 回复哈希和版本。

Activation 属于 Growth Store，只保存控制关联和结果摘要，不复制 Cline Transcript（会话全文）。Cline 继续唯一拥有用户消息、Tool Result 和 Assistant 回复。

Goal 不增加公开 `finalizing` 状态。Scheduler 形成最终完成证据后，Goal 保持 `active` 并设置私有 `owner_reply_pending`；Activation 进入 `result_ready`。此窗口不允许暂停、转向或重复调度，但用户可以选择继续交付或原子取消 Goal 与 Activation。若回复已经持久化，Activation 与 Goal 原子完成；若只有可信 Tool Result，用户继续时只恢复 Owner 结果交付，不重跑 Scheduler。`waiting` 等非完成结果仍由 Owner 正式回复说明，但不会被错误改成 `completed`。

最终进度回执与 `owner_reply_pending` 必须同事务提交；`failed` 等终态若仍有开放 `result_ready` Activation，也必须保留继续交付和原子结束出口。Owner 用户提交通过 Renderer 生成并跨 IPC 携带的稳定请求身份创建 Activation；精确重试复用原记录，身份冲突失败关闭。

结果交付恢复必须复用已经持久化的 Owner Assistant 回复。若回复已经写入 Cline 历史、但完成回调在更新 Activation 前崩溃，来源 Activation 和交付 Activation 的同进程精确重试与重启恢复都必须直接完成，不再次调用 Provider。Issue 精确重试必须先按稳定请求身份查找既有 Activation，再根据当前 Issue 动态路由，避免已经解决的 Issue 把同一请求误降级为普通聊天。按钮 Resume 同样携带稳定请求身份；`result_ready` 的 Resume 必须先持久创建引用原结果 Activation 的交付 Activation，再产生 Owner 回合，最终与来源和 Goal 同事务完成。失败或取消的交付 Activation 保留历史但释放新的交付请求；开放或已完成交付保持来源唯一。Owner 结果交付或原子结束前，普通新消息不得越过最终回复顺序。Goal 只保存运行原因，不复制正式 Assistant 回复；Renderer 根据实际 Goal 状态描述交付，不把失败说明写成作品完成。

第七轮审查补充四个底层不变量：Owner 交付前必须从 Cline 历史验证与来源 Activation 精确绑定的唯一成功 Tool Result，后续零工具回合不能遮蔽它；同一 Activation 的并发精确重试加入一个进程内执行，不得互相判失败；V10/V11 DDL 与版本推进必须支持中断后的结构探测恢复；正式 Owner 回复一旦持久化，完成提交优先于稍后的取消。

第八轮审查补充四个跨边界不变量：取消必须优先核对交付子 Activation 的持久回复，并允许原完成回调幂等重入；任何未收束 Growth 都保护唯一 Cline 历史不被删除；Scheduler 的阶段策略和前后项目证据失败必须形成准确 `waiting`；Renderer 在 IPC 结果未知和重载后必须保留并复用同一 Growth requestId。Activation marker 同时改为完整行精确匹配，失败关闭的乐观消息从正式会话投影移除。

第九轮审查补充四个恢复与并发不变量：Owner Activation 接纳与单会话/项目会话删除在短时进程内串行区完成最终门禁；Renderer 未决 Owner 命令采用单槽 Compare-and-Set（比较并设置），不同请求不能覆盖；V9 与 V10/V11 一样支持事务迁移和部分 DDL 恢复；可信 Tool Result 必须在全部同 marker 历史中全局唯一。取消额外覆盖开放 Owner 执行从运行到回复持久化的过渡窗口。

第十轮审查补充四个身份与证据不变量：Resume/Issue Activation 必须在修改 Goal 或 Issue 前预绑定目标 Goal，终态 Goal 拒绝新绑定和迟到结果；正常即时完成、结果交付与恢复必须共用同一个全历史唯一控制证据解析器；Activation 接纳在删除串行区内重读真实 Cline Session，删除先完成时不能留下失去唯一历史的失败 Activation；Start Activation 可以从未绑定 Goal 合法演化为已绑定 Goal，原始无 Goal 命令的精确重试必须接受该派生状态，而 Resume/Issue 仍严格匹配预绑定 Goal。

第十一轮审查将上述规则收紧为三个权威边界：Start Goal 插入和已 claim Activation 绑定必须是同一 Store 事务，任何世界接管或项目副作用只能在关联形成后开始；全历史解析器是正常完成、恢复、重试、取消和 Issue 澄清的唯一证据权威，Tool Call、Tool Result 与正式回复必须来自同一 Turn 且顺序正确；Worker 历史按 Activation Turn 边界合并，来源回合没有最终回复时仍应在下一 Owner 用户 Turn 前展示。

第十二轮审查补充三个恢复与取消边界：旧版 World Pro Continue 不得在 Resume 内偷偷替换 Goal，而应建立显式 Start Activation，并从接纳时绑定待替换 Goal，在一个 Store 事务中取消旧 Goal、创建继任 Goal和迁移 Activation 绑定；Owner 执行注册时建立进程内取消令牌，所有 Owner `core.send` 路径在发送前检查；Pause 在持久事务中同时取消 Goal 上尚未结束的 Owner Activation，调用 Cline abort 后等待旧 Owner Promise 退出，才允许 Resume 开始新回合。

第十三轮审查确认 Critical/High 已清零，并发现一个 Medium 发送前窗口：有既存未终止 Goal 的普通 Start 在接纳到控制器绑定之间仍可能被 Pause 漏过。修复后此类 Start 在接纳事务中立即预绑定既存 Goal；Steer 保持该绑定，Legacy 替换在原子事务迁移到 successor。应用退出采用不同于用户 Pause 的进程所有权：先登记全部开放 Owner 取消令牌并 abort 对应 Session，再由 Adapter dispose 统一关闭 Cline Runtime；不能无界等待可能仍卡在 Cline 内的 Owner 业务 Promise。

第十四轮审查指出 Adapter、图片队列或文件投影清理本身也可能永不返回，因此完整 Desktop shutdown 增加 8 秒 deadline；持久暂停和取消请求先行，deadline 后直接 `app.exit(0)`，不先关闭 Store 后等待迟到回调。取消等待 Owner 执行期间若正式回复完成，settlement 会重新读取无 pending reply 的 completed/cancelled/failed Goal并直接返回，不再对 completed Goal发起第二次取消。

第十五轮审查发现 active Goal 上的新 Start 会把 Steer 结果错误套入最终回复合同，并且正常退出可能在 Store 关闭后接到迟到 Owner 回调；同时指出普通消息接纳窗口和 Growth 投影单次快照竞态。返修后，一个活动 Run 只保留原顶层 Activation，运行中追加统一走正式 Cline Steer；只有持久 Goal active 但 Run 已空闲时，新 Start Activation 才预绑定并接管 Scheduler。普通消息门禁与 Cline `onAdmitted` 共享短事务，并以 Session 活动门禁覆盖到回合结束；退出先停止新接纳，在全局 deadline 内等待所有已登记 Owner 执行和既有投影队列，正常静默后才关闭 Store，超时仍直接强退。

第十六轮审查发现全历史证据解析器未拒绝同 Turn 的额外同名 Tool Result，并指出 Adapter dispose 未显式等待普通 Owner Run。解析器现要求唯一控制器 Call 与唯一同名 Result精确一一对应；Adapter 为每个 `runTurn` 登记 settlement，dispose 先 abort 全部活动 Run并等待其收束，再释放 Core 和 Store。审查同时把“运行中 `/growth*` 是否新建 Activation”的规格矛盾暴露出来；权威语义已收敛为一个活动 Run 一个顶层 Activation，运行中追加只走 Steer。

第十六轮后的真实退出诊断进一步发现，Cline `0.0.65` 对 AI SDK `6.0.235` stream 原型 Promise getter 的保护不完整，且 `usage` 被读取两次，取消时会留下未观察 Promise。`postinstall` 现在执行版本锁定、形态锁定且幂等的补丁；不匹配即失败关闭，决策记录见 ADR-0010。Owner Tool 的 `AbortSignal` 同时贯穿 Scheduler、阶段 Runner 与 Worker，Worker 注册后立即观察取消，消除了暂停或退出与 Worker 注册交叉时的逃逸窗口。

第十七轮按主链优先重新审查，发现运行中 Steer 被错误广播到 Worker、第三阶段强制等待额外 Continue，以及 Main 过度依赖 Renderer `runState`。返修后，Steer 只进入 Owner Session；第三阶段 `prepare_review` 回执后由 Scheduler 自动运行确认 Worker并 freeze，再进入第四阶段；Main 在创建 Activation 前读取真实活动 Goal并把状态滞后的显式命令路由为当前 Owner Steer。V9-V11 极端 DDL 中断、删除与接纳毫秒级并发等不保护当前六条底线的加固不再阻塞主链。

第十八轮发现 active Goal 但 Cline Run 已 idle 时，Main 会忽略 `deliveredToActiveRun=false` 并返回假成功。返修后，两个显式输入入口都先尝试 Owner Steer；未投递时进入预绑定 Start Activation。恢复控制器直接记录最新方向并运行 Scheduler，不再向自己的控制回合二次 Steer。不同项目的 Owner 接纳全局串行属于后续性能简化，不阻塞当前单项目主链。

第十九轮指出通用可写 Worker 写文件后漏回执时直接重试可能覆盖内容。Scheduler 现在把缺失 attempt 的阶段后指纹持久化：指纹不变才允许正常重试；指纹已变化时使用 `growth-recovery` 只读 Profile，只能读取、检索和提交进度回执，直接文件编辑与图片提交均禁用。审查同时把 waiting Issue 的自然语言回答误判为普通聊天触发；权威语义已明确为既有 Run 的授权恢复输入，只有足够信息和受信任工具调用才继续，无关或不足内容保持零工具回合。

第二十轮未发现阻塞性 Critical/High。保留两个 Medium：Cline 安装补丁对“已补丁与未补丁片段混合”状态的失败关闭检查不完整；外部 Provider 四阶段 Live 尚无本轮证据。跨会话共享接纳队列为 Low 性能项。阶段三每层数量与 24 条因果当前仍是硬门槛；是否降为质量建议必须由真实长跑的失败位置决定，不能再用静态审查替代运行证据。

## 4. 实施步骤

### Step 1：失败规格

- 输出：零 Tool Call、重复 Tool Call、resume 完成、Issue 完成、精确崩溃恢复、`owner_reply_pending` 竞态、同 Session audience 切换、Timeline 归属与 failed 折叠测试。
- 验收：生产修改前因真实缺陷失败。

### Step 2：Activation Store 与迁移

- 输出：Growth Schema V10、Activation 原子 claim/result/complete/fail/recovery API、Goal 私有 `owner_reply_pending` 门禁。
- 验收：迁移、幂等、重复 Tool Call、错误 Goal/Session、崩溃窗口和并发写测试。

### Step 3：同 Session Owner Relay

- 输出：Owner Session ID、持久历史和 Turn 权威不变。Cline SDK `0.0.65` 会在 Runtime 创建时裁剪模型可见工具，因此 Adapter 只在 Session 空闲边界停止并以同一 Session ID、同一持久消息重建对应 audience 的 Runtime；执行层继续校验可信 Activation。
- 验收：不创建第二 Session 或第二 Transcript；Owner 交付回合向模型暴露零工具；下一普通回合恢复普通工具；运行中的 Session 禁止切换 audience。

### Step 4：统一三个入口

- 输出：首次命令、按钮恢复与 Issue 工具都创建 Activation，并等待 Scheduler/缓存结果；Tool Result 精确关联；Owner 回复后原子完成。
- 验收：三个入口分别成功、等待、失败、取消；零调用失败关闭；重复调用无重复副作用。

### Step 5：恢复和 UI 投影

- 输出：启动只按 Activation marker、Tool Call、Goal ID 和当前 Turn 边界恢复；`owner_reply_pending` 不暴露内部文本；failed 正确折叠；Worker 活动绑定 Activation/Turn。
- 验收：回复落库后回调崩溃、普通追问后再重启、多 Owner Session、退出并发和 Timeline 重放。

### Step 6：冻结与重复独立审查

- 输出：先取得显式启动、单 Owner 四阶段、有界 Worker、真实文件、常见错误恢复、原对话正式回复、暂停/继续/退出和无残留进程证据，再补 Typecheck、Import Boundary、全量测试与 Build。
- 审查：每一轮使用新的无上下文只读 Agent；先判断约束是否帮助真实需求跑完，或是否正在增加运行阻力。只有触犯六条底线、破坏常见运行或已有真实复现的 Critical/High 才阻塞主链；其余极端窗口记录为后续加固，不以审查清零代替真实长跑和文本验收。

## 5. 停止条件

立即停止并报告用户：

- 固定 Cline SDK 公共接口不能用同一 Session ID 和同一持久历史安全重建受控 audience；
- 必须修改 Cline Core、私有数据库或建立第二消息库；
- 需要自动重放未知 Provider/Tool 副作用；
- Schema 迁移不能无损打开 V9 数据；
- 核心 Typecheck 或状态机测试无法恢复绿色。
