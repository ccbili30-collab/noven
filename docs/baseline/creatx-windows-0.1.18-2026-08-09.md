# 诺文 Windows 0.1.18 发布基线

日期：2026-08-09  
功能头：`a905275337225e20cf2f2472c7895a426c48f389`  
版本与发布证据：本文件同批提交

## 发布内容

Windows `0.1.18` 首次以“诺文”作为用户可见产品、可执行文件和产物名，包含：

- 诺文可见品牌、JetBrains Mono 离线字体与“灵感库”名称。
- Skill 紧邻“自由 / 审批”以及 `14×14px` 前置勾选。
- 用户气泡移除“你”，消息操作只在 Hover（悬停）/焦点展开文字，对话图片 `10px` 圆角和透明滚动轨道。
- 活动 Run（运行）把原 `34×34px` 发送按钮原位切换为灰色停止方块，不再增加独立停止按钮。

内部 `appId: com.creatx.desktop`、包名、协议、Desktop API、LocalStorage 和 Profile（用户数据目录）保持兼容身份，没有迁移。

## 产物

| 产物 | 字节 | SHA-256 | PE 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.18-x64-Setup.exe` | 126,642,034 | `4351128BD8B7EF4E9888EDDC90A0C26B4C342320249BAD83586918BD7D50F272` | `0.1.18` | `NotSigned` |
| `creatx/release/诺文-0.1.18-x64-Setup.exe.blockmap` | 134,080 | `DA9075AC8F0364C45817A97F91230DEAB7723F86AA9FB624CBB948D7A25A9FC4` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.18-x64-Portable.exe` | 126,418,202 | `EF178F798BC6E3E5AF9CD7AF04B03BE1DA7A8165C467A3166E5FD87D0B6E0405` | `0.1.18` | `NotSigned` |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `DCAF52A2F93A5F4E4D7E5F8C1F179CC9496F7AA50DFB08430F54F33C8D667144` | `0.1.18` | `NotSigned` |

四个 PE 元数据中的 `ProductName` 均为“诺文”（Blockmap 不适用）。

## 验收

- `bun run typecheck` 通过。
- `bun test apps/desktop/tests/visible-brand.test.ts`：1/1、6 次断言通过。
- `bun run package:win`：Production Build（生产构建）、NSIS Setup 与 Portable 打包通过。
- 7-Zip `26.00` 对 Setup 和 Portable 执行 `t`，两者均为 Unicode NSIS 且 `Everything is Ok`。
- 直接读取打包 `app.asar`：包含主 Renderer 与艺术库四份 JetBrains Mono WOFF2；Bundle（构建包）含“诺文”“灵感库”“wb-send is-stop”和透明滚动轨道规则，不含旧 `.wb-stop-run`。
- `CREATX_TEST_EXECUTABLE=release/win-unpacked/诺文.exe bun run test:noven-brand` 使用隔离 Profile 和本地受控 Provider（模型服务）通过：主界面/艺术库字体真实加载；Skill 位置与小勾选正确；消息操作 Hover、图片圆角、透明轨道和发送/停止原位替换均符合 `ACC-WUI-071`。
- 验收后 `诺文.exe / electron.exe` 测试进程残留为 0；原先运行的正式 `CreatX.exe` 仍是同一 5 个进程，未关闭或修改。

## 未验证与风险

- 没有安装 Setup，也没有直接运行自解压 Portable；真实安装目录升级、桌面快捷方式、开始菜单和卸载显示名尚未做安装级验收。
- 没有调用外部 Provider Live（真实运行），也没有运行全仓全量或完整 `test:desktop`。
- 产物未签名，Windows 可能显示 SmartScreen 警告。
- 中文可执行文件和产物名已通过构建、PE、NSIS 归档与解包 EXE 验收；仍需在真实安装时确认第三方脚本或用户自动化没有硬编码旧 `CreatX.exe` 文件名。

## 恢复入口

如继续安装级验收，先关闭所有旧正式 CreatX 进程，再在可回滚测试目录安装 `诺文-0.1.18-x64-Setup.exe`，确认复用原 `com.creatx.desktop` 安装身份和正式 Profile；未完成该确认前不要并行启动新旧版本共享同一 Profile。
