---
title: Provider Harness 实现路线
doc_type: capability-plan
owner: provider-harness
status: utility-process-resource-gate-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/provider-harness/product-spec.md
---

# Provider Harness 实现路线

实现提交 `c9a4ae4` 已完成 P0 至 P5 的第一骨架范围。共享接口提交 `f289dd3` 在 P3/P4 边界补充了中立 Tool Contribution Port；注册工作台纵向批次又验证了真实 Provider 调用 CreatX 工具。P6 以及 `acceptance.md` 中仍标记为部分通过或未通过声明的场景继续是后续任务。

`../../plans/2026-07-27-register-workbench-vertical-slice.md` 已完成真实 `register_workbench` 调用、项目 ID 注入、原生审批拒绝/批准和真实结果返回。后续不重复该验收；下一 Adapter 任务必须来自仍未通过的具体 `ACC-PHS-*`。

## 依赖顺序

```text
P0 固定来源与合同
  ↓
P1 Cline Adapter 最小生命周期
  ↓
P2 Session 配置与权限边界
  ↓
P3 稳定事件和错误投影
  ↓
P4 真实 Cline 文件工具
  ↓
P5 Electron 前台集成
  ↓
P6 升级与资源门禁
```

## P0 固定来源与合同

- 固定 `@cline/core@0.0.65` 和 `@cline/sdk@0.0.65`；
- 保存官方 Tag、Commit、npm integrity 和本地基线；
- 定义 CreatX Adapter 命令、事件和错误，不复制全部 Cline Schema；
- 建立静态依赖规则，禁止产品包导入 Cline。

## P1 Cline Adapter 生命周期

- 创建、健康检查、列历史和 Dispose；
- 使用测试专属数据目录；
- 验证 Windows 中文、空格和长路径；
- 验证正常退出无残留进程。

## P2 Session 配置

- 个人会话关闭项目副作用工具；
- 项目会话显式绑定项目工作目录，但不把它描述成沙箱；
- 使用 Cline 原生 Tool Policy 实现审批/自由两种直接模式，不实现四档；
- 审批模式在副作用前确认，自由模式保持完整 Act 与 Skills 并自动批准已启用工具；
- 两种模式都说明文件或 Shell 工具属于全机信任边界，不把 `yolo` Agent Tool Preset 冒充保留完整 Act 工具集的自由模式。

## P3 事件与错误

- 只投影 CreatX UI 必须使用的稳定字段；
- 为未知事件、Provider、工具、权限、持久化和程序错误建立分类；
- 覆盖流式、等待、完成、失败、取消和结果未知；
- 断言产品包不读取 Cline 私有事件。

## P4 真实文件工具

- 使用 Cline 已有文件工具完成第一条真实写入，不为骨架新增 Plugin；
- 工具经原生审批后写入一个真实 Markdown 文件；
- 工具等待落盘并返回真实结果；
- 工作台投影读取同一文件；
- 用户修改后让 Agent 重新读取并继续。

## P5 Electron 前台

- 受监督 Utility Process 拥有 Cline 生命周期，Main 只拥有窗口和稳定 IPC Broker；
- Renderer 只通过 Preload/IPC 使用 CreatX 合同；
- 生产 Renderer 在同一骨架批次接入；Web Prototype 只提供审查后的表现层证据；
- 关闭窗口和退出应用不留下 Cline 或工具进程；子进程崩溃时窗口存活并失败关闭，不重放未知副作用。

## P6 版本治理

- 记录启动时间、空闲内存、活动会话内存和句柄；
- 建立固定版本合同测试；
- 在独立 Worktree 试升一个候选版本；
- 不兼容时拒绝升级，不添加永久兼容垫片。

当前恢复入口、文件和验证命令见本能力线规格、验收矩阵与 `CONTEXT.md`。
