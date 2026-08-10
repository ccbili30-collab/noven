import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const markerName = ".creatx-character-gallery-output.json"
const options = parseOptions(process.argv.slice(2))
const manifestPath = path.resolve(requireOption(options, "manifest"))
const outputPath = path.resolve(requireOption(options, "output"))
const manifestDirectory = path.dirname(manifestPath)
const viewerDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "viewer")
const temporaryPath = `${outputPath}.building-${process.pid}`

assertSafeOutput(outputPath)

try {
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")))
  const characters = await Promise.all(
    manifest.characters.map(async (character, index) => ({
      ...character,
      index: String(index + 1).padStart(2, "0"),
      sourcePortrait: await requirePortrait(manifestDirectory, character.portrait),
    })),
  )

  await rm(temporaryPath, { recursive: true, force: true })
  await mkdir(temporaryPath, { recursive: true })
  await copyViewer("gallery.html", path.join(temporaryPath, "index.html"))
  await copyViewer("gallery.css", path.join(temporaryPath, "styles.css"))
  await copyViewer("gallery.js", path.join(temporaryPath, "app.js"))

  const galleryCharacters = []
  for (const character of characters) {
    const characterDirectory = path.join(temporaryPath, "characters", character.id)
    const portraitExtension = path.extname(character.sourcePortrait).toLowerCase()
    const portraitName = `portrait${portraitExtension}`
    await mkdir(path.join(characterDirectory, "assets"), { recursive: true })
    await copyViewer("character.html", path.join(characterDirectory, "index.html"))
    await copyViewer("character.css", path.join(characterDirectory, "styles.css"))
    await copyViewer("character.js", path.join(characterDirectory, "app.js"))
    await copyFile(character.sourcePortrait, path.join(characterDirectory, "assets", portraitName))

    const outputCharacter = {
      ...character,
      sourcePortrait: undefined,
      worldTitle: manifest.worldTitle,
      portrait: `assets/${portraitName}`,
      kicker: character.role === "ordinary" ? "CHARACTER / ORDINARY LIFE" : "CHARACTER / NOTABLE FIGURE",
    }
    delete outputCharacter.sourcePortrait
    await writeJavaScript(
      path.join(characterDirectory, "character-data.js"),
      "CHARACTER_WORKBENCH_DATA",
      outputCharacter,
    )

    galleryCharacters.push({
      id: character.id,
      role: character.role,
      name: character.name,
      subtitle: character.subtitle,
      significance: character.significance,
      portraitAlt: character.portraitAlt,
      portrait: `characters/${character.id}/assets/${portraitName}`,
      href: `characters/${character.id}/index.html`,
    })
  }

  await writeJavaScript(path.join(temporaryPath, "gallery-data.js"), "CHARACTER_GALLERY_DATA", {
    schemaVersion: 1,
    worldTitle: manifest.worldTitle,
    characters: galleryCharacters,
  })
  await writeFile(
    path.join(temporaryPath, markerName),
    `${JSON.stringify({ skill: "creatx-build-character-gallery", schemaVersion: 1 }, null, 2)}\n`,
    "utf8",
  )

  if (await exists(outputPath)) {
    await requireOwnedOutput(outputPath)
    await rm(outputPath, { recursive: true })
  }
  await rename(temporaryPath, outputPath)

  const evidenceCounts = countBy(characters, (character) => character.evidenceStatus)
  const visualHookCounts = countBy(characters, (character) => character.visualHook.kind)
  const missingVisualStyle = characters.filter((character) => !character.visualStyleApplied).map((character) => character.id)
  const summary = {
    status: "built",
    worldTitle: manifest.worldTitle,
    notableCount: characters.filter((character) => character.role === "notable").length,
    ordinaryCount: characters.filter((character) => character.role === "ordinary").length,
    evidenceCounts,
    visualHookCounts,
    visualStyleSource: manifest.visualStyleSource ?? null,
    missingVisualStyle,
    warnings:
      missingVisualStyle.length > 0
        ? [`${missingVisualStyle.length} portrait(s) did not apply the project visual master and must not be reported as visually unified.`]
        : [],
    outputPath,
    entryPoint: path.join(outputPath, "index.html"),
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`)
} catch (error) {
  await rm(temporaryPath, { recursive: true, force: true })
  throw error
}

function parseOptions(values) {
  const result = new Map()
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith("--") || !value) throw new Error(`Invalid option near ${key ?? "<end>"}`)
    result.set(key.slice(2), value)
  }
  return result
}

function requireOption(optionsMap, name) {
  const value = optionsMap.get(name)
  if (!value) throw new Error(`Missing required --${name}`)
  return value
}

function validateManifest(value) {
  const manifest = requireObject(value, "manifest")
  if (manifest.schemaVersion !== 1) throw new Error("manifest.schemaVersion must equal 1")
  requireString(manifest.worldTitle, "manifest.worldTitle")
  if (manifest.visualStyleSource !== undefined && manifest.visualStyleSource !== null) {
    requireString(manifest.visualStyleSource, "manifest.visualStyleSource")
  }
  if (!Array.isArray(manifest.characters)) throw new Error("manifest.characters must be an array")

  const characters = manifest.characters.map((character, index) => validateCharacter(character, index))
  const notableCount = characters.filter((character) => character.role === "notable").length
  const ordinaryCount = characters.filter((character) => character.role === "ordinary").length
  if (notableCount < 4 || notableCount > 6) throw new Error("manifest must contain four to six notable characters")
  if (ordinaryCount !== 1) throw new Error("manifest must contain exactly one ordinary character")
  const ids = new Set(characters.map((character) => character.id))
  if (ids.size !== characters.length) throw new Error("character ids must be unique")
  return { ...manifest, characters }
}

function validateCharacter(value, index) {
  const character = requireObject(value, `characters[${index}]`)
  const prefix = `characters[${index}]`
  requireString(character.id, `${prefix}.id`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(character.id)) throw new Error(`${prefix}.id is not safe kebab-case`)
  if (!new Set(["notable", "ordinary"]).has(character.role)) throw new Error(`${prefix}.role is invalid`)
  if (!new Set(["source", "derived", "created"]).has(character.evidenceStatus)) {
    throw new Error(`${prefix}.evidenceStatus is invalid`)
  }
  for (const field of ["name", "subtitle", "quote", "significance", "portrait", "portraitAlt"]) {
    requireString(character[field], `${prefix}.${field}`)
  }
  if (typeof character.visualStyleApplied !== "boolean") throw new Error(`${prefix}.visualStyleApplied must be boolean`)

  const visualHook = requireObject(character.visualHook, `${prefix}.visualHook`)
  if (!new Set(["beauty", "authority", "uncanny", "danger", "sacred", "human-specificity"]).has(visualHook.kind)) {
    throw new Error(`${prefix}.visualHook.kind is invalid`)
  }
  requireString(visualHook.summary, `${prefix}.visualHook.summary`)

  const headline = requireObject(character.headline, `${prefix}.headline`)
  for (const field of ["kicker", "title", "intro"]) requireString(headline[field], `${prefix}.headline.${field}`)
  validatePairs(character.profile, `${prefix}.profile`, ["label", "value"])
  validatePairs(character.relationships, `${prefix}.relationships`, ["role", "name", "description"])
  validatePairs(character.affiliation, `${prefix}.affiliation`, ["label", "value"])
  if (!Array.isArray(character.bible) || character.bible.length !== 6) throw new Error(`${prefix}.bible must contain six sections`)
  character.bible.forEach((section, bibleIndex) => {
    const item = requireObject(section, `${prefix}.bible[${bibleIndex}]`)
    requireString(item.title, `${prefix}.bible[${bibleIndex}].title`)
    if (item.icon !== undefined) requireString(item.icon, `${prefix}.bible[${bibleIndex}].icon`)
    if (!Array.isArray(item.paragraphs) || item.paragraphs.length === 0) {
      throw new Error(`${prefix}.bible[${bibleIndex}].paragraphs must be non-empty`)
    }
    item.paragraphs.forEach((paragraph, paragraphIndex) =>
      requireString(paragraph, `${prefix}.bible[${bibleIndex}].paragraphs[${paragraphIndex}]`),
    )
  })
  if (!Array.isArray(character.sourcePaths) || character.sourcePaths.length === 0) {
    throw new Error(`${prefix}.sourcePaths must be non-empty`)
  }
  character.sourcePaths.forEach((sourcePath, sourceIndex) => requireString(sourcePath, `${prefix}.sourcePaths[${sourceIndex}]`))
  return character
}

function validatePairs(value, label, fields) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be non-empty`)
  value.forEach((entry, index) => {
    const item = requireObject(entry, `${label}[${index}]`)
    fields.forEach((field) => requireString(item[field], `${label}[${index}].${field}`))
  })
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

async function requirePortrait(root, relativePath) {
  const normalized = requireString(relativePath, "portrait").replaceAll("\\", "/")
  if (path.isAbsolute(normalized) || normalized.split("/").includes("..")) throw new Error(`Unsafe portrait path: ${relativePath}`)
  const extension = path.extname(normalized).toLowerCase()
  if (!new Set([".png", ".jpg", ".jpeg", ".webp"]).has(extension)) throw new Error(`Unsupported portrait type: ${extension}`)
  const resolved = path.resolve(root, normalized)
  assertInside(root, resolved, `Portrait escapes manifest directory: ${relativePath}`)
  if (!(await stat(resolved)).isFile()) throw new Error(`Portrait is not a file: ${relativePath}`)
  return resolved
}

async function copyViewer(name, destination) {
  const source = path.join(viewerDirectory, name)
  await access(source)
  await copyFile(source, destination)
}

async function writeJavaScript(destination, globalName, value) {
  await writeFile(destination, `window.${globalName} = ${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function requireOwnedOutput(directory) {
  const marker = JSON.parse(await readFile(path.join(directory, markerName), "utf8"))
  if (marker.skill !== "creatx-build-character-gallery" || marker.schemaVersion !== 1) {
    throw new Error(`Refusing to overwrite unowned output: ${directory}`)
  }
}

function assertSafeOutput(directory) {
  const root = path.parse(directory).root
  if (directory === root || path.dirname(directory) === directory) throw new Error(`Unsafe output directory: ${directory}`)
  assertInside(path.dirname(directory), directory, `Unsafe output directory: ${directory}`)
}

function assertInside(root, candidate, message) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(message)
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

function countBy(values, project) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(project(value), (counts.get(project(value)) ?? 0) + 1), new Map())].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  )
}
