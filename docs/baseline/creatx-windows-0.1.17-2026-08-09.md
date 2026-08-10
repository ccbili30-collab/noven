# CreatX Windows 0.1.17 发布基线

日期：2026-08-09（Asia/Shanghai）

源分支：`topic-genre-style`

功能提交：`a4128bec6112ab3e660db5c07bbf52933016ce2a fix(desktop): isolate cline runtime memory`

版本提交：`f5d82faa47fd6b65581113dbd8940a8c81adc100 chore(desktop): package version 0.1.17`

验收脚本提交：`68f943b test(desktop): validate packaged runtime isolation`

包含能力：`PHS-009 / PHS-025 / ACC-PHS-017 / ACC-PHS-034`

## 发布内容

- Cline Adapter、Session、权限存储和档案恢复运行于 Electron Utility Process（实用进程），Main（主进程）只代理稳定 CreatX 命令、事件、工具、审批、取消和持久化回调。
- Main 不再加载 Cline SDK、`ClineCore` 或 `SqliteSessionStore`；Cline 重型历史和模型请求内存与窗口进程隔离。
- `read_files` 项目图片受单 Run 6 MiB 和单 Provider（模型服务）请求 4 MiB 预算约束，超限失败关闭。
- `runtime_unavailable` 退出码中的 `429` 不再被误判为 Provider 额度错误。

## 源码与构建验收

- 功能提交的全量 `bun test`：470/470，通过，3,361 次断言；Adapter + Contracts 为 138/138，通过，420 次断言。
- 功能提交的 Typecheck（类型检查）、Import Boundary（导入边界）、Production Build（生产构建）、`test:runtime-isolation` 和 `test:chat-image` 均通过。
- 版本提交只修改 `creatx/package.json` 的 `0.1.16` 到 `0.1.17`；提交前 `bun run typecheck` 通过。
- `bun run package:win`：退出码 0，用时 227.7 秒；Production Build、NSIS Setup、Blockmap 和 Portable x64 均生成。
- Setup 与 Portable 通过 7-Zip `t`，退出码均为 0，均为 `Everything is Ok`。
- `app.asar` 包含 `out/main/cline-runtime.js`，大小 188,529 字节；Main Bundle 为 732,962 字节，不含 `@cline/sdk`、`ClineCore` 或 `SqliteSessionStore` 标志，Runtime Bundle 包含三者。
- Runtime 隔离脚本新增 `CREATX_RUNTIME_ISOLATION_EXECUTABLE`，可直接验收打包 EXE；修改后 `bun run typecheck` 通过。
- `release/win-unpacked/CreatX.exe` 使用自动创建的隔离 Profile 真实启动：Main PID `23432`，Utility PID `42908`；Main Working Set 7,249,920 字节，Utility Working Set 284,135,424 字节。真实跨进程 `register_workbench`、审批、持久化和工具结果往返通过；强杀 Utility 后主窗口保持存活并以 `runtime_unavailable` 失败关闭。测试正常关闭应用、删除隔离 Profile，检查时 CreatX/Electron 与测试临时目录残留均为 0。

上述 Runtime 验收使用本地受控 OpenAI-Compatible（OpenAI 兼容）Provider，不是外部 Provider Live（真实运行）。

## Windows 产物

| 产物 | 字节 | SHA-256 | 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.17-x64-Setup.exe` | 126,451,846 | `4E22D3A0756FB90C84EA050A7C8E2EB78B7C470AAB42EA403D6EE9D36833894F` | `0.1.17` | `NotSigned` |
| `creatx/release/CreatX-0.1.17-x64-Setup.exe.blockmap` | 133,831 | `F11226730879666C32A02BEFFFC1399ED84A5FA57E1C09784F05C99DF0F08917` | 不适用 | 不适用 |
| `creatx/release/CreatX-0.1.17-x64-Portable.exe` | 126,228,126 | `56C7A8939599AC2D563C284A37134F6CC5966ABAC1F920BB00CF985F9BC5A29C` | `0.1.17` | `NotSigned` |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `13ABF618BC901B77B3262FC792E1A31431EA6AE738A67E38119BF1E8DB9858F8` | 文件 `0.1.17`；产品 `0.1.17.0` | `NotSigned` |

## 未完成与风险

- 未安装 NSIS Setup，未直接启动 Portable，没有修改正式 Profile。
- 本发布批次没有重新运行全量测试；470/470 属于同一功能提交，发布元数据与测试入口修改后只运行了 Typecheck、Production Build、归档检查和打包 EXE Runtime 验收。
- 没有运行完整 `test:desktop`；既有默认 Chat 与旧 Paper Workspace 断言冲突仍未作为本发布范围内问题处理。
- 没有调用外部 Provider，也没有用 19,262,810 字节正式历史副本再次驱动打包 EXE。重型历史证据来自同一功能提交的源码 Electron 验收。
- Utility Process 在重型历史回合后仍可能增长到约 595 MB；本版保护窗口响应，不压缩或迁移既有 Cline 权威历史。
- Utility Process 崩溃后失败关闭但不自动重启；自动恢复涉及活动 Run 和未知工具副作用，需要独立产品与架构批次。
- Setup、Portable 与解包 EXE 均没有 Authenticode（Windows 代码签名），Windows 可能显示未知发布者。

## 恢复入口

- 性能与隔离边界：`creatx-cline-runtime-isolation-2026-08-09.md`。
- 当前发布产物位于 `creatx/release/`；正常安装使用 Setup，免安装使用 Portable。
- 后续若继续发布验证，应使用隔离 Profile 启动 Portable，或在明确授权后使用正式 Profile；不得用本地受控 Provider 冒充外部 Provider Live。
