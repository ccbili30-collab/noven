export type CreativeSlashCommandActivation = "growth" | "skill"

export interface CreativeSlashCommandDefinition {
  command: string
  aliases: readonly string[]
  title: string
  description: string
  activation: CreativeSlashCommandActivation
}

export const CREATIVE_SLASH_COMMANDS: readonly CreativeSlashCommandDefinition[] = [
  {
    command: "/growth",
    aliases: [],
    title: "Growth",
    description: "持续推进一个自由的长期创作目标",
    activation: "growth",
  },
  {
    command: "/growth_world",
    aliases: ["/growth-world"],
    title: "Growth World",
    description: "建立或整理一个完整、自洽的世界作品",
    activation: "growth",
  },
  {
    command: "/growth_world_pro",
    aliases: ["/growth-world-pro"],
    title: "Growth World Pro",
    description: "分阶段生产大型世界观与配图",
    activation: "growth",
  },
  {
    command: "/study",
    aliases: [],
    title: "Study",
    description: "阅读并整理项目资料、文风与画风",
    activation: "skill",
  },
  {
    command: "/draw-map",
    aliases: ["/draw_map"],
    title: "Draw Map",
    description: "规划并生成可继续使用的世界地图",
    activation: "skill",
  },
  {
    command: "/draw-comic",
    aliases: ["/draw_comic"],
    title: "Draw Comic",
    description: "把文本转成具有连续画风与分镜的漫画",
    activation: "skill",
  },
  {
    command: "/causality",
    aliases: [],
    title: "Causality",
    description: "读取当前世界并生成纯因果交互网络",
    activation: "skill",
  },
]

export interface ResolvedCreativeSlashCommand {
  definition: CreativeSlashCommandDefinition
  instruction: string
  canonicalMessage: string
}

export function resolveCreativeSlashCommand(message: string): ResolvedCreativeSlashCommand | undefined {
  const match = message.match(/^(\/[^\s]+)(?:([ \t]+|\r?\n)([\s\S]*))?$/)
  if (!match || !match[1]) return undefined
  const token = match[1]
  const definition = CREATIVE_SLASH_COMMANDS.find((item) => item.command === token || item.aliases.includes(token))
  if (!definition) return undefined
  const instruction = match[3] ?? ""
  const separator = match[2]?.includes("\n") ? "\n" : instruction ? " " : ""
  return {
    definition,
    instruction,
    canonicalMessage: `${definition.command}${separator}${instruction}`,
  }
}

export function isSlashCommandInput(message: string) {
  return message.startsWith("/")
}
