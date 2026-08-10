import { readFile } from "node:fs/promises"
import type { Message } from "@cline/sdk"

export async function readGrowthWorkerMessages(
  record: { sessionId: string; messagesPath?: string },
  fallback: (sessionId: string) => Promise<Message[]>,
) {
  if (!record.messagesPath?.trim()) return fallback(record.sessionId)
  return readMessagesArtifact(record.messagesPath)
}

async function readMessagesArtifact(path: string): Promise<Message[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
    if (Array.isArray(parsed)) return parsed as Message[]
    if (!parsed || typeof parsed !== "object") return []
    const messages = (parsed as { messages?: unknown }).messages
    return Array.isArray(messages) ? messages as Message[] : []
  } catch {
    return []
  }
}
