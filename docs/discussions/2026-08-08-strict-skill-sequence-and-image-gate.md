---
title: 挂篮严格串行与图片未知结果门禁
doc_type: discussion
status: accepted-implemented-and-live-verified
date: 2026-08-08
primary_capability: creative-skills
adjacent_capabilities:
  - image-runtime
---

# 用户纠正

Composer Skill 挂篮不是一次模型回合中连续加载多份教程。它在产品语义上等价于用户围绕同一任务连续发送多次消息：每一轮只采用一个 Skill，完整交付后才开始下一轮。

因此：

- Cline 的 Turn 正常结束不代表当前 Skill 完成。
- 脚本、清单、Manifest 或部分图片不能替代地图、人物群像或漫画成品。
- 当前项为部分完成、阻塞、失败或取消时，剩余项保持未启动。
- 当前项可以跨有限执行片段续跑，但不能借续跑重复已成功副作用。
- 过程与最终错误必须保留在原对话，不能把失败伪装为整体成功。

# 接受的技术语义

当前序列步骤必须通过只在 `skill-sequence` Tool Audience（工具受众）中出现的 `report_skill_sequence_step` 提交结构化回执。`completed` 至少验证一个真实项目产物；地图、人物群像和漫画还必须引用全部必需图片任务，且这些任务已经 `succeeded`。`partial` 与 `blocked` 必须说明未完成项并终止序列。

图片请求取得不到 HTTP 结果时，项目图片通道写入 SQLite 持久门禁。应用重启不能清除门禁，剩余任务继续排队。Agent 最多自动探测一次；探测再次得到未知结果后必须停止自动重试。用户仍可显式重试一张探针；探针成功或得到明确 HTTP 结果后恢复该项目队列。其他项目不受影响。

# 明确边界

- 不建立第二套消息库、Run 或 Harness（智能体运行框架）。
- 不修改 Cline Core。
- 不把创作质量判断伪装成机械验证；Runtime 只验证回执、真实路径和图片任务终态。
- 第一版不承诺应用崩溃后自动恢复正在执行的挂篮序列；真实历史和产物仍保留。
- 外部 Provider 的正式五项真实对话已于 2026-08-08 验收；完整证据和仍未完成人工目检的边界见 `../baseline/creatx-skill-sequence-formal-live-2026-08-08.md`。
