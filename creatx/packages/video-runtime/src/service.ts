import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { transcribeAudio, type TranscriptionConnection, type TranscriptionFetch } from "./asr.ts"
import { runBinary, type RunBinaryResult, type VideoBinaries } from "./binary.ts"
import { audioArgs, frameArgs, parseFrameTimestamps } from "./ffmpeg.ts"
import { decodeGrayPgm, selectDistinctFrames } from "./frames.ts"
import { requirePublicVideoTarget, type ResolveHost } from "./network.ts"
import { VIDEO_LIMITS, decodeVideoManifest, extractDouyinUrl, requireAnalysisId, type VideoAnalysisManifest, type VideoCookieSource, type VideoFrameRecord, type VideoTranscriptAbsent } from "./schema.ts"
import { formatTranscript, parseSubtitleCues, type TranscriptCue } from "./subtitles.ts"
import { classifyYtDlpFailure, cookieEnvironment, decodeProbeJson, downloadArgs, probeArgs, subtitleArgs } from "./ytdlp.ts"

export type RunBinaryLike = (binaryPath: string, args: readonly string[], options: { cwd: string; timeoutMs: number; signal?: AbortSignal; env?: Record<string, string> }) => Promise<RunBinaryResult>

export interface VideoAnalysisOptions {
  root: string
  resolveBinaries: () => Promise<VideoBinaries>
  resolveTranscription: () => TranscriptionConnection | undefined
  resolveCookieSource: () => VideoCookieSource
  // Supplied by the desktop app when the cookie source is "noven": it exports a Netscape jar
  // from a Chromium session of its own, because 抖音 refuses anonymous extraction and
  // --cookies-from-browser is unusable under Chromium App-Bound Encryption. Kept as a seam so
  // this package stays free of any Electron dependency.
  resolveCookieFile?: (signal?: AbortSignal) => Promise<string | undefined>
  // Supplied by the desktop app: it loads the 抖音 page in a real Chromium and reads back the
  // platform's own signed detail response, which yt-dlp can no longer obtain. When this returns
  // a source, the yt-dlp probe and download are skipped entirely; ffmpeg still does the rest.
  resolveDirectSource?: (url: string, signal?: AbortSignal) => Promise<DirectVideoSource | undefined>
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  run?: RunBinaryLike
  resolveHost?: ResolveHost
  transcriptionFetch?: TranscriptionFetch
  now?: () => Date
}

export interface DirectVideoSource {
  videoId: string
  sourceUrl: string
  title: string
  author: string
  durationSeconds: number
  // Ordered by preference; each is tried until one yields bytes, because 抖音 hands out several
  // CDN hosts and individual ones expire or refuse.
  playAddrs: string[]
  cookieHeader: string
}

export interface AnalyzeVideoRequest {
  url: string
  transcribe: boolean
  maxFrames: number
}

export interface AnalyzeVideoProgress {
  stage: "probe" | "subtitles" | "download" | "audio" | "transcribe" | "frames" | "publish"
  label: string
}

const stageLabels: Record<AnalyzeVideoProgress["stage"], string> = {
  probe: "读取视频信息",
  subtitles: "尝试获取原生字幕",
  download: "下载视频（最多 720p）",
  audio: "提取音轨",
  transcribe: "转写语音",
  frames: "提取关键画面",
  publish: "保存分析结果",
}

