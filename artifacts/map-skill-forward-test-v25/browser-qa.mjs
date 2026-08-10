import { chromium } from "../../creatx/node_modules/playwright/index.mjs"

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args: ["--allow-file-access-from-files"],
})

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`)
  })
  page.on("pageerror", (error) => errors.push(`page:${error.message}`))
  page.on("requestfailed", (request) => errors.push(`request:${request.url()}`))

  await page.goto(new URL("./interactive-map/index.html", import.meta.url).href, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => document.querySelector("#map-canvas")?.width === 1254)

  const regions = await page.evaluate(() => {
    const counts = new Map(manifest.regions.map((region) => [region.id, 0]))
    const points = new Map()
    for (let y = 5; y < canvas.height - 5; y++) {
      for (let x = 5; x < canvas.width - 5; x++) {
        const pixel = y * canvas.width + x
        const region = regionsByColor.get(maskColors[pixel])
        counts.set(region.id, counts.get(region.id) + 1)
        if (points.has(region.id)) continue
        const color = maskColors[pixel]
        if (
          maskColors[pixel - 5] === color &&
          maskColors[pixel + 5] === color &&
          maskColors[pixel - canvas.width * 5] === color &&
          maskColors[pixel + canvas.width * 5] === color
        ) points.set(region.id, { x, y })
      }
    }
    return manifest.regions.map((region) => ({
      id: region.id,
      name: region.name,
      kind: region.kind,
      count: counts.get(region.id),
      point: points.get(region.id),
    }))
  })

  if (regions.some((region) => !region.point)) throw new Error("region_without_safe_click_point")
  const clickPoint = async (point) => {
    const box = await page.locator("#map-canvas").boundingBox()
    if (!box) throw new Error("canvas_missing")
    await page.mouse.click(box.x + (point.x + .5) / 1254 * box.width, box.y + (point.y + .5) / 1254 * box.height)
  }

  const durations = []
  const selectedKinds = new Set()
  for (const region of regions) {
    const started = performance.now()
    await clickPoint(region.point)
    const actual = await page.locator("#region-name").textContent()
    if (actual !== region.name) throw new Error(`region_mismatch:${region.name}:${actual}`)
    const state = await page.evaluate(() => ({
      selectedId: selectedRegion?.id,
      selectedKind: selectedRegion?.kind,
      cachedId: cachedRegionLayers?.id,
    }))
    if (state.selectedId !== region.id || state.selectedKind !== region.kind || state.cachedId !== region.id) {
      throw new Error(`selection_state_mismatch:${region.id}:${JSON.stringify(state)}`)
    }
    selectedKinds.add(state.selectedKind)
    durations.push(Math.round(performance.now() - started))
    await page.keyboard.press("Escape")
  }
  if (!selectedKinds.has("land") || !selectedKinds.has("water")) throw new Error("land_water_paths_not_exercised")

  const land = regions.find((region) => region.kind === "land" && region.point.x < 560 && region.point.y < 700)
  if (!land) throw new Error("land_region_missing")
  await clickPoint(land.point)
  await clickPoint(land.point)
  if (!(await page.locator("#region-card").evaluate((element) => element.hidden))) throw new Error("same_region_close_failed")
  await clickPoint(land.point)
  await page.locator("#region-close").click()
  if (!(await page.locator("#region-card").evaluate((element) => element.hidden))) throw new Error("button_close_failed")

  await clickPoint(land.point)
  const before = await page.locator("#region-card").boundingBox()
  const header = await page.locator(".region-card-header").boundingBox()
  if (!before || !header) throw new Error("drag_target_missing")
  await page.mouse.move(header.x + 24, header.y + 18)
  await page.mouse.down()
  await page.mouse.move(header.x + 80, header.y + 65, { steps: 6 })
  await page.mouse.up()
  const after = await page.locator("#region-card").boundingBox()
  if (!after || (Math.abs(after.x - before.x) < 20 && Math.abs(after.y - before.y) < 20)) throw new Error("drag_failed")
  await page.keyboard.press("Escape")

  const showcaseRegions = regions.filter((region) => region.kind === "land").sort((left, right) => left.count - right.count)
  const showcase = showcaseRegions[Math.floor(showcaseRegions.length / 2)]
  await clickPoint(showcase.point)
  await page.screenshot({ path: new URL("selected-region-final.png", import.meta.url).pathname.slice(1) })
  if (errors.length) throw new Error(errors.join("\n"))

  console.log(JSON.stringify({
    ok: true,
    regionsClicked: regions.length,
    landRegions: regions.filter((region) => region.kind === "land").length,
    waterRegions: regions.filter((region) => region.kind === "water").length,
    selectionMilliseconds: {
      minimum: Math.min(...durations),
      maximum: Math.max(...durations),
      average: Math.round(durations.reduce((total, value) => total + value, 0) / durations.length),
    },
    closePaths: ["same-region", "Escape", "close-button"],
    draggable: true,
    currentRegionCacheVerified: true,
    browserErrors: 0,
    screenshotRegion: showcase.name,
  }, null, 2))
} finally {
  await browser.close()
}
