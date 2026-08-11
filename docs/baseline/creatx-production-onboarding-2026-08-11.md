---
title: 诺文生产新手引导基线
doc_type: baseline
capability: workspace-ui
status: bounded-electron-verified
last_verified: 2026-08-11
acceptance:
  - ACC-WUI-077
---

# 诺文生产新手引导基线

## 已实现

生产 `WorkspaceShell` 已接入十步 Spotlight（聚光灯）新手引导。每个本机 Profile 首次进入时自动出现；只有跳过、Escape 或最后完成会写入 `creatx.workspace.onboarding.v1`，未完成退出不会写入。展开项目导航左下角和折叠 Rail（图标栏）均保留“新手教程”入口，手动重播从第一步开始。

引导依次打开并指向真实模型配置表单、打开项目按钮、Composer（输入区）、工作台标题、艺术库、灵感库和传承库；目标缺失时使用居中说明卡。第九步显示九类创作能力和当前随应用安装的九项 Skill（技能）。生产组件不依赖 Onboarding Prototype（新手引导原型）、Preview Fixture（预览测试夹具）或方案切换器，也不新增 Main Process（主进程）、Preload（预加载桥）或 Desktop API。

## 验收

- `bun test apps/desktop/renderer/tests/onboarding-tour.test.tsx`：3/3，通过，11 次断言。
- `bun run test:imports`：Cline 与 Node strip-types 两项 Import Boundary（导入边界）通过。
- `bun test`：604/604，通过，4,527 次断言，83 个测试文件。
- `bun run typecheck`：通过。
- `bun run build`：Production Build（生产构建）通过。
- `node --experimental-strip-types scripts/electron-onboarding-test.ts`：隔离 Electron 在 1600×1000 逐步通过十步；验证首次显示、未完成退出后再次显示、完成后重启不再自动显示、展开/折叠入口重播、Escape、减弱动效、真实锚点和完整 Skill 工具箱。
- 本地受控 Provider（模型服务）收到 0 个请求；隔离项目目录新增或修改 0 个条目；所有 Electron Main PID（进程标识符）退出后均无残留。
- 视觉截图：`artifacts/onboarding-production-welcome.png`、`artifacts/onboarding-production-api.png`、`artifacts/onboarding-production-capabilities.png`。

上述全量测试运行于当前集成工作树，其中还包含尚未提交的艺术库恢复等既有变更；它证明当前冻结工作树整体为绿，不把结果错误归因于单独的新手引导变更。

## 未完成与风险

- 未执行 Windows 安装包构建、Setup 安装、Portable 启动或正式用户 Profile 验收；现有 `0.1.21` 发布包不包含本批新手引导。
- 未调用外部 Provider，也未验证真实 API Key 的内容质量；教程按产品边界只展示配置路径，不自动填写或测试连接。
- 自动化覆盖 1600×1000 与 `prefers-reduced-motion`；窄窗口使用响应式 CSS 和视口定位规则，但本批未保存独立窄窗视觉截图。
- 功能与艺术库恢复共同进入活动历史提交 `c564192`、GitHub 发布镜像提交 `3e9ce95`；范围外世界蓝图、因果星图和夜间脚本修改未进入这些提交。

## 恢复入口

- 产品规则：`docs/capabilities/workspace-ui/product-spec.md` 的 `WUI-055`。
- 验收规则：`docs/capabilities/workspace-ui/acceptance.md` 的 `ACC-WUI-077`。
- 生产组件：`creatx/apps/desktop/renderer/src/OnboardingTour.tsx`。
- 生产接线：`creatx/apps/desktop/renderer/src/WorkspaceShell.tsx` 与 `ProjectNavigation.tsx`。
- 实机回归：`creatx/scripts/electron-onboarding-test.ts`。
