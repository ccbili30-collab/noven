import { describe, expect, test } from "bun:test"
import { createCreatXShellExecutor } from "../src/windows-shell.ts"

describe("Windows shell output", () => {
  test("preserves Chinese stdout and stderr as UTF-8", async () => {
    if (process.platform !== "win32") return
    const output = await createCreatXShellExecutor()("Write-Output '中文标准输出'; [Console]::Error.WriteLine('中文错误输出')", process.cwd(), {
      sessionId: "windows-shell-test",
      agentId: "test-agent",
      iteration: 1,
    })

    expect(output).toContain("中文标准输出")
    expect(output).toContain("中文错误输出")
    expect(output).not.toContain("�")
  })
})
