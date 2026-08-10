---
title: Session 能力线入口
doc_type: capability-entry
owner: session
status: owner-history-and-worker-retention-verified
last_verified: 2026-08-08
source_of_truth: docs/capabilities/session/product-spec.md
---

# Session（会话）能力线

本能力线回答：CreatX 有哪些会话、它们如何创建和结束、上下文怎样继承或复制、侧聊怎样分支和回传，以及这些行为如何验收。

它不是当前冻结 NovelX/OpenCode `SessionV2` 的新设计，也不证明 Cline 会话已经接入 CreatX。

## 第一版范围修正

第一版使用 Cline 已有的普通新建、历史、项目工作上下文和用户发起的新“继续”回合，并由 Session 配置关闭个人会话的项目工具。新项目会话默认自由，Main/Preload 已支持审批/自由切换和 SQLite 持久化；Renderer 已显示两档切换与全机信任边界。两种模式下项目目录都不是沙箱，文件或 Shell 工具属于全机信任边界。压缩继承、完整复制转移、十分钟侧聊、精炼回传、会话家族和自定义四档权限继续延期。

## AI 任务路由

以下任务首先进入本能力线：

- 新建、继续、删除、分支或恢复个人会话与项目会话。
- 新会话从旧会话进行隐藏压缩继承。
- 当前个人会话完整复制转移到项目。
- 侧聊的创建、并存、冷却、关闭、回传与来源关系。
- 会话家族、会话级权限隔离和会话级状态恢复。
- 会话历史、来源关系和用户可见失败语义。

以下任务不由本能力线独立决定：

| 相邻能力 | 对方拥有 | Session 只拥有 |
| --- | --- | --- |
| `personal-ai` | 旅鸽身份、人格和跨会话关系连续性 | 哪类会话面对同一个个人 AI |
| `memory` | 长期记忆、项目记忆、蒸馏、容量和来源治理 | 继承快照何时生成、附着和删除 |
| `permissions` | Harness Tool Policy；未来可选的四档和 Change Set | Session 拥有审批/自由的默认值与切换，底层复用 Cline Tool Policy |
| `workspace-ui` | 会话列表、响应式布局和未来侧聊面板 | UI 必须投影的会话状态与动作结果；第一骨架隐藏侧聊 |
| `agent-runtime` | Cline Provider 调用、工具任务、取消、并发与当前进程投影 | 哪个任务属于哪条会话及用户可见终态 |
| `project-files` | 文件副作用、锁、版本、回收站和撤销 | 删除侧聊不自动回滚已生效项目事实 |

## 阅读顺序

1. `product-spec.md`：已确认规则、边界和开放问题。
2. `acceptance.md`：未来实现必须满足的用户可观察场景。
3. `plan.md`：从当前文档状态到真实实现的批次顺序。
4. `../../adr/0003-main-session-forks-into-project.md`：完整复制转移的草案架构与隐私风险。
5. `../../discussions/2026-07-25-personal-ai-session-memory-discovery.md`：原始讨论、纠正和方案演变。

## 当前状态

| 层次 | 状态 |
| --- | --- |
| 产品语义 | 首轮已从讨论记录提升；仍有明确开放问题 |
| 架构 | Cline 基础会话所有权已接受；特殊会话 ADR-0003 仍为草案 |
| 协议 | Session kind/mode、权限 Projection 与 Desktop 切换命令已实现 |
| 数据模型 | 最小 Session 权限 SQLite 已实现；不复制 Cline 消息或 Run |
| Runtime | 默认自由、两档 Tool Policy 和持久切换已实现；特殊会话未实现 |
| UI | 生产 Electron 主会话、历史、输入和新“继续”回合已接通 |
| 自动验收 | `ACC-SES-003`、`005` 有连续 Live；`ACC-SES-017` 至 `019` 已由真实 Cline SQLite、受控目录与故障重放测试验证；两档 Runtime、IPC、可见控件和策略合同已验证，但 `ACC-SES-006` 至 `009` 仍缺真实 Provider 在自由/审批切换后的工具运行矩阵 |

## 修改规则

- 修改会话行为时先更新 `product-spec.md` 的现有规则编号，不为同一语义新增近义规则。
- 产品规则改变后同步更新 `acceptance.md`；架构、协议和代码只有在对应门禁通过后才能跟进。
- 从讨论记录发现的新含义先追加到新的发现记录，再决定是否提升到本能力线。
- 不把旧 NovelX/OpenCode 会话代码的现状写成新 CreatX 产品规则。
