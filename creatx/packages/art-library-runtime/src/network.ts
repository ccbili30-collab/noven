import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { isPublicAddress } from "@creatx/contracts"

export { isPublicAddress }

const redirectStatuses = new Set([301, 302, 303, 307, 308])

export interface ArtNetworkOptions {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  resolveHost?: (hostname: string) => Promise<string[]>
  requestTimeoutMs?: number
}

export interface ArtNetworkResponse {
  bytes: Uint8Array
  contentType?: string
  finalUrl: string
}

export class ArtNetworkClient {
  private readonly request: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined
  private readonly resolveHost: (hostname: string) => Promise<string[]>
  private readonly requestTimeoutMs: number

  constructor(options: ArtNetworkOptions = {}) {
    this.request = options.fetch
    this.resolveHost = options.resolveHost ?? (async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address))
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000
  }

  async read(url: string, maxBytes: number, signal?: AbortSignal): Promise<ArtNetworkResponse> {
    let current = requirePublicHttpUrl(url)
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const addresses = await this.requirePublicTarget(current)
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(new Error("art_network_timeout: request timed out")), this.requestTimeoutMs)
      try {
        const transport = await this.open(current, addresses, {
          redirect: "manual",
          signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CreatX/0.1",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5",
          },
        })
        try {
          const response = transport.response
          if (redirectStatuses.has(response.status)) {
            const location = response.headers.get("location")
            if (!location) throw new Error("art_network_protocol: redirect has no location")
            await response.body?.cancel()
            current = requirePublicHttpUrl(new URL(location, current).href)
            continue
          }
          if (!response.ok) throw new Error(`art_network_http: HTTP ${response.status}`)
          const declaredLength = Number(response.headers.get("content-length"))
          if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("art_network_too_large: response exceeds limit")
          const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
          return {
            bytes: await readLimitedBody(response, maxBytes, signal),
            ...(contentType ? { contentType } : {}),
            finalUrl: current.href,
          }
        } finally {
          await transport.close()
        }
      } finally {
        clearTimeout(timer)
      }
    }
    throw new Error("art_network_redirect: too many redirects")
  }

  private async requirePublicTarget(url: URL) {
    const addresses = isIP(url.hostname) ? [url.hostname] : await this.resolveHost(url.hostname)
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) throw new Error("art_network_private_target: target must resolve only to public addresses")
    return addresses
  }

  private async open(url: URL, addresses: string[], init: RequestInit) {
    if (this.request) return { response: await this.request(url, init), close: async () => undefined }
    const { Agent, fetch } = await import("undici")
    const address = addresses.find((candidate) => isIP(candidate) === 4) ?? addresses[0]!
    const dispatcher = new Agent({ connect: { lookup: (_hostname, _options, callback) => callback(null, address, isIP(address)) } })
    try {
      const requestInit = { ...init, dispatcher } as Parameters<typeof fetch>[1]
      const response = await fetch(url, requestInit)
      return { response: response as unknown as Response, close: () => closeDispatcher(dispatcher) }
    } catch (error) {
      await closeDispatcher(dispatcher)
      throw error
    }
  }
}

async function closeDispatcher(input: unknown) {
  const dispatcher = input as { close?: () => Promise<void> | void; destroy?: () => Promise<void> | void }
  if (typeof dispatcher.close === "function") return dispatcher.close()
  if (typeof dispatcher.destroy === "function") return dispatcher.destroy()
}

export function requirePublicHttpUrl(input: string) {
  const url = new URL(input)
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) throw new Error("art_network_invalid_url: only credential-free HTTP(S) URLs are allowed")
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("art_network_invalid_url: nonstandard ports are not allowed")
  return url
}

async function readLimitedBody(response: Response, maxBytes: number, signal?: AbortSignal) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) throw new Error("art_network_too_large: response exceeds limit")
      chunks.push(next.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  })
  return bytes
}
