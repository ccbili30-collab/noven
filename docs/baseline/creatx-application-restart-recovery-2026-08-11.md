---
title: 诺文应用内重启恢复基线
doc_type: verification-baseline
owner: desktop-runtime
status: verified
last_verified: 2026-08-11
source_of_truth: docs/capabilities/desktop-runtime/product-spec.md
---

# 诺文应用内重启恢复基线

## 已实现

- `DRT-003..006 / ACC-DRT-001..005` 已进入生产链：展开和折叠项目导航均提供“恢复诺文”。
- Renderer（渲染层）只保存一次性 `projectId + sessionId` 视图偏好；Main（桌面主进程）通过稳定 Desktop API（桌面接口）重新读取活动事实。
- 空闲请求只安排一次 Electron Relaunch（重新启动）；活动普通会话/工具、Owner Growth、活动 Growth Goal 或生成中图片必须二次确认。
- 确认后复用既有 `before-quit` 清理链。重启后只读取持久历史，不自动重发消息、Provider（模型服务）请求或工具调用。
- 图片队列只把 `generating` 视为本次确认所需的活动工作；纯 `queued` 任务保留并在下次启动继续排队。

## 验收

- 失败测试先确认缺少决策模块、恢复模块、活动计数和 `hasGenerating()`，实现后定向测试为 11/11、Owner 协调器 14/14、图片队列 38/38。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项 Import Boundary（导入边界）通过。
- `bun run test`：615/615，通过，4,547 次断言，85 个测试文件。
- `bun run build`：Production Build（生产构建）通过。
- `bun run test:application-restart`：隔离 Electron 通过。空闲重启恢复原项目和会话；活动本地 Provider 请求出现确认框，取消无退出副作用，第二次确认后重启；Provider 请求总数保持 1，没有自动重放。
- Electron 测试使用临时 Profile（配置档案）、临时项目和本地挂起 Provider；没有调用外部 Provider，也没有修改正式 Profile。

## 未完成

- 本批不修复 `EMFILE`、艺术库联网错误分类或其他需要重启的根因。
- 不提供后台继续、自动崩溃恢复、活动 Run 精确续接或 Exactly Once（严格一次）副作用恢复。
- Growth 与生成中图片的确认门禁由真实 Store/Coordinator（协调器）状态和自动化覆盖；本批 Electron Live（真实运行）只实际触发了普通活动会话确认。
- 未执行 Windows 安装包或 Portable（便携版）打包验收。

## 风险与恢复入口

- 没有任何 Session 的项目目前不能仅凭 `projectId` 从会话历史重建路径；这类无效恢复偏好回退正常启动。本批没有增加 Project Catalog（项目目录登记）或改变项目数据模型。
- “恢复诺文”只能降低人工退出重开的操作成本，不能被描述为故障根因已经解决。
- 后续从 `docs/capabilities/desktop-runtime/`、`creatx/apps/desktop/src/application-restart.ts` 和 `creatx/scripts/electron-application-restart-test.ts` 继续。
