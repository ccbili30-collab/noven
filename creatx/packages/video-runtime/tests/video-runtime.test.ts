import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runBinary } from "../src/binary.ts"
import { decodeTranscription, safeTranscriptionError } from "../src/asr.ts"
import { decodeGrayPgm, meanAbsoluteDifference, selectDistinctFrames } from "../src/frames.ts"
import { parseFrameTimestamps } from "../src/ffmpeg.ts"
import { canonicalDouyinUrl, decodeVideoManifest, extractDouyinUrl, formatCookieJar, requireAnalysisId, requireDouyinUrl } from "../src/schema.ts"
import { formatTranscript, parseSubtitleCues } from "../src/subtitles.ts"
import { VideoAnalysisService, type RunBinaryLike } from "../src/service.ts"
import { createVideoTools, videoRuntimeError } from "../src/tools.ts"
import { classifyYtDlpFailure, cookieEnvironment, decodeProbeJson, downloadArgs, probeArgs, subtitleArgs } from "../src/ytdlp.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function testRoot() {
  const base = await mkdtemp(join(tmpdir(), "creatx-video-"))
  roots.push(base)
  return join(base, "video", "v1")
}

function pixels(fill: number) {
  return new Uint8Array(256).fill(fill)
}

function pgm(fill: number) {
  return new Uint8Array([...Buffer.from("P5\n16 16\n255\n", "ascii"), ...pixels(fill)])
}

describe("douyin url", () => {
  test("accepts the whole share sentence users actually paste", () => {
    expect(extractDouyinUrl("7.85 复制打开抖音，看看【某人的作品】画草稿的手法  https://v.douyin.com/iRNBho6/ 复制此链接，打开Dou音搜索"))
      .toBe("https://v.douyin.com/iRNBho6")
  })

  test("canonicalizes every supported host to the same source url", () => {
    expect(requireDouyinUrl("https://www.douyin.com/video/7412345678901234567?modal_id=1")).toBe("https://www.douyin.com/video/7412345678901234567")
    expect(requireDouyinUrl("https://www.iesdouyin.com/share/video/7412345678901234567/")).toBe("https://www.douyin.com/video/7412345678901234567")
    expect(canonicalDouyinUrl("7412345678901234567")).toBe("https://www.douyin.com/video/7412345678901234567")
  })

  test("rejects non-douyin, credentialed and off-port urls", () => {
    expect(() => requireDouyinUrl("https://www.bilibili.com/video/BV1xx")).toThrow("video_invalid")
    expect(() => requireDouyinUrl("https://user:pass@www.douyin.com/video/7412345678901234567")).toThrow("video_invalid")
    expect(() => requireDouyinUrl("https://www.douyin.com:8443/video/7412345678901234567")).toThrow("video_invalid")
    expect(() => requireDouyinUrl("https://evil.example.com/video/7412345678901234567")).toThrow("video_invalid")
    expect(() => extractDouyinUrl("完全没有链接的一段话")).toThrow("video_invalid")
  })
})

