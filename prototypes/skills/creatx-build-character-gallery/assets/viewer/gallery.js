const data = window.CHARACTER_GALLERY_DATA ?? {}
const characters = Array.isArray(data.characters) ? data.characters : []

document.getElementById("world-title").textContent = text(data.worldTitle)
document.getElementById("cast-count").textContent = `${characters.length} CHARACTERS`
document.title = `${text(data.worldTitle, "世界")} · 人物群像`

const grid = document.getElementById("cast-grid")
for (const [index, character] of characters.entries()) {
  const link = document.createElement("a")
  link.className = `character-card ${character.role === "ordinary" ? "is-ordinary" : "is-notable"}`
  if (index === 0) link.classList.add("is-lead")
  link.href = localPath(character.href)

  const image = document.createElement("img")
  image.src = localPath(character.portrait)
  image.alt = text(character.portraitAlt, `${text(character.name)}的人物立绘`)

  const shade = document.createElement("span")
  shade.className = "card-shade"
  shade.setAttribute("aria-hidden", "true")

  const order = document.createElement("p")
  order.className = "card-order"
  order.textContent = String(index + 1).padStart(2, "0")

  const content = document.createElement("div")
  content.className = "card-content"

  const role = document.createElement("p")
  role.className = "card-role"
  role.textContent = character.role === "ordinary" ? "人间尺度 / ORDINARY LIFE" : "世界人物 / NOTABLE FIGURE"

  const heading = document.createElement("h2")
  heading.textContent = text(character.name)

  const subtitle = document.createElement("p")
  subtitle.className = "card-subtitle"
  subtitle.textContent = text(character.subtitle)

  const significance = document.createElement("p")
  significance.className = "card-significance"
  significance.textContent = text(character.significance)

  content.append(role, heading, subtitle, significance)
  link.append(image, shade, order, content)
  grid.append(link)
}

if (characters.length === 0) {
  const empty = document.createElement("p")
  empty.className = "gallery-empty"
  empty.textContent = "尚未生成人物。"
  grid.append(empty)
}

function text(value, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function localPath(value) {
  if (typeof value !== "string" || !value.trim()) return "#"
  const normalized = value.trim().replaceAll("\\", "/")
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("/") || normalized.split("/").includes("..")) return "#"
  return normalized
}
