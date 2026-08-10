# Growth Terminal Truth And Worker Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 统一 Growth World Pro 的终态事实，消除取消与 Issue 假红错，安全回收终态 Worker，并完成图片路径和 Windows 图标两项 P2 清理。

**Architecture:** `world-blueprint` 产生唯一的物化终态证据，Desktop、Owner Tool Result、进度和最终摘要只消费这份证据。Cline Adapter 通过精确 Owner/Goal 元数据查询管理 Worker，并在 Owner 正式回复持久化后执行幂等、可重试、非阻塞的清理；Renderer 只投影稳定合同。图片来源身份和新路径规范由 Image Runtime 唯一持久化，发布图标只改变 Builder 资产，不伪装代码签名。

**Tech Stack:** TypeScript、Bun、SQLite、Electron、React 19、Cline SDK 0.0.65、electron-builder、PowerShell。

---

## 0. 批次边界

### 当前目标

按 P0 → P1 → Worker 生命周期与历史性能 → P2 的顺序完成一个可提交批次。

### 允许修改

- `creatx/packages/world-blueprint/**`
- `creatx/packages/growth-runtime/**`
- `creatx/packages/cline-adapter/**`
- `creatx/packages/image-runtime/**`
- `creatx/packages/live-archive-runtime/**` 或当前实际拥有 Live Archive 编排的文件
- `creatx/apps/desktop/src/**`
- `creatx/apps/desktop/renderer/**`
- `creatx/electron-builder.yml`
- `creatx/package.json`
- 对应能力文档、基线和 `CONTEXT.md`

### 明确不做

- 不优化取消动作耗时，只修取消后的假持久化错误与错误展示。
- 不修改 Cline Core、不添加第二 Harness、不引入后台进程。
- 不回填旧图片来源、不迁移旧路径、不签名 Windows 包。
- 不删除整本作品、Owner 最终回复、Growth Store 或图片任务。
- 不顺手处理其他 UI、图片 Provider 或内容质量需求。

### 验收标准

1. 113/126 一类的部分完成必须逐项披露全部 13 个未可信完成对象。
2. 用户取消不产生 `session_persistence` 红错；真实消息损坏仍失败关闭。
3. completed Goal 不保留非终态 Issue。
4. Owner 正式回复持久化前不删 Worker，之后只删精确所属 Worker；删除可重放且不影响别的 Goal。
5. 已清理历史不再读取 Worker JSON；运行中的当前 Worker 仍可见。
6. 新图片路径持久化为 `/`，不同斜杠形式的精确重试保持幂等。
7. Windows 包使用 CreatX 鸟标，签名状态仍如实为 `NotSigned`。

### 停止条件

- 实施开始时目标文件仍有无法确认归属的并发修改。
- P0 需要通过猜测旧文件或旧图片关系才能通过。
- Cline SDK 公开删除路径不能满足 Worker 删除且唯一替代方案是修改 Cline Core。
- 类型检查或核心测试出现与本批无关的红色基线，先隔离诊断，不扩大修复。

## 1. 实施顺序与门禁

```text
Gate A 终态证据真实
  → Gate B 取消与 Issue 收口
  → Gate C Owner 回复后 Worker 回收
  → Gate D 历史读取与 Live Archive 兼容
  → Gate E 图片路径与发布图标
  → 全量验收与文档收口
```

Gate A 未通过前禁止实现 Worker 删除。Gate C 未通过前不得声称恢复性能问题已经解决。每个 Gate 只运行对应定向测试；全量测试只在全部代码冻结后运行一次。

## Task 1：实施前基线与规格冻结

**Files:**

- Modify: `docs/capabilities/growth-runtime/product-spec.md`
- Modify: `docs/capabilities/growth-runtime/acceptance.md`
- Modify: `docs/capabilities/session/product-spec.md`
- Modify: `docs/capabilities/session/acceptance.md`
- Modify: `docs/capabilities/workspace-ui/product-spec.md`
- Modify: `docs/capabilities/workspace-ui/acceptance.md`
- Modify: `docs/capabilities/image-runtime/product-spec.md`
- Modify: `docs/capabilities/image-runtime/acceptance.md`

