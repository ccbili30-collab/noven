---
title: 工作台与流式运行性能修复
doc_type: discussion
status: implemented-and-automated-verified
date: 2026-08-07
capability: workspace-ui
neighbors:
  - growth-runtime
  - provider-harness
---

# 工作台与流式运行性能修复

## 用户问题

工作台图片也会随项目刷新反复消失或重载，整个软件在 Growth 长跑时存在不明卡顿。修复必须先服务当前主链稳定运行，不以迁移 Harness（智能体运行框架）或扩大架构返工为前提。

## 现场证据与根因

- 图片文件此前经 `readFile` 转成约 3–4 MB Base64，再跨 Electron IPC 进入 Renderer；项目任何失效都会替换当前 Preview（预览），即使选中文件没有变化。
- 每个 `timeline.upsert` 都会立刻进入 Renderer；同一流式条目的连续增量反复触发全 Timeline 过滤、排序、复制和主工作区重渲染。
- 现场 Main 进程连续 10 秒消耗约 12.64 CPU 秒，私有内存最高约 1.8 GB；正式 Cline Session 已约 785 条。该采样证明存在运行压力，但不能单独把所有卡顿归因于某一个函数。
- 两个并行 GWP 在文本 Provider 额度失败时继续创建后续必败 Worker；Cline Core 对单 Worker 的 429 仍有自身有限重试，而 Adapter 原先没有跨 Worker 的连接级冷却。

## 已接受修复

- 项目图片通过现有 `creatx-workbench://` 受限协议按需读取，`FilePreview` 只传稳定 `assetUrl`；旧 `dataUrl` 仅作兼容读取。
- 工作台刷新比较当前选中文件 `modifiedAt`。无关项目写入保留同一个 Preview 对象；真实文件变化读取完成后一次替换，不发布空帧；文件消失时原子清除选择。
- Main 将同一 Session、同一 Timeline Item 在 16ms 窗口内的多次 Upsert 合并为最后一次；终态或其他同 Session 事件发送前先 Flush（排空），保留顺序。
- Renderer 对已有 Timeline Item 原位置更新；只有新 Item 或排序身份变化时重新插入。对话投影只在输入无序时排序。
- Cline Adapter 按文本 Profile ID，或 Provider + Model，设置 30 秒额度冷却。冷却只阻止继续创建同连接 Worker，不阻塞其他连接；暂停、取消和退出可中断等待。成功请求清除该连接冷却。

## 明确边界

- 不修改 Cline Core，单 Worker 内部的有限 429 重试继续存在。
- 不迁移 Cline 到独立进程；Electron Main 拓扑若实机仍不达标，必须另开架构批次。
- 不升级数据库 Schema，不修改正式项目、正式 Goal 或现有会话。
- 本批没有调用真实 Provider，也没有重启用户正在运行的软件。自动化证明合并、稳定刷新和冷却语义，不等同于新 Build 的实机帧率或内存验收。

## 自动化证据

- 图片协议、Markdown、工作台刷新、Timeline 合并与额度冷却定向 31/31 通过。
- Cline Adapter 完整相关测试 32/32 通过；失败关闭响应确认同连接后续 Worker 不发新请求、取消立即中断、另一连接不受影响。
- 冻结安装无变化、Typecheck、Import Boundary、全量 374/374（3,006 次断言）、Production Build 和 `git diff --check` 通过。
