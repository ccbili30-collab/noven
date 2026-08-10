---
title: Image Runtime 第一纵向闭环计划
doc_type: capability-plan
owner: image-runtime
status: project-image-workflow-verified
last_verified: 2026-08-07
---

# Image Runtime 第一 Provider 计划

1. 使用本地配置调用 JMRAI `/images/generations`。
2. 统一解析 `b64_json` 和 HTTPS URL。
3. 校验图片格式与首版大小限制。
4. 通过 Project File Port 保存真实项目文件并重读校验。
5. 以两个指定模型运行有费用的 Live（真实运行）探针。
6. 贡献项目作用域、原生审批的 `generate_image` 中立工具。
7. 将工具和基础图片指引接入生产 Electron Main，不向 Renderer 暴露凭据。
8. 通过现有文件刷新和预览投影展示真实图片，并验证干净退出与重启恢复。

完成条件：`ACC-IMG-001` 至 `010` 在当前单图纵向范围内有代码、定向测试或真实证据。

本批已停止于单图纵向闭环。队列、取消、结果未知、图生图、封面、地图、图片设置和工作台布局必须作为新的独立批次重新定义验收；不得继续扩张本计划。

持久单 Worker 图片队列现已由 ADR-0009 作为 Dynamic Growth 的独立后续批次接受。它不回写本计划的完成范围；具体实现从 `../../plans/2026-07-28-dynamic-growth-goal.md` Task 7 开始，并验收 `ACC-IMG-011` 至 `019`。

Task 7 已在提交 `f540b5b` 形成 Runtime 检查点，证据见 `../../baseline/creatx-image-queue-runtime-2026-07-28.md`。真实 Cline/JMRAI 后台运行、可见状态和 Growth 组合分别留给 Task 8/9；不得把队列 Runtime 证据回写为本计划的同步单图 Live。

## 同步图片编辑批次

2026-07-30 单独实现 `edit_image`：项目相对底图/Alpha PNG 蒙版读取、JMRAI generations 兼容编辑请求、原有响应校验、create-only 落盘、结果未知分类、Main 工具贡献和 Draw Map Skill 指引。该批验收 `ACC-IMG-020` 至 `025`。

本批停止于同步普通会话接口。Growth 编辑队列、自动重试、图像配准、蒙版外确定性合成、多地区地图和 Renderer 地图交互必须另行设计；Provider 返回一张图片不能越级宣称这些能力完成。

## 项目图片工作流批次

2026-08-07 已按 `IMG-030` 至 `IMG-037` 完成项目通道调度、Attempt 持久证据、重试/跳过/取消、Agent 管理工具、当前项目进度栏和成功后 Markdown 挂接。相邻 `workspace-ui` 同时实现真实 Markdown 图片引用的环绕布局与普通 HTML 隔离预览。代码检查点为 `cb10cde`、`a5997ad`、`ecf30cd`、`f9e8de6` 和 `8913805`，自动化证据见 `../../baseline/creatx-project-image-workflow-2026-08-07.md`。

本批停止于自动化闭环。没有调用外部图片 Provider，没有重新生成既有图片，也没有完成跨项目真实付费并发或 Electron 视觉 Live；这些边界不得从本批测试推断。

## GWP 回执图片关系批次

2026-08-07 已按 ADR-0011 和 `IMG-038` 至 `IMG-042` 接通回执派生关系、任意先后顺序挂接、权威世界历史对账、队尾重试与 Renderer 状态分区。实现没有升级图片数据库，也没有建立 HTML 正文副本或第二关系表。自动化证据见 `../../baseline/creatx-gwp-receipt-image-attachments-2026-08-07.md`。

本批停止于自动化验证。正式两本世界尚未打开执行对账，外部图片 Provider 与 Electron 视觉均未运行；不得把代码接线描述成已经迁移正式作品。

后续实机确认正常的标题润色会产生 `image_attachment_conflict`。按 2026-08-07 产品澄清，该冲突继续持久留痕但从用户活动栏、项目打开全局错误和 Owner 汇报中静默；系统不猜位置、不改正文、不重绘图片。其他挂接故障保持可见。
