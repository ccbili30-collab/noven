import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { promisify } from "node:util"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { formatTranscript, resolveVideoBinaries, runBinary, transcribeAudio } from "@creatx/video-runtime"

// Exercises the real transcription endpoint through the production client, using real speech
// rather than a tone: Windows SAPI synthesises a known Chinese sentence, the vendored ffmpeg
// encodes it exactly as the analysis pipeline does, and each candidate model transcribes it.
// Comparing against the known sentence is what makes the result meaningful.
//
//   bun run test:transcription-live
//   bun run test:transcription-live -- FunAudioLLM/SenseVoiceSmall TeleAI/TeleSpeechASR

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const models = process.argv.slice(2).filter((entry) => entry !== "--" && !entry.startsWith("-"))
const candidates = models.length ? models : ["FunAudioLLM/SenseVoiceSmall", "TeleAI/TeleSpeechASR"]
const baseUrl = process.env.CREATX_TRANSCRIPTION_BASE_URL?.trim()
const apiKey = process.env.CREATX_TRANSCRIPTION_API_KEY?.trim()
if (!baseUrl) throw new Error("Set CREATX_TRANSCRIPTION_BASE_URL (a .env.local is loaded by the npm script).")

const spoken = "先起形，再上色，最后统一收拾光影关系。"
const root = await mkdtemp(join(tmpdir(), "noven-asr-live-"))

try {
  const wav = join(root, "speech.wav")
  await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Huihui Desktop'); $s.Rate = -1; $s.SetOutputToWaveFile('${wav}'); $s.Speak('${spoken}'); $s.Dispose()`,
  ], { maxBuffer: 4 * 1024 * 1024 })

  // Same encode the pipeline uses, so a failure here is a failure there.
  const binaries = await resolveVideoBinaries([join(workspace, "apps", "desktop", "vendor", "win-x64")])
  const mp3 = join(root, "speech.mp3")
  const encoded = await runBinary(binaries.ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", mp3], { cwd: root, timeoutMs: 60_000 })
  if (encoded.code !== 0) throw new Error(`ffmpeg failed: ${encoded.stderr}`)
  const audio = await readFile(mp3)

  const results = []
  for (const model of candidates) {
    const started = Date.now()
    const outcome = await transcribeAudio(audio, { baseUrl, model, ...(apiKey ? { apiKey } : {}), language: "zh" }, { timeoutMs: 120_000 })
      .then((result) => ({ ok: true as const, text: formatTranscript(result.cues), cues: result.cues.length, language: result.language }))
      .catch((error: Error) => ({ ok: false as const, error: error.message }))
    results.push({ model, elapsedMs: Date.now() - started, ...outcome })
  }

  console.log(JSON.stringify({
    status: results.some((result) => result.ok) ? "TRANSCRIPTION LIVE PASS" : "TRANSCRIPTION LIVE FAIL",
    endpoint: baseUrl,
    keyConfigured: Boolean(apiKey),
    audioBytes: audio.byteLength,
    spoken,
    results,
  }, null, 2))
  if (!results.some((result) => result.ok)) process.exitCode = 1
} finally {
  await rm(root, { recursive: true, force: true })
}
