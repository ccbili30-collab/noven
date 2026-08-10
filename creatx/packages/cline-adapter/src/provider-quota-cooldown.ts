export interface ProviderConnectionIdentity {
  profileId?: string
  providerId: string
  modelId: string
}

export class ProviderQuotaCooldown {
  private readonly blockedUntil = new Map<string, number>()

  constructor(
    private readonly durationMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  record(key: string) {
    this.blockedUntil.set(key, this.now() + this.durationMs)
  }

  clear(key: string) {
    this.blockedUntil.delete(key)
  }

  remaining(key: string) {
    const remaining = (this.blockedUntil.get(key) ?? 0) - this.now()
    if (remaining > 0) return remaining
    this.blockedUntil.delete(key)
    return 0
  }

  async wait(key: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const remaining = this.remaining(key)
    if (!remaining) return
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener("abort", abort)
        resolve()
      }
      const abort = () => {
        clearTimeout(timer)
        signal?.removeEventListener("abort", abort)
        reject(signal?.reason)
      }
      const timer = setTimeout(finish, remaining)
      signal?.addEventListener("abort", abort, { once: true })
      if (signal?.aborted) abort()
    })
    await this.wait(key, signal)
  }
}

export function providerConnectionKey(connection: ProviderConnectionIdentity) {
  return connection.profileId?.trim()
    ? `profile:${connection.profileId.trim()}`
    : `provider:${connection.providerId.trim()}\u0000model:${connection.modelId.trim()}`
}
