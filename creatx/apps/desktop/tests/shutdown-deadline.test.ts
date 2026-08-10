import { expect, test } from "bun:test"
import { runBeforeDeadline } from "../src/shutdown-deadline.ts"

test("returns a completed shutdown result before the deadline", async () => {
  await expect(runBeforeDeadline(async () => "closed", 100)).resolves.toEqual({ timedOut: false, value: "closed" })
})

test("returns at the deadline when a shutdown dependency never settles", async () => {
  const startedAt = Date.now()
  const result = await runBeforeDeadline(() => new Promise<never>(() => undefined), 20)
  expect(result).toEqual({ timedOut: true })
  expect(Date.now() - startedAt).toBeLessThan(250)
})
