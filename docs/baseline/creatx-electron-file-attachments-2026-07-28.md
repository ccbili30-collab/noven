---
title: CreatX Electron 外部附件纵向证据
doc_type: baseline-evidence
status: electron-verified-provider-live-pending
last_verified: 2026-07-28
source_of_truth: docs/plans/2026-07-28-frontend-electron-interface-handoff.md
---

# CreatX Electron 外部附件纵向证据

## 已验证范围

前端交接 Task 3 已把外部文件引用接入同一条生产链：

```text
Electron 原生文件选择器
→ Main 进程内短期授权 ID
→ Renderer 只发送 ID
→ Main 重新检查路径、大小和修改时间
→ Cline Adapter userFiles
→ Cline 消息历史附件块
→ Renderer 历史链接
→ Main 从 Cline 历史解析后调用系统打开
```

没有通用 `readLocalFile(path)` 或 `openPath(path)` IPC，没有把附件复制进项目或 CreatX 消息数据库。普通发送和 Steer 使用同一 `SendMessageCommand`。`MessageProjection.attachments` 只来自 Cline 消息。

## 自动验收

在 Windows、Bun `1.3.14`、Electron `42` 上执行：

- `bun test`：`86/86` 通过，`247` 个断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：通过。
- `bun run build`：通过；保留仓库既有 `@tsconfig/bun/tsconfig.json` 构建警告。
- `bun run test:desktop`：通过，真实启动生产 Main/Preload/Renderer，覆盖选择取消、多选、移除、历史恢复、受控打开、伪造 ID、选择后文件变化、三个视口、退出与重启。

单元与 Runtime（运行时）测试还覆盖过期、重复、缺失、目录和不可读输入；伪造或变化授权在 `run.state` 产生前失败，未进入 Provider（模型服务）调用。真实 Windows 中文路径文件已通过 Cline Core 和 SQLite 读取，文件内容未复制到项目或 Cline 数据目录。

视觉证据为 `artifacts/walking-skeleton/desktop-attachments.png`。两个附件 Chip（紧凑文件标签）、移除按钮和输入区在 `1360×860` 无重叠；通用桌面探针继续覆盖 `900×700` 与 `860×620` 无页面溢出。

## 证据边界

Adapter 内容测试的远端响应使用确定性 Provider 替身；Electron 探针使用明确无效的 DeepSeek 凭据验证失败关闭。因此本批是 Runtime 与 Electron 集成证据，不是有效 Provider 附件 Live。

附件授权只在当前 Electron Main 进程存活，默认十五分钟后过期，并在发送进入 Cline 消息接纳边界时消费。应用退出后未发送的选择不会恢复。

`/growth` 的 Goal/Scheduler 当前不能持久化临时附件输入。显式 `/growth` 携带附件会返回 `attachment_invalid`；普通发送和运行中的 Steer 已支持附件。该限制必须在未来 Growth 输入快照设计完成前保持失败关闭。

## 恢复入口

下一批按 `docs/plans/2026-07-28-frontend-electron-interface-handoff.md` Task 4 建立 `project-memo` 能力合同和 Runtime。不要把 Prototype `data-command` 当 IPC，也不要在 Renderer 增加绝对路径操作接口。
