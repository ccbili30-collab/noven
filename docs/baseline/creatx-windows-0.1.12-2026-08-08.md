# CreatX Windows 0.1.12 打包与交互冒烟

日期：2026-08-08

状态：已生成，可供用户真实交互测试；未签名，不是完成发布验收。

## 范围

本批把真实 Renderer 的 Chat / Workbench 双表面、项目—工作台—目录统一折叠语言、统一菜单与 Dialog、连续面板拖动及 AI 安全宽度打入 Windows `0.1.12`。打包前额外修复“回到最新”浮动按钮覆盖 Growth 操作的问题：按钮现在由对话滚动区拥有，不再跨越到 Growth、图片状态、错误或 Composer 区域。

本批没有改变 Runtime（运行时）、Cline Harness（智能体运行框架）、Provider（模型服务）、数据库或公开协议，也没有调用外部 Provider 或修改正式 Profile。

## 产物

| 产物 | 字节 | SHA-256 | 文件版本 | Authenticode |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.12-x64-Setup.exe` | 121,157,955 | `98BF71FEC60F812E445D2B08A5FE75F665210A03960A6B4A6E13112BAE82F58C` | `0.1.12` | `NotSigned` |
| `creatx/release/CreatX-0.1.12-x64-Setup.exe.blockmap` | 129,444 | `52EAF0EC251A8A6C28E169647B44962CFE7B67AFCDC6A1981F55BB29FBE24ED0` | — | — |
| `creatx/release/CreatX-0.1.12-x64-Portable.exe` | 120,934,129 | `BE89869269C2805A3AB43502A71350B86392225F4E06AA3F6E7EB14654BAD964` | `0.1.12` | `NotSigned` |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `864E32745E7095A0897EBD5D2CD5791C44AB87F417B2BB0494147509D605C201` | `0.1.12` | `NotSigned` |

Windows 可能对安装版和便携版显示“未知发布者”。Electron Builder 日志中的签名步骤没有可信证书，PowerShell 权威检查结果仍为 `NotSigned`。

## 验收

- 代码冻结前全量 `bun test`：408/408，3,184 次断言。
- 遮挡修复后 Renderer 定向测试：11/11，34 次断言。
- 遮挡修复后 `bun run typecheck`：通过。
- 最终 `bun run package:win`：退出码 0；Production Build、NSIS、Blockmap 和 Portable x64 均生成。
- `git diff --check`：通过，仅有既有 LF / CRLF 转换警告。
- 最终解包 EXE 使用临时项目、临时附件、隔离 Profile 和本机测试 Provider 启动。真实 ASAR Renderer 通过壳、项目、附件、图片、Growth 恢复、面板宽度、Growth 继续/结束、Chat / Workbench、目录/文件、编辑保存、会话保持、分隔线及窄窗验收；页面错误、控制台错误和失败请求均为 0，测试进程正常退出。
- 最终 Portable 产物已在正常用户环境启动，主窗口标题为 `CreatX`、进程响应正常，留给用户继续真实交互测试；本记录不把“成功打开窗口”扩大为正式 Profile 全功能验收。

## 未完成与风险

- 完整 `test:desktop` 在上述界面范围全部通过后，于后续 Skill Sequence 历史数量断言停止：期望一条用户消息和两条 Assistant，实际返回一条用户消息和四条 Assistant。该失败没有 Renderer、控制台或请求错误，本批未扩大到 Runtime 修复，因此全套桌面测试不标记通过。
- 没有执行 NSIS 交互式安装、升级覆盖、卸载或自动更新验证。
- 没有使用真实 Provider、正式 Profile 或真实长期 Growth 任务验证本批 UI。
- 产物未签名；用户测试时需自行确认 Windows 安全提示。
- 工作树仍是 Detached HEAD `d31c73a` 并包含本次及此前保留的未提交改动；产物对应当前工作树内容，不对应一个新的 Git 提交。

## 恢复入口

用户真实交互优先运行 `creatx/release/CreatX-0.1.12-x64-Portable.exe`。如需定位包内差异，使用 `creatx/release/win-unpacked/CreatX.exe`；安装流程验收才使用 Setup。后续若处理 Skill Sequence 数量失败，应单独路由到对应 Runtime 能力线，不能为桌面测试转绿修改 Renderer 兼容垫片。
