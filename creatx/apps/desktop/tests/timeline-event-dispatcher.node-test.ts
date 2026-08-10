import assert from "node:assert/strict"
import test from "node:test"
import type { CreatXEvent, TimelineItem } from "@creatx/contracts"
import { TimelineEventDispatcher } from "../src/timeline-event-dispatcher.ts"

test("coalesces streaming updates for the same timeline item", () => {
  const sent: CreatXEvent[] = []
  let flush!: () => void
  const dispatcher = new TimelineEventDispatcher((event) => sent.push(event), (callback) => { flush = callback })

  for (let index = 1; index <= 100; index += 1) dispatcher.enqueue(upsert("session-1", { ...item("text-1", index), text: `chunk-${index}` }))

  assert.equal(sent.length, 0)
  flush()
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.type, "timeline.upsert")
  if (sent[0]?.type === "timeline.upsert") assert.equal(sent[0].item.text, "chunk-100")
})

test("flushes one session without disturbing another session", () => {
  const sent: CreatXEvent[] = []
  let flush!: () => void
  const dispatcher = new TimelineEventDispatcher((event) => sent.push(event), (callback) => { flush = callback })
  dispatcher.enqueue(upsert("session-1", item("one", 1)))
  dispatcher.enqueue(upsert("session-2", item("two", 1)))

  dispatcher.flushSession("session-1")

  assert.deepEqual(sent.map((event) => event.type === "timeline.upsert" ? event.sessionId : ""), ["session-1"])
  flush()
  assert.deepEqual(sent.map((event) => event.type === "timeline.upsert" ? event.sessionId : ""), ["session-1", "session-2"])
})

function upsert(sessionId: string, value: TimelineItem): Extract<CreatXEvent, { type: "timeline.upsert" }> {
  return { type: "timeline.upsert", sessionId, item: value }
}

function item(itemId: string, sequence: number): TimelineItem {
  return { itemId, sequence, kind: "message", presentation: "assistant", state: "streaming" }
}