export class VideoAnalysisService {
  private readonly run: RunBinaryLike
  private readonly now: () => Date
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: VideoAnalysisOptions) {
    this.run = options.run ?? runBinary
    this.now = options.now ?? (() => new Date())
  }

  async analyze(request: AnalyzeVideoRequest, context: { signal?: AbortSignal; onProgress?: (progress: AnalyzeVideoProgress) => void }) {
    return await this.serialize(async () => {
      const requestedUrl = extractDouyinUrl(request.url)
      await requirePublicVideoTarget(requestedUrl, this.options.resolveHost)
      const binaries = await this.options.resolveBinaries()
      const cookieSource = this.options.resolveCookieSource()
      const cookieFile = cookieSource === "noven" ? await this.options.resolveCookieFile?.(context.signal) : undefined
      const environment = cookieEnvironment(cookieSource, cookieFile)
      // yt-dlp.exe unpacks itself into TEMP, which is pointed at this directory, so it has to
      // exist before the first spawn.
      const jobDirectory = join(this.options.root, ".jobs", randomUUID())
      await mkdir(jobDirectory, { recursive: true })
      const report = (stage: AnalyzeVideoProgress["stage"]) => context.onProgress?.({ stage, label: stageLabels[stage] })
      const execute = async (binary: string, args: readonly string[], timeoutMs: number) => await this.run(binary, args, { cwd: jobDirectory, timeoutMs, ...(context.signal ? { signal: context.signal } : {}), env: environment })

      try {
        report("probe")
        const direct = await this.options.resolveDirectSource?.(requestedUrl, context.signal)
        const probe = direct
          ? { videoId: direct.videoId, sourceUrl: direct.sourceUrl, title: direct.title, author: direct.author, durationSeconds: direct.durationSeconds, approximateBytes: undefined }
          : decodeProbeJson(await this.probeWithYtDlp(binaries, requestedUrl, cookieSource, cookieFile, execute))
        if (probe.durationSeconds > VIDEO_LIMITS.maxDurationSeconds) throw new Error(`video_invalid: 这条视频时长 ${Math.round(probe.durationSeconds)} 秒，超过 ${VIDEO_LIMITS.maxDurationSeconds} 秒上限。`)
        if (probe.approximateBytes !== undefined && probe.approximateBytes > VIDEO_LIMITS.maxSourceBytes) throw new Error("video_invalid: 这条视频体积超过上限。")

        report("subtitles")
        // yt-dlp cannot reach 抖音 at all, so asking it for captions there only wastes a spawn.
        const native = direct ? [] : await this.readNativeSubtitles(jobDirectory, binaries, requestedUrl, cookieSource, cookieFile, execute)

        report("download")
        const sourceFile = direct
          ? await this.downloadDirect(direct, jobDirectory, context.signal)
          : await this.downloadWithYtDlp(binaries, requestedUrl, cookieSource, cookieFile, jobDirectory, execute)
        const sourceBytes = (await stat(join(jobDirectory, sourceFile))).size
        if (sourceBytes > VIDEO_LIMITS.maxSourceBytes) throw new Error("video_invalid: 下载到的视频体积超过上限。")

        const spoken = native.length
          ? { cues: native, source: "native-subtitles" as const, language: undefined as string | undefined, model: undefined as string | undefined, absent: undefined }
          : await this.transcribe(request.transcribe, jobDirectory, binaries, sourceFile, probe.durationSeconds, execute, context.signal, report)

        report("frames")
        const frames = await this.extractFrames(jobDirectory, binaries, sourceFile, probe.durationSeconds, request.maxFrames, execute)

        report("publish")
        const analysisId = `video_${createHash("sha256").update(probe.sourceUrl).digest("hex").slice(0, 16)}`
        const transcriptText = spoken.cues.length ? formatTranscript(spoken.cues).slice(0, VIDEO_LIMITS.maxTranscriptCharacters) : undefined
        const manifest = await this.publish({
          schemaVersion: 1,
          analysisId,
          platform: "douyin",
          sourceUrl: probe.sourceUrl,
          requestedUrl,
          analyzedAt: this.now().toISOString(),
          title: probe.title,
          author: probe.author,
          durationSeconds: probe.durationSeconds,
          transcript: transcriptText === undefined
            ? { available: false, reason: spoken.absent ?? "no_speech_detected" }
            : {
              available: true,
              source: spoken.source,
              ...(spoken.language ? { language: spoken.language } : {}),
              ...(spoken.model ? { model: spoken.model } : {}),
              cueCount: spoken.cues.length,
              characters: transcriptText.length,
              fileName: "transcript.txt",
              sha256: createHash("sha256").update(transcriptText).digest("hex"),
            },
          frames: frames.map((frame) => frame.record),
          bytes: frames.reduce((total, frame) => total + frame.bytes.byteLength, 0) + (transcriptText ? Buffer.byteLength(transcriptText, "utf8") : 0),
        }, frames, transcriptText)
        await this.prune().catch(() => undefined)
        return manifest
      } finally {
        await rm(jobDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  }

  async readFrames(analysisId: string, frameIndexes: readonly number[], modelSupportsImages: boolean) {
    if (!modelSupportsImages) throw new Error("provider_capability: 当前模型不支持图片识读。")
    const manifest = await this.manifest(requireAnalysisId(analysisId))
    const root = join(this.options.root, manifest.analysisId)
    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mediaType: string }> = []
    for (const index of frameIndexes) {
      const record = manifest.frames.find((frame) => frame.index === index)
      if (!record) throw new Error(`video_invalid: 这条分析没有第 ${index} 帧。`)
      const bytes = await readFile(join(root, "frames", record.fileName)).catch(() => {
        throw new Error(`video_persistence: 第 ${index} 帧文件已丢失。`)
      })
      // The manifest is the record of what was actually extracted; serving bytes that no longer
      // match it would silently feed the model something nobody analyzed.
      if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) throw new Error(`video_persistence: 第 ${index} 帧内容已改变。`)
      content.push({ type: "text", text: JSON.stringify({ analysisId: manifest.analysisId, index: record.index, atSeconds: Number(record.atSeconds.toFixed(2)), sourceUrl: manifest.sourceUrl, title: manifest.title }) })
      content.push({ type: "image", data: bytes.toString("base64"), mediaType: "image/jpeg" })
    }
    return content
  }

  async list(limit: number) {
    const manifests = await this.manifests()
    return manifests.slice(0, limit).map((manifest) => ({
      analysisId: manifest.analysisId,
      sourceUrl: manifest.sourceUrl,
      title: manifest.title,
      author: manifest.author,
      analyzedAt: manifest.analyzedAt,
      durationSeconds: manifest.durationSeconds,
      transcriptAvailable: manifest.transcript.available,
      frameCount: manifest.frames.length,
    }))
  }

  async manifest(analysisId: string) {
    const raw = await readFile(join(this.options.root, analysisId, "manifest.json"), "utf8").catch(() => {
      throw new Error(`video_invalid: 找不到分析 ${analysisId}，请先分析这条视频。`)
    })
    return decodeVideoManifest(JSON.parse(raw) as unknown)
  }

  async readTranscript(analysisId: string) {
    const manifest = await this.manifest(analysisId)
    if (!manifest.transcript.available) return undefined
    return await readFile(join(this.options.root, manifest.analysisId, "transcript.txt"), "utf8").catch(() => undefined)
  }

  private async transcribe(requested: boolean, jobDirectory: string, binaries: VideoBinaries, sourceFile: string, durationSeconds: number, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>, signal: AbortSignal | undefined, report: (stage: AnalyzeVideoProgress["stage"]) => void) {
    const absent = (reason: VideoTranscriptAbsent["reason"]) => ({ cues: [] as TranscriptCue[], source: "asr" as const, language: undefined, model: undefined, absent: reason })
    if (!requested) return absent("not_requested")
    const connection = this.options.resolveTranscription()
    if (!connection) return absent("transcription_unavailable")

    report("audio")
    const seconds = durationSeconds > 0 ? Math.min(durationSeconds + 1, VIDEO_LIMITS.maxDurationSeconds) : VIDEO_LIMITS.maxDurationSeconds
    const extracted = await execute(binaries.ffmpeg, audioArgs(sourceFile, "audio.mp3", seconds), 180_000)
    if (extracted.code !== 0) throw new Error(`video_binary: ffmpeg 提取音轨失败。${extracted.stderr.trim().slice(-400)}`)
    const audio = await readFile(join(jobDirectory, "audio.mp3")).catch(() => undefined)
    // "-map 0:a:0?" succeeds without producing a file when the video has no audio track at all.
    if (!audio || audio.byteLength === 0) return absent("no_audio_stream")
    if (audio.byteLength > VIDEO_LIMITS.maxAudioBytes) throw new Error("video_transcription: 音轨体积超过转写上限。")

    report("transcribe")
    const options = { timeoutMs: 300_000, ...(signal ? { signal } : {}), ...(this.options.transcriptionFetch ? { fetch: this.options.transcriptionFetch } : {}) }
    const whole = await transcribeAudio(audio, connection, options)
    // SenseVoice and TeleSpeech return one block of text with no segments, so a long video would
    // become an unanchored wall the model cannot line up against the extracted frames. Slicing
    // the audio and stamping each slice is what restores "what was said around minute N".
    const cues = whole.cues.length === 1 && durationSeconds > VIDEO_LIMITS.chunkSeconds * 1.5
      ? await this.transcribeInChunks(jobDirectory, binaries, sourceFile, durationSeconds, connection, options, execute)
      : whole.cues
    if (!cues.length) return absent("no_speech_detected")
    return { cues, source: "asr" as const, language: whole.language ?? connection.language, model: connection.model, absent: undefined }
  }

  private async transcribeInChunks(jobDirectory: string, binaries: VideoBinaries, sourceFile: string, durationSeconds: number, connection: TranscriptionConnection, options: { timeoutMs: number; signal?: AbortSignal; fetch?: TranscriptionFetch }, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>) {
    const slices = Math.min(Math.ceil(durationSeconds / VIDEO_LIMITS.chunkSeconds), VIDEO_LIMITS.maxChunks)
    const sliced = await execute(binaries.ffmpeg, [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-i", sourceFile, "-vn", "-map", "0:a:0?", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
      "-f", "segment", "-segment_time", String(VIDEO_LIMITS.chunkSeconds), "-reset_timestamps", "1", "chunk-%04d.mp3",
    ], 300_000)
    if (sliced.code !== 0) throw new Error(`video_binary: ffmpeg 切分音轨失败。${sliced.stderr.trim().slice(-300)}`)
    const names = (await readdir(jobDirectory)).filter((name) => /^chunk-\d{4}\.mp3$/u.test(name)).sort().slice(0, slices)
    const transcribed = []
    for (const [index, name] of names.entries()) {
      options.signal?.throwIfAborted()
      const bytes = await readFile(join(jobDirectory, name))
      if (bytes.byteLength < 2_000) continue
      const result = await transcribeAudio(bytes, connection, options)
      const text = result.cues.map((cue) => cue.text).join(" ").trim()
      if (text) transcribed.push({ atSeconds: index * VIDEO_LIMITS.chunkSeconds, text })
    }
    return transcribed
  }

  private async probeWithYtDlp(binaries: VideoBinaries, url: string, cookieSource: VideoCookieSource, cookieFile: string | undefined, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>) {
    const probed = await execute(binaries.ytDlp, probeArgs(url, cookieSource, cookieFile), 60_000)
    if (probed.code !== 0) throw classifyYtDlpFailure(probed.stderr)
    return probed.stdout
  }

  private async downloadWithYtDlp(binaries: VideoBinaries, url: string, cookieSource: VideoCookieSource, cookieFile: string | undefined, jobDirectory: string, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>) {
    const downloaded = await execute(binaries.ytDlp, downloadArgs(url, VIDEO_LIMITS.maxSourceBytes, cookieSource, cookieFile), 300_000)
    if (downloaded.code !== 0) throw classifyYtDlpFailure(downloaded.stderr)
    const found = await this.findJobFile(jobDirectory, /^source\./u)
    if (!found) throw new Error("video_network: yt-dlp 没有产出可用的视频文件。")
    return found
  }

  // 抖音 hands out several CDN hosts for the same file and individual ones expire or refuse, so
  // each is tried in turn before the whole download is called a failure.
  private async downloadDirect(source: DirectVideoSource, jobDirectory: string, signal?: AbortSignal) {
    const request = this.options.fetch ?? (async (url: string, init: RequestInit) => {
      const undici = await import("undici")
      return await undici.fetch(url, { ...init, dispatcher: new undici.EnvHttpProxyAgent() } as Parameters<typeof undici.fetch>[1]) as unknown as Response
    })
    const failures: string[] = []
    for (const address of source.playAddrs.slice(0, 6)) {
      signal?.throwIfAborted()
      const response = await request(address, {
        method: "GET",
        redirect: "follow",
        ...(signal ? { signal } : {}),
        headers: {
          // 抖音's CDN checks both: the cookies its own page was issued, and a Referer showing
          // the request belongs to that page.
          Cookie: source.cookieHeader,
          Referer: source.sourceUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
          Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
        },
      }).catch((error: unknown) => {
        failures.push(`${new URL(address).hostname}: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      })
      if (!response) continue
      if (!response.ok || !response.body) {
        failures.push(`${new URL(address).hostname}: HTTP ${response.status}`)
        await response.body?.cancel().catch(() => undefined)
        continue
      }
      const declared = Number(response.headers.get("content-length"))
      if (Number.isFinite(declared) && declared > VIDEO_LIMITS.maxSourceBytes) throw new Error("video_invalid: 这条视频体积超过上限。")
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      const state = { total: 0 }
      while (true) {
        const next = await reader.read()
        if (next.done) break
        state.total += next.value.byteLength
        if (state.total > VIDEO_LIMITS.maxSourceBytes) {
          await reader.cancel().catch(() => undefined)
          throw new Error("video_invalid: 这条视频体积超过上限。")
        }
        chunks.push(next.value)
      }
      if (state.total < 1_000) {
        failures.push(`${new URL(address).hostname}: 只返回了 ${state.total} 字节`)
        continue
      }
      await writeFile(join(jobDirectory, "source.mp4"), Buffer.concat(chunks))
      return "source.mp4"
    }
    throw new Error(`video_network: 无法从抖音取得视频字节。${failures.slice(0, 3).join(" | ")}`)
  }

  private async readNativeSubtitles(jobDirectory: string, binaries: VideoBinaries, url: string, cookieSource: VideoCookieSource, cookieFile: string | undefined, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>) {
    // Missing captions are the normal case on 抖音, not a failure — fall through to ASR.
    const attempted = await execute(binaries.ytDlp, subtitleArgs(url, cookieSource, cookieFile), 60_000).catch(() => undefined)
    if (!attempted || attempted.code !== 0) return []
    const file = await this.findJobFile(jobDirectory, /^subtitle\..*\.(srt|vtt)$/u)
    if (!file) return []
    const text = await readFile(join(jobDirectory, file), "utf8").catch(() => "")
    const cues = parseSubtitleCues(text)
    // A one-line caption file is usually a placeholder such as the uploader's handle.
    return cues.length >= 3 ? cues : []
  }

  private async extractFrames(jobDirectory: string, binaries: VideoBinaries, sourceFile: string, durationSeconds: number, maxFrames: number, execute: (binary: string, args: readonly string[], timeoutMs: number) => Promise<RunBinaryResult>) {
    // Zero means the caller wants the transcript only; skipping the pass avoids an ffmpeg spawn
    // and a decode of the whole video for output nobody asked for.
    if (!Number.isFinite(maxFrames) || maxFrames < 1) return []
    const seconds = durationSeconds > 0 ? Math.min(durationSeconds + 1, VIDEO_LIMITS.maxDurationSeconds) : VIDEO_LIMITS.maxDurationSeconds
    const requested = Math.min(maxFrames, VIDEO_LIMITS.maxFrames)
    // Ask ffmpeg for more scene-change candidates than we keep, because dedupe will drop the
    // near-identical ones and a tight budget would leave too few distinct shots.
    const extracted = await execute(binaries.ffmpeg, frameArgs(sourceFile, seconds, VIDEO_LIMITS.sceneThreshold, VIDEO_LIMITS.maxFrames), 180_000)
    if (extracted.code !== 0) throw new Error(`video_binary: ffmpeg 提取画面失败。${extracted.stderr.trim().slice(-400)}`)
    const timestamps = parseFrameTimestamps(await readFile(join(jobDirectory, "frames.txt"), "utf8").catch(() => ""))
    const names = (await readdir(jobDirectory)).filter((name) => /^frame-\d{3}\.jpg$/u.test(name)).sort()
    const thumbnails = await Promise.all(names.map(async (name) => decodeGrayPgm(await readFile(join(jobDirectory, name.replace(/^frame-/u, "thumb-").replace(/\.jpg$/u, ".pgm"))))))
    return await Promise.all(selectDistinctFrames(thumbnails, VIDEO_LIMITS.frameDistance, requested).map(async (position, index) => {
      const bytes = await readFile(join(jobDirectory, names[position]!))
      return {
        bytes,
        record: {
          fileName: `frame-${String(index + 1).padStart(3, "0")}.jpg`,
          index: index + 1,
          atSeconds: timestamps[position] ?? 0,
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        } satisfies VideoFrameRecord,
      }
    }))
  }

  private async publish(manifest: VideoAnalysisManifest, frames: readonly { bytes: Buffer; record: VideoFrameRecord }[], transcript: string | undefined) {
    const partialRoot = join(this.options.root, `.partial-${manifest.analysisId}-${process.pid}-${randomUUID().slice(0, 8)}`)
    const finalRoot = join(this.options.root, manifest.analysisId)
    const trashRoot = join(this.options.root, `.trash-${randomUUID().slice(0, 8)}`)
    await mkdir(join(partialRoot, "frames"), { recursive: true })
    try {
      if (transcript !== undefined) await writeFile(join(partialRoot, "transcript.txt"), transcript, { encoding: "utf8", flag: "wx" })
      await Promise.all(frames.map((frame) => writeFile(join(partialRoot, "frames", frame.record.fileName), frame.bytes, { flag: "wx" })))
      await writeFile(join(partialRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      // Two renames instead of rm-then-rename: the published directory is never a half-written
      // tree. A crash between them leaves a .trash-* that the next prune sweeps away.
      const replaced = await rename(finalRoot, trashRoot).then(() => true, () => false)
      await rename(partialRoot, finalRoot)
      if (replaced) await rm(trashRoot, { recursive: true, force: true }).catch(() => undefined)
      return manifest
    } catch (error) {
      await rm(partialRoot, { recursive: true, force: true }).catch(() => undefined)
      throw new Error(`video_persistence: 视频分析结果无法写入本机：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async prune() {
    const entries = await readdir(this.options.root, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.filter((entry) => entry.isDirectory() && (entry.name.startsWith(".trash-") || entry.name.startsWith(".partial-")))
      .map((entry) => rm(join(this.options.root, entry.name), { recursive: true, force: true }).catch(() => undefined)))
    const manifests = await this.manifests()
    const stale = manifests.filter((manifest, index) => index >= VIDEO_LIMITS.maxAnalyses
      || manifests.slice(0, index + 1).reduce((total, entry) => total + entry.bytes, 0) > VIDEO_LIMITS.maxStoredBytes)
    await Promise.all(stale.map((manifest) => rm(join(this.options.root, manifest.analysisId), { recursive: true, force: true }).catch(() => undefined)))
  }

  private async manifests() {
    const entries = await readdir(this.options.root, { withFileTypes: true }).catch(() => [])
    const loaded = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith("video_"))
      .map(async (entry) => await this.manifest(entry.name).catch(() => undefined)))
    return loaded.filter((manifest): manifest is VideoAnalysisManifest => manifest !== undefined)
      .sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt))
  }

  private async findJobFile(jobDirectory: string, pattern: RegExp) {
    return (await readdir(jobDirectory).catch(() => [])).find((name) => pattern.test(name))
  }

  // One analysis at a time: two concurrent runs would each spawn yt-dlp plus ffmpeg and compete
  // for the same publish target, and the disk cost is unbounded.
  private async serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.then(() => undefined, () => undefined)
    return await next
  }
}
