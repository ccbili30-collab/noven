# Production Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把已确认的 Spotlight 新手教程接入正式诺文首次启动，并提供左下角永久重播入口。

**Architecture:** `WorkspaceShell` 持有引导打开状态和真实页面切换；独立 `OnboardingTour` 持有十步内容、定位、键盘与本机首次门禁；`ProjectNavigation` 提供展开和折叠两种重播入口。教程只读真实界面，不调用 Provider 或修改业务数据。

**Tech Stack:** React 19、TypeScript、CSS、Renderer `localStorage`、Bun Test、Playwright Electron。

---

### Task 1: 首次门禁与步骤规格

**Files:**
- Create: `creatx/apps/desktop/renderer/src/OnboardingTour.tsx`
- Create: `creatx/apps/desktop/renderer/tests/onboarding-tour.test.tsx`

1. 先写首次、已看、损坏存储和完成标记失败用例。
2. 运行 `bun test apps/desktop/renderer/tests/onboarding-tour.test.tsx`，确认缺少实现而失败。
3. 实现版本化存储键、十步目录和无副作用读写函数。
4. 重跑定向测试并确认通过。

### Task 2: 正式 Spotlight 组件

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/OnboardingTour.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`
- Test: `creatx/apps/desktop/renderer/tests/onboarding-tour.test.tsx`

1. 增加目标测量、四块遮罩、视口内卡片定位、十步控制和完整 Skill 工具箱测试。
2. 实现组件并从 Prototype 提取 Spotlight 样式，全部改为生产命名。
3. 验证 Escape、前后步、跳过、完成与减弱动效。

### Task 3: 真实页面动作与左下角重播

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/ProjectNavigation.tsx`
- Test: `creatx/apps/desktop/renderer/tests/onboarding-tour.test.tsx`

1. 写失败测试，要求展开导航文字入口和折叠图标入口都存在。
2. 给真实控件增加稳定 `data-onboarding` 锚点；引导步骤只切换页面，不执行 API 保存、选目录或发送。
3. 在新 Profile 自动打开；跳过/完成写标记；重播始终从第 1 步开始。
4. 运行 Renderer 定向测试和 Typecheck（类型检查）。

### Task 4: Electron 纵向验收与留档

**Files:**
- Create: `creatx/scripts/electron-onboarding-test.ts`
- Modify: `docs/capabilities/workspace-ui/README.md`
- Modify: `docs/capabilities/workspace-ui/acceptance.md`
- Modify: `CONTEXT.md`
- Modify: `BASELINE.md`
- Create: `docs/baseline/creatx-production-onboarding-2026-08-11.md`

1. 构建后以隔离 Profile 启动 Electron，验证首次出现、十步真实锚点、跳过、重启、左下角重播、Escape 和减弱动效。
2. 保存 1600×1000 视觉截图并人工检查高光与卡片。
3. 运行定向测试、Typecheck、Import Boundary、Production Build 和代码冻结后的全量测试。
4. 更新真实证据与未完成边界；未经用户另行授权不提交或推送。
