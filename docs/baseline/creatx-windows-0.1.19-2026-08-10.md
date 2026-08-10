# 诺文 Windows 0.1.19 发布基线

日期：2026-08-10
功能头：`fd32fc61694a94ab8e795ece99fd219911743200`
版本与发布证据：本文件同批提交

## 发布内容

Windows `0.1.19` 在 `0.1.18` 基础上纳入 Draw Map V25：

- 清晰原生底图质量门禁、最多三次 Provider（模型服务）尝试和失败关闭。
- 根据底图真实视觉边界确定性推导完整同尺寸区域 ID 蒙版，并输出配准审查图。
- 纹理复杂岛屿按内部视觉盆地布种；边缘种子不会跨行绕回。
- Viewer（查看器）默认只显示纯净底图；选择当前陆地区域后才显示该区域金边并抬升，关闭或 `Esc` 后消失；水域原位高亮。
- Viewer 只缓存当前选择区域的全尺寸渲染层。

地图 V25 的真实 Provider 前向复验、32 区浏览器证据和限制见 `creatx-draw-map-v25-visual-boundaries-2026-08-10.md`。

## 产物

| 产物 | 字节 | SHA-256 | PE 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.19-x64-Setup.exe` | 126,671,686 | `2F00F212AE6AC82C3390EE7E73640A170919E9F60C127EBEBA9B2F31740D334E` | `0.1.19` | `NotSigned` |
| `creatx/release/诺文-0.1.19-x64-Setup.exe.blockmap` | 133,781 | `ED29A25DADD9F1E9F0ED41D26F34F3F4A406F462C2DDE84CED789F8FCC79DD49` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.19-x64-Portable.exe` | 126,447,881 | `CEB28E73931AB26E77E033BC7C1C57D0DA94660730EF7D181D67E28EC75396A2` | `0.1.19` | `NotSigned` |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `EC4C6E7B8E2654F8983A7BB2E82A7E9BE1DFAC352231E1BDECF34489592303BD` | `0.1.19` | `NotSigned` |
| `creatx/release/win-unpacked/resources/app.asar` | 171,007,178 | `8283398C8B3763581B314B2471C5BA979048E3A3A37076A3DF7D46F2666CDB63` | 不适用 | 不适用 |

三个 PE 的 `ProductName` 均为“诺文”。

## 验收

- Creative Skills、可见品牌和安装完整性定向测试：36/36，424 次断言。
- `bun run typecheck`：PASS。
- `bun run package:win`：Production Build（生产构建）、NSIS Setup、Blockmap 与 Portable x64 打包通过。
- 7-Zip `26.00` 对 Setup 和 Portable 执行 `t`，均为 Unicode NSIS，`Everything is Ok`。
- 直接读取 `app.asar`：`package.json` 为 `0.1.19`；Main Bundle（主进程包）包含 V25、`derive-region-mask.mjs` 和底图质量合同。解码打包 Viewer 与推导脚本后确认单区域缓存、默认无选择只绘制底图和边缘种子保护存在。
- `CREATX_TEST_EXECUTABLE=release/win-unpacked/诺文.exe bun run test:noven-brand` 使用隔离 Profile 与本地受控 Provider 通过，确认包可真实启动、渲染当前品牌/字体/Composer/消息交互并退出。
- 验收后 `release/win-unpacked` 下相关测试进程残留为 0。
- Draw Map V25 功能头在版本提升前已通过全量 480/480、3,435 次断言；版本批次未重复全量测试。

## 未验证与风险

- 没有安装 Setup，也没有直接启动自解压 Portable；安装目录升级、快捷方式和卸载链未验收。
- 本发布批次没有在打包 EXE 内重新执行“一句话生成地图 → 真实图片 Provider → 注册工作台”的完整 Agent Live（真实运行）；包内文件、独立真实地图前向和发布壳分别有证据，不能合并宣称打包端到端 Live。
- 没有运行完整 `test:desktop`。
- 产物未签名，Windows 可能显示 SmartScreen 警告。
- 当前旁路 `%APPDATA%\creative-skills\v25` 仍是先前手动安装参数错误留下的不扫描副本；正式应用目录 `%APPDATA%\creatx\creative-skills\v25` 与安装包内 V25 不受影响。

## 恢复入口

- 地图 V25 代码与真实前向证据提交：`fd32fc6`。
- 地图基线：`docs/baseline/creatx-draw-map-v25-visual-boundaries-2026-08-10.md`。
- 版本权威：`creatx/package.json`。
- 打包配置：`creatx/electron-builder.yml`。
- 如继续安装级验收，先确认没有共享正式 Profile 的诺文实例，再使用可回滚安装目录验证 Setup；不要并行运行新旧版本写同一 Profile。
