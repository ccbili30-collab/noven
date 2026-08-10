---
title: Project Files 实现计划
doc_type: capability-plan
owner: project-files
status: workbench-extension-complete-followups-open
last_verified: 2026-07-27
---

# Project Files 实现计划

第一条骨架建立项目 ID、真实根解析、扫描/读取和显式刷新，让获批 Cline 工具写出的文件能进入真实 UI。2026-07-27 接口批次再将项目根 Map 收敛进 `ProjectFileService`，实现 Query/Command Port、安全文本/二进制写入和修改时间冲突门禁。它不包装 Cline 内置执行器，不实现通用权限系统、持续 Watcher、版本或回收站。

状态：骨架范围已由提交 `c9a4ae4` 完成；共享 Port 代码和失败路径已经通过定向测试，完整批次证据见 `../../baseline/creatx-six-line-interface-enablement-2026-07-27.md`。

`creat1` 已按注册工作台纵向计划完成 PFL-007/PFL-008，并通过 `ACC-PFL-009` 至 `011`。便携项目包新增的 PFL-009/PFL-010 与 `ACC-PFL-012..013` 由 `../../plans/2026-08-10-portable-noven-project-package.md` 实施；可靠监听、内容级冲突、版本或回收站仍是其他独立任务。
