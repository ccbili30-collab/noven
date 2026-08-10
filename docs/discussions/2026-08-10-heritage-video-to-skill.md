---
title: 传承库视频学习与 Skill 生成
doc_type: discovery-record
status: accepted-for-implementation
date: 2026-08-10
primary_capability: creative-skills
adjacent_capability: workspace-ui
---

# 传承库视频学习与 Skill 生成

## 用户确认

- 传承库不需要下载原视频；目标只是让 AI 学习视频中的可复用方法并生成 Skill（技能）。
- 第一版尽量简单，只处理能够取得真实字幕或文字转录的视频。
- 没有字幕时明确失败，不根据标题、封面或简介伪造已经学习。
- 应主动寻找能够直接读取字幕的视频并置顶，使用户先看到真实可用内容。

## 当前事实

- 现有“分析并生成 Skill”按钮只显示原型提示，没有 Desktop API（桌面接口）、Agent（智能体）调用、Skill 产物或安装链。
- 2026-08-10 通过哔哩哔哩公开 `x/web-interface/view` 与 `x/player/v2` 接口核对现有目录中的 11 条 B 站视频，公开字幕数均为 0，不能标记为首版可学习来源。
- 以下 TED 视频页面的 `__NEXT_DATA__` 提供真实英文 Transcript（字幕转录），并已实际读取字幕片段：
  - Andrew Stanton《The clues to a great story》：415 个 Cue（字幕片段）。
  - Tracy Chevalier《Finding the story inside the painting》：281 个 Cue。
  - Kate Messner《How to build a fictional world》：105 个 Cue。
  - David Carson《Design and discovery》：452 个 Cue。
- 当前 Cline Skill 目录和 Allowlist（允许列表）在 Runtime（运行时）初始化时固定，因此新安装的 Skill 第一版在重启诺文后生效；不能谎称即时热加载。

## 接受的最小闭环

1. 可学习卡片由版本化目录明确保存经过核验的 Transcript URL（字幕地址）并优先排列；普通导入和无字幕内容不自动获得该标记。
2. 用户点击“学习并生成 Skill”后选择一个普通项目会话，系统通过现有分享接收链发送一条正常用户消息并切换到该会话，全部 AI 过程和错误可见。
3. Agent 必须先调用只读工具取得真实字幕，再生成一个只有 `SKILL.md` 的最小 Skill。Skill 必须描述可执行方法、适用条件、失败边界和来源，不把视频摘要当作方法。
4. Agent 通过标记为 Required Approval（需要审批）的安装工具提交 Skill。审批模式显示 Native Approval（原生审批）；自由模式遵守用户已经选择的自动批准语义。工具仍校验同一会话已读取匹配字幕，并校验名称、Frontmatter（头部元数据）、大小、来源和路径后原子写入应用本机 Learned Skills（学习技能）目录。
5. 同名同内容安装幂等；同名不同内容失败关闭，不覆盖用户已有 Skill。安装成功明确提示重启后生效。
6. 启动时只发现结构有效的已安装单文件 Skill，并把它们加入现有 Cline Skill 目录与允许列表；不建立第二 Skill Runtime。

## 第一版不做

- 原视频下载、音频转写、关键帧视觉学习或平台登录态。
- B 站、YouTube 或任意网站的通用字幕下载器。
- 自动安装、无审批覆盖、在线更新、卸载、版本比较或跨设备同步。
- 新建专用传承库 AI、隐藏后台会话或第二模型循环。
- 安装后热重载 Runtime；第一版重启诺文后可用。

## 取代关系

本记录提升并收窄 `2026-08-06-local-creative-libraries-and-art-chat.md` 中“传承库视频分析、Skill 安装不做”的旧批次边界。旧记录仍准确描述当时版本，但不再代表当前下一批目标。
