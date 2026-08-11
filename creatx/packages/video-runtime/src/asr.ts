import type { TranscriptCue } from "./subtitles.ts"

export interface TranscriptionConnection {
  baseUrl: string
  model: string
  apiKey?: string
  language?: string
}

export interface TranscriptionResult {
  cues: TranscriptCue[]
  language: string | undefined
}

export type TranscriptionFetch = (url: string, init: RequestInit) => Promise<Response>

const maximumErrorBytes = 64 * 1024

export async function transcribeAudio(audio: Uint8Array, connection: TranscriptionConnection, options: { timeoutMs: number; signal?: AbortSignal; fetch?: TranscriptionFetch }): Promise<TranscriptionResult> {
  const first = await postTranscription(audio, connection, "verbose_json", options)
  // Not every OpenAI-compatible server implements verbose_json; some reject the parameter
  // outright. One narrow retry keeps those endpoints usable instead of failing the analysis.
  const response = first.ok || !first.body.toLowerCase().includes("response_format")
    ? first
    : await postTranscription(audio, connection, undefined, options)
  if (!response.ok) throw new Error(`video_transcription: 转写服务返回 HTTP ${response.status}。${safeTranscriptionError(response.body)}`)
  return decodeTranscription(response.body)
}

export function decodeTranscription(body: string): TranscriptionResult {
  const parsed = tryParseJson(body)
  if (parsed === undefined) {
    const text = body.trim()
    return { cues: text ? [{ atSeconds: 0, text }] : [], language: undefined }
  }
  const value = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {}
  const language = typeof value.language === "string" && value.language.trim() ? value.language.trim() : undefined
  const segments = Array.isArray(value.segments) ? value.segments : []
  const cues = segments.map((segment) => {
    const entry = typeof segment === "object" && segment !== null ? segment as Record<string, unknown> : {}
    const text = typeof entry.text === "string" ? entry.text.trim() : ""
    const start = Number(entry.start)
    return text ? { atSeconds: Number.isFinite(start) && start > 0 ? start : 0, text } : undefined
  }).filter((cue): cue is TranscriptCue => cue !== undefined)
  if (cues.length) return { cues, language }
  const whole = typeof value.text === "string" ? value.text.trim() : ""
  return { cues: whole ? [{ atSeconds: 0, text: whole }] : [], language }
}

// Provider error bodies routinely echo the request, including the Authorization header.
export function safeTranscriptionError(body: string) {
  return body.replace(/sk-[A-Za-z0-9_-]+/gu, "[redacted]").replace(/\s+/gu, " ").trim().slice(0, 500)
}

async function postTranscription(audio: Uint8Array, connection: TranscriptionConnection, responseFormat: string | undefined, options: { timeoutMs: number; signal?: AbortSignal; fetch?: TranscriptionFetch }) {
  const form = new FormData()
  form.append("file", new Blob([audio as unknown as BlobPart], { type: "audio/mpeg" }), "audio.mp3")
  form.append("model", connection.model)
  if (connection.language) form.append("language", connection.language)
  if (responseFormat) form.append("response_format", responseFormat)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`video_transcription: 转写请求超过 ${options.timeoutMs}ms 未返回。`)), options.timeoutMs)
  const abort = () => controller.abort(options.signal?.reason ?? new Error("video_cancelled: 已取消。"))
  options.signal?.addEventListener("abort", abort, { once: true })
  // Must be the ambient fetch, not undici's. In the Electron main process FormData and Blob are
  // Chromium's implementations; undici.fetch does not recognize them as its own, serializes the
  // multipart body wrongly, and the endpoint rejects it with a bare "parameter is invalid" 400 —
  // identical audio and parameters succeed through the ambient fetch. Chromium's fetch also
  // follows the system proxy, which is what the undici proxy dispatcher was there for.
  const request = options.fetch ?? fetch
  const response = await request(`${connection.baseUrl.replace(/\/$/u, "")}/audio/transcriptions`, {
    method: "POST",
    body: form,
    signal: controller.signal,
    headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {},
  }).catch((error) => {
    if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error(String(controller.signal.reason))
    throw new Error(`video_transcription: 无法连接转写服务：${error instanceof Error ? error.message : String(error)}`)
  }).finally(() => {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
  })
  return { ok: response.ok, status: response.status, body: await readBoundedText(response) }
}

async function readBoundedText(response: Response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const state = { total: 0 }
  while (true) {
    const next = await reader.read()
    if (next.done) break
    state.total += next.value.byteLength
    // A successful transcript is small; anything past this is a misconfigured endpoint
    // streaming something else, and buffering it would be the failure.
    if (state.total > maximumErrorBytes * 64) {
      await reader.cancel().catch(() => undefined)
      throw new Error("video_transcription: 转写服务返回内容过大。")
    }
    chunks.push(next.value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function tryParseJson(input: string) {
  try {
    return JSON.parse(input) as unknown
  } catch {
    return undefined
  }
}
