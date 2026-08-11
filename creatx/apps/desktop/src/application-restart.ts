import type { RestartApplicationActivity, RestartApplicationCommand, RestartApplicationResult } from "@creatx/contracts"

export function decideApplicationRestart(command: RestartApplicationCommand, activity: RestartApplicationActivity): RestartApplicationResult {
  if (typeof command.confirmed !== "boolean") throw new Error("command_invalid: restart confirmation must be boolean")
  if (!command.confirmed && (activity.conversation || activity.growth || activity.imageGeneration)) {
    return { state: "confirmation_required", activity }
  }
  return { state: "restarting", activity }
}

export class ApplicationRestartCoordinator {
  private scheduled = false

  constructor(private readonly port: {
    defer(action: () => void): void
    relaunch(): void
    quit(): void
  }) {}

  request(command: RestartApplicationCommand, activity: RestartApplicationActivity) {
    const result = decideApplicationRestart(command, activity)
    if (result.state === "confirmation_required" || this.scheduled) return result
    this.scheduled = true
    this.port.defer(() => {
      this.port.relaunch()
      this.port.quit()
    })
    return result
  }
}
