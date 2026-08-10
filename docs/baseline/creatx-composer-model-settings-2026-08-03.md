---
title: CreatX Composer 与模型配置基线
doc_type: baseline-evidence
status: implemented-and-electron-verified
last_verified: 2026-08-03
---

# CreatX Composer 与模型配置基线

## 已实现

- Composer 底栏采用 `+ → 附件`、当前权限、交流模型下拉、停止/发送的顺序，不显示语音入口。
- 交流模型配置保存显示名、Provider、Model、可选 Base URL 和 API Key；空闲会话通过 Cline `0.0.65` 公共连接更新接口在下一轮切换，保留历史。
- 生图配置独立保存 Base URL、默认 `gpt-image-2-cheap` / `gpt-image-2` 与 API Key，只由图片工具和队列在调用时读取。
- API Key 由 Electron `safeStorage` 加密后写入用户数据目录。Renderer 只获得 `apiKeyConfigured`，密码输入框不会回填密钥。
- 活动 Run 由 Adapter 拒绝切换，活动 Growth 由 Main Handler 拒绝切换。Profile ID 进入会话元数据，重启不按同名模型猜测连接。

## 验收证据

- `bun run test`：187/187，通过 1,175 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 边界通过。
- `bun run build`：Electron Main、Preload 与 Renderer 生产构建通过。
- `bun run test:desktop`：`DESKTOP PASS`。验证 `+` 菜单、附件、模型下拉、交流/生图分区、密码不回填、配置文件无明文 Key、保存后重启恢复、三个窄视口、Growth 重启和无残留进程。
- Windows 安装版已更新为 `creatx/release/CreatX-0.1.0-x64-Setup.exe`。因旧便携版进程仍由用户运行、同名文件被 Windows 锁定，新便携版输出到 `creatx/release/model-settings/CreatX-0.1.0-x64-Portable.exe`；没有终止用户进程或把旧文件冒充新产物。
- 新 `release/model-settings/win-unpacked/CreatX.exe` 以 `app.isPackaged=true` 完整重跑 Desktop 探针并通过，包括模型设置保存、加密文件检查和重启恢复。
- Cline 定向集成使用真实 SDK 与本地 HTTP Provider，验证 `deepseek-chat → gpt-5.6-luna` 下一轮切换、三轮历史保留、Base URL/Authorization 生效和重启按 Profile ID 恢复。
- Image Runtime 定向测试验证运行时构造后修改连接，下一次图片工具使用新 Base URL、Key 和默认模型；队列也动态读取默认模型。

## 未验证与限制

- 本批没有调用外部有效文本或图片 Provider，因此不是新的 Provider Live 证据；既有图片 Live 仍由原基线承担。
- Cline `0.0.65` 的 `updateSessionConnection` 不复用 CreatX Adapter 注入的代理 Fetch。直连与本地 HTTP 已验证，需要系统代理的切换后连接尚未单独 Live 验证。
- 连接删除、连接排序、模型目录发现、API Key 明文回显和语音入口均未实现。

## 恢复入口

从 `creatx/packages/model-settings/src/index.ts`、`creatx/packages/cline-adapter/src/index.ts` 的 `switchSessionConnection`、`creatx/apps/desktop/src/main.ts` 的四个模型设置命令，以及 `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx` 的 Composer/配置抽屉继续。
