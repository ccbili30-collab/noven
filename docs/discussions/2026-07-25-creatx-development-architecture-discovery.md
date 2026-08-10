# CreatX 开发架构与集成流程发现记录

状态：已完成本轮产品负责人复核；本文保存讨论演变，权威架构结论见 `../adr/0004-modular-runtime-and-integrated-batches.md`。

日期：2026-07-25

## 1. 讨论目标

CreatX 需要解决的不是“先建立多少文件夹”，而是怎样让长期、多 Agent（智能体）参与的开发始终保持边界明确、改动可验证、主线可恢复。

用户提出的初始路线是：

- Specification-First（规格优先）；
- Modular Monolith（模块化单体）；
- 每个任务使用独立 Branch（分支）或 Worktree（工作树）；
- `creat1` 作为唯一集成主线；
- 用仓库内文档、ADR、协议和测试保存可恢复记忆；
- 先完成一条贯穿桌面 UI、Runtime（运行时）、真实 Provider（模型服务）、文件工具、持久化和恢复的 Walking Skeleton（可运行骨架）。

目标是让后续 Agent 只需理解当前业务能力、稳定合同和对应测试即可修改，而不依赖同一个无限增长的聊天上下文。

## 2. 接受的修正

用户接受了以下架构修正：

1. 模块化单体只描述 Rust Runtime 内部组织，不代表整个桌面产品只有一个进程。Electron 主进程、Renderer（渲染层）、Rust Runtime 和可替换 Harness（智能体运行框架）仍是不同的所有权与故障边界。
2. `workspace` 不能同时指文件真相和前端工作台。Runtime 内使用 `project-files` 一类明确能力名拥有项目文件操作；Renderer 内的工作台 UI 只是这些文件的交互投影。
3. `protocol` 不是普通业务模块，而是跨语言、跨进程的稳定合同边界。Renderer 不接触 Harness 私有消息或数据库表结构。
4. SQLite 的生产写入由 Rust Runtime 单一拥有。其他进程只能通过 CreatX 命令和查询合同访问持久状态。
5. 必须显式保留 Harness Adapter（智能体框架适配层），使上游 Harness 可被验证和替换，而不把其私有对象扩散到产品代码。
6. 不先创建 `session`、`memory`、`provider` 等一批空模块。只有真实竖向链路需要某项能力时才建立其权威模块、合同和测试。
7. Memory 不进入第一条可运行骨架。第一条骨架先证明一次真实文件任务的成功、失败关闭、取消和重启恢复；长期记忆在基础会话与持久化证据成立后单独设计。
8. 一条需要隔离、审查或真实并行的实现批次对应一个 Worktree，而不是每个微小任务机械创建 Worktree。协议、数据库迁移和顶层状态机同一时间只允许一个写入所有者。
9. 第一条可运行骨架应先在单一集成批次完成。骨架稳定后，才能按互不重叠的能力拆分并行 Worktree。

## 3. 第一条真实链路

接受的最小验证路径是：

```text
Electron UI
→ CreatX 稳定命令
→ Rust Runtime
→ Harness Adapter
→ 真实 Harness 与真实 Provider
→ 受权限控制的真实文件工具
→ 修改项目真实文件
→ 持久事件返回 Renderer
→ SQLite 持久化
→ 取消、失败关闭与重启恢复
```

只有整条链使用真实 Provider、真实项目文件和真实持久化时，才能称为 Live（真实运行）。Mock（模拟）、Fixture（测试夹具）和可丢弃 Web 原型只能证明局部合同或交互。

## 4. 集成与交接

- `creat1` 始终保存最新完整集成头，不从未提交工作树创建实现 Worktree。
- 一个实现批次必须先写明目标、允许范围、非目标、验收和停止条件。
- 每个 Worktree 只拥有一个有界能力和明确文件集合。
- Agent 以可审查 Commit（提交）交接；只有集成 Agent 可以把结果合回 `creat1`。
- 合并前检查协议、数据库写入权威、测试、失败边界、文档状态和恢复入口。
- 结论进入代码、测试、ADR 和 `CONTEXT.md`，聊天记录不是交接依赖。

## 5. 本轮没有决定

- 最终 Harness 候选及其部署形态；
- Electron、Rust Runtime 与 Harness 的具体进程拓扑和生命周期监督协议；
- IPC（进程间通信）传输、Schema（数据合同）语言与类型生成工具；
- SQLite Schema、迁移库、备份与损坏恢复方案；
- 新 CreatX 代码与冻结 NovelX/OpenCode 参考源码的最终目录边界；
- 第一条骨架的具体 Provider、权限交互和 UI 视觉；
- Memory 的表结构、容量、压缩算法和检索合同。

这些项目仍需 Kernel Lab（内核实验室）、ADR 或可丢弃原型证据。它们没有因本轮接受总体架构而自动通过。
