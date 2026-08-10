---
title: Import Export 能力线入口
doc_type: capability-entry
owner: import-export
status: live-archive-live-portable-project-foundation
last_verified: 2026-08-10
source_of_truth: docs/capabilities/import-export/product-spec.md
---

# Import Export（导入导出）能力线

本能力线拥有项目内容和关联产品事实跨 Profile、跨设备或跨安装边界的打包、校验、接收、冲突和隐私语义。首个实现批次已经接通完整 Live 运行从隔离 Profile 晋升为本机正式产品档案；诺文项目包（`.np`）已完成 Schema、真实 ZIP 导入导出、安全导入和受控元数据 Runtime，但 `0.1.20` 明确不把它接入生产 Desktop 启动链，UI 与纵向闭环延期至 `0.1.21`。

相邻事实仍由原能力线拥有：项目文件归 `project-files`，会话归 `session` 和 Cline，Goal 归 `growth-runtime`，图片任务归 `image-runtime`。本能力线只协调，不建立第二份会话、Growth 或图片真相。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → `../../discussions/2026-08-06-live-run-product-archive.md`。

当前 Live 证据：`../../baseline/creatx-live-archive-promotion-2026-08-06.md`。便携项目包设计来源：`../../discussions/2026-08-10-portable-noven-project-package.md` 与 `../../adr/0013-portable-noven-project-package.md`。
