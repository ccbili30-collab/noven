# ADR-0001：Story Growth 采用冻结上游的单向流水线

## Status

Superseded - NovelX Historical

本文记录冻结 NovelX 比赛实现的 Story Growth 流水线，不再约束 CreatX。CreatX 的 `/growth` 采用 ADR-0009 的持久 Goal、滚动规划和串行 Cline Run，不建立固定“世界 → 故事 → 封面”状态机；当前规则见 `0009-dynamic-growth-goal-runtime.md` 与 `../capabilities/creative-skills/product-spec.md` 的 `CSK-301` 至 `CSK-310`。

## Context

NovelX 已经能够通过真实 Provider 完成 World Growth、地图、风貌和玩家文稿，但 Story 仍只有界面脚手架。用户要求故事面以一部小说为主体，以具名历史书和关键文献为上游辅助，并在结尾生成小说、历史书和主题封面。当前世界必须继续使用，Story 不得反向修改已经提交的世界、历史书或文献。

## Decision

- Story 使用独立的版本化账本，不扩展或重写 World Materialization。
- 运行顺序固定为：冻结世界 → 历史书 → 关键文献 → 一部小说的 6–8 章主题篇章 → Cover 队列。
- 阶段之间只向下读取；叶子结果仍返回当前 Story Editor 以便审核和继续派发，但不得回写上游产物。
- `/growth` 首先检查项目权威状态：空项目进入 World，完成世界进入 Story，完成正文进入 Cover，全部完成则幂等返回。
- Story Editor 与 Cover Editor 使用干净子会话；Story Writer 只能撰写一个已注册文档。
- Cover 是独立账本中的真实图片任务。小说和每本历史书各一张 2:3 竖图，主题一张横图；NovelX 不叠字或修正图片文字。
- Story 新细节只保留在作品内部。本批不生成角色卡、不扩展图谱、不回写世界、不排版世界包。

## Consequences

### Positive

- 已完成世界可以由新 Growth 会话安全接续，不再依赖旧世界根会话所有权。
- Story 失败不会污染 World；Cover 失败不会回滚已经提交的正文。
- 从当前世界续跑和从空项目一句话首跑使用同一权威状态机。
- 历史、文献和小说的来源、依赖、文件哈希与图片归属可验证和恢复。

### Negative

- 小说中产生的新设定不会自动成为共享世界事实。
- 严格顺序写作降低并行吞吐，但避免章节连续性被并行输出破坏。
- 完整真实运行需要多次模型调用和图片调用，时间与成本明显高于 World 单阶段。

### Neutral

- Story UI 可以投影结构化账本，但真实正文继续使用普通项目文件和现有文档编辑器。

## Alternatives Considered

- 继续复用 World Materialization：拒绝，因为会把故事私有状态塞入世界事实合同，并引入逆向回写风险。
- 让一个模型一次生成整部作品：拒绝，因为无法提供逐文档锁定、来源验证、失败恢复和章节连续性门禁。
- 先写小说再倒推历史与文献：拒绝，因为违反已确认的单向依赖顺序。

## References

原始 NovelX 计划与视觉稿已退出活动文档树，可从标签 `pre-repository-cleanup-20260806` 恢复。本 ADR 仅保留被取代决策的历史理由。
