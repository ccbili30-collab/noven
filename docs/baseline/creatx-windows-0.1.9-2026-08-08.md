# CreatX Windows 0.1.9 发布基线

日期：2026-08-08

## 发布内容

CreatX `0.1.9` 包含提交 `d974697` 的 Composer Skill Sequence（输入框技能序列）预算续跑、Session（会话）PID 接管和同步/队列统一视觉 Prompt 修复。

## Windows x64 产物

| 产物 | 字节 | SHA-256 | 文件版本 | Authenticode |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.9-x64-Setup.exe` | 126,393,193 | `6B9384E71FAD017312BF0EDFCF945FF963E203A010B4AD3B9EAB1D5C1D0E6554` | `0.1.9` | `NotSigned` |
| `creatx/release/CreatX-0.1.9-x64-Portable.exe` | 126,169,427 | `68E5E6B8F6A54523C7CD949BF94B51A8D5043199D1DF97FBC84069320299620A` | `0.1.9` | `NotSigned` |
| `creatx/release/CreatX-0.1.9-x64-Setup.exe.blockmap` | 133,949 | `7AEF64FF649B91D26E7341FC1E5850BBFADF73A6B05E26A08175F4DD88AAE5B3` | — | — |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `9C44676FD8C6AA2D86BBA1CE79EE3C42D27D129710ECAD6387FA3BAE24CCAC82` | `0.1.9` | `NotSigned` |

旧 `0.1.8` 安装版与便携版仍保留，没有覆盖或删除。

## 验收

- `bun install --frozen-lockfile`：708 个安装项检查完成，无变化。
- `bun run package:win`：退出码 0；Production Build（生产构建）、Windows x64 NSIS 安装版、Blockmap 和 Portable（便携版）全部生成。
- 安装版、便携版和解包 EXE 的文件版本均为 `0.1.9`。
- 每个发布文件重新读取大小并计算 SHA-256。
- 打包期间原 Portable `0.1.8` 主进程 PID `58704` 保持运行，路径位于独立临时解包目录；没有关闭软件或修改正式 Profile。

## 未验证与风险

- 新 `0.1.9` 没有在本批启动或安装，未执行新包的 Electron（桌面壳）冒烟。
- 本批没有调用外部 Provider（模型服务）、重跑五轮真实创作或运行整本 GWP。
- 自动化代码验收沿用 `d974697` 的 Typecheck、Import Boundary、397/397 全量测试（3,157 次断言）、PID 2/2、图片队列 33/33、同步生图 19/19和 Production Build 证据。
- 三个 EXE 均未签名，Windows 可能显示未知发布者。
