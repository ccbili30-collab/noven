export const GROWTH_SKILL_NAME = "creatx-growth" as const

export const GROWTH_SKILL_SOURCE = `---
name: ${GROWTH_SKILL_NAME}
description: Execute an explicitly activated CreatX Growth Goal through dynamic, bounded creative stages. Never load this Skill for an ordinary request that does not begin with /growth.
---

# CreatX Growth

仅当 CreatX Runtime 已从用户消息开头解析出显式 \`/growth\` 并激活当前 Growth Goal 时使用本 Skill。不要因为任务很长、用户提到 Growth，或你认为持续执行更合适就自行进入 Growth。不要创建或模拟第二套 Goal、Run、会话、工具结果或任务进度。

## 工作原则

- 以用户的原始目标和当前真实项目为权威，根据目标动态决定工作路线。不要套用固定领域、固定目录、固定文件清单或固定阶段顺序。
- 同一项目已有未终结 Goal 时，新的 \`/growth\` 是对当前 Goal 的补充或转向。吸收新要求，不建立平行 Goal。
- 当持久目标以“Growth World Pro 专用目标”开头时，加载本 Skill 后依次加载 \`creatx-growth-world\` 和 \`creatx-growth-world-pro\`，再检查文件或规划阶段。当目标只以“Growth World 专用目标”开头时加载 \`creatx-growth-world\`。这些可见标记只负责保持专用路线，不要复制进作品正文。
- 使用滚动规划：详细决定当前里程碑和少量下一步，完成一个有界阶段后再根据真实结果继续规划。不要在一个 Run 中假装完成无限任务。
- 小目标可以直接执行。大目标创建并维护一份 \`创作计划.md\`，记录长期目标、当前里程碑、已完成事实、待处理步骤和真实阻塞。新持续作品的计划放在统一作品根目录内；已有项目若已经有计划则沿用其真实位置，不复制第二份。计划写入后立即开始当前阶段，不增加计划批准步骤。
- 新建持续作品时，先根据作品本身选择一个简洁、可修改的统一作品根目录。正文、设定和图片都放在该目录下，不要把通用的“世界设定”和“图片”分别散落在项目根。首批真实内容存在后调用 \`register_workbench\` 注册这个作品根；不要直接编辑 \`.creatx\`。
- 阶段开始前读取相关项目文件；阶段结束后重新读取 \`创作计划.md\`、本阶段修改的关键文件、图片任务状态和用户最新方向。不要依赖旧摘要覆盖用户已经修改的真实内容。
- 可以按目标使用当前允许的普通 Creative Skills 和工具，但不要自行进入 Living、扮演角色或在消息历史中伪造用户命令。

## 阶段工具预算

- 每个阶段只推进一个可描述的里程碑。加载本 Skill 后，最多创建或实质修改两份内容文件；读取、注册工作台和提交图片任务不计入这两份内容。
- 为阶段汇报预留最后一次模型/工具循环。不要在同一阶段连续扩写多个设定文件、同步等待图片或追求一次完成整个 Goal。
- 完成当前少量产物后立即调用 \`report_growth_progress\`。如果剩余工作很多，报告 \`continue\`，交给下一个阶段继续。
- 阶段汇报的 \`summary\` 只概括本阶段已经完成的事实，控制在 800 字以内；详细创作内容留在真实项目文件中，不复制进汇报。

## 阶段汇报

每个有界阶段结束前，调用 Runtime 提供的 \`report_growth_progress\`，如实选择：

- \`continue\`：目标尚未完成，并给出下一阶段建议。
- \`waiting\`：缺少用户信息、额度、凭据或其他可恢复条件。
- \`completed\`：目标条件已经满足。
- \`failed\`：存在不可恢复的失败，继续运行也无法完成当前 Goal。

汇报必须用项目相对路径引用真实产物，并用图片任务返回的 ID 引用真实图片任务。不要猜测内部文件 ID，不得用绝对路径或文字声明代替文件、图片或工具结果。如果 Runtime 没有提供阶段汇报工具，停止并明确说明阻塞，不要假装 Growth 已经持续运行。

## 图片与完成检查

- 当目标明确需要图片时，只使用持久的 \`submit_image_generation\` 提交真实图片任务并记录返回的任务 ID。Growth 中不要调用同步 \`generate_image\`，也不要等待图片完成后才继续文字阶段。
- 当前 Goal 为满足用户目标而提交的图片默认都是完成条件中的必需图片；阶段汇报时同时放入 \`imageTaskIds\` 和 \`requiredImageTaskIds\`。第一版不提交“可有可无”的探索图片。任一任务失败、缺失或仍在处理中时，不得报告 \`completed\`。
- 只提交当前里程碑真正需要的关键视觉，不要自行把一个普通目标扩展成完整图集。图片数量与覆盖范围由用户目标和具体领域 Skill 决定。
- 图片任务处于 \`queued\` 或 \`generating\` 时保持等待，不要更换文件名、Prompt 或幂等键提交同主题替代图。队列会持久运行；只有明确失败后才向用户说明并决定下一步。
- 报告完成前，重新读取关键产物，对照用户原始目标和 \`创作计划.md\` 检查遗漏，并确认全部必需图片已经成功。
- 完成判断包含创作判断，但不能虚构机械事实。目标未满足时继续或等待，不要为了结束任务降低标准。`
