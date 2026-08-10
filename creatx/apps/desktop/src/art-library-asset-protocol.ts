type ArtOriginal = { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; bytes: Uint8Array }

export class ArtLibraryAssetProtocol {
  constructor(private readonly library: { readOriginal(id: string): Promise<ArtOriginal> }) {}

  async handle(request: Request) {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
      if (request.method !== "GET" || url.search || url.hash || url.username || url.password || url.port) return notFound()
      if (url.hostname !== "item" || segments.length !== 2 || !/^art_[0-9a-f]{16}$/u.test(segments[0]!) || segments[1] !== "original") return notFound()
      const original = await this.library.readOriginal(segments[0]!)
      return new Response(Uint8Array.from(original.bytes).buffer, {
        headers: {
          "Content-Type": original.mediaType,
          "Content-Security-Policy": "default-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      })
    } catch {
      return notFound()
    }
  }
}

function notFound() {
  return new Response("Not found", { status: 404 })
}
