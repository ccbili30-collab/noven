import { deflateSync, inflateSync } from "node:zlib"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"

const args = parseArgs(process.argv.slice(2))
const planPath = resolve(requireArg(args, "plan"))
const root = dirname(planPath)
const plan = requirePlan(JSON.parse(await readFile(planPath, "utf8")))
const basePath = resolveInside(root, plan.base)
const maskPath = resolveInside(root, plan.mask ?? "region-id-mask.png")
const manifestPath = resolveInside(root, plan.manifest ?? "map-manifest.json")
const reviewPath = resolveInside(root, plan.review ?? "alignment-review.png")
const base = readPng(await readFile(basePath), true)

requireBaseQuality(base)
requireSeeds(plan.regions, base.width, base.height)

const blurred = boxBlur(base.pixels, base.width, base.height, 2)
const gradient = gradientMap(blurred, base.width, base.height)
const labels = watershed(gradient, base.width, base.height, plan.regions)
const counts = countLabels(labels, plan.regions.length)
const minimumRegionPixels = plan.minimumRegionPixels ?? Math.max(256, Math.floor(base.width * base.height * .001))
const tooSmall = plan.regions.flatMap((region, index) => counts[index] < minimumRegionPixels ? [`${region.id}:${counts[index]}`] : [])
if (tooSmall.length) fail(`regions_too_small:${tooSmall.join(",")}`)

const alignment = alignmentMetrics(labels, gradient, base.width, base.height)
const minimumAlignmentRatio = plan.minimumAlignmentRatio ?? 1.25
if (alignment.ratio < minimumAlignmentRatio) fail(`boundary_alignment_too_low:${alignment.ratio.toFixed(3)}:${minimumAlignmentRatio}`)

const maskPixels = new Uint8Array(base.width * base.height * 4)
for (let pixel = 0; pixel < labels.length; pixel++) {
  const color = parseColor(plan.regions[labels[pixel]].maskColor)
  const offset = pixel * 4
  maskPixels[offset] = color[0]
  maskPixels[offset + 1] = color[1]
  maskPixels[offset + 2] = color[2]
  maskPixels[offset + 3] = 255
}

