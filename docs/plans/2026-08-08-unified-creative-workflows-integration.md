---
title: Unified Creative Workflows 主线接入计划
doc_type: integration-plan
owner: integration
status: completed
last_verified: 2026-08-08
source_branch: unified-art-style
source_head: 8a728d4d7201bc8c9135e33bff77fff224d6b05c
target_branch: topic-genre-style
target_head: 09fd0bf348b0fce5dae0f7d02455db74f29a8cb3
---

# Unified Creative Workflows 主线接入计划

## 当前目标

以 `topic-genre-style` 为唯一主线，准备接入 `unified-art-style` 中尚未进入主线的创作能力。接入必须保留主线最新的 Owner/Growth 会话权威、终态证据、Worker 回收、图片队列 V3、取消语义、路径规范化和 Web Preview 三布局对照。

本批只完成合并前审计、边界冻结和恢复入口，不执行 Cherry-pick（拣选提交）、文件移植或产品行为变更。

完成更新：后续在同一主线任务中已按本计划进行选择性接入，结果提交为 `70d4f85` 与 `c8e5c14`。该句取代上段的计划时态；没有整分支 Merge，也没有直接保留来源分支的冲突文件。

主要能力线为 `creative-skills`；相邻合同仅包括 `workspace-ui`、`provider-harness`、`image-runtime` 和 `workbench-registry`。

## 已验证分支状态

- 主线目录：`D:\CodexW\Creatx\creat1`
- 主线分支：`topic-genre-style`
- 审计时主线 HEAD：`09fd0bf348b0fce5dae0f7d02455db74f29a8cb3`
- 来源工作树：`C:\Users\16014\.codex\worktrees\89bf\creat1`
- 来源分支：`unified-art-style`
- 来源 HEAD：`8a728d4d7201bc8c9135e33bff77fff224d6b05c`
- 共同基点：`0e84a12b9e4a94938bd858c195a58cb45c55a140`
- 分叉计数：主线独有 23 个提交，来源分支独有 4 个提交。
- 主线审计开始时无未提交修改。
- 来源工作树存在未跟踪截图、地图、角色和世界星图原型；这些文件不属于四个已提交 Change Set（变更集），不得复制、删除、暂存或带入主线。

## 四个来源提交的处理结论

| 来源提交 | 结论 | 证据与理由 |
| --- | --- | --- |
| `0117736 fix(desktop): support isolated Cline install` | 跳过 | `git cherry` 已判定补丁等价；主线对应提交为 `fbf959c`。 |
| `811180a feat(image): enforce project visual style` | 跳过 | 主线对应能力已由 `7bf8598` 接入，并继续经过图片队列、Growth 终态和路径规范化修改。当前代码已由队列集中注入《视觉设定/统一画风.md》，测试覆盖最近母版、幂等重试、缺失警告和关闭竞态。重新拣选会倒灌旧实现。 |
| `68b8871 feat(skills): add composer sequences and comic adaptation` | 不直接拣选；分能力提取 | 同一提交混合 Skill 顺序挂篮、漫画合同、Renderer、Main、Cline Adapter、图片 Runtime、测试截图和约 20MB 漫画原型图片。其 UI 与运行接线基于旧主线，不能覆盖当前 Owner/Growth 链。 |
| `8a728d4 feat(skills): promote approved creative workflows` | 不直接拣选；分能力提取 | 同一提交混合角色画廊、小说开篇、地图修订、工作台模板和世界星图/互动地图 Prototype（原型）。生产源码以 Base64 内嵌整套 Skill 网页资产，扩大上下文且难以审查，不符合当前 AI 可维护规则。 |

`git cherry` 的 `+` 只表示 Git 未找到补丁等价提交，不表示代码适合进入主线。产品与语义等价必须以当前代码、规格和测试为准。

## 接入顺序

### 批次 A：创作 Skill 方法

候选范围：

- 漫画改编方法的增量改进；
- 小说开篇 Skill；
- 角色群像/角色画廊 Skill；
- 地图 Skill 中不改变现有工具合同的增量方法。

要求：

