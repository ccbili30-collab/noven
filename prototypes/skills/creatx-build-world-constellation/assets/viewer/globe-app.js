// PROTOTYPE ONLY — open-source globe.gl rendering over real CreatX world data.
const atlas = window.WORLD_CONSTELLATION_DATA
const Globe = window.Globe
const graphElement = document.querySelector("#graph")
const palette = ["#bff8ec", "#73c8f3", "#a7becb", "#e0d383", "#e8ba8c", "#df8e80", "#d79eb8", "#a8aee2", "#e89272", "#d18da2", "#f1bd64", "#b8b1d8"]
const workById = new Map(atlas.works.map((work) => [work.id, work]))
const factById = new Map(atlas.facts.map((fact) => [fact.id, fact]))
const factsByWork = new Map(atlas.works.map((work) => [work.id, atlas.facts.filter((fact) => fact.workId === work.id)]))
const outboundByWork = new Map(atlas.works.map((work) => [work.id, atlas.workRelations.filter((relation) => relation.source === work.id)]))
const inboundByWork = new Map(atlas.works.map((work) => [work.id, atlas.workRelations.filter((relation) => relation.target === work.id)]))
const layerIndex = new Map(atlas.layerOrder.map((layer, index) => [layer, index]))
const workPositions = distributeWorks()
const factPositions = distributeFacts()
const constellationPaths = buildConstellationPaths()
const factPaths = atlas.factRelations.flatMap((relation) => {
  const source = factPositions.get(relation.source)
  const target = factPositions.get(relation.target)
  if (!source || !target) return []
  return [{ type: "fact", relationType: relation.type, layer: factById.get(relation.source)?.layer, points: [source, target] }]
})
const allPaths = [...factPaths, ...constellationPaths]
const labelData = atlas.layerOrder.map((layer, index) => ({ layer, ...vectorToCoordinate(icosahedronDirections()[index]) }))
let selectedWorkId
let activeLayer

if (!Globe) throw new Error("globe.gl 未能从官方 CDN 加载")

document.title = `${atlas.world} · 世界关系球原型`
document.querySelector("#world-name").textContent = atlas.world

const globe = new Globe(graphElement, { animateIn: false, waitForGlobeReady: true })
  .width(graphElement.clientWidth)
  .height(graphElement.clientHeight)
  .backgroundColor("rgba(0,0,0,0)")
  .backgroundImageUrl("./starfield-panorama-nebula.png")
  .showAtmosphere(true)
  .atmosphereColor("#5a82bf")
  .atmosphereAltitude(.17)
  .pointsData(atlas.works)
  .pointLat((work) => workPositions.get(work.id).lat)
  .pointLng((work) => workPositions.get(work.id).lng)
  .pointAltitude((work) => work.id === selectedWorkId ? .045 : .018)
  .pointRadius((work) => {
    if (!selectedWorkId) return .72
    if (work.id === selectedWorkId) return .64
    if (relatedWorkIds().has(work.id)) return .4
    return .18
  })
  .pointColor(pointColor)
  .pointResolution(18)
  .pointsMerge(false)
  .pointsTransitionDuration(420)
  .pointLabel((work) => `<div class="graph-tooltip"><strong>${escapeHtml(work.title)}</strong><small>${escapeHtml(work.layer)}</small></div>`)
  .onPointClick(focusWork)
  .pathsData(allPaths)
  .pathPoints("points")
  .pathPointLat("lat")
  .pathPointLng("lng")
  .pathPointAlt("altitude")
  .pathColor(pathColor)
  .pathStroke((path) => path.type === "constellation" ? .16 : .055)
  .pathResolution(2)
  .pathTransitionDuration(0)
  .htmlElementsData(labelData)
  .htmlLat("lat")
  .htmlLng("lng")
  .htmlAltitude(.04)
  .htmlElement(layerLabelElement)
  .arcsData([])
  .arcStartLat((relation) => workPositions.get(relation.source).lat)
  .arcStartLng((relation) => workPositions.get(relation.source).lng)
  .arcEndLat((relation) => workPositions.get(relation.target).lat)
  .arcEndLng((relation) => workPositions.get(relation.target).lng)
  .arcColor((relation) => relation.type === "causes" ? ["#f4bd75", "#fff0bd"] : ["#79bff0", "#d4eaff"])
  .arcAltitude(.018)
  .arcStroke(.075)
  .arcLabel((relation) => escapeHtml(relation.reason ?? relation.type))
  .arcsTransitionDuration(550)
  .ringsData([])
  .ringLat((work) => workPositions.get(work.id).lat)
  .ringLng((work) => workPositions.get(work.id).lng)
  .ringColor(() => (progress) => `rgba(255,224,157,${1 - progress})`)
  .ringMaxRadius(3.8)
  .ringPropagationSpeed(1.1)
  .ringRepeatPeriod(1100)
  .onGlobeClick(() => clearFocus(false))
  .pointerEventsFilter((object, data) => Boolean(data?.id && workById.has(data.id)))

