# CreatX Windows 0.1.8 Package Evidence

## 范围

2026-08-08 将 `topic-genre-style` 的 Unified Creative Workflows（统一创作工作流）整合头打包为 Windows x64 `0.1.8`。打包前集成提交为 `f89d60feb912e8c48da71d59f0d103e3d45014c9`；本批只修改根包版本、生成发布产物并记录证据，没有改变 Runtime（运行时）产品语义。

## 执行与结果

在 `D:\CodexW\Creatx\creat1\creatx` 执行：

```powershell
bun run package:win
git diff --check
```

`package:win` 以退出码 0 完成 `electron-vite build`、NSIS 和 Portable x64 打包。`git diff --check` 通过。

| 产物 | 字节 | SHA-256 | 版本 | Authenticode |
| --- | ---: | --- | --- | --- |
| `CreatX-0.1.8-x64-Setup.exe` | 126,390,709 | `7F4EB0E439D3D8574F6A69FA9447139D9F8A71935AE9D64D05082CB9F6944A28` | `0.1.8` | `NotSigned` |
| `CreatX-0.1.8-x64-Portable.exe` | 126,166,946 | `69AA03B605B74727884B59AF963B68414DF8C6C296F262AB29792788D5615803` | `0.1.8` | `NotSigned` |
| `CreatX-0.1.8-x64-Setup.exe.blockmap` | 134,091 | `AC8E5252DDD2F23F29A04951436994EF443384A1E8C3ADBCE27AD977353863A3` | 不适用 | 不适用 |
| `win-unpacked/CreatX.exe` | 231,522,816 | `7F40CA306E3472E0920B8ABC27140F163846C881460C5E10C0C1E802785FE980` | 文件 `0.1.8`；产品 `0.1.8.0` | `NotSigned` |

旧 `0.1.7` 安装版和便携版仍存在，大小与既有 SHA-256 均未变化。

## 验证边界

- 本次打包之前，当前整合头已通过冻结安装、Typecheck（类型检查）、Import Boundary（导入边界）、全量 391/391（3,130 次断言）、Production Build、Web Preview 与 Desktop Fixture 验收。
- 本次 `package:win` 自身重新执行了 Production Build。
- 为避免干扰用户正在运行的软件，本批没有启动、安装或冒烟运行新 EXE，也没有修改正式 Profile。
- 本批没有调用外部 Provider、生成新创作成品或运行整本 GWP，不能据此宣称内容质量或长跑稳定性获得新的 Live（真实运行）验证。
- 产物未进行 Authenticode 代码签名，Windows 可能显示未知发布者。
