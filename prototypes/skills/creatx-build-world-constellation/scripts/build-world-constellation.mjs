import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SKILL_ID = "creatx-build-world-constellation"
const OUTPUT_MARKER = ".creatx-world-constellation.json"
const LAYER_ORDER = [
  "核心规则与边界",
  "宇宙、自然与地理",
  "生态、资源与物种",
  "经济、技术与力量体系",
  "社会、文化与日常生活",
  "国家、组织与权力",
  "历史、时代与重大事件",
  "地区、城市与重要地点",
  "当前局势与核心冲突",
  "人物、关系与阵营",
  "故事、传说与叙事入口",
  "视觉、地图与关系索引",
]

main().catch((error) => {
  const code = typeof error?.code === "string" ? error.code : "UNEXPECTED"
  const message = error instanceof Error ? error.message : String(error)
  console.error(`WORLD_CONSTELLATION_ERROR [${code}] ${message}`)
  process.exitCode = 1
})

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) return printHelp()
  const projectRoot = resolveRequiredDirectory(options.projectRoot, "--project-root")
  await access(projectRoot)
  const requestedWorldRoot = normalizeRequestedWorldRoot(options.worldRoot, projectRoot)
  const discovery = await discoverCandidates(projectRoot, options.goalId)
  const selected = selectCandidate(discovery.candidates, discovery.invalid, requestedWorldRoot, options.goalId)
  const outputRoot = resolveOutputRoot(options.output, projectRoot, selected.worldRoot)
  await assertSafeOutput(outputRoot, projectRoot)
  const atlas = await buildAtlas(selected, projectRoot)
  const summary = createSummary(selected, atlas, outputRoot, discovery.invalid)
  await writeOutput(outputRoot, atlas, summary)
  console.log(JSON.stringify(summary, null, 2))
}

function parseArguments(args) {
  const known = new Set(["--project-root", "--world-root", "--goal-id", "--output"])
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--help" || argument === "-h") return { help: true }
    if (!known.has(argument)) throw failure("ARGUMENT", `未知参数：${argument}`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw failure("ARGUMENT", `${argument} 缺少值`)
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = value
    index += 1
  }
  if (!options.projectRoot) throw failure("ARGUMENT", "必须提供 --project-root")
  return options
}

function printHelp() {
  console.log(`Usage:
  node build-world-constellation.mjs --project-root <path> [options]

Options:
  --world-root <worlds\\name>  Select one world when the project contains several
  --goal-id <goal_id>          Select one Growth Goal
  --output <path>              Override the default <world-root>\\世界关系球
  --help                       Show this help`)
}

function resolveRequiredDirectory(value, label) {
  if (!value?.trim()) throw failure("ARGUMENT", `${label} 不能为空`)
  return resolve(value)
}

