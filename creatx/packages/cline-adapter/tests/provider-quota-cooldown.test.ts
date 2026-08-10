import { describe, expect, test } from "bun:test"
import { ProviderQuotaCooldown, providerConnectionKey } from "../src/provider-quota-cooldown"

describe("ProviderQuotaCooldown", () => {
  test("isolates cooldowns by configured Provider connection", async () => {
    const cooldown = new ProviderQuotaCooldown(10_000)
    const blocked = providerConnectionKey({ profileId: "profile-a", providerId: "deepseek", modelId: "deepseek-chat" })
    const available = providerConnectionKey({ profileId: "profile-b", providerId: "deepseek", modelId: "deepseek-chat" })
    cooldown.record(blocked)

    await expect(cooldown.wait(available)).resolves.toBeUndefined()

    const controller = new AbortController()
    const waiting = cooldown.wait(blocked, controller.signal)
    controller.abort(new Error("cancelled by owner"))
    await expect(waiting).rejects.toThrow("cancelled by owner")
  })

  test("expires a connection cooldown without retaining stale state", async () => {
    let now = 1_000
    const cooldown = new ProviderQuotaCooldown(30_000, () => now)
    const key = providerConnectionKey({ providerId: "deepseek", modelId: "deepseek-chat" })
    cooldown.record(key)
    now = 31_000

    await expect(cooldown.wait(key)).resolves.toBeUndefined()
    expect(cooldown.remaining(key)).toBe(0)
  })
})
