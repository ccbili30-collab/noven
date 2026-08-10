---
title: Workbench Core Guidance And First Creative Skill Discovery
doc_type: discovery-record
status: accepted-product-direction-implementation-pending
date: 2026-07-27
primary_capability: creative-skills
adjacent_capabilities:
  - provider-harness
  - workbench-registry
---

# 工作台基础指引与第一创作 Skill 发现记录

## 1. 用户提出的问题

注册工作台的底层能力已经 Live，但首次验收依赖用户明确说出 `editor`、文件路径和 `register_workbench`。真实普通用户只会表达创作目标，例如：

> 我想写一部关于未来来信的小说，帮我开始。

CreatX 必须让 AI 自己判断需要建立持续创作目录、创建最小有意义内容并注册工作台，不能要求用户理解工具名或文件结构。

## 2. 已确认的三层边界

### 基础 Prompt

每个项目会话都知道：项目文件是正式内容，工作台只是目录的可视化入口；持续创作或相关素材需要时应考虑工作台；普通文件夹不应全部注册；不得为注册移动或复制用户文件；不得直接编辑 `.creatx`；只有工具成功后才能报告工作台建立。

基础 Prompt 只保存这些稳定规则和“按任务加载相关 Skill”的方法，不保存小说、漫画、世界观等全部领域教程。

### 工具描述

`register_workbench` 说明自己只注册已经存在的项目相对目录，不移动、复制或修改内容；需要内容时先用普通文件工具创建；重复注册返回已有工作台；禁止直接创建或修改 `.creatx` JSON。

### 创作 Skill

领域 Skill 决定最小有价值的内容组织。第一条小说 Skill 在用户开始新小说时使用 `小说/大纲.md` 和 `小说/第一章.md`，正文必须回应用户题材，不创建空模板或占位符；已有内容必须先检查，不能覆盖或移动。

## 3. 第一条自然语言验收

唯一用户输入为：

> 我想写一部关于未来来信的小说，帮我开始。

验收要求：

```text
全新项目会话
→ AI 自动加载匹配的小说 Skill
→ 创建 小说/大纲.md 与 小说/第一章.md
→ 两份文件包含与“未来来信”相关的真实内容
→ 调用 register_workbench(folder=小说, title=小说)
→ 用户只审批真实文件与注册操作
→ 工作台立即出现并能预览两份真实文件
→ 重启后工作台、文件、预览和会话继续存在
```

验收 Prompt 不得出现 Skill 名、工具名、目录名或文件名。技术测试可以检查工具输入和磁盘结果，但不能把隐藏的测试指令注入模型上下文。

## 4. 技术证据与约束

Cline SDK `0.0.65` 公开导出 `createUserInstructionConfigService`。其 Runtime 支持：

- 从显式目录发现 `SKILL.md`；
- 通过 `configExtensions: ["skills"]` 注册原生 `skills` 工具；
- 用 `config.skills` 限定允许列表；
- Skill 内容按工具调用加载，而不是永久并入 System Prompt。

CreatX 可以把内置 Skill 安装到应用数据目录，再把该目录交给 Cline 的公开服务。不能把 Skill 写入用户项目、全局 `~/.cline/skills`，也不能重新实现第二套 Skill Runtime。

## 5. 非目标

- 不实现所有创作领域 Skill；
- 不建立 Skill 数据库、市场、更新器或自定义编辑器；
- 不把小说固定为所有工作台的默认结构；
- 不改变 `.creatx` Schema、Workbench Runtime 或审批策略；
- 不让 Skill 授权自身或隐藏真实工具活动。

## 6. 提升入口

稳定结论应提升到 `creative-skills` 产品规格、验收矩阵、实现计划和新的架构决策；只有真实 Electron Provider 验收通过后才能标记 Live。

## 7. Shell 检查边界补充

真实 DeepSeek 验收表明，Cline 原生 Skill 加载由模型选择，模型有时会先申请只读目录检查，有时会先加载小说 Skill。仅靠反复加强 Prompt 不能把该顺序变成确定性保证。

用户选择第一版保留普通 Cline 行为：项目会话继续拥有 Cline 原生 Shell，目录检查和显式创建目标目录与其他 Shell 调用一样进入逐次审批；CreatX 不为首个小说 Skill 新增确定性意图路由器、受限目录查询 Runtime 或全局 Shell 禁用。小说 Skill 仍要求在编辑前加载，并优先使用 `read_files` 和普通文件工具；如果模型申请 Shell，用户可以根据现有全机信任提示批准或拒绝。

自然语言 Live 验收允许项目根目录内的只读 `dir /b`、`Get-ChildItem`、`ls` 或目标 `Test-Path` 检查，也允许只创建目标 `小说` 目录的 `mkdir`/`New-Item`；危险、越界或其他命令必须失败。该选择意味着第一版不能承诺“开始小说时只出现两次文件审批和一次工作台审批”。
