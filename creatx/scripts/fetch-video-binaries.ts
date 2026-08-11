import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Places the two media binaries the video capability spawns. They are too large to commit
// (ffmpeg.exe alone exceeds GitHub's 100 MB per-file limit), so VENDOR.json carries the pin and
// this script reproduces the exact bytes from it.
//
//   bun run fetch:video-binaries              restore the pinned binaries, verifying SHA-256
//   bun run fetch:video-binaries -- --update  re-resolve upstream latest and re-pin
//
// The packaged app still bundles them: electron-builder extraResources ships this directory to
// resources/vendor/win-x64.

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const vendorRoot = join(workspace, "apps", "desktop", "vendor", "win-x64")
const manifestPath = join(vendorRoot, "VENDOR.json")
const update = process.argv.includes("--update")
// The LGPL build is deliberate: a GPL build would impose GPL terms on the whole distribution.
const ffmpegLatestUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip"
const ytDlpLatestUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"

interface VendorPin {
  sha256: string
  bytes: number
  sourceUrl: string
  version: string
  license: string
}

interface VendorManifest {
  schemaVersion: 1
  platform: "win32-x64"
  binaries: Record<string, VendorPin>
}

await mkdir(vendorRoot, { recursive: true })
const pinned = update ? undefined : await readFile(manifestPath, "utf8").then((text) => JSON.parse(text) as VendorManifest, () => undefined)

if (pinned && await matchesPin(pinned)) {
  console.log(JSON.stringify({ status: "VIDEO VENDOR ALREADY PINNED", vendorRoot, ytDlp: pinned.binaries["yt-dlp.exe"]?.version, ffmpeg: pinned.binaries["ffmpeg.exe"]?.version }))
  process.exit(0)
}

const ytDlpUrl = pinned?.binaries["yt-dlp.exe"]?.sourceUrl ?? await resolveYtDlpUrl()
const ffmpegUrl = pinned?.binaries["ffmpeg.exe"]?.sourceUrl ?? ffmpegLatestUrl
const ytDlp = await download(ytDlpUrl, join(vendorRoot, "yt-dlp.exe"))
const ffmpeg = await installFfmpeg(ffmpegUrl)

// Restoring must reproduce the pin exactly; if upstream moved, say so instead of silently
// shipping different bytes than the ones that were reviewed.
requireExpectedBytes(pinned?.binaries["yt-dlp.exe"], ytDlp, "yt-dlp.exe")
requireExpectedBytes(pinned?.binaries["ffmpeg.exe"], ffmpeg, "ffmpeg.exe")

const versions = {
  ytDlp: (await run(join(vendorRoot, "yt-dlp.exe"), ["--version"])).trim(),
  ffmpeg: (await run(join(vendorRoot, "ffmpeg.exe"), ["-hide_banner", "-version"])).split("\n")[0]?.trim() ?? "",
}
// Probe the exact flags frame extraction depends on rather than parsing a version string:
// -fps_mode replaced -vsync in ffmpeg 5.1, and master builds report "N-126039" not a number.
await run(join(vendorRoot, "ffmpeg.exe"), [
  "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
  "-filter_complex", "[0:v]select='eq(n\\,0)',metadata=print:file=-,split=2[full][thumb];[full]scale=-2:64:flags=bicubic[jpg];[thumb]scale=16:16:flags=area,format=gray[pgm]",
  "-map", "[jpg]", "-fps_mode", "passthrough", "-frames:v", "1", "-f", "null", "-",
  "-map", "[pgm]", "-fps_mode", "passthrough", "-frames:v", "1", "-f", "null", "-",
]).catch((error) => {
  throw new Error(`video_binary: ffmpeg ${versions.ffmpeg} rejected the frame-extraction filtergraph (needs >= 5.1): ${error instanceof Error ? error.message : String(error)}`)
})
// Audio extraction encodes MP3 before transcription. The LGPL build carries libmp3lame, but a
// differently configured build may not, and that failure would only surface when a user
// analyzes their first video.
if (!(await run(join(vendorRoot, "ffmpeg.exe"), ["-hide_banner", "-encoders"])).includes("libmp3lame")) {
  throw new Error(`video_binary: ffmpeg ${versions.ffmpeg} has no libmp3lame encoder; audio extraction for transcription would fail`)
}

