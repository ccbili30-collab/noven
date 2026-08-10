# 诺文 Windows 0.1.20 发布基线

日期：2026-08-10
功能头：`9b6562e`（Causality）
版本、`.np` 启动断开与发布证据：本文件同批提交

## 发布内容

Windows `0.1.20` 汇总 `0.1.19` 之后已经进入主线的艺术库、灵感库、传承库、工作台、会话交互与 Creative Skills 更新，并新增内置 `/causality`：

- Causality 只投影项目中明确存储的 `type: "causes"`，生成确定性离线 Viewer（查看器）；普通引用、采用、所有权和共现不冒充因果。
- Causality 对多世界歧义、无明确因果、损坏 Goal、输出归属冲突与真实路径越界失败关闭。
- `.np` Task 1–7 的 Runtime（运行时）源码与测试保留，但 `0.1.20` 不提供、宣传或隐藏接入 `.np` 用户能力。
- Production Main（生产主进程）、Preload（预加载桥）、Desktop API（桌面接口）和根应用依赖图均不包含 `@creatx/project-package-runtime`；Task 8 协调器源码仅作为 `0.1.21` 恢复材料。

发布冻结最初发现隐藏 `.np` Desktop 接线会在窗口创建前触发 Node ESM（模块系统）加载失败。源码通过但打包 EXE 无窗口的证据否定了“无 UI 即不影响发布”的假设；最终发布采用完全断开生产启动链，而不是保留隐藏入口。

## 产物

| 产物 | 字节 | SHA-256 | PE 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.20-x64-Setup.exe` | 126,784,754 | `9D20613D8FC0C7C95182DA86064728923D93344C9DBF19634DBA5BDC266EA50C` | `0.1.20` | `NotSigned` |
| `creatx/release/诺文-0.1.20-x64-Setup.exe.blockmap` | 133,764 | `85D233255CC5069B27CF19FA7A3CE4A8D120997125383A79D00501FA9AC58FFB` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.20-x64-Portable.exe` | 126,560,912 | `CA3562D13C531C6B246EF12A45361D0CC3E6D3276C6ADE4538A6C861A77BDC7E` | `0.1.20` | `NotSigned` |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `25F7AF6D1C20F5416033FD54BB5906088380B24F7BA4840F55B984717F26AA24` | `0.1.20.0` | `NotSigned` |
| `creatx/release/win-unpacked/resources/app.asar` | 171,436,638 | `F1666B4FF6E3C23E60A070D6D71BECCF507DDC7D6A1402B5D1C61080623DBD8F` | 不适用 | 不适用 |

三个 PE 的 `ProductName` 均为“诺文”。

## 验收

- 代码冻结后的全量：595/595，4,468 次断言，82 个测试文件。
- `.np` 断开与 Cline Projection 定向：53/53，136 次断言；Project Package Runtime 与保留协调器定向：49/49，195 次断言。
- `bun run typecheck`、`bun run test:imports`、`bun run build`：PASS。
- `bun run package:win`：Production Build、NSIS Setup、Blockmap 与 Portable x64 打包通过。
- 7-Zip `26.00` 对 Setup 和 Portable 执行 `t`，两者均为 Unicode NSIS 且 `Everything is Ok`。
- 直接读取 `app.asar`：版本为 `0.1.20`；根依赖和文件树均不包含 `@creatx/project-package-runtime`；Main/Preload 不含项目包服务或接口标志；Main 包含 `creatx-causality` 与 `build-causality.mjs`。
- `CREATX_TEST_EXECUTABLE=release/win-unpacked/诺文.exe bun run test:noven-brand` 使用隔离 Profile 与本地受控 Provider（模型服务）通过，确认打包 EXE 能创建窗口、加载字体和当前界面、完成消息与图片交互并退出；残留进程为 0。

## 未完成与风险

- `0.1.20` 没有 `.np` Renderer UI、Desktop API 或可调用入口；Task 8–11 与生产重新接线明确延期至 `0.1.21`。
- `.np` 的 Runtime 和保留协调器测试通过不等于用户功能可用，也不等于 Electron 纵向闭环。
- 没有安装 Setup，也没有直接启动自解压 Portable；安装目录升级、快捷方式、卸载链和 Portable 外壳启动未验收。
- 没有运行完整 `test:desktop`，没有外部 Provider Live（真实运行）或在打包 EXE 内跑完整 Causality Agent 流程。
- 产物未签名，Windows 可能显示 SmartScreen 警告。

## 恢复入口

- Causality 提交：`9b6562e`。
- Causality 基线：`docs/baseline/creatx-causality-skill-2026-08-10.md`。
- `.np` 恢复计划：`docs/plans/2026-08-10-portable-noven-project-package.md` Task 9；恢复时必须连同 UI、重启和打包验收一次性接回，不能只恢复隐藏 Preload 接口。
- 版本权威：`creatx/package.json`；打包配置：`creatx/electron-builder.yml`。