describe("yt-dlp contract", () => {
  test("every command carries the config-injection hardening and ends with --", () => {
    const commands = [probeArgs("https://v.douyin.com/abc", "none"), subtitleArgs("https://v.douyin.com/abc", "none"), downloadArgs("https://v.douyin.com/abc", 1_000, "none")]
    commands.forEach((args) => {
      expect(args).toContain("--ignore-config")
      expect(args).toContain("--no-config-locations")
      expect(args).toContain("--no-exec")
      expect(args).toContain("--no-playlist")
      expect(args[args.length - 2]).toBe("--")
      expect(args[args.length - 1]).toBe("https://v.douyin.com/abc")
    })
  })

  test("output templates never interpolate a server-controlled title", () => {
    const templates = [...subtitleArgs("https://v.douyin.com/abc", "none"), ...downloadArgs("https://v.douyin.com/abc", 1_000, "none")]
    expect(templates.some((entry) => entry.includes("%(title)s"))).toBeFalse()
  })

  test("an app-exported cookie jar wins over every browser source", () => {
    expect(probeArgs("https://v.douyin.com/abc", "none")).not.toContain("--cookies-from-browser")
    expect(probeArgs("https://v.douyin.com/abc", "edge")).toContain("edge")
    // "noven" alone adds nothing; the jar the app exported is what reaches yt-dlp.
    expect(probeArgs("https://v.douyin.com/abc", "noven")).not.toContain("--cookies")
    expect(probeArgs("https://v.douyin.com/abc", "noven", "C:/jar.txt")).toContain("--cookies")
    expect(probeArgs("https://v.douyin.com/abc", "edge", "C:/jar.txt")).not.toContain("--cookies-from-browser")
    // The browser-profile environment is only widened for the browser path, never for the jar.
    expect(cookieEnvironment("noven", "C:/jar.txt")).toEqual({})
    expect(cookieEnvironment("none", undefined)).toEqual({})
    expect(Object.keys(cookieEnvironment("edge", undefined)).length).toBeGreaterThan(0)
  })

  test("writes a Netscape jar yt-dlp can read", () => {
    expect(formatCookieJar([
      { domain: ".douyin.com", path: "/", secure: true, expiresAt: 1893456000.5, name: "ttwid", value: "abc" },
      { domain: "www.douyin.com", path: "/x", secure: false, name: "__ac_nonce", value: "def" },
    ])).toBe("# Netscape HTTP Cookie File\n# Generated by 诺文; do not edit.\n"
      + ".douyin.com\tTRUE\t/\tTRUE\t1893456000\tttwid\tabc\n"
      + "www.douyin.com\tFALSE\t/x\tFALSE\t0\t__ac_nonce\tdef\n")
  })

  test("derives the canonical source url from the probe", () => {
    expect(decodeProbeJson(JSON.stringify({ id: "7412345678901234567", title: " 手绘教程 ", uploader: "老王", duration: 91.5 })))
      .toMatchObject({ videoId: "7412345678901234567", sourceUrl: "https://www.douyin.com/video/7412345678901234567", title: "手绘教程", author: "老王", durationSeconds: 91.5 })
    expect(decodeProbeJson(JSON.stringify({ id: "tiktok-style-id", webpage_url: "https://www.douyin.com/video/7412345678901234567" })).videoId).toBe("7412345678901234567")
    expect(() => decodeProbeJson(JSON.stringify({ id: "nope" }))).toThrow("video_invalid")
    expect(() => decodeProbeJson("not json")).toThrow("video_network")
  })

  test("classifies a login wall as video_auth so the cookie hint is reachable", () => {
    expect(classifyYtDlpFailure("ERROR: [Douyin] Fresh cookies (not necessarily logged in) are needed").message).toStartWith("video_auth")
    expect(classifyYtDlpFailure("ERROR: HTTP Error 403: Forbidden").message).toStartWith("video_auth")
    expect(classifyYtDlpFailure("ERROR: Video unavailable").message).toStartWith("video_invalid")
    expect(classifyYtDlpFailure("ERROR: Unable to download webpage: The read operation timed out").message).toStartWith("video_network")
  })
})

describe("subtitles", () => {
  test("parses srt and vtt and collapses rolling auto-caption repeats", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\n先起形\n\n2\n00:00:03,000 --> 00:00:05,000\n先起形\n\n3\n00:01:05,500 --> 00:01:07,000\n<b>再上色</b>\n"
    expect(formatTranscript(parseSubtitleCues(srt))).toBe("[00:01] 先起形\n[01:05] 再上色")
    expect(parseSubtitleCues("WEBVTT\n\n00:00:02.000 --> 00:00:04.000 align:start\n你好\n")).toEqual([{ atSeconds: 2, text: "你好" }])
    expect(parseSubtitleCues("garbage without timings")).toEqual([])
  })
})

