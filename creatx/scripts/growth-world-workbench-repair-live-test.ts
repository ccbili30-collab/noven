import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const providerBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const providerApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const sourceProject = resolve(workspace, "..", "artifacts", "growth-world-live", "proMedieval", "project")
const evidenceDir = resolve(workspace, "..", "artifacts", "growth-world-live", "proMedieval-workbench-repair")
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX Growth World 工作台修正 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-growth-world-workbench-repair-"))
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const prompt = `请修正当前《灰冠诸境》的工作台结构。先读取创作计划、世界导览和各集合索引，判断哪些已经具有独立展示、反复进入或持续操作价值。

要求：
- 保留现有根工作台，并从现有成熟集合中再注册至少三个工作台；
- 只注册已经拥有可读索引和真实实体的目录，不注册空目录、临时目录或职责重叠的同义集合；
- 不创建、移动、重命名或修改任何世界正文，不重新生成世界；
- 不直接编辑 .creatx，只通过 CreatX 工作台工具注册；
- 完成后简要说明选择了哪些集合以及理由。`

await rm(evidenceDir, { recursive: true, force: true })
await mkdir(evidenceDir, { recursive: true })
await cp(sourceProject, projectRoot, { recursive: true })
const contentHashesBefore = await snapshotContentFiles()

try {
  const first = await launchDesktop()
  let registered: WorkbenchRecord[] = []
  try {
    await assertHealthyWindow(first.page)
    await installRuntimeTrap(first.page)
    await first.page.getByTitle("新会话").click()
    await first.page.locator(".session-tree-row").first().waitFor({ timeout: 30_000 })
    await first.page.locator("textarea").fill(prompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })
    await first.page.locator('.workspace-shell[data-run-state="completed"]').waitFor({ timeout: 240_000 })
    await assertNoRuntimeErrors(first.page)

    registered = await readWorkbenches()
    assertWorkbenchRepair(registered)
    await assertContentUnchanged(contentHashesBefore)
    await assertWorkbenchRenderer(first.page, registered)
    await first.page.screenshot({ path: join(evidenceDir, "registered.png"), timeout: 90_000 })
  } catch (error) {
    await first.page.screenshot({ path: join(evidenceDir, "failure.png"), timeout: 90_000 }).catch(() => undefined)
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid)
  }

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    const restored = await readWorkbenches()
    assertWorkbenchRepair(restored)
    await assertContentUnchanged(contentHashesBefore)
    await assertWorkbenchRenderer(second.page, restored)
    await second.page.screenshot({ path: join(evidenceDir, "restarted.png"), timeout: 90_000 })
    registered = restored
  } finally {
    await closeAndAssert(second.app, second.pid)
  }

  await cp(projectRoot, join(evidenceDir, "project"), { recursive: true })
  const result = {
    status: "ELECTRON GROWTH WORLD WORKBENCH REPAIR LIVE PASS",
    provider: "JMRAI gpt-5.6-luna",
    sourceProject,
    contentUnchanged: true,
    restart: true,
    workbenches: registered,
    screenshots: ["registered.png", "restarted.png"],
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} finally {
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

interface WorkbenchRecord {
  schemaVersion: number
  id: string
  folder: string
  title?: string
}

async function launchDesktop() {
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
  return { app, pid, page: await app.firstWindow() }
}

async function assertHealthyWindow(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.locator(".workspace-shell").waitFor({ timeout: 30_000 })
  if (pageErrors.length || consoleErrors.length) throw new Error(`Renderer errors: ${JSON.stringify({ pageErrors, consoleErrors })}`)
}

async function installRuntimeTrap(page: Page) {
  await page.evaluate(() => {
    const errors: string[] = []
    Object.defineProperty(window, "__creatxWorkbenchRepairErrors", { value: errors, configurable: true })
    window.creatx.onEvent((event) => {
      if (event.type === "runtime.error") errors.push(`${event.error.code}: ${event.error.detail ?? event.error.message}`)
    })
  })
}

async function assertNoRuntimeErrors(page: Page) {
  const errors = await page.evaluate(() => (window as unknown as { __creatxWorkbenchRepairErrors?: string[] }).__creatxWorkbenchRepairErrors ?? [])
  if (errors.length) throw new Error(`Runtime emitted errors: ${JSON.stringify(errors)}`)
  if (await page.getByRole("dialog").count()) throw new Error("Free session displayed an approval dialog")
}

async function readWorkbenches() {
  const directory = join(projectRoot, ".creatx", "workbenches")
  const names = await readdir(directory)
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as WorkbenchRecord))
}

function assertWorkbenchRepair(workbenches: WorkbenchRecord[]) {
  if (!workbenches.some((workbench) => workbench.folder === "灰冠诸境")) throw new Error("Root workbench was removed")
  const nested = workbenches.filter((workbench) => workbench.folder.startsWith("灰冠诸境/"))
  if (nested.length < 3) throw new Error(`Only ${nested.length} nested workbenches were registered: ${JSON.stringify(workbenches)}`)
  const folders = new Set(workbenches.map((workbench) => workbench.folder))
  if (folders.size !== workbenches.length) throw new Error(`Duplicate workbench folders: ${JSON.stringify(workbenches)}`)
}

async function assertWorkbenchRenderer(page: Page, workbenches: WorkbenchRecord[]) {
  const titles = workbenches.map((workbench) => workbench.title ?? workbench.folder.split("/").at(-1)!)
  for (const title of titles) await page.locator(".workbench-button", { hasText: title }).waitFor({ timeout: 30_000 })
  const nested = workbenches.find((workbench) => workbench.folder.startsWith("灰冠诸境/"))
  if (!nested) throw new Error("No nested workbench available for Renderer verification")
  const title = nested.title ?? nested.folder.split("/").at(-1)!
  await page.locator(".workbench-button", { hasText: title }).click()
  await page.locator(".files-workbench").waitFor({ timeout: 30_000 })
  await page.locator(".workbench-header strong", { hasText: title }).waitFor({ timeout: 30_000 })
}

async function snapshotContentFiles() {
  const files = await listFiles(projectRoot)
  return new Map(await Promise.all(files.filter((path) => !path.startsWith(join(projectRoot, ".creatx"))).map(async (path) => [
    path.slice(projectRoot.length + 1),
    createHash("sha256").update(await readFile(path)).digest("hex"),
  ] as const)))
}

async function assertContentUnchanged(expected: Map<string, string>) {
  const current = await snapshotContentFiles()
  if (current.size !== expected.size) throw new Error(`Content file count changed from ${expected.size} to ${current.size}`)
  for (const [path, hash] of expected) {
    if (current.get(path) !== hash) throw new Error(`World content changed during workbench repair: ${path}`)
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

async function closeAndAssert(app: ElectronApplication, pid: number) {
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
