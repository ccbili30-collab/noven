# Project Visual Style Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Growth World Pro 第三阶段生成唯一《统一画风.md》，所有持久图片任务自动应用它且不阻塞文字主链。

**Architecture:** `write_world_blueprint prepare_review` 负责把受限结构化视觉方向渲染为公开 Markdown；`ImageTaskQueue` 通过只读项目文件端口从输出路径向上定位母版，在首次持久化前编译最终 Prompt。图片表继续只保存最终 Prompt；精确重试先复用既存任务。World Materialization 从同一最终 Prompt 推导是否应用母版并写入 Owner 汇报。

**Tech Stack:** TypeScript、Bun、Node test runner、SQLite、Project File Port、Cline Tool contracts。

---

### Task 1: 冻结视觉母版文件合同

**Files:**
- Modify: `creatx/packages/world-blueprint/tests/world-blueprint.test.ts`
- Modify: `creatx/packages/world-blueprint/src/index.ts`
- Modify: `creatx/packages/creative-skills/src/growth-world-pro.ts`

1. 为 `prepare_review` 添加失败测试：缺少结构化视觉方向时拒绝进入 review。
2. 添加成功测试：完整蓝图进入 review 时创建 `<作品根>/视觉设定/统一画风.md`，精确重试不改写，冻结前文件必须存在且非空。
3. 运行 `bun test packages/world-blueprint/tests/world-blueprint.test.ts`，确认新测试先失败。
4. 实现受限输入校验、稳定 Markdown 渲染和通过 Project File Command Port 的 create-only 写入。
5. 更新第三阶段和确认阶段 Prompt，使可信回执包含该公开文件。
6. 重跑定向测试并通过。

### Task 2: 在唯一图片队列入口注入母版

**Files:**
- Modify: `creatx/packages/image-runtime/tests/queue.node-test.ts`
- Modify: `creatx/packages/image-runtime/src/queue.ts`
- Modify: `creatx/apps/desktop/src/main.ts`

1. 添加失败测试：不同 Worker 风格的任务在同一作品根下都带相同母版，且任务 Prompt 等于 Provider 实收 Prompt。
2. 添加失败测试：相同 `idempotencyKey` 精确重试直接复用既存完整 Prompt，不重复拼接；不同原始 Prompt 仍冲突。
3. 添加失败测试：无母版的独立任务沿用原 Prompt并继续；嵌套作品根按输出路径最近祖先定位。
4. 将 `ImageTaskQueue.submit` 改为异步，在首次提交时通过只读端口查找母版并编译最终 Prompt；重试先核对既存任务。
5. Main Process 注入 `ProjectFileQueryPort`，不让 Worker 或 Renderer处理母版。
6. 运行 `bun run test:image-queue` 并通过。

### Task 3: 把缺失母版写入 World Pro 最终汇报

**Files:**
- Modify: `creatx/packages/world-blueprint/tests/materialization.test.ts`
- Modify: `creatx/packages/world-blueprint/src/materialization.ts`
- Modify: `creatx/apps/desktop/src/main.ts`

1. 添加失败测试：图片证据标记未应用母版时，最终可信摘要列出对应路径；全部应用时不产生虚假警告。
2. 扩展 World Materialization 私有图片证据，不修改 `@creatx/contracts` 或图片数据库 Schema。
3. Main 从已持久化的最终 Prompt 判定母版是否应用。
4. 运行 World Blueprint 和 Owner Delivery 相关定向测试。

### Task 4: 更新权威规格并冻结验证

**Files:**
- Modify: `docs/capabilities/image-runtime/product-spec.md`
- Modify: `docs/capabilities/image-runtime/acceptance.md`
- Modify: `docs/capabilities/creative-skills/product-spec.md`
- Modify: `CONTEXT.md`

1. 记录唯一队列注入、缺失母版降级、幂等和第三阶段文件合同。
2. 运行 `git diff --check`。
3. 从 `creatx` 目录运行 `bun typecheck`、定向测试、全量 `bun test` 和 `bun run build`。
4. 检查暂存范围后以语义提交完成本批；不运行外部整本 Provider 测试。
