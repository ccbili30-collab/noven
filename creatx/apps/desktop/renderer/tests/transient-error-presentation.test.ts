import { describe, expect, test } from "bun:test"
import { isTransientRecoveringError, transientErrorPhase } from "../src/transient-error-presentation"

describe("transient error presentation", () => {
  test("allows only the two accepted soft error summaries", () => {
    expect(isTransientRecoveringError("图片任务请求无效。")).toBe(true)
    expect(isTransientRecoveringError("运行时发生错误。")).toBe(true)
    expect(isTransientRecoveringError("模型服务余额或配额不足。")).toBe(false)
    expect(isTransientRecoveringError("会话记录不完整。")).toBe(false)
  })

  test("moves from orange to recovered and then hides on the fixed schedule", () => {
    expect(transientErrorPhase(0)).toBe("recovering")
    expect(transientErrorPhase(5_999)).toBe("recovering")
    expect(transientErrorPhase(6_000)).toBe("recovered")
    expect(transientErrorPhase(7_999)).toBe("recovered")
    expect(transientErrorPhase(8_000)).toBe("hidden")
  })
})
