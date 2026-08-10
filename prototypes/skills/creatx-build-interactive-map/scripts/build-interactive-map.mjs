import { inflateSync } from "node:zlib"
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MARKER = ".creatx-interactive-map-output"
const args = parseArgs(process.argv.slice(2))
const manifestPath = path.resolve(requireArg(args, "manifest"))
const sourceRoot = path.dirname(manifestPath)
const outputRoot = path.resolve(args.output ?? path.join(sourceRoot, "交互地图"))
const manifest = requireManifest(JSON.parse(await readFile(manifestPath, "utf8")))
const basePath = resolveInside(sourceRoot, manifest.base)
const maskPath = resolveInside(sourceRoot, manifest.mask)
const baseInfo = readPng(await readFile(basePath), true)
const maskInfo = readPng(await readFile(maskPath), true)

if (baseInfo.width !== manifest.canvas.width || baseInfo.height !== manifest.canvas.height) fail("base_dimensions_mismatch")
if (maskInfo.width !== manifest.canvas.width || maskInfo.height !== manifest.canvas.height) fail("mask_dimensions_mismatch")
for (let index = 3; index < baseInfo.pixels.length; index += 4) if (baseInfo.pixels[index] !== 255) fail("base_transparency_not_allowed")

const expectedColors = new Map(manifest.regions.map((region) => [region.maskColor, region]))
const counts = new Map(manifest.regions.map((region) => [region.maskColor, 0]))
for (let index = 0; index < maskInfo.pixels.length; index += 4) {
  if (maskInfo.pixels[index + 3] !== 255) fail("mask_transparency_not_allowed")
  const color = `#${maskInfo.pixels[index].toString(16).padStart(2, "0")}${maskInfo.pixels[index + 1].toString(16).padStart(2, "0")}${maskInfo.pixels[index + 2].toString(16).padStart(2, "0")}`
  if (!expectedColors.has(color)) fail(`mask_unknown_color:${color}`)
  counts.set(color, counts.get(color) + 1)
}
for (const [color, count] of counts) if (count === 0) fail(`mask_region_empty:${color}`)

await prepareOutput(outputRoot)
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
for (const name of ["index.html", "styles.css", "app.js"]) await copyFile(path.join(skillRoot, "assets", "viewer", name), path.join(outputRoot, name))
await copyFile(basePath, path.join(outputRoot, "base-map.png"))
await copyFile(maskPath, path.join(outputRoot, "region-id-mask.png"))
await writeFile(path.join(outputRoot, "map-manifest.json"), `${JSON.stringify({ ...manifest, base: "base-map.png", mask: "region-id-mask.png" }, null, 2)}\n`, "utf8")
await writeFile(path.join(outputRoot, MARKER), "schemaVersion=1\n", "utf8")

console.log(JSON.stringify({
  ok: true,
  output: outputRoot,
  canvas: manifest.canvas,
  regionCount: manifest.regions.length,
  assignedPixels: maskInfo.width * maskInfo.height,
  smallestRegionPixels: Math.min(...counts.values()),
}, null, 2))

function parseArgs(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    if (!key?.startsWith("--") || values[index + 1] === undefined) fail("invalid_arguments")
    result[key.slice(2)] = values[index + 1]
  }
  return result
}

function requireArg(values, name) {
  if (!values[name]) fail(`missing_argument:${name}`)
  return values[name]
}

function requireManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("manifest_invalid")
  if (value.schemaVersion !== 1) fail("manifest_schema_unsupported")
  if (!Number.isInteger(value.canvas?.width) || !Number.isInteger(value.canvas?.height) || value.canvas.width < 1 || value.canvas.height < 1) fail("manifest_canvas_invalid")
  if (typeof value.base !== "string" || typeof value.mask !== "string") fail("manifest_assets_invalid")
  if (!Array.isArray(value.regions) || value.regions.length < 1) fail("manifest_regions_invalid")
  const ids = new Set()
  const colors = new Set()
  for (const region of value.regions) {
    if (!region || typeof region !== "object" || typeof region.id !== "string" || !region.id || typeof region.name !== "string" || !region.name) fail("manifest_region_invalid")
    if (!['land', 'water', 'unknown'].includes(region.kind)) fail(`manifest_region_kind_invalid:${region.id}`)
    if (!/^#[0-9a-f]{6}$/.test(region.maskColor)) fail(`manifest_region_color_invalid:${region.id}`)
    if (region.summary !== undefined && typeof region.summary !== "string") fail(`manifest_region_summary_invalid:${region.id}`)
    if (region.details !== undefined && (!Array.isArray(region.details) || region.details.some((item) => !item || typeof item.label !== "string" || typeof item.value !== "string"))) fail(`manifest_region_details_invalid:${region.id}`)
    if (region.sourcePaths !== undefined && (!Array.isArray(region.sourcePaths) || region.sourcePaths.some((source) => typeof source !== "string"))) fail(`manifest_region_sources_invalid:${region.id}`)
    if (ids.has(region.id)) fail(`manifest_region_id_duplicate:${region.id}`)
    if (colors.has(region.maskColor)) fail(`manifest_region_color_duplicate:${region.maskColor}`)
    ids.add(region.id)
    colors.add(region.maskColor)
  }
  return value
}

function resolveInside(root, relative) {
  if (path.isAbsolute(relative)) fail("asset_path_must_be_relative")
  const resolved = path.resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail("asset_path_escape")
  return resolved
}

async function prepareOutput(output) {
  if (output === sourceRoot || sourceRoot.startsWith(`${output}${path.sep}`)) fail("output_overlaps_source")
  await mkdir(output, { recursive: true })
  const entries = await stat(path.join(output, MARKER)).then(() => true, () => false)
  const existing = await stat(output).then((value) => value.isDirectory(), () => false)
  const contents = existing ? await import("node:fs/promises").then(({ readdir }) => readdir(output)) : []
  if (contents.length > 0 && !entries) fail("output_not_owned")
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
  const pixels = Buffer.alloc(width * height * 4)
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

function fail(message) {
  throw new Error(`interactive_map_invalid:${message}`)
}
