export interface ProcessingViewport {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export class ProcessingScrollController {
  private followingLatest = true

  scrolled(viewport: ProcessingViewport) {
    this.followingLatest = this.isAtLatest(viewport)
  }

  contentCommitted(viewport: ProcessingViewport, active: boolean) {
    if (!active || !this.followingLatest) return
    viewport.scrollTop = viewport.scrollHeight
  }

  opened(viewport: ProcessingViewport, active: boolean) {
    if (!active) return
    this.followingLatest = true
    viewport.scrollTop = viewport.scrollHeight
  }

  private isAtLatest(viewport: ProcessingViewport) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 8
  }
}