globe.globeMaterial().color.set("#071127")
globe.globeMaterial().emissive.set("#020711")
globe.globeMaterial().emissiveIntensity = .78
globe.globeMaterial().shininess = 4
globe.controls().enableDamping = true
globe.controls().dampingFactor = .08
globe.controls().autoRotate = false
globe.pointOfView({ lat: 12, lng: -8, altitude: 2.15 }, 0)

document.querySelectorAll("[data-sky-mode]").forEach((button) => {
  button.hidden = button.dataset.skyMode !== "panorama"
  button.classList.toggle("is-active", button.dataset.skyMode === "panorama")
})
document.querySelector("#source-summary").textContent = `${atlas.works.length} 个作品 · ${atlas.facts.length} 条事实索引 · ${atlas.degraded ? "蓝图低密度" : "物化关系"}`
document.querySelector("#view-title").textContent = "十二星座世界球"
document.querySelector("#view-help").textContent = "Globe.GL 开源底座 · 拖动旋转 · 点击作品自动飞近"
document.querySelector("#empty-detail p").textContent = "十二层作品与真实关系覆盖在同一颗世界球上。点击作品后，仅展开它的引用航线并飞近所在区域。"
renderLayerNavigation()

function focusWork(work) {
  selectedWorkId = work.id
  activeLayer = work.layer
  renderWorkDetails(work)
  renderSelection()
  const position = workPositions.get(work.id)
  globe.pointOfView({ lat: position.lat, lng: position.lng, altitude: .95 }, 1150)
  document.querySelector("#view-title").textContent = `${work.title} · 世界关系`
  document.querySelector("#view-help").textContent = `${uniqueRelations(outboundByWork.get(work.id) ?? [], "target").length} 条引用 · ${uniqueRelations(inboundByWork.get(work.id) ?? [], "source").length} 条被引用`
  document.querySelectorAll(".layer-row").forEach((row) => row.classList.toggle("is-active", row.dataset.layer === work.layer))
}

function clearFocus(resetCamera = true) {
  selectedWorkId = undefined
  document.querySelector("#empty-detail").hidden = false
  document.querySelector("#node-detail").hidden = true
  document.querySelector("#view-title").textContent = activeLayer ? `${activeLayer} · 星座区域` : "十二星座世界球"
  document.querySelector("#view-help").textContent = "Globe.GL 开源底座 · 拖动旋转 · 点击作品自动飞近"
  renderSelection()
  if (resetCamera) globe.pointOfView({ lat: 12, lng: -8, altitude: 2.15 }, 900)
}

function renderSelection() {
  const relations = selectedWorkId
    ? [...uniqueRelations(outboundByWork.get(selectedWorkId) ?? [], "target"), ...uniqueRelations(inboundByWork.get(selectedWorkId) ?? [], "source")]
    : []
  globe.pointsData([...atlas.works])
  globe.pathsData([...allPaths])
  globe.arcsData(relations)
  globe.ringsData(selectedWorkId ? [workById.get(selectedWorkId)] : [])
}

function pointColor(work) {
  if (work.id === selectedWorkId) return "#fff0bd"
  if (selectedWorkId && relatedWorkIds().has(work.id)) return "#a9daf8"
  if (selectedWorkId) return "rgba(170,185,205,.18)"
  return palette[layerIndex.get(work.layer)] ?? "#e8edf3"
}

