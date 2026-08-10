export interface SessionSelection {
  epoch: number
  sessionId: string
  projectId: string
}

export class SessionSwitchCoordinator {
  private epoch = 0
  private selectedSessionId: string | undefined
  private projectQueue: Promise<unknown> = Promise.resolve()
  private pendingProjectOpens = 0

  begin(sessionId: string, projectId: string): SessionSelection {
    this.selectedSessionId = sessionId
    return { epoch: ++this.epoch, sessionId, projectId }
  }

  activate(sessionId?: string) {
    this.selectedSessionId = sessionId
    this.epoch += 1
  }

  sessionId() {
    return this.selectedSessionId
  }

  isCurrent(selection: SessionSelection) {
    return selection.epoch === this.epoch && selection.sessionId === this.selectedSessionId
  }

  hasPendingProjectOpen() {
    return this.pendingProjectOpens > 0
  }

  runLatest<T>(selection: SessionSelection, load: () => Promise<T>): Promise<T | undefined> {
    this.pendingProjectOpens += 1
    const task = this.projectQueue.catch(() => undefined).then(async () => {
      if (!this.isCurrent(selection)) return undefined
      try {
        const result = await load()
        return this.isCurrent(selection) ? result : undefined
      } catch (error) {
        if (this.isCurrent(selection)) throw error
        return undefined
      }
    }).finally(() => { this.pendingProjectOpens -= 1 })
    this.projectQueue = task.then(() => undefined, () => undefined)
    return task
  }
}
