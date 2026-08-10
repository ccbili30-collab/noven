import { expect, test } from "bun:test"
import { visibleAppError } from "../src/App"

test("does not project a normal cancellation as a global error banner", () => {
  expect(visibleAppError({ code: "cancelled", message: "本轮已取消。" })).toBeUndefined()
  expect(visibleAppError({ code: "session_persistence", message: "会话记录不完整。" })).toEqual({ code: "session_persistence", message: "会话记录不完整。" })
})
