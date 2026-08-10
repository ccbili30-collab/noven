---
title: 图片挂接位置不匹配的静默处理
doc_type: discussion-record
status: accepted-for-implementation
date: 2026-08-07
---

# 图片挂接位置不匹配的静默处理

## 现场问题

GWP 正文允许对蓝图对象标题进行正常编辑，例如添加作品名前缀或标点。图片已经真实生成，但 `ImageAttachmentService` 使用蓝图标题寻找唯一 Markdown 标题时可能得到零个匹配，并持久记录 `image_attachment_conflict`。旧投影会在图片活动栏、项目打开对账错误和 Owner 最终汇报中重复暴露这项非阻塞问题。

## 用户决定

标题或正文锚点不匹配属于可忽略的小问题。系统不猜测新的插入位置、不改写正文、不重新生图，也不要求用户处理；图片文件按成功结果保留并独立存在。

`image_attachment_conflict` 继续作为内部持久诊断证据，但不进入用户可见图片失败区、全局 Runtime 错误或 GWP Owner 最终汇报。图片任务按成功终态短暂反馈后消隐。其他图片生成失败、图片文件错误、挂接服务不可用或非冲突类写入错误仍必须如实显示。

## 边界

- 不修改图片队列数据库 Schema（数据合同）。
- 不删除失败证据或伪造 Markdown 图片引用。
- 不放宽 `ImageAttachmentService` 的精确锚点与文件冲突门禁。
- 不影响图片成功状态、正文主链或其他可操作错误。
