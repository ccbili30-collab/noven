# CreatX Windows 0.1.14 单实例修复基线

日期：2026-08-08（Asia/Shanghai）

主能力线：`session`

规则与验收：`SES-013 / ACC-SES-020`

## 已实现

- Electron Main 在任何 Runtime（运行时）、Provider（模型服务）或持久化初始化前申请同 Profile 单实例锁。
- 同 Profile 第二实例通知首实例恢复、显示并聚焦已有窗口，然后以退出码 0 退出；窗口尚未创建或已销毁时安全忽略唤醒。
- 不同 `--user-data-dir` 的隔离实例继续允许并存。
- `session is owned by live process` 和 `session ownership changed to process` 显示“此会话正在另一个 CreatX 窗口中使用。”；其他 `session_conflict` 保持原文案。
- Cline Session PID 所有权保护、数据库 Schema（数据合同）、Provider 行为和 Renderer（渲染层）布局均未修改。

## 自动与真实验收

- `bun test apps/desktop/tests/single-instance.test.ts packages/contracts/tests/errors.test.ts`：31/31，通过，36 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node 两项 Import Boundary（导入边界）通过。
- `bun run build`：Production Build（生产构建）通过。
- `bun run test:single-instance`：源码 Electron 隔离 Profile 双实例通过；同 Profile 第二实例退出码 0，首实例保持存活，不同 Profile 实例创建窗口并存。
- 对 `release/win-unpacked/CreatX.exe` 再次执行同一真实双实例验证：主 PID `39220` 保持存活，同 Profile 第二 PID `32660` 退出码 0，不同 Profile PID `5760` 存活。
- Setup 与 Portable 的内嵌 7z 内容均通过 `7za t`，75 个文件、2 个目录，结果 `Everything is Ok`。SFX（自解压程序）尾部数据警告属于可执行包装结构。
- 没有运行全量测试；没有调用真实 Provider。

## Windows 产物

| 产物 | 字节 | SHA-256 | 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.14-x64-Setup.exe` | 126,439,177 | `E4676988E96776763FF32B67A15274ED9B99B86F237E65948C97AAFA16DEF331` | `0.1.14` | `NotSigned` |
| `creatx/release/CreatX-0.1.14-x64-Portable.exe` | 105,714,989 | `A4A30ABFFCC57FE96FC6AD18CF8D44387BB6A6B07A7E12CA5CE85A08FF6990E7` | `0.1.14` | `NotSigned` |

首次组合打包在执行器 184 秒上限处终止时 Setup 已完成、Portable 尚未完成；随后只补跑 Portable 目标。补跑命令本身超过 244 秒工具等待上限，但原 `electron-builder` 与 `7za` 进程继续运行并自然结束，随后通过文件版本、哈希、归档完整性和解包程序实测验证。没有把超时记录成一次完整 `package:win` PASS。

## 未完成与恢复入口

- 未安装 NSIS Setup，未直接启动 Portable SFX，未修改正式 Profile。
- 旧 `0.1.13` 及更早版本没有申请单实例锁。切换到 `0.1.14` 前必须关闭全部旧 CreatX 一次；新版本不能强制旧版本自动退出。
- 正式现场 PID `46904`、`56516`、`48092` 未被结束或修改；没有 Session 数据损坏证据。
- 完整故障与边界见 `../discussions/2026-08-08-desktop-single-instance-session-ownership.md`。