await writeFile(maskPath, writePng({ width: base.width, height: base.height, pixels: maskPixels }))
await writeFile(reviewPath, writePng({ width: base.width, height: base.height, pixels: reviewPixels(base.pixels, maskPixels, labels, base.width, base.height) }))
await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  title: plan.title,
  canvas: { width: base.width, height: base.height },
  base: relativeName(basePath),
  mask: relativeName(maskPath),
  regions: plan.regions.map(({ seeds, ...region }) => region),
}, null, 2)}\n`, "utf8")

console.log(JSON.stringify({
  ok: true,
  canvas: { width: base.width, height: base.height },
  regionCount: plan.regions.length,
  assignedPixels: labels.length,
  smallestRegionPixels: Math.min(...counts),
  baseQuality: qualityMetrics(base),
  boundaryAlignment: alignment,
  mask: maskPath,
  manifest: manifestPath,
  review: reviewPath,
}, null, 2))

function parseArgs(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith("--") || values[index + 1] === undefined) fail("invalid_arguments")
    result[values[index].slice(2)] = values[index + 1]
  }
  return result
}

function requireArg(values, name) {
  if (!values[name]) fail(`missing_argument:${name}`)
  return values[name]
}

function requirePlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("plan_invalid")
  if (value.schemaVersion !== 1) fail("plan_schema_unsupported")
  if (typeof value.title !== "string" || !value.title) fail("plan_title_invalid")
  if (typeof value.base !== "string" || !value.base) fail("plan_base_invalid")
  if (!Array.isArray(value.regions) || value.regions.length < 2 || value.regions.length > 64) fail("plan_regions_invalid")
  const ids = new Set()
  const colors = new Set()
  for (const region of value.regions) {
    if (!region || typeof region !== "object" || typeof region.id !== "string" || !region.id || typeof region.name !== "string" || !region.name) fail("plan_region_invalid")
    if (!["land", "water", "unknown"].includes(region.kind)) fail(`plan_region_kind_invalid:${region.id}`)
    if (!/^#[0-9a-f]{6}$/.test(region.maskColor)) fail(`plan_region_color_invalid:${region.id}`)
    if (!Array.isArray(region.seeds) || region.seeds.length < 1 || region.seeds.length > 64) fail(`plan_region_seeds_invalid:${region.id}`)
    if (ids.has(region.id)) fail(`plan_region_id_duplicate:${region.id}`)
    if (colors.has(region.maskColor)) fail(`plan_region_color_duplicate:${region.maskColor}`)
    ids.add(region.id)
    colors.add(region.maskColor)
  }
  if (value.minimumRegionPixels !== undefined && (!Number.isInteger(value.minimumRegionPixels) || value.minimumRegionPixels < 1)) fail("plan_minimum_region_pixels_invalid")
  if (value.minimumAlignmentRatio !== undefined && (typeof value.minimumAlignmentRatio !== "number" || value.minimumAlignmentRatio < 1)) fail("plan_minimum_alignment_ratio_invalid")
  return value
}

function requireSeeds(regions, width, height) {
  const occupied = new Set()
  for (const region of regions) {
    for (const seed of region.seeds) {
      if (!Array.isArray(seed) || seed.length !== 2 || !Number.isInteger(seed[0]) || !Number.isInteger(seed[1])) fail(`plan_seed_invalid:${region.id}`)
      if (seed[0] < 0 || seed[1] < 0 || seed[0] >= width || seed[1] >= height) fail(`plan_seed_outside:${region.id}:${seed.join(",")}`)
      const key = seed.join(",")
      if (occupied.has(key)) fail(`plan_seed_duplicate:${key}`)
      occupied.add(key)
    }
  }
}

function requireBaseQuality(base) {
  if (base.width * base.height < 1_000_000 || Math.min(base.width, base.height) < 768) fail(`base_resolution_too_low:${base.width}x${base.height}`)
  for (let offset = 3; offset < base.pixels.length; offset += 4) if (base.pixels[offset] !== 255) fail("base_transparency_not_allowed")
  const quality = qualityMetrics(base)
  if (quality.dynamicRange < 80) fail(`base_dynamic_range_too_low:${quality.dynamicRange}`)
  if (quality.meanGradient < 18) fail(`base_too_soft:${quality.meanGradient}`)
  if (quality.strongEdgeRatio < .06) fail(`base_edges_too_weak:${quality.strongEdgeRatio}`)
}

function qualityMetrics(base) {
  const luminance = new Uint8Array(base.width * base.height)
  const histogram = new Uint32Array(256)
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const offset = pixel * 4
    const value = Math.round(base.pixels[offset] * .2126 + base.pixels[offset + 1] * .7152 + base.pixels[offset + 2] * .0722)
    luminance[pixel] = value
    histogram[value]++
  }
  const gradients = gradientMap(luminanceToRgba(luminance), base.width, base.height)
  const meanGradient = gradients.reduce((total, value) => total + value, 0) / gradients.length
  const strongEdgeRatio = gradients.reduce((total, value) => total + (value >= 45 ? 1 : 0), 0) / gradients.length
  return {
    dynamicRange: percentile(histogram, luminance.length, .99) - percentile(histogram, luminance.length, .01),
    meanGradient: Number(meanGradient.toFixed(2)),
    strongEdgeRatio: Number(strongEdgeRatio.toFixed(4)),
  }
}

function percentile(histogram, total, fraction) {
  const target = total * fraction
  let seen = 0
  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value]
    if (seen >= target) return value
  }
  return 255
}

function luminanceToRgba(luminance) {
  const pixels = new Uint8Array(luminance.length * 4)
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const offset = pixel * 4
    pixels[offset] = luminance[pixel]
    pixels[offset + 1] = luminance[pixel]
    pixels[offset + 2] = luminance[pixel]
    pixels[offset + 3] = 255
  }
  return pixels
}

function boxBlur(pixels, width, height, radius) {
  const horizontal = new Uint16Array(width * height * 3)
  const output = new Uint8Array(pixels.length)
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0
      for (let x = -radius; x <= radius; x++) sum += pixels[(y * width + Math.max(0, Math.min(width - 1, x))) * 4 + channel]
      for (let x = 0; x < width; x++) {
        horizontal[(y * width + x) * 3 + channel] = sum
        sum += pixels[(y * width + Math.min(width - 1, x + radius + 1)) * 4 + channel]
        sum -= pixels[(y * width + Math.max(0, x - radius)) * 4 + channel]
      }
    }
  }
  const divisor = (radius * 2 + 1) ** 2
  for (let x = 0; x < width; x++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0
      for (let y = -radius; y <= radius; y++) sum += horizontal[(Math.max(0, Math.min(height - 1, y)) * width + x) * 3 + channel]
      for (let y = 0; y < height; y++) {
        output[(y * width + x) * 4 + channel] = Math.round(sum / divisor)
        output[(y * width + x) * 4 + 3] = 255
        sum += horizontal[(Math.min(height - 1, y + radius + 1) * width + x) * 3 + channel]
        sum -= horizontal[(Math.max(0, y - radius) * width + x) * 3 + channel]
      }
    }
  }
  return output
}

function gradientMap(pixels, width, height) {
  const gradient = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const left = (y * width + x - 1) * 4
      const right = (y * width + x + 1) * 4
      const up = ((y - 1) * width + x) * 4
      const down = ((y + 1) * width + x) * 4
      let value = 0
      for (let channel = 0; channel < 3; channel++) value += Math.abs(pixels[right + channel] - pixels[left + channel]) + Math.abs(pixels[down + channel] - pixels[up + channel])
      gradient[y * width + x] = Math.min(255, Math.round(value / 3))
    }
  }
  return gradient
}

function watershed(gradient, width, height, regions) {
  const labels = new Int16Array(width * height)
  labels.fill(-1)
  const queued = new Uint8Array(labels.length)
  const queuedBy = new Int16Array(labels.length)
  queuedBy.fill(-1)
  const buckets = Array.from({ length: 256 }, () => [])
  const heads = new Uint32Array(256)

  const enqueue = (pixel, owner, level) => {
    if (pixel < 0 || pixel >= labels.length || labels[pixel] !== -1 || queued[pixel]) return
    const priority = Math.max(level, gradient[pixel])
    queued[pixel] = 1
    queuedBy[pixel] = owner
    buckets[priority].push(pixel)
  }

  regions.forEach((region, owner) => {
    for (const [x, y] of region.seeds) {
      const pixel = y * width + x
      labels[pixel] = owner
    }
  })
  regions.forEach((region, owner) => {
    for (const [x, y] of region.seeds) {
      const pixel = y * width + x
      if (x > 0) enqueue(pixel - 1, owner, 0)
      if (x < width - 1) enqueue(pixel + 1, owner, 0)
      if (y > 0) enqueue(pixel - width, owner, 0)
      if (y < height - 1) enqueue(pixel + width, owner, 0)
    }
  })

  for (let level = 0; level < buckets.length; level++) {
    while (heads[level] < buckets[level].length) {
      const pixel = buckets[level][heads[level]++]
      if (labels[pixel] !== -1) continue
      const x = pixel % width
      const neighbors = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel >= width ? pixel - width : -1, pixel < labels.length - width ? pixel + width : -1]
      const counts = new Map()
      for (const neighbor of neighbors) if (neighbor >= 0 && labels[neighbor] >= 0) counts.set(labels[neighbor], (counts.get(labels[neighbor]) ?? 0) + 1)
      const owner = [...counts.entries()].sort((left, right) => right[1] - left[1] || (left[0] === queuedBy[pixel] ? -1 : 1))[0]?.[0] ?? queuedBy[pixel]
      labels[pixel] = owner
      for (const neighbor of neighbors) enqueue(neighbor, owner, level)
    }
  }
  if (labels.some((label) => label < 0)) fail("mask_unassigned_pixels")
  return labels
}

function countLabels(labels, count) {
  const result = new Uint32Array(count)
  for (const label of labels) result[label]++
  return [...result]
}

function alignmentMetrics(labels, gradient, width, height) {
  let boundaryPixels = 0
  let boundaryGradient = 0
  let interiorPixels = 0
  let interiorGradient = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pixel = y * width + x
      const boundary = labels[pixel] !== labels[pixel - 1] || labels[pixel] !== labels[pixel + 1] || labels[pixel] !== labels[pixel - width] || labels[pixel] !== labels[pixel + width]
      if (boundary) {
        boundaryPixels++
        boundaryGradient += gradient[pixel]
        continue
      }
      interiorPixels++
      interiorGradient += gradient[pixel]
    }
  }
  const boundaryMean = boundaryGradient / boundaryPixels
  const interiorMean = interiorGradient / interiorPixels
  return {
    boundaryPixels,
    boundaryGradientMean: Number(boundaryMean.toFixed(2)),
    interiorGradientMean: Number(interiorMean.toFixed(2)),
    ratio: Number((boundaryMean / interiorMean).toFixed(3)),
  }
}

function reviewPixels(base, mask, labels, width, height) {
  const output = new Uint8Array(base.length)
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const offset = pixel * 4
    for (let channel = 0; channel < 3; channel++) output[offset + channel] = Math.round(base[offset + channel] * .68 + mask[offset + channel] * .32)
    output[offset + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const boundary = (x > 0 && labels[pixel] !== labels[pixel - 1]) || (y > 0 && labels[pixel] !== labels[pixel - width])
      if (!boundary) continue
      for (let reviewY = Math.max(0, y - 1); reviewY <= Math.min(height - 1, y + 1); reviewY++) {
        for (let reviewX = Math.max(0, x - 1); reviewX <= Math.min(width - 1, x + 1); reviewX++) {
          const offset = (reviewY * width + reviewX) * 4
          output[offset] = 255
          output[offset + 1] = 220
          output[offset + 2] = 126
        }
      }
    }
  }
  return output
}

function parseColor(value) {
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]
}

function resolveInside(root, relative) {
  if (typeof relative !== "string" || !relative || isAbsolute(relative)) fail("asset_path_must_be_relative")
  const path = resolve(root, relative)
  if (path !== root && !path.startsWith(`${root}${sep}`)) fail("asset_path_escape")
  return path
}

function relativeName(path) {
  return path.slice(root.length + 1).replaceAll("\\", "/")
}

function readPng(buffer, decodePixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(signature)) fail("png_signature_invalid")
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const data = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const chunk = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      bitDepth = chunk[8]
      colorType = chunk[9]
      interlace = chunk[12]
    }
    if (type === "IDAT") data.push(chunk)
    if (type === "IEND") break
    offset += length + 12
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) fail("png_format_unsupported")
  if (!decodePixels) return { width, height }
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const reconstructed = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const sourceOffset = y * (stride + 1)
    const targetOffset = y * stride
    const filter = raw[sourceOffset]
    for (let x = 0; x < stride; x++) {
      const value = raw[sourceOffset + 1 + x]
      const left = x >= channels ? reconstructed[targetOffset + x - channels] : 0
      const up = y > 0 ? reconstructed[targetOffset - stride + x] : 0
      const upperLeft = y > 0 && x >= channels ? reconstructed[targetOffset - stride + x - channels] : 0
      reconstructed[targetOffset + x] = unfilter(filter, value, left, up, upperLeft)
    }
  }
  const pixels = new Uint8Array(width * height * 4)
  for (let source = 0, target = 0; source < reconstructed.length; source += channels, target += 4) {
    pixels[target] = reconstructed[source]
    pixels[target + 1] = reconstructed[source + 1]
    pixels[target + 2] = reconstructed[source + 2]
    pixels[target + 3] = channels === 4 ? reconstructed[source + 3] : 255
  }
  return { width, height, pixels }
}

function unfilter(filter, value, left, up, upperLeft) {
  if (filter === 0) return value
  if (filter === 1) return (value + left) & 255
  if (filter === 2) return (value + up) & 255
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 255
  if (filter === 4) {
    const estimate = left + up - upperLeft
    const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)]
    return (value + [left, up, upperLeft][distances.indexOf(Math.min(...distances))]) & 255
  }
  fail(`png_filter_unsupported:${filter}`)
}

function writePng(image) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc(image.height * (image.width * 4 + 1))
  for (let y = 0; y < image.height; y++) Buffer.from(image.pixels.buffer, image.pixels.byteOffset + y * image.width * 4, image.width * 4).copy(raw, y * (image.width * 4 + 1) + 1)
  return Buffer.concat([signature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))])
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii")
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  name.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return chunk
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const value of buffer) {
    crc ^= value
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function fail(message) {
  throw new Error(`interactive_map_mask_invalid:${message}`)
}
