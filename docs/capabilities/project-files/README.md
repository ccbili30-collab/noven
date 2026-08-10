---
title: Project Files 能力线入口
doc_type: capability-entry
owner: project-files
status: portable-enumeration-verified
last_verified: 2026-08-10
source_of_truth: docs/capabilities/project-files/product-spec.md
---

# Project Files（项目文件）能力线

本能力线拥有 CreatX 对真实项目根、文件查询、外部修改投影以及未来版本和回收站的产品语义。Cline 原生文件和 Shell 工具的审批与全机信任边界归 `provider-harness`；本能力不包装 Cline 执行器来承诺第一版严格沙箱。

提交 `c9a4ae4` 已接通稳定项目 ID、真实扫描/读取、同源预览、外部修改刷新和重启读取。共享接口提交 `f289dd3` 建立 Main 内唯一 `ProjectFileService`；注册工作台纵向批次又完成安全目录枚举、内容/内部可见性和并发 create-only 写入。Watcher、版本和回收站仍未实现。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → `../../adr/0002-project-files-are-the-content-model.md` → `../../adr/0006-minimal-capability-ports-before-worktrees.md`。
