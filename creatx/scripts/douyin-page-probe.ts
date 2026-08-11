import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extractDouyinUrl } from "@creatx/video-runtime"

// Diagnostic, not a test. yt-dlp cannot extract 抖音 any more — its web detail API needs an
// a_bogus signature computed by 抖音's own JavaScript. 诺文 is a real Chromium that renders the
// page for real, so this asks whether the playable media URL can simply be observed instead of
// forged: it watches every request the page makes and reads the player element afterwards.
//
//   bun run scripts/douyin-page-probe.ts -- "<抖音链接或整段分享文案>"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const input = process.argv.slice(2).filter((entry) => entry !== "--").join(" ").trim()
if (!input) throw new Error('Pass the 抖音 link or share text')
const target = extractDouyinUrl(input)
const root = await mkdtemp(join(tmpdir(), "noven-douyin-probe-"))
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

const harness = join(root, "probe.cjs")
await writeFile(harness, `
const { app, BrowserWindow, session } = require("electron")
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
const partition = "persist:noven-douyin-probe2"
const userAgent = ${JSON.stringify(userAgent)}
const target = ${JSON.stringify(target)}
const media = new Set()
app.whenReady().then(async () => {
  const store = session.fromPartition(partition)
  store.setUserAgent(userAgent)
  store.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (/\\.(mp4|m4s|m3u8)(\\?|$)/i.test(details.url) || /aweme\\/v1\\/(web|play)/i.test(details.url) || details.resourceType === "media") media.add(details.resourceType + " " + details.url)
    callback({})
  })
  const window = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const report = { target, finalUrl: "", title: "", cookies: [], mediaRequests: [], videoElementSrc: "", routerDataKeys: [], playAddrFound: [] }
  try {
    await window.loadURL(target, { userAgent }).catch((error) => { report.loadError = String(error && error.message) })
    await new Promise((done) => setTimeout(done, 12000))
    report.finalUrl = window.webContents.getURL()
    report.title = await window.webContents.executeJavaScript("document.title").catch(() => "")
    report.videoElementSrc = await window.webContents.executeJavaScript("(document.querySelector('video')||{}).src || ''").catch(() => "")
    report.routerDataKeys = await window.webContents.executeJavaScript("Object.keys(window._ROUTER_DATA||window.__INIT_PROPS__||window.__RENDER_DATA__||{})").catch(() => [])
    // Scan the rendered document for anything shaped like a 抖音 media address.
    report.playAddrFound = await window.webContents.executeJavaScript("(document.documentElement.innerHTML.match(/https?:\\\\/\\\\/[^\\"'\\\\s\\\\\\\\]*(?:douyinvod|aweme|zjcdn|bytecdn)[^\\"'\\\\s\\\\\\\\]*/g)||[]).slice(0,5)").catch(() => [])
    const jar = await store.cookies.get({ domain: ".douyin.com" }).catch(() => [])
    report.cookies = jar.map((cookie) => cookie.name).sort()
    report.mediaRequests = [...media].slice(0, 12)
  } finally {
    process.stdout.write("REPORT:" + JSON.stringify(report) + "\\n")
    if (!window.isDestroyed()) window.destroy()
    app.exit(0)
  }
})
`, "utf8")

try {
  const report = await new Promise<string>((done, fail) => {
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE"))
    const child = spawn(join(workspace, "node_modules", "electron", "dist", "electron.exe"), [harness, `--user-data-dir=${join(root, "electron-data")}`], { cwd: root, windowsHide: true, env: environment, stdio: ["ignore", "pipe", "pipe"] })
    const output: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk))
    const timer = setTimeout(() => child.kill(), 120_000)
    child.once("close", () => {
      clearTimeout(timer)
      const line = Buffer.concat(output).toString("utf8").split("\n").find((entry) => entry.startsWith("REPORT:"))
      line ? done(line.slice("REPORT:".length)) : fail(new Error(`no report: ${Buffer.concat(output).toString("utf8").slice(-600)}`))
    })
    child.once("error", fail)
  })
  console.log(JSON.stringify(JSON.parse(report) as unknown, null, 2))
} finally {
  await rm(root, { recursive: true, force: true })
}
