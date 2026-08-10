---
title: Growth 终态清理、Worker 回收与 Windows 0.1.7 证据
doc_type: baseline-evidence
status: verified-without-external-provider
verified_at: 2026-08-08
---

# Growth 终态清理、Worker 回收与 Windows 0.1.7 证据

## 范围

本批以“一句话启动后能稳定跑完并在原对话留下正式回复”为主线，收口以下真实边界：

- World Materialization 提供唯一终态证据，部分完成逐项披露；
- GWP 图片任务保存可信 Goal、Work Item、Attempt 来源；
- 同对象开放 Issue 在物化终态统一收口；
- 用户取消与真实 Assistant 持久化失败分开；
- Owner 正式回复持久化并提交 Growth 终态后，异步回收终态 Worker；
- Live Archive 和重开历史只保留 Owner 权威，不再复制或重载终态 Worker；
- 新图片路径统一使用 `/`；
- Windows 发布程序使用 CreatX 鸟标。

实现提交为 `05ff316`、`91d9a17`、`498c971`、`381e306`、`78769d1` 和 `4ffd26d`。清理不删除 Owner 消息、作品、Growth Store、图片任务或整本产物。

## Worker 清理不变量

Worker 查询只匹配 `creatxInternalRole=growth-stage + Owner Session ID + Goal ID`，不再通过固定上限列表扫描。活动状态不删；正式 Owner Assistant 回复未持久化时不调度清理。删除前先原子写入 `<cline-data>/maintenance/growth-worker-cleanup-v1/<sha256>.json`，然后调用 Cline Core `0.0.65` 的公开删除 API。若崩溃发生在数据库 Row 已删而 Artifact 尚存，重放只能删除 Adapter 自己的 `sessions/<sessionId>` 目录，并验证父路径、目录身份和符号链接。清理失败保留 Journal，不回滚作品与 Goal。

新 Live Archive 只把 Owner Session 列为必需 Cline 证据；旧档案含 Worker 时仍可读，但晋升不再复制它们。终态会话重开不读取 Worker 消息，活动 Worker 仍沿实时事件显示。

## 验收

在 `D:\CodexW\Creatx\creat1\creatx` 执行：

```text
bun install --frozen-lockfile                         PASS，无 Lockfile 变化
bun run typecheck                                    PASS
bun run test:imports                                 PASS
bun run test                                         PASS，384/384，3,055 次断言
bun run build                                        PASS
bun run test:desktop                                 PASS，隔离 Profile
CREATX_PACKAGED_EXE=release/win-unpacked/CreatX.exe
bun run test:desktop                                 PASS，隔离 Profile
bun run package:win                                  PASS
```

关键定向证据：Image Queue 33/33；Worker Retention 5/5、18 次断言；Owner Delivery 14/14；Cline Attachments 32/32、160 次断言；Cline 与 Runtime Live Archive 各 1 个场景；Windows ICO 1/1。Electron 冒烟使用临时项目、临时 Profile 和本地测试 Provider，页面与控制台没有错误，测试进程正常退出。

## Windows 产物

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `CreatX-0.1.7-x64-Setup.exe` | 126,376,823 | `7217EBA6E4147DBD7A1EC180BBE49BFF765C1F601DD8147645C4BCEE5612B876` |
| `CreatX-0.1.7-x64-Portable.exe` | 126,153,058 | `DCB862E35F4E6F801AA47097AFF2331051F5E0140A846D863052717B7407D11B` |
| `CreatX-0.1.7-x64-Setup.exe.blockmap` | 133,367 | `4BC53E71B1A603FD50EEB492293639D8122BD1D128EA9506F4517B00F84F6A70` |

ICO 包含 16、24、32、48、64、128 和 256 像素七层；解包程序的关联图标可提取为鸟标。安装版、便携版和解包 EXE 版本资源均为 `0.1.7`，Authenticode 状态均为 `NotSigned`。

## 未完成与风险

- 没有调用外部文本或图片 Provider，没有运行整本 GWP，因此不能把本批称为外部 Live 内容质量或完整长跑验收。
- 没有安装 NSIS 或直接启动 Portable；正式打包程序验收使用 `release/win-unpacked/CreatX.exe`。
- 旧图片任务没有可信 Growth 来源时继续保持未归属；旧反斜杠路径不批量迁移。
- 旧正式档案的既有 Worker 不会被本批自动全库清扫；新终态交付与受控删除路径开始执行新留存规则。
- 清理失败只有持久维护日志，没有新增用户维护页面。
- 独立只读审查仍记录一个 Medium 竞态：既有 Goal 的新 Start Activation 在 Goal 绑定前与 Pause 精确并发时，可能漏掉一次迟到 Owner Provider 回合；现有状态门禁阻止 Scheduler 和文件副作用。该项需要带 Barrier 的 Main 并发测试，不在本批扩大修复。
- 用户要求的取消动作体感延迟不是本批修复范围。

## 恢复入口

后续若继续加固，先从 `ACC-GRT-045` 的 Main 并发屏障测试开始；若进行产品验收，则使用 `0.1.7` 在隔离或正式测试项目执行一条完整外部 Provider GWP，并保留整本产物、Owner 最终回复、最终截图和 Clean Exit 证据。
