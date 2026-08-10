---
title: CreatX Workbench V3 可见范围基线
doc_type: baseline
owner: workbench-registry
status: runtime-verified-provider-live-open
date: 2026-08-10
---

# CreatX Workbench V3 可见范围基线

## 已实现

- 严格读取 Workbench V1/V2/V3；首次设置可见范围时，使用既有修改时间冲突门禁把目标记录原子升级到 V3，不后台迁移其他记录。
- `set_workbench_visibility` 已作为 ordinary 项目会话工具注册进正式 Desktop Runtime（桌面运行时）。系统指导明确要求 AI 使用工具而不是直接编辑 `.creatx`。
- `include` / `exclude` 使用工作台相对 `/` 路径，支持 `*`、`?`、完整路径段 `**`，Windows 大小写不敏感且排除优先。模式采用有界动态匹配，不执行脚本、正则表达式或项目外路径。
- `autoIncludeNewFiles` 省略时为 `true`；关闭时冻结当刻匹配的真实文件相对路径，之后新增或改名文件不会自动出现，删除项不会形成幽灵条目。
- 过滤只裁剪 registered workbench，内置“文件”和真实项目内容不变。JSON 展示门禁保持；空祖先目录被裁掉。
- V3 与改名、交互主页互相保留。新规则会隐藏已有主页时失败关闭；隐藏 HTML 不能由主页或临时展示链旁路打开。

## 验收

- `bun test packages/workbench/tests/workbench.test.ts packages/creative-skills/tests/creative-skills.test.ts packages/cline-adapter/tests/projection.test.ts`：94/94，通过，629 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 导入边界通过。
- `bun test`：生产代码冻结后 493/493，通过，3,479 次断言；包含尚未提交的上一批会话切换修改。此后只补充 3 个幂等与开关定向断言并复跑上述 94 项定向测试，生产代码未再变化。
- `bun run build`：Main、Preload、Renderer Production Build（生产构建）通过；`out/main/main.js` 中有 3 个包含 `set_workbench_visibility` 的匹配行。
- `git diff --check`：通过，仅输出仓库既有 Windows 行尾转换提示。

定向测试使用真实临时项目目录、真实 `.creatx/workbenches/*.json` 原子写入和重新加载，不使用文件系统 Mock（模拟）。工具执行入口、默认开关、自动新增、冻结新增/删除/改名、排除优先、大小写、V1/V2/V3 保留、主页阻塞、非法模式和损坏记录隔离均有可执行证据。

## 未完成与风险

- 未调用外部 Provider（模型服务），因此没有证明模型能根据自然语言稳定自主选择 `set_workbench_visibility`；当前不是 Provider Live（真实运行）。
- 未启动 Electron 做审批弹窗和重启后的视觉验收，未使用正式 Profile，未打 Windows 安装包。
- 第一版没有前端规则编辑器、规则查看器或开关；用户通过普通项目会话要求 AI 设置。公开 `WorkbenchProjection` 不暴露规则。
- V3 是用户操作触发的显式升级。旧版软件会把 V3 记录隔离为未知版本，不会忽略规则后显示错误内容。
- 冻结模式最多保存 10,000 个文件；include 与 exclude 各最多 64 条、单条最多 240 字符。超限失败关闭。

## 恢复入口

- 产品规则：`docs/capabilities/workbench-registry/product-spec.md` 的 `WBR-017..019`。
- 验收矩阵：`docs/capabilities/workbench-registry/acceptance.md` 的 `ACC-WBR-025..031`。
- 数据决策：`docs/adr/0012-workbench-v3-visible-scope.md`。
- 权威实现：`creatx/packages/workbench/src/index.ts`。
- 正式工具聚合：`creatx/apps/desktop/src/main.ts`。
- 当前改动尚未提交；工作树同时保留上一批会话即时切换修改与用户未跟踪产物，不得整体清理或把无关文件混入提交。
