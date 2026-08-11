import { BrowserWindow, session } from "electron"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { formatCookieJar } from "@creatx/video-runtime"

// 抖音 refuses anonymous extraction — yt-dlp reports "Fresh cookies (not necessarily logged in)
// are needed" — and --cookies-from-browser cannot read a Chromium 127+ profile on Windows
// because App-Bound Encryption defeats DPAPI (yt-dlp issue 10927). 诺文 is itself a Chromium, so
// it visits 抖音 in a partition of its own, lets the ordinary anti-bot cookies be issued, and
// exports them as a Netscape jar for yt-dlp.
//
// The partition is separate from the app session on purpose: 抖音 must never see, and must never
// be able to set, anything belonging to the rest of the app.

const partition = "persist:noven-douyin"
const homepage = "https://www.douyin.com/"
// A real Chrome UA. The default Electron UA advertises "Electron/…" and is trivially filtered.
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
// The anti-bot cookies 抖音 actually gates extraction on.
const requiredCookies = ["ttwid", "__ac_nonce", "msToken", "odin_tt"]

export class DouyinCookieProvider {
  private pending: Promise<string | undefined> | undefined

  constructor(private readonly options: { root: string; ttlMs?: number; loadTimeoutMs?: number }) {}

  // Returns a jar path, or undefined when 抖音 issued nothing usable — the caller then runs
  // anonymously and reports the resulting auth failure rather than pretending cookies exist.
  async cookieFile(signal?: AbortSignal) {
    const path = join(this.options.root, "douyin-cookies.txt")
    const age = await stat(path).then((entry) => Date.now() - entry.mtimeMs, () => Number.POSITIVE_INFINITY)
    if (age < (this.options.ttlMs ?? 30 * 60 * 1_000)) return path
    // One acquisition at a time: concurrent analyses would each open a window and race the file.
    this.pending = this.pending ?? this.acquire(path, signal).finally(() => { this.pending = undefined })
    return await this.pending
  }

  async invalidate() {
    await rm(join(this.options.root, "douyin-cookies.txt"), { force: true }).catch(() => undefined)
  }

  async dispose() {
    await session.fromPartition(partition).clearStorageData().catch(() => undefined)
  }

  private async acquire(path: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    await mkdir(this.options.root, { recursive: true })
    const store = session.fromPartition(partition)
    store.setUserAgent(userAgent)
    const window = new BrowserWindow({
      show: false,
      width: 1_280,
      height: 800,
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: true, images: false },
    })
    const abort = () => window.destroy()
    signal?.addEventListener("abort", abort, { once: true })
    try {
      await window.loadURL(homepage, { userAgent }).catch(() => undefined)
      // The cookies are set by script after load, so poll briefly instead of trusting did-finish-load.
      const deadline = Date.now() + (this.options.loadTimeoutMs ?? 20_000)
      while (Date.now() < deadline) {
        const cookies = await store.cookies.get({ domain: ".douyin.com" }).catch(() => [])
        if (cookies.some((cookie) => requiredCookies.includes(cookie.name))) return await this.write(path, cookies)
        if (window.isDestroyed()) break
        await new Promise((done) => setTimeout(done, 500))
      }
      const settled = await store.cookies.get({ domain: ".douyin.com" }).catch(() => [])
      return settled.length ? await this.write(path, settled) : undefined
    } finally {
      signal?.removeEventListener("abort", abort)
      if (!window.isDestroyed()) window.destroy()
    }
  }

  private async write(path: string, cookies: readonly Electron.Cookie[]) {
    await writeFile(path, formatCookieJar(cookies.map((cookie) => ({
      domain: cookie.domain ?? ".douyin.com",
      path: cookie.path ?? "/",
      secure: cookie.secure === true,
      ...(cookie.expirationDate === undefined ? {} : { expiresAt: cookie.expirationDate }),
      name: cookie.name,
      value: cookie.value,
    }))), { encoding: "utf8", mode: 0o600 })
    return path
  }
}
