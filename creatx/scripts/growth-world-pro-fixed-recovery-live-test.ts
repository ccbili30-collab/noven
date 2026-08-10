import { execFile } from "node:child_process"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron } from "@playwright/test"

const projectRoot = resolve(requireEnvironment("CREATX_RECOVERY_PROJECT_ROOT"))
const userData = resolve(requireEnvironment("CREATX_RECOVERY_USER_DATA"))
const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "proFixedPartial")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const before = await snapshotContentFiles()

await mkdir(evidenceDir, { recursive: true })
const app = await electron.launch({
  executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
  args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
  cwd: workspace,
  env: {
    ...inheritedEnvironment,
    CREATX_DESKTOP_TEST: "1",
    CREATX_PROJECT_ROOT: projectRoot,
    CREATX_PROVIDER_ID: "openai-compatible",
    CREATX_MODEL_ID: "gpt-5.6-luna",
    CREATX_PROVIDER_BASE_URL: providerBaseUrl,
    CREATX_PROVIDER_API_KEY: providerApiKey,
  },
})
const pid = app.process().pid
if (!pid) throw new Error("Electron main process did not expose a PID")

try {
  const page = await app.firstWindow()
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  const bootstrap = await page.evaluate(async () => window.creatx.bootstrap())
  if (!bootstrap.ok) throw new Error(bootstrap.error.message)
  if (bootstrap.value.growth?.status !== "paused") throw new Error(`Restart restored ${bootstrap.value.growth?.status ?? "no"} Goal instead of paused`)
  if (!bootstrap.value.project) throw new Error("Restart did not restore the project")
  const workbenches = await page.evaluate(async (projectId) => window.creatx.readWorkbenches(projectId), bootstrap.value.project.id)
  if (!workbenches.ok) throw new Error(workbenches.error.message)
  const roots = workbenches.value.workbenches.filter((workbench) => workbench.folder !== "." && !workbench.folder.includes("/"))
  if (roots.length !== 1) throw new Error(`Expected one root workbench after restart, found ${roots.length}`)
  const root = roots[0]!
  await page.getByTitle(`${root.title}工作台`).click()
  await page.locator(".files-workbench").waitFor({ timeout: 30_000 })
  await page.locator(".workbench-header strong", { hasText: root.title }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  await assertContentFiles(before)
  await page.screenshot({ path: join(evidenceDir, "restarted.png"), timeout: 90_000 })
  const result = {
    status: "ELECTRON GROWTH WORLD PRO FIXED RECOVERY LIVE PASS",
    goalId: bootstrap.value.growth.goalId,
    goalStatus: bootstrap.value.growth.status,
    projectRoot,
    rootWorkbench: { title: root.title, folder: root.folder },
    contentFiles: before.size,
    screenshot: "restarted.png",
  }
  await writeFile(join(evidenceDir, "recovery-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} finally {
  await closeAndAssert(pid)
}

async function snapshotContentFiles() {
  const files = (await listFiles(projectRoot)).filter((path) => !relative(projectRoot, path).startsWith(".creatx"))
  return new Map(await Promise.all(files.map(async (path) => [relative(projectRoot, path), `${(await stat(path)).size}:${(await stat(path)).mtimeMs}`] as const)))
}

async function assertContentFiles(expected: Map<string, string>) {
  const current = await snapshotContentFiles()
  if (current.size !== expected.size) throw new Error("Project files changed after paused restart")
  for (const [path, fingerprint] of expected) if (current.get(path) !== fingerprint) throw new Error(`Project file changed after paused restart: ${path}`)
  const truth = [...current.keys()].find((path) => basename(path) === "世界真相.md")
  if (!truth || !(await readFile(join(projectRoot, truth), "utf8")).includes("可验证的真实记忆")) throw new Error("Persistent correction is missing after restart")
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

async function closeAndAssert(pid: number) {
  const closed = await Promise.race([app.close().then(() => true), new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 20_000))])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 20 seconds`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 750))
  try {
    process.kill(pid, 0)
    throw new Error(`Electron main process ${pid} is still alive after close`)
  } catch (error) {
    if (error instanceof Error && error.message.includes("still alive")) throw error
  }
  const escaped = userData.replaceAll("'", "''")
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$needle*" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${userData}`)
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
