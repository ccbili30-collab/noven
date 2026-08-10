import { expect, test } from "bun:test"
import type { Message } from "@cline/sdk"
import {
  ProjectImageReadTurnBudget,
  limitProjectReadMediaForProvider,
} from "../src/provider-media-budget.ts"

test("keeps the newest project-read image within the provider budget without changing direct user images", () => {
  const directImage = imageMessage("direct-user-image")
  const oldRead = readFilesResult("old-read", "old-project-image")
  const latestRead = readFilesResult("latest-read", "latest-project-image")
  const messages = [oldRead, directImage, latestRead]

  const limited = limitProjectReadMediaForProvider(messages, "latest-project-image".length)

  expect(JSON.stringify(limited[0])).not.toContain("old-project-image")
  expect(JSON.stringify(limited[0])).toContain("project image omitted from this model request")
  expect(JSON.stringify(limited[1])).toContain("direct-user-image")
  expect(JSON.stringify(limited[2])).toContain("latest-project-image")
  expect(messages).toEqual([oldRead, directImage, latestRead])
})

test("counts a project image only once when the same provider message list is rebuilt", () => {
  const messages = [readFilesResult("read", "project-image")]

  expect(JSON.stringify(limitProjectReadMediaForProvider(messages, 32))).toContain("project-image")
  expect(JSON.stringify(limitProjectReadMediaForProvider(messages, 32))).toContain("project-image")
})

test("fails closed when one Run exceeds its cumulative project-image read budget", () => {
  const budget = new ProjectImageReadTurnBudget(12)
  budget.begin("session-a")

  expect(budget.reserve("session-a", 6)).toBe(8)
  expect(() => budget.reserve("session-a", 6)).toThrow("file_media_budget")
  expect(budget.reserve("session-b", 6)).toBe(8)

  budget.end("session-a")
  budget.begin("session-a")
  expect(budget.reserve("session-a", 6)).toBe(8)
})

function readFilesResult(id: string, data: string): Message {
  const persisted: unknown = {
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: id,
      name: "read_files",
      content: [{
        query: `${id}.png`,
        success: true,
        result: [
          "Successfully read image",
          { type: "image", data, mediaType: "image/png" },
        ],
      }],
    }],
  }
  return persisted as Message
}

function imageMessage(data: string): Message {
  return {
    role: "user",
    content: [
      { type: "text", text: "请查看当前附件。" },
      { type: "image", data, mediaType: "image/png" },
    ],
  }
}
