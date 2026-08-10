---
title: Cline 重型图片历史卡顿诊断
doc_type: discussion
status: resolved-and-promoted
date: 2026-08-09
primary_capability: provider-harness
adjacent_capabilities: [growth-runtime, desktop-runtime]
---

# Cline 重型图片历史卡顿诊断

## 用户现场

Windows `0.1.16 Portable` 在《赫尔墨斯环城》长会话中出现 `AppHangB1`。关闭前 CreatX 总工作集约 `1.93 GB`；Electron Main Process（主进程）PID `56676` 的 Working Set（工作集）约 `1.46 GB`、Private Memory（私有内存）约 `1.81 GB`、句柄 `3,691`。

正式 Owner Session `1786250576340_atgas` 的消息文件为 `19,262,810` 字节，共 41 条消息。19 个 `read_files` 图片结果把约 `19.15 MB` 不重复 Base64 持久写入 Cline 历史。

## 可复现差分

| 历史 | Provider 请求体 | Run 后 RSS |
| --- | ---: | ---: |
| 原始图片历史 | 约 `8.33 MB` | 约 `830 MB` |
| 移除图片结果 | 约 `98 KB` | 约 `378 MB` |

5 批、每批 3 个 Worker 的 start/send/stop 隔离循环从约 `310 MB / 332 handles` 到约 `325 MB / 332 handles`，Dispose 后约 `319 MB / 289 handles`。Cline `core.stop()` 也会从活跃 Session Map 删除对象。因此通用 Worker stop 泄漏不是主因。

## 根因

1. `read_files` 把完整项目图片 Base64 当作永久 Tool Result 写入长会话。
2. Cline 恢复与运行时持有、转换和复制整份历史。
3. Cline、Growth Scheduler 和 UI IPC 同处 Electron Main；重型历史的内存峰值和垃圾回收直接影响窗口事件循环。
4. 三 Worker 并发放大压力，但不是根因。

句柄 `3,691` 的精确组成在软件关闭前没有取得栈证据，仍属未验证；这不改变由隔离差分确认的内存根因。

## 被否决的单独修复

只限制 Provider 请求投影不能永久解决窗口卡死。即使旧回合 `read_files` 图片不再发给 Provider，请求体降到约 `100,919` 字节，原同进程 Runtime 在 Provider 调用时仍约 `705 MB`，Run 后约 `845 MB`，因为 Cline Session 继续持有原始历史。

因此图片预算只作为防止新历史继续膨胀的第二道保护；永久主修复必须执行 ADR-0005 已规定的进程隔离门禁。

## 已晋升结论

- `PHS-009`：Cline Adapter、Cline Session、权限存储和 Cline 归档恢复进入受监督 Electron Utility Process（工具子进程）。
- `PHS-025`：旧回合项目图片不再进入后续 Provider 请求；当前回合有界保留，直接用户图片不被该规则改写；单 Run 累计读取超限失败关闭。
- `ACC-PHS-017`：子进程崩溃时窗口继续响应，未决请求失败关闭，Main 侧工具取消，不自动重放未知副作用。
- `ACC-PHS-034`：以真实 19 MB 历史副本验证 Main 内存与 Provider 请求预算。

实现与验收见 `docs/baseline/creatx-cline-runtime-isolation-2026-08-09.md`。
