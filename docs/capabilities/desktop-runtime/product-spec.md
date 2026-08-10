---
title: Desktop Runtime 产品规格
doc_type: capability-spec
owner: desktop-runtime
status: accepted
last_verified: 2026-08-11
source_of_truth: docs/capabilities/desktop-runtime/product-spec.md
---

# Desktop Runtime 产品规格

## DRT-001 前台进程所有权

Electron Main 拥有窗口、稳定 IPC（进程间通信）Broker（代理）、应用级工具与退出编排；Cline Adapter、Session（会话）、权限与历史运行在受监督 Utility Process。Renderer 不得直接控制子进程。

## DRT-002 单实例与干净退出

同一 Profile（配置目录）只允许一个主实例。正常退出必须停止接收新命令，暂停或取消活动 Growth，停止图片队列，释放 Utility Process 与持久 Store，并在截止时间后失败关闭，不能留下失管进程。

## DRT-003 用户主动整应用重启

“恢复诺文”必须调用 Electron 整应用 Relaunch（重新启动），不能只执行 Renderer Reload（界面重载）或只重启 Utility Process。请求必须幂等；一旦安排重启，重复请求不能安排第二个实例。

## DRT-004 活动工作确认

Main 在执行重启前重新读取自己的活动工作事实。存在活动普通会话/工具、Owner Growth、活动 Growth Goal 或正在生成的图片时，未确认请求只返回 `confirmation_required`，不得退出。用户确认后才进入既有干净退出链。排队但尚未生成的持久图片不单独阻塞重启。

## DRT-005 失败关闭与禁止自动重放

重启使活动 Run 停止，生成中图片进入既有 `interrupted` 语义，Growth 进入既有退出暂停/取消链。重启后不得自动重发用户消息、Provider 请求或工具调用；用户可在恢复的会话中显式发送新的“继续”。

## DRT-006 视图恢复

Renderer 可为一次用户主动重启保存当前 `projectId + sessionId` 视图偏好。下一次 Bootstrap（启动装载）只在该 Session 仍存在且仍属于该项目时采用，并在成功读取后清除；无效、损坏、已删除或无法解析的偏好必须清除并回退正常启动，不得伪造项目或会话。

## DRT-007 明确非承诺

“恢复诺文”是人工恢复入口，不代表 `EMFILE`、网络故障或其他根因已修复，也不提供后台继续、自动崩溃恢复、精确活动 Run 续接或 Exactly Once（严格一次）副作用恢复。
