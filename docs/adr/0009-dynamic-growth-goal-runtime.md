# ADR-0009：Growth 使用持久 Goal 编排多个 Cline Run

## Status

Accepted

日期：2026-07-28

## Context

ADR-0001 已把 NovelX 固定世界、故事和封面流水线降为历史参考。随后 Creative Skills 规格把 `/growth` 简化成普通 Cline Run 上的目标驱动 Skill，这能复用 Harness（智能体运行框架），却不能可靠完成跨多个上下文阶段、可暂停、可继续且包含异步图片的长任务。

Cline `0.0.65` 已拥有消息、模型循环、工具调用、Queue/Steer、Abort 和 Run 终态，但一个 Run 的结束不等于用户长期创作目标完成。CreatX 需要保存产品级 Goal 生命周期，同时必须避免复制 Cline 的 Run、消息或工具事实。

## Decision

### 1. 组成与所有权

- `Growth = Persistent Goal Runtime（持久目标运行时） + Growth Creative Skill（创作技能）`。
- `creative-skills` 是 Growth 产品行为的主要能力线，并拥有 `/growth` 触发、滚动规划、计划文件和阶段汇报语义。
- CreatX 持久化 Goal 的身份、用户目标、当前状态、计划文件引用、必须图片任务引用和当前 Cline Session 关联。
- Cline 继续独占消息、每个 Run、模型循环、工具调用、Queue/Steer 和 Abort。CreatX 不镜像 Cline Run 状态，也不建立第二套 Agent 执行内核。
- `image-runtime` 独占图片任务、队列、Worker、Provider 调用、图片校验和落盘结果；Growth 只提交并引用任务。

### 2. 触发与并发

- 只有用户输入 `/growth` 才创建或激活持久 Goal。普通自然语言请求保持普通会话任务。
- 一个项目最多一个未终结 Goal；`active`、`paused` 与 `waiting` 都占用该位置。未终结 Goal 存在时新的 `/growth` 默认成为同一 Goal 的 Steer（插话）或扩展；只有旧 Goal 明确结束后才能创建另一个。
- 小目标可以直接执行。大目标创建并维护项目根的 `创作计划.md`；计划写入后立即开始，不增加计划批准步骤。
- Growth 采用 Rolling Planning（滚动规划），每次只详细决定当前里程碑和少量后续步骤，阶段结束后重读真实项目并重新规划。

### 3. Goal 与阶段状态

Goal 状态为：

```text
active | paused | waiting | completed | cancelled | failed
```

其中 `completed`、`cancelled` 和 `failed` 对自动调度都是终态。用户可以显式把 `completed` 重新打开为 `active`，恢复后仍是同一 Goal 身份；这是唯一允许离开自动调度终态的动作。`cancelled` 与 `failed` 不可重开。

每个阶段是一个新的 Cline Run。`report_growth_progress` 是项目作用域的中立 CreatX Tool（工具），接受 `continue | waiting | completed | failed`、简短总结、下一步和相关产物/图片任务引用。Cline Run 结束不自动代表 Goal 完成。

- `continue`：验证最低事实后，以当前计划和项目状态启动下一 Cline Run。
- `waiting`：停止调度，等待用户、额度、凭据或可恢复外部条件。
- `completed`：重读关键产物并检查完成条件、所有必需图片成功后进入终态。
- `failed`：不可恢复失败进入终态；Provider 或凭据等可恢复问题应使用 `waiting`。

Runtime 不判断艺术质量，只验证引用存在、状态合法和必需图片完成等低成本事实。缺少汇报时最多发起一次恢复回合；连续两次缺少汇报转为 `waiting`。连续三个阶段没有文件、图片任务或计划进展也转为 `waiting`。

### 4. 权限

- 新个人或项目会话默认“自由”，会话界面只提供“审批 / 自由”直接切换；旧四档权限不恢复。个人会话仍由 Session 关闭全部项目工具，因此“自由”不会授予文件或 Shell 能力。
- “自由”通过完整 Cline Act 工具集加 `toolPolicies["*"] = { enabled: true, autoApprove: true }` 实现，不把 Agent Tool Preset（智能体工具预设）切成会禁用 Skills 的 `yolo`。这不否定 Cline 同名 Tool Policy Preset（工具策略预设）的自动批准语义。
- Growth 只能在自由模式运行，期间不出现工具审批弹窗。
- 用户主动切到审批模式后，`/growth` 必须在创建 Goal 或产生工具副作用前失败，并提示先切回自由；不能静默覆盖用户的模式选择。
- 自由模式不构成项目沙箱。Cline 文件和 Shell 工具可能访问整台机器；UI 必须把它标为全机信任边界，不能描述为只允许项目内操作。

