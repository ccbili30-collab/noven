import type { CreatXEvent } from "@creatx/contracts"

type TimelineUpsertEvent = Extract<CreatXEvent, { type: "timeline.upsert" }>

export class TimelineEventDispatcher {
  private readonly pending = new Map<string, Map<string, TimelineUpsertEvent>>()
  private scheduled = false

  constructor(
    private readonly send: (event: TimelineUpsertEvent) => void,
    private readonly schedule: (callback: () => void) => void = (callback) => { setTimeout(callback, 16) },
  ) {}

  enqueue(event: TimelineUpsertEvent) {
    const session = this.pending.get(event.sessionId) ?? new Map<string, TimelineUpsertEvent>()
    session.set(event.item.itemId, event)
    this.pending.set(event.sessionId, session)
    if (this.scheduled) return
    this.scheduled = true
    this.schedule(() => {
      this.scheduled = false
      this.flushAll()
    })
  }

  flushSession(sessionId: string) {
    const session = this.pending.get(sessionId)
    if (!session) return
    this.pending.delete(sessionId)
    session.forEach((event) => this.send(event))
  }

  flushAll() {
    const sessionIds = [...this.pending.keys()]
    sessionIds.forEach((sessionId) => this.flushSession(sessionId))
  }

  clear() {
    this.pending.clear()
  }
}
