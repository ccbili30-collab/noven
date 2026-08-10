import { isAbsolute, relative, resolve } from "node:path"
import { formatDisplayUserInput, type MessageWithMetadata } from "@cline/sdk"
import { CREATX_INTERNAL_GROWTH_STAGE, CREATX_INTERNAL_SKILL_SEQUENCE, type PortableConversationItemV1, type PortableConversationV1 } from "@creatx/contracts"

export interface ProjectCaseExportInput {
  caseId: string
  title: string
  purpose: string
  conclusion: string
  continuationBrief: string
  projectRoot: string
  exportedFilePaths: readonly string[]
  messages: readonly MessageWithMetadata[]
  privatePrefixMessageIds?: readonly string[]
}

const toolSummaries = new Map([
  ["read_file", "读取了项目文件"],
  ["read_files", "读取了项目文件"],
  ["apply_patch", "修改了项目文件"],
  ["editor", "修改了项目文件"],
])

export function projectPortableConversationV1(input: ProjectCaseExportInput): PortableConversationV1 {
  const exportedFilePaths = new Set(input.exportedFilePaths.map(requireExportedFilePath))
  const privatePrefixMessageIds = new Set(input.privatePrefixMessageIds ?? [])
  const exportedMessages = input.messages.filter((message) => !message.id || !privatePrefixMessageIds.has(message.id))
  const toolResults = new Map(input.messages.flatMap((message) => typeof message.content === "string" ? [] : message.content.flatMap((part) => part.type === "tool_result" ? [[part.tool_use_id, part] as const] : [])))
  const items = input.messages.flatMap((message): PortableConversationItemV1[] => {
    if (message.id && privatePrefixMessageIds.has(message.id)) return []
    if (typeof message.content === "string") return projectTextMessage(message.role, message.content, [], input.projectRoot, exportedFilePaths)
    if (message.role === "user" && message.content.some((part) => part.type === "tool_result")) return []
    const text = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim()
    const messageItems = message.role === "assistant" && message.content.some((part) => part.type === "tool_use")
      ? []
      : projectTextMessage(message.role, text, message.content.flatMap((part) => part.type === "file" ? [part.path] : []), input.projectRoot, exportedFilePaths)
    const toolItems = message.role !== "assistant" ? [] : message.content.flatMap((part): PortableConversationItemV1[] => {
      if (part.type !== "tool_use") return []
      const result = toolResults.get(part.id)
      return [{
        kind: "tool-activity",
        summary: toolSummaries.get(part.name) ?? "使用了未导出的工具",
        status: result && result.is_error !== true ? "succeeded" : "failed",
        fileReferences: referencesFromUnknown(part.input, input.projectRoot, exportedFilePaths),
      }]
    })
    return [...messageItems, ...toolItems]
  })
  const visibleMessages = items.filter((item) => item.kind === "message")
  if (visibleMessages[0]?.role !== "user" || visibleMessages.at(-1)?.role !== "assistant" || items.at(-1)?.kind !== "message" || !isFinalAssistantMessage(exportedMessages.at(-1))) {
    throw new Error("package_conversation_invalid: a project case requires a visible user message and final Assistant reply")
  }
  return {
    schemaVersion: 1,
    caseId: requireCaseId(input.caseId),
    title: requirePortableText(input.title, "title", input.projectRoot, exportedFilePaths),
    purpose: requirePortableText(input.purpose, "purpose", input.projectRoot, exportedFilePaths),
    conclusion: requirePortableText(input.conclusion, "conclusion", input.projectRoot, exportedFilePaths),
    continuationBrief: requirePortableText(input.continuationBrief, "continuationBrief", input.projectRoot, exportedFilePaths),
    items,
  }
}

function projectTextMessage(role: "user" | "assistant", value: string, paths: readonly string[], projectRoot: string, exportedFilePaths: Set<string>): PortableConversationItemV1[] {
  if (role === "user" && isInternalUserProtocol(value)) return []
  const text = sanitizeVisibleText(role === "user" ? formatDisplayUserInput(value) : value, projectRoot, exportedFilePaths)
  if (!text) return []
  return [{
    kind: "message",
    role,
    text,
    fileReferences: [...new Set([...referencesFromText(text, projectRoot, exportedFilePaths), ...paths.flatMap((path) => referenceFromPath(path, projectRoot, exportedFilePaths))])].sort(),
  }]
}

function referencesFromUnknown(value: unknown, projectRoot: string, exportedFilePaths: Set<string>): string[] {
  if (typeof value === "string") return referenceFromPath(value, projectRoot, exportedFilePaths)
  if (Array.isArray(value)) return [...new Set(value.flatMap((entry) => referencesFromUnknown(entry, projectRoot, exportedFilePaths)))].sort()
  if (!value || typeof value !== "object") return []
  return [...new Set(Object.values(value).flatMap((entry) => referencesFromUnknown(entry, projectRoot, exportedFilePaths)))].sort()
}