describe("frames", () => {
  test("decodes P5 pgm with comments and rejects truncated data", () => {
    const withComment = new Uint8Array([...Buffer.from("P5\n# made by ffmpeg\n16 16\n255\n", "ascii"), ...new Array<number>(256).fill(7)])
    expect(decodeGrayPgm(withComment).length).toBe(256)
    expect(decodeGrayPgm(withComment)[0]).toBe(7)
    expect(() => decodeGrayPgm(new Uint8Array([...Buffer.from("P5\n16 16\n255\n", "ascii"), 1, 2, 3]))).toThrow("video_invalid")
    expect(() => decodeGrayPgm(new Uint8Array(Buffer.from("P6\n16 16\n255\n", "ascii")))).toThrow("video_invalid")
  })

  test("drops near-identical scene frames and honours the budget", () => {
    const thumbnails = [pixels(10), pixels(11), pixels(200), pixels(201), pixels(90)]
    expect(meanAbsoluteDifference(pixels(10), pixels(11))).toBe(1)
    expect(meanAbsoluteDifference(pixels(10), pixels(90))).toBe(80)
    expect(selectDistinctFrames(thumbnails, 6, 10)).toEqual([0, 2, 4])
    expect(selectDistinctFrames(thumbnails, 6, 2)).toEqual([0, 2])
  })

  test("reads ffmpeg metadata timestamps", () => {
    expect(parseFrameTimestamps("frame:0 pts:0 pts_time:0\nframe:1 pts:90000 pts_time:3.5\n")).toEqual([0, 3.5])
  })
})

describe("transcription decoding", () => {
  test("prefers verbose_json segments, falls back to whole text, then to plain body", () => {
    expect(decodeTranscription(JSON.stringify({ language: "zh", segments: [{ start: 0, text: " 先起形 " }, { start: 12.25, text: "再上色" }] })))
      .toEqual({ cues: [{ atSeconds: 0, text: "先起形" }, { atSeconds: 12.25, text: "再上色" }], language: "zh" })
    expect(decodeTranscription(JSON.stringify({ text: "整段文字" }))).toEqual({ cues: [{ atSeconds: 0, text: "整段文字" }], language: undefined })
    expect(decodeTranscription("裸文本响应")).toEqual({ cues: [{ atSeconds: 0, text: "裸文本响应" }], language: undefined })
    expect(decodeTranscription(JSON.stringify({ text: "  " })).cues).toEqual([])
  })

  test("redacts api keys echoed back inside provider error bodies", () => {
    expect(safeTranscriptionError('{"error":"bad key sk-abc123DEF_ghi"}')).toBe('{"error":"bad key [redacted]"}')
  })
})

describe("runBinary", () => {
  test("captures stdout, kills on timeout, and names a missing binary", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "creatx-video-run-"))
    roots.push(cwd)
    const ok = await runBinary(process.execPath, ["-e", "process.stdout.write('hello')"], { cwd, timeoutMs: 30_000 })
    expect(ok.code).toBe(0)
    expect(ok.stdout).toBe("hello")

    await expect(runBinary(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { cwd, timeoutMs: 400 })).rejects.toThrow("video_network")
    await expect(runBinary(join(cwd, "definitely-missing.exe"), [], { cwd, timeoutMs: 5_000 })).rejects.toThrow("video_binary")

    const controller = new AbortController()
    const running = runBinary(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { cwd, timeoutMs: 30_000, signal: controller.signal })
    controller.abort()
    await expect(running).rejects.toThrow("video_cancelled")
  }, 60_000)
})

