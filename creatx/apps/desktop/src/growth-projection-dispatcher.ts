export class GrowthProjectionDispatcher<T extends { goalId: string }> {
  private readonly queues = new Map<string, { latest: T; dirty: boolean; promise: Promise<void> }>()
  private readonly project: (goal: T) => Promise<void>
  private readonly onError: (error: unknown) => void

  constructor(
    project: (goal: T) => Promise<void>,
    onError: (error: unknown) => void,
  ) {
    this.project = project
    this.onError = onError
  }

  enqueue(goal: T) {
    const current = this.queues.get(goal.goalId)
    if (current) {
      current.latest = goal
      current.dirty = true
      return
    }

    const queue = { latest: goal, dirty: true, promise: Promise.resolve() }
    queue.promise = this.drain(queue).finally(() => {
      if (this.queues.get(goal.goalId) === queue) this.queues.delete(goal.goalId)
    })
    this.queues.set(goal.goalId, queue)
  }

  settle() {
    return Promise.allSettled([...this.queues.values()].map((queue) => queue.promise))
  }

  clear() {
    this.queues.clear()
  }

  private async drain(queue: { latest: T; dirty: boolean }) {
    while (queue.dirty) {
      queue.dirty = false
      try {
        await this.project(queue.latest)
      } catch (error) {
        this.onError(error)
      }
    }
  }
}
