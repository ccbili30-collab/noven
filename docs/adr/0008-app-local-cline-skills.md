# ADR-0008：内置 Creative Skills 使用应用本地 Cline 原生目录

## Status

Accepted

日期：2026-07-27

部分取代说明（2026-07-28）：ADR-0009 取代本文要求 `editor`、`run_commands` 和 `register_workbench` 在所有第一版会话中逐次审批的部分。应用本地 Skill 目录、允许列表、渐进加载和不修改 Cline Core 的决策继续有效；工具现在按 Session 的审批/自由模式执行。

## Context

CreatX 需要让每个项目会话知道工作台的稳定规则，并在小说等具体创作任务中按需加载领域教程。把全部教程放入 System Prompt（系统提示词）会持续占用上下文；把 Skill 写进用户项目或全局 `~/.cline/skills` 会污染用户内容或与其他 Cline 客户端争夺配置。重新实现 Skill Registry（技能注册表）则会形成第二套 Harness（智能体运行框架）语义。

Cline SDK `0.0.65` 公开提供 `createUserInstructionConfigService`、显式 Skill 目录、`configExtensions: ["skills"]`、`config.skills` 允许列表和原生 `skills` 工具。

## Decision

- CreatX 内置 Skill 由 `@creatx/creative-skills` 以 UTF-8 `SKILL.md` 保存到 Electron `userData/creative-skills/<version>/<skill>/SKILL.md`。
- 项目目录和全局 Cline Skill 目录不保存 CreatX 内置 Skill。
- 只有 `@creatx/cline-adapter` 调用 Cline 公开配置服务；Renderer 不接触 Cline 类型或 Skill 文件路径。
- Adapter 启动时显式验证允许列表至少发现一个 Skill；缺失或损坏时失败关闭，不静默退回无 Skill 会话。
- Cline 原生 `skills` 是只读加载工具，可以自动批准。原决定要求 `editor`、`run_commands` 和 `register_workbench` 逐次审批；ADR-0009 已将当前目标改为按 Session 的审批/自由 Tool Policy（工具策略）执行。
- 基础 Prompt 只包含工作台不变量和“匹配领域时先加载 Skill”；小说目录结构与写作方法只存在于小说 Skill。
- Adapter 退出时停止配置服务；恢复的 Session 使用同一目录和允许列表。
- 第一版保留普通 Cline Shell。模型可以申请目录检查或目标目录创建，用户根据全机信任提示批准或拒绝；不为首个小说 Skill 增加意图路由器、受限查询 Runtime 或全局 Shell 禁用。

## Consequences

### Positive

- 复用固定 Cline 的渐进加载、工具事件和会话语义，没有第二套 Skill Runtime。
- 内置教程可随应用版本原子替换，不污染正式项目内容。
- 基础 Prompt 保持短小，后续领域 Skill 可以独立演进和测试。
- Skill 缺失在启动期可见，不会产生“工具看似存在但模型永远无法加载”的假实现。

### Negative

- `skills` 是否被模型首先调用仍是概率性模型行为，Prompt 不能提供确定性路由保证。
- 保留普通 Shell 意味着自然语言创作可能出现额外审批，且自由 Shell 不能由无人值守测试无条件批准。
- 当前没有 Skill 更新迁移、用户自定义、市场、可见管理 UI 或跨版本会话一致性保证。

## Alternatives Considered

### 把全部教程加入 System Prompt

拒绝。它会让所有会话永久承担小说、世界观、漫画等无关上下文。

### 写入项目 `.cline/skills`

拒绝。内置产品行为不应成为用户项目内容，也不应要求用户理解或维护 Cline 配置文件。

### 写入全局 `~/.cline/skills`

拒绝。它会影响其他 Cline 客户端，并产生跨应用所有权和更新冲突。

### 自建 Skill Runtime 或修改 Cline Core

拒绝。公开 SDK 已提供所需边界，第二 Runtime 或 Core Patch（核心补丁）会增加维护和迁移风险。

## References

- `docs/discussions/2026-07-27-workbench-core-guidance-discovery.md`
- `docs/capabilities/creative-skills/product-spec.md`
- `docs/adr/0005-cline-is-the-sole-agent-harness.md`
- `creatx/packages/creative-skills/src/index.ts`
- `creatx/packages/cline-adapter/src/index.ts`
