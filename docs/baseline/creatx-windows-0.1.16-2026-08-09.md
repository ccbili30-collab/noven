# CreatX Windows 0.1.16 发布基线

日期：2026-08-09（Asia/Shanghai）

源分支：`topic-genre-style`

功能提交：`987121b feat(desktop): add visual chat attachments`

版本提交：`db0585a chore(desktop): package version 0.1.16`

包含能力：`WUI-005 / WUI-011 / PHS-024 / ACC-WUI-064 / ACC-WUI-065 / ACC-PHS-033`

## 发布内容

- PNG/JPEG 聊天附件经过真实签名与大小门禁后通过 Cline `userImages` 进入视觉输入，文本附件继续使用 `userFiles`。
- Composer（输入区）和持久用户消息显示图片缩略图，历史图片经 `creatx-attachment://` 受限协议打开大图。
- 普通消息成功进入运行态且尚无模型活动时立即显示“正在准备回复…”。
- 乐观图片消息与 Cline 持久消息合并为一条；发送失败前未消费的附件授权可恢复。

## 源码与构建验收

- 功能提交后的全量 `bun test`：456/456，通过，3,302 次断言，覆盖 58 个测试文件。
- 图片能力定向测试：111/111，通过，375 次断言。
- 隔离 Electron `bun run test:chat-image`：等待态、单次 image content 请求、消息去重、强制重载后的缩略图和大图通过；使用本地受控 Provider（模型服务），不是外部视觉 Provider Live（真实运行）。
- 版本提交只修改 `creatx/package.json` 的 `0.1.15` 到 `0.1.16`；提交后 `bun run typecheck` 通过。
- `bun run package:win`：退出码 0，用时 215.8 秒；Production Build（生产构建）、NSIS Setup、Blockmap 和 Portable x64 均生成。
- Setup 与 Portable 通过 7-Zip `t`，均为 `Everything is Ok`。
- `app.asar` 可读取，Main Bundle（主进程包）包含 `creatx-attachment`、PNG/JPEG 门禁，Renderer Bundle（渲染进程包）包含“正在准备回复…”。

## Windows 产物

| 产物 | 字节 | SHA-256 | 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.16-x64-Setup.exe` | 126,441,352 | `E34CED693E71333BC6A2A5B34F69D68923A006AD23C3831A6BECE4996973B301` | `0.1.16` | `NotSigned` |
| `creatx/release/CreatX-0.1.16-x64-Setup.exe.blockmap` | 133,970 | `5E3F304E53019F055C2AFB6DFF4E5B16C3C92DB61864F828C49E96B42E1120E7` | 不适用 | 不适用 |
| `creatx/release/CreatX-0.1.16-x64-Portable.exe` | 126,217,512 | `83852CB1EE8FA39D499A5F6BA6A701854B0323ECA96CACF9A05F894387541B2E` | `0.1.16` | `NotSigned` |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `9326EF45BC4179CDD841DFACEC33D4C1612C6B50EAEE6D6DB712A197124844E8` | `0.1.16` | `NotSigned` |

## 未完成与风险

- 未安装 NSIS Setup，未启动 Portable 或 `win-unpacked`，没有修改正式 Profile。
- 没有运行完整 `test:desktop`，也没有用打包后的 EXE 重跑图片交互；视觉证据来自同一功能提交的隔离源码 Electron 验收。
- 没有调用外部视觉 Provider；模型是否接受图片仍由真实 Provider/Cline 返回，系统不按模型名猜测。
- 首版视觉附件只支持 PNG/JPEG，不支持 WebP、GIF、SVG、PDF、视频或音频。
- Setup、Portable 与解包 EXE 均未进行 Authenticode（Windows 代码签名），系统可能显示未知发布者。

## 恢复入口

- 图片能力边界：`creatx-chat-image-attachments-2026-08-09.md`。
- 当前发布产物位于 `creatx/release/`；正常安装使用 Setup，免安装验证使用 Portable。
- 下一步若继续，应启动 Portable 并用真实视觉 Provider 做一次用户级图文对话验收；该动作会创建隔离或正式 Profile 状态，需明确选择。
