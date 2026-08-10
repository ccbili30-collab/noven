import { describe, expect, test } from "bun:test"
import type { TimelineItem } from "@creatx/contracts"
import { compactActivityItems, mergeTimelineSnapshot, partitionTimeline, projectConversationTurns, reduceTimeline } from "../src/timeline-channels"

describe("Timeline channels", () => {
  test("keeps the root conversation separate and preserves each Worker sequence", () => {
    const items: TimelineItem[] = [
      item(1, "root", "message"),
      item(2, "a-text", "reasoning", "object-a", "王国"),
      item(3, "b-tool", "tool", "object-b", "山脉"),
      item(4, "a-tool", "tool", "object-a", "王国"),
      item(5, "b-text", "reasoning", "object-b", "山脉"),
    ]

    const result = partitionTimeline(items)

    expect(result.conversation.map((entry) => entry.itemId)).toEqual(["root"])
    expect(result.activities.map((activity) => activity.title)).toEqual(["王国", "山脉"])
    expect(result.activities[0]!.items.map((entry) => entry.itemId)).toEqual(["a-text", "a-tool"])
    expect(result.activities[1]!.items.map((entry) => entry.itemId)).toEqual(["b-tool", "b-text"])
  })

  test("folds only consecutive identical Worker failures", () => {
    const first = { ...item(1, "first", "tool", "object-a", "王国"), state: "failed" as const, error: "missing source" }
    const second = { ...item(2, "second", "tool", "object-a", "王国"), state: "failed" as const, error: "missing source" }
    const different = { ...item(3, "different", "tool", "object-a", "王国"), state: "failed" as const, error: "invalid contract" }

    expect(compactActivityItems([first, second, different])).toEqual([
      { item: first, repeatCount: 2 },
      { item: different, repeatCount: 1 },
    ])
  })

  test("keeps an unmatched optimistic user message until history contains the same prompt", () => {
    const local = message(3, "local-1", "user", "/growth 创建一个世界")
    const history = [message(1, "user:0", "user", "普通消息"), message(2, "assistant:0", "assistant", "普通回复")]

    expect(mergeTimelineSnapshot([...history, local], history).map((entry) => entry.itemId)).toEqual(["user:0", "assistant:0", "local-1"])

    const persisted = [...history, message(3, "user:1", "user", "/growth 创建一个世界")]
    expect(mergeTimelineSnapshot([...history, local], persisted).map((entry) => entry.itemId)).toEqual(["user:0", "assistant:0", "user:1"])
  })

  test("merges an optimistic image attachment with its persisted visual message", () => {
    const local = {
      ...message(1, "local-image", "user", "看看这张图"),
      attachments: [{ name: "参考图.png", displayPath: "参考图.png", kind: "image" as const, mediaType: "image/png" as const }],
    }
    const persisted = {
      ...message(1, "message:image", "user", "看看这张图"),
      attachments: [{ name: "图片 1.png", displayPath: "image:0", kind: "image" as const, mediaType: "image/png" as const }],
    }

    expect(mergeTimelineSnapshot([local], [persisted])).toEqual([persisted])
  })

  test("updates an existing streaming item in place and inserts only new sequence positions", () => {
    const first = message(1, "first", "assistant", "first")
    const streaming = { ...message(2, "streaming", "assistant", "a"), state: "streaming" as const }
    const third = message(3, "third", "assistant", "third")
    const current = [first, streaming, third]

    const updated = reduceTimeline(current, { ...streaming, text: "ab" })
    const inserted = reduceTimeline(updated, message(2.5, "between", "assistant", "between"))

    expect(updated).toEqual([first, { ...streaming, text: "ab" }, third])
    expect(updated[0]).toBe(first)
    expect(updated[2]).toBe(third)
    expect(inserted.map((entry) => entry.itemId)).toEqual(["first", "streaming", "between", "third"])
  })

  test("projects a completed turn as user, processing details, and only the final assistant reply", () => {
    const items = [
      message(1, "user:0", "user", "开始工作"),
      message(2, "assistant:0", "assistant", "我先检查文件。"),
      item(3, "reasoning:0", "reasoning"),
      item(4, "tool:0", "tool"),
      message(5, "worker:0", "internal", "Worker 正在整理", "object-a", "王国"),
      message(6, "assistant:1", "assistant", "已经完成，这是最终总结。"),
    ]

    const [turn] = projectConversationTurns(items, false)

    expect(turn?.user?.itemId).toBe("user:0")
    expect(turn?.details.map((entry) => entry.itemId)).toEqual(["assistant:0", "reasoning:0", "tool:0", "worker:0"])
    expect(turn?.final?.itemId).toBe("assistant:1")
  })

  test("keeps the latest assistant text in processing details while its turn is active", () => {
    const items = [
      message(1, "user:0", "user", "开始工作"),
      item(2, "tool:0", "tool"),
      message(3, "assistant:0", "assistant", "尚未完成的阶段说明"),
    ]

    const [turn] = projectConversationTurns(items, true)

    expect(turn?.final).toBeUndefined()
    expect(turn?.details.map((entry) => entry.itemId)).toEqual(["tool:0", "assistant:0"])
  })

  test("marks a newly admitted turn as waiting until the first assistant activity", () => {
    const [waiting] = projectConversationTurns([message(1, "local-1", "user", "开始")], true)
    const [started] = projectConversationTurns([message(1, "local-1", "user", "开始"), item(2, "reasoning:0", "reasoning")], true)

    expect(waiting?.waiting).toBeTrue()
    expect(started?.waiting).toBeFalse()
  })

  test("orders a local user boundary before live activity with the same sequence", () => {
    const local = message(2, "local-1", "user", "/growth 创建一个世界")
    const activity = item(2, "tool:worker", "tool", "object-a", "王国")

    const turns = projectConversationTurns([activity, local], true)

    expect(turns).toHaveLength(1)
    expect(turns[0]?.user?.itemId).toBe("local-1")
    expect(turns[0]?.details.map((entry) => entry.itemId)).toEqual(["tool:worker"])
  })

  test("does not attach post-reload Growth activity to an older completed conversation turn", () => {
    const items = [
      message(1, "user:0", "user", "旧问题"),
      message(2, "assistant:0", "assistant", "旧问题的最终回复"),
      item(3, "growth:worker:tool:worker", "tool", "object-a", "王国"),
    ]

    const turns = projectConversationTurns(items, true, true)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.final?.itemId).toBe("assistant:0")
    expect(turns[1]?.user).toBeUndefined()
    expect(turns[1]?.details.map((entry) => entry.itemId)).toEqual(["growth:worker:tool:worker"])
  })

  test("restores Worker activity into the exact Owner activation turn", () => {
    const user = { ...message(1, "message-0", "user", "/growth 建立世界"), ownerActivationId: "activation-1" }
    const worker = { ...item(2, "growth:worker:tool", "tool", "object-a", "王国"), ownerActivationId: "activation-1" }
    const final = { ...message(3, "message-4", "assistant", "世界已经完成。"), ownerActivationId: "activation-1" }

    const turns = projectConversationTurns([user, worker, final], false, true)

    expect(turns).toHaveLength(1)
    expect(turns[0]?.user?.text).toBe("/growth 建立世界")
    expect(turns[0]?.details.map((entry) => entry.itemId)).toContain("growth:worker:tool")
    expect(turns[0]?.final?.text).toBe("世界已经完成。")
  })

  test("keeps a restored top-level Growth final reply with its detached processing turn", () => {
    const items = [
      message(1, "user:0", "user", "旧问题"),
      message(2, "assistant:0", "assistant", "旧问题的最终回复"),
      item(3, "growth:worker:tool:read", "tool", "stage:worker", "Growth 阶段"),
      message(4, "growth:worker:text:final", "assistant", "本阶段已完成。"),
    ]

    const turns = projectConversationTurns(items, false, true)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.final?.text).toBe("旧问题的最终回复")
    expect(turns[1]?.details.map((entry) => entry.itemId)).toEqual(["growth:worker:tool:read"])
    expect(turns[1]?.final?.text).toBe("本阶段已完成。")
  })

  test("detaches a restored Growth final reply even when the Worker produced no visible activity", () => {
    const items = [
      message(1, "user:0", "user", "旧问题"),
      message(2, "assistant:0", "assistant", "旧问题的最终回复"),
      message(3, "growth:worker:text:final", "assistant", "阶段直接完成。"),
    ]

    const turns = projectConversationTurns(items, false, true)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.final?.text).toBe("旧问题的最终回复")
    expect(turns[1]?.final?.text).toBe("阶段直接完成。")
  })

  test("keeps every consecutive top-level Growth stage report as its own assistant turn", () => {
    const items = [
      message(1, "user:0", "user", "开始长任务"),
      message(2, "assistant:0", "assistant", "目标已启动。"),
      item(3, "growth:stage-1:tool:read", "tool", "stage-1", "Growth 阶段"),
      message(4, "growth:stage-1:text:final", "assistant", "第一阶段已完成。"),
      item(5, "growth:stage-2:tool:write", "tool", "stage-2", "Growth 阶段"),
      message(6, "growth:stage-2:text:final", "assistant", "第二阶段已完成。"),
    ]

    const turns = projectConversationTurns(items, false, true)

    expect(turns).toHaveLength(3)
    expect(turns.map((turn) => turn.final?.text)).toEqual(["目标已启动。", "第一阶段已完成。", "第二阶段已完成。"])
    expect(turns.slice(1).map((turn) => turn.details.length)).toEqual([1, 1])
  })
})

function item(sequence: number, itemId: string, kind: TimelineItem["kind"], activityId?: string, title?: string): TimelineItem {
  return {
    sequence,
    itemId,
    kind,
    presentation: kind === "reasoning" ? "internal" : "assistant",
    state: "completed",
    ...(kind === "tool" ? { toolName: "read_files" } : { text: itemId }),
    ...(activityId ? { activity: { kind: "growth-worker" as const, activityId, title: title!, workItemId: activityId } } : {}),
  }
}

function message(sequence: number, itemId: string, presentation: TimelineItem["presentation"], text: string, activityId?: string, title?: string): TimelineItem {
  return {
    sequence,
    itemId,
    kind: "message",
    presentation,
    state: "completed",
    text,
    ...(activityId ? { activity: { kind: "growth-worker" as const, activityId, title: title!, workItemId: activityId } } : {}),
  }
}
