# 诺文 Causality Skill 验收基线（2026-08-10）

## 已实现

- 内置 `creatx-causality` 与 `/causality` 进入唯一 Cline SDK `0.0.65` Skill Runtime（技能运行时），没有第二套 Agent Runtime。
- 生成器优先读取完整物化关系，只接受明确存储为 `type: "causes"` 的关系并保留方向与原因；冻结蓝图只能作为标记为 `degraded` 的降级来源。
- 输出为项目内离线 Viewer（查看器），支持搜索、拖动、缩放、节点选择和上下游因果链；不依赖网络，不修改世界正文、蓝图、Growth 状态或 Provider（模型服务）配置。
- 多世界歧义、指定 Goal 损坏、无明确因果、项目路径越界、`.creatx` 输出、Junction（目录联接）输出和非本 Skill 所有目录覆盖均失败关闭。
- Agent 只有在打开 Viewer 检查成功，并依次完成 `register_workbench` 与 `set_workbench_home` 后，才能报告工作台已注册。

## 验收

- Skill Creator `quick_validate.py`：`PYTHONUTF8=1` 下通过；Windows 默认 GBK 首次读取 UTF-8 中文失败，属于校验脚本编码边界，不是 Skill 内容失败。
- `bun test packages/creative-skills/tests/causality-skill.test.ts packages/creative-skills/tests/creative-skills.test.ts`：24/24，通过，432 次断言。
- 真实临时项目验证只输出 `causes`，不输出 `references`；无因果失败关闭，项目外绝对输出和项目内 Junction 指向项目外均在写入前拒绝。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 两项通过。
- `bun run build`：Main、Preload（预加载桥）和 Renderer（渲染进程）生产构建通过。
- `git diff --check`：通过，仅有既有 Windows 行尾提示。

## 未完成与边界

- 没有外部 Provider Live；当前 Skill 只投影 AI 先前已明确登记的因果，不在生成阶段重新推导或补写关系。
- 没有真实 Electron 会话完成 Skill 加载、生成、视觉检查、工作台注册和重启重开的纵向闭环。
- Viewer 是实验性可视化，不是客观因果证明、确定性模拟器、反事实引擎或专业图编辑器。
- 本批不包含 `.np` 用户界面，也不改变 `0.1.20` 将 `.np` 保持不可见的发布边界。

## 恢复入口

- 可读 Skill 源：`prototypes/skills/creatx-causality/`
- 确定性打包脚本：`creatx/scripts/package-causality.ts`
- 生产嵌入：`creatx/packages/creative-skills/src/causality.ts`
- 产品与验收：`docs/capabilities/creative-skills/product-spec.md`、`docs/capabilities/creative-skills/acceptance.md`
