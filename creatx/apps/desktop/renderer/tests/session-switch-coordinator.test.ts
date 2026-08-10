import { describe, expect, test } from "bun:test"
import { SessionSwitchCoordinator } from "../src/session-switch-coordinator"

describe("SessionSwitchCoordinator", () => {
  test("publishes the latest session identity synchronously", () => {
    const coordinator = new SessionSwitchCoordinator()

    const selection = coordinator.begin("session-b", "project-b")

    expect(coordinator.sessionId()).toBe("session-b")
    expect(coordinator.isCurrent(selection)).toBe(true)
  })

  test("drops an obsolete project result and opens the latest project next", async () => {
    const coordinator = new SessionSwitchCoordinator()
    const releases = new Map<string, (value: string) => void>()
    const calls: string[] = []
    const first = coordinator.runLatest(coordinator.begin("session-b", "project-b"), () => new Promise<string>((resolve) => {
      calls.push("project-b")
      releases.set("project-b", resolve)
    }))
    expect(coordinator.hasPendingProjectOpen()).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const secondSelection = coordinator.begin("session-c", "project-c")
    const second = coordinator.runLatest(secondSelection, () => new Promise<string>((resolve) => {
      calls.push("project-c")
      releases.set("project-c", resolve)
    }))

    releases.get("project-b")!("opened-b")
    expect(await first).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(["project-b", "project-c"])
    releases.get("project-c")!("opened-c")
    expect(await second).toBe("opened-c")
    expect(coordinator.hasPendingProjectOpen()).toBe(false)
    expect(coordinator.isCurrent(secondSelection)).toBe(true)
  })

  test("does not start an already obsolete queued project open", async () => {
    const coordinator = new SessionSwitchCoordinator()
    let releaseFirst: (value: string) => void = () => undefined
    const first = coordinator.runLatest(coordinator.begin("session-a", "project-a"), () => new Promise<string>((resolve) => { releaseFirst = resolve }))
    await Promise.resolve()
    let obsoleteStarted = false
    const obsolete = coordinator.runLatest(coordinator.begin("session-b", "project-b"), async () => {
      obsoleteStarted = true
      return "opened-b"
    })
    const latest = coordinator.runLatest(coordinator.begin("session-c", "project-c"), async () => "opened-c")

    releaseFirst("opened-a")

    expect(await first).toBeUndefined()
    expect(await obsolete).toBeUndefined()
    expect(await latest).toBe("opened-c")
    expect(obsoleteStarted).toBe(false)
  })
})
