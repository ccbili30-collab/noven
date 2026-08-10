---
title: Growth Runtime 产品规格
doc_type: capability-product-spec
owner: growth-runtime
status: authoritative-terminal-evidence-verified
last_verified: 2026-08-08
source_of_truth: docs/capabilities/growth-runtime/product-spec.md
---

# Growth Runtime 产品规格

## GRT-000 主链优先

Growth 的首要合同是：用户以一句显式命令启动后，一个 Owner 持续带领有界 Worker 跑完四个产品阶段，写出真实文件，并在原 Cline 对话留下用户可理解的正式 Assistant 回复。常见 Provider、Worker、图片或资料问题应优先有界重试、降级或绕过；不能因非底线的事实完整性、关系精度、毫秒级竞态或崩溃精确恢复而轻易停止整条主链。

任何新增或保留的门禁必须直接保护至少一项底线：普通聊天不误触发、同一项目不出现互相冲撞的双主任务、不明显重复写入或覆盖正文、不把失败伪装成功、错误不拖死软件、最终存在真实文件与正式回复。没有保护这些底线且扩大普通路径失败面的精确性规则，必须简化、延后或降为非阻塞诊断。

## GRT-001 唯一运行权威

Growth Runtime 唯一拥有 Goal、Growth Run、领域阶段、进度、attempt、恢复和终态。它不保存第二份 Cline Transcript（会话全文），也不创建可冒充 Assistant 回复的消息。

## GRT-002 显式启动与唯一绑定

只有命令目录识别出的显式 `/growth*` Owner 用户消息可以创建 Growth Run。每个 Run 必须持久绑定唯一 Owner Session、启动消息、项目和 Goal；重复提交按稳定身份幂等，不能根据自然语言、目录名或当前文件猜测启动。

项目已经向用户明确展示一个 waiting Issue 时，用户在同一 Owner 对话中针对该问题给出的自然语言补充属于既有 Run 的授权恢复输入，不是新 Growth 启动。Owner AI 只有在该输入提供足够具体、安全的修正时才能调用 `resolve_growth_issue` 并自动继续；无关内容或信息不足必须保持零工具澄清回合，不得唤醒 Scheduler或修改项目文件。

Renderer 为每次用户提交生成稳定请求身份并随 IPC 命令传递。相同身份和相同内容的精确重试只能复用原 Activation 与 Goal；相同身份承载不同内容必须失败关闭，不能重复 Provider 或文件副作用。

## GRT-003 有界 Child Worker

每个 Child Worker 必须绑定 Owner、Goal、Run、阶段、attempt 和受信任 Profile。Worker 只能提交结构化、有界结果；旧 attempt、跨 Owner 或越权副作用失败关闭。

## GRT-004 Owner 终态提交门禁

Growth 控制器把可信终态证据作为同一 Owner Turn 的正式 Tool Result 返回。只有 Cline 已持久化 Owner Assistant 最终回复后，Goal 才能提交 `completed`；最终回复失败或结果未知时不得伪装完成。

最终进度回执与私有 `owner_reply_pending` 门禁必须在同一个 Growth Store 事务中提交。任意 `result_ready` Activation 都必须在重启后提供结果交付或原子结束出口，即使其 Goal 已进入 `failed`。

## GRT-005 生命周期与问题语义

`active`、`waiting`、`paused`、`cancelled`、`failed` 和 `completed` 保持不同语义。可自动修复、可绕过、需人工返工和阻塞链路的问题必须保留既有分类，不能统一包装成红错，也不能用自动继续掩盖取消。

## GRT-006 重启和完成后隔离

重启后 Goal 从 Growth Store 恢复，但退出或崩溃时的活动 Provider 工作不自动重放。完成后的普通 Owner 输入不唤醒 Scheduler、不改变 Goal 版本、不调用 Growth Skill，也不修改项目文件。

## GRT-007 文件不是运行状态

作品正文、图片、索引和工作台元数据由 Project Files（项目文件）拥有。Growth 只能通过正式文件工具产生副作用并保存引用；运行记录和 Renderer 缓存不能替代作品文件。

## GRT-008 Owner 控制回合身份

首次启动、按钮继续和 Issue 回复各自创建唯一 Growth Activation（生长激活记录）。Activation 必须绑定 Owner Session、项目、唯一控制器 Tool Call、可选 Goal 和正式回复哈希；相同 Tool Call 只能精确重放，不同 Activation 不得共享正在运行的 Goal drain。Worker 活动携带 Activation 身份并在重启投影时回到准确的 Owner Turn。

