# Growth 终态真实性与 Worker 留存讨论记录

日期：2026-08-07

状态：已确认问题与产品语义，尚未实现

Primary Capability Line（主能力线）：`growth-runtime`

## 1. 本轮目标

把当前已观察到的 P0、P1、P2 缺陷与 Growth Worker 自动回收合并为一个有顺序的修复批次。这个批次服务于唯一核心结果：用户明确启动 Growth 后，Owner 能稳定跑完、留下真实文件，并在原对话给出不伪装成功的正式回复。

## 2. 已验证问题

### P0：终态汇报漏掉未完成对象

现场 Goal `goal_bdc95251-1560-464b-8c1f-e7511571939e` 已标记 `completed`，但 126 个对象只有 113 个 `completed`；其余对象包含有正文但无可信回执和完全缺少正文两类。Owner 最终回复只报告 1 个待返工对象。

代码原因已经定位：

- `WorldMaterializationCoordinator.deferredObjectIds()` 同时把 `needs_help` 与 `bypassed` 作为延期对象。
- `apps/desktop/src/main.ts` 的进度和 Owner 最终摘要只收集 `needs_help`。
- `finalSummaryEvidence()` 只统计调用方传入的 ID，没有独立核对物化状态、正式回执、文件和 Issue。
- 图片只从正式正文回执反查；图片已经提交但正文回执丢失时，最终汇报无法归属这张图片。

因此这不是文案问题，而是同一业务事实存在多个不一致入口。

### P1：取消被误报为持久化损坏

`sendGrowthMessage()` 等待 Cline Turn 结束后立即寻找 Owner Assistant 回复。用户取消时没有回复属于预期结果，但当前代码仍抛出：

```text
session_persistence: Owner Growth turn has no persisted Assistant reply
```

该错误被 Renderer 当成普通 `runtime.error` 展示，形成假的持久化红错。

### P1：旧 Issue 永久停在 repairing

同一对象的 writing Issue 与 recovery Issue 使用不同去重身份。后续 recovery 成功或绕过时，只收口当前 Issue，早先 writing Issue 仍可能保持 `repairing`。已完成 Goal 因此仍显示“正在自动修复”。

### P1：大型历史恢复仍读取全部 Worker

`ClineAdapter.readTimeline()` 先 `store.list(10_000)`，再筛选 Owner 的 Worker，随后读取每份 Worker 消息 Artifact、全量投影和排序。正式项目已经达到 200～291 个 Worker、13.86～44.71 MiB 消息。UI 虽然折叠过程，但磁盘读取、IPC 和 React 数据仍全量发生。

### P2：新图片路径没有在唯一入口规范化

`requireSafeRelativePath()` 已把 `\\` 转为 `/`，但 `normalizeCommand()` 和 `submit()` 仍可能把原始路径交给 Store。现有少量反斜杠记录仍可读取，不属于数据损坏；新任务应统一持久化 `/`，旧记录本批不迁移。

### P2：Windows 发布壳使用默认 Electron 图标

Renderer 已有正式鸟标 SVG，但 `electron-builder.yml` 没有 Windows 图标配置，当前包使用默认 Electron 图标。Authenticode（代码签名）仍为 `NotSigned`，没有证书时不能把图标修复描述为签名修复。

## 3. 已接受产品语义

### 3.1 终态真实性

- `completed` 可以表示调度已经终结，不等于所有内容都完整成功。
- Owner 回复必须区分：可信完成、通过 recovery 接受已有正文、已绕过且缺失、待人工返工、图片未完成。
- 未完成对象必须逐项列出标题和路径，不能只输出数量。
- 没有可信证据的对象不能被写成完成。
- 旧数据无法安全归属的图片不得猜测回填。

### 3.2 Issue 反馈

- 真实错误出现时可以先红色。
- 自动修复成功后变为绿色“已修复完成”，3 秒后消隐。
- 安全绕过后变为绿色“已绕过”，3 秒后消隐。
- 无法自动解决但不阻塞后续的事项保留黄色待返工。
- 已完成 Goal 不得继续持有 `detected`、`repairing` 或 `waiting_user` Issue。

### 3.3 Worker 生命周期

```text
active / paused / waiting
  保留 Worker Session 与消息，支持运行、暂停和恢复

completed
  Owner 正式 Assistant 回复成功持久化后，删除该 Goal 的 Worker

cancelled / failed
  先形成正式取消或失败汇报，再删除 Worker

删除 Owner 会话或项目
  立即级联删除所属 Worker
```

永久保留：

- 真实作品文件；
- Growth Goal、Issue、Progress Receipt；
- 图片任务与 Attempt；
- Owner 会话中的用户命令和最终 Assistant 回复。

Worker 清理失败属于可重试维护故障，不得把已经完成的作品或 Owner 回复改判失败。不同项目、不同 Owner、不同 Goal 的 Worker 不能互相删除。

### 3.4 完整整本产物

用户要求完整整本测试产物不能被删除。这里的正式产物是作品文件、Growth 持久事实、图片任务和 Owner 最终回复；Worker 执行转录不是作品本体。若未来需要长期保存完整 Worker 诊断转录，应建立独立的显式诊断导出能力，不能阻止本轮自动回收。

## 4. 必须兼容的既有能力

- Cline SDK `0.0.65` 继续是唯一 Harness（智能体运行框架）；不修改 Cline Core。
- Cline 继续拥有 Session 和消息删除事实，CreatX Adapter 只负责选择精确 Worker 并调用 Cline 删除。
- Live Archive（真实档案迁移）不能继续把 Worker 作为必需输入。新合同应要求 Owner 最终回复、Growth Store、项目文件和图片任务；尚未清理的 Worker 可以忽略，不能因 Worker 已回收而拒绝整本迁移。
- Renderer 不新增 Worker 数据库读取，不成为清理状态权威。
- Worker 清理不得阻塞正文、Owner 回复或应用退出。

## 5. 本批明确不做

- 不修用户已冻结的“GWP 取消动作本身延迟较高”。
- 不重构 Cline Core，不增加第二 Harness。
- 不回填旧图片任务的 GWP 来源，不按文件名、Prompt 或路径猜测归属。
- 不迁移旧反斜杠图片路径。
- 不实现 Authenticode 签名。
- 不删除完整整本项目、正式 Owner 历史或图片任务。
- 不把 Fixture（测试夹具）性能测试称为真实 Electron 帧率验收。

## 6. 实施前阻塞

当前主工作树存在大量并发未提交修改，并覆盖本批未来需要修改的核心文件。实现必须等待这些修改形成清晰提交或确认文件所有权；本讨论记录和配套计划只新增不重叠文档，不授权覆盖、暂存或清理现有修改。
