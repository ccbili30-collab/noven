import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { ClineAdapter } from "@creatx/cline-adapter"
import type { CreatXEvent, SessionKind, SessionPermissionMode, SessionPermissionPort } from "@creatx/contracts"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 项目图片读取 "))
const dataDir = await mkdtemp(join(tmpdir(), "creatx-project-image-read-"))
const projectImage = join(projectRoot, "参考建筑.png")
const apiKey = requireEnvironment("CREATX_PROVIDER_API_KEY", "CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_PROVIDER_BASE_URL", "CREATX_IMAGE_BASE_URL")
const events: CreatXEvent[] = []

await copyFile(resolve(workspace, "apps", "desktop", "renderer", "src", "assets", "creatx-glass-buildings.png"), projectImage)

const adapter = await ClineAdapter.create({
  dataDir,
  providerId: "openai-compatible",
  modelId: "gpt-5.6-luna",
  apiKey,
  baseUrl,
  sessionPermissions: memorySessionPermissions(),
  onEvent: (event) => events.push(event),
})

try {
  const session = await adapter.createProjectSession({ projectId: "project-image-live", projectRoot })
  await adapter.sendMessage(session.id, "请使用 read_files 直接查看项目里的 参考建筑.png。只回答画面是否包含建筑，以及整体明暗倾向；不要根据文件名猜测。")
  const answer = (await adapter.readMessages(session.id)).filter((message) => message.role === "assistant").at(-1)?.text ?? ""
  const tools = events.filter((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "streaming").map((event) => event.type === "timeline.upsert" ? event.item.toolName ?? "" : "")
  if (!tools.includes("read_files")) throw new Error(`PROJECT IMAGE READ LIVE FAIL: read_files was not called: ${JSON.stringify(tools)}`)
  if (!/(建筑|楼|城市|街道|房屋)/.test(answer) || !/(暗|深色|低明度|明暗|明亮|阳光|阴影)/.test(answer)) {
    throw new Error(`PROJECT IMAGE READ LIVE FAIL: Luna did not describe the visible image: ${answer}`)
  }
  console.log(JSON.stringify({ status: "CLINE PROJECT IMAGE READ LIVE PASS", provider: "JMRAI gpt-5.6-luna", tool: "read_files", answer }))
} finally {
  await adapter.dispose()
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(dataDir, { recursive: true, force: true })])
}

function memorySessionPermissions(): SessionPermissionPort {
  const states = new Map<string, { sessionId: string; kind: SessionKind; mode: SessionPermissionMode }>()
  return {
    ensure: (sessionId, kind) => {
      const current = states.get(sessionId)
      if (current) return current
      const created = { sessionId, kind, mode: "free" as const }
      states.set(sessionId, created)
      return created
    },
    get: (sessionId) => states.get(sessionId),
    setMode: (sessionId, mode) => {
      const current = states.get(sessionId)
      if (!current) throw new Error("session_missing")
      const updated = { ...current, mode }
      states.set(sessionId, updated)
      return updated
    },
  }
}

function requireEnvironment(primary: string, fallback: string) {
  const value = process.env[primary]?.trim() || process.env[fallback]?.trim()
  if (!value) throw new Error(`PROJECT IMAGE READ LIVE FAIL: ${primary} or ${fallback} is not configured`)
  return value
}
