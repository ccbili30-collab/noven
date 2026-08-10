---
title: 工作台注销入口讨论记录
doc_type: discussion
status: accepted-for-implementation
date: 2026-08-11
primary_capability: workbench-registry
adjacent_capabilities:
  - project-files
  - workspace-ui
---

# 工作台注销入口讨论记录

用户发现旧工作台目录已经不存在时，注册记录仍会作为 `missing` 入口保留，并追问为什么没有注销工具。在确认当前 V1 将删除能力明确延期、Runtime 和内部元数据 Port 均没有注销路径后，用户要求修复。

本批接受的产品语义：

- `unregister_workbench` 只移除一个已注册工作台的 `.creatx/workbenches/<id>.json` 视图记录。
- 注销绝不删除、移动或修改工作台对应的真实目录与内容。
- 文件夹已经缺失的 `missing` 工作台仍可注销。
- 内置 `builtin:files` 不可注销；未知、损坏或重复冲突记录失败关闭。
- 工具需要 Cline 原生审批；审批前无写入。
- 注销当前打开的工作台后，Renderer 回退到内置“文件”工作台，不保留悬空入口或交互主页。
- 元数据自读取后发生变化时不得删除新状态。

本批不实现真实目录删除、回收站、工作台重新定位、批量注销、Renderer 手动注销按钮或损坏记录修复。
