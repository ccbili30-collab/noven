---
title: GWP 图片附件严格恢复证据
doc_type: baseline-evidence
owner: image-runtime
status: verified-on-profile-copy
last_verified: 2026-08-09
source_of_truth: creatx/packages/image-runtime/src/queue-store.ts
---

# GWP 图片附件严格恢复证据

## 范围

本批修复项目打开时历史 GWP 图片附件冲突被逐条投影为全局错误的问题。主要能力线为 `image-runtime`，相邻合同为 `creative-skills` 的正式物化回执和 `workspace-ui` 的错误投影。本批不修改 Renderer、不直接修改正式 Profile、不处理图片 Provider 失败或 Session 状态。

## 实现

- `ImageTaskStore.reconcileAuthoritativeAttachmentIntent` 是正式回执使用的受限恢复入口；普通 `bindAttachmentIntent` 保持不可改绑。
- 同一文档的成功附件保持不变，待处理意图可规范化；只有成功图片且旧附件精确为 `image_attachment_conflict` 时重新执行挂接。
- 不同文档、取消任务和其他附件错误继续失败关闭。
- `ImageAttachmentService` 按相对图片目标识别既有标准 Markdown 图片引用，兼容未编码和 URL 编码中文路径，不因图注不同重复插图。
- Electron Main 的 GWP 回执绑定改用受限恢复入口；Renderer 和公开 Tool Schema 未变化，数据库 Schema 无迁移。

## 验收

- `bun run test:image-queue`：37/37。
- `node --experimental-transform-types --test packages/image-runtime/tests/document-attachment.node-test.ts`：4/4。
- `bun test ./packages/world-blueprint/tests/materialization.test.ts`：49/49，482 次断言。
- `bun test ./apps/desktop/tests/image-attachment-reconciliation.test.ts`：1/1。
- `bun run typecheck`：通过。
- 正式 Profile 只读审计：97 份回执中 92 条严格可恢复、3 条已成功挂接、1 条 Provider 失败、1 条历史中断；92 份可恢复文档均已有同一图片路径引用。
- 正式 Profile 完整副本真实执行 97 份回执：95 个附件成功、1 个图片任务保持失败、1 个保持中断、全部 Markdown SHA-256 变更为 0。

没有调用外部 Provider，没有运行全量测试、Production Build（生产构建）或打包，也没有在正式 Profile 执行恢复。

## 未完成与恢复入口

当前运行的 Windows `0.1.16` 不包含本修复。需要在后续发布批次构建并启动新版本，打开迁入项目后才能让正式 Profile 自动收敛；届时应复核 95/97 附件状态、两个真实图片失败边界和界面不再连续显示 `image_queue_conflict`。迁移 Owner Session 的 `failed_external_process_exit` 与本批无关，继续单独处理。