function normalizeRequestedWorldRoot(value, projectRoot) {
  if (!value) return undefined
  const candidate = isAbsolute(value) ? relative(projectRoot, resolve(value)) : value
  const normalized = toPosix(candidate).replace(/^\.\//, "").replace(/\/$/, "")
  if (normalized === ".." || normalized.startsWith("../")) throw failure("WORLD_ROOT", "--world-root 必须位于项目根内")
  if (!/^worlds\/[^/]+$/.test(normalized)) throw failure("WORLD_ROOT", "--world-root 必须形如 worlds\\世界名")
  return normalized
}

async function discoverCandidates(projectRoot, goalId) {
  const goalsRoot = join(projectRoot, ".creatx", "growth", "goals")
  const goalDirectories = await readdir(goalsRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") throw failure("NO_GROWTH_STATE", `找不到 Growth Goal 目录：${goalsRoot}`)
    throw error
  })
  const selectedDirectories = goalDirectories
    .filter((entry) => entry.isDirectory() && (!goalId || entry.name === goalId))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (goalId && selectedDirectories.length === 0) throw failure("GOAL_NOT_FOUND", `找不到 Goal：${goalId}`)

  const candidates = []
  const invalid = []
  for (const directory of selectedDirectories) {
    const goalRoot = join(goalsRoot, directory.name)
    const materializationPath = join(goalRoot, "world", "materialization", "relations.json")
    if (await exists(materializationPath)) {
      try {
        const document = await readJson(materializationPath)
        validateRelationsDocument(document, materializationPath)
        const roots = extractWorldRoots(document.nodes)
        if (roots.length === 0) throw failure("NO_WORLD", `${materializationPath} 不含 worlds/<世界> 节点`)
        const modifiedAt = (await stat(materializationPath)).mtimeMs
        roots.forEach((worldRoot) => candidates.push({
          kind: "materialization",
          priority: 2,
          goalId: directory.name,
          worldRoot,
          sourcePath: materializationPath,
          modifiedAt,
          document,
        }))
      } catch (error) {
        invalid.push(describeInvalid(directory.name, materializationPath, error))
      }
    }

    const blueprintIndexPath = join(goalRoot, "world", "blueprint", "index.json")
    if (await exists(blueprintIndexPath)) {
      try {
        const document = await readBlueprint(goalRoot)
        candidates.push({
          kind: "blueprint",
          priority: 1,
          goalId: directory.name,
          worldRoot: document.worldRoot,
          sourcePath: blueprintIndexPath,
          modifiedAt: (await stat(blueprintIndexPath)).mtimeMs,
          document,
        })
      } catch (error) {
        invalid.push(describeInvalid(directory.name, blueprintIndexPath, error))
      }
    }
  }
  return { candidates, invalid }
}

