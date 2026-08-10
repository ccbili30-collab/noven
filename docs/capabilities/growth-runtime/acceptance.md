---
title: Growth Runtime 验收矩阵
doc_type: capability-acceptance
owner: growth-runtime
status: authoritative-terminal-evidence-verified
last_verified: 2026-08-08
source_of_truth: docs/capabilities/growth-runtime/product-spec.md
---

# Growth Runtime 验收矩阵

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-GRT-001 | GRT-001, GRT-002 | 首次提交显式 `/growth_world_pro` | 创建唯一绑定 Owner Session、启动消息、项目和 Goal 的 Run；没有第二消息记录 |
| ACC-GRT-002 | GRT-002 | 没有已展示 waiting Issue 时提交普通“完成了吗？”，或 Issue 等待时提交与问题无关的普通话 | 不创建或唤醒 Run，不改变 Goal、Scheduler 次数和项目文件哈希；Issue 场景只允许零工具澄清回复 |
| ACC-GRT-003 | GRT-003 | Worker 正常提交、旧 attempt 迟到、跨 Owner 提交 | 正常结果一次生效；后两者失败关闭且不污染当前 Run |
| ACC-GRT-004 | GRT-004 | Worker 全部完成但 Owner 最终回复持久化失败 | Goal 不进入 `completed`，保留可恢复的准确状态 |
| ACC-GRT-005 | GRT-004 | Owner Tool Result 与最终回复均持久化 | Goal 原子进入 `completed`，重放不产生第二份回复或副作用 |
| ACC-GRT-006 | GRT-005 | 自动修复、可绕过、需人工返工和阻塞错误 | 状态分别进入解决、警告等待或阻塞，不被笼统错误覆盖 |
| ACC-GRT-007 | GRT-005, GRT-006 | 取消、退出、重启并发送普通继续 | 旧 Provider 工作不重放；取消保持终态；新普通回合可运行 |
| ACC-GRT-008 | GRT-006 | 完成后重启并普通追问 | 读取同一 Cline 最终回复；Growth Store 和项目文件无变化 |
| ACC-GRT-009 | GRT-007 | Worker 写入作品并更新进度 | 工作台从真实文件事件刷新，进度从 Growth Store 刷新，两者不相互推测 |
| ACC-GRT-010 | GRT-008 | 同一 Goal 正在由 Activation A 排空时 Activation B 尝试运行 | B 失败关闭；暂停/等待后的正式 resume 先等 A 收尾，再以 B 开新 drain，不共享结果 |
| ACC-GRT-011 | GRT-008 | 重启读取 Worker 活动和多个 Owner 回合 | Worker 只回填到相同 Activation 的 Owner Turn，普通追问不获得 Growth 内部工具 |
| ACC-GRT-012 | GRT-009 | 控制器返回错误但 Assistant 已正式解释 | Activation 失败、Goal 不完成，回复保留在 Cline 历史，后续普通会话可继续 |
| ACC-GRT-013 | GRT-009 | `result_ready` 交付窗口内用户结束 Growth | Goal 与开放 Activation 原子取消，Session abort 后新命令不会被旧 Activation 阻塞 |
| ACC-GRT-014 | GRT-002 | 首次 Owner 消息已提交但 IPC 响应未知，Renderer 以相同请求身份重试 | 复用同一 Activation、Goal、版本和结果；相同身份改内容失败关闭，不产生第二次 Provider 或文件副作用 |
| ACC-GRT-015 | GRT-004, GRT-009 | 最终回执事务故障，或 `failed + result_ready` 后退出重启 | 回执与 `owner_reply_pending` 同事务回滚；重启后所有 `result_ready` 均可继续交付或原子结束，不锁死后续 Growth |
| ACC-GRT-016 | GRT-010 | Owner 结果交付回复已持久化，但完成回调随即崩溃 | 同进程精确重试或重启都读取同一持久回复并完成 Activation；Provider、控制器和 Scheduler 调用数不增加 |
| ACC-GRT-017 | GRT-011 | Issue 控制器成功后，同一请求因 IPC 结果未知而精确重试 | 先命中并复用原 Issue Activation，不作为普通聊天再次提交，不产生第二次副作用 |
| ACC-GRT-018 | GRT-012 | 普通 Resume 或 `result_ready` 交付的 IPC 结果未知后，以相同请求身份重试，或以同一身份改换 Goal | 副作用前已持久化同一 Resume Activation；精确重试复用同一 Activation 和结果，交付型 Resume 与来源原子完成；身份冲突失败关闭 |
| ACC-GRT-019 | GRT-013 | Owner 最终回复持久化并完成 Goal | Cline 历史保存唯一正式回复；Goal `status_reason` 不包含回复副本，Activation 只保存回复哈希 |
| ACC-GRT-020 | GRT-014 | `failed`、`waiting` 和成功结果分别进入 Owner 交付窗口 | UI 分别显示失败说明、等待原因和完成结果，且不改变底层 Goal 状态 |
| ACC-GRT-021 | GRT-010, GRT-012 | pending 交付回复已持久化但完成回调失败，同进程以相同 requestId 重试 | 直接完成来源、交付 Activation 与 Goal；Provider 调用数不增加，不产生第二份正式回复 |
| ACC-GRT-022 | GRT-012 | 交付回合尚无持久回复即崩溃，启动把交付 Activation 标记 failed，用户以新 requestId 继续 | 旧失败历史保留，新交付 Activation 成功占用释放后的来源槽；原 `result_ready` 仍可交付或结束 |
| ACC-GRT-023 | GRT-015 | Owner 结果待交付时发送普通消息，交付完成后再次发送 | 前者失败关闭且不产生 Provider 回合；后者进入同一 Cline 历史的普通新回合 |
| ACC-GRT-024 | GRT-016 | 结果交付回合结束后在同一 Owner Session 发送普通消息 | 交付 Provider 请求工具数为 0；下一普通请求恢复普通工具；Session ID 与持久历史不变 |
| ACC-GRT-025 | GRT-017 | `result_ready` 来源存在一个可信控制器结果并随后出现零工具交付回合；或历史出现第二个控制器调用、重复 Tool Result、成功与错误混合、缺少可信结果 | 仅第一种识别为全历史唯一可信结果；其余全部失败关闭，原子失败来源与开放交付、清除回复门禁且不调用交付 Provider |
| ACC-GRT-026 | GRT-018 | 首次 `/growth*` 的相同 requestId 在首个请求尚未结束时并发重试 | 两个调用等待同一执行并得到同一结果；控制器与副作用各执行一次，加入者不能把共享 Activation 标记失败 |
| ACC-GRT-027 | GRT-019 | V9、V10 或 V11 在 `ALTER TABLE` 生效后、版本提交前中断；V9 的列与索引可能分别已落盘 | 根据实际列结构完成幂等恢复迁移并到达当前版本；既有 Goal、Issue、Activation 数据与唯一索引语义保留 |
| ACC-GRT-028 | GRT-020 | Owner 正式回复已写入 Cline 历史，Store 完成回调前同时收到取消 | 先从持久 Turn 完成 Activation 与 Goal；取消不能覆盖为 `cancelled`，且不产生第二次 Provider 调用 |
| ACC-GRT-029 | GRT-020 | Resume 交付 Activation 已持久化正式回复，来源 Turn 无回复，完成回调前收到取消 | 优先从交付 Turn 原子完成来源、交付与 Goal；原完成回调以同回复重入幂等成功，取消不能覆盖终态 |
| ACC-GRT-030 | GRT-021 | Goal 处于 paused、waiting、failed+result_ready 或开放交付状态时删除单会话或项目全部会话 | 删除失败关闭，Cline 历史保留；Growth 正式收束后删除恢复可用 |
| ACC-GRT-031 | GRT-022 | 阶段策略、阶段前指纹或阶段后指纹读取失败 | 阶段前不启动 Worker并进入 waiting；阶段后保留回执、关闭 attempt 并进入 waiting；不存在无人执行的 active Goal |
| ACC-GRT-032 | GRT-023 | Main 已接受显式 Growth，但 IPC 响应未知并触发 Renderer 重载；或快速发起第二个 Resume | Renderer 读取未决命令并用原 requestId 重试；第二个不同请求不能覆盖第一个，且清理第二个身份不能删除第一个；Goal ID、版本与状态不变；明确失败的乐观消息不保留为 Cline Turn |
| ACC-GRT-033 | GRT-024 | 历史同时含 `activation-a` 与 `activation-a-suffix` marker | 每次查找只读取完整 ID 相等的 Turn，Tool Result 和回复不串联 |
| ACC-GRT-034 | GRT-021, GRT-025 | 删除单会话或项目会话的异步窗口内并发提交 `/growth*` | 删除最终检查与 Activation 接纳串行；删除先获准时新请求不会进入已删除历史，Activation 先建立时删除失败关闭；不存在已接纳 Activation 的唯一历史被删除 |
| ACC-GRT-035 | GRT-020 | 取消到达时来源或交付 Activation 正从 `running` 进入结果与回复持久化 | 先中止并等待相关 Owner 执行，再以最新 Cline 历史完成或取消；持久回复不能与 cancelled Store 形成双终态 |
| ACC-GRT-036 | GRT-026 | Resume/Issue 已接纳但控制器尚未执行即取消 Goal，随后迟到结果或重放到达 | Activation 已预绑定同一 Goal；取消原子收束相关 Activation，迟到结果与重放失败关闭，不能恢复终态 Goal |
| ACC-GRT-037 | GRT-017, GRT-027 | 普通即时完成时较早 Turn 已存在重复控制器调用或 Tool Result，最后 marker Turn 本身看似合法 | 与交付和恢复使用相同的全历史唯一解析；证据损坏失败关闭，不生成正式完成回复 |
| ACC-GRT-038 | GRT-025 | 删除在串行区内先完成，旧 Session 对象仍残留于调用方内存，随后 Start/Issue 尝试接纳 | 接纳方在锁内重读真实 Cline Session 并拒绝请求；不持久化失败 Activation，不引用已删除历史 |
| ACC-GRT-039 | GRT-026 | Start Activation 创建后绑定新 Goal，再以原始无 Goal 命令精确重试；Resume/Issue 改换 Goal 重试 | Start 复用同一 Activation 与派生 Goal；Resume/Issue 的 Goal 身份冲突失败关闭 |
| ACC-GRT-040 | GRT-027 | 较早 marker Turn 有额外调用/结果而最后 Turn 看似合法；或 Call、Result、回复分别落在不同 Turn 或顺序颠倒 | 正常完成、恢复、重试、取消和 Issue 澄清共用同一解析器并失败关闭，不完成 Goal，不生成拼接回复 |
| ACC-GRT-041 | GRT-028 | Start 控制器创建世界 successor 时，在 Goal 建立后立即取消或进程中断 | Goal 与 Activation 不存在未绑定持久窗口；世界接管只在原子关联后开始，取消能等待执行且返回后无迟到写入 |
| ACC-GRT-042 | GRT-029 | 来源 Turn 有 Tool Result 和 Worker 活动但无最终回复，后续 delivery Turn 形成正式回复 | Worker 活动显示在来源 Turn 的处理区、delivery 用户 Turn 之前，不成为最终回复后的 orphan 活动 |
| ACC-GRT-043 | GRT-020 | Owner 执行已注册但尚未进入 `core.send` 时 Pause/Cancel | 持久 Activation 被取消，取消令牌阻止 Provider 请求；Pause 等待旧执行退出后才返回 |
| ACC-GRT-044 | GRT-028 | 旧版 World Pro 等待 Goal 通过 Continue 接管 | 使用绑定旧 Goal 的显式 Start Activation；取消旧 Goal、创建继任 Goal和迁移绑定同事务提交，无孤立 Goal或隐式 Resume 替换 |
| ACC-GRT-045 | GRT-020, GRT-028 | 已有未终止 Goal 时新显式 Growth 在接纳后、控制器绑定前并发 Pause | Start Activation 从接纳时预绑定既存 Goal；Pause 取消令牌生效且 Provider 请求为 0，合法替换只能原子迁移绑定 |
| ACC-GRT-046 | GRT-020 | waiting/active Goal 仍有开放 Owner 回合时退出应用 | 全部开放 Owner 执行先被标记取消并 abort Session；Adapter 正常释放，应用在限定时间退出，重启保持正确 waiting/paused 状态 |
| ACC-GRT-047 | GRT-020 | 文件投影、图片 drain、Provider dispatcher 或 Cline dispose 永不返回 | 持久暂停与取消请求先行；完整清理到达 deadline 后强制退出 Electron，不永久挂起，也不先关闭 Store 再等待迟到回调 |
| ACC-GRT-048 | GRT-020 | Cancel 等待开放 Owner Promise 期间正式回复完成并把 Goal置为 completed | Cancel IPC 成功返回最新 completed 投影，不二次取消、不覆盖终态、不显示状态冲突 |
| ACC-GRT-049 | GRT-028 | Growth 正在运行时再次输入显式 `/growth*` 方向 | 输入作为正式 Cline Steer 进入同一 Session 与现有 Activation；不创建第二顶层 Activation、不抢占 Scheduler、不即时伪造回复，最终由原 Owner Turn收束 |
| ACC-GRT-050 | GRT-022, GRT-028 | 已有 active Goal 记录，但新的显式 Growth 发现 Cline Run 已空闲 | 新 Start Activation 预绑定既有 Goal并接管 Scheduler，继续到正常 waiting、failed 或最终回复门禁；不存在无人执行的 active Goal |
| ACC-GRT-051 | GRT-025, GRT-030 | 普通 Owner 消息接纳与 Growth Activation 创建并发 | 两者共享短接纳事务；Activation 先建立则普通消息失败关闭，普通消息先接纳则短锁在 `onAdmitted` 后释放、Session 活动门禁保持到回合结束；运行中追加只走 Steer |
| ACC-GRT-052 | GRT-020, GRT-028 | 应用退出时 Owner 回调、Growth 投影或 Adapter 清理仍在运行 | 停止新接纳并在全局 deadline 内等待已登记回调与队列；正常路径只在静默后关闭 Store，超时路径不关闭 Store而直接强制退出 |
| ACC-GRT-053 | GRT-000, GRT-002, GRT-003, GRT-004 | 用户以一句明确 `/growth*` 需求启动一个新项目，并让它运行到四阶段结束 | 只有一个 Owner Run；四阶段按产品顺序推进，有界 Worker 写出真实文件，Owner 在同一 Cline Session 留下正式、可理解的总结，Goal 随后终结；普通对照消息不启动 Growth |
| ACC-GRT-054 | GRT-000, GRT-005 | 四阶段长跑中遇到可重试 Provider 中断、非必需图片失败、普通资料缺口或单个非关键 Worker 失败 | 系统按错误类别执行有界重试、跳过或带警告继续；不因可绕过问题停止整条主链，不把失败项伪装成功，最终总结准确列出未完成项及影响 |
| ACC-GRT-055 | GRT-000, GRT-007 | 长跑结束后检查作品、工作台和原对话 | 作品文件非空且未发生明显重复覆盖；工作台读取同一真实文件；正式回复说明产物位置、完成范围和失败项，不暴露内部控制 JSON 或把活动摘要冒充正文 |
| ACC-GRT-056 | GRT-000, GRT-020 | 用户在普通运行中暂停、继续或退出应用 | 操作在可理解时间内返回，软件不被错误拖死；继续以一个 Owner 恢复到下一合法工作点，退出不留下失控 Worker；不要求自动重放未知在途副作用 |
| ACC-GRT-057 | GRT-002, GRT-011 | 项目已明确展示唯一 waiting Issue，用户直接给出足够或不足的解决信息 | 足够时同一 Owner Issue 回合调用一次受信任工具、解决 Issue并自动继续既有 Run；不足或无关时不调用工具、不唤醒 Scheduler，只追问一个关键信息；两者都不创建第二个 Growth Run |
| ACC-GRT-058 | GRT-031 | 同一 Goal 在一次投影未结束时连续产生数百次进度更新，期间另一个 Goal 也产生更新 | 前一 Goal只执行当前投影和最后一次最新投影，终态不会排在数百个过期快照之后；另一 Goal独立投影；单次错误后最新更新仍会执行；退出可等待队列排空 |
| ACC-GRT-059 | GRT-032 | 正文全部完成、回复尚未落库且图片包含失败或排队任务 | 控制器保留当前 `goalStatus=active` 供 Store 校验，同时给出 `deliveryGoalStatus=completed` 和可信 `ownerSummary`；Owner 最终回复不暴露内部 active，并明确汇报未成功图片 |
| ACC-GRT-060 | GRT-031, GRT-032 | 打开修复后的完整外部 Provider 长跑结果 | Goal终态在可理解时间内投影；原会话存在正式 Owner 回复；回复、真实文件、工作台和物化/图片汇总一致；留下 `result.json`、最终截图、Prose 检查和 Clean Exit证据。该项在第二次外部整本复验前保持未通过 |
| ACC-GRT-061 | GRT-033 | Blueprint Worker 工具失败后仍未返回，或终态再次携带同一故障 | 工具事件到达时已经按 attempt 与 toolCallId 持久化唯一 Issue；终态重复对账不增加 Issue；不因此自动重放崩溃前未知副作用 |
| ACC-GRT-062 | GRT-005, GRT-034 | 内容对象进入 `blocked`、`retryable` 或兼容旧数据 `unknown + block`，Owner 选择 retry、repair、accept 或 bypass；或自动修复耗尽 | 前三种只先进入红色 repairing，形成可信正文回执后才 resolved；repair 获得对象范围 Writer 权限和精确错误，accept 重建已验证正文回执；bypass 持久成功后直接终结该 Issue；耗尽时局部对象或依赖子树被如实绕过，其余对象继续，系统级危险错误仍失败关闭 |
| ACC-GRT-063 | GRT-023 | 两个不同项目的 Owner Session 各有一条未决 GWP 命令，其中一条恢复、失败或被清理 | 两条命令可同时持久保存并各自恢复；处理一条不删除或阻塞另一条，错误只投影到所属会话；同一 Session 的不同未决命令仍失败关闭 |
| ACC-GRT-064 | GRT-035 | 同一文本连接的 Worker 返回额度失败后立即领取下一对象；等待期间 Pause；另一个连接同时领取对象 | 同连接不创建新 Worker 或 Provider 请求；Pause 立即中断等待并清理占用；另一连接立即运行；原失败保持失败且不伪装成功 |
| ACC-GRT-065 | GRT-036, GRT-037 | 126 个物化对象中 113 个有可信完成回执、6 个只有正文文件、7 个正文缺失 | 所有入口读取同一终态证据并报告可信正文 113/126、未可信完成 13；13 项逐一列出标题、路径和原因，不出现“全部完成” |
| ACC-GRT-066 | GRT-036 | 文件存在但没有回执；另一个对象由 recovery 校验后补交可信回执 | 前者只能是 `unverified-file`，后者是 `accepted-existing`；两者互斥且只有后者计入可信完成 |
| ACC-GRT-067 | GRT-038 | 用户取消 Owner Turn 且没有 Assistant 回复；未取消 Turn 已有可信控制结果但回复丢失 | 前者进入 cancelled 且没有 `session_persistence`；后者保留真实持久化错误并失败关闭 |
| ACC-GRT-068 | GRT-039 | writing Issue 保持 repairing，recovery 后形成可信回执、成功绕过或仍未完成 | 同对象全部开放物化 Issue 分别统一进入 resolved、bypassed 或 needs_help；completed Goal 不残留开放 Issue |

`ACC-GRT-065` 至 `068` 已由真实 SQLite、项目文件端口、Cline 持久历史与确定性本地 Provider 测试覆盖，并进入 384/384 全量回归。该证据不替代 `ACC-GRT-060` 的外部 Provider 整本复验。

2026-08-09《赫尔墨斯环城》外部 Provider 长跑形成 97/97、原会话正式回复、真实文件、工作台、附属小说/地图/漫画和重启后继续回合证据；但 Clean Exit 未通过，历史 `run_growth` 仍可能停在 `streaming`，图片队列保留 1 failed 与 1 interrupted。因此该运行是 `ACC-GRT-060` 的强证据输入，不是完整 PASS。详见 `../../baseline/creatx-hermes-ring-live-2026-08-09.md`。
