import { BrowserWindow, session } from "electron"

// yt-dlp can no longer extract 抖音: its web detail API requires an a_bogus signature and an
// x-secsdk-web-signature computed by 抖音's own JavaScript, and every request without them comes
// back empty with "Fresh cookies (not necessarily logged in) are needed".
//
// 诺文 is a real Chromium, so it does not have to forge anything. It loads the video page, lets
// 抖音's own script issue its own signed request, and reads that response back through the
// DevTools protocol. What comes out is the platform's own answer to its own question.
//
// Ordering matters and was established by experiment: attaching the debugger before the page is
// ready fails with "target closed while handling command". Load first, then attach, enable
// Network, and reload so the signed request happens while we are listening.

const partition = "persist:noven-douyin"
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
const detailPattern = /aweme\/v1\/web\/aweme\/detail/u

export interface DouyinExtraction {
  videoId: string
  sourceUrl: string
  title: string
  author: string
  durationSeconds: number
  playAddrs: string[]
  cookieHeader: string
}

export class DouyinPageExtractor {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: { timeoutMs?: number } = {}) {}

  // One page at a time: two hidden windows racing the same partition would interleave their
  // cookie writes and double the load 抖音 sees from one user.
  async extract(url: string, signal?: AbortSignal): Promise<DouyinExtraction> {
    const next = this.queue.then(() => this.load(url, signal), () => this.load(url, signal))
    this.queue = next.then(() => undefined, () => undefined)
    return await next
  }

  async dispose() {
    await session.fromPartition(partition).clearStorageData().catch(() => undefined)
  }

  private async load(url: string, signal?: AbortSignal): Promise<DouyinExtraction> {
    signal?.throwIfAborted()
    const store = session.fromPartition(partition)
    store.setUserAgent(userAgent)
    const window = new BrowserWindow({
      show: false,
      width: 1_280,
      height: 800,
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, images: false },
    })
    const abort = () => window.destroy()
    signal?.addEventListener("abort", abort, { once: true })
    const found: { detail?: Record<string, unknown> } = {}
    const pending = new Set<string>()
    try {
      await window.loadURL(url, { userAgent }).catch(() => undefined)
      if (window.isDestroyed()) throw new Error("video_cancelled: 已取消。")
      window.webContents.debugger.attach("1.3")
      window.webContents.debugger.on("message", (_event, method, params: { requestId: string; response?: { url: string } }) => {
        if (method === "Network.responseReceived" && detailPattern.test(params.response?.url ?? "")) pending.add(params.requestId)
        if (method !== "Network.loadingFinished" || !pending.has(params.requestId)) return
        pending.delete(params.requestId)
        void window.webContents.debugger.sendCommand("Network.getResponseBody", { requestId: params.requestId })
          .then((body: { body: string; base64Encoded: boolean }) => {
            const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body
            const parsed = JSON.parse(text) as Record<string, unknown>
            const detail = parsed.aweme_detail ?? (Array.isArray(parsed.aweme_details) ? parsed.aweme_details[0] : undefined)
            if (detail && typeof detail === "object") found.detail = detail as Record<string, unknown>
          })
          .catch(() => undefined)
      })
      await window.webContents.debugger.sendCommand("Network.enable")
      window.webContents.reload()

      const deadline = Date.now() + (this.options.timeoutMs ?? 45_000)
      while (Date.now() < deadline && !found.detail) {
        if (window.isDestroyed()) throw new Error("video_cancelled: 已取消。")
        await new Promise((done) => setTimeout(done, 300))
      }
      if (!found.detail) throw new Error("video_network: 抖音没有在页面里返回这条视频的详情，可能是链接失效、被删除或抖音要求验证。")

      const video = asRecord(found.detail.video)
      const playAddrs = urlList(video.play_addr).concat(bitrateAddrs(video)).filter((entry, index, all) => all.indexOf(entry) === index)
      if (!playAddrs.length) throw new Error("video_network: 抖音返回的详情里没有可用的播放地址。")
      const cookies = await store.cookies.get({ domain: ".douyin.com" }).catch(() => [])
      const videoId = String(found.detail.aweme_id ?? "")
      if (!/^\d{6,32}$/u.test(videoId)) throw new Error("video_invalid: 抖音详情里没有可识别的视频 id。")
      return {
        videoId,
        sourceUrl: `https://www.douyin.com/video/${videoId}`,
        title: typeof found.detail.desc === "string" ? found.detail.desc.trim() : "",
        author: typeof asRecord(found.detail.author).nickname === "string" ? String(asRecord(found.detail.author).nickname).trim() : "",
        // 抖音 reports duration in milliseconds.
        durationSeconds: Math.round(Number(video.duration ?? 0) / 1_000) || 0,
        playAddrs,
        cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      }
    } finally {
      signal?.removeEventListener("abort", abort)
      if (!window.isDestroyed()) {
        if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach()
        window.destroy()
      }
    }
  }
}

function bitrateAddrs(video: Record<string, unknown>) {
  // Lower bit rates first: the pipeline only needs enough resolution for scene frames and a
  // clean audio track, and a smaller file is faster and cheaper to move.
  return (Array.isArray(video.bit_rate) ? video.bit_rate : [])
    .map((entry) => asRecord(entry))
    .sort((left, right) => Number(left.bit_rate ?? 0) - Number(right.bit_rate ?? 0))
    .flatMap((entry) => urlList(entry.play_addr))
}

function urlList(input: unknown) {
  const value = asRecord(input).url_list
  return (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === "string" && entry.startsWith("https://"))
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {}
}
