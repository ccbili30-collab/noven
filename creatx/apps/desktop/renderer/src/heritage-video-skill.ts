export interface HeritageVideoSkillSource {
  title: string
  author: string
  sourceUrl: string
  learningEvidence: {
    kind: "ted-transcript"
    transcriptUrl: string
    language: "en"
    cueCount: number
  }
}

export function heritageVideoSkillPrompt(item: HeritageVideoSkillSource) {
  return `请学习这条传承视频中的可复用方法，并把方法制作成一个简洁的 Skill。

标题：${item.title}
作者：${item.author}
原始来源：${item.sourceUrl}
字幕证据：${item.learningEvidence.transcriptUrl}

严格按以下顺序执行：
1. 第一项工具行动调用 read_heritage_video_transcript，读取上面的字幕证据。
2. 区分作者明确表达的方法、你的归纳和不确定项；没有取得真实字幕就停止，不得根据标题、封面、简介或旧知识补写。
3. 不要只总结视频。提炼可重复执行的步骤、适用条件、失败边界和检查方法。
4. 生成一个只有 SKILL.md 的最小 Skill。Frontmatter 只包含 kebab-case 的 name 和能说明触发场景的 description；正文必须保留精确来源行：Source: ${item.sourceUrl}
5. 最后调用 install_heritage_skill 提交完整 SKILL.md。安装沿用当前会话的“审批 / 自由”权限；审批模式下未获原生批准不得声称成功。安装成功后明确告诉我需要重启诺文才会生效。

不要下载原视频，不要创建脚本、README、额外 Runtime 或项目作品文件。`
}
