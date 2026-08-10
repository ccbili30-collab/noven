import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { join, sep } from "node:path"
import { tmpdir } from "node:os"

const testRoot = mkdtempSync(join(tmpdir(), "creatx-single-instance-"))
const profileA = join(testRoot, "profile-a")
const profileB = join(testRoot, "profile-b")
const configuredExecutable = process.env.CREATX_SINGLE_INSTANCE_EXECUTABLE?.trim()
const electron = configuredExecutable || join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
const processes: ChildProcess[] = []
const processLogs = new Map<number, string>()

const runError = await run().then(() => undefined, (error: unknown) => error)
const cleanupError = await cleanup()
if (runError) throw runError
if (cleanupError) throw cleanupError

async function run() {
  const first = startElectron(profileA)
  await waitForWindow(first, 30_000)

  const second = startElectron(profileA)
  const secondExitCode = await waitForExit(second, 10_000)
  if (secondExitCode !== 0) throw new Error(`same-profile second instance exited with code ${secondExitCode}`)
  assertAlive(first, "primary instance exited after the same-profile launch")

  const differentProfile = startElectron(profileB)
  await waitForWindow(differentProfile, 30_000)
  assertAlive(first, "primary instance exited while a different profile started")

  console.log(JSON.stringify({
    primaryPid: first.pid,
    sameProfileSecondPid: second.pid,
    sameProfileSecondExited: true,
    sameProfileSecondExitCode: secondExitCode,
    primaryAliveAfterSecondLaunch: first.exitCode === null,
    differentProfilePid: differentProfile.pid,
    differentProfileAlive: differentProfile.exitCode === null,
  }, null, 2))
}

async function cleanup() {
  processes.forEach((child) => {
    if (!child.pid || child.exitCode !== null) return
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
  })
  const resolvedRoot = realpathSync(testRoot)
  const resolvedTemp = realpathSync(tmpdir())
  if (!resolvedRoot.toLowerCase().startsWith(`${resolvedTemp.toLowerCase()}${sep}`)) {
    return new Error(`refusing to remove unexpected test path: ${resolvedRoot}`)
  }
  for (const attempt of Array.from({ length: 20 }, (_value, index) => index)) {
    try {
      rmSync(resolvedRoot, { recursive: true, force: true })
      return undefined
    } catch (error) {
      if (attempt === 19) return error
      await Bun.sleep(250)
    }
  }
}

function startElectron(profile: string) {
  const child = spawn(electron, [...(configuredExecutable ? [] : ["."]), `--user-data-dir=${profile}`], {
    cwd: process.cwd(),
    env: { ...process.env, CREATX_DESKTOP_TEST: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (child.pid) processLogs.set(child.pid, "")
  child.stdout?.on("data", (data) => appendProcessLog(child.pid, data.toString()))
  child.stderr?.on("data", (data) => appendProcessLog(child.pid, data.toString()))
  processes.push(child)
  return child
}

async function waitForWindow(child: ChildProcess, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    assertAlive(child, `Electron exited before creating its window\n${readProcessLog(child.pid)}`)
    if (readMainWindowHandle(child.pid) !== 0) return
    await Bun.sleep(250)
  }
  throw new Error(`Electron ${child.pid} did not create a window within ${timeoutMs}ms\n${readProcessLog(child.pid)}`)
}

function readMainWindowHandle(pid: number | undefined) {
  if (!pid) return 0
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowHandle`], {
    encoding: "utf8",
    windowsHide: true,
  })
  return Number.parseInt(result.stdout.trim(), 10) || 0
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Electron ${child.pid} did not exit within ${timeoutMs}ms`)), timeoutMs)
    child.once("exit", (code) => {
      clearTimeout(timeout)
      resolve(code ?? -1)
    })
  })
}

function assertAlive(child: ChildProcess, message: string) {
  if (child.exitCode !== null) throw new Error(`${message}: exit code ${child.exitCode}`)
}

function appendProcessLog(pid: number | undefined, value: string) {
  if (!pid) return
  processLogs.set(pid, `${processLogs.get(pid) ?? ""}${value}`.slice(-8_000))
}

function readProcessLog(pid: number | undefined) {
  if (!pid) return ""
  return processLogs.get(pid) ?? ""
}