describe("analysis pipeline", () => {
  function fakeRun(overrides: { subtitle?: string; audio?: boolean; probe?: Record<string, unknown> } = {}): RunBinaryLike {
    return async (binaryPath, args, options) => {
      const ok = { code: 0, stdout: "", stderr: "", truncated: false, durationMs: 1 }
      if (binaryPath.includes("yt-dlp") && args.includes("--dump-single-json")) {
        return { ...ok, stdout: JSON.stringify({ id: "7412345678901234567", title: "起形示范", uploader: "老王", duration: 42, ...overrides.probe }) }
      }
      if (binaryPath.includes("yt-dlp") && args.includes("--write-subs")) {
        if (!overrides.subtitle) return { ...ok, code: 1, stderr: "no subtitles" }
        await writeFile(join(options.cwd, "subtitle.zh-Hans.srt"), overrides.subtitle, "utf8")
        return ok
      }
      if (binaryPath.includes("yt-dlp")) {
        await writeFile(join(options.cwd, "source.mp4"), Buffer.from("fake-mp4"))
        return ok
      }
      if (args.includes("-vn")) {
        if (overrides.audio === false) return ok
        await writeFile(join(options.cwd, "audio.mp3"), Buffer.from("fake-mp3"))
        return ok
      }
      await writeFile(join(options.cwd, "frames.txt"), "frame:0 pts_time:0\nframe:1 pts_time:9.5\nframe:2 pts_time:20\n", "utf8")
      await Promise.all([0, 1, 2].map(async (index) => {
        const name = String(index + 1).padStart(3, "0")
        await writeFile(join(options.cwd, `frame-${name}.jpg`), Buffer.from(`jpeg-${index}`))
        await writeFile(join(options.cwd, `thumb-${name}.pgm`), Buffer.from(pgm(index * 90)))
      }))
      return ok
    }
  }

  function service(root: string, run: RunBinaryLike, transcription?: { body: string }) {
    return new VideoAnalysisService({
      root,
      run,
      resolveBinaries: async () => ({ ytDlp: "C:/vendor/yt-dlp.exe", ffmpeg: "C:/vendor/ffmpeg.exe", root: "C:/vendor" }),
      resolveTranscription: () => transcription ? { baseUrl: "https://api.example.com/v1", model: "sense-voice" } : undefined,
      resolveCookieSource: () => "none",
      resolveHost: async () => ["93.184.216.34"],
      transcriptionFetch: async () => new Response(transcription?.body ?? "{}", { status: 200 }),
      now: () => new Date("2026-08-11T10:00:00.000Z"),
    })
  }

  test("transcribes via asr, dedupes frames, and publishes an addressable manifest", async () => {
    const root = await testRoot()
    const manifest = await service(root, fakeRun(), { body: JSON.stringify({ language: "zh", segments: [{ start: 0, text: "先起形" }, { start: 9.5, text: "再上色" }] }) })
      .analyze({ url: "看看这个 https://v.douyin.com/iRNBho6/ 很有用", transcribe: true, maxFrames: 12 }, {})

    expect(manifest.analysisId).toMatch(/^video_[0-9a-f]{16}$/u)
    expect(manifest.sourceUrl).toBe("https://www.douyin.com/video/7412345678901234567")
    expect(manifest.requestedUrl).toBe("https://v.douyin.com/iRNBho6")
    expect(manifest.transcript).toMatchObject({ available: true, source: "asr", language: "zh", cueCount: 2 })
    expect(manifest.frames.map((frame) => frame.atSeconds)).toEqual([0, 9.5, 20])
    expect(await readFile(join(root, manifest.analysisId, "transcript.txt"), "utf8")).toBe("[00:00] 先起形\n[00:09] 再上色")
    expect(decodeVideoManifest(JSON.parse(await readFile(join(root, manifest.analysisId, "manifest.json"), "utf8")))).toMatchObject({ analysisId: manifest.analysisId })
  })

  test("defaults to transcript only and never spawns the frame pass", async () => {
    const root = await testRoot()
    const commands: string[][] = []
    const run = fakeRun()
    const instance = service(root, async (binaryPath, args, options) => {
      commands.push([...args])
      return await run(binaryPath, args, options)
    }, { body: JSON.stringify({ text: "整段讲解" }) })

    const manifest = await instance.analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 0 }, {})

    expect(manifest.transcript).toMatchObject({ available: true, cueCount: 1 })
    expect(manifest.frames).toEqual([])
    // The scene-detection filtergraph is the expensive part; it must not have run at all.
    expect(commands.some((args) => args.some((entry) => entry.includes("scene")))).toBeFalse()
    expect(createVideoTools(instance)[0]!.inputSchema).toMatchObject({ properties: { maxFrames: { minimum: 0 } } })
  })

  test("native subtitles win over paid transcription", async () => {
    const root = await testRoot()
    const manifest = await service(root, fakeRun({ subtitle: "1\n00:00:01,000 --> 00:00:02,000\n一\n\n2\n00:00:03,000 --> 00:00:04,000\n二\n\n3\n00:00:05,000 --> 00:00:06,000\n三\n" }), { body: "{}" })
      .analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 12 }, {})
    expect(manifest.transcript).toMatchObject({ available: true, source: "native-subtitles", cueCount: 3 })
  })

  test("a silent video keeps its frames and reports no audio instead of inventing speech", async () => {
    const root = await testRoot()
    const manifest = await service(root, fakeRun({ audio: false }), { body: "{}" })
      .analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 12 }, {})
    expect(manifest.transcript).toEqual({ available: false, reason: "no_audio_stream" })
    expect(manifest.frames.length).toBe(3)
  })

  test("without a configured endpoint it says so rather than failing the analysis", async () => {
    const root = await testRoot()
    const manifest = await service(root, fakeRun()).analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 12 }, {})
    expect(manifest.transcript).toEqual({ available: false, reason: "transcription_unavailable" })
  })

  test("reports stage progress and surfaces an auth wall as video_auth", async () => {
    const root = await testRoot()
    const stages: string[] = []
    await service(root, fakeRun(), { body: "{}" }).analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 12 }, { onProgress: (progress) => stages.push(progress.stage) })
    expect(stages).toEqual(["probe", "subtitles", "download", "audio", "transcribe", "frames", "publish"])

    const failing = service(await testRoot(), async () => ({ code: 1, stdout: "", stderr: "ERROR: fresh cookies are needed", truncated: false, durationMs: 1 }))
    await expect(failing.analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: true, maxFrames: 12 }, {})).rejects.toThrow("video_auth")
  })

  test("refuses a douyin host that resolves into the private network", async () => {
    const root = await testRoot()
    const guarded = new VideoAnalysisService({
      root,
      run: fakeRun(),
      resolveBinaries: async () => ({ ytDlp: "C:/vendor/yt-dlp.exe", ffmpeg: "C:/vendor/ffmpeg.exe", root: "C:/vendor" }),
      resolveTranscription: () => undefined,
      resolveCookieSource: () => "none",
      resolveHost: async () => ["127.0.0.1"],
    })
    await expect(guarded.analyze({ url: "https://www.douyin.com/video/7412345678901234567", transcribe: false, maxFrames: 12 }, {})).rejects.toThrow("video_network")
  })
})

