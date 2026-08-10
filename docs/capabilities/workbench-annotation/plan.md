---
title: Workbench Annotation 实施入口
doc_type: capability-plan
owner: workbench-annotation
status: implementation-verified-provider-open
last_verified: 2026-08-10
---

# Workbench Annotation 实施入口

依赖顺序：截图/裁剪原型 → 纯批注状态机 → 工作台蒙版 → HSV/取色 → 内部附件注册 → 真实 Electron 与视觉 Provider 验收。截图不能跨图片、Markdown、HTML 和 DPI 稳定贴合时立即停止生产扩展。

详细任务、文件和命令见 `../../plans/2026-08-10-workbench-visual-annotation.md`。

2026-08-10：截图、状态机、蒙版、调色盘/吸管、受控附件、失败恢复及三表面 Electron 验收已完成。外部视觉 Provider Live 与非视觉模型发送失败关闭仍待具备隔离配置后执行。
