---
title: CreatX 完整 Live 档案会话恢复验收
doc_type: baseline-evidence
owner: session
status: live-verified
last_verified: 2026-08-06
source_of_truth: docs/capabilities/session/product-spec.md
---

# CreatX 完整 Live 档案会话恢复验收

## 问题

完整 Live 档案已经把 Cline 会话数据库和消息 Artifact 迁入正式 Profile，但打开《太衡界世界》的 Owner 会话时界面长期空白，Electron 主进程超过 1.2 GB 内存并失去响应。

正式 Owner Artifact 实际包含用户消息和 Assistant 最终回复；缺陷位于恢复路径：`ClineAdapter.readTimeline()` 对每个 Growth Worker 调用一次 `ClineCore.readMessages()`，而 Cline SDK `0.0.65` 的本机 Runtime 会先扫描全部 Session 以按 ID 寻找记录。200 个 Worker 与 527 条正式 Session 形成重复全库扫描。

## 修复边界

- 不修改 Cline Core，不建立第二份消息数据库。
- Adapter 已取得 Worker Session Record 时，直接读取其 `messagesPath` Artifact；只有缺少直接路径的旧记录才回退到 Cline 读取。
- Owner 消息继续通过 Cline Core 读取。
- 已完成处理区只挂载折叠摘要，用户展开时才挂载 Worker 明细；运行中的处理区仍默认展开。

## 真实证据

同一正式 Profile 的只读副本、同一 Owner `1786011824234_7atom`：

| 状态 | Worker | Timeline 项 | 用时 | 进程 RSS |
| --- | ---: | ---: | ---: | ---: |
| 修复前 | 200 | 755 | 62.3 秒 | 约 1.26 GB |
| 修复后 | 200 | 755 | 0.6–1.0 秒 | 约 388 MB |

旧档案《灰冠诸境》Owner `1785897255513_598te` 的 291 个 Worker、1,058 个 Timeline 项在约 1.1 秒内恢复。两条会话都投影出 Owner 用户消息与正式 Assistant 回复。

最新生产 Build 启动正式 Profile 后，真实 Electron DOM 观察到：空白占位 0、用户消息 1、Assistant 消息 1、折叠处理区 1、预挂载内部明细 0。视觉截图确认《太衡界世界》启动原话、折叠“已处理”和“太衡界世界创作完成”正式回复同时可见。

## 自动验收

- 新增 Worker Artifact 直接读取与旧记录回退测试。
- 新增终态折叠不挂载明细、运行中挂载明细的 Renderer 测试。
- Cline Adapter 与 Renderer 定向测试：128/128，通过，735 次断言。
- 全量测试：323/323，通过，2,944 次断言。
- Typecheck、Import Boundary（导入边界）和 Production Build 通过。

本批没有调用 Provider，没有重跑整本 Growth，也没有修改或删除任何完整运行产物。
