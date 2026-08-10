// Experimental offline 2D force graph over explicit Noven causal data.
const atlas = window.WORLD_CONSTELLATION_DATA
const canvas = document.querySelector("#neural-canvas")
const context = canvas.getContext("2d", { alpha: true, desynchronized: true })
const palette = ["#ef6f87", "#91c94b", "#5ab7d9", "#9f79d2", "#efb44e", "#62c2a4", "#d97cba", "#7f9ce0", "#d88b58", "#73b7a6", "#b8c85b", "#c77f99"]
const causalTypes = new Set(["causes"])
const degreeByWork = new Map(atlas.works.map((work) => [work.id, atlas.workRelations.filter((relation) => relation.source === work.id || relation.target === work.id).length]))
const layerCenters = buildLayerCenters()
const workNodes = buildWorkNodes()
const workNodeById = new Map(workNodes.map((node) => [node.id, node]))
const factNodes = buildFactNodes()
const factNodeById = new Map(factNodes.map((node) => [node.id, node]))
const nodes = [...factNodes, ...workNodes]
const edges = buildEdges()
const ownershipEdges = edges.filter((edge) => edge.kind === "ownership")
const relationEdges = edges.filter((edge) => edge.kind !== "ownership")
const causalEdges = relationEdges.filter((edge) => edge.causal)

let viewport = { width: 1, height: 1, pixelRatio: 1 }
let camera = { x: 0, y: 4, zoom: 1 }
let cameraTarget
let pointer
let lastFrame = 0
let alpha = 1
let physicsActive = true
let query = ""
let matchingIds = new Set()
let matchingWorkIds = new Set()

document.querySelector("#work-total").textContent = atlas.works.length.toLocaleString("zh-CN")
document.querySelector("#fact-total").textContent = atlas.facts.length.toLocaleString("zh-CN")
document.querySelector("#relation-total").textContent = (atlas.workRelations.length + atlas.factRelations.length).toLocaleString("zh-CN")

resize()
new ResizeObserver(resize).observe(canvas)
requestAnimationFrame(frame)

function resize() {
  const bounds = canvas.getBoundingClientRect()
  viewport = {
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  }
  canvas.width = Math.round(viewport.width * viewport.pixelRatio)
  canvas.height = Math.round(viewport.height * viewport.pixelRatio)
  if (!cameraTarget && alpha === 1) focusNodes(nodes, false)
}

function frame(timestamp) {
  if (timestamp - lastFrame >= (physicsActive ? 1000 / 52 : 1000 / 30)) {
    lastFrame = timestamp
    if (physicsActive) tickPhysics()
    updateCamera()
    render(timestamp)
  }
  requestAnimationFrame(frame)
}

function tickPhysics() {
  applySprings()
  applyGrowthForces()
  applyLocalRepulsion()
  integrateNodes()
  alpha = Math.max(.012, alpha * .984)
  if (alpha > .019) return
  physicsActive = false
  document.querySelector("#activity-label").textContent = "世界关系保持活性"
  focusNodes(query ? nodes.filter(nodeMatches) : nodes)
}

function applySprings() {
  edges.forEach((edge) => {
    const dx = edge.targetNode.x - edge.sourceNode.x
    const dy = edge.targetNode.y - edge.sourceNode.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const force = (distance - edge.length) * edge.strength * alpha
    const forceX = dx / distance * force
    const forceY = dy / distance * force
    edge.sourceNode.vx += forceX / edge.sourceNode.mass
    edge.sourceNode.vy += forceY / edge.sourceNode.mass
    edge.targetNode.vx -= forceX / edge.targetNode.mass
    edge.targetNode.vy -= forceY / edge.targetNode.mass
  })
}

function applyGrowthForces() {
  nodes.forEach((node) => {
    const target = node.kind === "work" ? layerCenters.get(node.layer) : workNodeById.get(node.workId)
    const strength = node.kind === "work" ? .00042 : .0024
    node.vx += (target.x - node.x) * strength * alpha
    node.vy += (target.y - node.y) * strength * alpha
    const radius = Math.max(1, Math.hypot(node.x, node.y))
    const gravity = .00036 + Math.max(0, radius - 118) * .000006
    node.vx += -node.x * gravity * alpha
    node.vy += -node.y * gravity * alpha
  })
}

