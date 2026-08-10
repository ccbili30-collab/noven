---
title: CreatX Session 运行状态隔离验收
doc_type: baseline-evidence
status: verified
verified_at: 2026-08-07
capabilities:
  - session
  - workspace-ui
---

# CreatX Session 运行状态隔离验收

## 问题与根因

正式《太衡界世界》已经完成且没有运行中的 Cline Session 或 Provider 请求，但重新打开后 Renderer 显示递增的“正在处理”。原因是 `App.tsx` 只保存一份全局 `runState`，同时又只接收当前会话的 `run.state` 事件：会话 A 的 `running` 可以污染会话 B，而 A 在后台结束时的终态事件会被过滤。

## 修复边界

- Renderer 以 Session ID 为键保存独立 Run State。
- Bootstrap 从每条 `SessionSummary.status` 初始化对应状态。
- `run.state` 在当前会话过滤之前更新来源 Session；Timeline 仍只更新当前会话。
- 创建、发送、分享、Owner 命令恢复和删除只修改目标 Session 的状态。
- 已等待完成的命令若漏收终态事件，只把仍为 `running` 的目标降为 `unknown`；已经收到的 `completed`、`failed` 或 `cancelled` 不被覆盖。
- Growth Goal、Provider、Cline Core、数据库 Schema 和项目文件没有改动。

## 自动验收

从 `D:\CodexW\Creatx\creat1\creatx` 执行：

- `bun run typecheck`：通过。
- `bun run test:imports`：Cline Import Boundary 与 Node strip-types boundary 通过。
- `bun run test`：329/329，通过，2,960 次断言。
- `bun run build`：生产 Main、Preload 与 Renderer 构建通过。

新增状态规格覆盖：跨会话运行污染、后台终态、Bootstrap 状态映射、删除清理和终态事件漏送兜底。处理区规格覆盖 completed Session + completed Growth 不进入 active。

## 真实 Electron 只读验收

使用正式 `C:\Users\16014\AppData\Roaming\creatx` Profile 重启最新生产 Build，没有调用 Provider、发送消息、启动 Growth 或写作品文件。

正式《太衡界世界》首次打开和切到另一会话再返回后均观察到：

- `runState=completed`；
- active 处理区 0；
- completed 处理区 1；
- 页面不存在“正在处理”，存在“已处理”；
- 折叠 Worker 明细预挂载 0；
- “太衡界世界创作完成”正式 Owner 回复可见。

这证明本批修复了 Renderer 的跨会话误投影，不等同于重新运行一整本 Growth 或新的 Provider Live。
