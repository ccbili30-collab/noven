$ErrorActionPreference = "Stop"

& bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# The media binaries are pinned by apps/desktop/vendor/win-x64/VENDOR.json but not committed,
# because ffmpeg.exe exceeds GitHub's 100 MB per-file limit. Restoring them here keeps a fresh
# clone able to analyze video. A failure is reported but does not block the rest of the install:
# every other capability works without them, and video analysis fails closed with a named error.
& bun run scripts/fetch-video-binaries.ts
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Video binaries were not restored. Video analysis will fail until you run: bun run fetch:video-binaries"
}

exit 0
