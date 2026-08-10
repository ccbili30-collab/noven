---
title: Workbench Annotation 能力线入口
doc_type: capability-entry
owner: workbench-annotation
status: implementation-verified-provider-open
last_verified: 2026-08-10
source_of_truth: docs/capabilities/workbench-annotation/product-spec.md
---

# Workbench Annotation（工作台视觉批注）能力线

本能力线拥有工作台当前可见画面的非破坏性蒙版、截图裁剪、内部图片附件注册及提交前草稿行为。它不拥有项目文件内容、会话消息、Provider（模型服务）能力或工作台注册。

相邻合同：`workspace-ui` 提供工作台表面；`project-files` 提供源文件身份；Desktop Runtime（桌面运行时）拥有安全截图和内部附件授权；Cline 拥有最终视觉消息与 Provider 调用。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → `../../plans/2026-08-10-workbench-visual-annotation.md`。

当前代码与 Electron 闭环已经验证；真实视觉 Provider 发送仍开放。最高证据见 `../../baseline/creatx-workbench-visual-annotation-2026-08-10.md`。
