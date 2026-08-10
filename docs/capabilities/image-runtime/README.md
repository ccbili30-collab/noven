---
title: Image Runtime 能力线入口
doc_type: capability-entry
owner: image-runtime
status: growth-source-and-path-normalization-verified
last_verified: 2026-08-08
source_of_truth: docs/capabilities/image-runtime/product-spec.md
---

# Image Runtime（图片运行时）能力线

本能力线拥有图片 Provider（模型服务）调用、响应校验、候选字节和候选落盘语义。当前包括文本生图、持久文本生图队列和独立同步图片编辑，不建设通用 Provider 平台。

`gpt-image-2-cheap` 与 `gpt-image-2` 已分别通过真实调用、图片校验、项目文件落盘和重读一致验收；证据见 `../../baseline/creatx-image-provider-pilot-live-2026-07-27.md`。第一条自然语言 Electron 闭环也已接通同步 `generate_image`、Cline 原生审批、JMRAI、真实项目图片、文件预览和重启恢复；证据见 `../../baseline/creatx-image-electron-live-2026-07-28.md`。

ADR-0009 接受的 `submit_image_generation` 和持久队列已进入生产代码，供普通会话、Growth 和 Growth World Pro 在生图时继续文本工作。2026-08-07 项目通道已经实现：同项目严格单并发、全局最多两个项目并行、公平轮转、Attempt 历史、重试/跳过/取消、Agent 管理工具和当前项目进度栏均通过自动验证。取消生成中任务后，只有旧 Provider Promise 落定才释放同项目通道；应用重启仍不自动重提结果未知的付费请求。

GWP 的正文—图片生成关系现由持久物化回执派生：回执与图片任意先后顺序均进入队列中央绑定，项目打开后从所有权威世界幂等对账历史缺口；异义绑定失败关闭，游离任务不猜测。最终 Markdown 仍是内容关系权威。自动化证据见 `../../baseline/creatx-gwp-receipt-image-attachments-2026-08-07.md`，正式旧世界与 Electron 视觉尚未 Live。

历史 GWP 任务若把 `# 标题` 等 Markdown 语法误作纯标题锚点，正式回执对账现在可以在“同一任务、同一文档”的严格门禁内恢复：成功附件保持不变，待处理意图只规范化，只有成功图片的旧位置冲突重新挂接；不同文档和其他错误继续失败关闭。同一图片路径的已存在 Markdown 引用不再因图注或中文路径编码差异重复插入。决定与验证见 `../../discussions/2026-08-09-image-attachment-reconciliation-recovery.md` 和 `../../baseline/creatx-image-attachment-recovery-2026-08-09.md`。

正文标题或锚点不再匹配时，`image_attachment_conflict` 继续保留为内部诊断证据，但不再进入活动栏、项目打开全局错误或 GWP Owner 汇报。系统不会猜测插入位置或改写正文；其他挂接故障仍保持可见。决定见 `../../discussions/2026-08-07-silent-image-attachment-mismatch.md`。

图片请求没有取得 HTTP 结果时，Runtime 现在从嵌套错误链提取安全的 DNS、TLS、连接拒绝、连接重置、超时或未知类别；同项目进入 30 秒内存冷却，余下任务保持排队，避免瞬时连接故障冲掉整批图片。结果未知的原任务仍不自动重提，其他项目继续运行。决定与现场证据见 `../../discussions/2026-08-07-image-transport-failure-isolation.md`。

队列现在也是项目统一视觉母版的唯一注入入口：它从目标图片路径向上读取最近的 `<作品根>/视觉设定/统一画风.md`，持久化并发送同一份最终 Prompt。精确幂等重试复用首次 Prompt；缺失母版保留原请求并产生警告，Growth World Pro 最终汇报据此披露未统一图片。本能力没有新增图片表字段、视觉版本状态机或 Renderer 逻辑。

新任务的目标路径在队列唯一入口统一为 `/`，因此 Windows 反斜杠和正斜杠精确重试共享同一幂等身份；不安全路径在母版读取、Store 和 Provider 前失败关闭。旧任务保持读取兼容，不执行 SQLite 路径迁移。

`edit_image` 已接入 Image Runtime 和生产 Main，使用项目内底图与 Alpha PNG 蒙版调用 JMRAI `/images/generations` 的兼容编辑字段。`gpt-image-2` 正式 Runtime Live 已落盘，`gpt-image-2-cheap` 本次为结果未知；标准模型明显全图重绘，因此接口成功不等于地图严格对齐。证据见 `../../baseline/creatx-image-edit-provider-live-2026-07-30.md`。

项目文件仍由 `project-files` 拥有。Image Runtime 只能通过 `ProjectFileCommandPort` 使用 `projectId + relativePath` 落盘，不持有项目绝对根目录。图片成功后的可选文章挂接由唯一 `ImageAttachmentService` 通过文件端口形成标准 Markdown 引用；任务中的挂接意图不是第二份内容关系权威。Markdown 环绕和普通 HTML 隔离预览由 `workspace-ui` 投影真实文件，不读取图片数据库猜测关系。

阅读顺序：`product-spec.md` → `acceptance.md` → `plan.md` → `../../baseline/creatx-project-image-workflow-2026-08-07.md` → `../../baseline/creatx-image-edit-provider-live-2026-07-30.md` → `../../baseline/creatx-image-queue-runtime-2026-07-28.md`。
