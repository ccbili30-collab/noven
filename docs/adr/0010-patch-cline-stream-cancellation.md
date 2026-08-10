# ADR-0010：固定补丁修复 Cline 流取消泄漏

## Status

Accepted

日期：2026-08-06

## Context

CreatX 固定使用 Cline SDK `0.0.65` 作为唯一 Agent Harness（智能体运行框架）。真实关闭测试发现：Provider（模型服务）尚未输出任何内容时调用公开 `abort` 或 `stop`，Cline 内部的 AI SDK 流会产生未处理的 `AgentRuntimeAbortError`，使 Electron 或测试进程可能崩溃，并阻止 Session Runtime（会话运行时）及时释放项目目录。

最小复现确认 AI SDK `6.0.235` 的流结果有 24 个 Promise（异步结果）getter 位于原型上；`@cline/llms 0.0.65` 的 `suppressDanglingStreamPromises` 只遍历实例自身字段，不能观察这些拒绝。进一步通过 Node Promise Hook（异步结果追踪）定位到 `emitAiSdkEvents`：它先以 `stream.usage` 作条件判断，再次读取并等待 `stream.usage`，同一 getter 产生两个 Promise，而第一个从未被等待。Adapter 只能调用公开 `abort`、`stop` 和 `dispose`，无法访问该流对象，因此不能在 CreatX 业务代码内正确补救。

## Decision

- 保持 ADR-0005 的唯一 Cline Harness、Cline 会话权威和 Adapter 边界不变。
- 对精确版本 `@cline/llms 0.0.65` 应用一个安装期、失败关闭的补丁：保护函数同时遍历流对象自身字段和直接原型字段，并只为 Promise 附加无副作用的拒绝观察器；`stream.usage` getter 只读取一次，并等待该次读取返回的同一个 Promise。
- 补丁脚本必须先验证包版本和原始代码唯一匹配；版本或代码形态变化时安装失败，不得静默跳过。
- 补丁不得改变 Provider 输出、工具调用、消息历史、取消终态或重试语义。原始调用者仍接收同一运行结果；补丁只阻止 AI SDK 的附属延迟 Promise 成为未处理拒绝。
- Adapter 关闭仍使用公开生命周期：请求 `abort`，等待在途 Turn，调用 `stop` 释放对应 Session，最后调用全局 `dispose`。

## Verification

- 受控零输出 Provider 必须在活动普通 Owner Turn 中被取消，Adapter `dispose` 正常完成，Turn 收束且临时数据目录与项目目录可删除。
- 既有普通对话、Growth Worker、附件、投影和持久历史测试必须继续通过。
- 安装后再次运行补丁脚本必须幂等。

## Removal

升级 Cline 前先运行同一零输出取消测试。只有上游实现已覆盖原型 getter 且测试通过，才删除补丁和本 ADR 的运行约束；不得把补丁带到未经验证的新版本。