**Step 1: 确认文件所有权**

运行：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1'
git status --short
git diff --name-only
```

若目标文件仍由另一条任务修改，停止，不创建兼容垫片。

**Step 2: 增加稳定规则**

新增规则建议编号：

- `GRT-036`：物化终态证据唯一权威。
- `GRT-037`：部分完成允许终结但禁止伪装全部完成。
- `GRT-038`：取消与缺少 Assistant 回复必须区分。
- `GRT-039`：Goal 终态前统一收口非终态 Issue。
- `SES-012`：Growth Worker 终态留存与级联删除。
- `WUI-041`：已解决 Issue 的绿色消隐和取消错误静默。
- `IMG-044`：GWP 图片任务保存可信来源身份。
- `IMG-045`：新任务项目相对路径统一使用 `/`。

这些编号实施时先与文件当前 HEAD 再核对，不能覆盖并发新增编号。

**Step 3: 增加验收矩阵**

验收必须覆盖部分完成、取消、真实持久化损坏、跨 Issue 收口、Worker 精确删除、清理重放、历史读取上限、图片来源和路径幂等。

**Step 4: 文档检查**

运行：

```powershell
git diff --check -- docs/capabilities
```

预期：退出码 0。

## Task 2：建立唯一物化终态证据（P0）

**Files:**

- Create: `creatx/packages/world-blueprint/src/materialization-terminal.ts`
- Modify: `creatx/packages/world-blueprint/src/materialization.ts`
- Modify: `creatx/packages/world-blueprint/src/index.ts`
- Test: `creatx/packages/world-blueprint/tests/materialization.test.ts`

**Step 1: 先写失败测试**

构造 126 个对象：113 个有可信 Receipt，6 个正文存在但没有 Receipt，7 个正文缺失；Issue 同时包含 `needs_help` 与 `bypassed`。

断言终态证据输出以下互斥分类：

```ts
type MaterializationObjectOutcome =
  | { status: "completed"; objectId: string; title: string; path: string; attemptId: string }
  | { status: "accepted-existing"; objectId: string; title: string; path: string; attemptId: string }
  | { status: "unverified-file"; objectId: string; title: string; path: string }
  | { status: "bypassed-missing"; objectId: string; title: string; path: string }
  | { status: "needs-help"; objectId: string; title: string; path: string }
```

`accepted-existing` 只能来自 `phase: "recovery"` 的可信 Receipt；单纯发现文件只能是 `unverified-file`，不能自动接受。

**Step 2: 运行测试并确认失败**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun test packages/world-blueprint/tests/materialization.test.ts
```

预期：新终态证据 API 尚不存在或漏掉 13 个对象。

**Step 3: 实现纯终态投影**

`materialization-terminal.ts` 只负责：

- 从物化对象、可信 Receipt、Issue 和图片证据形成不可重叠的终态分类；
- 计算 `isPartial`、各类数量和逐项清单；
- 生成结构化 Owner 摘要；
- 禁止把 `unverified-file`、`bypassed-missing`、`needs-help` 计入可信完成。

文件读取、Store 查询和写入仍留在现有 Service；不要在纯投影模块创建第二状态机。

**Step 4: 替换分裂入口**

`WorldMaterializationService.progress()`、`layerReport()`、`finalSummaryEvidence()`、`finalSummary()` 和 `WorldMaterializationCoordinator.finalize()` 必须消费同一个终态证据。删除 Desktop 调用方自行构造 deferred ID 的需要；如果为兼容过渡保留参数，必须在同一批内移除，不能形成永久双口径。

**Step 5: 验证摘要语义**

最终摘要必须出现：

```text
交付结果：部分完成
可信正文：113/126
未可信完成：13
逐项：标题 + 项目相对路径 + 原因
```

不得出现“十二层正文已经全部物化”。

**Step 6: 运行定向测试**

