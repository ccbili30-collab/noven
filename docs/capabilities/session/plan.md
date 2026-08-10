---
title: Session 实现路线
doc_type: capability-plan
owner: session
status: s2-live-default-free-next
last_verified: 2026-07-28
source_of_truth: docs/capabilities/session/product-spec.md
---

# Session 实现路线

本文把 Session（会话）能力拆成 Cline 上的可安排批次。S1 与 S2 的基础项目会话范围已由提交 `c9a4ae4` 完成；其他阶段没有完成声明。历史总计划已归档，当前状态以本能力线与 `CONTEXT.md` 为准。

2026-07-26 起，第一版只实施 Harness 原生基础会话。S4 至 S7 全部进入未来 Backlog（待办），S0 中只为特殊会话存在的问题不再阻塞 S2，也不阻塞创作 Skill、图片和工作台。

## 当前目标

让后续 AI 能从产品规则和验收项反推出一个有界开发批次，而不重新阅读整段聊天记录。

## 依赖顺序

```text
S1 Cline 会话配置与 CreatX 合同
  ↓
S2 Walking Skeleton 中的基础项目会话
  ↓
S2.5 默认自由与审批/自由切换
  ↓
S3 多个人会话与普通恢复
  ↓
S4 完整复制转移
  ↓
S5 压缩继承
  ↓
S6 多侧聊、冷却与精炼回传
  ↓
S7 搜索、导出与导入合同
```

Memory（记忆）不进入第一条 Walking Skeleton（可运行骨架）；因此 S5 必须晚于基础会话、Provider、持久化、取消和恢复证据。

## S1：Cline 会话合同

输出：Session 到 Cline Adapter 的配置合同、稳定会话投影和错误分类。

必须定义：

- 个人会话和项目会话的稳定产品身份与 Cline Session ID 映射。
- Cline 是消息与执行事实权威，CreatX 不复制会话 SQLite。
- 个人会话关闭文件、命令、浏览器和项目工具。
- 项目会话传入授权 `cwd` 与 `workspaceRoot`。
- 创建、运行、等待、取消、失败、删除和结果未知投影。
- Provider、网络、协议、权限、持久化和应用错误码。
- 隐私删除、审计、备份与迁移规则。

停止条件：需要修改 Cline Core、个人会话仍可产生项目副作用，或产品模块必须读取 Cline 私有类型。

## S2：基础项目会话 Walking Skeleton

范围：只实现架构验证所需的一条项目会话，不实现继承、完整复制、侧聊或长期记忆。

真实链路：

```text
CreatX UI 合同
→ 创建或打开项目会话
→ Cline Adapter
→ 真实 Provider（模型服务）回合
→ 受权限控制的真实文件操作
→ Cline 事件转换后返回 UI
→ 取消、失败关闭与已完成历史恢复
```

历史验收：旧版 ACC-SES-004 的逐次审批、ACC-SES-003、ACC-SES-005，以及 Walking Skeleton 的跨能力验收。ADR-0009 后的新 ACC-SES-004 不由该历史批次覆盖。

## S2.5：默认自由与审批/自由切换

范围：新会话默认自由、审批/自由直接切换、完整 Act 工具集与 Skills 保留、wildcard auto-approve、个人会话项目工具继续关闭，以及全机信任边界投影。不实现四档权限，不切换到 Cline `yolo` Agent Tool Preset。

主要验收：ACC-SES-004、ACC-SES-006 至 ACC-SES-009、ACC-PHS-020 和 ACC-CSK-315。该批次属于 Dynamic Growth 实施计划 Task 5，在 Growth 调度器基本合同之后串行接入。

状态：Runtime、持久化、Main/Preload IPC 和策略合同已于 2026-07-28 验证；Renderer 可见控件与真实 Provider 自由工具运行未完成，因此上述验收 ID 仍是部分证据。

## S3：多个人会话

范围：多条个人会话、无项目工具边界、切换状态保持和普通重启恢复。

主要验收：ACC-SES-001、ACC-SES-002、ACC-SES-005；权限模式使用已经完成的 S2.5 合同。

## S4：完整复制转移

前置：SES-205 的隐私与数据兼容决策完成，ADR-0003 接受或被替代。

范围：用户选择项目、完整可见前缀、来源与分叉点、项目工具切换和分叉后独立。

主要验收：ACC-SES-201 至 ACC-SES-205。

## S5：压缩继承

前置：真实 Provider、压缩任务取消与恢复、Memory Provider 合同、原子持久化和错误分类成立。

范围：允许方向、隐藏静态快照、原子创建、失败关闭和删除联动。

主要验收：ACC-SES-101 至 ACC-SES-110。

## S6：多侧聊

前置：会话并发所有权、文件冲突、审批、后台任务、持久计时和永久删除机制成立。

建议拆成三个竖向批次：

1. 冻结分支、多侧聊并存、独立默认权限和消息路由。
2. 冷却、主动结束、删除但保留项目事实。
3. 精炼回传、用户确认、原子持久化和幂等终态。

主要验收：ACC-SES-301 至 ACC-SES-315。

## S7：搜索、导出与导入合同

前置：会话持久化、删除语义、项目包格式、隐私边界和导入隔离成立。

范围：严格历史搜索作用域、会话勾选导出、私人复制前缀二次授权、普通分享内容清理和导入历史降权。

主要验收：ACC-SES-501 至 ACC-SES-511。`.np` 实际打包与导入由 `import-export` 主导，Session 提供案例标记、净化投影和新会话创建边界。

## 每个实现批次的任务模板

开始前填写：

| 字段 | 要求 |
| --- | --- |
| 目标规则 | 明确列出 `SES-*` |
| 验收 | 明确列出 `ACC-SES-*` |
| 主要能力线 | `session` |
| 相邻合同 | 只列本批次实际触及的 permissions、memory、agent-runtime、project-files 或 workspace-ui |
| 允许修改 | 明确目录和唯一写入所有者 |
| 非目标 | 写明不会顺手实现的后续 Session 能力 |
| 失败边界 | Provider、权限、协议、持久化和应用错误分别列出 |
| Live 要求 | 是否需要真实 Provider、真实文件、重启或进程强杀 |
| 停止条件 | 产品语义、协议、数据兼容或权限边界需要改变时停止 |

## 当前下一入口

S1 与 S2 已完成。当前下一入口不是 S3，而是 `../../plans/2026-07-28-dynamic-growth-goal.md` 中串行安排的 S2.5；S4 至 S7 只有在核心创作体验跑通且用户重新排期后才恢复。
