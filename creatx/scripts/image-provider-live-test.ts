import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { ImageRuntime, type CreatXImageModel } from "@creatx/image-runtime"
import { ProjectFileService } from "@creatx/project-files"

const baseUrl = process.env.CREATX_IMAGE_BASE_URL
const apiKey = process.env.CREATX_IMAGE_API_KEY
if (!baseUrl?.trim() || !apiKey?.trim()) throw new Error("IMAGE LIVE FAIL: local image Provider configuration is missing")

const configuredProject = process.env.CREATX_IMAGE_TEST_PROJECT
const projectRoot = configuredProject ? resolve(configuredProject) : await createTestProject()
await mkdir(projectRoot, { recursive: true })
const files = new ProjectFileService()
const project = await files.openProject(projectRoot)
const runtime = new ImageRuntime({ baseUrl, apiKey, fileQueries: files.queries, fileCommands: files.commands })
const prompt = process.env.CREATX_IMAGE_TEST_PROMPT ?? "A simple red circle centered on a white background, clean flat icon"

const models: CreatXImageModel[] = ["gpt-image-2-cheap", "gpt-image-2"]
const results = []
for (const model of models) {
  const relativePath = `图片/${model}.png`
  const result = await runtime.generateToProject({ projectId: project.id, relativePath, model, prompt })
  const disk = await readFile(resolve(projectRoot, relativePath))
  if (disk.byteLength !== result.bytes) throw new Error(`IMAGE LIVE FAIL: ${model} persisted byte count differs`)
  results.push(result)
}

console.log(JSON.stringify({ status: "IMAGE LIVE PASS", projectRoot, results }, null, 2))

async function createTestProject() {
  const parent = resolve("tmp/image-provider-live-projects")
  await mkdir(parent, { recursive: true })
  return mkdtemp(`${parent}\\run-`)
}
