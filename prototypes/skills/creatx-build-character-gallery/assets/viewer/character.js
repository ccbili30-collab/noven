const data = window.CHARACTER_WORKBENCH_DATA ?? {}

document.getElementById("character-name").textContent = text(data.name)
document.getElementById("character-subtitle").textContent = text(data.subtitle)
document.getElementById("character-quote").textContent = text(data.quote)
document.getElementById("character-kicker").textContent = text(data.kicker, "CHARACTER / WORLD CAST")
document.getElementById("headline-kicker").textContent = text(data.headline?.kicker)
document.getElementById("headline-title").textContent = text(data.headline?.title)
document.getElementById("headline-intro").textContent = text(data.headline?.intro)
document.getElementById("footer-world").textContent = text(data.worldTitle, "WORLD")
document.getElementById("footer-character").textContent = text(data.name, "CHARACTER")
document.getElementById("hero-index").querySelector("span").textContent = text(data.index, "—")
document.title = `${text(data.name, "角色")} · ${text(data.worldTitle, "人物群像")}`

const portrait = document.getElementById("character-portrait")
portrait.alt = typeof data.portraitAlt === "string" ? data.portraitAlt : "角色立绘"
const portraitPath = localAssetPath(data.portrait)
if (portraitPath) portrait.src = portraitPath
if (!portraitPath) portrait.classList.add("is-missing")
portrait.addEventListener("error", () => {
  portrait.removeAttribute("src")
  portrait.classList.add("is-missing")
})

renderRecords("profile-list", data.profile, (item) => ({ label: item.label, value: item.value }))
renderRelationships(data.relationships)
renderAffiliation(data.affiliation)
renderBible(data.bible)

function renderRecords(id, records, project) {
  const container = document.getElementById(id)
  if (!Array.isArray(records) || records.length === 0) {
    container.append(emptyRecord())
    return
  }
  for (const record of records) {
    const item = project(record ?? {})
    const term = document.createElement("dt")
    const description = document.createElement("dd")
    term.textContent = text(item.label)
    description.textContent = text(item.value)
    container.append(term, description)
  }
}

function renderAffiliation(records) {
  const container = document.getElementById("affiliation-list")
  if (!Array.isArray(records) || records.length === 0) {
    container.append(emptyRecord())
    return
  }
  for (const record of records) {
    const group = document.createElement("div")
    const term = document.createElement("dt")
    const description = document.createElement("dd")
    term.textContent = text(record?.label)
    description.textContent = text(record?.value)
    group.append(term, description)
    container.append(group)
  }
}

function renderRelationships(records) {
  const container = document.getElementById("relationship-list")
  if (!Array.isArray(records) || records.length === 0) {
    container.append(emptyRecord())
    return
  }
  for (const record of records) {
    const group = document.createElement("div")
    const term = document.createElement("dt")
    const description = document.createElement("dd")
    term.textContent = text(record?.role)
    description.textContent = [text(record?.name, ""), text(record?.description, "")].filter(Boolean).join(" · ")
    group.append(term, description)
    container.append(group)
  }
}

function renderBible(records) {
  const container = document.getElementById("bible-grid")
  if (!Array.isArray(records) || records.length === 0) {
    container.append(emptyRecord())
    return
  }
  for (const record of records) {
    const article = document.createElement("article")
    const heading = document.createElement("h3")
    const icon = document.createElement("span")
    icon.setAttribute("aria-hidden", "true")
    icon.textContent = text(record?.icon, "✧")
    heading.append(icon, document.createTextNode(text(record?.title)))
    article.append(heading)
    const paragraphs = Array.isArray(record?.paragraphs) ? record.paragraphs : []
    if (paragraphs.length === 0) article.append(emptyRecord())
    for (const value of paragraphs) {
      const paragraph = document.createElement("p")
      paragraph.textContent = text(value)
      article.append(paragraph)
    }
    container.append(article)
  }
}

function emptyRecord() {
  const output = document.createElement("p")
  output.className = "empty-record"
  output.textContent = "—"
  return output
}

function text(value, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function localAssetPath(value) {
  if (typeof value !== "string" || !value.trim()) return undefined
  const normalized = value.trim().replaceAll("\\", "/")
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("/") || normalized.split("/").includes("..")) return undefined
  return normalized
}
