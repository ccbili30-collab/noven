---
title: Desktop Runtime 验收矩阵
doc_type: capability-acceptance
owner: desktop-runtime
status: executable-specification
last_verified: 2026-08-11
source_of_truth: docs/capabilities/desktop-runtime/product-spec.md
---

# Desktop Runtime 验收矩阵

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-DRT-001 | DRT-003 | 空闲状态点击展开或折叠导航中的“恢复诺文” | Main 只安排一次 Relaunch，并进入既有干净退出链 |
| ACC-DRT-002 | DRT-004 | 普通会话、工具、Owner Growth、活动 Goal 或图片生成中触发 | 首次请求只返回确认要求；取消无副作用；确认后才重启 |
| ACC-DRT-003 | DRT-005 | 活动工具已经接纳后确认重启 | 当前执行停止；重启后历史可读，但消息和工具不被自动重放 |
| ACC-DRT-004 | DRT-006 | 在项目 B 会话 B2 中重启 | Bootstrap 优先打开 B 和 B2，随后清除一次性偏好 |
| ACC-DRT-005 | DRT-006 | 偏好 JSON 损坏、Session 删除或项目不匹配 | 清除偏好并按正常启动回退，不借用错误项目 |
| ACC-DRT-006 | DRT-002, DRT-003 | 连续快速点击或退出依赖超时 | 不产生多个实例；截止时间后沿用失败关闭且无失管 Utility Process |

自动化只可证明合同、门禁和 Renderer 投影；只有真实 Electron Relaunch、原 Profile 历史恢复与退出后进程检查可以标记 Live（真实运行）。

2026-08-11 隔离 Electron 已覆盖空闲 Relaunch、临时 Profile 中的项目/会话恢复、活动普通会话确认的取消与确认，以及零自动重放。Growth 和生成中图片的确认仍由真实协调器/Store 自动化证明，尚未单独执行 Electron Live。证据见 `../../baseline/creatx-application-restart-recovery-2026-08-11.md`。
