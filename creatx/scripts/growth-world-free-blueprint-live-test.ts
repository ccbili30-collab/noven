import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ClineAdapter } from "@creatx/cline-adapter"
import type { CreatXEvent } from "@creatx/contracts"
import { projectId } from "@creatx/project-files"
import { SessionPermissionStore } from "@creatx/session-runtime"

const subjects = ["童话", "中古", "猎奇", "科幻", "无厘头", "现代", "古代", "古代架空"] as const
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const runRoot = await mkdtemp(join(tmpdir(), "creatx-growth-world-blueprints-"))
const dataDir = join(runRoot, "data")
const evidenceDir = join(import.meta.dirname, "..", "..", "artifacts", "growth-world-free-blueprints", "2026-07-29")
await mkdir(dataDir, { recursive: true })
const permissions = new SessionPermissionStore(join(dataDir, "session.sqlite"))
let adapter: ClineAdapter | undefined

try {
  await mkdir(evidenceDir, { recursive: true })
  const events: CreatXEvent[] = []
  adapter = await ClineAdapter.create({
    dataDir,
    providerId: "openai-compatible",
    modelId: "gpt-5.6-luna",
    apiKey,
    baseUrl,
    sessionPermissions: permissions,
    onEvent: (event) => events.push(event),
  })

  const results = []
  for (const subject of subjects) {
    const projectRoot = join(runRoot, "projects", subject)
    await mkdir(projectRoot, { recursive: true })
    const session = await adapter.createProjectSession({ projectId: projectId(projectRoot), projectRoot })
    const eventStart = events.length
    const prompt = `我想创建一个${subject}世界。现在先不要实际创作或修改文件，只告诉我：你准备生成怎样的完整世界骨架。请自行决定结构。`
    let thrown: string | undefined
    try {
      await adapter.sendMessage(session.id, prompt)
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error)
    }
    const runEvents = events.slice(eventStart)
    const answerEvent = runEvents.filter((event) => event.type === "timeline.upsert" && event.item.kind === "message" && event.item.state === "completed").at(-1)
    const answer = answerEvent?.type === "timeline.upsert" ? answerEvent.item.text ?? "" : ""
    const tools = runEvents.filter((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "streaming").map((event) => event.type === "timeline.upsert" ? event.item.toolName ?? "" : "")
    const terminal = runEvents.filter((event) => event.type === "run.state").at(-1)
    const result = {
      subject,
      prompt,
      sessionId: session.id,
      terminal: terminal?.type === "run.state" ? terminal.state : "missing",
      tools,
      thrown,
      answer,
    }
    results.push(result)
    await writeFile(join(evidenceDir, `${subject}.md`), `# ${subject}\n\n## 测试输入\n\n${prompt}\n\n## 原始回答\n\n${answer || "（没有返回回答）"}\n\n## 运行证据\n\n- 终态：${result.terminal}\n- 工具调用：${tools.length ? tools.join(", ") : "无"}\n- 异常：${thrown ?? "无"}\n`, "utf8")
  }

  await writeFile(join(evidenceDir, "raw-results.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: adapter.providerId,
    model: adapter.modelId,
    system: "CreatX base system prompt only; no Growth World, Growth, or Study Skill",
    results,
  }, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({
    status: "GROWTH WORLD FREE BLUEPRINT LIVE COMPLETE",
    provider: adapter.providerId,
    model: adapter.modelId,
    completed: results.filter((result) => result.terminal === "completed").length,
    toolFree: results.filter((result) => result.tools.length === 0).length,
    evidenceDir,
  }))
} finally {
  await adapter?.dispose()
  permissions.close()
  await rm(runRoot, { recursive: true, force: true })
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`GROWTH WORLD FREE BLUEPRINT LIVE FAIL: ${name} is not configured`)
  return value
}
