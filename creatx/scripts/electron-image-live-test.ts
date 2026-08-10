import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"

const deepseekApiKey = requireEnvironment("DEEPSEEK_API_KEY")
const imageBaseUrl = requireEnvironment("CREATX_IMAGE_BASE_URL")
const imageApiKey = requireEnvironment("CREATX_IMAGE_API_KEY")
const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 图片验收项目 "))
const userData = await mkdtemp(join(tmpdir(), "creatx-image-live-"))
const evidenceDir = resolve(workspace, "..", "artifacts", "image-runtime")
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
const prompt = "帮我生成一张黄昏下的海边灯塔插画，保存在项目里。"
let relativePath = ""
let diskPath = ""
let shellApprovals = 0

await mkdir(evidenceDir, { recursive: true })
await writeFile(join(projectRoot, "开始.md"), "# 图片创作项目", "utf8")

try {
  const first = await launchDesktop()
  try {
    await assertHealthyWindow(first.page)
    await first.page.getByTitle("新会话").click()
    await first.page.locator(".session-item").first().waitFor({ timeout: 30_000 })
    await setNewestSessionApproval(first.page)
    await first.page.locator("textarea").fill(prompt)
    await first.page.getByTitle("发送").click()
    await first.page.locator('.workspace-shell[data-run-state="running"]').waitFor({ timeout: 15_000 })

    const dialog = first.page.getByRole("dialog")
    await dialog.waitFor({ timeout: 90_000 })
    let title = await dialog.getByRole("heading").innerText()
    if (title.includes("运行命令")) {
      requireSingleReadOnlyProjectListing(await dialog.locator("pre").innerText())
      shellApprovals += 1
      await dialog.getByRole("button", { name: "允许一次", exact: true }).click()
      await dialog.waitFor({ state: "hidden" })
      await dialog.waitFor({ timeout: 90_000 })
      title = await dialog.getByRole("heading").innerText()
    }
    if (!title.includes("生成图片")) throw new Error(`Natural-language image request asked for an unexpected approval after project inspection: ${title}`)
    const input = requireImageApproval(await dialog.locator("pre").innerText())
    relativePath = input.relativePath
    diskPath = resolve(projectRoot, relativePath)
    if (await fileExists(diskPath)) throw new Error("Image existed before approval")

    await dialog.getByRole("button", { name: "允许一次", exact: true }).click()
    await dialog.waitFor({ state: "hidden" })
    await waitForFile(diskPath, 210_000)
    await settleRunAfterImage(first.page)
    const decoded = await decodeWithWindows(diskPath)

    await first.page.getByTitle("文件", { exact: true }).click()
    const row = first.page.locator(".file-row", { hasText: basename(relativePath) })
    await row.waitFor({ timeout: 30_000 })
    await row.click()
    const image = first.page.locator(".image-preview img")
    await image.waitFor()
    const preview = await image.evaluate((element) => ({
      source: element.getAttribute("src"),
      width: (element as HTMLImageElement).naturalWidth,
      height: (element as HTMLImageElement).naturalHeight,
    }))
    if (!preview.source?.startsWith("data:image/") || preview.width < 1 || preview.height < 1) {
      throw new Error(`Renderer did not decode the real image preview: ${JSON.stringify(preview)}`)
    }
    await first.page.screenshot({ path: join(evidenceDir, "electron-image-live.png"), timeout: 90_000 })
    console.log(`electron-image-live: generated ${relativePath}; Windows decoder=${decoded}; Renderer=${preview.width}x${preview.height}`)
  } catch (error) {
    await first.page.screenshot({ path: join(evidenceDir, "electron-image-live-failure.png") }).catch(() => undefined)
    throw error
  } finally {
    await closeAndAssert(first.app, first.pid)
  }

  const second = await launchDesktop()
  try {
    await assertHealthyWindow(second.page)
    await second.page.locator(".message.user", { hasText: prompt }).waitFor({ timeout: 30_000 })
    await second.page.getByTitle("文件", { exact: true }).click()
    const row = second.page.locator(".file-row", { hasText: basename(relativePath) })
    await row.waitFor({ timeout: 30_000 })
    await row.click()
    const image = second.page.locator(".image-preview img")
    await image.waitFor()
    const recovered = await image.evaluate((element) => ({
      source: element.getAttribute("src"),
      width: (element as HTMLImageElement).naturalWidth,
      height: (element as HTMLImageElement).naturalHeight,
    }))
    if (!recovered.source?.startsWith("data:image/") || recovered.width < 1 || recovered.height < 1) {
      throw new Error(`Restart did not recover the real image preview: ${JSON.stringify(recovered)}`)
    }
    if (!(await fileExists(diskPath))) throw new Error("Restarted project lost the generated image")
    await second.page.screenshot({ path: join(evidenceDir, "electron-image-restarted.png"), timeout: 90_000 })
  } finally {
    await closeAndAssert(second.app, second.pid)
  }

  console.log(JSON.stringify({
    status: "ELECTRON IMAGE LIVE PASS",
    provider: "JMRAI",
    relativePath,
    approval: "generate_image",
    shellApprovals,
    preview: true,
    restart: true,
    screenshots: ["electron-image-live.png", "electron-image-restarted.png"],
  }))
} finally {
  await Promise.all([rm(projectRoot, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })])
}

