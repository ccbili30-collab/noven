import { describe, expect, test } from "bun:test"
import { waitForMessageAdmission } from "../src/message-admission"

describe("message admission", () => {
  test("returns as soon as the Runtime admits the message", async () => {
    let finish!: () => void
    const completed = new Promise<void>((resolve) => { finish = resolve })
    let admit!: () => void
    const admitted = waitForMessageAdmission((onAdmitted) => {
      admit = onAdmitted
      return completed
    }, () => undefined)

    let settled = false
    void admitted.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    admit()
    await admitted
    expect(settled).toBe(true)
    finish()
  })

  test("fails closed when sending fails before admission", async () => {
    await expect(waitForMessageAdmission(
      () => Promise.reject(new Error("provider rejected before admission")),
      () => undefined,
    )).rejects.toThrow("provider rejected before admission")
  })

  test("reports a background failure after successful admission", async () => {
    let rejectRun!: (error: Error) => void
    const running = new Promise<void>((_resolve, reject) => { rejectRun = reject })
    const failures: string[] = []
    let reportFailure!: () => void
    const failureReported = new Promise<void>((resolve) => { reportFailure = resolve })
    const admitted = waitForMessageAdmission((onAdmitted) => {
      onAdmitted()
      return running
    }, (error) => {
      failures.push(error instanceof Error ? error.message : String(error))
      reportFailure()
    })

    await admitted
    rejectRun(new Error("provider failed after admission"))
    await failureReported
    expect(failures).toEqual(["provider failed after admission"])
  })

  test("rejects a completed send that never confirms admission", async () => {
    await expect(waitForMessageAdmission(
      () => Promise.resolve(),
      () => undefined,
    )).rejects.toThrow("message_admission_missing")
  })
})
