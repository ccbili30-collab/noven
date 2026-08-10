export interface ConversationViewport {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export class ConversationScrollController {
  private sessionId: string | undefined
  private followingLatest = false
  private pendingOpenPosition = false

  switchSession(sessionId?: string) {
    if (this.sessionId === sessionId) return
    this.sessionId = sessionId
    this.followingLatest = false
    this.pendingOpenPosition = Boolean(sessionId)
  }

  timelineCommitted(viewport: ConversationViewport, hasItems: boolean) {
    if (!this.sessionId || !hasItems) return false
    if (this.pendingOpenPosition) {
      this.pendingOpenPosition = false
      this.followingLatest = true
      viewport.scrollTop = viewport.scrollHeight
      return false
    }
    if (this.followingLatest) {
      viewport.scrollTop = viewport.scrollHeight
      return false
    }
    this.followingLatest = this.isAtLatest(viewport)
    return !this.followingLatest
  }

  scrolled(viewport: ConversationViewport) {
    this.followingLatest = this.isAtLatest(viewport)
    return !this.followingLatest
  }

  returnToLatest(viewport: ConversationViewport) {
    this.followingLatest = true
    viewport.scrollTop = viewport.scrollHeight
  }

  private isAtLatest(viewport: ConversationViewport) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 8
  }
}
