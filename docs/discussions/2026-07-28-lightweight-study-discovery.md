---
title: CreatX 轻量 Study 发现记录
doc_type: discussion
status: accepted-product-direction
date: 2026-07-28
capability: creative-skills
---

# CreatX 轻量 Study 发现记录

## 用户目标

Study 的重点不是逐篇摘要、训练模型或建立复杂知识库，而是让同一个 Coding Agent（编码智能体）主动从杂乱资料中学习创作方法。它应当理解：设定怎样组织、文风怎样形成、画风由哪些稳定因素组成，以及怎样把视觉理解转化为可复用的生图 Prompt。

Web Search（网络搜索）只是另一种资料来源。网络内容与本地文件进入同一 Study 整理过程，再辅助普通创作或 Growth；Study 本身不需要第二套 Runtime（运行时）。

## 接受的行为

- `/study` 可以明确触发；普通创作任务确实需要理解大量已有资料时，Agent 也可以自动加载 Study。
- 小资料完整阅读；大资料先盘点，再按类型、主题、代表性和异常点取样，并按发现定向补读。
- Study 同时关注设定与组织方法、文风、视觉风格、生图方法和当前作品内容。
- 视觉结论必须形成至少一份可以脱离分析文字直接使用的完整 Prompt，而不是只写抽象审美形容词。
- Study 默认在 `研究/` 中创建自然组织的衍生文件，不移动、重命名、覆盖或删除原始资料。
- 资料少时可以只有一份核心学习档案；内容确实需要时再拆分文风、视觉、设定方法或索引，不为每个来源机械生成报告。
- 用户已有事实、综合观察和 AI 建议应自然区分，避免把 AI 延伸误写成原作事实。
- 无法读取图片、网页不可访问或没有搜索工具时如实说明，不根据文件名或模型旧知识虚构研究结果。

## 外部方法参考

- [Anthropic Research Synthesis](https://skills.sh/anthropics/knowledge-work-plugins/research-synthesis)：借鉴“从资料中识别主题并综合”，不逐项复述。
- [Creative Research](https://github.com/haowjy/creative-writing-skills/blob/main/skills/creative-research/SKILL.md)：借鉴“研究结果服务作品，优先提取具体可用细节”。
- [HeyGen Visual Style](https://skills.sh/heygen-com/skills/visual-style)：借鉴“把视觉理解压成可迁移、可独立使用的完整风格 Prompt”。

这些来源只提供方法参考。CreatX 没有安装第三方 Skill、复制其完整格式或接受其运行指令。

## 第一实现边界

第一批只实现应用本地 `creatx-study` Skill、Cline 允许列表、项目文件研究方法和工作台注册教程。它复用普通 Session、文件工具和权限。

第一批不实现：

- `web_search` 工具或搜索 Provider；
- `/growth_world` 启动时的自动 Study 组合；
- 超大资料的持久多 Run 调度；
- OCR、音视频转录或文档格式转换；
- 对当前 DeepSeek Provider 的图片视觉理解保证；
- 独立 Study 页面、数据库、任务状态机或向量检索系统。

上述边界需要后续真实 Provider 和资料样本验证，不能由 Skill 文本本身证明。
