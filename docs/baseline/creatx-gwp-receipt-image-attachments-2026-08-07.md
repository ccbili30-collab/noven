---
title: GWP 回执驱动图片挂接自动化证据
doc_type: baseline-evidence
status: automated-verified
date: 2026-08-07
---

# GWP 回执驱动图片挂接自动化证据

## 已实现

- `WorldMaterializationReceipt` 的 `artifactPath + imageTaskId` 成为 GWP 生成关系权威。
- 新回执、精确回执重放和历史回执扫描均派生同一挂接意图；Writer 不再手工复制 `attachment`。
- 图片队列复用 V2 现有字段幂等绑定；图片与回执任意先后顺序都进入唯一 `ImageAttachmentService`。
- 项目进入后，Electron Main 从所有权威世界扫描正式物化回执并后台对账；对账错误不阻塞项目打开。
- 异义关系失败关闭，游离任务不猜测；图片成功与挂接失败分别保存。本证据形成时所有挂接失败均进入最终 Owner 汇报，后续 `../discussions/2026-08-07-silent-image-attachment-mismatch.md` 将 `image_attachment_conflict` 改为只保留内部证据，其他挂接故障继续汇报。
- 失败/中断任务重试进入项目队尾；排队任务才可“跳到最后”；Renderer 按状态分区并直接显示错误摘要与可展开技术详情。

## 自动验收

- `bun install --frozen-lockfile`：通过，746 个 Package（包）中的 708 个安装项无变化。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node 导入边界均通过。
- `bun run test:image-queue`：28/28，通过；使用真实 SQLite、真实 Project File Port 和真实 `ImageAttachmentService`，Provider HTTP 为本地测试响应。
- `bun run test`：358/358，通过，2,964 次断言。
- `bun run build`：Electron Main、Preload 与 Renderer 生产构建通过。
- `git diff --check`：通过。

全量首次运行中，一个大型物化集成测试在并行负载下超过 Bun 默认 5 秒并触发清理竞态；该用例定向运行约 3 秒。只把该用例的显式预算调整为 15 秒后，全量测试在 3.53 秒完成该用例并整体通过，没有改变生产逻辑。

## 未验证边界

- 没有调用外部图片 Provider，不是付费生图 Live（真实运行）证据。
- 没有启动 Electron，不是项目打开时历史对账与 UI 视觉的桌面 Live。
- 没有修改《灰冠诸境》《太衡界世界》或正式 `image-queue.sqlite`；旧世界只有在包含本批代码的新应用中打开后才会走正式对账。
- 两个 Store 之间采用持久回执与幂等重放的最终一致性，不提供跨 SQLite 原子事务。
