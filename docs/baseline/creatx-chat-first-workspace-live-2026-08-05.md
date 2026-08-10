---
title: CreatX Chat 优先工作区真实桌面基线
doc_type: baseline
date: 2026-08-05
status: verified
primary_capability: workspace-ui
acceptance:
  - ACC-WUI-015
  - ACC-WUI-019
  - ACC-WUI-032
  - ACC-WUI-035
  - ACC-WUI-036
  - ACC-WUI-037
---

# 已实现

生产 Renderer 采用当前会话内的 `chat / workbench` 两态布局。新会话和切换会话进入 Chat：项目导航、对话和工作台目录保留，画布宽度归零，浮动检查器不渲染，对话吸收全部剩余宽度。点击真实工作台文件或“展开工作台”进入 Workbench；收起画布返回 Chat。布局模式不再写入全局 `localStorage`，面板宽度偏好仍独立保留。

文件打开继续经过既有串行保存门禁并使用同一 `projectId + fileId`。切换模式不重建 Conversation 组件，不丢 Composer 草稿、滚动位置或 `data-run-state`。已删除旧的目录内联只读预览路径和样式。Chat 中不可用的画布分隔线退出 Tab 顺序，Workbench 中重新可用。

后续比例纠正不再把“Chat 主区域”解释成内容横向铺满。宽屏项目栏和工作台目录各按 18.5% 视口宽度、上限 472px；Conversation 回合、空态、Growth、错误、附件与 Composer 使用最大 1100px 的居中内容列。Composer 空态实测 100px 高，普通工具 30px、发送 34px；标题/导航与文件树图标分别统一为 18px 和 16px。面板偏好升级到 `v3`，窗口变化时按视口比例缩放左右辅助栏。

# 真实验收

`bun run test:desktop` 在隔离的生产 Electron 中通过。启动时 `data-layout-mode=chat`，1355px 视口下对话宽度超过窗口一半，画布最终宽度不超过 1px，检查器数量为 0。打开真实 `创作笔记.md` 后 `data-layout-mode=workbench`，画布宽度大于 300px，检查器数量为 1，编辑、撤销/重做、三条保存路径、展览、收起与重新展开均通过。创建新会话后回到 Chat。1360×860、900×700、860×620 均无页面溢出，退出和重启恢复通过，测试 Electron 进程已回收。

视觉复刻以 2560×1539 Codex 截图为参考并执行两轮。2560px Renderer 第一轮实测 `472 / 1614 / 472`，Composer 为 `1100×100`；第二轮修正空态中轴和图标。窗口缩到 1338px 后最终实测 `248 / 840 / 248`，内容和 Composer 都为 792px，保持 24px 边距。截图位于 `artifacts/frontend-redesign/desktop-test/codex-proportion-pass1.png` 与 `codex-proportion-pass2.png`。

验收命令：

- `bun test apps/desktop/renderer/tests/workspace-layout.test.ts`：3 / 3 通过，13 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：通过。
- `bun run build`：通过。
- `bun run test:desktop`：`DESKTOP PASS`。
- `bun run test`：277 / 277 通过，1,765 次断言。

# 边界

本批未调用有效 Provider（模型服务），不构成模型运行 Live。检查器的位置与自身收起状态仍是本机 UI 偏好；Chat 模式直接不渲染检查器。本批没有重新打包安装版或便携版，也没有改动 Growth、会话协议、项目文件合同和数据模型。
