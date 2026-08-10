import type { AttachmentAuthorizationStore } from "./attachments"

type MessageImage = { mediaType: "image/png" | "image/jpeg"; bytes: Uint8Array }

export class ConversationAttachmentProtocol {
  constructor(
    private readonly pending: AttachmentAuthorizationStore,
    private readonly resolveMessageImage: (sessionId: string, messageId: string, attachmentIndex: number) => Promise<MessageImage>,
  ) {}

  async handle(request: Request) {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
      const image = url.hostname === "pending" && segments.length === 1
        ? await this.pending.preview(segments[0]!)
        : url.hostname === "message" && segments.length === 3
          ? await this.resolveMessageImage(segments[0]!, segments[1]!, Number(segments[2]))
          : undefined
      if (!image || !Number.isSafeInteger(url.hostname === "message" ? Number(segments[2]) : 0)) return notFound()
      return new Response(Uint8Array.from(image.bytes).buffer, {
        headers: {
          "Content-Type": image.mediaType,
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
