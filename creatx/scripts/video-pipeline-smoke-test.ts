import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"
import { resolveVideoBinaries, runBinary } from "@creatx/video-runtime"
import { VideoAnalysisService } from "@creatx/video-runtime"

// Offline, repeatable proof that the real vendored ffmpeg drives the real analysis pipeline:
// scene-change extraction, the pixel-aligned PGM thumbnails, dedupe, frames.txt timestamps,
// audio extraction and the OpenAI-compatible transcription round trip.
//
// Simulated here, and only here: yt-dlp's 抖音 extraction (needs the network and a real share
// link — that is scripts/video-analysis-live-test.ts) and the transcription model itself.
// Everything else is the production code path, including runBinary's scrubbed environment.

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const root = await mkdtemp(join(tmpdir(), "noven-video-smoke-"))
const binaries = await resolveVideoBinaries([join(workspace, "apps", "desktop", "vendor", "win-x64")])

// yt-dlp.exe is a PyInstaller onefile that unpacks itself into TEMP. runBinary points TEMP at
// the job directory and strips the rest of the environment, so proving it starts at all is the
// check that the scrubbed environment is survivable.
const version = await runBinary(binaries.ytDlp, ["--version"], { cwd: root, timeoutMs: 60_000 })
if (version.code !== 0 || !/^\d{4}\.\d{2}\.\d{2}/u.test(version.stdout.trim())) {
  throw new Error(`yt-dlp did not start under the scrubbed environment: ${JSON.stringify(version)}`)
}

// Three textured sources cut together, plus a real audio stream. Flat colour sources are a bad
// probe: ffmpeg's scene metric scores a red-to-green cut at essentially zero, while these score
// 0.83 and 0.68 against 0.0003-0.011 for motion inside a shot — which is the separation the
// production threshold of 0.30 relies on.
const fixture = join(root, "fixture.mp4")
const built = await runBinary(binaries.ffmpeg, [
  "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc=s=320x240:d=2:r=10",
  "-f", "lavfi", "-i", "smptebars=s=320x240:d=2:r=10",
  "-f", "lavfi", "-i", "rgbtestsrc=s=320x240:d=2:r=10",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
  "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
  // mpeg4, not libx264: the vendored build is LGPL and x264 is GPL-only. Decoding is what the
  // pipeline exercises, and ffmpeg decodes both.
  "-map", "[v]", "-map", "3:a", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixture,
], { cwd: root, timeoutMs: 120_000 })
if (built.code !== 0) throw new Error(`fixture build failed: ${built.stderr}`)

const transcription = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on("data", (chunk: Buffer) => chunks.push(chunk))
  request.on("end", () => {
    received.url = request.url ?? ""
    received.bytes = Buffer.concat(chunks).byteLength
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ language: "zh", segments: [{ start: 0, text: "先起形" }, { start: 3.5, text: "再上色" }] }))
  })
})
const received = { url: "", bytes: 0 }
await new Promise<void>((done) => transcription.listen(0, "127.0.0.1", done))
const address = transcription.address()
if (typeof address === "string" || !address) throw new Error("transcription stub did not bind")

try {
  const service = new VideoAnalysisService({
    root: join(root, "store"),
    resolveBinaries: async () => binaries,
    // A private-network endpoint over plain HTTP is exactly the self-hosted case the
    // transcription base URL rule allows.
    resolveTranscription: () => ({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "smoke-asr", language: "zh" }),
    resolveCookieSource: () => "none",
    resolveHost: async () => ["93.184.216.34"],
    run: async (binaryPath, args, options) => {
      if (!binaryPath.includes("yt-dlp")) return await runBinary(binaryPath, args, options)
      if (args.includes("--dump-single-json")) return { code: 0, stdout: JSON.stringify({ id: "7412345678901234567", title: "冒烟测试视频", uploader: "诺文", duration: 6 }), stderr: "", truncated: false, durationMs: 1 }
      if (args.includes("--write-subs")) return { code: 1, stdout: "", stderr: "no subtitles", truncated: false, durationMs: 1 }
      await writeFile(join(options.cwd, "source.mp4"), await readFile(fixture))
      return { code: 0, stdout: "", stderr: "", truncated: false, durationMs: 1 }
    },
  })

  const stages: string[] = []
  const manifest = await service.analyze(
    { url: "7.85 复制打开抖音 https://v.douyin.com/iRNBho6/ 复制此链接", transcribe: true, maxFrames: 12 },
    { onProgress: (progress) => stages.push(progress.stage) },
  )

  if (manifest.sourceUrl !== "https://www.douyin.com/video/7412345678901234567") throw new Error(`unexpected canonical source url: ${manifest.sourceUrl}`)
  if (manifest.requestedUrl !== "https://v.douyin.com/iRNBho6") throw new Error(`unexpected requested url: ${manifest.requestedUrl}`)
  if (!manifest.transcript.available || manifest.transcript.source !== "asr" || manifest.transcript.cueCount !== 2) throw new Error(`unexpected transcript: ${JSON.stringify(manifest.transcript)}`)
  // Real scene detection over three hard cuts must find the cuts and dedupe must keep them all.
  if (manifest.frames.length !== 3) throw new Error(`expected 3 distinct scene frames, got ${manifest.frames.length}: ${JSON.stringify(manifest.frames)}`)
  if (!received.url.endsWith("/v1/audio/transcriptions")) throw new Error(`transcription hit the wrong path: ${received.url}`)
  if (received.bytes < 1_000) throw new Error(`transcription received only ${received.bytes} bytes of audio`)

  const transcript = await service.readTranscript(manifest.analysisId)
  if (transcript !== "[00:00] 先起形\n[00:03] 再上色") throw new Error(`unexpected transcript text: ${JSON.stringify(transcript)}`)

  const frames = await service.readFrames(manifest.analysisId, [1, 2, 3], true)
  const images = frames.filter((part) => part.type === "image")
  if (images.length !== 3) throw new Error(`expected 3 image parts, got ${images.length}`)
  // The bytes crossing into the model must be real JPEG, base64-encoded for structured clone.
  if (images.some((part) => part.type !== "image" || !Buffer.from(part.data, "base64").subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))) {
    throw new Error("a returned frame was not a real JPEG")
  }
  await service.readFrames(manifest.analysisId, [1], false).then(
    () => { throw new Error("readFrames must fail closed when the model has no image input") },
    (error: Error) => { if (!error.message.startsWith("provider_capability")) throw error },
  )

  console.log(JSON.stringify({
    status: "VIDEO PIPELINE SMOKE PASS",
    ytDlp: version.stdout.trim(),
    stages,
    frames: manifest.frames.map((frame) => frame.atSeconds),
    audioBytesUploaded: received.bytes,
    transcript,
  }))
} finally {
  transcription.close()
  await rm(root, { recursive: true, force: true })
}
