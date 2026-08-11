import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { formatCookieJar, resolveVideoBinaries, runBinary } from "@creatx/video-runtime"
import { classifyYtDlpFailure, probeArgs } from "@creatx/video-runtime"

// Answers the one question the offline tests cannot: does 抖音 issue usable anti-bot cookies to
// 诺文's own Chromium, and does yt-dlp then get past the gate that refuses anonymous extraction?
//
//   bun run test:douyin-cookies                 probe with a non-existent id
//   bun run test:douyin-cookies -- "<抖音链接>"   probe a real video end to end
//
// Passing means the classified failure changed away from video_auth. With a real link it means
// the probe returned actual metadata.
//
// A minimal Electron main is launched rather than the whole app: the mechanism under test is
// BrowserWindow plus session cookies, and booting the full runtime adds minutes and unrelated
// failure modes. apps/desktop/src/douyin-cookies.ts performs these same steps in production.

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const target = process.argv.slice(2).filter((entry) => entry !== "--").join(" ").trim() || "https://www.douyin.com/video/7412345678901234567"
const root = await mkdtemp(join(tmpdir(), "noven-douyin-cookies-"))
const binaries = await resolveVideoBinaries([join(workspace, "apps", "desktop", "vendor", "win-x64")])
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

const harness = join(root, "cookie-harness.cjs")
await writeFile(harness, `
const { app, BrowserWindow, session } = require("electron")
const partition = "persist:noven-douyin-probe"
const userAgent = ${JSON.stringify(userAgent)}
app.whenReady().then(async () => {
  const store = session.fromPartition(partition)
  store.setUserAgent(userAgent)
  const window = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, images: false } })
  const wanted = ["ttwid", "__ac_nonce", "msToken", "odin_tt"]
  let cookies = []
  try {
    await window.loadURL("https://www.douyin.com/", { userAgent }).catch(() => undefined)
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      cookies = await store.cookies.get({ domain: ".douyin.com" }).catch(() => [])
      if (cookies.some((cookie) => wanted.includes(cookie.name))) break
      await new Promise((done) => setTimeout(done, 500))
    }
  } finally {
    process.stdout.write("COOKIES:" + JSON.stringify(cookies) + "\\n")
    if (!window.isDestroyed()) window.destroy()
    app.exit(0)
  }
})
`, "utf8")

try {
  const acquired = await new Promise<Array<{ name: string; value: string; domain?: string; path?: string; secure?: boolean; expirationDate?: number }>>((done, fail) => {
    // ELECTRON_RUN_AS_NODE makes electron.exe behave as plain Node with no BrowserWindow at all.
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE"))
    const child = spawn(join(workspace, "node_modules", "electron", "dist", "electron.exe"), [harness, `--user-data-dir=${join(root, "electron-data")}`], { cwd: root, windowsHide: true, env: environment, stdio: ["ignore", "pipe", "pipe"] })
    const output: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk))
    const timer = setTimeout(() => child.kill(), 90_000)
    child.once("close", () => {
      clearTimeout(timer)
      const line = Buffer.concat(output).toString("utf8").split("\n").find((entry) => entry.startsWith("COOKIES:"))
      if (!line) return fail(new Error(`the Electron harness produced no cookie line: ${Buffer.concat(output).toString("utf8").slice(-500)}`))
      done(JSON.parse(line.slice("COOKIES:".length)) as never)
    })
    child.once("error", fail)
  })

  const jar = join(root, "cookies.txt")
  await writeFile(jar, formatCookieJar(acquired.map((cookie) => ({
    domain: cookie.domain ?? ".douyin.com",
    path: cookie.path ?? "/",
    secure: cookie.secure === true,
    ...(cookie.expirationDate === undefined ? {} : { expiresAt: cookie.expirationDate }),
    name: cookie.name,
    value: cookie.value,
  }))), "utf8")

  const withoutCookies = await runBinary(binaries.ytDlp, probeArgs(target, "none"), { cwd: root, timeoutMs: 90_000 })
  const withCookies = await runBinary(binaries.ytDlp, probeArgs(target, "noven", jar), { cwd: root, timeoutMs: 90_000 })
  const gateCleared = withCookies.code === 0 || !classifyYtDlpFailure(withCookies.stderr).message.startsWith("video_auth")

  console.log(JSON.stringify({
    status: gateCleared ? "DOUYIN COOKIE PASS" : "DOUYIN COOKIE FAIL",
    target,
    cookiesIssued: acquired.map((cookie) => cookie.name).sort(),
    anonymous: { exitCode: withoutCookies.code, classified: classifyYtDlpFailure(withoutCookies.stderr).message.split(":")[0] },
    withNovenCookies: { exitCode: withCookies.code, classified: withCookies.code === 0 ? "ok" : classifyYtDlpFailure(withCookies.stderr).message.split(":")[0], stderr: withCookies.stderr.trim().slice(-400) },
    ...(withCookies.code === 0 ? { title: (JSON.parse(withCookies.stdout) as { title?: string }).title } : {}),
  }, null, 2))
  if (!gateCleared) process.exitCode = 1
} finally {
  await rm(root, { recursive: true, force: true })
}
