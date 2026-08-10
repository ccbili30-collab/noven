---
title: 首个图片 Provider 发现记录
doc_type: product-discovery
status: promoted-to-image-runtime-pilot
date: 2026-07-27
---

# 首个图片 Provider 发现记录

用户要求先完成一条真实生图调用闭环，并指定 JMRAI 中转作为首个验证目标。认证信息只保存在 Git 忽略的本地配置，不进入源码、文档、日志或提交。

本轮需要分别验证：

- `gpt-image-2-cheap`
- `gpt-image-2`

“正常返回”不能只按 HTTP 成功判断。响应必须能被解析为真实图片字节，图片必须经 Project File Port（项目文件端口）写入真实项目文件并能重新读取。首轮不进入 UI、队列、取消、图生图、封面绑定、地图或通用多 Provider 设计。

真实探针发现，同一个 `/v1/images/generations` 接口可能分别返回临时 URL 或 `b64_json`。Image Runtime（图片运行时）必须统一处理两种成功传输，不能将其中一种当成唯一协议。
