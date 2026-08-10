# ADR-0004：采用能力边界与竖向集成批次

## Status

Superseded in Part by ADR-0005

ADR-0005 已取代本文关于“Rust Runtime 拥有全部会话、Run、权限、文件副作用、持久事件和唯一 SQLite”以及“最终 Harness 尚未选择”的部分。当前 Cline/CreatX 事实所有权、原生权限和第一条骨架的进程默认均以 ADR-0005 为准；本文只继续拥有按完整能力组织、稳定合同、单一规则权威、先完成单一竖向骨架再拆 Worktree 的决定。

日期：2026-07-25

## Context

CreatX 将长期包含桌面界面、会话、Agent（智能体）执行、权限、项目文件、Provider（模型服务）、持久化和记忆等能力，并主要由 AI 辅助维护。主要风险是业务规则散落、跨语言合同重复、数据库被多个进程直接写入、上游 Harness（智能体运行框架）私有状态渗入前端，以及大量未验证模块同时增长。

单纯把所有代码写成一个应用会混淆进程所有权；提前使用微服务又会引入部署、网络、版本和故障协调成本。为未来能力预先创建大量空接口和空模块也不能证明边界正确。

因此需要先固定难以修改的所有权与集成规则，再由一条真实竖向链路验证架构。

## Decision

### 系统边界

- CreatX 桌面产品具有不同所有权边界，但第一条骨架不为未来隔离预先增加多进程通信。
- Electron 主进程拥有桌面窗口和应用生命周期；Renderer（渲染层）拥有交互投影和临时视图状态；Cline 拥有 Agent 执行事实和自身持久化；CreatX 能力拥有项目文件、工作台、图片和用户设置等产品事实；Cline Adapter（智能体框架适配层）隔离上游私有协议。第一条骨架先在 Electron 主进程内运行 Cline，真实验证失败后才引入受监督子进程。
- Renderer 只能通过稳定 CreatX 命令、查询和事件合同访问 Runtime，不得读取 Harness 私有消息或持久化 Schema（数据合同）。
- 跨边界 Protocol（协议）只有一个权威来源；TypeScript、Rust 或其他语言的类型必须由该权威生成或验证，不能手工维护等价合同。
- 每份持久数据只有一个声明写入所有者。Cline SQLite 不被 CreatX 镜像或直接更新；CreatX 产品存储也不能反向驱动 Cline 执行。
- 项目真实文件继续遵守 ADR-0002，是内容真相；Renderer 工作台只投影同一批真实文件。

### Runtime 组织

- CreatX 生产代码按完整业务能力组织，而不是采用微服务或 `utils`、`services`、`managers` 等模糊技术分层。Rust 不再是第一版前置；后续只有明确原生能力需要时才引入。
- 候选能力包括 session、agent-runtime、permissions、project-files、provider 和后续 memory；它们只在真实链路需要时建立，不预先创建空壳。
- `protocol` 是跨边界合同，`desktop` 和工作台 UI 是进程或呈现边界，`harness-adapter` 是替换边界；它们不伪装成普通领域模块。
- 一个业务规则只能有一个权威实现。接口只建立在真实所有权、故障隔离或可替换边界。

### 实现与集成

- 第一条实现是单一竖向 Walking Skeleton（可运行骨架）：真实 Electron Renderer → Main/Preload → Cline Adapter → 固定 Cline/真实 Provider（模型服务）→ Cline 原生审批 → 一个真实文件工具 → 同一文件返回文件/预览界面 → 取消、失败关闭 → 重启后读取已保存历史并由用户发送新的“继续”回合。
- 第一条骨架不建立 CreatX 会话/Run 数据库、持久 UI 投影、严格项目沙箱、四档权限、活动 Run 自动续跑或严格一次副作用恢复。
- Memory（记忆）不进入第一条骨架；它在基础会话、持久化和恢复链路成立后作为独立批次设计。
- 第一条骨架在单一集成分支中完成，不预先拆成多个互相等待的 Worktree（工作树）。
- 后续一条需要隔离或真实并行的实现批次对应一个 Branch（分支）和 Worktree。微小改动不机械创建 Worktree。
- 协议、数据库迁移和顶层状态机同一时间只有一个 Agent 写入所有者。只有集成 Agent 将审查通过的 Commit（提交）合回 `creat1`。
- `creat1` 始终保留最新完整集成头；未提交的产品共识不能作为新 Worktree 的起点。

## Consequences

### Positive

- AI 可以围绕一个完整能力及其合同和测试工作，减少跨仓库理解和误改范围。
- Renderer、Runtime 和 Harness 的故障与替换边界明确，上游私有协议不会成为产品合同。
- 每份数据的单一写入者减少双会话、双 Run 和双事件权威。
- 真实竖向骨架能尽早证伪 Electron、Cline、审批、持久历史、取消和前端合同。
- Worktree 只用于有实际隔离收益的批次，避免协调成本超过并行收益。

### Negative

- Cline `0.0.65` 仍是实验性依赖；同进程运行可能影响 Electron 主进程响应、内存和异常隔离，必须由骨架实测。
- 延后严格项目沙箱意味着用户批准 Cline 文件或 Shell 工具后，该次调用属于全机信任边界。
- 活动 Run 在退出或崩溃时停止，第一版只支持从已保存历史开启新的继续回合。
- Memory 延后意味着第一条骨架不能代表完整个人 AI 体验。

### Neutral

- 本决策不选择最终 IPC 字段、Schema 工具、CreatX 产品存储方案或目录布局。
- 本决策不表示产品基线和架构基线已经全部通过，也不解除生产功能代码门禁。
- 模块名称是责任边界示例，最终目录名可在不改变所有权的情况下由代码边界设计确定。

## Alternatives Considered

- 长期把 Renderer、桌面生命周期、Agent 和全部产品数据视为同一所有权：拒绝，因为它们具有不同权限、事实来源与故障边界。第一条骨架仍可在 Electron 主进程内直接运行 Cline，以真实证据决定是否需要进一步进程隔离。
- 第一版采用微服务：拒绝，因为当前团队规模、部署目标和证据不支持分布式系统成本。
- Renderer 或 CreatX 产品模块直接读写 Cline SQLite：拒绝，因为会产生多个写入权威并把 Cline 持久模型暴露给产品层。由 Electron 主进程内的 Cline Adapter 构造并持有 Cline Store 不违反该边界。
- 直接围绕一个 Harness 的私有会话对象构建产品：拒绝，因为会绑定前端、数据和迁移路径。
- 先生成所有未来模块和接口：拒绝，因为空边界没有运行证据，容易固化错误抽象。
- 每个微小任务都创建 Worktree：拒绝，因为协调、重复读取和合并成本可能超过隔离收益。
- 第一条骨架同时实现长期记忆：拒绝，因为会扩大验证面，掩盖基础会话、权限和恢复边界的问题。

## References

- `docs/discussions/2026-07-25-creatx-development-architecture-discovery.md`
- `docs/product/creatx-product-understanding.md`
- `docs/adr/0002-project-files-are-the-content-model.md`
- `docs/discussions/2026-07-24-creatx-agent-harness-investigation-report.md`
- `AGENTS.md`
