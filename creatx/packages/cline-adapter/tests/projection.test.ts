import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EnvHttpProxyAgent } from "undici"
import { CREATX_GROWTH_ACTIVATION_MARKER, CREATX_INTERNAL_SKILL_SEQUENCE, type CreatXEvent, type CreatXToolContribution, type SessionKind, type SessionPermissionMode, type SessionPermissionPort } from "@creatx/contracts"
import { ClineAdapter, ClineTimelineProjector, createTrustedToolExecutionContext, defaultToolPolicies, destroyProviderDispatcher, disposeProviderDispatcher, executeGrowthStageBinding, executeSteerDelivery, isMaxIterationsAgentResult, isMaxIterationsBoundary, isStaleGrowthReportFailure, isSuccessfulProjectMutation, MACHINE_TRUST_WARNING, maxIterationsForSession, mergeOwnerAndWorkerTimeline, normalizeGrowthStageIdentity, projectClineEvent, projectClineMessages, projectClineTimeline, projectGrowthWorkerTimeline, resolveGrowthAbortSessions, runCreatXToolContribution, SessionToolPolicyController, sessionToolPolicies, settledGrowthStageResults, shouldSuppressGrowthRecoverableError, skillSequenceContinuationPrompt, skillSequenceTurnPrompt, terminalStateFromFinishReason, validateCreatXToolContributions } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Cline event projection", () => {
  test("restores Worker activity before a later delivery turn when the source has no final reply", () => {
    const items = mergeOwnerAndWorkerTimeline([
      { sequence: 1, itemId: "source-user", ownerActivationId: "activation-source", kind: "message", presentation: "user", state: "completed", text: "/growth 建立世界" },
      { sequence: 2, itemId: "source-tool", ownerActivationId: "activation-source", kind: "tool", presentation: "internal", state: "completed", toolName: "run_growth" },
      { sequence: 3, itemId: "delivery-user", ownerActivationId: "activation-delivery", kind: "message", presentation: "user", state: "completed", text: "继续" },
      { sequence: 4, itemId: "delivery-reply", ownerActivationId: "activation-delivery", kind: "message", presentation: "assistant", state: "completed", text: "已经完成" },
    ], [{
      sequence: 1,
      itemId: "worker-source",
      ownerActivationId: "activation-source",
      kind: "message",
      presentation: "internal",
      state: "completed",
      text: "阶段已完成",
      activity: { kind: "growth-worker", activityId: "attempt-1", ownerActivationId: "activation-source", workItemId: "world", title: "世界" },
    }])
    expect(items.map((item) => item.itemId)).toEqual(["source-user", "source-tool", "worker-source", "delivery-user", "delivery-reply"])
  })

  test("invalidates files only after a successful project mutation", () => {
    expect(isSuccessfulProjectMutation({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "content_end", contentType: "tool", toolCallId: "read", toolName: "read_files", output: "ok" } },
    })).toBe(false)
    expect(isSuccessfulProjectMutation({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "content_end", contentType: "tool", toolCallId: "write", toolName: "editor", output: "saved" } },
    })).toBe(true)
    expect(isSuccessfulProjectMutation({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "content_end", contentType: "tool", toolCallId: "failed", toolName: "editor", error: "write failed" } },
    })).toBe(false)
  })

  test("does not misclassify serialized Cline chunks as assistant text", () => {
    expect(projectClineEvent({
      type: "chunk",
      payload: { sessionId: "s1", stream: "agent", chunk: '{"type":"iteration_start"}', ts: 1 },
    })).toEqual([])
  })

  test("projects tool lifecycle into stable CreatX events", () => {
    expect(projectClineEvent({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "content_start", contentType: "tool", toolCallId: "t1", toolName: "editor", input: { path: "作品.md" } } },
    })).toEqual([{ type: "timeline.upsert", sessionId: "s1", item: { sequence: 1, itemId: "tool:t1", kind: "tool", presentation: "assistant", state: "streaming", toolName: "editor", input: { path: "作品.md" } } }])

    expect(projectClineEvent({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "content_end", contentType: "tool", toolCallId: "t1", toolName: "editor", output: "saved" } },
    })).toEqual([{ type: "timeline.upsert", sessionId: "s1", item: { sequence: 1, itemId: "tool:t1", kind: "tool", presentation: "assistant", state: "completed", toolName: "editor", input: { path: "作品.md" }, output: "saved" } }])
  })

  test("keeps reasoning, tools, streamed text, and notices in receive order", () => {
    const projector = new ClineTimelineProjector()
    const emit = (event: Parameters<ClineTimelineProjector["project"]>[0]) => projector.project(event)
    const events = [
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_start", contentType: "reasoning", reasoning: "先检查" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_end", contentType: "reasoning", reasoning: "先检查资料" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_start", contentType: "tool", toolCallId: "read-1", toolName: "read_files", input: { path: "世界.md" } } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_end", contentType: "tool", toolCallId: "read-1", toolName: "read_files", output: "ok" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_start", contentType: "text", accumulated: "资料" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_start", contentType: "text", accumulated: "资料已读取" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "content_end", contentType: "text", text: "资料已读取。" } } }),
      ...emit({ type: "agent_event", payload: { sessionId: "timeline", event: { type: "notice", noticeType: "status", message: "进入下一轮" } } }),
    ].filter((event) => event.type === "timeline.upsert")
    expect(events.map((event) => event.type === "timeline.upsert" ? [event.item.sequence, event.item.kind, event.item.state, event.item.text] : [])).toEqual([
      [1, "reasoning", "streaming", "先检查"],
      [1, "reasoning", "completed", "先检查资料"],
      [2, "tool", "streaming", undefined],
      [2, "tool", "completed", undefined],
      [3, "message", "streaming", "资料"],
      [3, "message", "streaming", "资料已读取"],
      [3, "message", "completed", "资料已读取。"],
      [4, "notice", "completed", "进入下一轮"],
    ])
  })

  test("accumulates reasoning deltas instead of replacing the visible stream with the last chunk", () => {
    const projector = new ClineTimelineProjector()
    const first = projector.project({ type: "agent_event", payload: { sessionId: "s1", event: { type: "content_start", contentType: "reasoning", reasoning: "先检查" } } })
    const second = projector.project({ type: "agent_event", payload: { sessionId: "s1", event: { type: "content_start", contentType: "reasoning", reasoning: "资料" } } })

    expect(first[0]?.type === "timeline.upsert" ? first[0].item.text : undefined).toBe("先检查")
    expect(second[0]?.type === "timeline.upsert" ? second[0].item.text : undefined).toBe("先检查资料")
  })

  test("preserves Growth Worker identity without exposing it as a root conversation message", () => {
    const projector = new ClineTimelineProjector()
    const events = projector.project(
      { type: "agent_event", payload: { sessionId: "worker-1", event: { type: "content_start", contentType: "text", accumulated: "读取王国资料" } } },
      "owner-1",
      "worker-1",
      { kind: "growth-worker", activityId: "attempt-1", workItemId: "state:lorn", title: "洛恩王国" },
    )

    expect(events).toEqual([{ type: "timeline.upsert", sessionId: "owner-1", item: {
      sequence: 1,
      itemId: "growth:worker-1:text:1",
      kind: "message",
      presentation: "internal",
      state: "streaming",
      text: "读取王国资料",
      activity: { kind: "growth-worker", activityId: "attempt-1", workItemId: "state:lorn", title: "洛恩王国" },
    } }])
  })

  test("projects private Growth Worker narration as collapsible internal reasoning", () => {
    const projector = new ClineTimelineProjector()
    expect(projector.project({
      type: "agent_event",
      payload: { sessionId: "worker", event: { type: "content_start", contentType: "text", accumulated: "I will inspect the source." } },
    }, "owner", "worker")).toEqual([{
      type: "timeline.upsert",
      sessionId: "owner",
      item: { sequence: 1, itemId: "growth:worker:text:1", kind: "reasoning", presentation: "internal", state: "streaming", text: "I will inspect the source." },
    }])
  })

  test("keeps Cline Worker done text internal instead of promoting it as an Owner reply", () => {
    const projector = new ClineTimelineProjector()
    const activity = { kind: "growth-worker" as const, activityId: "worker-1", workItemId: "stage:worker-1", title: "Growth 阶段" }
    const working = projector.project(
      { type: "agent_event", payload: { sessionId: "worker-1", event: { type: "content_end", contentType: "text", text: "我先检查项目。" } } },
      "owner-1",
      "worker-1",
      activity,
      true,
    )
    const finalTurn = projector.project(
      { type: "agent_event", payload: { sessionId: "worker-1", event: { type: "content_end", contentType: "text", text: "本阶段已完成。" } } },
      "owner-1",
      "worker-1",
      activity,
      true,
    )
    const done = projector.project(
      { type: "agent_event", payload: { sessionId: "worker-1", event: { type: "done", reason: "completed", text: "本阶段已完成。", iterations: 2 } } },
      "owner-1",
      "worker-1",
      activity,
      true,
    )

    expect(working[0]).toEqual(expect.objectContaining({ type: "timeline.upsert", item: expect.objectContaining({ activity, presentation: "internal" }) }))
    expect(finalTurn[0]).toEqual(expect.objectContaining({ type: "timeline.upsert", item: expect.objectContaining({ activity, presentation: "internal" }) }))
    expect(done).toEqual([])
  })

  test("never turns a replayed Growth Worker final output into an Owner reply", () => {
    const activity = { kind: "growth-worker" as const, activityId: "worker-1", workItemId: "stage:worker-1", title: "Growth 阶段" }
    const timeline = projectGrowthWorkerTimeline([
      { role: "user", content: '<user_input mode="act">/growth\nGrowth World Pro 专用目标：内部执行说明</user_input>' },
      { role: "assistant", content: [{ type: "text", text: "我先检查项目。" }, { type: "tool_use", id: "read-1", name: "read_files", input: { path: "世界.md" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read-1", name: "read_files", content: "读取完成" }] },
      { role: "assistant", content: "本阶段已完成。" },
    ], activity)

    expect(timeline.some((item) => item.presentation === "user" || item.text?.includes("内部执行说明"))).toBe(false)
    expect(timeline).toContainEqual(expect.objectContaining({ kind: "tool", toolName: "read_files", state: "completed", activity }))
    expect(timeline).toContainEqual(expect.objectContaining({ kind: "message", text: "我先检查项目。", presentation: "internal", activity }))
    expect(timeline.at(-1)).toEqual(expect.objectContaining({ kind: "message", text: "本阶段已完成。", presentation: "internal", activity }))
  })

  test("replays persisted reasoning and tool results as one ordered timeline", () => {
    expect(projectClineTimeline([
      { role: "assistant", content: [{ type: "thinking", thinking: "核对路径" }, { type: "tool_use", id: "read-1", name: "read_files", input: { path: "世界.md" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read-1", name: "read_files", content: "读取完成" }] },
      { role: "assistant", content: [{ type: "text", text: "继续创作。" }] },
    ])).toEqual([
      { sequence: 1, itemId: "reasoning:0:0", kind: "reasoning", presentation: "internal", state: "completed", text: "核对路径" },
      { sequence: 2, itemId: "tool:read-1", kind: "tool", presentation: "assistant", state: "completed", toolName: "read_files", input: { path: "世界.md" }, output: "读取完成" },
      { sequence: 3, itemId: "message-2", kind: "message", presentation: "assistant", state: "completed", text: "继续创作。", attachments: [] },
    ])
  })

  test("keeps persisted message identity stable when history positions change", () => {
    const original = projectClineTimeline([
      { id: "persisted-user-a", role: "user", content: '<user_input mode="act">重复文本</user_input>' },
      { id: "persisted-assistant-a", role: "assistant", content: "收到。" },
      { id: "persisted-user-b", role: "user", content: '<user_input mode="act">重复文本</user_input>' },
    ])
    const shifted = projectClineTimeline([
      { id: "persisted-summary", role: "assistant", content: "较早历史摘要。" },
      { id: "persisted-user-a", role: "user", content: '<user_input mode="act">重复文本</user_input>' },
      { id: "persisted-assistant-a", role: "assistant", content: "收到。" },
      { id: "persisted-user-b", role: "user", content: '<user_input mode="act">重复文本</user_input>' },
    ])

    expect(original.filter((item) => item.presentation === "user").map((item) => item.itemId)).toEqual([
      "message:persisted-user-a",
      "message:persisted-user-b",
    ])
    expect(shifted.filter((item) => item.presentation === "user").map((item) => item.itemId)).toEqual([
      "message:persisted-user-a",
      "message:persisted-user-b",
    ])
  })

  test("keeps one visible user message while replaying ordered Skill continuation turns", () => {
    const sequence = ["creatx-draw-map", "creatx-draw-comic"]
    const first = skillSequenceTurnPrompt("根据已有世界依次制作地图和漫画。", sequence, 0)
    const second = skillSequenceTurnPrompt("根据已有世界依次制作地图和漫画。", sequence, 1)
    expect(first).not.toStartWith(CREATX_INTERNAL_SKILL_SEQUENCE)
    expect(first).toContain("creatx-draw-map")
    expect(first).toContain("根据已有世界依次制作地图和漫画。")
    expect(second).toStartWith(CREATX_INTERNAL_SKILL_SEQUENCE)
    expect(second).toContain("creatx-draw-comic")

    const timeline = projectClineTimeline([
      { role: "user", content: `<user_input mode="act">${first}</user_input>` },
      { role: "assistant", content: "地图已经完成。" },
      { role: "user", content: `<user_input mode="act">${second}</user_input>` },
      { role: "assistant", content: "漫画已经完成，以上是最终汇报。" },
    ])
    expect(timeline.filter((item) => item.presentation === "user").map((item) => item.text)).toEqual(["根据已有世界依次制作地图和漫画。"])
    expect(timeline.filter((item) => item.presentation === "assistant").map((item) => item.text)).toEqual(["地图已经完成。", "漫画已经完成，以上是最终汇报。"])
  })

  test("marks budget continuations as hidden slices of the same Skill sequence", () => {
    const sequence = ["creatx-draw-map", "creatx-draw-comic"]
    const first = skillSequenceTurnPrompt("依次制作地图和漫画。", sequence, 0, "sequence-1")
    const continuation = skillSequenceContinuationPrompt("依次制作地图和漫画。", sequence, 0, 1, "sequence-1")

    expect(first).toContain("执行片段：1/4")
    expect(continuation).toStartWith(CREATX_INTERNAL_SKILL_SEQUENCE)
    expect(continuation).toContain("执行片段 2/4")
    expect(continuation).toContain("不要重复已经成功的写入、生图或其他副作用")
    expect(projectClineTimeline([
      { role: "user", content: `<user_input mode="act">${first}</user_input>` },
      { role: "assistant", content: "正在生成底图。" },
      { role: "user", content: `<user_input mode="act">${continuation}</user_input>` },
      { role: "assistant", content: "地图完成。" },
    ]).filter((item) => item.presentation === "user").map((item) => item.text)).toEqual(["依次制作地图和漫画。"])
  })

  test("distinguishes max-iteration execution boundaries from real failures", () => {
    expect(isMaxIterationsBoundary({ state: "unknown", reason: "max_iterations" })).toBeTrue()
    expect(isMaxIterationsBoundary({ state: "unknown", failure: { code: "runtime", message: "运行时错误。", detail: "Agent runtime exceeded maxIterations (12)" } })).toBeTrue()
    expect(isMaxIterationsBoundary({ state: "failed", reason: "Provider returned HTTP 500" })).toBeFalse()
    expect(isMaxIterationsAgentResult({ finishReason: "error", iterations: 12, toolCalls: Array.from({ length: 12 }) }, 12)).toBeTrue()
    expect(isMaxIterationsAgentResult({ finishReason: "error", iterations: 12, toolCalls: Array.from({ length: 11 }) }, 12)).toBeFalse()
    expect(isMaxIterationsAgentResult({ finishReason: "error", iterations: 11, toolCalls: Array.from({ length: 11 }) }, 12)).toBeFalse()
  })

  test("keeps a Growth activation across Cline Tool Results until the next real user prompt", () => {
    const timeline = projectClineTimeline([
      { role: "user", content: `<user_input mode="act"><mode_notice>\n${CREATX_GROWTH_ACTIVATION_MARKER}:activation-1\n</mode_notice>\n/growth 建立世界</user_input>` },
      { role: "assistant", content: [{ type: "tool_use", id: "growth-1", name: "run_growth", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "growth-1", name: "run_growth", content: "完成" }] },
      { role: "assistant", content: "第一轮世界生长完成。" },
      { role: "user", content: '<user_input mode="act">下一步适合做什么？</user_input>' },
      { role: "assistant", content: "可以先检查人物关系。" },
    ])

    expect(timeline.find((item) => item.text === "第一轮世界生长完成。")?.ownerActivationId).toBe("activation-1")
    expect(timeline.find((item) => item.toolName === "run_growth")?.ownerActivationId).toBe("activation-1")
    expect(timeline.find((item) => item.text === "可以先检查人物关系。")?.ownerActivationId).toBeUndefined()
  })

  test("quarantines a legacy Growth protocol accidentally persisted in the owner history", () => {
    const timeline = projectClineTimeline([
      { role: "user", content: '<user_input mode="act">旧问题</user_input>' },
      { role: "assistant", content: "旧问题回复。" },
      { role: "user", content: '<user_input mode="act">/growth Growth World Pro 专用目标：继续项目\n\n阶段策略：这是 Growth World Pro 的全世界蓝图 Run。\n内部协议不得显示</user_input>' },
      { role: "assistant", content: [{ type: "text", text: "I will inspect the project." }, { type: "tool_use", id: "read-legacy", name: "read_files", input: { path: "世界.md" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read-legacy", name: "read_files", content: "读取完成" }] },
      { role: "assistant", content: "本阶段已完成，下一步继续整理。" },
    ])

    expect(timeline.some((item) => item.presentation === "user" && item.text?.includes("Growth World Pro 专用目标"))).toBe(false)
    expect(timeline).toContainEqual(expect.objectContaining({
      kind: "message",
      presentation: "internal",
      text: "I will inspect the project.",
      activity: expect.objectContaining({ kind: "growth-worker", title: "Growth 阶段" }),
    }))
    expect(timeline).toContainEqual(expect.objectContaining({
      kind: "tool",
      toolName: "read_files",
      state: "completed",
      activity: expect.objectContaining({ kind: "growth-worker", title: "Growth 阶段" }),
    }))
    expect(timeline.at(-1)).toEqual(expect.objectContaining({
      kind: "message",
      presentation: "assistant",
      text: "本阶段已完成，下一步继续整理。",
    }))
    expect(timeline.at(-1)?.activity).toBeUndefined()
  })

  test("keeps read-only tools automatic and every unknown or side-effect tool gated", () => {
    expect(defaultToolPolicies([toolContribution({ name: "inspect_project", approval: "automatic" }), toolContribution({ name: "record_idea", approval: "required" })])).toEqual({
      "*": { enabled: true, autoApprove: false },
      read_files: { enabled: true, autoApprove: true },
      search_codebase: { enabled: true, autoApprove: true },
      skills: { enabled: true, autoApprove: true },
      inspect_project: { enabled: true, autoApprove: true },
      record_idea: { enabled: true, autoApprove: false },
    })
    expect(MACHINE_TRUST_WARNING).toContain("项目目录以外")
  })

  test("maps free project sessions to the complete Act tool set without disabling Skills", () => {
    expect(sessionToolPolicies("free", "project", [
      toolContribution({ name: "record_idea", approval: "required" }),
    ])).toEqual({
      "*": { enabled: true, autoApprove: true },
      skills: { enabled: true, autoApprove: true },
      record_idea: { enabled: true, autoApprove: true },
    })
  })

  test("disables direct file mutation for a recovery Worker while keeping project tools", () => {
    expect(sessionToolPolicies("free", "project", [toolContribution({ name: "submit_image_generation" })], "disabled")).toEqual({
      "*": { enabled: true, autoApprove: true },
      skills: { enabled: true, autoApprove: true },
      submit_image_generation: { enabled: true, autoApprove: true },
      editor: { enabled: false, autoApprove: false },
      apply_patch: { enabled: false, autoApprove: false },
      run_commands: { enabled: false, autoApprove: false },
    })
  })

  test("keeps personal sessions without project tools even when their mode is free", () => {
    expect(sessionToolPolicies("free", "personal", [
      toolContribution({ name: "record_idea", approval: "required" }),
      toolContribution({ name: "inspect_application", scope: "application", approval: "automatic" }),
    ])).toEqual({
      "*": { enabled: false, autoApprove: false },
      skills: { enabled: true, autoApprove: true },
      record_idea: { enabled: false, autoApprove: false },
      inspect_application: { enabled: true, autoApprove: true },
    })
  })

  test("fails closed for unknown modes and mutates one live policy object on valid switches", () => {
    expect(() => sessionToolPolicies("unknown" as never, "project", [])).toThrow("compatibility")
    const controller = new SessionToolPolicyController("free", "project", [toolContribution({ name: "record_idea" })])
    const reference = controller.policies
    controller.setMode("approval")
    expect(controller.policies).toBe(reference)
    expect(reference["*"]).toEqual({ enabled: true, autoApprove: false })
    expect(reference.record_idea).toEqual({ enabled: true, autoApprove: false })
  })

  test("keeps register_workbench behind native approval", () => {
    const policies = defaultToolPolicies([
      toolContribution({ name: "register_workbench", approval: "required" }),
      toolContribution({ name: "rename_workbench", approval: "required" }),
      toolContribution({ name: "set_workbench_visibility", approval: "required" }),
    ])
    expect(policies.register_workbench).toEqual({
      enabled: true,
      autoApprove: false,
    })
    expect(policies.rename_workbench).toEqual({
      enabled: true,
      autoApprove: false,
    })
    expect(policies.set_workbench_visibility).toEqual({
      enabled: true,
      autoApprove: false,
    })
  })

  test("uses Cline done for final text while keeping run state behind the awaited result authority", () => {
    expect(projectClineEvent({ type: "ended", payload: { sessionId: "s1", reason: "aborted", ts: 1 } })).toEqual([])
    expect(projectClineEvent({ type: "status", payload: { sessionId: "s1", status: "failed" } })).toEqual([])
    expect(projectClineEvent({
      type: "agent_event",
      payload: { sessionId: "s1", event: { type: "done", reason: "completed", text: "done", iterations: 1 } },
    })).toEqual([expect.objectContaining({
      type: "timeline.upsert",
      sessionId: "s1",
      item: expect.objectContaining({ kind: "message", presentation: "assistant", state: "completed", text: "done" }),
    })])
    expect(terminalStateFromFinishReason("completed")).toBe("completed")
    expect(terminalStateFromFinishReason("aborted")).toBe("cancelled")
    expect(terminalStateFromFinishReason("error")).toBe("failed")
    expect(terminalStateFromFinishReason("max_iterations")).toBe("unknown")
    expect(terminalStateFromFinishReason(undefined)).toBe("unknown")
  })

  test("suppresses recoverable Worker-loop errors only during a bound Growth stage", () => {
    const iterationError = { code: "runtime" as const, message: "运行时错误。", detail: "Agent runtime exceeded maxIterations (12)" }
    const emptyResponseError = { code: "runtime" as const, message: "运行时错误。", detail: "Model returned empty response" }
    const providerError = { code: "provider_network" as const, message: "无法连接模型服务。", detail: "fetch failed" }

    const toolError = { code: "runtime" as const, message: "运行时错误。", detail: "1 tool call(s) failed: report_growth_progress" }
    expect(shouldSuppressGrowthRecoverableError(iterationError, true)).toBeTrue()
    expect(shouldSuppressGrowthRecoverableError(emptyResponseError, true)).toBeTrue()
    expect(shouldSuppressGrowthRecoverableError(toolError, true)).toBeTrue()
    expect(shouldSuppressGrowthRecoverableError(iterationError, false)).toBeFalse()
    expect(shouldSuppressGrowthRecoverableError(emptyResponseError, false)).toBeFalse()
    expect(shouldSuppressGrowthRecoverableError(toolError, false)).toBeFalse()
    expect(shouldSuppressGrowthRecoverableError(providerError, true)).toBeFalse()
  })

  test("projects a late Growth report after pause as cancelled instead of failed", () => {
    const error = "growth_conflict: expected version 1, current version is 2"
    expect(isStaleGrowthReportFailure("report_growth_progress", error)).toBeTrue()
    expect(isStaleGrowthReportFailure("write_world_blueprint", error)).toBeFalse()
    const projector = new ClineTimelineProjector()
    const projected = projector.project({
      type: "agent_event",
      payload: { sessionId: "worker", event: { type: "content_end", contentType: "tool", toolCallId: "late", toolName: "report_growth_progress", error } },
    }, "owner", "worker", { kind: "growth-worker", activityId: "attempt-1", workItemId: "stage:blueprint", title: "全世界蓝图" }, true)
    expect(projected).toEqual([expect.objectContaining({
      type: "timeline.upsert",
      item: expect.objectContaining({ state: "cancelled", output: "目标状态已变化，迟到的阶段汇报已忽略。" }),
    })])
    expect((projected[0] as { item: { error?: string } }).item.error).toBeUndefined()
  })

  test("reserves a larger iteration budget only for disposable Growth workers", () => {
    expect(maxIterationsForSession()).toBe(12)
    expect(maxIterationsForSession("owner-session")).toBe(18)
  })

  test("uses Cline's display formatter at the history projection boundary", () => {
    expect(projectClineMessages([
      { role: "user", content: '<user_input mode="act">继续创作</user_input>' },
      { role: "assistant", content: "好的。" },
    ])).toEqual([
      { id: "message-0", role: "user", text: "继续创作", attachments: [] },
      { id: "message-1", role: "assistant", text: "好的。", attachments: [] },
    ])
  })

  test("projects Cline file blocks as read-only attachment links", () => {
    expect(projectClineMessages([{
      role: "user",
      content: [
        { type: "text", text: "阅读附件" },
        { type: "file", path: "C:/资料/参考.md", content: "正文" },
      ],
    }])).toEqual([{
      id: "message-0",
      role: "user",
      text: "阅读附件",
      attachments: [{ name: "参考.md", displayPath: "C:\\资料\\参考.md", kind: "file" }],
    }])
  })

  test("hides marked internal Growth stage prompts without hiding Agent output", () => {
    expect(projectClineMessages([
      { role: "user", content: '<user_input mode="act">/growth\n<creatx_internal_growth_stage>\n继续阶段</user_input>' },
      { role: "assistant", content: "阶段已经推进。" },
    ])).toEqual([
      { id: "message-1", role: "assistant", text: "阶段已经推进。", attachments: [] },
    ])
  })

  test("disposes the Provider dispatcher across Bun and Electron runtimes", async () => {
    await expect(disposeProviderDispatcher(new EnvHttpProxyAgent())).resolves.toBeUndefined()
    await expect(destroyProviderDispatcher(new EnvHttpProxyAgent())).resolves.toBeUndefined()
  })

  test("rejects duplicate, invalid, and Cline built-in contribution names", () => {
    expect(() => validateCreatXToolContributions([toolContribution({ name: "editor" })])).toThrow("compatibility")
    expect(() => validateCreatXToolContributions([toolContribution({ name: "Bad Tool" })])).toThrow("compatibility")
    expect(() => validateCreatXToolContributions([toolContribution({ name: "record_idea" }), toolContribution({ name: "record_idea" })])).toThrow("compatibility")
  })

  test("injects project identity and fails closed when it is absent", async () => {
    const seen: string[] = []
    const tool = toolContribution({
      name: "record_idea",
      execute: async (_input, context) => {
        seen.push(`${context.sessionId}:${context.projectId}`)
        return { ok: true, value: "saved" }
      },
    })

    await expect(runCreatXToolContribution(tool, {}, { sessionId: "s1" })).rejects.toThrow("project_invalid")
    await expect(runCreatXToolContribution(tool, {}, { sessionId: "s1", projectId: "p1" })).resolves.toBe("saved")
    expect(seen).toEqual(["s1:p1"])
  })

  test("injects trusted Growth stage identity outside model tool input", () => {
    expect(createTrustedToolExecutionContext({
      sessionId: "s1",
      projectId: "p1",
      modelSupportsImages: true,
      growthStage: { goalId: "goal-1", version: 4, stageKey: "world-blueprint-create", worldEntryMode: "reconcile", worldEntryStage: "blueprint-create", attemptId: "attempt-2", workItemId: "object-1", workRootPath: "世界" },
      toolCallId: "tool-1",
    })).toEqual({
      sessionId: "s1",
      projectId: "p1",
      modelSupportsImages: true,
      growthGoalId: "goal-1",
      growthGoalVersion: 4,
      growthStageKey: "world-blueprint-create",
      growthWorldEntryMode: "reconcile",
      growthWorldEntryStage: "blueprint-create",
      growthAttemptId: "attempt-2",
      growthWorkItemId: "object-1",
      growthWorkRootPath: "世界",
      toolCallId: "tool-1",
    })
  })

  test("binds one bounded Growth stage and clears the same identity after success or failure", async () => {
    const bindings: Array<{ goalId: string; version: number; stageKey: string; worldEntryMode?: "create" | "continue" | "reconcile"; worldEntryStage?: "blueprint-create" | "blueprint-review" | "materialization"; attemptId?: string; workItemId?: string; workRootPath?: string } | undefined> = []
    const command = { goalId: "goal-1", projectId: "project-1", sessionId: "session-1", expectedVersion: 4, stageKey: "world-blueprint-confirm", worldEntryMode: "continue" as const, worldEntryStage: "blueprint-review" as const, attemptId: "attempt-2", prompt: "继续阶段", workItemId: "object-1", workRootPath: "世界" }
    await expect(executeGrowthStageBinding(command, (identity) => bindings.push(identity), async () => ({ state: "completed" }))).resolves.toEqual({ state: "completed" })
    await expect(executeGrowthStageBinding(command, (identity) => bindings.push(identity), async () => { throw new Error("provider failed") })).rejects.toThrow("provider failed")
    expect(bindings).toEqual([
      { goalId: "goal-1", version: 4, stageKey: "world-blueprint-confirm", worldEntryMode: "continue", worldEntryStage: "blueprint-review", attemptId: "attempt-2", workItemId: "object-1", workRootPath: "世界" }, undefined,
      { goalId: "goal-1", version: 4, stageKey: "world-blueprint-confirm", worldEntryMode: "continue", worldEntryStage: "blueprint-review", attemptId: "attempt-2", workItemId: "object-1", workRootPath: "世界" }, undefined,
    ])
  })

  test("preserves the trusted object attempt while binding a disposable Worker", () => {
    expect(normalizeGrowthStageIdentity({ goalId: " goal-1 ", version: 4, stageKey: " free-materialization ", worldEntryMode: "continue", worldEntryStage: "materialization", attemptId: "attempt-2", workItemId: "object-1", workRootPath: "世界" })).toEqual({
      goalId: "goal-1",
      version: 4,
      stageKey: "free-materialization",
      worldEntryMode: "continue",
      worldEntryStage: "materialization",
      attemptId: "attempt-2",
      workItemId: "object-1",
      workRootPath: "世界",
    })
  })

  test("keeps successful sibling results when one Growth Worker rejects", () => {
    expect(settledGrowthStageResults([
      { status: "rejected", reason: new Error("provider_network: disconnected") },
      { status: "fulfilled", value: { state: "completed" } },
      { status: "fulfilled", value: { state: "unknown", reason: "result uncertain" } },
    ])).toEqual([
      { state: "failed", reason: "provider_network: disconnected" },
      { state: "completed" },
      { state: "unknown", reason: "result uncertain" },
    ])
  })

  test("uses explicit Cline steer delivery without waiting for a new Run result", async () => {
    const calls: unknown[] = []
    await expect(executeSteerDelivery(
      { sessionId: "session-1", prompt: "调整城市方向" },
      async (input) => { calls.push(input); return undefined },
    )).resolves.toBeUndefined()
    expect(calls).toEqual([{ sessionId: "session-1", prompt: "调整城市方向", delivery: "steer" }])
    await expect(executeSteerDelivery(
      { sessionId: "session-1", prompt: "  " },
      async () => undefined,
    )).rejects.toThrow("session_invalid")
  })

  test("keeps Growth cancellation broader than Owner-only Steer delivery", () => {
    expect(resolveGrowthAbortSessions("owner-session", new Set(["worker-a", "worker-b"]))).toEqual(["owner-session", "worker-a", "worker-b"])
  })

  test("preserves a neutral tool failure as an explicit Cline tool error", async () => {
    const tool = toolContribution({
      name: "record_idea",
      execute: async () => ({ ok: false, error: { code: "file_conflict", message: "文件已被外部修改。" } }),
    })

    await expect(runCreatXToolContribution(tool, {}, { sessionId: "s1", projectId: "p1" })).rejects.toThrow("file_conflict")
  })

  test("registers a neutral contribution in a real Cline session", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-tool-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-tool-project-"))
    roots.push(dataDir, projectRoot)
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      tools: [toolContribution({ name: "record_idea" })],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      expect(session.id).toBeTruthy()
    } finally {
      await adapter.dispose()
    }
  })

  test("creates project sessions as free and applies an explicit approval switch", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-permission-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-permission-project-"))
    roots.push(dataDir, projectRoot)
    const first = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      tools: [toolContribution({ name: "record_idea" })],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    const session = await first.createProjectSession({ projectId: "project-1", projectRoot, title: "创作（7）" })
    expect(session.permissionMode).toBe("free")
    expect(session.kind).toBe("project")
    expect(session.title).toBe("创作（7）")
    await expect(first.steer(session.id, "不应悬空")).rejects.toThrow("cannot Steer an idle session")
    expect((await first.setSessionPermissionMode(session.id, "approval")).permissionMode).toBe("approval")
    await first.dispose()
  })

  test("lists concurrent visible sessions without Cline manifest hydration", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-history-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-history-project-"))
    roots.push(dataDir, projectRoot)
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const owner = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      const core = Reflect.get(adapter, "core") as { listHistory: (options?: { limit?: number }) => Promise<unknown[]> }
      let calls = 0
      core.listHistory = async () => {
        calls += 1
        throw new Error("manifest hydration should not run")
      }

      const results = await Promise.all(Array.from({ length: 64 }, () => adapter.listSessions()))

      expect(calls).toBe(0)
      expect(results.every((sessions) => sessions.map((session) => session.id).includes(owner.id))).toBe(true)
    } finally {
      await adapter.dispose()
    }
  })

  test("removes a new Cline session when permission persistence fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-permission-failure-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-permission-failure-project-"))
    roots.push(dataDir, projectRoot)
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: {
        ensure: () => { throw new Error("session_persistence: injected failure") },
        get: () => undefined,
        setMode: () => { throw new Error("session_missing") },
      },
      onEvent: () => undefined,
    })
    try {
      await expect(adapter.createProjectSession({ projectId: "project-1", projectRoot })).rejects.toThrow("injected failure")
      await expect(adapter.listSessions()).resolves.toEqual([])
    } finally {
      await adapter.dispose()
    }
  })

  test("discovers an explicitly allowed Skill in a real Cline session configuration", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-skill-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-skill-project-"))
    const skillRoot = await mkdtemp(join(tmpdir(), "creatx-skill-root-"))
    roots.push(dataDir, projectRoot, skillRoot)
    await mkdir(join(skillRoot, "novel"))
    await writeFile(join(skillRoot, "novel", "SKILL.md"), "---\nname: novel-start\ndescription: Start a novel.\n---\n\nCreate meaningful novel files.", "utf8")
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      skillDirectories: [skillRoot],
      skills: ["novel-start"],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })

    try {
      expect((await adapter.createProjectSession({ projectId: "project-1", projectRoot })).id).toBeTruthy()
    } finally {
      await adapter.dispose()
    }
  })

  test("continues one Skill across bounded max-iteration slices before advancing", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-sequence-slices-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-sequence-slices-project-"))
    roots.push(dataDir, projectRoot)
    const events: CreatXEvent[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      const prompts: string[] = []
      const results = [
        { state: "unknown" as const, reason: "max_iterations" },
        { state: "unknown" as const, reason: "Agent runtime exceeded maxIterations (12)" },
        { state: "completed" as const },
        { state: "completed" as const },
      ]
      Reflect.set(adapter, "runTurn", async (_sessionId: string, prompt: string) => {
        prompts.push(prompt)
        if (results.length <= 2) {
          const active = Reflect.get(adapter, "activeSkillSequenceSteps").get(session.id)
          active.receipt = { status: "completed", summary: "完整交付", artifactPaths: ["结果.md"], requiredImageTaskIds: [], unresolved: [] }
        }
        return results.shift()!
      })

      const result = await adapter.sendSkillSequence(session.id, "先研究再写小说。", ["creatx-study", "creatx-novel-start"])

      expect(result).toMatchObject({ state: "completed", completedSkills: ["creatx-study", "creatx-novel-start"] })
      expect(prompts).toHaveLength(4)
      expect(prompts[0]).not.toStartWith(CREATX_INTERNAL_SKILL_SEQUENCE)
      expect(prompts.slice(1).every((entry) => entry.startsWith(CREATX_INTERNAL_SKILL_SEQUENCE))).toBeTrue()
      expect(events).toContainEqual({ type: "run.state", sessionId: session.id, state: "completed" })
    } finally {
      await adapter.dispose()
    }
  })

  test("does not advance when Cline ends normally without a trusted complete receipt", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-sequence-receipt-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-sequence-receipt-project-"))
    roots.push(dataDir, projectRoot)
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      let calls = 0
      Reflect.set(adapter, "runTurn", async () => {
        calls += 1
        return { state: "completed" as const }
      })

      const result = await adapter.sendSkillSequence(session.id, "先研究再写小说。", ["creatx-study", "creatx-novel-start"])

      expect(calls).toBe(4)
      expect(result).toMatchObject({
        state: "incomplete",
        stepStatus: "unknown",
        completedSkills: [],
        currentSkill: "creatx-study",
        pendingSkills: ["creatx-novel-start"],
      })
    } finally {
      await adapter.dispose()
    }
  })

  test("halts later Skills when the trusted receipt reports partial delivery", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-sequence-partial-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-sequence-partial-project-"))
    roots.push(dataDir, projectRoot)
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      let calls = 0
      Reflect.set(adapter, "runTurn", async () => {
        calls += 1
        const active = Reflect.get(adapter, "activeSkillSequenceSteps").get(session.id)
        active.receipt = { status: "partial", summary: "人物资料已写，肖像未完成", artifactPaths: ["人物/manifest.json"], requiredImageTaskIds: [], unresolved: ["肖像生成失败"] }
        return { state: "completed" as const }
      })

      const result = await adapter.sendSkillSequence(session.id, "先做人物再写小说。", ["creatx-build-character-gallery", "creatx-novel-start"])

      expect(calls).toBe(1)
      expect(result).toMatchObject({ state: "incomplete", stepStatus: "partial", completedSkills: [], currentSkill: "creatx-build-character-gallery" })
    } finally {
      await adapter.dispose()
    }
  })

  test("halts later Skills with a structured incomplete result after four slices", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-sequence-exhausted-data-"))
    const projectRoot = await mkdtemp(join(tmpdir(), "creatx-sequence-exhausted-project-"))
    roots.push(dataDir, projectRoot)
    const events: CreatXEvent[] = []
    const adapter = await ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      sessionPermissions: memorySessionPermissions(),
      onEvent: (event) => events.push(event),
    })
    try {
      const session = await adapter.createProjectSession({ projectId: "project-1", projectRoot })
      let calls = 0
      Reflect.set(adapter, "runTurn", async () => {
        calls += 1
        return { state: "unknown" as const, reason: "max_iterations" }
      })

      const result = await adapter.sendSkillSequence(session.id, "制作地图后画漫画。", ["creatx-draw-map", "creatx-draw-comic"])

      expect(calls).toBe(4)
      expect(result).toMatchObject({
        state: "incomplete",
        completedSkills: [],
        currentSkill: "creatx-draw-map",
        pendingSkills: ["creatx-draw-comic"],
        slicesUsed: 4,
      })
      expect(events).toContainEqual(expect.objectContaining({ type: "run.state", sessionId: session.id, state: "unknown" }))
    } finally {
      await adapter.dispose()
    }
  })

  test("fails closed when the configured Skill allowlist cannot be discovered", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "creatx-missing-skill-data-"))
    const skillRoot = await mkdtemp(join(tmpdir(), "creatx-missing-skill-root-"))
    roots.push(dataDir, skillRoot)

    await expect(ClineAdapter.create({
      dataDir,
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "not-used",
      skillDirectories: [skillRoot],
      skills: ["missing-skill"],
      sessionPermissions: memorySessionPermissions(),
      onEvent: () => undefined,
    })).rejects.toThrow("no configured Cline Skill")
  })
})

function toolContribution(overrides: Partial<CreatXToolContribution> & Pick<CreatXToolContribution, "name">): CreatXToolContribution {
  return {
    description: "A test-only neutral CreatX tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    audiences: ["ordinary"],
    scope: "project",
    approval: "required",
    execute: async () => ({ ok: true, value: "ok" }),
    ...overrides,
  }
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