## GRT-009 失败与取消收束

控制器错误可以由同一 Owner Turn 形成正式 Assistant 解释，但不能形成可信成功结果或完成 Goal。用户取消 Goal 时，绑定该 Goal 的开放 Activation 必须在同一个持久事务中取消；之后的新显式命令不受旧控制回合阻塞。

## GRT-010 已持久回复的崩溃恢复

若 Cline 已持久化 Owner Assistant 回复、但完成回调在提交 Activation 前崩溃，来源 Activation 和交付 Activation 的同进程精确重试与重启恢复都必须从同一 Owner Turn 的持久历史完成，不得再次调用 Provider、控制器或 Scheduler。零控制器调用只允许用于明确标记的结果交付回合或 Issue 澄清回合，普通 Owner 回合不能据此完成 Growth。

## GRT-011 Issue 精确重试优先级

Owner 输入进入动态 Issue 路由前，必须先按稳定请求身份查找既有 Activation。相同请求的精确重试复用原 Issue Activation 与结果；不能因为 Issue 已在首次执行中解决，就把重试后的同一输入作为普通聊天再次提交。

## GRT-012 Resume 稳定身份

按钮 Resume 必须携带 Renderer 生成并跨 IPC 传递的稳定请求身份。相同请求的精确重试只能复用同一 Resume Activation；身份冲突失败关闭，不得创建第二次 drain。若 Resume 只负责交付已有 `result_ready` 结果，必须在产生 Owner 回合前持久创建引用来源 Activation 的交付 Activation；正式回复后，Goal、来源 Activation 与交付 Activation 同事务收束。交付失败或取消后可由新请求建立新的交付 Activation，旧失败历史不得永久占用来源；开放或已完成交付仍保持来源唯一。

## GRT-013 正式回复单一权威

正式 Assistant 最终回复只属于 Cline 历史。Growth Goal 的 `status_reason` 只保存运行状态原因，不得复制最终回复正文；Activation 只保存完成校验所需的回复哈希。

## GRT-014 状态特定的交付投影

Renderer 必须根据真实 Goal 状态描述 Owner 结果交付。`failed` 显示失败说明正在返回，`waiting` 显示等待原因正在返回，只有成功完成路径可以显示作品完成；UI 文案不得覆盖或改写底层状态。

## GRT-015 Owner 回复顺序

同一 Session 存在 `owner_reply_pending` 或开放 `result_ready` 时，普通 Owner 新消息必须失败关闭。用户先完成结果交付或原子结束 Growth，正式最终回复形成后才能继续普通追问；普通聊天不得越过待交付终态。

## GRT-016 Owner 工具 audience 隔离

Owner Session ID、Cline Transcript 和 Turn 归属必须保持唯一。由于 Cline SDK `0.0.65` 在 Runtime 创建时裁剪模型可见工具，Adapter 只能在 Session 空闲边界用同一 Session ID 和同一持久消息重建对应 audience 的 Runtime；运行中不得切换。结果交付回合向模型暴露零工具，下一普通回合恢复普通工具。该过程不得创建第二 Session、复制 Transcript 或修改 Cline Core。

## GRT-017 可信控制结果证据

任何来源 Activation 进入 Owner 结果交付前，Cline 全部历史必须存在且仅存在一个与该 Activation 绑定的控制器 Tool Call，以及唯一一个成功 Tool Result。第二个控制器调用、重复 Tool Result、成功与错误结果混合均视为证据损坏并失败关闭。后续使用相同 Activation marker 的零工具交付回合不能遮蔽更早的可信结果。证据缺失或不唯一时，来源与开放交付 Activation 必须原子失败、清除 `owner_reply_pending` 并释放普通会话，不能生成正式完成回复。

## GRT-018 并发精确重试合流

同一进程内、同一 Activation 的并发精确重试必须加入唯一执行 Promise。只有该执行所有者可以把开放 Activation 标记失败；加入者不得重复运行控制器、Scheduler、Provider 或文件副作用，也不得因观察到 `running` 而反向破坏首个请求。

## GRT-019 迁移中断恢复

Growth Schema 迁移必须在事务中提交。V9、V10 或 V11 若在 DDL 已生效但 `user_version` 尚未推进的窗口中断，重启必须根据实际列结构进入幂等恢复迁移，保留既有 Goal、Issue、Activation 和索引语义；不得因重复 `ALTER TABLE` 使 Store 永久无法打开。

