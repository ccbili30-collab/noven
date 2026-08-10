import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ClineAdapter } from "@creatx/cline-adapter"
import type { CreatXEvent } from "@creatx/contracts"
import { projectId } from "@creatx/project-files"
import { SessionPermissionStore } from "@creatx/session-runtime"

const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const projectRoot = await mkdtemp(join(tmpdir(), "creatx-web-fetch-live-project-"))
const dataDir = await mkdtemp(join(tmpdir(), "creatx-web-fetch-live-data-"))
const events: CreatXEvent[] = []
const permissions = new SessionPermissionStore(join(dataDir, "session.sqlite"))
let adapter: ClineAdapter | undefined

try {
  adapter = await ClineAdapter.create({
    dataDir,
    providerId: "openai-compatible",
    modelId: "gpt-5.6-luna",
    apiKey,
    baseUrl,
    sessionPermissions: permissions,
    onEvent: (event) => events.push(event),
  })
  const session = await adapter.createProjectSession({ projectId: projectId(projectRoot), projectRoot })
  await adapter.sendMessage(session.id, "这是联网搜索 Live 验收。禁止使用 run_commands，也不要凭已有知识回答。先调用 fetch_web_content 读取 https://www.bing.com/search?format=rss&q=site%3Aen.wikipedia.org%2Fwiki%2FMiddle_Ages+Middle+Ages ，从实际 item/link 选择 en.wikipedia.org 正文 URL；再调用 fetch_web_content 读取正文。最后报告两步是否成功、实际 URL，并只根据正文给出中世纪通常采用的起止世纪。任何一步失败都必须如实说明。")

  const toolNames = events.filter((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "streaming").map((event) => event.type === "timeline.upsert" ? event.item.toolName ?? "" : "")
  const answerEvent = events.filter((event) => event.type === "timeline.upsert" && event.item.kind === "message" && event.item.state === "completed").at(-1)
  const answer = answerEvent?.type === "timeline.upsert" ? answerEvent.item.text ?? "" : ""
  const completed = events.some((event) => event.type === "run.state" && event.state === "completed")
  if (toolNames.length !== 2 || toolNames.some((name) => name !== "fetch_web_content")) {
    throw new Error(`Unexpected tool sequence: ${JSON.stringify(toolNames)}`)
  }
  if (!completed) throw new Error("Cline Run did not complete")
  if (!answer.includes("https://en.wikipedia.org/wiki/Middle_Ages") || !/5\s*世纪/.test(answer) || !/15\s*世纪/.test(answer)) {
    throw new Error(`Provider did not return grounded web evidence: ${answer}`)
  }
  console.log(JSON.stringify({
    status: "CLINE WEB FETCH LIVE PASS",
    provider: adapter.providerId,
    model: adapter.modelId,
    tools: toolNames,
    source: "https://en.wikipedia.org/wiki/Middle_Ages",
  }))
} finally {
  await adapter?.dispose()
  permissions.close()
  await Promise.all([
    rm(projectRoot, { recursive: true, force: true }),
    rm(dataDir, { recursive: true, force: true }),
  ])
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`CLINE WEB FETCH LIVE FAIL: ${name} is not configured`)
  return value
}
