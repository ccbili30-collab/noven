import { canonicalDouyinUrl, type VideoCookieSource } from "./schema.ts"

// Three overlapping guards against a config file turning a download into code execution:
// yt-dlp reads %APPDATA%\yt-dlp\config by default, and a --exec line there runs an arbitrary
// command after every download. --ignore-config and --no-config-locations stop it being read;
// --no-exec cancels any post-processor that reached the argv another way.
const hardening = [
  "--ignore-config",
  "--no-config-locations",
  "--no-exec",
  // A share link can resolve to a 合集; without this one paste downloads the whole series.
  "--no-playlist",
  "--no-cache-dir",
  "--no-mtime",
  "--no-progress",
  "--no-colors",
  "--abort-on-error",
  "--retries", "2",
  "--extractor-retries", "1",
  // Without this a stalled CDN socket outlives our own timeout and only the tree-kill stops it.
  "--socket-timeout", "20",
] as const

export interface YtDlpProbe {
  videoId: string
  sourceUrl: string
  title: string
  author: string
  durationSeconds: number
  approximateBytes: number | undefined
}

// A cookie jar the app exported itself always wins: it works when App-Bound Encryption has made
// --cookies-from-browser unusable, and it needs none of the user's real browser profile.
export function cookieArgs(source: VideoCookieSource, cookieFile: string | undefined) {
  if (cookieFile) return ["--cookies", cookieFile]
  if (source === "none" || source === "noven") return []
  return ["--cookies-from-browser", source]
}

// --cookies-from-browser reads the browser profile under %LOCALAPPDATA% and decrypts with
// DPAPI, so the scrubbed env has to be widened — but only for that path, and only when the user
// explicitly chose an external browser.
export function cookieEnvironment(source: VideoCookieSource, cookieFile: string | undefined) {
  if (cookieFile || source === "none" || source === "noven") return {}
  return Object.fromEntries((["LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"] as const)
    .map((name) => [name, process.env[name]])
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"))
}

export function probeArgs(url: string, cookieSource: VideoCookieSource, cookieFile?: string) {
  return [...hardening, ...cookieArgs(cookieSource, cookieFile), "--skip-download", "--no-write-comments", "--dump-single-json", "--", url]
}

export function subtitleArgs(url: string, cookieSource: VideoCookieSource, cookieFile?: string) {
  return [
    ...hardening,
    ...cookieArgs(cookieSource, cookieFile),
    "--skip-download",
    "--write-subs",
    // 抖音 serves machine captions for a large share of videos. They are free and already
    // aligned, so trying them before paying for ASR is both cheaper and more accurate.
    "--write-auto-subs",
    "--sub-langs", "zh-Hans,zh-Hant,zh,zh-CN,en,-live_chat",
    "--sub-format", "vtt/srt/best",
    "--convert-subs", "srt",
    // Fixed stem, relative to cwd. A %(title)s template would let a hostile title steer the path.
    "--output", "subtitle.%(ext)s",
    "--", url,
  ]
}

export function downloadArgs(url: string, maxFileBytes: number, cookieSource: VideoCookieSource, cookieFile?: string) {
  return [
    ...hardening,
    ...cookieArgs(cookieSource, cookieFile),
    // Deterministic final path; nothing partial to reconcile after a tree-kill.
    "--no-part",
    "--max-filesize", String(maxFileBytes),
    "--format", "bv*[height<=720]+ba/b[height<=720]/b",
    "--merge-output-format", "mp4",
    "--output", "source.%(ext)s",
    "--", url,
  ]
}

export function decodeProbeJson(stdout: string): YtDlpProbe {
  const parsed = parseJson(stdout)
  const value = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {}
  const videoId = /^\d{6,32}$/u.test(String(value.id ?? "")) ? String(value.id) : String(value.webpage_url ?? "").match(/\/video\/(\d{6,32})/u)?.[1]
  if (!videoId) throw new Error("video_invalid: 无法从这条链接确定抖音视频 id。")
  const duration = Number(value.duration)
  const approximate = Number(value.filesize_approx ?? value.filesize)
  return {
    videoId,
    sourceUrl: canonicalDouyinUrl(videoId),
    title: typeof value.title === "string" ? value.title.trim() : "",
    author: [value.uploader, value.channel, value.creator].map((entry) => typeof entry === "string" ? entry.trim() : "").find((entry) => entry !== "") ?? "",
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    approximateBytes: Number.isFinite(approximate) && approximate > 0 ? approximate : undefined,
  }
}

export function classifyYtDlpFailure(stderr: string) {
  const text = stderr.toLowerCase()
  if (text.includes("sign in") || text.includes("log in") || text.includes("login required") || text.includes("private video")
    || text.includes("cookies") || text.includes("captcha") || text.includes("verification")
    || text.includes("http error 401") || text.includes("http error 403")) {
    return new Error("video_auth: 抖音要求登录态才能读取这条视频。请在设置 → 视频与转写里把「浏览器 Cookie 来源」改为 Edge 或 Firefox，先在该浏览器中登录抖音，然后重试。")
  }
  if (text.includes("video unavailable") || text.includes("removed") || text.includes("does not exist")
    || text.includes("unsupported url") || text.includes("no video formats")) {
    return new Error("video_invalid: 这条视频不存在、已被删除，或链接不是可解析的抖音视频。")
  }
  if (text.includes("timed out") || text.includes("timeout") || text.includes("connection")
    || text.includes("temporary failure") || text.includes("unable to download")) {
    return new Error("video_network: 无法从抖音取得这条视频。")
  }
  return new Error(`video_network: yt-dlp 未能读取这条视频。${stderr.trim().slice(-600)}`)
}

function parseJson(input: string) {
  try {
    return JSON.parse(input.trim()) as unknown
  } catch {
    throw new Error("video_network: yt-dlp 返回的视频信息无法解析。")
  }
}
