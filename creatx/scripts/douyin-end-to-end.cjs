// Real end-to-end 抖音 run inside Electron: the page extractor gets the platform's own signed
// detail response, the pipeline downloads those bytes, ffmpeg extracts audio and scene frames,
// and the configured transcription service turns the audio into a timestamped transcript.
//
//   CREATX_E2E_URL=<抖音链接> electron.exe scripts/douyin-end-to-end.cjs <out.json>
//
// Two launch traps, both of which kill the run before a single line of this file executes, with
// no stderr and no output file — so neither is diagnosable from inside:
//
//   1. ELECTRON_RUN_AS_NODE must be UNSET in the child environment. When it is set — and it is
//      set globally on at least one developer machine — electron.exe is plain Node and
//      require("electron") fails with MODULE_NOT_FOUND.
//   2. The 抖音 URL must NOT be a command-line argument. Chromium's command line parser claims a
//      bare URL argument and exits 127 before the main script is loaded. It travels in the
//      environment instead. Any other argument value in the same position is fine.
const { app } = require("electron")
const fs = require("fs")
const path = require("path")

const target = process.env.CREATX_E2E_URL ?? ""
const OUT = process.argv[process.argv.length - 1]
// Frames are opt-in now: a narrated video is understood from its transcript alone, so the run
// that has to pass is the transcript-only one users actually get by default.
const maxFrames = Number(process.env.CREATX_E2E_FRAMES ?? "0")
const report = { status: "FAIL", stages: [], error: "" }
const trace = (message) => process.stdout.write(`[e2e] ${message}\n`)
let done = false
const finish = () => {
  if (done) return
  done = true
  try { fs.writeFileSync(OUT, JSON.stringify(report)) } catch (error) { /* nothing left to do */ }
  trace(`${report.status} ${report.error}`)
  setTimeout(() => app.exit(report.status === "PASS" ? 0 : 1), 200)
}
setTimeout(finish, 900_000)
// Without this a throw inside the extractor's debugger callbacks kills the run silently.
process.on("uncaughtException", (error) => { report.error = `uncaught: ${error && error.message}`; finish() })
// The page extractor's hidden window is the only window this harness ever opens, so closing it
// fires Electron's default window-all-closed handler and quits the app — mid-download, exit 0,
// no result. The real app never hits this because its main window outlives every analysis.
app.on("window-all-closed", () => undefined)

app.whenReady().then(async () => {
  try {
    trace(`ready, target=${target} maxFrames=${maxFrames}`)
    const workspace = path.resolve(__dirname, "..")
    const bridge = require("node:url").pathToFileURL(path.join(workspace, "out", "main", "douyin-bridge.js")).href
    const { DouyinPageExtractor, VideoAnalysisService, resolveVideoBinaries } = await import(bridge)
    const root = path.join(app.getPath("temp"), `noven-e2e-${Date.now()}`)
    const pages = new DouyinPageExtractor({})
    const service = new VideoAnalysisService({
      root,
      // CREATX_VIDEO_BINARY_ROOT is the same override main.ts honours, so this harness can be
      // pointed at the packaged resources tree to prove those binaries really execute.
      resolveBinaries: async () => await resolveVideoBinaries([
        process.env.CREATX_VIDEO_BINARY_ROOT?.trim() || path.join(workspace, "apps", "desktop", "vendor", "win-x64"),
      ]),
      resolveTranscription: () => process.env.CREATX_TRANSCRIPTION_BASE_URL && process.env.CREATX_TRANSCRIPTION_MODEL
        ? {
          baseUrl: process.env.CREATX_TRANSCRIPTION_BASE_URL,
          model: process.env.CREATX_TRANSCRIPTION_MODEL,
          ...(process.env.CREATX_TRANSCRIPTION_API_KEY ? { apiKey: process.env.CREATX_TRANSCRIPTION_API_KEY } : {}),
          ...(process.env.CREATX_TRANSCRIPTION_LANGUAGE ? { language: process.env.CREATX_TRANSCRIPTION_LANGUAGE } : {}),
        }
        : undefined,
      resolveCookieSource: () => "noven",
      resolveDirectSource: async (url, signal) => await pages.extract(url, signal),
    })
    const manifest = await service.analyze({ url: target, transcribe: true, maxFrames }, {
      onProgress: (progress) => { report.stages.push(progress.stage); trace(`stage ${progress.stage}`) },
    })
    const transcript = await service.readTranscript(manifest.analysisId)
    report.status = "PASS"
    report.manifest = {
      sourceUrl: manifest.sourceUrl,
      title: manifest.title,
      author: manifest.author,
      durationSeconds: manifest.durationSeconds,
      transcript: manifest.transcript,
      frames: manifest.frames.map((frame) => ({ index: frame.index, atSeconds: frame.atSeconds, bytes: frame.bytes })),
    }
    report.transcriptHead = (transcript || "").split("\n").slice(0, 25).join("\n")
    report.transcriptLines = (transcript || "").split("\n").length
    await pages.dispose()
  } catch (error) {
    report.error = String(error && error.message ? error.message : error)
  } finally {
    finish()
  }
})