```powershell
bun test packages/world-blueprint/tests/materialization.test.ts
```

预期：全部通过。

## Task 3：保存 GWP 图片来源并补全终态图片证据（P0）

**Files:**

- Modify: `creatx/packages/image-runtime/src/queue-schema.ts`
- Modify: `creatx/packages/image-runtime/src/queue-store.ts`
- Modify: `creatx/packages/image-runtime/src/queue.ts`
- Modify: `creatx/packages/contracts/src/index.ts`（仅当跨包稳定命令确实需要来源字段）
- Modify: `creatx/packages/world-blueprint/src/materialization.ts`
- Test: `creatx/packages/image-runtime/tests/queue.node-test.ts`
- Test: `creatx/packages/image-runtime/tests/image-runtime.test.ts`
- Test: `creatx/packages/world-blueprint/tests/materialization.test.ts`

**Step 1: 写 V3 迁移失败测试**

为 `image_task` 增加可空来源列：

```text
growth_goal_id
growth_work_item_id
growth_attempt_id
```

断言：

- 普通会话三列为空；
- GWP Worker 从可信 `CreatXToolExecutionContext` 自动写入三列，模型输入不能伪造；
- 同一 idempotencyKey 重试必须具有相同来源；不同来源使用同一 key 时失败关闭；
- V2 数据库原记录完整迁移且来源为空。

**Step 2: 实现向后兼容迁移**

只做 nullable additive migration，不回填旧记录。Image Runtime 是这些列的唯一写入者；Renderer 和 Worker 不接触数据库字段。

**Step 3: 终态汇总按 Goal 查询图片**

`WorldMaterializationService.finalSummaryEvidence()` 同时读取：

- Receipt 绑定的图片；
- `growth_goal_id` 匹配但尚未进入 Receipt 的图片。

按 `imageTaskId` 去重。未绑定正文的图片如实标记 `unbound-to-receipt`，不能伪装已插入文章。

**Step 4: 运行定向测试**

```powershell
bun test packages/image-runtime/tests/queue.node-test.ts
bun test packages/image-runtime/tests/image-runtime.test.ts
bun test packages/world-blueprint/tests/materialization.test.ts
```

预期：全部通过。旧现场三张无来源图片仍不会被猜测归属，这是明确历史限制。

## Task 4：让 Desktop 与 Owner 只消费权威终态证据（P0）

**Files:**

- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/packages/growth-runtime/src/owner-controller-result.ts` 或当前实际拥有 `createGrowthOwnerControllerResult` 的文件
- Test: `creatx/apps/desktop/tests/owner-growth-delivery.node-test.ts`
- Test: `creatx/packages/growth-runtime/tests/owner-activation.node-test.ts`

**Step 1: 写失败测试**

断言 `projectGrowthGoal()`、`run_growth` Tool Result 和最终 Owner Prompt 对同一 Fixture 得到一致的 113/126 与 13 项清单；任何调用点都不能自行按 Issue 状态重新计算 deferred IDs。

**Step 2: 删除 Desktop 双口径**

移除 `main.ts` 中两处只筛选 `needs_help` 的 `new Set(...)`。Desktop 通过 World Materialization 的单一查询取得进度和终态摘要。

**Step 3: 约束 Owner 文案**

Owner 可以把结构化证据写成自然语言，但不得改写数量、漏项或把 `partial` 写成“全部完成”。Tool Result 必须包含逐项清单，不能只给一段自由摘要。

**Step 4: 定向验证**

```powershell
bun test packages/growth-runtime/tests/owner-activation.node-test.ts
bun test apps/desktop/tests/owner-growth-delivery.node-test.ts
```

## Task 5：统一收口同对象 Issue（P1）

**Files:**

- Create: `creatx/packages/world-blueprint/src/materialization-issue-reconciliation.ts`
- Modify: `creatx/packages/world-blueprint/src/materialization.ts`
- Modify: `creatx/packages/growth-runtime/src/store.ts`
- Test: `creatx/packages/world-blueprint/tests/materialization.test.ts`
- Test: `creatx/packages/growth-runtime/tests/store.node-test.ts`
- Test: `creatx/apps/desktop/renderer/tests/growth-issues.test.tsx`

**Step 1: 写跨阶段 Issue 失败测试**

场景：writing Issue 为 `repairing`，recovery Issue 后来 `resolved` 或 `bypassed`。断言同一 `affectedObjectId` 的全部开放物化 Issue 一起进入相应终态。

**Step 2: 实现对象级对账**

`materialization-issue-reconciliation.ts` 根据终态证据执行：

- 对象有可信 Receipt：所有 `detected/repairing` → `resolved`；
- 对象已安全绕过：所有 `detected/repairing` → `bypassed`；
- 对象仍未可信完成且调度要终结：所有 `detected/repairing` → `needs_help`；
- `waiting_user` 不允许被完成流程静默吞掉，Goal 保持 waiting。

不能按“最新 Issue”覆盖旧 Issue，也不能修改其他 Goal。

**Step 3: 增加 Store 终态不变量**

Growth Goal 进入 `completed` 前验证不存在 `detected/repairing/waiting_user`。物化对账应先运行；若仍违反，不得假成功。`cancelled/failed` 可以把开放的非用户等待 Issue 转为带终态原因的 `needs_help`，但不能写成 resolved。

**Step 4: 保持 UI 既有绿色语义**

`resolved/bypassed` 使用现有绿色投影并在 `resolvedAt` 后 3 秒消隐；`needs_help` 保持黄色。不要添加第二套 UI 计时状态。

**Step 5: 定向验证**

```powershell
bun test packages/world-blueprint/tests/materialization.test.ts
bun test packages/growth-runtime/tests/store.node-test.ts
bun test apps/desktop/renderer/tests/growth-issues.test.tsx
```

## Task 6：区分取消与真实持久化错误（P1）

**Files:**

- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/owner-growth-delivery.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Test: `creatx/packages/cline-adapter/tests/projection.test.ts`
- Test: `creatx/apps/desktop/tests/owner-growth-delivery.node-test.ts`
- Test: `creatx/apps/desktop/renderer/tests/app-error-projection.test.tsx`（若当前没有等价测试则新增）

**Step 1: 写两个相反测试**

- Turn 被用户取消且没有 Assistant 回复：Activation/Goal 进入 cancelled，不产生 `session_persistence` Runtime Error。
- Turn 未取消、控制 Result 已存在但 Assistant 回复丢失：继续抛 `session_persistence`，不能吞掉真实损坏。

**Step 2: 在正确边界检查取消**

`sendGrowthMessage()`、Issue Message 和 Owner Delivery 在 `runTurn()` 返回后、读取证据前检查 `signal.aborted` 或 Cline 终态。取消必须使用稳定 `cancelled:` 错误身份，不能依赖任意中文字符串分类。

**Step 3: 不把取消 Activation 标成 failed**

`failOpenOwnerActivation()` 的调用方在取消信号存在时跳过 failure transition，由 `cancelWithOwnerActivations()` 统一提交 cancelled。不要让两个状态写入者竞争。

**Step 4: Renderer 静默预期取消错误**

Renderer 不展示 `code === "cancelled"` 的全局 Error Banner；Run State 和 Growth 终态仍正常显示。其他 `runtime.error` 保持原样。

**Step 5: 定向验证**

```powershell
bun test packages/cline-adapter/tests/projection.test.ts
bun test apps/desktop/tests/owner-growth-delivery.node-test.ts
bun test apps/desktop/renderer/tests/app-error-projection.test.tsx
```

## Task 7：建立精确 Worker 查询与非阻塞清理器

**Files:**

- Create: `creatx/packages/cline-adapter/src/growth-worker-retention.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts` 的导出边界或 `src/index.ts` 相邻导出文件
- Test: `creatx/packages/cline-adapter/tests/growth-worker-retention.node-test.ts`

**Step 1: 写查询隔离测试**

创建：同项目两个 Goal、另一项目一个 Goal、普通会话和内部 Worker。断言按 `ownerSessionId + goalId` 只返回精确 Worker。

**Step 2: 用 Store 查询代替 `list(10_000)`**

在 Adapter 内使用 Cline SDK `SqliteSessionStore.queryAll()` 查询 `metadata_json` 中的：

```text
creatxInternalRole = growth-stage
creatxGrowthOwnerSessionId = ?
creatxGrowthGoalId = ?
```

不修改 Cline Schema，不在 Renderer 暴露查询。第一版不增加表达式索引；先用读取调用数与正式数量级证明足够。

**Step 3: 建立持久 Cleanup Journal（清理日志）**

在 Adapter 数据目录保存原子写入的 V1 维护日志，记录：

```ts
interface GrowthWorkerCleanupEntry {
  ownerSessionId: string
  goalId: string
  workers: Array<{ sessionId: string; messagesPath?: string }>
  requestedAt: string
}
```

日志不保存消息正文。先写日志，再逐个调用 `ClineCore.delete(sessionId)`；全部完成后删除该条。启动时重放未完成条目。

**Step 4: 处理 Cline DB 先删、Artifact 后删的崩溃窗口**

Cline Core `0.0.65` 的删除顺序是先删 Session Row，再删消息和 Session 目录。若重放时 Row 已不存在，Adapter 只能删除日志中预先捕获且经过以下验证的路径：

- 解析后的绝对路径必须位于 Adapter 自己的数据目录；
- 目录身份必须与 Worker Session ID 一致；
- 不允许跟随任意外部路径；
- 缺失目录视为幂等成功。

不得扫描或删除无法证明归属的目录。

**Step 5: 清理失败不回滚作品终态**

清理失败保留 Journal 并记录分类维护日志，稍后重试；不得更改 Goal、Owner 回复或作品文件。重复执行必须幂等。

**Step 6: 定向验证**

覆盖：active 不删、回复前不删、精确删除、跨项目隔离、重复清理、DB 已删/目录残留、目录已删/DB 残留、越界路径失败关闭。

```powershell
bun test packages/cline-adapter/tests/growth-worker-retention.node-test.ts
```

## Task 8：把 Worker 回收接入 Owner 交付和级联删除

**Files:**

- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/owner-growth-delivery.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Test: `creatx/apps/desktop/tests/owner-growth-delivery.node-test.ts`
- Test: `creatx/packages/cline-adapter/tests/growth-worker-retention.node-test.ts`

**Step 1: 写顺序测试**

必须证明：

```text
Growth 形成终态证据
→ Cline 持久化 Owner Assistant 回复
→ Growth Store 完成 Activation / Goal
→ 请求 Worker Cleanup
```

回复回调未执行或持久化失败时 Worker 仍存在。

**Step 2: 接入 completed 路径**

在 `completeOwnerActivation()` 或 `completeOwnerDeliveryActivation()` 成功返回后，由 Desktop 编排调用 `adapter.cleanupGrowthWorkers(ownerSessionId, goalId)`。不要把清理写入 Cline Adapter 的普通 `sendMessage()`。

**Step 3: 接入 cancelled / failed 路径**

取消命令先提交 Goal cancelled 并及时返回，不能为了等待 Provider 汇报而增加取消延迟。正式取消或失败汇报通过现有 Owner Delivery 机制异步进入同一会话；只有该回复持久化后才清理。Provider 暂时不可用时 Goal 可以保持已取消/失败，但 Worker 留待下一次成功交付；不能为了清理伪造 Assistant 消息，也不能把“尚未交付汇报”冒充为清理失败。

**Step 4: Owner / 项目删除级联**

`deleteSession` 与 `deleteProjectSessions` 先通过精确元数据取得所属 Worker，再调用 Adapter 的受控级联删除。可见 Session 校验只针对 Owner；内部 Worker 由关系校验授权删除。运行中的 Owner/Worker 继续失败关闭。

**Step 5: 定向验证**

```powershell
bun test apps/desktop/tests/owner-growth-delivery.node-test.ts
bun test packages/cline-adapter/tests/growth-worker-retention.node-test.ts
```

## Task 9：轻量历史投影与 Live Archive 兼容（P1）

**Files:**

- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/packages/cline-adapter/src/live-archive.ts`
- Modify: `creatx/packages/live-archive-runtime/**`（按当前实际所有权）
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`（仅当投影合同需要，优先不改）
- Test: `creatx/packages/cline-adapter/tests/growth-worker-retention.node-test.ts`
- Test: `creatx/packages/cline-adapter/tests/live-archive.node-test.ts`

**Step 1: 写读取调用数测试**

- 已终态且 Worker 已清理：`readTimeline()` 对 Worker 消息读取次数为 0。
- 清理尚待重试的终态 Goal：UI 仍只读取 Owner 历史，不加载终态 Worker JSON。
- 活动 Goal：当前非终态 Worker 可读取，已结束 Worker 不因重开页面再次全量读取。

大型 Fixture 只验证读取次数和数据上限，不宣称 Electron 帧率。

**Step 2: 调整 `readTimeline()`**

Owner 消息继续由 Cline 读取。Worker 只通过 Task 7 的精确查询取得当前非终态记录；实时 Worker 事件继续沿现有 Timeline Event 进入当前页面。重开后历史过程由 Growth Progress/Issue 摘要恢复，不重放数百份已结束 Worker 原始消息。

**Step 3: 修改 Live Archive 必需证据**

新档案必需：

- Owner Session 和正式最终回复；
- Growth Goal / Issue / Progress Receipt；
- 项目真实文件；
- 图片任务。

Worker Session 不再是必需项，也不复制到新档案。旧档案含 Worker 时可以读取兼容，但晋升后按新留存规则处理。

**Step 4: 定向验证**

```powershell
bun test packages/cline-adapter/tests/growth-worker-retention.node-test.ts
bun test packages/cline-adapter/tests/live-archive.node-test.ts
```

## Task 10：统一新图片路径（P2）

**Files:**

- Modify: `creatx/packages/image-runtime/src/queue.ts`
- Modify: `creatx/packages/image-runtime/src/queue-store.ts`（若 Store 防御性校验需要）
- Test: `creatx/packages/image-runtime/tests/queue.node-test.ts`

**Step 1: 写失败测试**

断言：

- `世界\\地图\\主图.png` 持久化为 `世界/地图/主图.png`；
- 相同 idempotencyKey 使用两种斜杠形式返回同一任务；
- 不安全路径在 Provider 请求和 Store 写入前失败；
- 视觉母版 Prompt 只拼接一次。

**Step 2: 在唯一入口规范化**

`normalizeCommand()` 必须调用 `requireSafeRelativePath()`，后续视觉母版查找、幂等比较、Store 写入和 Provider 输出全部使用规范值。Store 可保留同样的防御性校验，但不能实现第二种规范规则。

**Step 3: 不迁移旧数据**

旧反斜杠记录继续按读取兼容路径工作；本批不更新历史 SQLite。

**Step 4: 定向验证**

```powershell
bun test packages/image-runtime/tests/queue.node-test.ts
```

## Task 11：接入 CreatX Windows 图标（P2）

**Files:**

- Create: `creatx/apps/desktop/build/icon.ico`
- Modify: `creatx/electron-builder.yml`
- Modify: `creatx/package.json`（仅当打包前资产校验脚本需要）
- Create: `creatx/apps/desktop/tests/windows-package-icon.node-test.ts`
- Source: `creatx/apps/desktop/renderer/src/assets/bird-wing-logo-clean.svg`

**Step 1: 生成并人工核对 ICO**

从现有鸟标 SVG 生成包含 16、24、32、48、64、128、256 像素层级的 `.ico`。生成是一次性开发步骤，不给生产 Runtime 增加图片依赖。核对透明背景、小尺寸轮廓和品牌方向。

**Step 2: 配置 Builder**

在 `win:` 下设置实际存在的图标路径。不要设置或声称代码签名。

**Step 3: 自动检查资产**

测试至少验证：Builder 引用文件存在、ICO 文件头正确、包含 256px 图层。构建后的 EXE 资源检查放在发布验收，不用单元测试伪造。

**Step 4: 定向验证**

```powershell
bun test apps/desktop/tests/windows-package-icon.node-test.ts
```

## Task 12：冻结、全量验收和真实冒烟

**Files:**

- Modify: `CONTEXT.md`
- Modify: `BASELINE.md`
- Create: `docs/baseline/creatx-growth-terminal-cleanup-2026-08-07.md`
- Modify: 本计划涉及的 Capability 文档证据状态

**Step 1: 检查变更边界**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1'
git status --short
git diff --stat
git diff --check
```

