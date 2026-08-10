import { describe, expect, test } from "bun:test"
import { ProcessingScrollController } from "../src/processing-scroll-controller"

describe("ProcessingScrollController", () => {
  test("keeps an active process attached to its latest content", () => {
    const viewport = { scrollTop: 300, scrollHeight: 500, clientHeight: 200 }
    const controller = new ProcessingScrollController()

    controller.scrolled(viewport)
    viewport.scrollHeight = 540
    controller.contentCommitted(viewport, true)

    expect(viewport.scrollTop).toBe(540)
  })

  test("preserves the reading position after the user scrolls upward", () => {
    const viewport = { scrollTop: 300, scrollHeight: 500, clientHeight: 200 }
    const controller = new ProcessingScrollController()
    controller.scrolled(viewport)

    viewport.scrollTop = 120
    controller.scrolled(viewport)
    viewport.scrollHeight = 560
    controller.contentCommitted(viewport, true)

    expect(viewport.scrollTop).toBe(120)
  })

  test("resumes following after the user returns to the bottom", () => {
    const viewport = { scrollTop: 120, scrollHeight: 560, clientHeight: 200 }
    const controller = new ProcessingScrollController()
    controller.scrolled(viewport)

    viewport.scrollTop = 360
    controller.scrolled(viewport)
    viewport.scrollHeight = 600
    controller.contentCommitted(viewport, true)

    expect(viewport.scrollTop).toBe(600)
  })

  test("opens an active process at the latest content", () => {
    const viewport = { scrollTop: 80, scrollHeight: 700, clientHeight: 200 }
    const controller = new ProcessingScrollController()

    controller.opened(viewport, true)

    expect(viewport.scrollTop).toBe(700)
  })

  test("does not move a completed process when it is reopened", () => {
    const viewport = { scrollTop: 80, scrollHeight: 700, clientHeight: 200 }
    const controller = new ProcessingScrollController()

    controller.opened(viewport, false)
    controller.contentCommitted(viewport, false)

    expect(viewport.scrollTop).toBe(80)
  })
})
