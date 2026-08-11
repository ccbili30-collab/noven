---
title: Desktop Runtime 能力线入口
doc_type: capability-entry
owner: desktop-runtime
status: user-initiated-restart-electron-live
last_verified: 2026-08-11
source_of_truth: docs/capabilities/desktop-runtime/product-spec.md
---

# Desktop Runtime（桌面运行时）能力线

本能力线拥有 Electron 应用窗口、单实例门禁、Main 与 Utility Process 生命周期、正常退出、用户主动整应用重启和残留进程边界。Renderer 只提供入口与状态投影，不直接创建、销毁或重启 Cline。

相邻合同：

- `provider-harness` 拥有固定 Cline、Utility Process 内 Adapter（适配层）和失败关闭。
- `session` 拥有重启后的历史读取与禁止自动重放。
- `workspace-ui` 拥有左下入口、确认 Dialog（对话框）和当前项目/会话视图偏好。
- `image-runtime` 拥有生成中图片被退出标记为中断的语义。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → `../../discussions/2026-08-11-application-restart-recovery.md`。

当前最强证据：`../../baseline/creatx-application-restart-recovery-2026-08-11.md`。
