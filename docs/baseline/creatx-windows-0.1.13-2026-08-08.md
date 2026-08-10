# CreatX Windows 0.1.13 合并发布基线

日期：2026-08-08

状态：已生成并完成解包 EXE 隔离冒烟；未签名，未安装，不是完整发布验收。

## 产物

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `creatx/release/CreatX-0.1.13-x64-Setup.exe` | 126,438,486 | `DA0B0FC298185C103B5A53C09159646A3D164DFA19AAA6207E05F5BAA39BE462` |
| `creatx/release/CreatX-0.1.13-x64-Setup.exe.blockmap` | 133,611 | `7BD51AAE713D152DB9318CFCDBE69DC9573AA2F72CE0FC3F83627F8F101C45C5` |
| `creatx/release/CreatX-0.1.13-x64-Portable.exe` | 126,214,735 | `C32BB3BD1E720DF4D3C22DC359BEA69BE7DC9FCAAF6CA3B2BE019F25EB4DE828` |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `5E0269754263982A04E628DA745A70A5E5CCF276C527F92DF08E8097E103B45E` |

安装版与便携版文件/产品版本均为 `0.1.13`；解包 EXE 文件版本为 `0.1.13`、产品版本为 `0.1.13.0`。三个 EXE 的 Authenticode 状态均为 `NotSigned`，Windows 可能显示未知发布者。

## 验收

- `bun install --frozen-lockfile`：检查 743 个安装项、747 个包，无变化。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 两项导入边界通过。
- `bun run package:win`：Production Build、NSIS、Blockmap 和 Portable x64 全部通过。
- `app.asar` 检查：Renderer 与 Web Preview 各包含一份 `art-concept-data.json` 和 63 张艺术库图片，共 2 份数据文件、126 张图片。
- `release/win-unpacked/CreatX.exe` 使用 `D:\CodexCache\Temp\CreatX-package-smoke-0.1.13` 隔离 Profile 启动；主窗口标题为 CreatX、进程响应正常，真实迁移 57 个正式作品和 6 个候审条目，随后正常关闭。
- 合并后代码冻结组合测试此前为 69/69、198 次断言，通过；本次仅版本变化，没有重复运行全量测试。

## 未验证与限制

- 没有安装 NSIS 或启动 Portable，自定义安装目录、卸载和升级覆盖尚未验证。
- 没有调用外部文本/视觉 Provider，也没有在正式 Profile 执行艺术库完整识图候审。
- 没有重复运行全量测试；最近一次全量为 429/430、3,239 次断言，唯一既有 Skill 预算测试在全仓负载下超过固定 5 秒，隔离复跑通过。
- 本批只证明合并头可构建、可打包、资源完整且解包程序可启动，不证明长期稳定性或全部用户流程。
