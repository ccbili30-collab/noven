import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { tmpdir } from "node:os"
import { CREATX_GROWTH_ACTIVATION_MARKER, CREATX_INTERNAL_GROWTH_STAGE, type CreatXEvent, type CreatXToolContribution, type GrowthStageFailure, type SessionKind, type SessionPermissionMode, type SessionPermissionPort } from "@creatx/contracts"
import type { Message } from "@cline/sdk"
import { ClineAdapter, createProjectFileReadExecutor, findOwnerActivationEvidence, findUniqueOwnerControllerTurn, hasPersistedOwnerControllerResult, ownerActivationMarkerMatches } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Cline file attachment compatibility", () => {
  test("matches Owner activation markers as complete lines instead of prefixes", () => {
    expect(ownerActivationMarkerMatches("<mode_notice>\ncreatx_owner_activation:activation-a\n</mode_notice>", "creatx_owner_activation:activation-a")).toBe(true)
    expect(ownerActivationMarkerMatches("<mode_notice>\ncreatx_owner_activation:activation-a-suffix\n</mode_notice>", "creatx_owner_activation:activation-a")).toBe(false)
  })

  test("requires one globally unique trusted Owner controller call and result", () => {
    const valid = ownerEvidenceTurn("activation-a", "call-a")
    expect(hasPersistedOwnerControllerResult([
      ...valid,
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-a\n</mode_notice>\n交付结果` },
      { role: "assistant", content: "最终汇报" },
    ], "activation-a", "run_growth")).toBe(true)
    expect(hasPersistedOwnerControllerResult([...valid, ...ownerEvidenceTurn("activation-a", "call-b")], "activation-a", "run_growth")).toBe(false)
    expect(findUniqueOwnerControllerTurn([...valid, ...ownerEvidenceTurn("activation-a", "call-b")], "activation-a", "run_growth")).toBeUndefined()
    expect(hasPersistedOwnerControllerResult([
      ...valid.slice(0, 3),
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-a", name: "run_growth", content: '{"activationId":"activation-a"}' }] },
    ], "activation-a", "run_growth")).toBe(false)
    expect(hasPersistedOwnerControllerResult([
      ...valid.slice(0, 3),
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-a", name: "run_growth", content: "failed", is_error: true }] },
    ], "activation-a", "run_growth")).toBe(false)
    expect(findOwnerActivationEvidence([
      ...valid,
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-unowned", name: "run_growth", content: "failed", is_error: true }] },
    ], "activation-a", "run_growth")).toBeUndefined()
    expect(findOwnerActivationEvidence([
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-a\n</mode_notice>\n开始` },
      { role: "assistant", content: [{ type: "tool_use", id: "call-a", name: "run_growth", input: {} }] },
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-a\n</mode_notice>\n恢复` },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-a", name: "run_growth", content: '{"activationId":"activation-a"}' }] },
      { role: "assistant", content: "跨回合拼接回复" },
    ], "activation-a", "run_growth")).toBeUndefined()
    expect(findOwnerActivationEvidence([
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-a\n</mode_notice>\n开始` },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-a", name: "run_growth", content: '{"activationId":"activation-a"}' }] },
      { role: "assistant", content: [{ type: "tool_use", id: "call-a", name: "run_growth", input: {} }] },
    ], "activation-a", "run_growth")).toBeUndefined()
    expect(findOwnerActivationEvidence([
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-zero\n</mode_notice>\n说明一` },
      { role: "assistant", content: "说明一" },
      { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-zero\n</mode_notice>\n说明二` },
      { role: "assistant", content: "说明二" },
    ], "activation-zero", "resolve_growth_issue")).toBeUndefined()
  })

  test("permanently deletes an idle session through the Cline history authority", async () => {
    const dataDir = await temporaryDirectory("creatx-session-delete-data-")
    const projectRoot = await temporaryDirectory("creatx-session-delete-project-")
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-delete", projectRoot })
      expect((await adapter.listSessions()).map((record) => record.id)).toContain(session.id)

      await expect(adapter.deleteSession(session.id)).resolves.toBeUndefined()

      expect((await adapter.listSessions()).map((record) => record.id)).not.toContain(session.id)
      await expect(adapter.deleteSession(session.id)).rejects.toThrow("session_missing")
    } finally {
      await adapter.dispose()
    }
  })

  test("renames an idle session through the Cline history authority", async () => {
    const dataDir = await temporaryDirectory("creatx-session-rename-data-")
    const projectRoot = await temporaryDirectory("creatx-session-rename-project-")
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-rename", projectRoot })
      const renamed = await adapter.renameSession(session.id, "重新命名的会话")
      expect(renamed.id).toBe(session.id)
      expect(renamed.title).toBe("重新命名的会话")
      expect((await adapter.listSessions()).find((record) => record.id === session.id)?.title).toBe("重新命名的会话")
    } finally {
      await adapter.dispose()
    }
  })

  test("switches the active session connection for the next turn without replacing its history", async () => {
    const dataDir = await temporaryDirectory("creatx-model-switch-data-")
    const projectRoot = await temporaryDirectory("creatx-model-switch-project-")
    const requests: Array<{ url: string; body: string; authorization?: string }> = []
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const body = await request.text()
        requests.push({ url: request.url, body, ...(request.headers.get("authorization") ? { authorization: request.headers.get("authorization")! } : {}) })
        return modelSwitchResponse(JSON.parse(body)?.model ?? "unknown", requests.length)
      },
    })
    const secondConnection = {
      profileId: "profile-luna",
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
      apiKey: "second-key",
      baseUrl: `${server.url}v1`,
    }
    let adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "first-key",
      fetch: modelSwitchFetch(requests),
      resolveModelConnection: (_providerId, _modelId, profileId) => profileId === secondConnection.profileId ? secondConnection : undefined,
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-model-switch", projectRoot })
      await adapter.sendMessage(session.id, "第一轮")
      await adapter.switchSessionConnection(session.id, secondConnection)
      await adapter.sendMessage(session.id, "第二轮")

      await adapter.dispose()
      adapter = await ClineAdapter.create({
        dataDir,
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKey: "first-key",
        fetch: modelSwitchFetch(requests),
        resolveModelConnection: (_providerId, _modelId, profileId) => profileId === secondConnection.profileId ? secondConnection : undefined,
        sessionPermissions: memorySessionPermissions(),
        onEvent: () => undefined,
      })
      await adapter.sendMessage(session.id, "第三轮")

      expect(requests.map((request) => JSON.parse(request.body).model)).toEqual(["deepseek-chat", "gpt-5.6-luna", "gpt-5.6-luna"])
      expect(requests[1]?.url).toStartWith(`${server.url}v1`)
      expect(requests[1]?.authorization).toBe("Bearer second-key")
      expect(requests[2]?.url).toStartWith(`${server.url}v1`)
      expect(requests[2]?.authorization).toBe("Bearer second-key")
      expect((await adapter.readMessages(session.id)).filter((message) => message.role === "user")).toHaveLength(3)
      expect((await adapter.listSessions()).find((record) => record.id === session.id)).toMatchObject({ providerId: "openai-compatible", modelId: "gpt-5.6-luna" })
    } finally {
      await adapter.dispose()
      server.stop(true)
    }
  })

  test("rebinds a restored session with a missing profile to the configured global connection", async () => {
    const dataDir = await temporaryDirectory("creatx-model-fallback-data-")
    const projectRoot = await temporaryDirectory("creatx-model-fallback-project-")
    const requests: Array<{ url: string; body: string; authorization?: string }> = []
    const staleConnection = {
      profileId: "profile-removed",
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
      apiKey: "removed-key",
      baseUrl: "https://removed.invalid/v1",
    }
    const globalConnection = {
      profileId: "profile-global",
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
      apiKey: "global-key",
      baseUrl: "https://global.invalid/v1",
    }
    let adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "initial-key",
      fetch: modelSwitchFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-model-fallback", projectRoot })
      await adapter.switchSessionConnection(session.id, staleConnection)
      await adapter.dispose()

      adapter = await ClineAdapter.create({
        dataDir,
        providerId: globalConnection.providerId,
        modelId: globalConnection.modelId,
        apiKey: globalConnection.apiKey,
        baseUrl: globalConnection.baseUrl,
        fetch: modelSwitchFetch(requests),
        resolveModelConnection: () => undefined,
        sessionPermissions: memorySessionPermissions(),
        onEvent: () => undefined,
      })
      adapter.setDefaultConnection(globalConnection)
      await adapter.sendMessage(session.id, "恢复后继续")

      expect(requests).toHaveLength(1)
      expect(JSON.parse(requests[0]!.body).model).toBe(globalConnection.modelId)
      expect(requests[0]!.url).toStartWith(globalConnection.baseUrl)
      expect(requests[0]!.authorization).toBe("Bearer global-key")
      expect((await adapter.listSessions()).find((record) => record.id === session.id)).toMatchObject({ providerId: globalConnection.providerId, modelId: globalConnection.modelId })
      const artifact = await Bun.file(join(dataDir, "sessions", session.id, `${session.id}.json`)).json()
      expect(artifact.metadata).toMatchObject({
        creatxProviderId: globalConnection.providerId,
        creatxModelId: globalConnection.modelId,
        creatxTextProfileId: globalConnection.profileId,
      })
    } finally {
      await adapter.dispose()
    }
  })

  test("fails locally without a Provider request when both restored and global profiles lack credentials", async () => {
    const dataDir = await temporaryDirectory("creatx-model-fallback-closed-data-")
    const projectRoot = await temporaryDirectory("creatx-model-fallback-closed-project-")
    const requests: Array<{ url: string; body: string; authorization?: string }> = []
    let adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "initial-key",
      fetch: modelSwitchFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-model-fallback-closed", projectRoot })
      await adapter.switchSessionConnection(session.id, {
        profileId: "profile-removed",
        providerId: "openai-compatible",
        modelId: "gpt-5.6-luna",
        apiKey: "removed-key",
      })
      await adapter.dispose()

      adapter = await ClineAdapter.create({
        dataDir,
        profileId: "profile-global-empty",
        providerId: "deepseek",
        modelId: "deepseek-v4-flash",
        fetch: modelSwitchFetch(requests),
        resolveModelConnection: () => undefined,
        sessionPermissions: memorySessionPermissions(),
        onEvent: () => undefined,
      })
      await expect(adapter.sendMessage(session.id, "不应发送")).rejects.toThrow("API key is missing")

      expect(requests).toHaveLength(0)
      expect((await adapter.readMessages(session.id)).filter((message) => message.role === "user")).toHaveLength(0)
    } finally {
      await adapter.dispose()
    }
  })

  test("requests Simplified Chinese for every user-visible model channel", async () => {
    const dataDir = await temporaryDirectory("creatx-chinese-output-data-")
    const projectRoot = await temporaryDirectory("creatx-chinese-output-project-")
    const requests: Array<{ url: string; body: string; authorization?: string }> = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: modelSwitchFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-chinese-output", projectRoot })
      await adapter.sendMessage(session.id, "请建立一个中世纪奇幻世界")

      const messages = JSON.stringify(JSON.parse(requests[0]!.body).messages)
      expect(messages).toContain("every user-visible output")
      expect(messages).toContain("reasoning, progress narration, tool explanations, error explanations, and final responses")
      expect(messages).toContain("use Simplified Chinese for all of them")
      expect(messages).toContain("Preserve code, paths, proper nouns, and quoted source text")
    } finally {
      await adapter.dispose()
    }
  })

  test("resolves relative Chinese read_files paths from the active project as UTF-8", async () => {
    const dataDir = await temporaryDirectory("creatx-utf8-read-data-")
    const projectRoot = await temporaryDirectory("CreatX 中文项目 ")
    await mkdir(join(projectRoot, "世界设定"))
    await writeFile(join(projectRoot, "世界设定", "世界真相.md"), "# 世界真相\n\n星盐鹿生活在龙巢北侧。", "utf8")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: textReadToolFetch(requests, "世界设定/世界真相.md"),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-utf8", projectRoot })
      await expect(adapter.sendMessage(session.id, "读取世界真相")).resolves.toBeUndefined()
      expect(requests).toHaveLength(2)
      expect(requests[1]).toContain("星盐鹿生活在龙巢北侧。")
      expect(requests[1]).not.toContain("�")
    } finally {
      await adapter.dispose()
    }
  })

  test("fails closed when read_files leaves the active project or targets an invalid file", async () => {
    const projectRoot = await temporaryDirectory("CreatX 项目边界 ")
    const outsideRoot = await temporaryDirectory("CreatX 项目外部 ")
    const insideFile = join(projectRoot, "世界真相.md")
    const outsideFile = join(outsideRoot, "外部.md")
    await writeFile(insideFile, "真实项目内容", "utf8")
    await writeFile(outsideFile, "不得读取", "utf8")
    const execute = createProjectFileReadExecutor((sessionId) => sessionId === "session-1" ? projectRoot : undefined)
    const context = { sessionId: "session-1", agentId: "test-agent", iteration: 1 }

    await expect(execute({ path: insideFile }, context)).resolves.toContain("真实项目内容")
    await expect(execute({ path: outsideFile }, context)).rejects.toThrow("path escapes the active project root")
    await expect(execute({ path: relative(projectRoot, outsideFile) }, context)).rejects.toThrow("path escapes the active project root")
    await expect(execute({ path: projectRoot }, context)).rejects.toThrow("path is not a regular project file")
    await expect(execute({ path: "不存在.md" }, context)).rejects.toThrow("project file does not exist")
  })

  test("lets a vision model inspect a project image through Cline read_files", async () => {
    const dataDir = await temporaryDirectory("creatx-image-read-data-")
    const projectRoot = await temporaryDirectory("creatx-image-read-project-")
    const projectImage = join(projectRoot, "参考图.png")
    const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    await writeFile(projectImage, Buffer.from(imageBase64, "base64"))
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
      apiKey: "test-key",
      fetch: visionToolFetch(requests, projectImage),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      await expect(adapter.sendMessage(session.id, "查看项目里的参考图")).resolves.toBeUndefined()
      expect(requests).toHaveLength(2)
      expect(requests[1]).toContain("Successfully read image")
      expect(requests[1]).toContain(imageBase64)
      expect(Buffer.from(await Bun.file(projectImage).arrayBuffer())).toEqual(Buffer.from(imageBase64, "base64"))
    } finally {
      await adapter.dispose()
    }
  })

  test("loads one Windows file through userFiles without copying it", async () => {
    const dataDir = await temporaryDirectory("creatx-attachment-data-")
    const projectRoot = await temporaryDirectory("creatx-attachment-project-")
    const externalRoot = await temporaryDirectory("CreatX 外部附件 ")
    const externalFile = join(externalRoot, "参考资料.md")
    await writeFile(externalFile, "# 外部附件\n\n这是只读参考内容。", "utf8")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: providerFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      await expect(adapter.sendMessage(session.id, "请阅读附件", { userFiles: [externalFile] })).resolves.toBeUndefined()
      expect(requests).toHaveLength(1)
      expect(requests[0]).toContain(externalFile.replaceAll("\\", "/"))
      expect(requests[0]).toContain("这是只读参考内容。")
      expect(await adapter.readMessages(session.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "user", text: "请阅读附件" }),
      ]))
      expect((await readdir(projectRoot, { recursive: true })).some((entry) => basename(String(entry)) === basename(externalFile))).toBeFalse()
      expect((await readdir(dataDir, { recursive: true })).some((entry) => basename(String(entry)) === basename(externalFile))).toBeFalse()
    } finally {
      await adapter.dispose()
    }
  })

  test("sends a chat image as Cline userImages and restores its visual attachment", async () => {
    const dataDir = await temporaryDirectory("creatx-chat-image-data-")
    const projectRoot = await temporaryDirectory("creatx-chat-image-project-")
    const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "openai-compatible",
      modelId: "gpt-5.6-luna",
      apiKey: "test-key",
      fetch: providerFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      await adapter.sendMessage(session.id, "请查看图片", { userImages: [`data:image/png;base64,${imageBase64}`] })
      expect(requests).toHaveLength(1)
      expect(requests[0]).toContain(imageBase64)
      expect(requests[0]).not.toContain("Error fetching content")
      const user = (await adapter.readTimeline(session.id)).find((item) => item.kind === "message" && item.presentation === "user")
      expect(user?.attachments).toEqual([{ name: "图片 1.png", displayPath: "image:0", kind: "image", mediaType: "image/png" }])
      await expect(adapter.resolveMessageImage(session.id, user!.itemId, 0)).resolves.toEqual({ mediaType: "image/png", bytes: Buffer.from(imageBase64, "base64") })
    } finally {
      await adapter.dispose()
    }
  })

  test("rejects missing and non-file attachments before a Provider request", async () => {
    const dataDir = await temporaryDirectory("creatx-attachment-failure-data-")
    const projectRoot = await temporaryDirectory("creatx-attachment-failure-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: providerFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      await expect(adapter.sendMessage(session.id, "读取缺失文件", { userFiles: [join(projectRoot, "missing.md")] })).rejects.toThrow("attachment_missing")
      await expect(adapter.sendMessage(session.id, "读取目录", { userFiles: [projectRoot] })).rejects.toThrow("attachment_unreadable")
      expect(requests).toEqual([])
    } finally {
      await adapter.dispose()
    }
  })

  test("runs bounded Growth stages in clean disposable sessions hidden behind the owner session", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-worker-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-worker-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })

    try {
      const owner = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      await adapter.runGrowthStage({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 1,
        stageKey: "bounded-stage-1",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n只处理阶段一`,
      })
      await adapter.runGrowthStage({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 2,
        stageKey: "bounded-stage-2",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n只处理阶段二`,
      })

      expect(requests).toHaveLength(2)
      expect(requests[0]).toContain("只处理阶段一")
      expect(requests[1]).toContain("只处理阶段二")
      expect(requests[1]).not.toContain("只处理阶段一")
      expect(requests[1]).not.toContain("阶段一已完成")
      expect((await adapter.listSessions()).map((session) => session.id)).toEqual([owner.id])
      expect(events.flatMap((event) => "sessionId" in event && event.sessionId ? [event.sessionId] : event.type === "approval.requested" ? [event.approval.sessionId] : [])).toEqual(
        expect.arrayContaining([owner.id]),
      )
      expect(events.flatMap((event) => "sessionId" in event && event.sessionId && event.sessionId !== owner.id ? [event.sessionId] : [])).toEqual([])
      const cleanup = await adapter.cleanupGrowthWorkers(owner.id, "goal-1")
      expect(cleanup.deletedSessionIds).toHaveLength(2)
      expect(cleanup.deferredSessionIds).toEqual([])
      expect(cleanup.failedSessionIds).toEqual([])
      expect((await readdir(join(dataDir, "sessions"))).filter((name) => name !== owner.id)).toEqual([])
    } finally {
      await adapter.dispose()
    }
  })

  test("cancels a newly registered Growth Worker through the Owner Tool signal", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-signal-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-signal-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: abortOnlyProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const owner = await adapter.createProjectSession({ projectId: "project-growth-signal", projectRoot })
      const controller = new AbortController()
      const stage = adapter.runGrowthStage({
        goalId: "goal-growth-signal",
        projectId: "project-growth-signal",
        sessionId: owner.id,
        expectedVersion: 1,
        stageKey: "bounded-stage-1",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n等待取消`,
      }, controller.signal)
      while (!requests.length) await Bun.sleep(5)

      controller.abort(new Error("Owner Tool cancelled"))

      await expect(stage).resolves.toMatchObject({ state: "cancelled" })
      expect((await adapter.listSessions()).map((session) => session.id)).toEqual([owner.id])
    } finally {
      await adapter.dispose()
    }
  }, 10_000)

  test("returns one structured blueprint failure per tool call without a duplicate Runtime banner", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-blueprint-failure-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-blueprint-failure-project-")
    const events: CreatXEvent[] = []
    const observedFailures: GrowthStageFailure[] = []
    const tool: CreatXToolContribution = {
      name: "write_world_blueprint",
      audiences: ["world-blueprint"],
      description: "Test blueprint tool.",
      inputSchema: { type: "object", properties: {}, additionalProperties: true },
      scope: "project",
      approval: "required",
      execute: async () => ({ ok: false, error: { code: "blueprint_invalid", message: "世界蓝图输入或持久状态无效。", detail: "action initialize is not allowed" } }),
    }
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: blueprintFailureFetch(),
      tools: [tool],
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })

    try {
      const owner = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      const result = await adapter.runGrowthStage({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 1,
        stageKey: "world-blueprint-create",
        workerProfile: "world-blueprint",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n测试蓝图错误采集`,
      }, undefined, (failure) => observedFailures.push(failure))

      expect(observedFailures).toEqual([expect.objectContaining({ source: "tool", toolCallId: "call-blueprint-invalid", toolName: "write_world_blueprint", error: expect.objectContaining({ code: "blueprint_invalid" }) })])
      expect(result.failures).toEqual([expect.objectContaining({ source: "tool", toolCallId: "call-blueprint-invalid", toolName: "write_world_blueprint", error: expect.objectContaining({ code: "blueprint_invalid" }) })])
      expect(events.some((event) => event.type === "runtime.error")).toBe(false)
      expect(events.some((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "failed")).toBe(true)
    } finally {
      await adapter.dispose()
    }
  })

  test("keeps live Worker events but does not reload terminal Worker history after restart", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-timeline-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-timeline-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const first = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    const owner = await first.createProjectSession({ projectId: "project-1", projectRoot })
    await first.runGrowthStage({
      goalId: "goal-1",
      projectId: "project-1",
      sessionId: owner.id,
      expectedVersion: 1,
      stageKey: "free-materialization",
      prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n只处理北境`,
      workItemId: "region:north",
      workItemTitle: "北境",
    })
    await first.runGrowthStage({
      goalId: "goal-1",
      projectId: "project-1",
      sessionId: owner.id,
      expectedVersion: 2,
      stageKey: "free-materialization",
      prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n只处理南港`,
      workItemId: "city:south-port",
    })
    expect(events.some((event) => event.type === "timeline.upsert" && event.item.text === "阶段一已完成。" && event.item.activity?.title === "北境")).toBe(true)
    await first.dispose()

    const restored = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const timeline = await restored.readTimeline(owner.id)
      expect(timeline.some((item) => item.text?.includes(CREATX_INTERNAL_GROWTH_STAGE))).toBe(false)
      expect(timeline.filter((item) => item.itemId.startsWith("growth:"))).toEqual([])
      expect((await restored.listSessions()).map((session) => session.id)).toEqual([owner.id])
    } finally {
      await restored.dispose()
    }
  })

  test("streams Worker activity live without restoring terminal Worker history", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-final-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-final-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const first = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    const owner = await first.createProjectSession({ projectId: "project-1", projectRoot })
    await first.runGrowthStage({
      goalId: "goal-1",
      projectId: "project-1",
      sessionId: owner.id,
      expectedVersion: 1,
      stageKey: "bounded-stage-1",
      prompt: "/growth\nGrowth World Pro 专用目标：内部阶段策略，不得显示",
    })
    expect(events).toContainEqual(expect.objectContaining({
      type: "timeline.upsert",
      sessionId: owner.id,
      item: expect.objectContaining({
        kind: "message",
        presentation: "internal",
        state: "completed",
        text: "阶段一已完成。",
      }),
    }))
    expect(events.some((event) => event.type === "timeline.upsert" && event.item.text?.includes("内部阶段策略"))).toBe(false)
    await first.dispose()

    const restored = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const timeline = await restored.readTimeline(owner.id)
      expect(timeline.some((item) => item.presentation === "user" || item.text?.includes("内部阶段策略"))).toBe(false)
      expect(timeline.some((item) => item.text === "阶段一已完成。" || item.activity?.kind === "growth-worker")).toBe(false)
    } finally {
      await restored.dispose()
    }
  })

  test("runs up to three materialization Workers in isolated sessions behind one owner", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-batch-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-batch-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const owner = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      const results = await adapter.runGrowthStageBatch(["object-a", "object-b", "object-c"].map((workItemId) => ({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 2,
        stageKey: "free-materialization",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n只处理 ${workItemId}`,
        workItemId,
        workRootPath: "世界",
      })))

      expect(results).toHaveLength(3)
      expect(results.every((result) => result.state === "completed")).toBe(true)
      expect(requests).toHaveLength(3)
      for (const workItemId of ["object-a", "object-b", "object-c"]) {
        const own = requests.find((request) => request.includes(`只处理 ${workItemId}`))!
        expect(own).toBeTruthy()
        expect(["object-a", "object-b", "object-c"].filter((candidate) => candidate !== workItemId).every((candidate) => !own.includes(`只处理 ${candidate}`))).toBe(true)
      }
      expect((await adapter.listSessions()).map((session) => session.id)).toEqual([owner.id])
      await expect(adapter.runGrowthStageBatch([])).rejects.toThrow("1 to 3")
      await expect(adapter.runGrowthStageBatch(Array.from({ length: 4 }, (_, index) => ({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 2,
        stageKey: "free-materialization",
        prompt: `object-${index}`,
      })))).rejects.toThrow("1 to 3")
    } finally {
      await adapter.dispose()
    }
  })

  test("cools down only the quota-limited Provider connection before creating another Growth Worker", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-quota-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-quota-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      profileId: "limited-profile",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: quotaProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const owner = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      const command = {
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 2,
        stageKey: "free-materialization",
        prompt: "生成对象",
        workItemId: "object-a",
      }
      const first = await adapter.runGrowthStage(command)
      expect(first.failure?.code).toBe("provider_quota")
      const limitedConnectionRequests = requests.length
      expect(limitedConnectionRequests).toBeGreaterThan(0)

      const controller = new AbortController()
      const blocked = adapter.runGrowthStage({ ...command, workItemId: "object-b" }, controller.signal)
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(requests).toHaveLength(limitedConnectionRequests)
      controller.abort(new Error("owner paused Growth"))
      await expect(blocked).rejects.toThrow("owner paused Growth")

      adapter.setDefaultConnection({
        profileId: "available-profile",
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKey: "test-key",
      })
      const isolated = await adapter.runGrowthStage({ ...command, workItemId: "object-c" })
      expect(isolated.failure?.code).toBe("provider_quota")
      expect(requests.length).toBeGreaterThan(limitedConnectionRequests)
    } finally {
      await adapter.dispose()
    }
  }, 15_000)

  test("finds a persisted Worker result by stable attempt without promoting it to Owner reply", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-summary-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-summary-project-")
    const requests: string[] = []
    const first = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const owner = await first.createProjectSession({ projectId: "project-1", projectRoot })
    const attemptId = "bounded-stage:goal-1"
    try {
      const result = await first.runGrowthStage({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 2,
        stageKey: "bounded-stage",
        attemptId,
        prompt: "请完成有界阶段",
        workerProfile: "growth-stage",
        directFileMutation: "disabled",
      })
      expect(result).toMatchObject({ state: "completed", reason: "阶段一已完成。" })
      expect(await first.findCompletedGrowthStage({ sessionId: owner.id, goalId: "goal-1", attemptId })).toEqual({ state: "completed", reason: "阶段一已完成。" })
    } finally {
      await first.dispose()
    }

    const restored = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      expect(await restored.findCompletedGrowthStage({ sessionId: owner.id, goalId: "goal-1", attemptId })).toEqual({ state: "completed", reason: "阶段一已完成。" })
      expect(requests).toHaveLength(1)
      expect((await restored.readTimeline(owner.id)).some((item) => item.presentation === "internal" && item.text === "阶段一已完成。")).toBe(false)
    } finally {
      await restored.dispose()
    }
  })

  test("persists an idle Growth owner before any Provider request and restores it after restart", async () => {
    const dataDir = await temporaryDirectory("creatx-growth-owner-data-")
    const projectRoot = await temporaryDirectory("creatx-growth-owner-project-")
    const requests: string[] = []
    const first = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const owner = await first.createProjectSession({ projectId: "project-1", projectRoot })
    expect(requests).toEqual([])
    await first.dispose()

    const restored = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: stageProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      expect((await restored.listSessions()).map((session) => session.id)).toEqual([owner.id])
      await restored.runGrowthStage({
        goalId: "goal-1",
        projectId: "project-1",
        sessionId: owner.id,
        expectedVersion: 1,
        stageKey: "bounded-stage-1",
        prompt: `/growth\n${CREATX_INTERNAL_GROWTH_STAGE}\n恢复后继续`,
      })
      expect(requests).toHaveLength(1)
    } finally {
      await restored.dispose()
    }
  })

  test("does not start a Provider request when an Owner Growth turn was already cancelled", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-cancel-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-cancel-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: providerFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-owner-cancel", projectRoot })
      const controller = new AbortController()
      controller.abort(new Error("用户暂停了 Growth。"))
      await expect(adapter.sendGrowthMessage(session.id, "/growth_world_pro 建立世界", "activation-owner-cancel", undefined, undefined, controller.signal)).rejects.toThrow("用户暂停了 Growth")
      expect(requests).toHaveLength(0)
    } finally {
      await adapter.dispose()
    }
  })

  test("treats an active cancelled Owner Growth turn as cancellation instead of missing reply persistence", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-active-cancel-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-active-cancel-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: abortOnlyProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-owner-active-cancel", projectRoot })
      const controller = new AbortController()
      const turn = adapter.sendGrowthMessage(session.id, "/growth_world_pro 建立世界", "activation-owner-active-cancel", undefined, undefined, controller.signal)
      while (!requests.length) await Bun.sleep(5)
      controller.abort(new Error("cancelled: 用户结束了 Growth。"))
      const error = await turn.then(() => undefined, (failure: unknown) => failure)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("用户结束了 Growth")
      expect((error as Error).message).not.toContain("session_persistence")
      expect(requests).toHaveLength(1)
    } finally {
      await adapter.dispose()
    }
  }, 10_000)

  test("keeps a missing Assistant reply after trusted Owner tool evidence as a persistence failure", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-missing-reply-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-missing-reply-project-")
    const requests: string[] = []
    const controller: CreatXToolContribution = {
      name: "run_growth",
      description: "Run controlled Growth.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["owner-growth"],
      scope: "project",
      approval: "automatic",
      execute: async (_input, context) => ({ ok: true, value: { activationId: context.ownerActivationId, status: "completed" } }),
    }
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: ownerGrowthMissingReplyFetch(requests),
      tools: [controller],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-owner-missing-reply", projectRoot })
      await expect(adapter.sendGrowthMessage(session.id, "/growth 建立世界", "activation-owner-missing-reply")).rejects.toThrow("session_persistence")
      expect(await adapter.hasPersistedOwnerControllerResult(session.id, "activation-owner-missing-reply", "run_growth")).toBe(true)
    } finally {
      await adapter.dispose()
    }
  })

  test("aborts and joins an active ordinary Owner turn before dispose closes persistence", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-dispose-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-dispose-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: abortOnlyProviderFetch(requests),
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    const session = await adapter.createProjectSession({ projectId: "project-owner-dispose", projectRoot })
    const turn = adapter.sendMessage(session.id, "保持请求直到应用退出")
    const turnSettlement = turn.then(
      (value) => ({ status: "resolved" as const, value }),
      (error) => ({ status: "rejected" as const, error }),
    )
    while (!requests.length) await Bun.sleep(5)

    await expect(adapter.dispose()).resolves.toBeUndefined()
    expect(await turnSettlement).toEqual({ status: "resolved", value: undefined })
    expect(events.filter((event) => event.type === "run.state" && event.sessionId === session.id).at(-1)).toMatchObject({ state: "cancelled" })
    expect(requests).toHaveLength(1)
  }, 10_000)

  test("persists an Owner Growth command, controller result, and final reply before ordinary restart follow-up", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-growth-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-growth-project-")
    const requests: string[] = []
    const permissions = memorySessionPermissions()
    const controller: CreatXToolContribution = {
      name: "run_growth",
      description: "Run controlled Growth.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["owner-growth"],
      scope: "project",
      approval: "automatic",
      execute: async (_input, context) => ({ ok: true, value: { activationId: context.ownerActivationId, status: "completed", evidence: "OWNER_GROWTH_EVIDENCE" } }),
    }
    let adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: ownerGrowthProviderFetch(requests),
      tools: [controller],
      sessionPermissions: permissions,
      onEvent: () => undefined,
    })
    const owner = await adapter.createProjectSession({ projectId: "project-owner-growth", projectRoot })

    try {
      await adapter.sendGrowthMessage(owner.id, "/growth 建立一个世界", "activation-owner-growth")
      const messages = await adapter.readMessages(owner.id)
      expect(messages.some((message) => message.role === "user" && message.text.includes("/growth 建立一个世界"))).toBe(true)
      expect(messages.some((message) => message.role === "assistant" && message.text === "世界生长已经完成。")).toBe(true)
      expect(requests[1]).toContain("OWNER_GROWTH_EVIDENCE")
      expect(await adapter.findPersistedOwnerGrowthReply(owner.id, "activation-owner-growth", "run_growth")).toEqual({ controllerCallCount: 1, reply: "世界生长已经完成。" })
      expect(await adapter.hasPersistedOwnerControllerResult(owner.id, "activation-owner-growth", "run_growth")).toBe(true)

      await adapter.sendOwnerResultDelivery(owner.id, "activation-owner-growth-delivery", async () => undefined)
      expect(await adapter.findPersistedOwnerTurn(owner.id, "activation-owner-growth-delivery", "run_growth")).toEqual({
        controllerCallCount: 0,
        controllerResult: "none",
        reply: "刚才已经完成。",
      })
      expect(await adapter.hasPersistedOwnerControllerResult(owner.id, "activation-owner-growth", "run_growth")).toBe(true)

      await adapter.dispose()
      adapter = await ClineAdapter.create({
        dataDir,
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKey: "test-key",
        fetch: ownerGrowthProviderFetch(requests),
        tools: [controller],
        sessionPermissions: permissions,
        onEvent: () => undefined,
      })
      await adapter.sendMessage(owner.id, "刚才完成了吗？")
      expect(requests[3]).toContain("/growth 建立一个世界")
      expect(requests[3]).toContain("OWNER_GROWTH_EVIDENCE")
      expect(requests[3]).toContain("世界生长已经完成。")
      expect(JSON.stringify(JSON.parse(requests[3]!).tools ?? [])).not.toContain('"name":"run_growth"')
    } finally {
      await adapter.dispose()
    }
  })

  test("recovers a persisted Owner reply after the completion callback crashes without another Provider turn", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-crash-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-crash-project-")
    const requests: string[] = []
    const permissions = memorySessionPermissions()
    const controller: CreatXToolContribution = {
      name: "run_growth",
      description: "Run controlled Growth.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["owner-growth"],
      scope: "project",
      approval: "automatic",
      execute: async (_input, context) => ({ ok: true, value: { activationId: context.ownerActivationId, status: "ready_for_owner_reply" } }),
    }
    let adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: ownerGrowthProviderFetch(requests),
      tools: [controller],
      sessionPermissions: permissions,
      onEvent: () => undefined,
    })
    const owner = await adapter.createProjectSession({ projectId: "project-owner-crash", projectRoot })

    try {
      await expect(adapter.sendGrowthMessage(owner.id, "/growth 建立一个世界", "activation-owner-crash", undefined, async () => {
        throw new Error("simulated crash after Owner reply persistence")
      })).rejects.toThrow("simulated crash")
      expect(requests).toHaveLength(2)
      await adapter.dispose()
      adapter = await ClineAdapter.create({
        dataDir,
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKey: "test-key",
        fetch: ownerGrowthProviderFetch(requests),
        tools: [controller],
        sessionPermissions: permissions,
        onEvent: () => undefined,
      })
      expect(await adapter.findPersistedOwnerGrowthReply(owner.id, "activation-owner-crash", "run_growth")).toEqual({ controllerCallCount: 1, reply: "世界生长已经完成。" })
      expect(requests).toHaveLength(2)
    } finally {
      await adapter.dispose()
    }
  })

  test("continues a real Cline Skill turn after twelve tool iterations without exposing a red error", async () => {
    const dataDir = await temporaryDirectory("creatx-skill-budget-data-")
    const projectRoot = await temporaryDirectory("creatx-skill-budget-project-")
    await writeFile(join(projectRoot, "sequence-result.md"), "# 完整结果\n", "utf8")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    let toolExecutions = 0
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: iterationBoundaryProviderFetch(requests),
      tools: [{
        name: "record_sequence_step",
        description: "Record one harmless test step.",
        inputSchema: { type: "object", required: ["step"], properties: { step: { type: "integer" } }, additionalProperties: false },
        audiences: ["ordinary"],
        scope: "project",
        approval: "automatic",
        execute: async () => {
          toolExecutions += 1
          return { ok: true, value: { recorded: toolExecutions } }
        },
      }],
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-skill-budget", projectRoot })

      const result = await adapter.sendSkillSequence(session.id, "先研究再写小说。", ["creatx-study", "creatx-novel-start"])
      const timeline = await adapter.readTimeline(session.id)
      expect(result).toMatchObject({ state: "completed", completedSkills: ["creatx-study", "creatx-novel-start"] })
      expect(toolExecutions).toBe(12)
      expect(requests).toHaveLength(16)
      expect(timeline.filter((item) => item.presentation === "user").map((item) => item.text)).toEqual(["先研究再写小说。"])
      expect(events.filter((event) => event.type === "runtime.error")).toEqual([])
      expect(events.at(-1)).toEqual({ type: "run.state", sessionId: session.id, state: "completed" })
    } finally {
      await adapter.dispose()
    }
  })

  test("executes multiple tool calls serially and persists both matching results", async () => {
    const dataDir = await temporaryDirectory("creatx-serial-tools-data-")
    const projectRoot = await temporaryDirectory("creatx-serial-tools-project-")
    const requests: string[] = []
    const executionOrder: string[] = []
    const tools: CreatXToolContribution[] = [{
      name: "first_serial_tool",
      description: "Run the first ordered test operation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["ordinary"],
      scope: "project",
      approval: "automatic",
      execute: async () => {
        executionOrder.push("first-start")
        await new Promise((resolve) => setTimeout(resolve, 40))
        executionOrder.push("first-end")
        return { ok: true, value: { order: 1 } }
      },
    }, {
      name: "second_serial_tool",
      description: "Run the second ordered test operation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["ordinary"],
      scope: "project",
      approval: "automatic",
      execute: async () => {
        executionOrder.push("second-start")
        executionOrder.push("second-end")
        return { ok: true, value: { order: 2 } }
      },
    }]
    const options = {
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: parallelToolCallsProviderFetch(requests),
      tools,
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    }
    let adapter = await ClineAdapter.create(options)

    try {
      const session = await adapter.createProjectSession({ projectId: "project-serial-tools", projectRoot })
      await adapter.sendMessage(session.id, "依次执行两个操作。")

      expect(executionOrder).toEqual(["first-start", "first-end", "second-start", "second-end"])
      expect(requests).toHaveLength(2)
      await adapter.dispose()
      adapter = await ClineAdapter.create({ ...options, sessionPermissions: memorySessionPermissions() })
      expect((await adapter.readTimeline(session.id)).filter((item) => item.kind === "tool").map((item) => ({
        itemId: item.itemId,
        toolName: item.toolName,
        state: item.state,
      }))).toEqual([
        { itemId: "tool:serial-tool-call-1", toolName: "first_serial_tool", state: "completed" },
        { itemId: "tool:serial-tool-call-2", toolName: "second_serial_tool", state: "completed" },
      ])
    } finally {
      await adapter.dispose()
    }
  })

  test("accepts a persisted synchronous generate_image result as trusted map image evidence", async () => {
    const dataDir = await temporaryDirectory("creatx-sync-image-receipt-data-")
    const projectRoot = await temporaryDirectory("creatx-sync-image-receipt-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: synchronousImageReceiptProviderFetch(requests),
      tools: [{
        name: "generate_image",
        description: "Generate one test image artifact.",
        inputSchema: { type: "object", required: ["relativePath"], properties: { relativePath: { type: "string" } }, additionalProperties: false },
        audiences: ["ordinary"],
        scope: "project",
        approval: "automatic",
        execute: async (input, context) => {
          const relativePath = (input as { relativePath: string }).relativePath
          await mkdir(join(projectRoot, "地图"), { recursive: true })
          await writeFile(join(projectRoot, relativePath), "verified image bytes", "utf8")
          return { ok: true, value: { projectId: context.projectId, relativePath, model: "test-image-model", mimeType: "image/png", bytes: 20 } }
        },
      }],
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-sync-image-receipt", projectRoot })
      const result = await adapter.sendSkillSequence(session.id, "制作完整地图。", ["creatx-draw-map"])
      expect(events.filter((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state === "failed")).toEqual([])
      expect(result).toMatchObject({
        state: "completed",
        completedSkills: ["creatx-draw-map"],
      })
      expect(requests).toHaveLength(4)
    } finally {
      await adapter.dispose()
    }
  })

  test("accepts only an image queue task submitted by the current Skill step", async () => {
    const dataDir = await temporaryDirectory("creatx-current-image-task-data-")
    const projectRoot = await temporaryDirectory("creatx-current-image-task-project-")
    const requests: string[] = []
    let imageStatusChecks = 0
    const artifactPath = "地图/交互地图.html"
    await mkdir(join(projectRoot, "地图"), { recursive: true })
    await writeFile(join(projectRoot, artifactPath), "<html>verified map</html>", "utf8")
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: queuedImageReceiptProviderFetch(requests, "current-map-image-task"),
      tools: [{
        name: "submit_image_generation",
        description: "Submit one test image task.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["ordinary"],
        scope: "project",
        approval: "automatic",
        execute: async (_input, context) => ({ ok: true, value: { projectId: context.projectId, imageTaskId: "current-map-image-task" } }),
      }],
      imageTaskStatus: async (_projectId, imageTaskId) => {
        if (imageTaskId !== "current-map-image-task") return undefined
        imageStatusChecks += 1
        return imageStatusChecks >= 2 ? "succeeded" : "generating"
      },
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-current-image-task", projectRoot })
      const result = await adapter.sendSkillSequence(session.id, "制作完整地图。", ["creatx-draw-map"])
      expect(result).toMatchObject({ state: "completed", completedSkills: ["creatx-draw-map"] })
      expect(requests).toHaveLength(4)
      expect(imageStatusChecks).toBeGreaterThanOrEqual(3)
    } finally {
      await adapter.dispose()
    }
  })

  test("rejects a succeeded image queue task that was not submitted by the current Skill step", async () => {
    const dataDir = await temporaryDirectory("creatx-stale-image-task-data-")
    const projectRoot = await temporaryDirectory("creatx-stale-image-task-project-")
    const requests: string[] = []
    const events: CreatXEvent[] = []
    const artifactPath = "地图/交互地图.html"
    await mkdir(join(projectRoot, "地图"), { recursive: true })
    await writeFile(join(projectRoot, artifactPath), "<html>existing map</html>", "utf8")
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: staleImageReceiptProviderFetch(requests, "old-map-image-task"),
      imageTaskStatus: async (_projectId, imageTaskId) => imageTaskId === "old-map-image-task" ? "succeeded" : undefined,
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-stale-image-task", projectRoot })
      const result = await adapter.sendSkillSequence(session.id, "制作一张新地图。", ["creatx-draw-map"])
      expect(result).toMatchObject({ state: "incomplete", completedSkills: [], currentSkill: "creatx-draw-map" })
      expect(events.some((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.toolName === "report_skill_sequence_step" && event.item.state === "failed")).toBeTrue()
    } finally {
      await adapter.dispose()
    }
  })

  test("stops the sequence after the trusted image wait observes a failed current-step task", async () => {
    const dataDir = await temporaryDirectory("creatx-failed-image-wait-data-")
    const projectRoot = await temporaryDirectory("creatx-failed-image-wait-project-")
    const requests: string[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: failedImageWaitProviderFetch(requests, "failed-character-image-task"),
      tools: [{
        name: "submit_image_generation",
        description: "Submit one failing test image task.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["ordinary"],
        scope: "project",
        approval: "automatic",
        execute: async (_input, context) => ({ ok: true, value: { projectId: context.projectId, imageTaskId: "failed-character-image-task" } }),
      }],
      imageTaskStatus: async (_projectId, imageTaskId) => imageTaskId === "failed-character-image-task" ? "failed" : undefined,
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-failed-image-wait", projectRoot })
      const result = await adapter.sendSkillSequence(session.id, "先做人物再写小说。", ["creatx-build-character-gallery", "creatx-novel-start"])
      expect(result).toMatchObject({ state: "incomplete", stepStatus: "partial", completedSkills: [], currentSkill: "creatx-build-character-gallery", pendingSkills: ["creatx-novel-start"] })
      expect(requests).toHaveLength(4)
    } finally {
      await adapter.dispose()
    }
  })

  test("exposes issue resolution only for one bounded Owner issue turn", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-issue-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-issue-project-")
    const requests: string[] = []
    let resolutions = 0
    const issueTool: CreatXToolContribution = {
      name: "resolve_growth_issue",
      description: "Resolve one trusted Growth issue.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      audiences: ["owner-growth-issue"],
      scope: "project",
      approval: "automatic",
      execute: async (_input, context) => {
        resolutions += 1
        return { ok: true, value: { activationId: context.ownerActivationId, status: "resolved" } }
      },
    }
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: ownerIssueProviderFetch(requests),
      tools: [issueTool],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const owner = await adapter.createProjectSession({ projectId: "project-owner-issue", projectRoot })

    try {
      await adapter.sendGrowthIssueMessage(owner.id, "按新资料重试", "activation-owner-issue")
      expect(resolutions).toBe(1)
      expect(JSON.stringify(JSON.parse(requests[0]!).tools ?? [])).toContain('"name":"resolve_growth_issue"')
      await adapter.sendMessage(owner.id, "现在进展如何？")
      expect(JSON.stringify(JSON.parse(requests[2]!).tools ?? [])).not.toContain('"name":"resolve_growth_issue"')
    } finally {
      await adapter.dispose()
    }
  })

  test("completes an Owner issue clarification without a controller Tool Call", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-clarification-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-clarification-project-")
    const requests: string[] = []
    let persisted: { reply: string; controllerCallCount: number } | undefined
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: textOnlyProviderFetch(requests, "还需要确认魔法代价。"),
      tools: [{
        name: "resolve_growth_issue",
        description: "Resolve one trusted Growth issue.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["owner-growth-issue"],
        scope: "project",
        approval: "automatic",
        execute: async () => ({ ok: true, value: { status: "unexpected" } }),
      }],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const owner = await adapter.createProjectSession({ projectId: "project-owner-clarification", projectRoot })

    try {
      const reply = await adapter.sendGrowthIssueMessage(owner.id, "应该怎样补充？", "activation-owner-clarification", undefined, async (value, controllerCallCount) => {
        persisted = { reply: value, controllerCallCount }
      })
      expect(reply).toBe("还需要确认魔法代价。")
      expect(persisted).toEqual({ reply: "还需要确认魔法代价。", controllerCallCount: 0 })
      expect(JSON.stringify(JSON.parse(requests[0]!).tools ?? [])).toContain('"name":"resolve_growth_issue"')
    } finally {
      await adapter.dispose()
    }
  })

  test("delivers a result-ready Owner summary without exposing or rerunning Growth", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-delivery-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-delivery-project-")
    const requests: string[] = []
    let controllerRuns = 0
    let persistedReply: string | undefined
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: textOnlyProviderFetch(requests, "世界生长已经完成。"),
      tools: [{
        name: "run_growth",
        description: "Run controlled Growth.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["owner-growth"],
        scope: "project",
        approval: "automatic",
        execute: async () => {
          controllerRuns += 1
          return { ok: true, value: { status: "unexpected" } }
        },
      }, {
        name: "write_project_file",
        description: "Write a project file.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["ordinary"],
        scope: "project",
        approval: "automatic",
        execute: async () => ({ ok: true, value: undefined }),
      }],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const owner = await adapter.createProjectSession({ projectId: "project-owner-delivery", projectRoot })

    try {
      const reply = await adapter.sendOwnerResultDelivery(owner.id, "activation-owner-delivery", async (value) => {
        persistedReply = value
      })
      expect(reply).toBe("世界生长已经完成。")
      expect(persistedReply).toBe("世界生长已经完成。")
      expect(controllerRuns).toBe(0)
      const deliveryRequest = JSON.parse(requests[0]!)
      const deliveryTools = JSON.stringify(deliveryRequest.tools ?? [])
      expect(deliveryRequest.tools ?? []).toHaveLength(0)
      expect(deliveryTools).not.toContain('"name":"run_growth"')
      expect(deliveryTools).not.toContain('"name":"write_project_file"')
      expect(deliveryTools).not.toContain('"name":"apply_patch"')
      expect(deliveryTools).not.toContain('"name":"run_commands"')

      await adapter.sendMessage(owner.id, "接着讨论这个世界。")
      const ordinaryTools = JSON.stringify(JSON.parse(requests[1]!).tools ?? [])
      expect(ordinaryTools).toContain('"name":"write_project_file"')
      expect(ordinaryTools).toContain('"name":"run_commands"')
    } finally {
      await adapter.dispose()
    }
  })

  test("recovers a persisted result delivery after its completion callback crashes", async () => {
    const dataDir = await temporaryDirectory("creatx-owner-delivery-crash-data-")
    const projectRoot = await temporaryDirectory("creatx-owner-delivery-crash-project-")
    const requests: string[] = []
    const options = {
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "test-key",
      fetch: textOnlyProviderFetch(requests, "世界生长已经完成。"),
      tools: [{
        name: "run_growth",
        description: "Run controlled Growth.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        audiences: ["owner-growth" as const],
        scope: "project" as const,
        approval: "automatic" as const,
        execute: async () => ({ ok: true as const, value: { status: "unexpected" } }),
      }],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    }
    const first = await ClineAdapter.create(options)
    const owner = await first.createProjectSession({ projectId: "project-owner-delivery-crash", projectRoot })
    await expect(first.sendOwnerResultDelivery(owner.id, "activation-owner-delivery-crash", async () => {
      throw new Error("injected Store completion failure")
    })).rejects.toThrow("injected Store completion failure")
    await first.dispose()

    const restored = await ClineAdapter.create({ ...options, sessionPermissions: memorySessionPermissions() })
    try {
      expect(await restored.findPersistedOwnerTurn(owner.id, "activation-owner-delivery-crash", "run_growth")).toEqual({
        controllerCallCount: 0,
        controllerResult: "none",
        reply: "世界生长已经完成。",
      })
      expect(requests).toHaveLength(1)
    } finally {
      await restored.dispose()
    }
  })

})

function ownerEvidenceTurn(activationId: string, callId: string): Message[] {
  return [
    { role: "user", content: `<mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:${activationId}\n</mode_notice>\n运行 Growth` },
    { role: "assistant", content: [{ type: "tool_use", id: callId, name: "run_growth", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: callId, name: "run_growth", content: `{"activationId":"${activationId}"}` }] },
    { role: "assistant", content: "已完成。" },
  ]
}

async function temporaryDirectory(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
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

function providerFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    return new Response([
      'data: {"id":"attachment-test","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"已读取附件。"},"finish_reason":"stop"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function iterationBoundaryProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const requestNumber = requests.length
    const choice = requestNumber <= 12
      ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `sequence-step-${requestNumber}`, type: "function", function: { name: "record_sequence_step", arguments: JSON.stringify({ step: requestNumber }) } }] }, finish_reason: "tool_calls" }
      : requestNumber === 13 || requestNumber === 15
        ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `sequence-report-${requestNumber}`, type: "function", function: { name: "report_skill_sequence_step", arguments: JSON.stringify({ status: "completed", summary: "当前任务完整交付。", artifactPaths: ["sequence-result.md"], requiredImageTaskIds: [], unresolved: [] }) } }] }, finish_reason: "tool_calls" }
        : { index: 0, delta: { role: "assistant", content: requestNumber === 14 ? "研究完成。" : "小说完成，全部结束。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `skill-budget-${requestNumber}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function parallelToolCallsProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const choice = requests.length === 1
      ? {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              { index: 0, id: "serial-tool-call-1", type: "function", function: { name: "first_serial_tool", arguments: "{}" } },
              { index: 1, id: "serial-tool-call-2", type: "function", function: { name: "second_serial_tool", arguments: "{}" } },
            ],
          },
          finish_reason: "tool_calls",
        }
      : { index: 0, delta: { role: "assistant", content: "两个操作已依次完成。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `serial-tools-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function synchronousImageReceiptProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const choice = requests.length === 1
      ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "sync-image-call", type: "function", function: { name: "generate_image", arguments: JSON.stringify({ relativePath: "地图/result.png" }) } }] }, finish_reason: "tool_calls" }
      : requests.length === 2 || requests.length === 3
        ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `sync-image-report-${requests.length}`, type: "function", function: { name: "report_skill_sequence_step", arguments: JSON.stringify({ status: "completed", summary: "地图完整交付。", artifactPaths: ["地图/result.png"], requiredImageTaskIds: [], unresolved: [] }) } }] }, finish_reason: "tool_calls" }
        : { index: 0, delta: { role: "assistant", content: "地图已经完成。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `sync-image-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function queuedImageReceiptProviderFetch(requests: string[], imageTaskId: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const choice = requests.length === 1
      ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "queue-image-call", type: "function", function: { name: "submit_image_generation", arguments: "{}" } }] }, finish_reason: "tool_calls" }
      : requests.length === 2
        ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "queue-image-wait", type: "function", function: { name: "wait_for_skill_sequence_images", arguments: "{}" } }] }, finish_reason: "tool_calls" }
        : requests.length === 3
          ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "queue-image-report", type: "function", function: { name: "report_skill_sequence_step", arguments: JSON.stringify({ status: "completed", summary: "地图完整交付。", artifactPaths: ["地图/交互地图.html"], requiredImageTaskIds: [imageTaskId], unresolved: [] }) } }] }, finish_reason: "tool_calls" }
          : { index: 0, delta: { role: "assistant", content: "地图已经完成。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `queue-image-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function staleImageReceiptProviderFetch(requests: string[], imageTaskId: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const choice = requests.length % 2 === 1
      ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `stale-image-report-${requests.length}`, type: "function", function: { name: "report_skill_sequence_step", arguments: JSON.stringify({ status: "completed", summary: "复用旧地图任务。", artifactPaths: ["地图/交互地图.html"], requiredImageTaskIds: [imageTaskId], unresolved: [] }) } }] }, finish_reason: "tool_calls" }
      : { index: 0, delta: { role: "assistant", content: "地图已经完成。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `stale-image-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function failedImageWaitProviderFetch(requests: string[], imageTaskId: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const choice = requests.length === 1
      ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "failed-image-submit", type: "function", function: { name: "submit_image_generation", arguments: "{}" } }] }, finish_reason: "tool_calls" }
      : requests.length === 2
        ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "failed-image-wait", type: "function", function: { name: "wait_for_skill_sequence_images", arguments: "{}" } }] }, finish_reason: "tool_calls" }
        : requests.length === 3
          ? { index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "failed-image-report", type: "function", function: { name: "report_skill_sequence_step", arguments: JSON.stringify({ status: "partial", summary: "人物文字已完成，但肖像生成失败。", artifactPaths: [], requiredImageTaskIds: [imageTaskId], unresolved: ["一张必需肖像生成失败"] }) } }] }, finish_reason: "tool_calls" }
          : { index: 0, delta: { role: "assistant", content: "人物步骤未完成，序列在此停止。" }, finish_reason: "stop" }
    return new Response([
      `data: ${JSON.stringify({ id: `failed-image-wait-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [choice] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function abortOnlyProviderFetch(requests: string[]): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    requests.push(typeof init?.body === "string" ? init.body : "")
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  }) as typeof fetch
}

