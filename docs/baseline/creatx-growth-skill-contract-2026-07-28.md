---
title: Growth Skill 与显式命令合同证据
doc_type: implementation-evidence
owner: creative-skills
status: task-2-verified
last_verified: 2026-07-28
source_of_truth: docs/capabilities/creative-skills/product-spec.md
---

# Growth Skill 与显式命令合同证据

## 已实现边界

`@creatx/creative-skills` 已增加纯 `parseGrowthCommand` 解析器和应用本地 `creatx-growth` Skill。内置 Skill 包升级为 `v2`，安装结果将小说与 Growth 两个 Skill 一并放入现有显式允许列表，Electron 启动时仍通过既有 Cline `UserInstructionConfigService` 发现。

解析器只接受消息首部、大小写精确且具有完整命令边界的 `/growth`。普通长任务、正文中提到 `/growth`、`/growthful`、`/Growth` 和 `/living` 均不触发；命令后的多行用户正文保持不变。空 `/growth` 被识别但保留空正文，后续 Goal 启动边界负责拒绝或要求目标，解析器不虚构目标。

Growth Skill 包含滚动规划、真实项目复读、`创作计划.md`、有界阶段、`report_growth_progress`、必需图片和完成检查。它明确禁止固定领域模板、固定目录、平行 Goal、伪造 Runtime 状态和自动进入 Living。

## 验收结果

2026-07-28 在 Windows、Bun `1.3.14` 验证：

- `bun test packages/creative-skills/tests/creative-skills.test.ts`：`4 pass / 0 fail / 30 assertions`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun test`：CreatX 全量 `61 pass / 0 fail / 195 assertions`。
- `bun run test:growth-store`：`7 pass / 0 fail`。
- `bun run build`：生产构建通过；仍有仓库既有的上级 `@tsconfig/bun/tsconfig.json` 缺失警告。

## 未完成与限制

本批没有把解析器接入 Electron `sendMessage`，也没有创建或复用 Goal、加载阶段工具、启动下一 Cline Run 或调用 Provider（模型服务）。因此它只证明 `ACC-CSK-301`、`ACC-CSK-302` 的命令和教程合同，不证明用户输入 `/growth` 后已经形成持久任务。

Growth Skill 现在随应用安装并在 Cline 允许列表中可发现；“普通消息不能创建 Goal”由尚未接入任何 Goal 启动路径自然满足。只有后续 Runtime 使用解析结果作为唯一启动门禁后，才能把“普通消息不会加载或创建 Growth”称为强制运行行为。