## GRT-020 正式回复与取消顺序

取消请求执行前必须检查 `result_ready` Activation 对应的 Cline Turn。若正式 Owner Assistant 回复已经持久化，完成提交优先，取消不得把已对用户宣告完成的结果改写为 `cancelled`；若回复尚未持久化，取消仍可原子收束 Goal 与开放 Activation。

来源 Activation 存在开放交付 Activation 时，必须先检查交付 Turn；交付回复完成来源、交付与 Goal 后，原始完成回调以相同回复重入必须幂等成功。

取消与开放 Owner 执行并发时，先中止对应 Cline Turn 并等待同进程执行收束，再重新读取持久历史。不能在 `running -> result_ready -> reply persisted` 的过渡窗口依据旧快照提交取消。

Owner 执行注册时必须同时建立进程内取消令牌，所有 Owner Provider 发送路径在 `core.send` 前检查。Pause 必须在持久事务中同时暂停 Goal 并取消其 `pending/running` Activation，再中止 Cline 并等待旧 Owner 执行退出；Pause 返回后不得启动迟到 Provider Turn，紧随其后的 Resume 必须是新的 Activation。

## GRT-021 唯一会话删除门禁

只要 Owner Session 或项目仍绑定 `active`、`paused`、`waiting`、`owner_reply_pending` Goal，或任何开放 Activation，就不得删除对应的唯一 Cline 历史。只有 Growth 已完成、失败且结果已交付、或显式取消收束后，才能删除会话。

## GRT-022 Scheduler 证据失败收束

阶段策略、阶段前项目指纹、阶段后项目指纹或已提交回执的问题对账失败时，Scheduler 必须把仍为 `active` 的 Goal 收束为准确 `waiting`。阶段前失败不得启动 Worker；阶段后失败必须保留已提交回执并停止，避免重复副作用。不得只让 Owner Activation 失败而留下无人执行的 `active` Goal。

## GRT-023 Renderer 未决命令身份

Renderer 必须在 IPC 副作用前保存显式 Growth 启动与 Resume 的稳定 requestId。收到明确成功或失败后清除；IPC 结果未知或 Renderer 重载时保留，并仅以原 requestId 恢复。普通聊天不自动重发。失败关闭的乐观用户消息不得继续冒充已进入 Cline 历史的正式 Turn。

Renderer 按 Owner Session 隔离待恢复命令。相同 Session 的相同命令可幂等保存；相同 Session 的不同 requestId 或不同内容不得覆盖原记录。不同项目的 Owner Session 可以各自保存和恢复，任一请求的清理或恢复失败不得删除、阻塞或向当前无关会话投影另一请求。项目内部是否允许新主任务仍由 Growth Runtime 的 Goal 与写入门禁权威判断，Renderer 不建立跨项目全局互斥。

## GRT-024 Activation marker 精确匹配

Cline 历史中的 Activation marker 必须按完整结构行与完整 ID 相等匹配，禁止使用子串或前缀匹配。`activation-a` 不得命中 `activation-a-suffix` 的 Turn。

## GRT-025 Owner 接纳与会话删除串行化

Owner Activation 的持久接纳，必须与单会话和项目批量删除的最终门禁检查及实际 Cline 删除进入同一个短时进程内串行区。串行区不得覆盖完整 Growth 执行；删除在区内最终核对未收束 Growth，Activation 一旦建立，随后删除必须失败关闭。接纳方必须在区内重读真实 Cline Session；若删除先完成，不得持久化指向已删除历史的 Activation。

## GRT-026 Activation Goal 先绑定

Resume 与 Issue Activation 必须在修改 Goal、准备恢复或解决 Issue 之前持久绑定目标 Goal。绑定目标必须存在且未进入 `completed` 或 `cancelled`；目标终态后不得记录或重放迟到控制结果。Start Activation 可以在创建 Goal 后从未绑定合法演化为已绑定 Goal；以原始无 Goal 命令精确重试必须接受该派生状态，Resume 与 Issue 则继续严格匹配预绑定 Goal。

## GRT-027 控制证据单一权威

正常即时完成、持久 Owner 回复查找、结果交付、重启恢复、取消前完成和 Issue 零工具澄清必须共用同一个全历史唯一控制证据解析规则。唯一 Tool Call、匹配 Tool Result 和正式 Assistant 回复必须位于同一 Owner Turn；Result 必须晚于 Call，回复必须晚于 Result。任何路径不得只读取最后一个 marker Turn、跨 Turn 拼接证据或使用宽松局部判断绕过 GRT-017。