async function launchDesktop() {
  const app = await electron.launch({
    executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
    args: [workspace, `--user-data-dir=${userData}`],
    cwd: workspace,
    env: {
      ...inheritedEnvironment,
      CREATX_PROJECT_ROOT: projectRoot,
      DEEPSEEK_API_KEY: deepseekApiKey,
      CREATX_IMAGE_BASE_URL: imageBaseUrl,
      CREATX_IMAGE_API_KEY: imageApiKey,
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

async function setNewestSessionApproval(page: Page) {
  const result = await page.evaluate(async () => {
    const bootstrap = await window.creatx.bootstrap()
    if (!bootstrap.ok) return { ok: false as const, detail: bootstrap.error.message }
    const session = bootstrap.value.sessions[0]
    if (!session) return { ok: false as const, detail: "No session exists" }
    const changed = await window.creatx.setSessionPermissionMode(session.id, "approval")
    if (!changed.ok) return { ok: false as const, detail: changed.error.message }
    return { ok: true as const, mode: changed.value.permission.mode }
  })
  if (!result.ok || result.mode !== "approval") throw new Error(`Could not set approval mode: ${result.detail ?? result.mode}`)
}

function requireImageApproval(inputText: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Invalid generate_image input: ${inputText}`)
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== "prompt" && key !== "relativePath" && key !== "model")) throw new Error(`Unexpected generate_image fields: ${inputText}`)
  if (typeof value.prompt !== "string" || value.prompt.trim().length < 10) throw new Error(`Image prompt is not meaningful: ${inputText}`)
  const promptText = value.prompt.toLocaleLowerCase("en-US")
  if (!/(灯塔|lighthouse)/i.test(promptText) || !/(黄昏|dusk|sunset)/i.test(promptText) || !/(海边|海洋|seaside|ocean|sea)/i.test(promptText)) {
    throw new Error(`Image prompt does not preserve the user's lighthouse, dusk, and seaside intent: ${inputText}`)
  }
  if (typeof value.relativePath !== "string" || isAbsolute(value.relativePath)) throw new Error(`Image path is not project-relative: ${inputText}`)
  const target = resolve(projectRoot, value.relativePath)
  const projectRelative = relative(projectRoot, target)
  if (!projectRelative || projectRelative.startsWith("..") || isAbsolute(projectRelative)) throw new Error(`Image path escaped the project: ${inputText}`)
  if (!/\.(png|jpe?g|webp)$/i.test(value.relativePath)) throw new Error(`Image path has an unsupported extension: ${inputText}`)
  if (value.model !== undefined && value.model !== "gpt-image-2-cheap" && value.model !== "gpt-image-2") throw new Error(`Unsupported image model: ${inputText}`)
  return { prompt: value.prompt, relativePath: value.relativePath.replaceAll("\\", "/"), ...(typeof value.model === "string" ? { model: value.model } : {}) }
}

function requireSingleReadOnlyProjectListing(inputText: string) {
  const input: unknown = JSON.parse(inputText)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Invalid Shell input: ${inputText}`)
  const raw = (input as Record<string, unknown>).commands
  const commands = typeof raw === "string" ? [raw] : Array.isArray(raw) && raw.every((command) => typeof command === "string") ? raw : []
  if (commands.length !== 1) throw new Error(`Image project inspection must contain exactly one command: ${inputText}`)
  const command = commands[0]!.trim()
  const accepted = [
    `dir /b /s ${projectRoot}`,
    `dir /b /s "${projectRoot}"`,
    `dir /b /s /a:d ${projectRoot}`,
    `dir /b /s /a:d "${projectRoot}"`,
    `ls -la "${projectRoot}"`,
    "dir /b /a-d 2>nul & dir /b /ad 2>nul",
  ]
  if (!accepted.includes(command)) {
    throw new Error(`Image project inspection is not the accepted read-only project listing: ${inputText}`)
  }
}

async function settleRunAfterImage(page: Page) {
  for (;;) {
    await page.waitForFunction(() => Boolean(
      document.querySelector('[role="dialog"]')
      || document.querySelector('.workspace-shell[data-run-state="completed"], .workspace-shell[data-run-state="failed"], .workspace-shell[data-run-state="cancelled"], .workspace-shell[data-run-state="unknown"]'),
    ), undefined, { timeout: 240_000 })
    const state = await page.locator(".workspace-shell").getAttribute("data-run-state")
    if (state === "completed") return
    if (state && state !== "running") throw new Error(`Image run reached unexpected terminal state: ${state}`)

    const dialog = page.getByRole("dialog")
    const title = await dialog.getByRole("heading").innerText()
    if (!title.includes("运行命令") || shellApprovals >= 2) throw new Error(`Image run requested an unexpected post-generation approval: ${title}`)
    requireSingleReadOnlyProjectListing(await dialog.locator("pre").innerText())
    shellApprovals += 1
    await dialog.getByRole("button", { name: "允许一次", exact: true }).click()
    await dialog.waitFor({ state: "hidden" })
  }
}

async function waitForFile(path: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await fileExists(path)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Timed out waiting for ${path}`)
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function decodeWithWindows(path: string) {
  const escaped = path.replaceAll("'", "''")
  const command = `Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Image]::FromFile('${escaped}'); try { Write-Output ($image.Width.ToString() + 'x' + $image.Height.ToString() + ':' + $image.RawFormat.Guid.ToString()) } finally { $image.Dispose() }`
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", command])
  const decoded = stdout.trim()
  if (!/^\d+x\d+:[0-9a-f-]+$/i.test(decoded)) throw new Error(`Windows image decoder returned an invalid result: ${decoded}`)
  return decoded
}

async function closeAndAssert(app: ElectronApplication, pid: number) {
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise<false>((resolveDelay) => setTimeout(() => resolveDelay(false), 15_000)),
  ])
  if (!closed) {
    app.process().kill()
    throw new Error(`Electron ${pid} did not exit within 15 seconds`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  try {
    process.kill(pid, 0)
    throw new Error(`Electron main process ${pid} is still alive after close`)
  } catch (error) {
    if (error instanceof Error && error.message.includes("still alive")) throw error
  }
  const escaped = userData.replaceAll("'", "''")
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `$needle='${escaped}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like \"*$needle*\" }).Count`])
  if (Number(stdout.trim()) !== 0) throw new Error(`Electron child processes still reference ${userData}`)
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`ELECTRON IMAGE LIVE FAIL: ${name} is not configured`)
  return value
}
