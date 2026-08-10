import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SqliteSessionStore, type MessageWithMetadata } from "@cline/sdk"
import { CREATX_INTERNAL_SKILL_SEQUENCE, type SessionKind, type SessionPermissionMode, type SessionPermissionPort } from "@creatx/contracts"
import { ClineAdapter, projectPortableConversationV1 } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("portable project cases", () => {
  test("persists one project case marker across restart and removes it with the source session", async () => {
    const dataDir = await temporaryRoot("Noven Project Case Data ")
    const projectRoot = await temporaryRoot("Noven Project Case 世界 ")
    let adapter = await createAdapter(dataDir)
    const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot, title: "星图共创" })

    expect(await adapter.setProjectCase(session.id, true)).toBe(true)
    expect((Reflect.get(adapter, "store") as SqliteSessionStore).get(session.id)?.metadata).toEqual(expect.objectContaining({ title: "星图共创", creatxProjectId: "project-1", creatxProviderId: "deepseek", creatxProjectCase: true }))
    expect((await adapter.listProjectCaseSessions("project-1")).map((record) => record.id)).toEqual([session.id])
    await adapter.dispose()

    adapter = await createAdapter(dataDir)
    expect((await adapter.listProjectCaseSessions("project-1")).map((record) => record.id)).toEqual([session.id])
    expect(await adapter.setProjectCase(session.id, false)).toBe(false)
    expect(await adapter.listProjectCaseSessions("project-1")).toEqual([])
    await adapter.setProjectCase(session.id, true)
    await adapter.deleteSession(session.id)
    expect(await adapter.listProjectCaseSessions("project-1")).toEqual([])
    await adapter.dispose()

    const store = new SqliteSessionStore({ sessionsDir: join(dataDir, "database") })
    store.init()
    expect(store.get(session.id)).toBeUndefined()
    store.close()
  })

  test("rejects personal sessions and Growth Workers without creating another marker store", async () => {
    const dataDir = await temporaryRoot("Noven Project Case Boundary ")
    const projectRoot = await temporaryRoot("Noven Project Case Project ")
    const adapter = await createAdapter(dataDir)
    const store = Reflect.get(adapter, "store") as SqliteSessionStore
    const sessionService = Reflect.get(adapter, "sessionService") as {
      createRootSessionWithArtifacts(input: {
        sessionId: string
        source: "desktop"
        pid: number
        interactive: boolean
        provider: string
        model: string
        cwd: string
        workspaceRoot: string
        enableTools: boolean
        enableSpawn: boolean
        enableTeams: boolean
        metadata: Record<string, unknown>
      }): Promise<unknown>
    }
    try {
      await sessionService.createRootSessionWithArtifacts({ sessionId: "personal-1", source: "desktop", pid: process.pid, interactive: true, provider: "deepseek", model: "deepseek-chat", cwd: projectRoot, workspaceRoot: projectRoot, enableTools: false, enableSpawn: false, enableTeams: false, metadata: { title: "个人会话" } })
      await sessionService.createRootSessionWithArtifacts({ sessionId: "worker-1", source: "desktop", pid: process.pid, interactive: true, provider: "deepseek", model: "deepseek-chat", cwd: projectRoot, workspaceRoot: projectRoot, enableTools: true, enableSpawn: false, enableTeams: false, metadata: { title: "Worker", creatxProjectId: "project-1", creatxInternalRole: "growth-stage", creatxGrowthOwnerSessionId: "owner-1", creatxGrowthGoalId: "goal-1" } })
      store.updateStatus("personal-1", "completed", 0)
      store.updateStatus("worker-1", "completed", 0)

      await expect(adapter.setProjectCase("personal-1", true)).rejects.toThrow("personal sessions")
      await expect(adapter.setProjectCase("worker-1", true)).rejects.toThrow("Growth Workers")
      expect(store.get("personal-1")?.metadata?.creatxProjectCase).toBeUndefined()
      expect(store.get("worker-1")?.metadata?.creatxProjectCase).toBeUndefined()
    } finally {
      await adapter.dispose()
    }
  })

  test("exports only visible messages, final replies, safe summaries and selected project file references", () => {
    const projectRoot = "D:\\作品\\星图"
    const messages: MessageWithMetadata[] = [
      { id: "private-1", role: "user", content: "私人客户名称", metadata: { source: "copied-personal-prefix" } },
      { id: "user-1", role: "user", content: [{ type: "text", text: "请修改 [世界](世界.md)，不要读取 C:\\Users\\Alice\\秘密.txt。apiKey=super-secret" }, { type: "file", path: "D:\\作品\\星图\\参考.png", content: "secret bytes" }] },
      { id: "assistant-tool", role: "assistant", content: [{ type: "thinking", thinking: "隐藏推理" }, { type: "text", text: "包含工具调用的中间回复" }, { type: "tool_use", id: "read-1", name: "read_files", input: { paths: ["世界.md", "C:\\Users\\Alice\\秘密.txt"] } }, { type: "tool_use", id: "shell-1", name: "run_commands", input: { command: "Get-Content C:\\Users\\Alice\\秘密.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read-1", name: "read_files", content: "世界.md 的完整私密正文" }, { type: "tool_result", tool_use_id: "shell-1", name: "run_commands", content: "shell 完整输出", is_error: true }] },
      { id: "assistant-final", role: "assistant", content: [{ type: "text", text: "已完成世界设定。" }, { type: "redacted_thinking", data: "encrypted" }] },
    ]

    const result = projectPortableConversationV1({
      caseId: "case-1",
      title: "星图案例",
      purpose: "展示如何整理星图",
      conclusion: "世界设定已完成",
      continuationBrief: "继续补全边疆区域",
      projectRoot,
      exportedFilePaths: ["世界.md", "参考.png"],
      messages,
      privatePrefixMessageIds: ["private-1"],
    })

    expect(result).toEqual({
      schemaVersion: 1,
      caseId: "case-1",
      title: "星图案例",
      purpose: "展示如何整理星图",
      conclusion: "世界设定已完成",
      continuationBrief: "继续补全边疆区域",
      items: [
        { kind: "message", role: "user", text: "请修改 [世界](世界.md)，不要读取 [外部路径已移除]。apiKey=[敏感信息已移除]", fileReferences: ["世界.md", "参考.png"] },
        { kind: "tool-activity", summary: "读取了项目文件", status: "succeeded", fileReferences: ["世界.md"] },
        { kind: "tool-activity", summary: "使用了未导出的工具", status: "failed", fileReferences: [] },
        { kind: "message", role: "assistant", text: "已完成世界设定。", fileReferences: [] },
      ],
    })
    const serialized = JSON.stringify(result)
    for (const secret of ["私人客户名称", "隐藏推理", "中间回复", "秘密.txt", "super-secret", "完整私密正文", "Get-Content", "shell 完整输出", "encrypted"]) expect(serialized).not.toContain(secret)
  })

  test("reads the marked case from the authoritative Cline message artifact", async () => {
    const dataDir = await temporaryRoot("Noven Project Case Export ")
    const projectRoot = await temporaryRoot("Noven Project Case Files ")
    const adapter = await createAdapter(dataDir)
    try {
      const session = await adapter.createProjectSession({ projectId: "project-export", projectRoot, title: "真实会话" })
      const store = Reflect.get(adapter, "store") as SqliteSessionStore
      const messagesPath = store.get(session.id)?.messagesPath
      if (!messagesPath) throw new Error("test setup did not create a Cline messages artifact")
      await Bun.write(messagesPath, JSON.stringify([
        { role: "user", content: "整理世界.md" },
        { role: "assistant", content: [{ type: "tool_use", id: "edit-1", name: "editor", input: { path: "世界.md", content: "不应导出" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "edit-1", name: "editor", content: "完整结果不应导出" }] },
        { role: "assistant", content: "设定整理完成。" },
      ]))
      await expect(adapter.exportProjectCase({ projectId: "project-export", sessionId: session.id, title: "案例", purpose: "展示整理", conclusion: "整理完成", continuationBrief: "继续创作", exportedFilePaths: ["世界.md"] })).rejects.toThrow("not marked")
      await adapter.setProjectCase(session.id, true)
      await expect(adapter.exportProjectCase({ projectId: "another-project", sessionId: session.id, title: "案例", purpose: "展示整理", conclusion: "整理完成", continuationBrief: "继续创作", exportedFilePaths: ["世界.md"] })).rejects.toThrow("does not belong")

      expect(await adapter.exportProjectCase({ projectId: "project-export", sessionId: session.id, title: "案例", purpose: "展示整理", conclusion: "整理完成", continuationBrief: "继续创作", exportedFilePaths: ["世界.md"] })).toEqual(expect.objectContaining({
        caseId: session.id,
        items: [
          { kind: "message", role: "user", text: "整理世界.md", fileReferences: [] },
          { kind: "tool-activity", summary: "修改了项目文件", status: "succeeded", fileReferences: ["世界.md"] },
          { kind: "message", role: "assistant", text: "设定整理完成。", fileReferences: [] },
        ],
      }))
    } finally {
      await adapter.dispose()
    }
  })

  test("fails closed when the authoritative history has no complete visible exchange", async () => {
    for (const messages of [
      [{ role: "user" as const, content: "只有用户消息" }],
      [{ role: "assistant" as const, content: "旧回复" }, { role: "user" as const, content: "新请求" }],
      [{ role: "user" as const, content: "已完成请求" }, { role: "assistant" as const, content: "已完成" }, { role: "user" as const, content: "尾部未回复请求" }],
      [{ role: "user" as const, content: "请求" }, { role: "assistant" as const, content: "旧回复" }, { role: "assistant" as const, content: [{ type: "tool_use" as const, id: "unfinished", name: "read_files", input: {} }] }],
      [{ role: "user" as const, content: "请求" }, { role: "assistant" as const, content: "旧回复" }, { role: "user" as const, content: `${CREATX_INTERNAL_SKILL_SEQUENCE}\n继续内部片段` }],
    ]) {
      expect(() => projectPortableConversationV1({ caseId: "case-incomplete", title: "不完整案例", purpose: "验证失败关闭", conclusion: "没有可导出的回复", continuationBrief: "继续", projectRoot: "D:\\作品", exportedFilePaths: [], messages })).toThrow("requires a visible user message and final Assistant reply")
    }
  })

  test("redacts common credentials and every supported Windows absolute path form", () => {
    const result = projectPortableConversationV1({
      caseId: "case-private",
      title: "隐私检查",
      purpose: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature；裸 Bearer secret-token-value",
      conclusion: "password=hunter2 AKIA1234567890ABCDEF AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      continuationBrief: "检查 C:/Users/Alice/private.txt、file:///D:/秘密/key.txt、\\\\server\\share\\private.txt、//server/share/private.txt 和外部(/home/alice/private.txt)，联系 alice@example.com 或 13800138000",
      projectRoot: "D:\\作品",
      exportedFilePaths: [],
      messages: [{ role: "user", content: "继续" }, { role: "assistant", content: "完成" }],
    })
    const serialized = JSON.stringify(result)
    for (const secret of ["eyJhbGci", "secret-token-value", "hunter2", "AKIA1234567890ABCDEF", "wJalrXUtn", "Users/Alice", "秘密/key.txt", "server", "share", "home/alice", "alice@example.com", "13800138000"]) expect(serialized).not.toContain(secret)
  })

  test("rejects a Run that starts while the authoritative message Artifact is being read", async () => {
    const dataDir = await temporaryRoot("Noven Project Case Race ")
    const projectRoot = await temporaryRoot("Noven Project Case Race Files ")
    const adapter = await createAdapter(dataDir)
    try {
      const session = await adapter.createProjectSession({ projectId: "project-race", projectRoot })
      const store = Reflect.get(adapter, "store") as SqliteSessionStore
      const messagesPath = store.get(session.id)?.messagesPath
      if (!messagesPath) throw new Error("test setup did not create a Cline messages artifact")
      await Bun.write(messagesPath, JSON.stringify([{ role: "user", content: "请求" }, { role: "assistant", content: "回复" }]))
      await adapter.setProjectCase(session.id, true)
      const core = Reflect.get(adapter, "core") as { readMessages(sessionId: string): Promise<MessageWithMetadata[]> }
      const original = core.readMessages.bind(core)
      core.readMessages = async (sessionId) => {
        const messages = await original(sessionId)
        ;(Reflect.get(adapter, "runningSessionIds") as Set<string>).add(sessionId)
        return messages
      }

      await expect(adapter.exportProjectCase({ projectId: "project-race", sessionId: session.id, title: "案例", purpose: "目的", conclusion: "结论", continuationBrief: "继续", exportedFilePaths: [] })).rejects.toThrow("changed while it was being exported")
      ;(Reflect.get(adapter, "runningSessionIds") as Set<string>).delete(session.id)
    } finally {
      await adapter.dispose()
    }
  })

  test("honors desktop cancellation before reading project history", async () => {
    const adapter = await createAdapter(await temporaryRoot("Noven Project Case Cancel "))
    try {
      await expect(adapter.exportProjectCase({ projectId: "project-cancel", sessionId: "session-cancel", title: "案例", purpose: "目的", conclusion: "结论", continuationBrief: "继续", exportedFilePaths: [] }, AbortSignal.abort(new Error("package_job_cancelled: user cancelled")))).rejects.toThrow("package_job_cancelled")
    } finally {
      await adapter.dispose()
    }
  })
})

async function temporaryRoot(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

function createAdapter(dataDir: string) {
  return ClineAdapter.create({
    dataDir,
    providerId: "deepseek",
    modelId: "deepseek-chat",
    apiKey: "not-used",
    sessionPermissions: memorySessionPermissions(),
    onEvent: () => undefined,
  })
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