function pathColor(path) {
  if (path.type === "constellation") {
    if (activeLayer && path.layer !== activeLayer) return "rgba(170,185,205,.09)"
    return selectedWorkId && path.layer !== activeLayer ? "rgba(170,185,205,.07)" : "rgba(214,224,238,.46)"
  }
  if (selectedWorkId && path.layer !== activeLayer) return "rgba(90,120,156,.015)"
  if (path.relationType === "causes") return "rgba(223,158,91,.19)"
  if (path.relationType === "supports") return "rgba(105,184,162,.15)"
  return "rgba(100,139,183,.11)"
}

function relatedWorkIds() {
  if (!selectedWorkId) return new Set()
  return new Set([
    ...(outboundByWork.get(selectedWorkId) ?? []).map((relation) => relation.target),
    ...(inboundByWork.get(selectedWorkId) ?? []).map((relation) => relation.source),
  ])
}

function distributeWorks() {
  const directions = icosahedronDirections()
  const candidates = directions.map(() => [])
  for (let index = 0; index < 12000; index += 1) {
    const point = spherePoint(index, 12000)
    const owner = directions.map((center, centerIndex) => ({ centerIndex, score: dot(point, center) })).sort((left, right) => right.score - left.score)[0].centerIndex
    candidates[owner].push(point)
  }
  const positions = new Map()
  for (const [index, layer] of atlas.layerOrder.entries()) {
    const works = atlas.works.filter((work) => work.layer === layer)
    const selected = [candidates[index][Math.floor(hashNumber(`layer:${layer}`) * candidates[index].length)]]
    while (selected.length < works.length) {
      const best = candidates[index]
        .filter((candidate) => !selected.includes(candidate))
        .map((candidate) => ({ candidate, distance: Math.min(...selected.map((point) => distance(candidate, point))) }))
        .sort((left, right) => right.distance - left.distance)[0].candidate
      selected.push(best)
    }
    works.forEach((work, workIndex) => positions.set(work.id, vectorToCoordinate(selected[workIndex])))
  }
  return positions
}

function distributeFacts() {
  const positions = new Map()
  for (const work of atlas.works) {
    const origin = workPositions.get(work.id)
    const facts = factsByWork.get(work.id) ?? []
    facts.forEach((fact, index) => {
      const angle = index * 2.399963 + hashNumber(fact.id) * Math.PI * 2
      const radius = .45 + Math.sqrt((index + .5) / Math.max(1, facts.length)) * 1.55
      positions.set(fact.id, {
        lat: clamp(origin.lat + Math.sin(angle) * radius, -88, 88),
        lng: wrapLongitude(origin.lng + Math.cos(angle) * radius / Math.max(.28, Math.cos(origin.lat * Math.PI / 180))),
        altitude: .008,
      })
    })
  }
  return positions
}

function buildConstellationPaths() {
  return atlas.layerOrder.flatMap((layer) => {
    const works = atlas.works.filter((work) => work.layer === layer)
    const positions = works.map((work) => coordinateToVector(workPositions.get(work.id)))
    return minimumSpanningTree(positions).map(([sourceIndex, targetIndex]) => ({
      type: "constellation",
      layer,
      points: [
        { ...workPositions.get(works[sourceIndex].id), altitude: .012 },
        { ...workPositions.get(works[targetIndex].id), altitude: .012 },
      ],
    }))
  })
}

function minimumSpanningTree(points) {
  const visited = new Set([0])
  const edges = []
  while (visited.size < points.length) {
    const candidates = [...visited].flatMap((source) => points.map((_, target) => visited.has(target) ? undefined : [source, target])).filter(Boolean)
    const edge = candidates.sort((left, right) => distance(points[left[0]], points[left[1]]) - distance(points[right[0]], points[right[1]]))[0]
    edges.push(edge)
    visited.add(edge[1])
  }
  return edges
}