## GRT-028 Start Goal 原子关联

Start 控制器创建新 Goal 时，Goal 插入和已 claim Start Activation 的 Goal 绑定必须在同一个 Growth Store 事务提交。世界接管、内部状态复制、项目文件写入和 Scheduler 启动只能在该事务成功后开始。取消必须能从 Goal 找到开放 Start Activation，中止并等待其进程内执行后再提交终态。

兼容旧版 World Pro 等待 Goal 时，Continue 必须路由为显式替换 Start，而不是在 Resume 处理器内隐式创建继任 Goal。替换 Start 接纳时绑定旧 Goal；同一 Store 事务取消旧 Goal、创建继任 Goal并迁移 Activation 绑定，事务后才允许世界接管。

任何显式 Start 接纳时若项目已有未终止 Goal，Activation 必须立即预绑定该 Goal；合法替换只能在原子 Store 事务中迁移绑定。一个活动 Growth Run 只拥有一个顶层 Owner Activation。该 Run 运行期间的追加输入，包括再次输入 `/growth*`，必须作为正式 Cline Steer 用户输入进入同一 Session 和同一 Activation，不创建并发顶层 Activation，也不要求即时 Assistant 回复；最终回复由原 Activation统一收束。只有持久 Goal 显示 active、但 Cline Run 实际已空闲时，新的显式 Growth 才创建预绑定 Start Activation并接管 Scheduler，不能留下无人执行的 active Goal。

应用退出先关闭新的 IPC、Owner 执行和 Growth 投影接纳，再为全部开放 Owner 执行登记取消令牌并中止对应 Cline Session。已登记 Owner 回调与既有投影队列必须在同一个全局 deadline 内静默收束，正常收束后才能 dispose Adapter 和关闭 Store；deadline 到达时直接强制退出，不能先关闭 Store 再等待迟到回调。

Desktop 完整退出清理必须有明确 deadline；在持久暂停与取消请求完成后，外部 Provider、图片、投影或 Cline dispose 超时不得永久阻止进程退出。取消等待开放 Owner 执行后必须重读最新 Goal；正式回复已完成时直接返回已交付终态，不得再次调用取消并向用户报告冲突。

## GRT-029 Worker 恢复归属

持久 Worker 活动必须按 Owner Activation 的 Turn 边界恢复。来源 Turn 尚无正式 Assistant 回复时，Worker 活动仍应插入来源 Turn 尾部、下一 Owner 用户 Turn 之前；不得追加到后续结果交付回复之后。

## GRT-030 Owner 对话接纳边界

普通 Owner 消息的 Growth 门禁检查与 Cline 用户消息接纳必须进入同一个短时串行区，并只持有到 `onAdmitted` 或发送失败。该 Session 还必须保留活动 Turn 门禁直到本轮结束：Growth Activation 一旦先建立，普通消息失败关闭；普通消息先被接纳后，新的顶层 Growth、Resume、结果交付或会话删除不得建立半截状态。运行中追加只能走 Cline Steer，并归属于当前顶层 Turn/Activation；短串行区不得覆盖完整 Provider Turn。

## GRT-031 Growth 投影背压

Growth Store 的高频进度变化不得为同一 Goal 无界排队完整工作台投影。同一 Goal 同时最多有一次正在执行的投影；执行期间到达的更新只保留最新快照，并在当前投影结束后投影该最新状态。不同 Goal 相互独立，单次投影失败不能吞掉随后更新。正常退出必须等待已接纳投影排空，但仍受 Desktop 全局退出 deadline 约束。

投影是 Renderer 可见性的派生过程，不得反向阻塞或改写 Goal、正文、回执和 Cline 历史。测试观察器读取单个 Goal 状态时必须使用轻量查询，不得周期性执行完整 Desktop bootstrap。

## GRT-032 Owner 最终汇报事实

控制器结果必须区分回复落库前的持久 `goalStatus` 与回复成功交付后用户应看到的 `deliveryGoalStatus`。前者继续用于 Store 当前状态校验，后者用于 Owner 正式回复；不得为了显示完成而提前篡改当前持久状态。

当 Growth World Pro 已形成可信物化汇总时，控制器结果必须携带 `ownerSummary`，准确列出正文完成数、未完成正文和图片成功、失败、排队、生成中或未知状态。Owner 只能基于该可信汇总形成用户回复，不能把图片失败或未完成项省略，也不能把回复提交前的内部 `active` 当作最终状态。旧记录缺少新增兼容字段时仍可读取，但不得伪造不存在的汇总。