确认没有并发任务文件、正式 Profile 数据、测试截图、SQLite、Provider 响应或整本产物进入提交。

**Step 2: 冻结安装**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun install --frozen-lockfile
```

预期：退出码 0，Lockfile 无变化；若 Task 11 不增加依赖则不应改 Lockfile。

**Step 3: 类型和导入边界**

```powershell
bun run typecheck
bun run test:imports
```

预期：全部退出码 0。

**Step 4: 串行全量测试**

```powershell
bun run test
```

预期：全部通过。记录实际测试数和断言数，不能沿用旧基线数字。

**Step 5: 生产构建**

```powershell
bun run build
```

预期：退出码 0。

**Step 6: 隔离 Profile 的 Electron 冒烟**

只在正式运行软件已经关闭或使用明确隔离 Profile 时执行：

- 创建一个小型 Growth Fixture，不调用真实 Provider；
- 验证取消无红错、终态 Issue 绿色消隐、Owner 历史只显示请求与最终回复；
- 验证 Worker 清理后重开历史不读取 Worker Artifact；
- 验证另一个活动 Goal 的 Worker 未被删除。

这不是 Provider Live。

**Step 7: Windows 打包验收**

```powershell
bun run package:win
```

检查安装版和便携版：

- EXE 图标资源为 CreatX 鸟标；
- 文件版本正确；
- Authenticode 状态如实记录为 `NotSigned`；
- 不覆盖旧完整整本产物。

**Step 8: 文档收口**

记录：实际修改、迁移版本、定向测试、全量测试数、是否使用真实 Provider、是否运行真实 Electron、已知历史限制和下一恢复入口。

## 2. 语义提交建议

工作树干净且每个 Gate 通过后按语义提交，不按 Agent 提交：

1. `fix(growth): unify terminal materialization truth`
2. `fix(growth): settle cancellation and stale issues`
3. `feat(session): retire terminal growth workers`
4. `fix(image): normalize queued image paths`
5. `chore(desktop): brand windows packages`
6. `docs: record growth terminal cleanup evidence`

如果实现过程中这些边界无法保持独立，减少提交数，但禁止提交无法编译的中间状态。

## 3. 最高风险与证伪条件

- 最大风险不是删除 API，而是 Owner 回复、Goal 终态和 Worker 清理顺序写错。任何测试观察到“回复未持久化但 Worker 已删除”都直接否决 Gate C。
- 新图片来源需要 Image Queue V3 加法迁移；若迁移不能保持 V2 任务完整，停止，不用 Prompt 或路径猜测替代。
- Live Archive 若仍要求 Worker 才能晋升，自动回收不能发布；必须先完成 Task 9。
- 清理性能只能由读取调用数自动测试和隔离 Electron 实测共同证明。单元测试通过不能声称正式大型会话不卡顿。
- Windows 图标通过不代表代码签名通过。

## 4. 执行入口

开始实施前重新读取：

- `CONTEXT.md`
- `BASELINE.md`
- `docs/discussions/2026-08-07-growth-terminal-truth-and-worker-retention.md`
- 本计划
- 目标 Capability Line 的当前规格与验收

然后使用 `executing-plans` 串行执行。当前主工作树仍有重叠未提交修改时不得开始 Task 1。
