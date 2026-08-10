import type { AgentPlugin, Message } from "@cline/sdk"

export const PROJECT_READ_MEDIA_PROVIDER_BUDGET_BYTES = 4 * 1024 * 1024
export const PROJECT_READ_MEDIA_TURN_BUDGET_BYTES = 6 * 1024 * 1024
export const PROJECT_READ_MEDIA_OMITTED = "[previous project image omitted from this model request to keep the conversation responsive]"

export function createProjectReadMediaBudgetExtension(): AgentPlugin {
  return {
    name: "creatx-project-read-media-budget",
    manifest: { capabilities: ["messageBuilders"] },
    setup(api) {
      api.registerMessageBuilder({
        name: "limit-project-read-media",
        build: (messages) => limitProjectReadMediaForProvider(messages),
      })
    },
  }
}

export function limitProjectReadMediaForProvider(
  messages: readonly Message[],
  maxEncodedBytes = PROJECT_READ_MEDIA_PROVIDER_BUDGET_BYTES,
) {
  const currentTurnStart = findCurrentTurnStart(messages)
  const currentTurnBudget = { remaining: requireBudget(maxEncodedBytes) }
  const limited = [...messages]
  for (let index = limited.length - 1; index >= 0; index -= 1) {
    limited[index] = limitMessageProjectReadMedia(
      limited[index]!,
      index < currentTurnStart ? { remaining: 0 } : currentTurnBudget,
    )
  }
  return limited
}

function findCurrentTurnStart(messages: readonly Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    if (message.role !== "user") continue
    if (typeof message.content === "string" && message.content.trim()) return index
    if (Array.isArray(message.content) && message.content.some((block) => {
      const record = asRecord(block)
      return record?.type === "text" || record?.type === "image" || record?.type === "file"
    })) return index
  }
  return 0
}

export class ProjectImageReadTurnBudget {
  private readonly used = new Map<string, number>()

  constructor(private readonly maxEncodedBytes = PROJECT_READ_MEDIA_TURN_BUDGET_BYTES) {
    requireBudget(maxEncodedBytes)
  }

  begin(sessionId: string) {
    this.used.set(requireSessionId(sessionId), 0)
  }

  reserve(sessionId: string, decodedBytes: number) {
    const id = requireSessionId(sessionId)
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 0) throw new Error("file_media_budget: invalid project image byte length")
    const encodedBytes = Math.ceil(decodedBytes / 3) * 4
    const used = this.used.get(id) ?? 0
    if (used + encodedBytes > this.maxEncodedBytes) {
      throw new Error(`file_media_budget: this Run has reached its ${this.maxEncodedBytes}-byte project image context limit; use fewer representative images`)
    }
    this.used.set(id, used + encodedBytes)
    return encodedBytes
  }

  release(sessionId: string, encodedBytes: number) {
    const id = requireSessionId(sessionId)
    const used = this.used.get(id) ?? 0
    this.used.set(id, Math.max(0, used - encodedBytes))
  }

  end(sessionId: string) {
    this.used.delete(requireSessionId(sessionId))
  }

  clear() {
    this.used.clear()
  }
}

function limitMessageProjectReadMedia(message: Message, budget: { remaining: number }) {
  if (!Array.isArray(message.content)) return message
  let changed = false
  const content = message.content.map((block) => {
    if (!isReadFilesToolResult(block)) return block
    const next = limitNestedProjectReadMedia(block.content, budget)
    if (next === block.content) return block
    changed = true
    return { ...block, content: next } as typeof block
  })
  return changed ? { ...message, content } as Message : message
}

function limitNestedProjectReadMedia(value: unknown, budget: { remaining: number }): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const limited = limitNestedProjectReadMedia(item, budget)
      if (limited !== item) changed = true
      return limited
    })
    return changed ? next : value
  }
  const record = asRecord(value)
  if (!record) return value
  if (record.type === "image" && typeof record.data === "string") {
    const encodedBytes = Buffer.byteLength(record.data, "ascii")
    if (encodedBytes <= budget.remaining) {
      budget.remaining -= encodedBytes
      return value
    }
    return { type: "text", text: PROJECT_READ_MEDIA_OMITTED }
  }
  let changed = false
  const next = Object.fromEntries(Object.entries(record).map(([key, item]) => {
    const limited = limitNestedProjectReadMedia(item, budget)
    if (limited !== item) changed = true
    return [key, limited]
  }))
  return changed ? next : value
}

function isReadFilesToolResult(value: unknown): value is { type: "tool_result"; name: "read_files"; content: unknown } {
  const record = asRecord(value)
  return record?.type === "tool_result" && record.name === "read_files" && "content" in record
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function requireBudget(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("file_media_budget: image budget must be a positive integer")
  return value
}

function requireSessionId(value: string) {
  if (!value.trim()) throw new Error("file_media_budget: session identity is required")
  return value.trim()
}