describe("tools", () => {
  test("frame reads fail closed on a text-only model and mint no source receipt on failure", async () => {
    const root = await testRoot()
    const receipts: string[] = []
    const instance = new VideoAnalysisService({
      root,
      run: async () => ({ code: 1, stdout: "", stderr: "ERROR: Video unavailable", truncated: false, durationMs: 1 }),
      resolveBinaries: async () => ({ ytDlp: "C:/vendor/yt-dlp.exe", ffmpeg: "C:/vendor/ffmpeg.exe", root: "C:/vendor" }),
      resolveTranscription: () => undefined,
      resolveCookieSource: () => "none",
      resolveHost: async () => ["93.184.216.34"],
    })
    const tools = createVideoTools(instance, { onSourceAnalyzed: (_sessionId, sourceUrl) => receipts.push(sourceUrl) })
    expect(tools.map((tool) => tool.name)).toEqual(["analyze_video", "read_video_frames", "inspect_video_analyses"])
    expect(tools[0]!.approval).toBe("required")
    expect(tools[1]!.approval).toBe("automatic")

    const analyzed = await tools[0]!.execute({ url: "https://www.douyin.com/video/7412345678901234567" }, { sessionId: "s1" })
    expect(analyzed).toMatchObject({ ok: false, error: { code: "video_invalid" } })
    expect(receipts).toEqual([])

    const frames = await tools[1]!.execute({ analysisId: "video_0123456789abcdef", frameIndexes: [1] }, { sessionId: "s1", modelSupportsImages: false })
    expect(frames).toMatchObject({ ok: false, error: { code: "art_library_model" } })
  })

  test("maps every runtime prefix to a distinguishable code", () => {
    expect(videoRuntimeError(new Error("video_auth: x")).code).toBe("video_auth")
    expect(videoRuntimeError(new Error("video_binary: x")).code).toBe("video_binary")
    expect(videoRuntimeError(new Error("video_transcription: x")).code).toBe("video_transcription")
    expect(videoRuntimeError(new Error("video_network: x")).code).toBe("video_network")
    expect(videoRuntimeError(new Error("video_persistence: x")).code).toBe("video_persistence")
    expect(videoRuntimeError(new Error("video_cancelled: x")).code).toBe("cancelled")
    expect(videoRuntimeError(new Error("anything else")).code).toBe("video_invalid")
    expect(() => requireAnalysisId("nope")).toThrow("video_invalid")
  })
})