function icosahedronDirections() {
  const phi = (1 + Math.sqrt(5)) / 2
  return [
    [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0],
    [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
  ].map(([x, y, z]) => normalize({ x, y, z }))
}

function spherePoint(index, total) {
  const y = 1 - (index + .5) / total * 2
  const theta = Math.PI * (3 - Math.sqrt(5)) * index + .37
  const spread = Math.sqrt(1 - y * y)
  return { x: Math.cos(theta) * spread, y, z: Math.sin(theta) * spread }
}

function vectorToCoordinate(point) {
  return { lat: Math.asin(point.y) * 180 / Math.PI, lng: Math.atan2(point.z, point.x) * 180 / Math.PI, altitude: .012 }
}

function coordinateToVector(coordinate) {
  const lat = coordinate.lat * Math.PI / 180
  const lng = coordinate.lng * Math.PI / 180
  return { x: Math.cos(lat) * Math.cos(lng), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lng) }
}

function normalize(point) {
  const length = Math.hypot(point.x, point.y, point.z)
  return { x: point.x / length, y: point.y / length, z: point.z / length }
}

function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z) }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)) }
function wrapLongitude(value) { return (value + 540) % 360 - 180 }

function hashNumber(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0) / 4294967295
}

function renderLayerNavigation() {
  document.querySelector("#layer-list").innerHTML = atlas.layerOrder.map((layer, index) => `
    <button class="layer-row" data-layer="${escapeHtml(layer)}" type="button">
      <i style="--layer-color:${palette[index]}"></i><span>${escapeHtml(layer)}</span><b>${atlas.works.filter((work) => work.layer === layer).length}</b>
    </button>`).join("")
}

function layerLabelElement(label) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "globe-layer-label"
  button.textContent = label.layer
  button.addEventListener("click", (event) => {
    event.stopPropagation()
    focusLayer(label.layer)
  })
  return button
}

function focusLayer(layer) {
  activeLayer = layer
  selectedWorkId = undefined
  const center = labelData.find((label) => label.layer === layer)
  renderSelection()
  globe.pointOfView({ lat: center.lat, lng: center.lng, altitude: .92 }, 950)
  document.querySelectorAll(".layer-row").forEach((row) => row.classList.toggle("is-active", row.dataset.layer === layer))
  document.querySelector("#view-title").textContent = `${layer} · 星座区域`
}

function renderWorkDetails(work) {
  document.querySelector("#empty-detail").hidden = true
  document.querySelector("#node-detail").hidden = false
  document.querySelector("#node-layer").textContent = work.layer
  document.querySelector("#node-degree").textContent = `${(outboundByWork.get(work.id) ?? []).length} 引用 · ${(inboundByWork.get(work.id) ?? []).length} 被引用`
  document.querySelector("#node-title").textContent = work.title
  document.querySelector("#node-path").textContent = work.path
  document.querySelector("#focus-local").textContent = "返回世界球"
  const facts = factsByWork.get(work.id) ?? []
  document.querySelector("#fact-count").textContent = facts.length
  document.querySelector("#fact-list").innerHTML = facts.map((fact) => `<button class="relation-card fact-card" data-fact-id="${escapeHtml(fact.id)}" type="button"><strong>${escapeHtml(fact.title)}</strong><small>定位到《${escapeHtml(work.title)}》</small></button>`).join("")
  renderRelations("outbound", outboundByWork.get(work.id) ?? [], "target", "引用")
  renderRelations("inbound", inboundByWork.get(work.id) ?? [], "source", "被引用")
}

function renderRelations(prefix, relations, endpoint, fallback) {
  const unique = uniqueRelations(relations, endpoint)
  document.querySelector(`#${prefix}-count`).textContent = unique.length
  document.querySelector(`#${prefix}-list`).innerHTML = unique.map((relation) => {
    const work = workById.get(relation[endpoint])
    return `<button class="relation-card" data-work-id="${escapeHtml(work.id)}" type="button"><strong>${escapeHtml(work.title)}</strong><small>${escapeHtml(relation.reason ?? fallback)}</small></button>`
  }).join("") || `<p class="empty-relation">没有登记${fallback}关系</p>`
}

function uniqueRelations(relations, endpoint) {
  const seen = new Set()
  return relations.filter((relation) => {
    if (seen.has(relation[endpoint])) return false
    seen.add(relation[endpoint])
    return true
  })
}