async function readBlueprint(goalRoot) {
  const blueprintRoot = join(goalRoot, "world", "blueprint")
  const index = await readJson(join(blueprintRoot, "index.json"))
  if (index?.status !== "frozen") throw failure("BLUEPRINT_NOT_FROZEN", `${join(blueprintRoot, "index.json")} 尚未冻结`)
  if (typeof index.root !== "string" || !/^worlds\/[^/]+$/.test(toPosix(index.root))) {
    throw failure("BLUEPRINT_ROOT", "冻结蓝图没有有效 root")
  }
  const layerFiles = (await readdir(join(blueprintRoot, "layers"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (layerFiles.length === 0) throw failure("BLUEPRINT_LAYERS", "冻结蓝图没有层文件")
  const layers = await Promise.all(layerFiles.map(async (entry) => readJson(join(blueprintRoot, "layers", entry.name))))
  layers.forEach((layer, indexValue) => {
    if (typeof layer?.layer !== "string" || !Array.isArray(layer.objects)) {
      throw failure("BLUEPRINT_LAYER", `${layerFiles[indexValue].name} 结构无效`)
    }
  })
  const relationsPath = join(blueprintRoot, "relations.json")
  const relationsDocument = await readJson(relationsPath)
  if (!Array.isArray(relationsDocument?.relations)) throw failure("BLUEPRINT_RELATIONS", `${relationsPath} 缺少 relations 数组`)
  const entries = layers.flatMap((layer) => layer.objects
    .filter((object) => object?.kind === "entry" && typeof object.id === "string" && typeof object.plannedPath === "string")
    .map((object) => ({
      id: object.id,
      title: typeof object.title === "string" ? object.title : basename(object.plannedPath),
      layer: layer.layer,
      path: toPosix(object.plannedPath),
    })))
  if (entries.length === 0) throw failure("BLUEPRINT_ENTRIES", "冻结蓝图没有可投影 entry")
  return {
    worldRoot: toPosix(index.root),
    nodes: entries,
    relations: relationsDocument.relations,
  }
}

function validateRelationsDocument(document, sourcePath) {
  if (!document || !Array.isArray(document.nodes) || !Array.isArray(document.relations)) {
    throw failure("RELATIONS_SHAPE", `${sourcePath} 必须包含 nodes 和 relations 数组`)
  }
  if (document.nodes.some((node) => typeof node?.id !== "string")) {
    throw failure("RELATIONS_NODE", `${sourcePath} 含无效节点`)
  }
  if (document.relations.some((relationValue) => typeof relationValue?.from !== "string" || typeof relationValue?.to !== "string" || typeof relationValue?.type !== "string")) {
    throw failure("RELATIONS_EDGE", `${sourcePath} 含无效关系`)
  }
}

function extractWorldRoots(nodes) {
  return [...new Set(nodes.flatMap((node) => {
    const match = toPosix(node?.path ?? "").match(/^(worlds\/[^/]+)(?:\/|$)/)
    return match ? [match[1]] : []
  }))].sort((left, right) => left.localeCompare(right))
}

function selectCandidate(candidates, invalid, requestedWorldRoot, goalId) {
  if (goalId && invalid.some((item) => item.goalId === goalId)) {
    throw failure("INVALID_GOAL", `Goal ${goalId} 的世界数据损坏：${invalid.filter((item) => item.goalId === goalId).map((item) => item.message).join("；")}`)
  }
  const matching = candidates.filter((candidate) => !requestedWorldRoot || candidate.worldRoot === requestedWorldRoot)
  if (matching.length === 0) {
    const suffix = requestedWorldRoot ? `（${requestedWorldRoot}）` : ""
    const details = invalid.length > 0 ? `；无效候选：${invalid.map((item) => item.message).join("；")}` : ""
    throw failure("NO_VALID_SOURCE", `找不到可用的世界蓝图或物化关系${suffix}${details}`)
  }
  const roots = [...new Set(matching.map((candidate) => candidate.worldRoot))]
  if (!requestedWorldRoot && roots.length > 1) {
    throw failure("AMBIGUOUS_WORLD", `项目包含多个世界：${roots.join("、")}。请提供 --world-root`)
  }
  return matching.sort((left, right) =>
    right.priority - left.priority
    || right.modifiedAt - left.modifiedAt
    || left.goalId.localeCompare(right.goalId))[0]
}

function resolveOutputRoot(value, projectRoot, worldRoot) {
  const outputRoot = value ? resolve(value) : resolve(projectRoot, ...worldRoot.split("/"), "世界关系球")
  if (outputRoot === projectRoot) throw failure("OUTPUT_UNSAFE", "输出目录不能是项目根")
  const internalRoot = resolve(projectRoot, ".creatx")
  if (isWithin(outputRoot, internalRoot)) throw failure("OUTPUT_UNSAFE", "输出目录不得位于 .creatx")
  return outputRoot
}

async function assertSafeOutput(outputRoot, projectRoot) {
  const parent = dirname(outputRoot)
  await mkdir(parent, { recursive: true })
  if (!await exists(outputRoot)) return
  const entries = await readdir(outputRoot)
  if (entries.length === 0) return
  const markerPath = join(outputRoot, OUTPUT_MARKER)
  if (!await exists(markerPath)) throw failure("OUTPUT_OWNERSHIP", `拒绝覆盖非本 Skill 产物：${outputRoot}`)
  const marker = await readJson(markerPath).catch(() => undefined)
  if (marker?.skill !== SKILL_ID) throw failure("OUTPUT_OWNERSHIP", `输出标记无效：${markerPath}`)
  if (marker.projectRoot && resolve(marker.projectRoot) !== projectRoot) {
    throw failure("OUTPUT_OWNERSHIP", "现有输出属于另一个项目")
  }
}

async function buildAtlas(selected, projectRoot) {
  const document = selected.document
  const source = selected.kind === "materialization" ? document : { nodes: document.nodes, relations: document.relations }
  const worldPrefix = `${selected.worldRoot}/`
  const nodes = source.nodes.filter((node) => toPosix(node?.path ?? "").startsWith(worldPrefix))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const workByPath = new Map()

  nodes.forEach((node) => {
    const normalizedPath = toPosix(node.path)
    const layer = normalizedPath.slice(worldPrefix.length).split("/")[0]
    if (!LAYER_ORDER.includes(layer)) return
    if (!workByPath.has(normalizedPath)) {
      workByPath.set(normalizedPath, {
        id: `work:${normalizedPath}`,
        title: basename(normalizedPath).replace(/\.[^.]+$/, ""),
        layer,
        path: normalizedPath,
        content: "",
        factIds: [],
      })
    }
    if (node.layer !== "正文事实" && typeof node.title === "string") workByPath.get(normalizedPath).title = node.title
  })
  if (workByPath.size === 0) throw failure("NO_WORKS", `${selected.worldRoot} 没有十二层作品节点`)

  const missingDocuments = []
  const works = await Promise.all([...workByPath.values()].map(async (work) => {
    const absolutePath = resolveProjectPath(projectRoot, work.path)
    try {
      return { ...work, content: await readFile(absolutePath, "utf8") }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      missingDocuments.push(work.path)
      return work
    }
  }))
  const finalWorkByPath = new Map(works.map((work) => [work.path, work]))
  const facts = selected.kind === "materialization" ? nodes
    .filter((node) => node.layer === "正文事实" && finalWorkByPath.has(toPosix(node.path)))
    .map((node) => {
      const pathValue = toPosix(node.path)
      const fact = {
        id: node.id,
        title: typeof node.title === "string" ? node.title : node.id,
        workId: finalWorkByPath.get(pathValue).id,
        path: pathValue,
      }
      finalWorkByPath.get(pathValue).factIds.push(fact.id)
      return fact
    }) : []
  const factById = new Map(facts.map((fact) => [fact.id, fact]))
  const relationKeys = new Set()
  const workRelations = []
  const factRelations = []

  source.relations.forEach((relationValue) => {
    const fromNode = nodeById.get(relationValue.from)
    const toNode = nodeById.get(relationValue.to)
    const fromPath = toPosix(fromNode?.path ?? "")
    const toPath = toPosix(toNode?.path ?? "")
    const fromWork = finalWorkByPath.get(fromPath)
    const toWork = finalWorkByPath.get(toPath)
    if (!fromWork || !toWork) return
    if (fromPath !== toPath) {
      const key = `${relationValue.type}:${fromWork.id}->${toWork.id}`
      if (relationKeys.has(key)) return
      relationKeys.add(key)
      workRelations.push({
        id: `work-relation:${workRelations.length + 1}`,
        source: fromWork.id,
        target: toWork.id,
        type: relationValue.type,
        reason: relationValue.reason ?? relationValue.note ?? "已登记作品关系",
      })
      return
    }
    if (!factById.has(relationValue.from) || !factById.has(relationValue.to)) return
    factRelations.push({
      id: `fact-relation:${factRelations.length + 1}`,
      source: relationValue.from,
      target: relationValue.to,
      workId: fromWork.id,
      type: relationValue.type,
      reason: relationValue.reason ?? relationValue.note ?? "已登记内部关系",
    })
  })

  const layerRoutes = new Map()
  const workById = new Map(works.map((work) => [work.id, work]))
  workRelations.forEach((relationValue) => {
    const sourceLayer = workById.get(relationValue.source)?.layer
    const targetLayer = workById.get(relationValue.target)?.layer
    if (!sourceLayer || !targetLayer || sourceLayer === targetLayer) return
    const key = `${sourceLayer}->${targetLayer}`
    if (!layerRoutes.has(key)) layerRoutes.set(key, { id: `route:${key}`, sourceLayer, targetLayer, total: 0 })
    const route = layerRoutes.get(key)
    route[relationValue.type] = (route[relationValue.type] ?? 0) + 1
    route.total += 1
  })

  return {
    schemaVersion: 3,
    prototype: true,
    degraded: selected.kind === "blueprint",
    inputMode: selected.kind,
    world: basename(selected.worldRoot),
    worldRoot: selected.worldRoot,
    source: toPosix(selected.sourcePath),
    projectRoot: toPosix(projectRoot),
    layerOrder: LAYER_ORDER,
    sourceNodeCount: source.nodes.length,
    sourceRelationCount: source.relations.length,
    missingDocuments: missingDocuments.sort((left, right) => left.localeCompare(right)),
    works,
    facts,
    workRelations,
    factRelations,
    layerRoutes: [...layerRoutes.values()],
  }
}

function createSummary(selected, atlas, outputRoot, invalid) {
  return {
    schemaVersion: 1,
    prototype: true,
    requiresNetwork: true,
    inputMode: selected.kind,
    degraded: atlas.degraded,
    degradationReason: atlas.degraded ? "只找到冻结蓝图；未投影正文事实及物化关系" : null,
    goalId: selected.goalId,
    source: atlas.source,
    projectRoot: atlas.projectRoot,
    world: atlas.world,
    worldRoot: atlas.worldRoot,
    outputRoot: toPosix(outputRoot),
    counts: {
      works: atlas.works.length,
      facts: atlas.facts.length,
      workRelations: atlas.workRelations.length,
      factRelations: atlas.factRelations.length,
      missingDocuments: atlas.missingDocuments.length,
    },
    missingDocuments: atlas.missingDocuments,
    warnings: [
      "Prototype 通过 CDN 加载 Globe.GL，不是离线产物或生产 Renderer 接入证据。",
      ...invalid.map((item) => `忽略无效候选 ${item.goalId}: ${item.message}`),
    ],
  }
}

async function writeOutput(outputRoot, atlas, summary) {
  await mkdir(outputRoot, { recursive: true })
  const viewerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets", "viewer")
  const assets = [
    "index.html",
    "globe-app.js",
    "styles.css",
    "starfield-panorama-nebula.png",
    "THIRD_PARTY_NOTICES.md",
  ]
  await Promise.all(assets.map(async (name) => writeFile(join(outputRoot, name), await readFile(join(viewerRoot, name)), { flag: "w" })))
  await writeFile(join(outputRoot, "graph-data.js"), `window.WORLD_CONSTELLATION_DATA = ${JSON.stringify(atlas)};\n`, "utf8")
  await writeFile(join(outputRoot, "generation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
  await writeFile(join(outputRoot, OUTPUT_MARKER), `${JSON.stringify({
    schemaVersion: 1,
    skill: SKILL_ID,
    projectRoot: atlas.projectRoot,
    worldRoot: atlas.worldRoot,
    source: atlas.source,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8")
}

function resolveProjectPath(projectRoot, projectPath) {
  const absolutePath = resolve(projectRoot, ...toPosix(projectPath).split("/"))
  if (!isWithin(absolutePath, projectRoot)) throw failure("PATH_ESCAPE", `项目路径越界：${projectPath}`)
  return absolutePath
}

function isWithin(candidate, parent) {
  const pathValue = relative(parent, candidate)
  return pathValue === "" || (!pathValue.startsWith(`..${sep}`) && pathValue !== ".." && !isAbsolute(pathValue))
}

async function readJson(pathValue) {
  const text = await readFile(pathValue, "utf8")
  try {
    return JSON.parse(text)
  } catch {
    throw failure("INVALID_JSON", `JSON 损坏：${pathValue}`)
  }
}

async function exists(pathValue) {
  return access(pathValue).then(() => true, () => false)
}

function describeInvalid(goalId, sourcePath, error) {
  return {
    goalId,
    sourcePath: toPosix(sourcePath),
    code: typeof error?.code === "string" ? error.code : "INVALID_SOURCE",
    message: error instanceof Error ? error.message : String(error),
  }
}

function toPosix(value) {
  return String(value).replaceAll("\\", "/")
}

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}
