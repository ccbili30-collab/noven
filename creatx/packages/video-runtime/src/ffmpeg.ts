export function audioArgs(sourceFile: string, audioFile: string, maxSeconds: number) {
  return [
    // ffmpeg reads stdin for keyboard commands; with stdio ignored it otherwise spins on EOF.
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    // Input-side cap: decoding stops at the limit instead of decoding a long file and
    // discarding most of it.
    "-t", String(maxSeconds),
    "-i", sourceFile,
    "-vn",
    // The "?" makes a video with no audio stream a success that produces no file, rather than
    // an exit-1 failure. That is the no-speech path, and it is not an error.
    "-map", "0:a:0?",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libmp3lame",
    // ~22 MB/hour, comfortably inside every endpoint's 25 MB multipart cap.
    "-b:a", "48k",
    "-f", "mp3",
    audioFile,
  ]
}

// One pass emits both the full-size JPEGs and pixel-aligned 16x16 grayscale PGM thumbnails, so
// dedupe never has to decode a JPEG in TypeScript. metadata=print writes the timestamp of each
// SELECTED frame to frames.txt, relative to cwd — which is why cwd is the job directory and not
// a path containing a colon.
export function frameArgs(sourceFile: string, maxSeconds: number, sceneThreshold: number, maxFrames: number) {
  return [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-t", String(maxSeconds),
    "-i", sourceFile,
    "-filter_complex",
    // eq(n,0) guarantees a first frame even when the video has no scene cut at all.
    // The commas inside select= and gt() are escaped because they are filtergraph separators.
    `[0:v]select='eq(n\\,0)+gt(scene\\,${sceneThreshold})',metadata=print:file=frames.txt,split=2[full][thumb];`
    + `[full]scale=-2:720:flags=bicubic[jpg];`
    // flags=area is a box filter, the correct downsample for a perceptual thumbnail; bilinear
    // would alias. format=gray makes the PGM encoder emit 8-bit P5.
    + `[thumb]scale=16:16:flags=area,format=gray[pgm]`,
    "-map", "[jpg]", "-fps_mode", "passthrough", "-frames:v", String(maxFrames), "-q:v", "4", "frame-%03d.jpg",
    "-map", "[pgm]", "-fps_mode", "passthrough", "-frames:v", String(maxFrames), "-f", "image2", "thumb-%03d.pgm",
  ]
}

export function parseFrameTimestamps(text: string) {
  return [...text.matchAll(/pts_time:\s*([0-9]+(?:\.[0-9]+)?)/gu)].map((match) => Number(match[1]))
}
