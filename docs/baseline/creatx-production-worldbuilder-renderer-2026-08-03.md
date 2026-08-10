---
title: CreatX 新版世界构建 Renderer 与 Windows 打包证据
doc_type: baseline
owner: workspace-ui
status: verified-without-provider-or-installer-wizard
last_verified: 2026-08-03
---

# CreatX 新版世界构建 Renderer 与 Windows 打包证据

## 范围

生产 Electron Renderer 以 `D:\CodexCache\Temp\creatx-redesign-preview` 为视觉与布局来源完成整体换壳。项目导航、真实会话、动态工作台树、中央真实 Markdown/图片画布和检查器组成唯一五区布局；原型 Fixture、固定分类、`data-command`、假路线详情和未接通绘图操作没有进入生产。

## 自动与 Electron 验收

- `bun run typecheck`：通过。
- `bun run build`：通过。
- `bun run test:desktop`：`DESKTOP PASS`。
- 覆盖外部附件、Markdown 和项目图片、Growth 权限门禁、waiting、暂停重启恢复、动态工作台、真实文件预览、1360×860、900×700、860×620、正常退出和进程回收。
- 独立打包应用探针从 `release\win-unpacked\CreatX.exe` 启动，观察到 `app.isPackaged=true`、`data-surface-mode=paper`、真实项目 Markdown、无页面溢出、无 Renderer 错误和正常退出。
- 证据截图：`artifacts/frontend-redesign/production-worldbuilder.png` 与 `artifacts/frontend-redesign/packaged-worldbuilder.png`。

## 发布产物

- `creatx/release/CreatX-0.1.0-x64-Setup.exe`，SHA-256 `107D7E78C09CCC9B1069BF5C5AADE09737A2E3B9BC75D5229FA667819818A320`。
- `creatx/release/CreatX-0.1.0-x64-Portable.exe`，SHA-256 `28506D44E358210294105CFAE56FDC5487BEEA6DC63B0A7AF9AC6801EF294B23`。

## 边界

- 本批没有有效文本或图片 Provider 调用，不是 Agent Live。
- 没有运行交互式 NSIS 安装向导；发布目录中的已打包应用已真实启动。
- 安装包没有产品图标和可信代码签名，Windows 可能显示未知发布者。
- 文本 Provider 仍只从进程环境读取。安装后双击启动不会自动读取仓库 `.env.local`；正式设置与凭据安全存储尚未实现，不能把密钥写进安装包。
- `bun add` 已把 `electron-builder 26.15.3` 写入锁文件，但 Bun 在既有 `@sap-ai-sdk/foundation-models` Windows 长路径链接上返回失败；CLI 实际包可执行并成功完成打包。该依赖安装缺陷仍需单独修复。
