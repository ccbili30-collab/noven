import { createServer } from "node:http"
import { access, mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "noven-heritage-skill-project-"))
const userData = await mkdtemp(join(tmpdir(), "noven-heritage-skill-data-"))
await mkdir(join(projectRoot, "作品"))

const sourceUrl = "https://www.ted.com/talks/andrew_stanton_the_clues_to_a_great_story"
const providerRounds: Array<{ toolResults: number; roles: string[] }> = []
const skillMarkdown = `---
name: story-clue-design
description: Design story clues around audience investment, character drive, and earned narrative payoffs. Use when outlining or revising fiction.
---

# Story clue design

1. Establish why the audience should care.
2. Give the protagonist a strong internal drive.
3. Reveal information in an intentional sequence.
4. Check that the ending pays off the opening clues.

Stop when the transcript does not support a claimed method.

Source: ${sourceUrl}
`

const provider = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
  request.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { messages?: Array<{ role?: string }> }
    const toolResults = body.messages?.filter((message) => message.role === "tool").length ?? 0
    providerRounds.push({ toolResults, roles: body.messages?.map((message) => message.role ?? "unknown") ?? [] })
    const event = toolResults === 0
      ? toolCall("heritage-read", "read_heritage_video_transcript", { transcriptUrl: `${sourceUrl}?view=transcript` })
      : toolResults === 1
        ? toolCall("heritage-install", "install_heritage_skill", {
          name: "story-clue-design",
          description: "Design story clues around audience investment, character drive, and earned narrative payoffs. Use when outlining or revising fiction.",
          sourceUrl,
          skillMarkdown,
        })
        : completion("Skill 已安装；重启诺文后生效。")
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`)
  })
})
await new Promise<void>((resolveListen, rejectListen) => {
  provider.once("error", rejectListen)
  provider.listen(0, "127.0.0.1", resolveListen)
})
const address = provider.address()
if (!address || typeof address === "string") throw new Error("Heritage Skill Provider did not expose a port")

const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    DEEPSEEK_API_KEY: "unused-test-key",
  },
})

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  await page.evaluate(async (baseUrl) => {
    const saved = await window.creatx.saveTextModelProfile({ name: "传承学习测试", providerId: "openai-compatible", modelId: "heritage-test", baseUrl, apiKey: "test-key" })
    if (!saved.ok) throw new Error(saved.error.message)
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.project) throw new Error("Heritage Skill test has no project")
    const session = await window.creatx.createSession(bootstrap.value.project.id)
    if (!session.ok) throw new Error(session.error.message)
    const permission = await window.creatx.setSessionPermissionMode(session.value.id, "approval")
    if (!permission.ok || permission.value.permission.mode !== "approval") throw new Error("Heritage Skill test could not enter approval mode")
  }, `http://127.0.0.1:${address.port}/v1`)
  await page.reload()
  await page.getByTitle("打开传承库").click()
  await page.locator("#heritage-library-title").waitFor()

  const pinned = await page.locator(".wb-heritage-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => ({
    id: card.getAttribute("data-heritage-id"),
    learnable: Boolean(card.querySelector(".wb-heritage-learnable")),
  })))
  const expected = ["heritage-ted-story-clues", "heritage-ted-painting-story", "heritage-ted-fictional-world", "heritage-ted-design-discovery"]
  if (JSON.stringify(pinned.map((item) => item.id)) !== JSON.stringify(expected) || pinned.some((item) => !item.learnable)) throw new Error(`Transcript-backed videos are not pinned first: ${JSON.stringify(pinned)}`)

  await page.locator('[data-heritage-id="heritage-ted-story-clues"] .wb-heritage-card-open').click()
  await page.getByRole("button", { name: "学习并生成 Skill", exact: true }).click()
  await page.locator("#library-share-title").filter({ hasText: "选择学习会话" }).waitFor()
  await page.locator(".wb-library-share-row").first().click()
  const approval = page.getByRole("alertdialog")
  await approval.waitFor({ timeout: 30_000 }).catch(async (error) => {
    throw new Error(`Skill approval was not reached: ${JSON.stringify({ providerRounds, page: (await page.locator("body").innerText()).slice(-4_000) })}`, { cause: error })
  })
  if (!(await approval.locator("pre").innerText()).includes("story-clue-design")) throw new Error("Native approval did not expose the Skill install input")
  await approval.getByRole("button", { name: "允许一次", exact: true }).click()
  await page.waitForFunction(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok || !bootstrap.value.sessions[0]) return false
    const timeline = await window.creatx.readTimeline(bootstrap.value.sessions[0].id)
    return timeline.ok && timeline.value.some((item) => item.kind === "message" && item.presentation === "assistant" && item.text?.includes("重启诺文后生效"))
  }, undefined, { timeout: 30_000 })

  const installed = join(userData, "creatx", "learned-skills", "v1", "story-clue-design", "SKILL.md")
  await access(installed)
  if (await readFile(installed, "utf8") !== skillMarkdown) throw new Error("Installed Skill differs from the approved content")
  console.log(JSON.stringify({ status: "HERITAGE VIDEO SKILL PASS", pinned, transcript: "live TED", approval: "native", installed }))
} finally {
  await app.close().catch(() => undefined)
  await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

function toolCall(id: string, name: string, input: Record<string, unknown>) {
  return { id, object: "chat.completion.chunk", created: 0, model: "heritage-test", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(input) } }] }, finish_reason: "tool_calls" }] }
}

function completion(content: string) {
  return { id: "heritage-complete", object: "chat.completion.chunk", created: 0, model: "heritage-test", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] }
}
