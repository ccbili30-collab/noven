---
title: GWP 回执图片挂接实施计划
doc_type: implementation-plan
status: completed-automated
date: 2026-08-07
primary_capability: image-runtime
---

# GWP 回执图片挂接实施计划

## 目标与边界

主能力线为 `image-runtime`，相邻合同为 `creative-skills`、`world-blueprint` 与 `workspace-ui`。目标是让 GWP 回执自动驱动 Markdown 图片挂接，并把队列控制与 UI 语义调整为已确认行为。

不升级数据库，不修改正式数据，不生成 HTML 副本，不改变普通独立生图的显式挂接语义。

## 顺序

1. 为队列 Store 增加幂等挂接意图绑定；不同关系失败关闭。
2. 为队列增加中央绑定入口；处理图片与回执任意先后顺序。
3. World Materialization 在新回执、回执重放和项目历史对账时派生绑定意图；移除 GWP Prompt 对手工 `attachment` 的依赖。
4. Electron Main 在项目进入时触发正式 Goal 回执对账，不让 Renderer 直接接触 Store。
5. 重试改为项目队尾，失败/中断不再提供跳过；UI 分区并直接显示错误摘要与技术详情。
6. 定向测试通过后冻结代码，运行一次冻结安装、Typecheck、Import Boundary、全量测试、Production Build 和 `git diff --check`。

## 验收与停止条件

覆盖回执先到、图片先成功、重启缺失绑定、重复对账、异义绑定、正文冲突、游离任务、挂接独立失败、队尾重试、UI 分区与可见错误。若必须迁移 Schema、覆盖正文、增加第二关系模型或改变公开兼容语义，停止并请求产品决定。
