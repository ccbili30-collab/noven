# CreatX 对话图片附件与即时等待反馈基线

日期：2026-08-09
能力：`WUI-005 / WUI-011 / WUI-043 / PHS-024`
验收：`ACC-WUI-064 / ACC-WUI-065 / ACC-PHS-033`
状态：代码、自动化与隔离 Electron 通过；外部视觉 Provider 未验收

## 已实现

- 普通消息进入 `running` 且尚无 Assistant、Reasoning（推理）或工具内容时，Assistant 一侧立即显示“正在准备回复…”。首个真实活动、失败、取消、结果未知或切换会话后移除。
- PNG/JPEG 通过真实文件签名识别；单图上限 10 MiB、单批图片上限 20 MiB。伪造图片、含 NUL 的未支持二进制、缺失、变化和超限在 Provider（模型服务）请求前失败关闭。
- 图片转换为 Data URL 后进入 Cline `userImages`；文本文件继续进入 `userFiles`。Cline Core 未修改。
- Composer（输入区）显示待发送图片缩略图；用户消息显示单条持久图片缩略图，点击可查看大图。
- 历史图片从 Cline 持久 image content block 通过 `creatx-attachment://` 受限协议按消息身份读取。Renderer 不取得绝对路径、Base64 或通用本机文件接口，也没有第二套消息/附件数据库。
- 乐观消息与持久消息按附件稳定类型、媒体类型和文本文件名合并，不再因 basename（文件名）与绝对路径不同显示两条。

## 自动验收

工作目录均为 `D:\CodexW\Creatx\creat1\creatx`。

- `bun test apps/desktop/tests/attachments.test.ts apps/desktop/renderer/tests/attachment-selection.test.ts apps/desktop/renderer/tests/timeline-channels.test.ts`
  - 22/22，通过，65 次断言。
- `bun test packages/cline-adapter/tests/projection.test.ts`
  - 50/50，通过，126 次断言。
- `bun test packages/cline-adapter/tests/attachments.test.ts`
  - 39/39，通过，184 次断言。
- `bun run typecheck`
  - 通过。
- `bun run test:imports`
  - Cline 与 Node strip-types 两项 Import Boundary（导入边界）通过。
- `bun test`
  - 全量 456/456，通过，3,302 次断言，覆盖 58 个测试文件。
- `bun run build`
  - Main、Preload 与 Renderer Production Build（生产构建）通过。
- 使用用户提供的真实 JPEG 直接调用生产附件分类器：
  - 文件 299,332 字节；识别为 `image/jpeg`；输出 `data:image/jpeg;base64,...`；文本文件数为 0。

上述定向集合共 111 项、375 次断言；它们有重叠能力边界，但最终数字没有重复累计同一次命令。

## 隔离 Electron 验收

命令：`bun run test:chat-image`

- 使用隔离临时 Profile、真实 Electron、真实 Cline Session/SQLite 和延迟 1.2 秒的本地受控 OpenAI-compatible Provider。
- Provider 请求数 1，正文含真实图片 Base64，不含 `Error fetching content`。
- 延迟期间出现“正在准备回复…”，首个回复后消失。
- 用户消息保持 1 条，没有乐观/持久重复。
- 强制重载页面并重新选择会话后，图片仍从 Cline 历史受限协议加载；点击后大图可见。
- 证据：
  - `artifacts/chat-image/chat-image-waiting.png`
  - `artifacts/chat-image/chat-image-preview.png`

该 Provider 只证明请求形状、Cline 持久化与桌面交互，不是外部视觉 Provider Live（真实运行），也不证明任意文本模型支持图片。

## 未完成与限制

- 首版只支持 PNG/JPEG；WebP、GIF、SVG、视频、音频、PDF 和其他二进制不属于本批。
- 没有新增模型 Profile 的“支持视觉”字段；不支持视觉的模型由真实 Provider/Cline 返回准确失败。
- 本批未运行完整 `test:desktop` 或外部 Provider；随后已从同一功能头生成 Windows `0.1.16`，证据见 `creatx-windows-0.1.16-2026-08-09.md`。
- Cline 会在 Provider 失败前持久化已接纳的用户输入；失败后重新发送可能在 Cline 历史保留同文输入，本批不改写 Cline 历史。

## 恢复入口

- 产品规则：`docs/capabilities/workspace-ui/product-spec.md` 的 `WUI-005 / WUI-011`。
- Harness 规则：`docs/capabilities/provider-harness/product-spec.md` 的 `PHS-024`。
- Main 授权与分类：`creatx/apps/desktop/src/attachments.ts`。
- 受限协议：`creatx/apps/desktop/src/conversation-attachment-protocol.ts`。
- Cline 图片发送与历史投影：`creatx/packages/cline-adapter/src/index.ts`。
- Renderer：`creatx/apps/desktop/renderer/src/WorkspaceShell.tsx` 与 `timeline-channels.ts`。
