import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { access } from "node:fs/promises"
import { dirname, join } from "node:path"

export interface VideoBinaries {
  ytDlp: string
  ffmpeg: string
  root: string
}

export interface RunBinaryOptions {
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
  env?: Record<string, string>
  maxStdoutBytes?: number
  maxStderrBytes?: number
}

export interface RunBinaryResult {
  code: number | null
  stdout: string
  stderr: string
  truncated: boolean
  durationMs: number
}

const live = new Set<ChildProcess>()
const exitHook = { installed: false }

// Packaged first: electron-builder puts extraResources under process.resourcesPath, and an .exe
// inside app.asar cannot be spawned at all. The remaining candidates are the dev-tree layouts.
export async function resolveVideoBinaries(candidateRoots: readonly string[]): Promise<VideoBinaries> {
  const found = await Promise.all(candidateRoots.map(async (root) => {
    const ytDlp = join(root, "yt-dlp.exe")
    const ffmpeg = join(root, "ffmpeg.exe")
    const usable = await Promise.all([access(ytDlp).then(() => true, () => false), access(ffmpeg).then(() => true, () => false)])
    return usable[0] && usable[1] ? { ytDlp, ffmpeg, root } : undefined
  }))
  const binaries = found.find((candidate) => candidate !== undefined)
  if (binaries) return binaries
  throw new Error(`video_binary: 未找到 yt-dlp.exe 与 ffmpeg.exe，已查找：${candidateRoots.join(" | ")}`)
}

export async function runBinary(binaryPath: string, args: readonly string[], options: RunBinaryOptions): Promise<RunBinaryResult> {
  options.signal?.throwIfAborted()
  installExitHook()
  const startedAt = Date.now()
  const limits = { stdout: options.maxStdoutBytes ?? 12_000_000, stderr: options.maxStderrBytes ?? 256_000 }
  const child = spawn(binaryPath, [...args], {
    cwd: options.cwd,
    windowsHide: true,
    // argv array with shell:false. A shell string would let a video title, a filename or a
    // redirect character inside any argument become a command.
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      // PATH is exactly the vendor directory so yt-dlp finds our pinned ffmpeg and can never
      // pick up a different one from the user's machine.
      PATH: dirname(binaryPath),
      PATHEXT: ".EXE",
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      windir: process.env.windir ?? "C:\\Windows",
      // yt-dlp.exe is a PyInstaller onefile; it unpacks itself into TEMP and refuses to start
      // when TEMP is missing. The caller must have created cwd before calling this.
      TEMP: options.cwd,
      TMP: options.cwd,
      // Without this yt-dlp writes Chinese titles to the pipe in the Windows ANSI codepage and
      // --dump-single-json comes back as mojibake or fails to parse outright.
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      ...options.env,
    },
  })
  live.add(child)

  const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] }
  const state = { stdout: 0, stderr: 0, truncated: false, stopped: undefined as Error | undefined }
  const collect = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
    const remaining = limits[stream] - state[stream]
    if (remaining <= 0) {
      state.truncated = true
      return
    }
    state[stream] += Math.min(chunk.byteLength, remaining)
    chunks[stream].push(chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining))
    if (chunk.byteLength > remaining) state.truncated = true
  }
  child.stdout.on("data", collect("stdout"))
  child.stderr.on("data", collect("stderr"))

  const stop = (reason: Error) => {
    if (state.stopped) return
    state.stopped = reason
    killProcessTree(child)
  }
  const timer = setTimeout(() => stop(new Error(`video_network: ${binaryLabel(binaryPath)} 超过 ${options.timeoutMs}ms 未完成，已终止。`)), options.timeoutMs)
  const abort = () => stop(new Error("video_cancelled: 已取消。"))
  options.signal?.addEventListener("abort", abort, { once: true })

  return await new Promise<RunBinaryResult>((resolve, reject) => {
    child.once("error", (error) => {
      const code = Reflect.get(error, "code")
      // A quarantined or blocked binary surfaces here, not as a nonzero exit. Naming the path
      // is the difference between an actionable report and "something failed".
      if (code === "ENOENT" || code === "EPERM" || code === "EACCES") {
        reject(new Error(`video_binary: 无法启动 ${binaryPath}（${String(code)}）。该文件可能被安全软件隔离或删除。`))
        return
      }
      reject(new Error(`video_binary: ${binaryLabel(binaryPath)} 启动失败：${error.message}`))
    })
    child.once("close", (code) => {
      if (state.stopped) {
        reject(state.stopped)
        return
      }
      resolve({
        code,
        stdout: Buffer.concat(chunks.stdout).toString("utf8"),
        stderr: Buffer.concat(chunks.stderr).toString("utf8"),
        truncated: state.truncated,
        durationMs: Date.now() - startedAt,
      })
    })
  }).finally(() => {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
    live.delete(child)
  })
}

// Async teardown for the normal shutdown path. spawnSync here would freeze the Electron main
// process — and therefore the whole UI — for as long as taskkill takes.
export function killProcessTree(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== "win32") {
    child.kill("SIGKILL")
    return
  }
  if (child.pid === undefined) return
  // yt-dlp spawns ffmpeg as a child, so killing only the direct pid leaves the grandchild
  // holding a handle on the job directory. /T takes the whole tree.
  spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", detached: true }).unref()
}

export function disposeVideoBinaries() {
  live.forEach((child) => killProcessTree(child))
  live.clear()
}

// main.ts force-exits 8s into shutdown, and Electron does not put spawned children into a
// Windows job object. Nothing async runs during "exit", so this must be the synchronous kill.
function installExitHook() {
  if (exitHook.installed) return
  exitHook.installed = true
  process.once("exit", () => {
    live.forEach((child) => {
      if (child.pid === undefined || child.exitCode !== null) return
      if (process.platform !== "win32") {
        child.kill("SIGKILL")
        return
      }
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
    })
    live.clear()
  })
}

function binaryLabel(binaryPath: string) {
  return binaryPath.split(/[\\/]/u).pop() ?? binaryPath
}
