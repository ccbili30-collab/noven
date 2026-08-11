import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveVideoBinaries, VideoAnalysisService, type VideoCookieSource } from "@creatx/video-runtime"

// Real 抖音, real network, real transcription endpoint. This is the only check that proves
// yt-dlp can still extract 抖音 today; everything else is covered offline by
// scripts/video-pipeline-smoke-test.ts.
//
//   bun run test:video-live -- "<抖音链接或整段分享文案>"
//   bun run test:video-live -- --cookies edge "<链接>"
//   bun run test:video-live -- --no-transcribe "<链接>"
//
// Transcription endpoint comes from the environment (a .env.local is loaded by the npm script):
//   CREATX_TRANSCRIPTION_BASE_URL  e.g. https://api.siliconflow.cn/v1  or  http://192.168.1.50:8000/v1
//   CREATX_TRANSCRIPTION_MODEL     e.g. FunAudioLLM/SenseVoiceSmall
//   CREATX_TRANSCRIPTION_API_KEY   optional; a self-hosted endpoint usually needs none
//   CREATX_TRANSCRIPTION_LANGUAGE  optional, e.g. zh

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const argv = process.argv.slice(2).filter((entry) => entry !== "--")
const cookieSource = (argv.includes("--cookies") ? argv[argv.indexOf("--cookies") + 1] : "none") as VideoCookieSource
const transcribe = !argv.includes("--no-transcribe")
const url = argv.filter((entry, index) => !entry.startsWith("--") && argv[index - 1] !== "--cookies").join(" ").trim()
if (!url) throw new Error('Pass the 抖音 link: bun run test:video-live -- "https://v.douyin.com/…"')

const baseUrl = process.env.CREATX_TRANSCRIPTION_BASE_URL?.trim()
const model = process.env.CREATX_TRANSCRIPTION_MODEL?.trim()
if (transcribe && (!baseUrl || !model)) throw new Error("Set CREATX_TRANSCRIPTION_BASE_URL and CREATX_TRANSCRIPTION_MODEL, or pass --no-transcribe to check download and frames only.")

// 抖音 extraction needs a real Chromium, so the live test runs inside Electron via
// scripts/video-analysis-live-electron.cjs. This entry stays for non-抖音 hosts.
const root = await mkdtemp(join(tmpdir(), "noven-video-live-"))
const started = Date.now()
try {
  const service = new VideoAnalysisService({
    root,
    resolveBinaries: async () => await resolveVideoBinaries([join(workspace, "apps", "desktop", "vendor", "win-x64")]),
    resolveTranscription: () => baseUrl && model
      ? {
        baseUrl,
        model,
        ...(process.env.CREATX_TRANSCRIPTION_API_KEY?.trim() ? { apiKey: process.env.CREATX_TRANSCRIPTION_API_KEY } : {}),
        ...(process.env.CREATX_TRANSCRIPTION_LANGUAGE?.trim() ? { language: process.env.CREATX_TRANSCRIPTION_LANGUAGE } : {}),
      }
      : undefined,
    resolveCookieSource: () => cookieSource,
  })

  const manifest = await service.analyze({ url, transcribe, maxFrames: 12 }, {
    onProgress: (progress) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${progress.stage} — ${progress.label}`),
  })
  const transcript = await service.readTranscript(manifest.analysisId)

  console.log(JSON.stringify({
    status: "VIDEO LIVE PASS",
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    cookieSource,
    sourceUrl: manifest.sourceUrl,
    title: manifest.title,
    author: manifest.author,
    durationSeconds: manifest.durationSeconds,
    transcript: manifest.transcript,
    frames: manifest.frames.map((frame) => ({ index: frame.index, atSeconds: frame.atSeconds, bytes: frame.bytes })),
  }, null, 2))
  // The first lines are what actually tells you whether the model will understand this video.
  if (transcript) console.log(`\n--- transcript (first 30 lines) ---\n${transcript.split("\n").slice(0, 30).join("\n")}`)
} finally {
  await rm(root, { recursive: true, force: true })
}
