import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type {
  BindArtChatSessionCommand,
  CreativeLibraryKind,
  CreativeLibraryReaction,
  CreativeLibrarySnapshot,
  ImportedHeritageLibraryItem,
  ImportedIdeaLibraryItem,
  SetCreativeLibraryReactionCommand,
} from "@creatx/contracts"

interface CreativeLibraryDocument {
  version: 1
  ideaItems: ImportedIdeaLibraryItem[]
  heritageItems: ImportedHeritageLibraryItem[]
  reactions: CreativeLibraryReaction[]
  artChatSessions: Record<string, string>
}

const emptyDocument = (): CreativeLibraryDocument => ({ version: 1, ideaItems: [], heritageItems: [], reactions: [], artChatSessions: {} })

export class CreativeLibraryStore {
  private mutations = Promise.resolve()

  constructor(private readonly path: string) {}

  async snapshot() {
    return projectSnapshot(await this.read())
  }

  async import(kind: CreativeLibraryKind, input: unknown) {
    const values = Array.isArray(input) ? input : isRecord(input) && Array.isArray(input.items) ? input.items : undefined
    if (!values?.length) throw new Error("library_invalid: import must contain a non-empty array")
    const now = new Date().toISOString()
    const incoming = kind === "idea" ? values.map((value) => requireIdea(value, now)) : values.map((value) => requireHeritage(value, now))
    return this.mutate(async (current) => {
      const next = kind === "idea"
        ? { ...current, ideaItems: mergeById(current.ideaItems, incoming as ImportedIdeaLibraryItem[]) }
        : { ...current, heritageItems: mergeById(current.heritageItems, incoming as ImportedHeritageLibraryItem[]) }
      await this.write(next)
      return projectSnapshot(next)
    })
  }

  async setReaction(command: SetCreativeLibraryReactionCommand) {
    if (!command || (command.kind !== "idea" && command.kind !== "heritage") || (command.reaction !== "liked" && command.reaction !== "saved") || typeof command.value !== "boolean" || typeof command.itemId !== "string" || !command.itemId.trim()) {
      throw new Error("library_invalid: reaction command is invalid")
    }
    return this.mutate(async (current) => {
      const previous = current.reactions.find((reaction) => reaction.kind === command.kind && reaction.itemId === command.itemId)
      const reaction = { kind: command.kind, itemId: command.itemId, liked: previous?.liked ?? false, saved: previous?.saved ?? false, [command.reaction]: command.value }
      const next = { ...current, reactions: [...current.reactions.filter((item) => item.kind !== command.kind || item.itemId !== command.itemId), reaction] }
      await this.write(next)
      return projectSnapshot(next)
    })
  }

  async bindArtChat(command: BindArtChatSessionCommand) {
    if (!command || typeof command.projectId !== "string" || typeof command.sessionId !== "string" || !command.projectId.trim() || !command.sessionId.trim()) throw new Error("library_invalid: projectId and sessionId are required")
    return this.mutate(async (current) => {
      const next = { ...current, artChatSessions: { ...current.artChatSessions, [command.projectId]: command.sessionId } }
      await this.write(next)
      return projectSnapshot(next)
    })
  }

  private mutate<T>(operation: (current: CreativeLibraryDocument) => Promise<T>) {
    const task = this.mutations.then(() => this.read()).then(operation)
    this.mutations = task.then(() => undefined, () => undefined)
    return task
  }

  private async read(): Promise<CreativeLibraryDocument> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as unknown
      if (!isDocument(value)) throw new Error("library_persistence: unsupported document")
      return value
    } catch (error) {
      if (isMissingFile(error)) return emptyDocument()
      if (error instanceof Error && error.message.startsWith("library_")) throw error
      throw new Error(`library_persistence: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async write(document: CreativeLibraryDocument) {
    try {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8")
      await rename(temporary, this.path)
    } catch (error) {
      throw new Error(`library_persistence: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function projectSnapshot(document: CreativeLibraryDocument): CreativeLibrarySnapshot {
  return { ...document, refreshedAt: new Date().toISOString() }
}

function requireIdea(value: unknown, importedAt: string): ImportedIdeaLibraryItem {
  if (!isRecord(value) || typeof value.sentence !== "string" || !value.sentence.trim()) throw new Error("library_invalid: idea sentence is required")
  const sourceUrlValue = optionalText(value.sourceUrl)
  const sourceUrl = sourceUrlValue ? requireWebUrl(sourceUrlValue, "sourceUrl") : undefined
  const sourceTitle = optionalText(value.sourceTitle)
  const notes = optionalText(value.notes)
  return {
    id: stableId("idea", [value.sentence.trim(), optionalText(value.author) ?? "本机用户", sourceUrl ?? ""]),
    sentence: value.sentence.trim(),
    author: optionalText(value.author) ?? "本机用户",
    category: optionalText(value.category) ?? "其他",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean) : [],
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(notes ? { notes } : {}),
    importedAt,
  }
}

function requireHeritage(value: unknown, importedAt: string): ImportedHeritageLibraryItem {
  if (!isRecord(value) || typeof value.title !== "string" || !value.title.trim() || typeof value.sourceUrl !== "string" || !value.sourceUrl.trim()) {
    throw new Error("library_invalid: heritage title and sourceUrl are required")
  }
  const coverUrlValue = optionalText(value.coverUrl)
  const coverUrl = coverUrlValue ? requireWebUrl(coverUrlValue, "coverUrl") : undefined
  const analysisPreview = optionalText(value.analysisPreview)
  const skillDirection = optionalText(value.skillDirection)
  return {
    id: stableId("heritage", [value.title.trim(), optionalText(value.author) ?? "本机用户", value.sourceUrl.trim()]),
    title: value.title.trim(),
    author: optionalText(value.author) ?? "本机用户",
    platform: optionalText(value.platform) ?? "其他",
    category: optionalText(value.category) ?? "其他",
    sourceUrl: requireWebUrl(value.sourceUrl, "sourceUrl"),
    ...(coverUrl ? { coverUrl } : {}),
    ...(analysisPreview ? { analysisPreview } : {}),
    ...(skillDirection ? { skillDirection } : {}),
    importedAt,
  }
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}

function stableId(prefix: string, values: string[]) {
  return `${prefix}-user-${createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 20)}`
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function requireWebUrl(value: string, field: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error()
    return url.href
  } catch {
    throw new Error(`library_invalid: ${field} must be an HTTP(S) URL`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDocument(value: unknown): value is CreativeLibraryDocument {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.ideaItems) && value.ideaItems.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.sentence === "string" && typeof item.author === "string")
    && Array.isArray(value.heritageItems) && value.heritageItems.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.author === "string" && typeof item.sourceUrl === "string")
    && Array.isArray(value.reactions) && value.reactions.every((reaction) => isRecord(reaction) && (reaction.kind === "idea" || reaction.kind === "heritage") && typeof reaction.itemId === "string" && typeof reaction.liked === "boolean" && typeof reaction.saved === "boolean")
    && isRecord(value.artChatSessions) && Object.values(value.artChatSessions).every((sessionId) => typeof sessionId === "string")
}

function isMissingFile(error: unknown) {
  return isRecord(error) && error.code === "ENOENT"
}