function applyLocalRepulsion() {
  const cellSize = 18
  const cells = new Map()
  nodes.forEach((node) => {
    const key = `${Math.floor(node.x / cellSize)}:${Math.floor(node.y / cellSize)}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(node)
  })
  nodes.forEach((node) => {
    const cellX = Math.floor(node.x / cellSize)
    const cellY = Math.floor(node.y / cellSize)
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        ;(cells.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? []).forEach((other) => {
          if (other.index <= node.index) return
          const dx = other.x - node.x
          const dy = other.y - node.y
          const distance = Math.max(.4, Math.hypot(dx, dy))
          const minimum = node.radius + other.radius + 2.2
          if (distance >= minimum) return
          const force = (minimum - distance) / minimum * .22 * alpha
          node.vx -= dx / distance * force / node.mass
          node.vy -= dy / distance * force / node.mass
          other.vx += dx / distance * force / other.mass
          other.vy += dy / distance * force / other.mass
        })
      }
    }
  })
}

function integrateNodes() {
  nodes.forEach((node) => {
    node.vx = clamp(node.vx * .79, -2.5, 2.5)
    node.vy = clamp(node.vy * .79, -2.5, 2.5)
    node.x += node.vx
    node.y += node.vy
  })
}

function render(timestamp) {
  context.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0)
  context.clearRect(0, 0, viewport.width, viewport.height)
  context.save()
  context.translate(viewport.width / 2 + camera.x, viewport.height / 2 + camera.y)
  context.scale(camera.zoom, camera.zoom)
  drawRelations()
  drawNodes(timestamp)
  context.restore()
  drawSearchLabels()
}

function drawRelations() {
  context.save()
  context.lineCap = "round"
  context.beginPath()
  relationEdges.filter((edge) => !query || !edgeMatches(edge)).forEach((edge) => line(edge.sourceNode, edge.targetNode))
  context.strokeStyle = query ? "rgba(72,83,89,.018)" : "rgba(121,151,163,.16)"
  context.lineWidth = .48 / camera.zoom
  context.stroke()
  if (query) {
    context.beginPath()
    relationEdges.filter(searchEdgeMatches).forEach((edge) => line(edge.sourceNode, edge.targetNode))
    context.strokeStyle = "rgba(178,218,231,.58)"
    context.lineWidth = .82 / camera.zoom
    context.stroke()
  }
  context.restore()
}

function drawNodes(timestamp) {
  const grouped = new Map()
  nodes.forEach((node) => {
    const active = !query || nodeMatches(node)
    const key = active ? node.color : "dim"
    if (!grouped.has(key)) grouped.set(key, { active, color: node.color, nodes: [] })
    grouped.get(key).nodes.push(node)
  })
  context.save()
  grouped.forEach((group) => {
    context.fillStyle = group.active ? group.color : "rgba(80,91,95,.075)"
    context.beginPath()
    group.nodes.forEach((node) => {
      const pulse = node.kind === "work" ? 1 + Math.sin(timestamp * .0012 + node.phase) * .045 : 1
      const radius = node.radius * pulse / camera.zoom
      context.moveTo(node.x + radius, node.y)
      context.arc(node.x, node.y, radius, 0, Math.PI * 2)
    })
    context.fill()
  })
  causalEdges.forEach((edge) => {
    if (query && !searchEdgeMatches(edge)) return
    const progress = (timestamp * .000085 + edge.phase) % 1
    const x = edge.sourceNode.x + (edge.targetNode.x - edge.sourceNode.x) * progress
    const y = edge.sourceNode.y + (edge.targetNode.y - edge.sourceNode.y) * progress
    const radius = (query ? 1.3 : .75) / camera.zoom
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = query ? "rgba(230,249,255,.9)" : "rgba(154,211,225,.62)"
    context.fill()
  })
  context.restore()
}

function drawSearchLabels() {
  if (!query) return
  const matches = workNodes.filter((node) => matchingWorkIds.has(node.id)).sort((left, right) => (degreeByWork.get(right.id) ?? 0) - (degreeByWork.get(left.id) ?? 0)).slice(0, 6)
  context.save()
  context.font = '11px "Microsoft YaHei UI", sans-serif'
  context.textBaseline = "middle"
  matches.forEach((node) => {
    const point = screenPoint(node)
    context.fillStyle = "rgba(226,238,240,.86)"
    context.fillText(node.title, point.x + 8, point.y)
  })
  context.restore()
}

function buildLayerCenters() {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return new Map(atlas.layerOrder.map((layer, index) => {
    const angle = index * goldenAngle + .25
    const radius = 8 + Math.sqrt(index + .35) * 20
    return [layer, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }]
  }))
}

function buildWorkNodes() {
  return atlas.layerOrder.flatMap((layer, layerIndex) => {
    const center = layerCenters.get(layer)
    const works = atlas.works.filter((work) => work.layer === layer).sort((left, right) => left.id.localeCompare(right.id))
    return works.map((work, index) => {
      const angle = index * 2.399963 + hashNumber(work.id) * .8
      const spread = 9 + Math.sqrt(index + .5) * 8
      const degree = degreeByWork.get(work.id) ?? 0
      return {
        ...work,
        kind: "work",
        index: 0,
        mass: 1.7 + Math.sqrt(degree) * .16,
        radius: 1.65 + Math.min(1.7, Math.sqrt(degree) * .23),
        color: palette[layerIndex % palette.length],
        phase: hashNumber(`phase:${work.id}`) * Math.PI * 2,
        x: center.x + Math.cos(angle) * spread,
        y: center.y + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        searchText: `${work.title}\n${work.layer}\n${work.content}`.toLocaleLowerCase("zh-CN"),
      }
    })
  })
}

function buildFactNodes() {
  return atlas.works.flatMap((work) => {
    const origin = workNodeById.get(work.id)
    const facts = atlas.facts.filter((fact) => fact.workId === work.id).sort((left, right) => left.id.localeCompare(right.id))
    const spokes = Math.max(5, Math.ceil(Math.sqrt(facts.length) * 1.55))
    return facts.map((fact, index) => {
      const spoke = index % spokes
      const ring = Math.floor(index / spokes)
      const angle = origin.phase + spoke / spokes * Math.PI * 2 + ring * .13
      const distance = 7 + ring * 5.8 + hashNumber(fact.id) * 2.4
      return {
        ...fact,
        kind: "fact",
        index: 0,
        mass: .65,
        radius: 1.28,
        color: origin.color,
        phase: hashNumber(`phase:${fact.id}`) * Math.PI * 2,
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
        searchText: `${fact.title}\n${work.title}\n${work.layer}`.toLocaleLowerCase("zh-CN"),
      }
    })
  })
}

function buildEdges() {
  const ownership = factNodes.map((fact) => ({
    id: `ownership:${fact.id}`,
    kind: "ownership",
    causal: false,
    sourceNode: workNodeById.get(fact.workId),
    targetNode: fact,
    length: Math.max(7, Math.hypot(fact.x - workNodeById.get(fact.workId).x, fact.y - workNodeById.get(fact.workId).y)),
    strength: .022,
    phase: hashNumber(`ownership:${fact.id}`),
  }))
  const workRelations = atlas.workRelations.flatMap((relation) => {
    const sourceNode = workNodeById.get(relation.source)
    const targetNode = workNodeById.get(relation.target)
    if (!sourceNode || !targetNode) return []
    return [{ ...relation, kind: "work", causal: causalTypes.has(relation.type), sourceNode, targetNode, length: 58, strength: .0017, phase: hashNumber(relation.id) }]
  })
  const factRelations = atlas.factRelations.flatMap((relation) => {
    const sourceNode = factNodeById.get(relation.source)
    const targetNode = factNodeById.get(relation.target)
    if (!sourceNode || !targetNode) return []
    return [{ ...relation, kind: "fact", causal: causalTypes.has(relation.type), sourceNode, targetNode, length: 32, strength: .0022, phase: hashNumber(relation.id) }]
  })
  nodes.forEach((node, index) => { node.index = index })
  return [...ownership, ...workRelations, ...factRelations]
}

function updateSearch(value) {
  query = value.trim().toLocaleLowerCase("zh-CN")
  matchingIds = new Set()
  matchingWorkIds = new Set()
  if (query) {
    workNodes.filter((node) => node.searchText.includes(query)).forEach((node) => matchingWorkIds.add(node.id))
    factNodes.filter((node) => node.searchText.includes(query)).forEach((node) => {
      matchingIds.add(node.id)
      matchingWorkIds.add(node.workId)
    })
  }
  document.querySelector("#search-summary").textContent = query
    ? `${matchingWorkIds.size} 个作品 · ${matchingIds.size} 条事实`
    : `${nodes.length.toLocaleString("zh-CN")} 个真实节点`
  document.querySelector("#activity-label").textContent = query ? "相关神经簇已被唤醒" : "世界关系保持活性"
  focusNodes(query ? nodes.filter(nodeMatches) : nodes)
  alpha = query ? .2 : .08
  physicsActive = true
}

function nodeMatches(node) {
  if (node.kind === "work") return matchingWorkIds.has(node.id)
  return matchingIds.has(node.id) || matchingWorkIds.has(node.workId)
}

function edgeMatches(edge) {
  return nodeMatches(edge.sourceNode) && nodeMatches(edge.targetNode)
}

function searchEdgeMatches(edge) {
  if (!edgeMatches(edge)) return false
  return (edge.sourceNode.workId ?? edge.sourceNode.id) === (edge.targetNode.workId ?? edge.targetNode.id)
}

function focusNodes(targets, animate = true) {
  if (!targets.length) return
  const bounds = targets.reduce((current, node) => ({
    minimumX: Math.min(current.minimumX, node.x),
    maximumX: Math.max(current.maximumX, node.x),
    minimumY: Math.min(current.minimumY, node.y),
    maximumY: Math.max(current.maximumY, node.y),
  }), { minimumX: Infinity, maximumX: -Infinity, minimumY: Infinity, maximumY: -Infinity })
  const width = Math.max(70, bounds.maximumX - bounds.minimumX)
  const height = Math.max(70, bounds.maximumY - bounds.minimumY)
  const zoom = clamp(Math.min((viewport.width - 120) / width, (viewport.height - 120) / height), .55, 3.4)
  const target = {
    x: -(bounds.minimumX + bounds.maximumX) / 2 * zoom,
    y: -(bounds.minimumY + bounds.maximumY) / 2 * zoom,
    zoom,
  }
  if (animate) cameraTarget = target
  if (!animate) camera = target
}

function updateCamera() {
  if (!cameraTarget) return
  camera = {
    x: camera.x + (cameraTarget.x - camera.x) * .16,
    y: camera.y + (cameraTarget.y - camera.y) * .16,
    zoom: camera.zoom + (cameraTarget.zoom - camera.zoom) * .16,
  }
  if (Math.abs(cameraTarget.x - camera.x) + Math.abs(cameraTarget.y - camera.y) + Math.abs(cameraTarget.zoom - camera.zoom) * 100 > .6) return
  camera = cameraTarget
  cameraTarget = undefined
}

function line(source, target) {
  context.moveTo(source.x, source.y)
  context.lineTo(target.x, target.y)
}

function screenPoint(node) {
  return { x: viewport.width / 2 + camera.x + node.x * camera.zoom, y: viewport.height / 2 + camera.y + node.y * camera.zoom }
}

function colorWithAlpha(hex, alphaValue) {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${alphaValue})`
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)) }
function hashNumber(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0) / 4294967295
}