- 每种 Skill 保持可读源文件和可读资产目录，不把大型 HTML/CSS/JavaScript 或图片转成 Base64 常量塞入 TypeScript。
- 继续通过现有 `installBuiltinCreativeSkills` 安装到应用数据目录，不写项目 `.creatx`，不修改 Cline Core。
- 图片只能通过现有 `submit_image_generation` / Image Queue（图片队列）进入，统一画风由队列自动注入。
- 每个 Skill 单独映射现有或新增的 `CSK-*` 与 `ACC-CSK-*`；未获得稳定产品语义的工作流不以“approved”名义进入生产。

### 批次 B：工作台生成器

候选范围：

- 角色画廊生成器；
- 互动地图生成器；
- 世界星图生成器；
- 角色设定工作台模板。

要求：

- Prototype 与生产模板明确分离；Fixture（测试夹具）和参考图片不能冒充运行结果。
- 生成器必须读取真实项目文件，写入项目内普通文件，并通过既有 `register_workbench` 注册。
- HTML 继续服从当前隔离预览合同；不得读取 Electron、Node、Cline、Provider 或本机私有接口。
- 先用最小可读模板和真实路径失败测试证明闭环，再决定是否带入大型视觉参考资产。

### 批次 C：Composer Skill Sequence

候选范围：用户在一次普通发送前选择多个 Skill 的顺序。

该能力会改变 Composer（输入区）产品行为和命令语义，不能作为 Skill 文件的附带修改进入。实施前必须单独确认：

- 它是一次用户消息内的上下文加载顺序，还是多个连续 Agent Run；
- 任一 Skill 失败时停止、跳过还是继续；
- 取消、重试、历史恢复和会话持久化的用户结果；
- 是否与显式 `/growth*`、普通斜杠命令或 Owner Run 冲突。

未关闭这些问题前，只能保留来源代码作为参考，不接 Renderer、Main、Cline Adapter 或稳定合同。

## 冲突处理边界

下列主线实现一律保留，不接受来源分支整文件覆盖：

- `creatx/apps/desktop/src/main.ts`
- `creatx/packages/cline-adapter/src/index.ts`
- `creatx/packages/image-runtime/src/queue.ts`
- `creatx/packages/world-blueprint/**`
- `creatx/apps/desktop/renderer/src/App.tsx`
- `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- `creatx/apps/desktop/renderer/preview/PreviewApp.tsx`
- `CONTEXT.md` 与 `BASELINE.md`

需要来源逻辑时，从提交中按能力重写到当前权威接口，不使用 `ours/theirs` 整体选择，也不通过兼容垫片保留旧调用方。

## 明确不做

- 不 merge（合并）整个 `unified-art-style` 分支。
- 不直接 Cherry-pick `68b8871` 或 `8a728d4`。
- 不再次接入隔离 Cline 安装或统一画风旧实现。
- 不触碰来源工作树未跟踪文件。
- 不删除来源工作树或分支，直到所有计划接入批次完成、验收并由用户确认清理。
- 不修改 Growth 主链冻结的 Start Activation / Pause 中等风险竞态。
- 不运行外部 Provider，不重跑或删除任何整本产物。

## 每个接入批次的验收

定向验收必须覆盖：安装字节、允许列表、命令或自然语言触发、真实文件写入、工作台注册、图片队列接入、失败关闭和取消边界。涉及 Renderer 时增加 Web Preview 或 Electron 视觉验收；涉及 Provider 时没有真实配置必须失败关闭，不能用 Fixture 标记 Live。

代码冻结后只集中运行一次：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun install --frozen-lockfile
bun run typecheck
bun run test:imports
bun run test
bun run build
bun run test:preview:web
```

## 停止条件

出现以下任一情况立即停止当前接入批次：

- 需要改变 Owner/Growth 会话权威或引入第二套 Agent Run；
- 需要修改 Cline Core 或让 Cline 私有类型越过 Adapter；
- 需要改变公开协议、持久数据兼容、权限边界或 HTML 隔离语义；
- 来源能力无法从 Base64 或 Prototype 解耦成可读、可测、可维护的生产实现；
- Typecheck、Import Boundary 或对应核心测试失去绿色基线。

## 下一恢复入口

从批次 A 开始，先只审查 `68b8871` 的漫画方法增量与 `8a728d4` 的小说开篇/角色画廊方法，建立单独文件所有权和验收 ID。不得从 `git cherry-pick 68b8871` 开始。