function referencesFromText(text: string, projectRoot: string, exportedFilePaths: Set<string>) {
  return [...new Set([...text.matchAll(/!?\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)/gu)].flatMap((match) => referenceFromPath(match[1]!, projectRoot, exportedFilePaths)))].sort()
}

function referenceFromPath(value: string, projectRoot: string, exportedFilePaths: Set<string>) {
  const trimmed = value.trim().replace(/^file:\/\/\/?(?=[a-zA-Z]:[\\/])/iu, "")
  const candidate = (isAbsolute(trimmed) ? relative(projectRoot, resolve(trimmed)) : trimmed).replaceAll("\\", "/").replace(/^\.\//u, "")
  return exportedFilePaths.has(candidate) ? [candidate] : []
}

function sanitizeVisibleText(value: string, projectRoot: string, exportedFilePaths: Set<string>) {
  const root = resolve(projectRoot)
  return value
    .replace(/(["'])((?:file:\/\/\/)?[a-zA-Z]:[\\/][^\r\n"']+)\1/giu, (_match, _quote: string, path: string) => safePathText(path, root, exportedFilePaths))
    .replace(/(?:file:\/\/\/)?[a-zA-Z]:[\\/][^\s\r\n"'<>|，。；！？、)]+/giu, (path) => safePathText(path, root, exportedFilePaths))
    .replace(/\\\\[^\\\s\r\n"'<>|，。；！？、]+\\[^\s\r\n"'<>|，。；！？、)]+/gu, "[外部路径已移除]")
    .replace(/(?<!:)\/\/[^/\s\r\n"'<>|，。；！？、]+\/[^\s\r\n"'<>|，。；！？、)]+/gu, "[外部路径已移除]")
    .replace(/(?<![:/])\/(?:[^\s"'<>|/]+\/)+[^\s"'<>|，。；！？、)]*/gu, (path) => safePathText(path, root, exportedFilePaths))
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu, "[敏感信息已移除]")
    .replace(/\bauthorization\s*:\s*[^\r\n]+/giu, "authorization: [敏感信息已移除]")
    .replace(/\bbearer\s+[a-zA-Z0-9._~+/=-]+/giu, "Bearer [敏感信息已移除]")
    .replace(/\b[a-zA-Z0-9_-]*(?:password|passwd|credential|secret|api[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|token|cookie|session[_-]?key)[a-zA-Z0-9_-]*\s*[:=]\s*(?:["'][^"'\r\n]*["']|[^\s,;，；]+)/giu, (secret) => `${secret.slice(0, Math.max(secret.indexOf(":"), secret.indexOf("=")) + 1)}[敏感信息已移除]`)
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, "[敏感信息已移除]")
    .replace(/\bgh[pousr]_[a-zA-Z0-9]{20,}\b/gu, "[敏感信息已移除]")
    .replace(/\bAIza[a-zA-Z0-9_-]{30,}\b/gu, "[敏感信息已移除]")
    .replace(/\bxox(?:a|b|p|r|s)-[a-zA-Z0-9-]{10,}\b/gu, "[敏感信息已移除]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/gu, "[敏感信息已移除]")
    .replace(/\b(sk|pk)-[a-zA-Z0-9_-]{16,}\b/gu, "[敏感信息已移除]")
    .replace(/\b[a-zA-Z0-9+/=_-]{32,}\b/gu, "[敏感信息已移除]")
    .replace(/\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\b/gu, "[个人信息已移除]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, "[个人信息已移除]")
    .replace(/(?<![a-zA-Z0-9])\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![a-zA-Z0-9])/gu, "[个人信息已移除]")
    .trim()
}

function safePathText(value: string, projectRoot: string, exportedFilePaths: Set<string>) {
  return referenceFromPath(value.trim(), projectRoot, exportedFilePaths)[0] ?? "[外部路径已移除]"
}

function isInternalUserProtocol(value: string) {
  const normalized = value.trim()
  return normalized.startsWith(CREATX_INTERNAL_SKILL_SEQUENCE)
    || normalized.startsWith(`/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n`)
}

function isFinalAssistantMessage(message: MessageWithMetadata | undefined) {
  if (message?.role !== "assistant") return false
  if (typeof message.content === "string") return Boolean(message.content.trim())
  return message.content.some((part) => part.type === "text" && part.text.trim()) && !message.content.some((part) => part.type === "tool_use")
}

function requireExportedFilePath(value: string) {
  const path = value.normalize("NFC").replaceAll("\\", "/").replace(/^\.\//u, "")
  if (!path || path.startsWith("/") || /^[a-zA-Z]:/u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`package_path_invalid: ${value}`)
  return path
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value.trim()) > 64 * 1024) throw new Error(`package_conversation_invalid: ${name} is invalid`)
  return value.trim()
}

function requireCaseId(value: unknown) {
  const caseId = requireText(value, "caseId")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(caseId)) throw new Error("package_conversation_invalid: caseId is invalid")
  return caseId
}

function requirePortableText(value: unknown, name: string, projectRoot: string, exportedFilePaths: Set<string>) {
  return requireText(sanitizeVisibleText(requireText(value, name), projectRoot, exportedFilePaths), name)
}
