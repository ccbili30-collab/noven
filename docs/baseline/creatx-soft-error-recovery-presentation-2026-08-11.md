---
title: 诺文非阻塞错误恢复提示基线
doc_type: verification-baseline
owner: workspace-ui
status: verified
last_verified: 2026-08-11
source_of_truth: docs/capabilities/workspace-ui/product-spec.md
---

# 诺文非阻塞错误恢复提示基线

## 已实现

- `WUI-056 / ACC-WUI-078` 已进入生产 Renderer（渲染层）。
- 用户可见摘要精确为“图片任务请求无效。”或“运行时发生错误。”时，Timeline（时间线）提示先以橙色显示 6 秒，再替换为绿色“已恢复！”并在 2 秒后隐藏。
- 两个摘要对应的全局红色错误横幅被抑制，避免同一事件重复展示。
- 余额不足、密钥、权限、持久化、项目冲突及其他错误不进入该白名单，继续沿用既有红色和阻塞逻辑。
- 修改只作用于展示投影，不改变 Runtime（运行时）错误码、Timeline 持久事实、Provider（模型服务）行为或任务状态。

## 验收

- 定向测试：3/3，通过，14 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项 Import Boundary（导入边界）通过。
- `bun run test`：617/617，通过，4,559 次断言，86 个测试文件。
- `bun run build`：Production Build（生产构建）通过。
- `git diff --check`：通过。
- 本批没有调用外部 Provider。

## 未完成

- 没有启动 Electron 做橙色 6 秒、绿色 2 秒和自动隐藏的视觉计时 Live（真实运行）验收。
- 没有改变或修复两个底层错误的真实根因。
- 没有把其他错误改为自动恢复提示，也没有引入通用错误分类或恢复检测。

## 风险与恢复入口

- “已恢复！”是按产品要求在固定计时后显示的文案，不代表任务、Runtime 或 Provider 已实际恢复。真实错误事实仍保留在既有 Timeline 数据和运行边界中。
- 精确摘要匹配意味着上游若修改标点或文案，该提示会安全回退为原错误展示；若未来需要稳定扩展，应改为经过评审的错误码集合，而不是模糊字符串匹配。
- 后续从 `creatx/apps/desktop/renderer/src/transient-error-presentation.ts`、`creatx/apps/desktop/renderer/src/WorkspaceShell.tsx` 和 `creatx/apps/desktop/renderer/tests/transient-error-presentation.test.ts` 继续。
