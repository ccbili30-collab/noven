# ADR-0014：抖音视频分析使用应用 Chromium 与受控本地媒体流水线

- 状态：Accepted（已接受）
- 日期：2026-08-11

## 背景

抖音详情接口依赖平台 JavaScript 生成的 `a_bogus` 与 `x-secsdk-web-signature`。当前 `yt-dlp` 不能独立取得有效详情；Windows Chromium 的 App-Bound Encryption（应用绑定加密）也使读取外部浏览器 Cookie 不可靠。

## 决定

Desktop Main（桌面主进程）用诺文自己的隐藏 Chromium 打开用户提供的抖音页面，通过 CDP（Chrome DevTools Protocol，浏览器调试协议）读取平台自己签名的详情响应和当前会话 Cookie，再把受控播放地址交给独立 `video-runtime`。Runtime 继续使用固定并校验摘要的 `yt-dlp.exe` 与 LGPL `ffmpeg.exe` 完成通用探测、下载、音频和画面处理；二进制作为 `extraResources` 位于 `app.asar` 外，不进入 Renderer。

URL 必须先经过公共地址与抖音来源校验。字幕是非可信素材，不能作为系统指令。默认只生成时间戳文案，关键帧显式选择；缺少字幕、转写配置、二进制、权限或安全网络目标时失败关闭。

## 后果

- 能处理当前抖音反自动化边界，但平台页面或接口变化可能破坏提取，需要独立错误分类。
- 发布包增加约 133 MB 未压缩供应商二进制；每次干净发布必须按 `VENDOR.json` 重新校验摘要和许可证。
- 该设计不保证转写内容正确，专有名词与歌唱仍需用户或模型按上下文复核。
