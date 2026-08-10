import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { readGrowthWorkerMessages } from "../src/history-recovery.ts"

test("reads persisted Growth Worker messages without scanning Cline history again", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-history-recovery-"))
  const messagesPath = join(root, "worker.messages.json")
  await mkdir(root, { recursive: true })
  await writeFile(messagesPath, JSON.stringify({ messages: [{ role: "assistant", content: [{ type: "text", text: "阶段完成" }] }] }), "utf8")
  let fallbackReads = 0

  try {
    const messages = await readGrowthWorkerMessages({ sessionId: "worker", messagesPath }, async () => {
      fallbackReads += 1
      return []
    })

    expect(messages).toEqual([{ role: "assistant", content: [{ type: "text", text: "阶段完成" }] }])
    expect(fallbackReads).toBe(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("falls back to Cline when a legacy Worker has no direct message Artifact", async () => {
  const messages = await readGrowthWorkerMessages({ sessionId: "legacy-worker" }, async (sessionId) => [{ role: "assistant", content: sessionId }])

  expect(messages).toEqual([{ role: "assistant", content: "legacy-worker" }])
})
