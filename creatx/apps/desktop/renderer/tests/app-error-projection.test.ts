import { expect, test } from "bun:test"
import { visibleAppError } from "../src/App"

test("does not project a normal cancellation as a global error banner", () => {
  expect(visibleAppError({ code: "cancelled", message: "本轮已取消。" })).toBeUndefined()
  expect(visibleAppError({ code: "image_queue_invalid", message: "图片任务请求无效。" })).toBeUndefined()
  expect(visibleAppError({ code: "runtime", message: "运行时发生错误。" })).toBeUndefined()
  expect(visibleAppError({ code: "provider_quota", message: "模型服务余额或配额不足。" })).toEqual({ code: "provider_quota", message: "模型服务余额或配额不足。" })
  expect(visibleAppError({ code: "session_persistence", message: "会话记录不完整。" })).toEqual({ code: "session_persistence", message: "会话记录不完整。" })
})