function search(value) {
  const query = value.trim().toLocaleLowerCase("zh-CN")
  const results = document.querySelector("#search-results")
  if (!query) {
    results.hidden = true
    return
  }
  const matches = atlas.works.filter((work) => `${work.title} ${work.layer} ${work.path}`.toLocaleLowerCase("zh-CN").includes(query)).slice(0, 12)
  results.hidden = false
  results.innerHTML = matches.length
    ? matches.map((work) => `<button class="search-result" data-work-id="${escapeHtml(work.id)}" type="button"><strong>${escapeHtml(work.title)}</strong><small>${escapeHtml(work.layer)} · 作品</small></button>`).join("")
    : `<div class="empty-detail"><p>没有匹配作品</p></div>`
}

function openDocument(work, highlight = "") {
  if (!work) return
  document.querySelector("#document-title").textContent = work.title
  document.querySelector("#document-path").textContent = work.path
  document.querySelector("#document-content").innerHTML = renderMarkdown(work.content || "该真实文件当前无法读取。", highlight)
  document.querySelector("#document-view").hidden = false
}

function renderMarkdown(content, highlight) {
  const escapedHighlight = escapeHtml(highlight)
  const html = content.split(/\r?\n/).map((line) => {
    const escaped = escapeHtml(line)
    const heading = /^(#{1,6})\s+(.+)$/.exec(escaped)
    if (heading) return `<h${Math.min(4, heading[1].length + 1)}>${heading[2]}</h${Math.min(4, heading[1].length + 1)}>`
    if (/^[-*]\s+/.test(escaped)) return `<p class="document-list">• ${escaped.replace(/^[-*]\s+/, "")}</p>`
    if (!escaped.trim()) return `<div class="document-space"></div>`
    return `<p>${escaped}</p>`
  }).join("")
  if (!escapedHighlight || !html.includes(escapedHighlight)) return html
  return html.replace(escapedHighlight, `<mark>${escapedHighlight}</mark>`)
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character])
}

document.querySelector("#search").addEventListener("input", (event) => search(event.target.value))
document.querySelector("#search-results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-work-id]")
  if (!button) return
  document.querySelector("#search-results").hidden = true
  document.querySelector("#search").value = ""
  focusWork(workById.get(button.dataset.workId))
})
document.querySelector("#layer-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-layer]")
  if (!button) return
  focusLayer(button.dataset.layer)
})
document.querySelector("#node-detail").addEventListener("click", (event) => {
  const workButton = event.target.closest("[data-work-id]")
  if (workButton) return focusWork(workById.get(workButton.dataset.workId))
  const factButton = event.target.closest("[data-fact-id]")
  if (factButton) {
    const fact = factById.get(factButton.dataset.factId)
    openDocument(workById.get(fact.workId), fact.title)
  }
})
document.querySelector("#open-document").addEventListener("click", () => openDocument(workById.get(selectedWorkId)))
document.querySelector("#focus-local").addEventListener("click", () => clearFocus())
document.querySelector("#reset-view").addEventListener("click", () => { activeLayer = undefined; clearFocus() })
document.querySelector("#clear-focus").addEventListener("click", () => clearFocus())
document.querySelector("#zoom-in").addEventListener("click", () => { const point = globe.pointOfView(); globe.pointOfView({ altitude: Math.max(.2, point.altitude * .72) }, 420) })
document.querySelector("#zoom-out").addEventListener("click", () => { const point = globe.pointOfView(); globe.pointOfView({ altitude: Math.min(4, point.altitude * 1.35) }, 420) })
document.querySelector("#close-document").addEventListener("click", () => { document.querySelector("#document-view").hidden = true })
document.querySelector("#document-view").addEventListener("click", (event) => { if (event.target.id === "document-view") document.querySelector("#document-view").hidden = true })
window.addEventListener("resize", () => globe.width(graphElement.clientWidth).height(graphElement.clientHeight))
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#document-view").hidden) return void (document.querySelector("#document-view").hidden = true)
  if (event.key === "Escape") return clearFocus()
  if (event.key.toLocaleLowerCase() === "f" && !event.target.matches("input, textarea, [contenteditable]")) {
    event.preventDefault()
    document.querySelector("#search").focus()
  }
})
