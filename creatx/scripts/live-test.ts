import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ClineAdapter } from "@creatx/cline-adapter"
import { SessionPermissionStore } from "@creatx/session-runtime"
import type { CreatXEvent } from "@creatx/contracts"
import { projectId } from "@creatx/project-files"

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error("LIVE FAIL: DEEPSEEK_API_KEY is not configured")
  process.exit(1)
}

const root = await mkdtemp(join(tmpdir(), "creatx-live-project-"))
const dataDir = await mkdtemp(join(tmpdir(), "creatx-live-data-"))
const expectedContent = "CREATX_LIVE_FILE_TOOL_PASSED"
const events: CreatXEvent[] = []
let adapter: ClineAdapter | undefined
let sessionPermissions: SessionPermissionStore | undefined
let failure: unknown

try {
  sessionPermissions = new SessionPermissionStore(join(dataDir, "session.sqlite"))
  adapter = await ClineAdapter.create({
    dataDir,
    providerId: process.env.CREATX_PROVIDER_ID ?? "deepseek",
    modelId: process.env.CREATX_MODEL_ID ?? "deepseek-chat",
    apiKey,
    onEvent: (event) => {
      events.push(event)
      if (event.type === "approval.requested") adapter?.resolveApproval(event.approval.id, true)
    },
    sessionPermissions,
  })
  const session = await adapter.createProjectSession({ projectId: projectId(root), projectRoot: root })
  await adapter.setSessionPermissionMode(session.id, "approval")
  await adapter.sendMessage(session.id, `Use the editor tool to create a file named creatx-live.md containing exactly this ASCII sentinel with no punctuation: ${expectedContent}. Do not use shell commands. Then briefly confirm completion.`)
  const content = await readFile(join(root, "creatx-live.md"), "utf8")
  if (content.trim() !== expectedContent) throw new Error(`Unexpected file content: ${content}`)
  const approval = events.find((event) => event.type === "approval.requested")
  const toolFinished = events.find((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "completed")
  if (!approval || !toolFinished) throw new Error("Live run did not expose approval and successful tool events")
  console.log(JSON.stringify({
    status: "LIVE PASS",
    provider: adapter.providerId,
    model: adapter.modelId,
    sessionId: session.id,
    approval: approval.type === "approval.requested" ? approval.approval.toolName : undefined,
    file: "creatx-live.md",
  }))
} catch (error) {
  failure = error
} finally {
  await adapter?.dispose()
  sessionPermissions?.close()
  await Promise.all([rm(root, { recursive: true, force: true }), rm(dataDir, { recursive: true, force: true })])
}

if (failure) {
  console.error(`LIVE FAIL: ${failure instanceof Error ? failure.message : String(failure)}`)
  process.exitCode = 1
}