await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  platform: "win32-x64",
  binaries: {
    "yt-dlp.exe": { sha256: ytDlp.sha256, bytes: ytDlp.bytes, sourceUrl: ytDlpUrl, version: versions.ytDlp, license: "Unlicense" },
    "ffmpeg.exe": { sha256: ffmpeg.sha256, bytes: ffmpeg.bytes, sourceUrl: ffmpegUrl, version: versions.ffmpeg, license: "LGPL-2.1-or-later" },
  },
} satisfies VendorManifest, null, 2)}\n`, "utf8")

console.log(JSON.stringify({ status: update ? "VIDEO VENDOR REPINNED" : "VIDEO VENDOR RESTORED", vendorRoot, ytDlp: versions.ytDlp, ffmpeg: versions.ffmpeg, bytes: ytDlp.bytes + ffmpeg.bytes }))

async function matchesPin(manifest: VendorManifest) {
  const results = await Promise.all(Object.entries(manifest.binaries).map(async ([name, pin]) => {
    const bytes = await readFile(join(vendorRoot, name)).catch(() => undefined)
    return bytes !== undefined && bytes.byteLength === pin.bytes && createHash("sha256").update(bytes).digest("hex") === pin.sha256
  }))
  return results.every(Boolean)
}

function requireExpectedBytes(pin: VendorPin | undefined, actual: { sha256: string; bytes: number }, name: string) {
  if (!pin || (pin.sha256 === actual.sha256 && pin.bytes === actual.bytes)) return
  throw new Error(`video_binary: ${name} from ${pin.sourceUrl} no longer matches VENDOR.json (expected ${pin.sha256}, got ${actual.sha256}). Upstream moved; re-pin deliberately with: bun run fetch:video-binaries -- --update`)
}

async function resolveYtDlpUrl() {
  // Pin the versioned asset, not the moving "latest" alias, so a later restore is reproducible.
  const response = await fetch("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "creatx-vendor-fetch" } })
  const tag = response.ok ? (await response.json() as { tag_name?: string }).tag_name : undefined
  return tag ? `https://github.com/yt-dlp/yt-dlp/releases/download/${tag}/yt-dlp.exe` : ytDlpLatestUrl
}

async function installFfmpeg(url: string) {
  const archive = join(vendorRoot, ".ffmpeg.zip")
  const staging = join(vendorRoot, ".ffmpeg-staging")
  try {
    await download(url, archive)
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    // Expand-Archive ships with every supported Windows, so this needs no zip dependency.
    await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${staging}' -Force`], { maxBuffer: 8 * 1024 * 1024 })
    const found = await locate(staging, "ffmpeg.exe")
    if (!found) throw new Error("video_binary: ffmpeg.exe was not found inside the downloaded archive")
    await rm(join(vendorRoot, "ffmpeg.exe"), { force: true })
    await rename(found, join(vendorRoot, "ffmpeg.exe"))
    const license = await locate(staging, "LICENSE.txt")
    if (license) await rename(license, join(vendorRoot, "LICENSE.ffmpeg.txt")).catch(() => undefined)
    const bytes = await readFile(join(vendorRoot, "ffmpeg.exe"))
    return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }
  } finally {
    await Promise.all([rm(archive, { force: true }), rm(staging, { recursive: true, force: true })])
  }
}

async function download(url: string, target: string) {
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) throw new Error(`video_binary: ${url} returned HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.byteLength) throw new Error(`video_binary: ${url} returned an empty body`)
  await writeFile(target, bytes)
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }
}

async function locate(root: string, name: string): Promise<string | undefined> {
  const entries = await readdir(root, { withFileTypes: true })
  const direct = entries.find((entry) => entry.isFile() && entry.name === name)
  if (direct) return join(root, direct.name)
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const found = await locate(join(root, entry.name), name)
    if (found) return found
  }
  return undefined
}

async function run(path: string, args: readonly string[]) {
  return (await promisify(execFile)(path, [...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout
}
