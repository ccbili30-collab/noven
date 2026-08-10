import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { ImageRuntime, type CreatXImageModel } from "@creatx/image-runtime"
import { ProjectFileService } from "@creatx/project-files"

const baseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const apiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const source = await readFile(resolve(process.env.CREATX_IMAGE_EDIT_SOURCE ?? "../artifacts/map-skill-pilot/base-map.png"))
const mask = await readFile(resolve(process.env.CREATX_IMAGE_EDIT_MASK ?? "../artifacts/map-skill-pilot/rough-control-mask.png"))
const projectRoot = await createTestProject()
const files = new ProjectFileService()
const project = await files.openProject(projectRoot)
await files.commands.writeFile({ projectId: project.id, relativePath: "地图/原始底图.png", content: source, expectedModifiedAt: null })
await files.commands.writeFile({ projectId: project.id, relativePath: "地图/粗蒙版.png", content: mask, expectedModifiedAt: null })

const runtime = new ImageRuntime({ baseUrl, apiKey, fileQueries: files.queries, fileCommands: files.commands })
const prompt = process.env.CREATX_IMAGE_EDIT_PROMPT ?? "Preserve the map composition. Add a subtle warm ivory illumination only to the masked mountain region, following natural ridges and valleys. Keep all unmasked content visually unchanged."
const models: CreatXImageModel[] = process.env.CREATX_IMAGE_EDIT_MODEL
  ? [requireModel(process.env.CREATX_IMAGE_EDIT_MODEL)]
  : ["gpt-image-2-cheap", "gpt-image-2"]
const results = []

for (const model of models) {
  const relativePath = `地图/${model}-自然高亮.png`
  const result = await runtime.editToProject({
    projectId: project.id,
    sourceImagePath: "地图/原始底图.png",
    maskImagePath: "地图/粗蒙版.png",
    relativePath,
    model,
    prompt,
  })
  const output = await files.queries.readBytes(project.id, relativePath)
  if (Buffer.from(output).equals(source)) throw new Error(`IMAGE EDIT LIVE FAIL: ${model} returned the unchanged source bytes`)
  results.push({ ...result, dimensions: pngDimensions(output) })
}

console.log(JSON.stringify({ status: "IMAGE EDIT LIVE PASS", projectRoot, sourceBytes: source.byteLength, maskBytes: mask.byteLength, results }, null, 2))

async function createTestProject() {
  const parent = resolve("tmp/image-edit-live-projects")
  await mkdir(parent, { recursive: true })
  return mkdtemp(`${parent}\\run-`)
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`IMAGE EDIT LIVE FAIL: ${name} is missing`)
  return value
}

function requireModel(value: string): CreatXImageModel {
  if (value === "gpt-image-2-cheap" || value === "gpt-image-2") return value
  throw new Error(`IMAGE EDIT LIVE FAIL: unsupported model ${value}`)
}

function pngDimensions(content: Uint8Array) {
  if (content[0] !== 0x89 || content[1] !== 0x50 || content[2] !== 0x4e || content[3] !== 0x47) return undefined
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
