---
title: Workbench Registry 能力线入口
doc_type: capability-entry
owner: workbench-registry
status: v3-visible-scope-implemented-not-provider-live
last_verified: 2026-08-10
source_of_truth: docs/capabilities/workbench-registry/product-spec.md
---

# Workbench Registry（工作台注册）能力线

本能力线拥有内置“文件”工作台、注册文件夹工作台、`.creatx/` 视图元数据、注册幂等、损坏隔离和注册工作台可见范围。内置“文件”是固定 `builtin:files` Projection（投影），不写 `.creatx`；注册记录严格读取 V1、V2 与 ADR-0012 接受的 V3。

第一条纵向闭环已经接通 Workbench Runtime（工作台运行时）、`register_workbench`、`rename_workbench`、Desktop API、工作台标签、损坏隔离和重启恢复。真实 DeepSeek/Cline 已在 Electron 中创建两份小说文件，以“未来来信”注册 `小说/`，再根据用户纠正把同一工作台改名为“小说”；首次运行与重启后均读取真实文件。注册证据见 `../../baseline/creatx-register-workbench-live-2026-07-27.md`，标题纠正证据见 `../../baseline/creatx-workbench-title-correction-live-2026-07-27.md`。

V3 的 `set_workbench_visibility` 已接入正式 Desktop Runtime（桌面运行时），但尚未取得外部 Provider 自主选择工具的 Live（真实运行）证据，不能把 AI 自主调用标记为已验收。

阅读顺序：`product-spec.md` → `workbench-v3.schema.json` → `acceptance.md` → `plan.md` → `../../adr/0012-workbench-v3-visible-scope.md` → `../../adr/0007-workbench-registration-v1-schema.md` → `../../adr/0002-project-files-are-the-content-model.md`。
