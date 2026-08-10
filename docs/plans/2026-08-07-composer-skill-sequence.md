# Composer Skill Sequence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在生产 Composer 中实现按会话保留的 Skill 序列，并让一次正式用户消息驱动同一 Cline 会话按序完成多个真实 Skill Run。

**Architecture:** Renderer 保存每个会话的序列偏好，发送时通过稳定 Desktop 命令提交冻结快照。Main 只接受 Creative Skills 注册表中的普通可排队 Skill，并让 Cline Adapter 串行执行首个可见回合和后续隐藏续轮；Cline 继续拥有消息、工具、权限、取消和历史，CreatX 不建立第二套运行内核。

**Tech Stack:** TypeScript、React 19、Electron IPC、Cline SDK 0.0.65、Bun Test、CSS Container Queries。

---

### Task 1: 固定可排队 Skill 合同

**Files:**
- Create: `creatx/packages/creative-skills/src/skill-sequence.ts`
- Modify: `creatx/packages/creative-skills/src/index.ts`
- Modify: `creatx/packages/creative-skills/tests/creative-skills.test.ts`
- Modify: `docs/capabilities/creative-skills/product-spec.md`
- Modify: `docs/capabilities/creative-skills/acceptance.md`

**Steps:**
1. 先写失败测试，证明只接受正式注册 Skill、保留顺序与重复项、拒绝 Growth 和未知 Skill。
2. 定义唯一 `QUEUEABLE_CREATIVE_SKILLS` 注册表和归一化函数。
3. 运行 `bun test tests/creative-skills.test.ts`，预期通过。

### Task 2: 固定会话级 Renderer 状态

**Files:**
- Create: `creatx/apps/desktop/renderer/src/skill-sequence-preferences.ts`
- Create: `creatx/apps/desktop/renderer/tests/skill-sequence-preferences.test.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`

**Steps:**
1. 先写损坏配置、V1 迁移、会话隔离、切回恢复和更新不影响其他会话的失败测试。
2. 实现带逐槽 `enabled` 状态的版本化 Local Storage（本地存储）解析与写入；V1 插槽迁移为全部启用，损坏时失败关闭为空。
3. `App` 按当前 Session 读取挂篮；只有一次性总启用已勾选时才把已选择插槽组成冻结序列。消息提交后立即取消总启用，普通 Steer 不携带新序列，空挂篮、全部未选择或总启用未勾选保持原命令行为。
4. 运行定向测试。

### Task 3: 实现紧凑 Composer 控件

**Files:**
- Create: `creatx/apps/desktop/renderer/src/SkillSequenceControl.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Steps:**
1. 在输入框上沿增加小挂签和独立的一次性启用勾选；点击挂签后向上展开挂篮，提供添加、逐槽选择、Skill 选择、删除和上下移动。
2. 运行时禁用编辑但保留可见快照；原生选择器保持键盘可达。
3. 关闭态不占用 Composer 的常驻横向空间；展开面板受可用宽度约束，窄桌面仍保留全部操作。
4. 验证 Enter 发送、Shift+Enter 换行、Escape 或点击外部关闭挂篮和键盘 Tab 顺序。

### Task 4: 串行执行同一 Cline 会话

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/packages/cline-adapter/tests/projection.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`

**Steps:**
1. 给 `SendMessageCommand` 增加可选 `skillSequence`，Main 对数量、名称和组合进行失败关闭校验。
2. 定义内部 Skill 续轮标记并先写投影测试，确保后续内部 Prompt 不成为用户消息。
3. Adapter 首轮使用原始用户消息和内部阶段说明，后续逐轮发送隐藏续轮信息；每轮只安排当前 Skill，最后一轮要求形成用户可理解的总结。
4. 任一轮非完成、取消或抛错时停止序列；不运行剩余 Skill。
5. 确认 Cline Timeline 仍形成一条用户回合、折叠中间回复和最后正式回复。

### Task 5: 冻结验收与留档

**Files:**
- Modify: `CONTEXT.md`
- Modify: `BASELINE.md`
- Create: `docs/baseline/creatx-composer-skill-sequence-2026-08-07.md`

**Steps:**
1. 运行 Creative Skills、Renderer 状态、Cline Adapter 和 Main 定向测试。
2. 从 `creatx` 运行 `bun typecheck`、`bun test`、`bun run test:imports` 和 `bun run build`。
3. 启动真实 Electron，以至少两个会话验证序列隔离、插槽发送后保留、总启用发送后自动取消、切回恢复、顺序展示、窄窗和取消。
4. 截图并自行检查；存在布局错误先修复再报告。
5. 记录自动证据、桌面证据和“未使用真实 Provider 时不属于 Live”的边界。

当前工作树包含此前未提交的漫画 V23 与多个未跟踪视觉原型；本计划不使用 `git add -A`、不清理原型，也不在用户未要求时提交。
