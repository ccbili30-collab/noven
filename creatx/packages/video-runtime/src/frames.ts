// P5 PGM: "P5" <ws> width <ws> height <ws> maxval <single ws> <raw bytes>. Comments run from
// '#' to end of line and may appear between any two header tokens.
export function decodeGrayPgm(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x35) throw new Error("video_invalid: 缩略图不是 P5 PGM 格式。")
  const cursor = { at: 2 }
  const width = readPgmToken(bytes, cursor)
  const height = readPgmToken(bytes, cursor)
  const maxValue = readPgmToken(bytes, cursor)
  if (maxValue !== 255) throw new Error("video_invalid: 缩略图位深不受支持。")
  const pixels = bytes.subarray(cursor.at, cursor.at + width * height)
  if (pixels.length !== width * height) throw new Error("video_invalid: 缩略图数据不完整。")
  return pixels
}

// Scene-change detection still emits near-identical frames when a subtitle line changes or a
// hand moves, and every duplicate frame costs the model a full image's worth of context.
export function selectDistinctFrames(thumbnails: readonly Uint8Array[], minDistance: number, limit: number) {
  const kept: number[] = []
  const keptThumbnails: Uint8Array[] = []
  thumbnails.forEach((thumbnail, index) => {
    if (kept.length >= limit) return
    if (keptThumbnails.some((previous) => meanAbsoluteDifference(previous, thumbnail) < minDistance)) return
    kept.push(index)
    keptThumbnails.push(thumbnail)
  })
  return kept
}

export function meanAbsoluteDifference(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length || left.length === 0) return Number.POSITIVE_INFINITY
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]!), 0) / left.length
}

function readPgmToken(bytes: Uint8Array, cursor: { at: number }) {
  while (cursor.at < bytes.length) {
    const byte = bytes[cursor.at]!
    if (byte === 0x23) {
      while (cursor.at < bytes.length && bytes[cursor.at] !== 0x0a) cursor.at += 1
      continue
    }
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) break
    cursor.at += 1
  }
  const start = cursor.at
  while (cursor.at < bytes.length && bytes[cursor.at]! >= 0x30 && bytes[cursor.at]! <= 0x39) cursor.at += 1
  if (cursor.at === start) throw new Error("video_invalid: 缩略图头部无法解析。")
  const token = Number(new TextDecoder().decode(bytes.subarray(start, cursor.at)))
  // Exactly one whitespace byte separates the final header token from the raw pixel data.
  cursor.at += 1
  return token
}
