# CreatX Windows 0.1.15 发布基线

日期：2026-08-09（Asia/Shanghai）

源分支：`topic-genre-style`

版本提交：`46c5006 chore(desktop): package version 0.1.15`

包含能力：`WUI-043 / SES-014 / ACC-WUI-061..063 / ACC-SES-021`

## 发布内容

- 项目普通会话按项目持久分配 `创作（n）`，显示名与 Session ID 独立。
- 文件可拖入整个 Chat 成为待发送附件，通过 Preload/Main 授权链，Renderer 不接触绝对路径。
- 用户消息支持本机删除、修改和重发；成功后隐藏原消息，失败或取消恢复原消息，修改失败同时恢复草稿与编辑态。
- 生产桌面固定为“全局导航 / Chat / 工作台画布 / 工作台导航”，左右导航按 `52px` 合同折叠，窄窗无横向溢出。
- 同 Profile 单实例保护继续包含在本版本中。

## 源码与构建验收

- 版本升级前的同一代码头全量 `bun test`：450/450，通过，3,283 次断言。版本提交只修改 `package.json` 的 `0.1.14` 到 `0.1.15`。
- 版本提交后 `bun run typecheck`：通过。
- `bun run package:win`：退出码 0，用时 206.4 秒；Production Build（生产构建）、NSIS Setup、Blockmap 和 Portable x64 均生成。
- Setup 与 Portable 通过 7-Zip `t`：各 75 个文件、2 个目录，结果 `Everything is Ok`。`data after the end of archive` 是 SFX（自解压程序）封装尾部数据警告。
- `release/win-unpacked/CreatX.exe` 使用隔离 Profile 完成 `test:workbench-interactive`：会话命名、删除重载、修改/重发成功与 Provider 失败恢复、四栏布局、左右折叠、1360×860、900×700、860×620、工作台网络阻断和 Electron Bridge 隔离均通过。
- 隔离验收结束后没有对应 `CreatX.exe` 或 `electron.exe` 残留进程。

## Windows 产物

| 产物 | 字节 | SHA-256 | 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.15-x64-Setup.exe` | 126,439,303 | `443F82B99C3C5D322831E27BFAC4C7ACB048F5267A30F1EC0F6DE5E525B7A3BF` | `0.1.15` | `NotSigned` |
| `creatx/release/CreatX-0.1.15-x64-Setup.exe.blockmap` | 133,610 | `658F0C4044E2E1231953C37366AAD48B215832617D209B9DE4C3E6905CBABC54` | 不适用 | 不适用 |
| `creatx/release/CreatX-0.1.15-x64-Portable.exe` | 126,215,579 | `B4807B1EED8A34521E90BEAB8F0B299D7DE88DAEC58B6E806B328A8147CBE3C1` | `0.1.15` | `NotSigned` |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `0C6E9976FA035E7C372E754E2E57BDC3E1481D999CE2267E5B80A869C7DF9637` | `0.1.15` | `NotSigned` |

## 未完成与风险

- 未安装 NSIS Setup，未直接启动 Portable SFX，没有修改正式 Profile。
- 没有调用外部真实 Provider；桌面验收用本地受控 Provider 生成稳定消息，再关闭服务验证真实 `ECONNREFUSED` 恢复路径。
- 真实 Windows Explorer 文件拖入仍需人工验收；DOM `File` 与授权定向测试不能冒充 OS 手势 Live（真实运行）。
- 三个 EXE 均未进行 Authenticode（Windows 代码签名），系统可能显示未知发布者。
- Provider 失败前 Cline 可能已持久化新的用户输入；失败重发会恢复原消息，但不会删除新的失败尝试。

## 恢复入口

- 功能边界与完整测试：`creatx-project-chat-controls-2026-08-09.md`。
- 当前发布产物位于 `creatx/release/`；需要交付时优先使用 Setup，免安装验证可使用 Portable。
- 下一步若继续，先人工验证真实 OS 文件拖入，再决定是否安装 Setup 或切换正式 Profile。