## GRT-033 Worker 故障即时留痕

可信 Growth 阶段 Worker 的工具或 Runtime 故障一经 Adapter 分类，就必须在 Worker 返回前通过当前 stage attempt 的故障观察端口交给 Growth Runtime，并由 Growth Store 唯一持久化 Issue。该路径按 attempt、tool call 或稳定错误指纹幂等；Worker 终态回执可以再次携带同一故障用于完整对账，但不得产生第二个 Issue。

即时留痕不授权崩溃后自动重放 Provider 或未知在途工具。观察端口或持久化失败不得破坏 Cline 原始错误历史；Worker 正常返回时仍使用既有终态故障对账作为兜底。

## GRT-034 内容错误恢复自由度

内容物化错误必须按影响选择最小破坏的恢复动作：`retry` 按原阶段重试，`repair` 允许 Writer 修改触发错误的当前对象，`accept` 接受已经存在且通过当前校验的正文并重建缺失回执，`bypass` 如实保留缺失范围并继续其余对象。Owner 授权 `retry`、`repair` 或 `accept` 后，Issue 只进入 `repairing`；只有后续形成正式物化回执等可信持久证据，协调器才能提交 `resolved`。`bypass` 只有在绕过状态持久化成功后才能提交 `bypassed`。

对象已有正文不得把仍带恢复 block 的 `blocked`、`retryable` 或兼容旧数据 `unknown` 状态变成不可操作的只读死路。Writer 明确失败后，若修复动作需要改正文，必须重新获得对象范围内的 Writer 权限和精确错误原因；不得扩大为通用项目写权限。尚无正式正文回执的半成品事实抽取不得阻止后续可信抽取覆盖。

自动修复耗尽的局部内容对象可以安全绕过；若其未完成下游依赖该对象，则依赖子树一并绕过并进入最终缺失汇报。项目身份错误、持久状态损坏、并发主任务冲突、覆盖正式完成回执和未知副作用重放风险仍失败关闭，不能用内容自由度绕过。

## GRT-035 文本 Provider 额度冷却

Growth Worker 返回 `provider_quota` 后，Cline Adapter 必须按实际文本连接身份建立 30 秒进程内冷却；优先使用 Profile ID，没有 Profile 时使用 Provider 与 Model。冷却期间不得继续为同连接创建必败 Worker，其他连接和项目继续独立运行。成功 Worker 可以清除该连接冷却。

冷却等待不持久化，不改变 Goal、Stage、Issue 或 Worker 结果语义，也不得把额度失败标记为成功。Pause、Cancel 和应用退出必须立即中断等待；重启后冷却清空可以接受。Cline Core 内部对单 Worker 的有限请求重试不属于该规则，第一版不得为消除它而修改上游 Core。

## GRT-036 物化终态唯一证据

Growth World Pro 的物化终态只能由 World Materialization（世界物化）能力形成一次结构化证据，进度、层报告、控制器结果和 Owner 最终汇报都必须消费该证据。调用方不得根据文件存在、Issue 子集或自行传入的延期对象重新计算完成状态。

对象必须且只能进入一种终态分类：可信正文、recovery 接受的既有正文、存在文件但缺少可信回执、已绕过且缺失、需要人工处理。只有前两类计入可信完成；单纯存在文件不能升级为完成。

## GRT-037 部分完成不得伪装全部完成

调度终结可以形成 `completed` Goal，但不代表全部对象可信完成。只要存在未可信完成对象，结构化结果和正式 Owner 回复都必须标为部分完成，逐项列出标题、项目相对路径和原因；数量、清单和图片状态不能由自然语言摘要改写或省略。

## GRT-038 取消与回复缺失分离

用户取消 Owner Turn 且没有 Assistant 回复属于正常取消，不产生 `session_persistence` 故障，也不把 Activation 改写为 failed。未取消的 Turn 已形成可信控制结果却缺少应持久化的 Assistant 回复时，仍必须作为真实持久化损坏失败关闭。

## GRT-039 终态前物化 Issue 收口

同一 Goal、同一物化对象跨 writing 与 recovery 形成的开放 Issue 必须按对象终态统一收口：可信回执全部 `resolved`，安全绕过全部 `bypassed`，调度终结但仍未可信完成全部 `needs_help`。`waiting_user` 不能被静默吞掉；Goal 进入 `completed` 前不得残留 `detected`、`repairing` 或 `waiting_user`。
