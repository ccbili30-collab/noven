import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Guards the two things that silently break video analysis in a packaged build: a vendored
// binary that no longer matches what was pinned (antivirus quarantine, a partial download, an
// unreviewed swap), and an electron-builder config that stopped shipping them outside app.asar.

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const vendorRoot = join(workspace, "apps", "desktop", "vendor", "win-x64")

const manifest = JSON.parse(await readFile(join(vendorRoot, "VENDOR.json"), "utf8").catch(() => {
  throw new Error(`video_binary: ${join(vendorRoot, "VENDOR.json")} is missing. Run: bun run scripts/fetch-video-binaries.ts`)
})) as { schemaVersion: number; binaries: Record<string, { sha256: string; bytes: number; version: string }> }
if (manifest.schemaVersion !== 1) throw new Error("video_binary: unsupported VENDOR.json schemaVersion")

const checked = await Promise.all(Object.entries(manifest.binaries).map(async ([name, pinned]) => {
  const bytes = await readFile(join(vendorRoot, name)).catch(() => {
    throw new Error(`video_binary: ${name} is missing from ${vendorRoot}. It may have been quarantined by security software. Run: bun run scripts/fetch-video-binaries.ts`)
  })
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (bytes.byteLength !== pinned.bytes || sha256 !== pinned.sha256) {
    throw new Error(`video_binary: ${name} does not match VENDOR.json (expected ${pinned.sha256} / ${pinned.bytes} bytes, found ${sha256} / ${bytes.byteLength} bytes)`)
  }
  return { name, version: pinned.version, bytes: bytes.byteLength }
}))

const builderConfig = await readFile(join(workspace, "electron-builder.yml"), "utf8")
if (!/^\s{2}- from: apps\/desktop\/vendor\/win-x64$/mu.test(builderConfig) || !/^\s{4}to: vendor\/win-x64$/mu.test(builderConfig)) {
  throw new Error("video_binary: electron-builder.yml no longer ships apps/desktop/vendor/win-x64 to resources/vendor/win-x64")
}

console.log(JSON.stringify({ status: "VIDEO VENDOR PASS", vendorRoot, binaries: checked }))