function modelSwitchFetch(requests: Array<{ url: string; body: string; authorization?: string }>): typeof fetch {
  const execute = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const headers = new Headers(init?.headers)
    requests.push({
      url: String(input),
      body: String(init?.body ?? ""),
      ...(headers.get("authorization") ? { authorization: headers.get("authorization")! } : {}),
    })
    return modelSwitchResponse(JSON.parse(String(init?.body ?? "{}"))?.model ?? "unknown", requests.length)
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function modelSwitchResponse(model: string, requestNumber: number) {
  return new Response([
    `data: ${JSON.stringify({ id: `model-switch-${requestNumber}`, object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta: { role: "assistant", content: `响应 ${requestNumber}` }, finish_reason: "stop" }] })}`,
    "data: [DONE]",
    "",
  ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
}

function stageProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    const content = requests.length === 1 ? "阶段一已完成。" : "阶段二已完成。"
    return new Response([
      `data: ${JSON.stringify({ id: `growth-stage-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function quotaProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function ownerGrowthProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = String(init?.body ?? "")
    requests.push(body)
    if (requests.length === 1) {
      if (!body.includes('"name":"run_growth"')) throw new Error("Owner Growth controller is missing from the explicit turn")
      return new Response([
        `data: ${JSON.stringify({ id: "owner-growth-tool", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-run-growth", type: "function", function: { name: "run_growth", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    const content = requests.length === 2 ? "世界生长已经完成。" : "刚才已经完成。"
    return new Response([
      `data: ${JSON.stringify({ id: `owner-growth-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function ownerGrowthMissingReplyFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    if (requests.length === 1) {
      return new Response([
        `data: ${JSON.stringify({ id: "owner-growth-missing-reply-tool", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-run-growth-missing-reply", type: "function", function: { name: "run_growth", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    throw new Error("network failure after trusted Owner tool result")
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function ownerIssueProviderFetch(requests: string[]): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = String(init?.body ?? "")
    requests.push(body)
    if (requests.length === 1) {
      if (!body.includes('"name":"resolve_growth_issue"')) throw new Error("Growth issue tool is missing from the issue turn")
      return new Response([
        `data: ${JSON.stringify({ id: "owner-issue-tool", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-resolve-growth", type: "function", function: { name: "resolve_growth_issue", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    const content = requests.length === 2 ? "问题已经解决并恢复执行。" : "正在继续处理。"
    return new Response([
      `data: ${JSON.stringify({ id: `owner-issue-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function textOnlyProviderFetch(requests: string[], content: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    return new Response([
      `data: ${JSON.stringify({ id: `text-only-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function blueprintFailureFetch(): typeof fetch {
  let request = 0
  const execute = async () => {
    request += 1
    if (request === 1) {
      return new Response([
        `data: ${JSON.stringify({ id: "blueprint-failure", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-blueprint-invalid", type: "function", function: { name: "write_world_blueprint", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    return new Response([
      'data: {"id":"blueprint-failure","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"已根据错误修正。"},"finish_reason":"stop"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function visionToolFetch(requests: string[], projectImage: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    if (requests.length === 1) {
      const toolArguments = JSON.stringify({ paths: [projectImage] })
      return new Response([
        `data: ${JSON.stringify({ id: "vision-tool-test", object: "chat.completion.chunk", created: 0, model: "gpt-5.6-luna", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-read-image", type: "function", function: { name: "read_files", arguments: toolArguments } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    return new Response([
      'data: {"id":"vision-tool-test","object":"chat.completion.chunk","created":0,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{"role":"assistant","content":"已经看见项目图片。"},"finish_reason":"stop"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}

function textReadToolFetch(requests: string[], projectFile: string): typeof fetch {
  const execute = async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(init?.body ?? ""))
    if (requests.length === 1) {
      const toolArguments = JSON.stringify({ paths: [projectFile] })
      return new Response([
        `data: ${JSON.stringify({ id: "utf8-tool-test", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-read-text", type: "function", function: { name: "read_files", arguments: toolArguments } }] }, finish_reason: "tool_calls" }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
    }
    return new Response([
      'data: {"id":"utf8-tool-test","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"已读取。"},"finish_reason":"stop"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } })
  }
  return Object.assign(execute, { preconnect: (() => undefined) as typeof fetch.preconnect })
}