canvas.addEventListener("pointerdown", (event) => {
  cameraTarget = undefined
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  canvas.setPointerCapture(event.pointerId)
  canvas.classList.add("is-dragging")
})
canvas.addEventListener("pointermove", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return
  camera.x += event.clientX - pointer.x
  camera.y += event.clientY - pointer.y
  pointer = { ...pointer, x: event.clientX, y: event.clientY }
})
function releasePointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return
  pointer = undefined
  canvas.classList.remove("is-dragging")
}
canvas.addEventListener("pointerup", releasePointer)
canvas.addEventListener("pointercancel", releasePointer)
canvas.addEventListener("wheel", (event) => {
  event.preventDefault()
  cameraTarget = undefined
  const oldZoom = camera.zoom
  const nextZoom = clamp(oldZoom * Math.exp(-event.deltaY * .0011), .3, 4.2)
  const modelX = (event.clientX - viewport.width / 2 - camera.x) / oldZoom
  const modelY = (event.clientY - viewport.height / 2 - camera.y) / oldZoom
  camera.x = event.clientX - viewport.width / 2 - modelX * nextZoom
  camera.y = event.clientY - viewport.height / 2 - modelY * nextZoom
  camera.zoom = nextZoom
}, { passive: false })

document.querySelector("#search").addEventListener("input", (event) => updateSearch(event.target.value))
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return
  const search = document.querySelector("#search")
  search.value = ""
  updateSearch("")
})

const initialQuery = new URLSearchParams(window.location.search).get("q")
if (initialQuery) {
  const search = document.querySelector("#search")
  search.value = initialQuery
  updateSearch(initialQuery)
}
