import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const factors = [1, 1.25, 1.5, 2]
const surfaces = ["image", "document", "iframe"] as const
const results = []

for (const factor of factors) {
  const userData = await mkdtemp(join(tmpdir(), `creatx-workbench-capture-${factor}-`))
  const app = await electron.launch({
    executablePath: resolve(workspace, "node_modules", "electron", "dist", "electron.exe"),
    args: [workspace, `--user-data-dir=${userData}`, `--force-device-scale-factor=${factor}`],
    cwd: workspace,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CREATX_DESKTOP_TEST: "1",
    },
  })

  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 900, height: 600 })
    await page.waitForSelector(".workspace-shell", { timeout: 30_000 })

    for (const surface of surfaces) {
      const rect = await page.evaluate((kind) => {
        document.querySelector("#capture-fixture")?.remove()
        document.body.insertAdjacentHTML("beforeend", `<div id="capture-fixture" style="position:fixed;inset:0;z-index:2147483646;background:#ff00ff"><main id="capture-surface" style="position:absolute;left:180px;top:90px;width:500px;height:300px;overflow:hidden;background:#123456"></main></div>`)
        const target = document.querySelector<HTMLElement>("#capture-surface")
        if (!target) throw new Error("Capture surface was not created")
        const quadrants = `<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%"><i style="background:#ff0000"></i><i style="background:#00ff00"></i><i style="background:#0000ff"></i><i style="background:#ffff00"></i></div>`
        if (kind === "document") target.innerHTML = `<article style="width:100%;height:100%">${quadrants}</article>`
        if (kind === "iframe") target.innerHTML = `<iframe sandbox="allow-scripts allow-same-origin" srcdoc='<!doctype html><style>html,body{margin:0;width:100%;height:100%}</style>${quadrants}' style="display:block;border:0;width:100%;height:100%"></iframe>`
        if (kind === "image") {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><path fill="#f00" d="M0 0h250v150H0z"/><path fill="#0f0" d="M250 0h250v150H250z"/><path fill="#00f" d="M0 150h250v150H0z"/><path fill="#ff0" d="M250 150h250v150H250z"/></svg>`
          target.innerHTML = `<img alt="capture fixture" src="data:image/svg+xml,${encodeURIComponent(svg)}" style="display:block;width:100%;height:100%" />`
        }
        return target.getBoundingClientRect().toJSON()
      }, surface)
      await page.locator("#capture-surface").waitFor()
      if (surface === "iframe") await page.locator("#capture-surface iframe").contentFrame().locator("i").first().waitFor()
      if (surface === "image") await page.locator("#capture-surface img").evaluate((image: HTMLImageElement) => image.decode())
      await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))

      const capture = await app.evaluate(async ({ BrowserWindow }, input) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL() === input.url)
        if (!window) throw new Error("Electron capture test has no BrowserWindow")
        const image = await window.webContents.capturePage(input.region)
        return { dataUrl: image.toDataURL(), size: image.getSize() }
      }, { url: page.url(), region: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
      const pixels = await page.evaluate(async (dataUrl) => {
        const image = new Image()
        image.src = dataUrl
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) throw new Error("Capture test canvas is unavailable")
        context.drawImage(image, 0, 0)
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data
        const at = (x: number, y: number) => Array.from(data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 3)).join(",")
        const sentinel = Array.from({ length: canvas.width * canvas.height }, (_value, index) => index)
          .some((index) => data[index * 4] === 255 && data[index * 4 + 1] === 0 && data[index * 4 + 2] === 255)
        return {
          width: canvas.width,
          height: canvas.height,
          samples: [at(Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.25)), at(Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.25)), at(Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.75)), at(Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.75))],
          sentinel,
        }
      }, capture.dataUrl)
      const expected = ["255,0,0", "0,255,0", "0,0,255", "255,255,0"]
      if (pixels.sentinel || JSON.stringify(pixels.samples) !== JSON.stringify(expected)) {
        throw new Error(`Workbench capture leaked or shifted at scale ${factor} for ${surface}: ${JSON.stringify({ rect, capture: capture.size, pixels })}`)
      }
      results.push({ factor, surface, css: { width: rect.width, height: rect.height }, native: capture.size, png: { width: pixels.width, height: pixels.height } })
    }
  } finally {
    await app.close().catch(() => undefined)
    await rm(userData, { recursive: true, force: true })
  }
}

console.log(JSON.stringify({ status: "WORKBENCH CAPTURE PASS", results }))
