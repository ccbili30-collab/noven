---
title: CreatX Cline Utility Process 与重型历史性能基线
doc_type: baseline
status: verified-source-and-electron
date: 2026-08-09
primary_capability: provider-harness
acceptance_ids: [ACC-PHS-002, ACC-PHS-009, ACC-PHS-014, ACC-PHS-017, ACC-PHS-018, ACC-PHS-034]
---

# CreatX Cline Utility Process 与重型历史性能基线

## 已实现

- Electron Main 不再导入或构造 Cline SDK。Main 只保留窗口、Dialog、Shell、协议和稳定 CreatX IPC Broker（进程间通信代理）。
- `ClineAdapter`、Cline Session 历史、Session Permission Store（会话权限存储）和 Live Archive Promotion（正式档案晋升）运行于独立 `utilityProcess`。
- Main 与子进程通过稳定消息合同传递命令、事件、工具调用、审批、取消、Owner 持久化回调、模型连接和图片任务状态；未跨边界暴露 Cline 私有类型。
- CreatX 工具仍在 Main 的现有 Store 上真实执行。子进程取消会中止 Main 工具；子进程退出会拒绝全部未决请求、取消 Main 工具并向 Renderer 投影明确 Runtime 错误，不重放未知副作用。
- `read_files` 项目图片具有单 Run `6 MiB` Base64 累计门禁；Provider 请求只保留当前回合最多 `4 MiB` 项目图片，旧回合项目图片替换为省略说明。直接用户图片不受该投影规则影响。
- `runtime_unavailable` 在 Provider HTTP 码识别前分类，Windows 强制退出码 `4294967295` 不再被字符串中的 `429` 误判成额度错误。

## 真实验收

### 19 MB 正式历史副本

输入为正式 Session `1786250576340_atgas` 的只读消息副本：`19,262,810` 字节、41 条消息、19 个 `read_files` 图片结果。测试使用临时 Cline 数据库、临时项目、隔离 `userData` 和本地受控 OpenAI-compatible Provider，不修改正式 Profile。

- Provider 请求体：`121,317` 字节。
- 回合前 Main Working Set：`7,180,288` 字节。
- 回合后 Main Working Set：`7,180,288` 字节，增长 `0`。
- Cline Utility Process：`273,825,792 -> 594,944,000` 字节。

结果证明重型历史内存仍真实存在于 Cline，但已从窗口主进程隔离；不能把它描述成 Cline 历史本身已经压缩或迁移。

命令：`node --experimental-transform-types packages/cline-adapter/scripts/electron-heavy-history-test.ts <messages.json>`。

### 工具、审批与崩溃

`bun run test:runtime-isolation` 真实启动 Electron，创建正式 Cline Session，通过本地受控 Provider 选择 `register_workbench`，完成跨进程工具调用、原生审批、Main Store 持久化、Tool Result 返回和最终 Assistant 回复。随后只强杀该测试实例的 Cline Utility Process：

- Electron Main 与 Renderer 继续响应。
- 下一次 AI 命令以 `runtime_unavailable` 失败关闭。
- Windows 退出码没有误分为 Provider 额度。
- 测试关闭后没有该隔离 Profile 的 Electron 残留。

一次记录为 Main `7,258,112` 字节、Utility Process `249,483,264` 字节。

### 其他验证

- Adapter + Contracts 定向：138/138，420 次断言。
- 全量：470/470，3,361 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项通过；生产 Main 构建不含 `@cline/sdk`、`ClineCore` 或 `SqliteSessionStore`。
- `bun run build`：通过，生成 `out/main/main.js` 与独立 `out/main/cline-runtime.js`。
- `bun run test:chat-image`：通过，1 次真实受控视觉请求、历史图片重载和退出无残留。
- `git diff --check`：通过。

## 未完成与风险

- 没有调用外部真实 Provider；本批 Provider 均为本地受控协议服务，不能标记为外部 Provider Live（真实运行）。
- 没有执行 Windows Installer/Portable 打包或启动打包产物。源码 Electron 与 Production Build 已通过，但 `app.asar` 内 Utility Process 启动仍需发布批次验证。
- 完整 `test:desktop` 在 Runtime 场景前因现有默认 Chat 布局与旧测试的 Paper Workspace 断言不一致而停止；页面错误、控制台错误和请求失败均为空。该失败不属于本批 Runtime，但完整 Desktop 不能标记通过。
- Cline Utility Process 在重型历史回合后仍约 `595 MB`；本批目标是保护窗口响应，不是压缩或迁移既有 Cline 权威历史。旧会话文件没有被重写。
- 原现场 `3,691` 句柄的精确类型尚未取得关闭前栈证据。当前多批 Worker 隔离证据排除了通用 stop 泄漏主因，但不等于所有句柄来源都已解释。
- Utility Process 崩溃后当前版本失败关闭，不自动重启。自动恢复会涉及未知工具副作用和活动 Run 语义，需要独立产品与架构批次。
- 强杀测试发生在跨进程工具完成后；活动 Main 工具执行中同时强杀子进程的真实 Electron 时序尚未单独自动化。源码合同会取消 Main 工具，但 `ACC-PHS-017` 的这一子项仍只算部分验证。

## 恢复入口

从 `creatx/apps/desktop/src/cline-runtime-client.ts`、`creatx/apps/desktop/src/cline-runtime.ts`、`creatx/packages/cline-adapter/src/provider-media-budget.ts` 和 `PHS-009 / PHS-025 / ACC-PHS-017 / ACC-PHS-034` 继续。发布前必须验证打包后的 Utility Process 入口、退出无残留和 19 MB 隔离 Profile。
