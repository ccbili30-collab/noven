import type { ResumeGrowthCommand, SendMessageCommand } from "@creatx/contracts"
import { resolveCreativeSlashCommand } from "@creatx/creative-skills/slash-commands"

const LEGACY_STORAGE_KEY = "creatx.pending-owner-command.v1"
const STORAGE_KEY = "creatx.pending-owner-commands.v2"

export type PendingOwnerCommand =
  | { kind: "growth-message"; command: SendMessageCommand }
  | { kind: "growth-resume"; sessionId?: string; command: ResumeGrowthCommand }

interface OwnerCommandStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function pendingGrowthMessage(command: SendMessageCommand): Extract<PendingOwnerCommand, { kind: "growth-message" }> | undefined {
  const resolved = resolveCreativeSlashCommand(command.prompt)
  if (!resolved?.definition.command.startsWith("/growth")) return undefined
  return { kind: "growth-message", command }
}

export function pendingGrowthResume(command: ResumeGrowthCommand, sessionId: string): Extract<PendingOwnerCommand, { kind: "growth-resume" }> {
  return { kind: "growth-resume", sessionId, command }
}

export function savePendingOwnerCommand(storage: OwnerCommandStorage, pending: PendingOwnerCommand) {
  const commands = readPendingOwnerCommands(storage)
  const current = commands.find((command) => ownerCommandScope(command) === ownerCommandScope(pending))
  if (current) return JSON.stringify(current) === JSON.stringify(pending)
  writePendingOwnerCommands(storage, [...commands, pending])
  return true
}

export function readPendingOwnerCommands(storage: OwnerCommandStorage): PendingOwnerCommand[] {
  const value = storage.getItem(STORAGE_KEY)
  if (value) {
    try {
      const commands = requirePendingOwnerCommands(JSON.parse(value) as unknown)
      writePendingOwnerCommands(storage, commands)
      storage.removeItem(LEGACY_STORAGE_KEY)
      return commands
    } catch {
      storage.removeItem(STORAGE_KEY)
    }
  }

  const legacy = storage.getItem(LEGACY_STORAGE_KEY)
  if (!legacy) return []
  try {
    const pending = requirePendingOwnerCommand(JSON.parse(legacy) as unknown, true)
    writePendingOwnerCommands(storage, [pending])
    storage.removeItem(LEGACY_STORAGE_KEY)
    return [pending]
  } catch {
    storage.removeItem(LEGACY_STORAGE_KEY)
    return []
  }
}

export function clearPendingOwnerCommand(storage: OwnerCommandStorage, completed: PendingOwnerCommand) {
  const commands = readPendingOwnerCommands(storage)
  const remaining = commands.filter((pending) => ownerCommandScope(pending) !== ownerCommandScope(completed)
    || pending.command.requestId !== completed.command.requestId)
  if (remaining.length === commands.length) return
  writePendingOwnerCommands(storage, remaining)
}

function writePendingOwnerCommands(storage: OwnerCommandStorage, commands: PendingOwnerCommand[]) {
  if (commands.length === 0) {
    storage.removeItem(STORAGE_KEY)
    return
  }
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, commands }))
}

function ownerCommandScope(pending: PendingOwnerCommand) {
  if (pending.kind === "growth-message") return `session:${pending.command.sessionId}`
  return pending.sessionId ? `session:${pending.sessionId}` : `legacy-goal:${pending.command.goalId}`
}

function requirePendingOwnerCommands(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid pending Owner commands")
  const stored = value as { version?: unknown; commands?: unknown }
  if (stored.version !== 2 || !Array.isArray(stored.commands)) throw new Error("invalid pending Owner commands")
  return stored.commands.flatMap((pending) => {
    try {
      return [requirePendingOwnerCommand(pending, false)]
    } catch {
      return []
    }
  }).filter((pending, index, commands) => commands.findIndex((candidate) => ownerCommandScope(candidate) === ownerCommandScope(pending)) === index)
}

function requirePendingOwnerCommand(value: unknown, allowLegacyResume: boolean): PendingOwnerCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid pending Owner command")
  const pending = value as { kind?: unknown; sessionId?: unknown; command?: unknown }
  if (!pending.command || typeof pending.command !== "object" || Array.isArray(pending.command)) throw new Error("invalid pending Owner command")
  const command = pending.command as Record<string, unknown>
  if (typeof command.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(command.requestId)) throw new Error("invalid pending Owner requestId")
  if (pending.kind === "growth-resume") {
    if (typeof command.goalId !== "string" || !command.goalId.trim()) throw new Error("invalid pending Growth resume")
    if (!allowLegacyResume && (typeof pending.sessionId !== "string" || !pending.sessionId.trim())) throw new Error("invalid pending Growth resume session")
    return {
      kind: pending.kind,
      ...(typeof pending.sessionId === "string" ? { sessionId: pending.sessionId.trim() } : {}),
      command: { requestId: command.requestId, goalId: command.goalId.trim() },
    }
  }
  if (pending.kind !== "growth-message"
    || typeof command.sessionId !== "string" || !command.sessionId.trim()
    || typeof command.prompt !== "string" || !command.prompt.trim()
    || !Array.isArray(command.attachmentIds) || command.attachmentIds.length !== 0) {
    throw new Error("invalid pending Growth message")
  }
  const normalized = { requestId: command.requestId, sessionId: command.sessionId.trim(), prompt: command.prompt.trim(), attachmentIds: [] }
  if (!pendingGrowthMessage(normalized)) throw new Error("pending message is not an explicit Growth command")
  return { kind: pending.kind, command: normalized }
}
