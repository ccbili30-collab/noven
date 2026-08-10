import { describe, expect, test } from "bun:test"
import { ConversationScrollController } from "../src/conversation-scroll-controller"

describe("ConversationScrollController", () => {
  test("keeps following streaming increments while the user remains at the latest content", () => {
    const viewport = { scrollTop: 300, scrollHeight: 500, clientHeight: 200 }
    const controller = new ConversationScrollController()

    controller.switchSession("session-1")
    expect(controller.timelineCommitted(viewport, true)).toBe(false)

    viewport.scrollHeight = 510
    expect(controller.timelineCommitted(viewport, true)).toBe(false)
    expect(viewport.scrollTop).toBe(510)
  })

  test("stops following as soon as the user scrolls away from the latest content", () => {
    const viewport = { scrollTop: 300, scrollHeight: 500, clientHeight: 200 }
    const controller = new ConversationScrollController()
    controller.switchSession("session-1")
    controller.timelineCommitted(viewport, true)

    viewport.scrollTop = 120
    expect(controller.scrolled(viewport)).toBe(true)
    viewport.scrollHeight = 520
    expect(controller.timelineCommitted(viewport, true)).toBe(true)
    expect(viewport.scrollTop).toBe(120)
  })

  test("returning to latest resumes sticky following", () => {
    const viewport = { scrollTop: 10, scrollHeight: 700, clientHeight: 220 }
    const controller = new ConversationScrollController()
    controller.switchSession("session-1")
    controller.timelineCommitted(viewport, true)
    viewport.scrollTop = 10
    controller.scrolled(viewport)

    controller.returnToLatest(viewport)
    expect(viewport.scrollTop).toBe(700)

    viewport.scrollHeight = 730
    expect(controller.timelineCommitted(viewport, true)).toBe(false)
    expect(viewport.scrollTop).toBe(730)
  })

  test("positions a long session history at the latest content once when opened", () => {
    const viewport = { scrollTop: 0, scrollHeight: 900, clientHeight: 220 }
    const controller = new ConversationScrollController()

    controller.switchSession("session-1")
    expect(controller.timelineCommitted(viewport, true)).toBe(false)
    expect(viewport.scrollTop).toBe(900)

    viewport.scrollTop = 120
    expect(controller.scrolled(viewport)).toBe(true)
    viewport.scrollHeight = 940
    expect(controller.timelineCommitted(viewport, true)).toBe(true)
    expect(viewport.scrollTop).toBe(120)
  })

  test("waits for the first non-empty timeline before consuming the open position", () => {
    const viewport = { scrollTop: 0, scrollHeight: 220, clientHeight: 220 }
    const controller = new ConversationScrollController()

    controller.switchSession("session-1")
    expect(controller.timelineCommitted(viewport, false)).toBe(false)

    viewport.scrollHeight = 620
    expect(controller.timelineCommitted(viewport, true)).toBe(false)
    expect(viewport.scrollTop).toBe(620)
  })

  test("positions the same session again only after leaving and reopening it", () => {
    const viewport = { scrollTop: 0, scrollHeight: 900, clientHeight: 220 }
    const controller = new ConversationScrollController()

    controller.switchSession("session-1")
    controller.timelineCommitted(viewport, true)
    viewport.scrollTop = 0
    controller.scrolled(viewport)

    controller.switchSession("session-2")
    viewport.scrollHeight = 700
    controller.timelineCommitted(viewport, true)

    controller.switchSession("session-1")
    viewport.scrollTop = 0
    viewport.scrollHeight = 900
    expect(controller.timelineCommitted(viewport, true)).toBe(false)
    expect(viewport.scrollTop).toBe(900)
  })
})
