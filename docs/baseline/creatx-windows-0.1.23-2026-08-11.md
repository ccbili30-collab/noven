# 诺文 Windows 0.1.23 发布候选基线

日期：2026-08-11
集成分支：`release-023`
PR 合并提交：`3164eac`
0.1.22 后恢复能力合并提交：`53d8274`
发布提交：`d45bd1c`

## 已实现

- 抖音链接可从 Composer（输入区）粘贴或拖入，进入普通 Cline 会话的 `analyze_video` Tool（工具）。
- Desktop 用应用 Chromium 与 CDP（浏览器调试协议）读取平台真实签名详情，Runtime 负责公共地址门禁、下载、字幕/ASR（自动语音识别）、可选关键帧、取消和原子留存。
- 默认只取文案；长视频按 60 秒切片形成时间锚点；画面显式按需。
- Windows 包携带固定 `yt-dlp.exe` 与 LGPL `ffmpeg.exe`，位于 `resources/vendor/win-x64` 而非 `app.asar`。
- 文本 Provider 改为稳定选项；未知值前后端失败关闭，旧档案只在唯一可证明时修复。
- 同一版本保留生产十步教程、艺术库 63 件恢复、工作台注销、“恢复诺文”和两个非阻塞错误的短暂恢复提示。

## 自动验收

- 集成冲突定向：61/61，通过，213 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项 Import Boundary（导入边界）通过。
- `bun run test`：653/653，通过，4,698 次断言，88 个测试文件。
- `bun run build`：Production Build（生产构建）通过。
- `bun run check:video-vendor`：先在干净工作树证实缺失 EXE 会失败关闭；下载后 `yt-dlp 2026.07.04` 与固定 FFmpeg 共 133,349,797 字节通过摘要校验。
- `bun run package:win`：Windows NSIS、Blockmap 与 Portable 生成成功。
- 7-Zip `26.00`：Setup 与 Portable 均 `Everything is Ok`。
- `app.asar`：版本 `0.1.23`，包含视频分析、Provider 修复、应用重启、教程和软错误恢复逻辑。
- 包内 `yt-dlp.exe` SHA-256 `52FE3C26DCF71FBDC85B528589020BB0B8E383155CFA81B64DD447BBE35E24B8`；`ffmpeg.exe` SHA-256 `A8A5274D0C5DB42BE41FE5D78BA27A346F65C4DBD83CF2CC322B1A4B794AFA59`，与来源目录一致。
- Setup 静默安装到隔离目录成功；安装版 `诺文.exe` 版本 `0.1.23.0`、ProductName（产品名）“诺文”，品牌/UI 烟测通过。
- 解包 EXE 十步教程通过：首次/中断恢复/完成/展开与折叠重播/减弱动效均通过，Provider 请求 0、项目写入 0。
- 解包 EXE 应用重启通过：项目与会话恢复，活动回复确认先取消再确认，Provider 请求总数 1、自动重放为 0。自动化曾因只清理 `electron.exe` 而留下打包名 `诺文.exe`，修正测试清理边界后重跑通过。

## 产物

| 文件 | 字节 | SHA-256 | 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.23-x64-Setup.exe` | 174,755,370 | `970908C6DEC3E23419C88B752F00C66B400D0B51FCF4B220135944D6664EB6CF` | `0.1.23` | NotSigned |
| `creatx/release/诺文-0.1.23-x64-Setup.exe.blockmap` | 183,907 | `E3B5010E81B783BA46952B1D07CBFB7B552667B75CC0683C6B96CFB3BB134E24` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.23-x64-Portable.exe` | 174,531,651 | `A4F3C6D625029FD39343679352E654574A7666D2D38983406E29FDB4CB54A2DE` | `0.1.23` | NotSigned |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `EE9631DBC5E9D3BF9CF57777522DB36552BAF2862FFC6ED3AD8D42992AF6CA9E` | `0.1.23.0` | NotSigned |

## 未完成与限制

- 当前环境没有外部文本/转写 Provider 配置，PR 没有保留实际测试视频 URL；没有完成打包 EXE 从 UI 粘贴或拖入链接、真实转写到模型回答的纵向 Live。Runtime 的真实端到端证据与包内字节一致不能替代该 UI 证据。
- PR 报告的真实 33 分 13 秒视频流水线产生 34 段时间戳和 12,166 字文案，但该结果来自 PR 工作环境，本集成批未重放。
- ASR 会误听专有名词，例如《蔑视》可能成为“面试”、Giger 可能成为“及格尔”；纯歌唱可能乱码。
- 当前可能为 11.4 MiB 音频下载约 295 MB 视频，尚未选择低码率源优化。
- 没有直接启动 Portable、没有代码签名、没有使用正式 Profile。

## 恢复入口

- 视频能力：`docs/capabilities/video-analysis/`、`creatx/packages/video-runtime/`。
- 平台提取：`creatx/apps/desktop/src/douyin-page-extractor.ts`、`douyin-cookies.ts`。
- Provider 修复：`creatx/packages/model-settings/src/index.ts`、`docs/capabilities/provider-harness/`。
- UI Live 缺口：`ACC-VID-011`。
