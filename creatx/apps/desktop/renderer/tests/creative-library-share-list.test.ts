import { describe, expect, test } from "bun:test"
import { filterShareSessions, shareListWindow } from "../src/creative-library-share-list"

const sessions = Array.from({ length: 917 }, (_, index) => ({
  id: `session-${index}`,
  title: index === 816 ? "星海远征" : `创作（${index + 1}）`,
  displayPath: index === 816 ? "D:\\作品\\远征计划" : `D:\\项目\\${index + 1}`,
}))

describe("creative library share list", () => {
  test("searches every session by title or display path", () => {
    expect(filterShareSessions(sessions, "星海").map((session) => session.id)).toEqual(["session-816"])
    expect(filterShareSessions(sessions, "远征计划").map((session) => session.id)).toEqual(["session-816"])
    expect(filterShareSessions(sessions, "  创作（2） ").map((session) => session.id)).toEqual(["session-1"])
  })

  test("keeps the complete list reachable while mounting only a bounded window", () => {
    expect(shareListWindow(917, 0, 420)).toEqual({ start: 0, end: 10, offset: 0, totalHeight: 58688 })
    const last = shareListWindow(917, 58_268, 420)
    expect(last.end).toBe(917)
    expect(last.start).toBeGreaterThan(900)
    expect(last.end - last.start).toBeLessThanOrEqual(12)
  })

  test("returns an empty stable window for no matches", () => {
    expect(shareListWindow(0, 500, 420)).toEqual({ start: 0, end: 0, offset: 0, totalHeight: 0 })
  })
})
