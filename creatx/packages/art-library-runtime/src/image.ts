export const ART_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const ART_IMAGE_MIN_EDGE = 256
export const ART_IMAGE_MAX_EDGE = 20_000

export interface ArtImageInfo {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  extension: "png" | "jpg" | "webp" | "gif"
  width: number
  height: number
}

export function inspectArtImage(bytes: Uint8Array): ArtImageInfo {
  if (bytes.byteLength > ART_IMAGE_MAX_BYTES) throw new Error("art_image_too_large: image exceeds 20 MB")
  const info = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes) ?? inspectGif(bytes)
  if (!info) throw new Error("art_image_invalid: unsupported or damaged image bytes")
  if (Math.min(info.width, info.height) < ART_IMAGE_MIN_EDGE) throw new Error("art_image_too_small: image edge is below 256 pixels")
  if (Math.max(info.width, info.height) > ART_IMAGE_MAX_EDGE) throw new Error("art_image_dimensions_invalid: image edge exceeds 20000 pixels")
  return info
}

function inspectPng(bytes: Uint8Array): ArtImageInfo | undefined {
  if (bytes.byteLength < 24 || !equals(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return
  return { mediaType: "image/png", extension: "png", width: readUint32Be(bytes, 16), height: readUint32Be(bytes, 20) }
}

function inspectGif(bytes: Uint8Array): ArtImageInfo | undefined {
  if (bytes.byteLength < 10 || (text(bytes, 0, 6) !== "GIF87a" && text(bytes, 0, 6) !== "GIF89a")) return
  return { mediaType: "image/gif", extension: "gif", width: readUint16Le(bytes, 6), height: readUint16Le(bytes, 8) }
}

function inspectJpeg(bytes: Uint8Array): ArtImageInfo | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  for (let offset = 2; offset + 8 < bytes.byteLength;) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === undefined) break
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = readUint16Be(bytes, offset + 2)
    if (length < 2 || offset + 2 + length > bytes.byteLength) break
    if (startOfFrame.has(marker) && length >= 7) {
      return { mediaType: "image/jpeg", extension: "jpg", width: readUint16Be(bytes, offset + 7), height: readUint16Be(bytes, offset + 5) }
    }
    offset += length + 2
  }
}

function inspectWebp(bytes: Uint8Array): ArtImageInfo | undefined {
  if (bytes.byteLength < 30 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 12) !== "WEBP") return
  const kind = text(bytes, 12, 16)
  if (kind === "VP8X") return { mediaType: "image/webp", extension: "webp", width: readUint24Le(bytes, 24) + 1, height: readUint24Le(bytes, 27) + 1 }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { mediaType: "image/webp", extension: "webp", width: readUint16Le(bytes, 26) & 0x3fff, height: readUint16Le(bytes, 28) & 0x3fff }
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    return {
      mediaType: "image/webp",
      extension: "webp",
      width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
      height: 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10),
    }
  }
}

function equals(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value)
}

function text(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder("ascii").decode(bytes.subarray(start, end))
}

function readUint16Be(bytes: Uint8Array, offset: number) {
  return bytes[offset]! * 256 + bytes[offset + 1]!
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + bytes[offset + 1]! * 256
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65_536
}

function readUint32Be(bytes: Uint8Array, offset: number) {
  return bytes[offset]! * 16_777_216 + bytes[offset + 1]! * 65_536 + bytes[offset + 2]! * 256 + bytes[offset + 3]!
}
