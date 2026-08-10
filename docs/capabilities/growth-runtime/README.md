---
title: Growth Runtime 能力线入口
doc_type: capability-entry
owner: growth-runtime
status: authoritative-terminal-evidence-verified
last_verified: 2026-08-09
source_of_truth: docs/capabilities/growth-runtime/product-spec.md
---

# Growth Runtime（生长运行时）能力线

本能力线拥有 Goal、Growth Run、阶段、Worker attempt、进度、暂停、取消、恢复、问题和终态。它不拥有 Cline 消息、Assistant 回复、作品正文或 Renderer 展示事实。

主相邻合同：`session` 拥有 Owner Conversation；`provider-harness` 提供 Cline 公共执行和结果回传；`creative-skills` 定义各 Growth 路线怎样创作；`project-files` 拥有真实作品；`workspace-ui` 只投影运行状态。

阅读顺序：`product-spec.md` -> `acceptance.md` -> `plan.md` -> `../../plans/2026-08-05-owner-growth-relay-repair.md`。

当前 `GRT-036` 至 `039` 已接入生产：物化终态、部分完成、图片来源、取消分类和对象级 Issue 收口有唯一权威。自动验收已通过，但外部 Provider 整本复验仍由 `ACC-GRT-060` 保持未通过。

2026-08-09《赫尔墨斯环城》外部长跑已真实恢复到 97/97，并验证重开 Goal 的版本化层报告和终态报告；同时暴露 Clean Exit、历史 `run_growth` 时间线项和图片附件冲突债务，因此仍不足以关闭 `ACC-GRT-060`。证据见 `../../baseline/creatx-hermes-ring-live-2026-08-09.md`。
