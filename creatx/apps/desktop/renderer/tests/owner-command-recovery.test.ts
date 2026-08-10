import { describe, expect, test } from "bun:test"
import { clearPendingOwnerCommand, pendingGrowthMessage, pendingGrowthResume, readPendingOwnerCommands, savePendingOwnerCommand } from "../src/owner-command-recovery"

describe("Owner command recovery", () => {
  test("persists only explicit Growth messages and restores the exact request identity", () => {
    const storage = memoryStorage()
    expect(pendingGrowthMessage({ requestId: "ordinary-1", sessionId: "session-1", prompt: "继续聊聊", attachmentIds: [] })).toBeUndefined()
    const pending = pendingGrowthMessage({ requestId: "growth-1", sessionId: "session-1", prompt: "/growth-world-pro 创建世界", attachmentIds: [] })!
    savePendingOwnerCommand(storage, pending)

    expect(readPendingOwnerCommands(storage)).toEqual([{
      kind: "growth-message",
      command: { requestId: "growth-1", sessionId: "session-1", prompt: "/growth-world-pro 创建世界", attachmentIds: [] },
    }])
    clearPendingOwnerCommand(storage, pendingGrowthMessage({ requestId: "another-request", sessionId: "session-1", prompt: "/growth-world-pro 创建世界", attachmentIds: [] })!)
    expect(readPendingOwnerCommands(storage)[0]?.command.requestId).toBe("growth-1")
    clearPendingOwnerCommand(storage, pending)
    expect(readPendingOwnerCommands(storage)).toEqual([])
  })

  test("allows independent Owner commands in different sessions and clears only the matching request", () => {
    const storage = memoryStorage()
    const first = pendingGrowthMessage({ requestId: "shared-request", sessionId: "session-a", prompt: "/growth-world-pro 世界甲", attachmentIds: [] })!
    const second = pendingGrowthMessage({ requestId: "shared-request", sessionId: "session-b", prompt: "/growth-world-pro 世界乙", attachmentIds: [] })!

    expect(savePendingOwnerCommand(storage, first)).toBe(true)
    expect(savePendingOwnerCommand(storage, second)).toBe(true)
    expect(readPendingOwnerCommands(storage)).toEqual([first, second])
    clearPendingOwnerCommand(storage, first)
    expect(readPendingOwnerCommands(storage)).toEqual([second])
  })

  test("refuses a different pending Owner command only within the same session", () => {
    const storage = memoryStorage()
    const first = pendingGrowthResume({ requestId: "resume-a", goalId: "goal-1" }, "session-1")
    const second = pendingGrowthResume({ requestId: "resume-b", goalId: "goal-1" }, "session-1")
    const independent = pendingGrowthResume({ requestId: "resume-c", goalId: "goal-2" }, "session-2")

    expect(savePendingOwnerCommand(storage, first)).toBe(true)
    expect(savePendingOwnerCommand(storage, first)).toBe(true)
    expect(savePendingOwnerCommand(storage, second)).toBe(false)
    expect(savePendingOwnerCommand(storage, independent)).toBe(true)
    expect(readPendingOwnerCommands(storage)).toEqual([first, independent])
  })

  test("migrates a valid legacy command without losing its recovery identity", () => {
    const storage = memoryStorage()
    storage.setItem("creatx.pending-owner-command.v1", JSON.stringify({
      kind: "growth-message",
      command: { requestId: "legacy-1", sessionId: "session-1", prompt: "/growth-world-pro 旧任务", attachmentIds: [] },
    }))

    expect(readPendingOwnerCommands(storage)[0]?.command.requestId).toBe("legacy-1")
    expect(storage.getItem("creatx.pending-owner-command.v1")).toBeNull()
    expect(storage.getItem("creatx.pending-owner-commands.v2")).not.toBeNull()
  })

  test("drops an unsafe record without losing another session recovery", () => {
    const storage = memoryStorage()
    const valid = pendingGrowthMessage({ requestId: "growth-2", sessionId: "session-2", prompt: "/growth-world-pro 安全任务", attachmentIds: [] })!
    storage.setItem("creatx.pending-owner-commands.v2", JSON.stringify({
      version: 2,
      commands: [
        { kind: "growth-message", command: { requestId: "bad", sessionId: "session-1", prompt: "普通消息", attachmentIds: [] } },
        valid,
      ],
    }))

    expect(readPendingOwnerCommands(storage)).toEqual([valid])
  })
})

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => { values.delete(key) },
  }
}