本节取代 ADR-0005 中“第一版所有副作用逐次审批”和 ADR-0008 中 `editor`、`run_commands`、`register_workbench` 必须逐次审批的全局表述。它不改变个人会话无项目工具，也不恢复计划/协作档。

### 5. Steer、暂停与应用退出

- Growth 运行期间用户消息默认使用 Cline 原生 `delivery: "steer"`，在下一安全模型边界进入上下文，不强制取消当前工具。
- 暂停先阻止后续调度并立即请求 Abort 当前 Cline Run，Goal 进入 `paused`，保留所有已完成产物并记录计划状态。已经开始的工具副作用不回滚；Cline 对在途工具的真实取消时序必须单独验收，不能用 Goal 状态掩盖迟到文件结果。
- 继续时重读 `创作计划.md`、真实项目文件和图片任务状态，再为同一 Goal 启动新 Run。
- 结束 Growth 会 Abort 当前 Run并把 Goal 标为 `cancelled`，不删除产物。
- 第一版应用退出时停止当前 Run 并持久化为 `paused`。不在托盘或后台继续；重启后由用户明确“继续”。

### 6. 持久单 Worker 图片队列

- 新增 `submit_image_generation`，提交持久图片任务并立即返回 `imageTaskId`；它取代 Growth 对同步 `generate_image` 的依赖，但不要求立刻删除已有单图工具。
- Electron Main Process 拥有一个顺序 Worker。任务状态为 `queued | generating | succeeded | failed | interrupted`。
- 成功路径复用现有 Provider 校验和 Project File Command Port。Growth 提交后可以继续文本阶段。
- 必需图片没有成功时 Goal 不得完成。失败任务保留并可见；修改 Prompt 后创建新任务，不覆盖旧任务历史。
- 正常退出或崩溃恢复时，`queued` 保留并在应用重开、Worker 恢复后继续顺序执行；当时的 `generating` 转为 `interrupted`。可能已收费的任务不自动重提。

## Consequences

### Positive

- 长目标不受单个上下文窗口或单个 Cline Run 生命周期限制。
- 固定世界生成路线变成可选创作方法，Growth 可以覆盖小说、世界、研究和其他艺术目标。
- 用户可以在同一会话中 Steer、暂停和继续，且真实文件与图片始终是工作依据。
- Goal、Cline Run 和图片任务分别只有一个权威所有者。

### Negative

- CreatX 新增持久 Goal 调度与图片队列，需要处理幂等、重启、Abort 竞态和付费结果未知。
- “自由”是明确的全机信任模式，不提供项目级安全隔离。
- 模型是否正确规划和判断艺术完成仍具有概率性；Runtime 只能防止明显空转和虚假完成。
- Renderer 必须允许 Run 中继续输入，并增加 Growth 状态、暂停和继续的最小投影。

## Rejected Alternatives

- 只用一个超长 Cline Run：无法形成可靠的多阶段恢复、空转门禁和异步图片协作。
- 恢复固定 NovelX 流水线：不能服务不同目标，并把比赛模板错误提升为通用产品模型。
- 普通自然语言自动升级 Growth：会把简单任务意外变成持久自动任务。
- 使用 Cline `yolo` Agent Tool Preset：固定源码表明该工具集禁用 Growth 所需 Skills 等工具。
- 关闭窗口后继续后台运行：第一版增加进程、通知、凭据和退出语义风险，当前用户价值不足以成为门槛。
- 多 Worker 或子 Agent 并行：会提前引入文件冲突、成本和调度复杂度；第一条闭环先串行。

## Supersession

- 取代 `docs/capabilities/creative-skills/product-spec.md` 旧 `CSK-301`、`CSK-304` 中“Growth 只是普通 Run、没有专用恢复”的部分。
- 取代 ADR-0005 第 40 行和 ADR-0008 第 21 行把副作用逐次审批描述为所有第一版会话唯一行为的部分；骨架历史证据仍然有效。
- 部分取代 `docs/discussions/2026-07-26-first-version-priority-correction.md` 对第一版只使用原生逐次审批的优先级结论；四档、后台继续和严格活动 Run 续跑仍然延期。
- 不改变 ADR-0005 的唯一 Harness、事实所有权、Adapter 和不修改 Cline Core 决策。

## Verification Gate

实现只有通过 `ACC-CSK-301` 至 `ACC-CSK-316`、新增 Session 自由模式验收和 Image Queue 验收后才能称为 Growth Live。首条完整世界基准见 `../discussions/2026-07-28-dynamic-growth-goal-discovery.md`，实施步骤见 `../plans/2026-07-28-dynamic-growth-goal.md`。
