import { describe, expect, test } from "bun:test"
import { classifyRuntimeError } from "../src"

describe("runtime error classification", () => {
  test.each([
    ["API key is missing", "provider_missing_credentials"],
    ["Authentication Fails, Your api key is invalid", "provider_unauthorized"],
    ["HTTP 401 unauthorized", "provider_unauthorized"],
    ["insufficient balance", "provider_quota"],
    ["fetch failed: ECONNRESET", "provider_network"],
    ["model not found", "provider_model"],
    ["user cancelled", "cancelled"],
    ["file_conflict: changed on disk", "file_conflict"],
    ["attachment_invalid: forged token", "attachment_invalid"],
    ["attachment_missing: selected file no longer exists", "attachment_missing"],
    ["attachment_unreadable: access denied", "attachment_unreadable"],
    ["workbench_invalid: bad record", "workbench_invalid"],
    ["workbench_conflict: duplicate folder", "workbench_conflict"],
    ["blueprint_invalid: missing layer", "blueprint_invalid"],
    ["blueprint_conflict: stale batch", "blueprint_conflict"],
    ["growth_invalid: illegal transition", "growth_invalid"],
    ["growth_conflict: stale version", "growth_conflict"],
    ["growth_persistence: corrupt database", "growth_persistence"],
    ["image_queue_invalid: bad task", "image_queue_invalid"],
    ["image_queue_conflict: duplicate task", "image_queue_conflict"],
    ["image_queue_persistence: corrupt database", "image_queue_persistence"],
    ["session_invalid: invalid mode", "session_invalid"],
    ["session_conflict: stale mode", "session_conflict"],
    ["session_persistence: corrupt database", "session_persistence"],
    ["runtime_unavailable: Cline Utility Process exited with code 4294967295", "runtime"],
    ["unexpected state", "runtime"],
  ] as const)("maps %s", (message, code) => {
    expect(classifyRuntimeError(new Error(message)).code).toBe(code)
  })

  test.each([
    "session_conflict: session is owned by live process 46904",
    "session_conflict: session ownership changed to process 123",
  ])("explains live process ownership conflicts accurately: %s", (detail) => {
    expect(classifyRuntimeError(new Error(detail))).toEqual({
      code: "session_conflict",
      message: "此会话正在另一个诺文窗口中使用。",
      detail,
    })
  })

  test("keeps the generic message for other session conflicts", () => {
    expect(classifyRuntimeError(new Error("session_conflict: stale mode")).message).toBe("会话配置已经发生变化。")
  })
})
