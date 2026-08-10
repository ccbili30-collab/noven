export interface PerformanceFirstBrief {
  schemaVersion: 4
  objectId: string
  purpose: string
  materialPaths: string[]
  lockedFacts: Array<{ id: string; text: string; sourcePaths: string[] }>
  genreSuggestions: {
    primary: string
    alternatives: string[]
    techniques: string[]
    avoid: string[]
  }
}

export interface PostWriteExtraction {
  schemaVersion: 4
  objectId: string
  bodySha256: string
  facts: Array<{
    id: string
    text: string
    sourceLevel: "source" | "derived" | "created"
    sourcePaths: string[]
  }>
  relations: Array<{
    fromFactId: string
    toFactId: string
    type: "supports" | "causes" | "located-in" | "belongs-to" | "related-to"
    reason: string
  }>
  contradictions: string[]
  lockedFactConflicts: string[]
}

export function requirePerformanceFirstBrief(input: unknown, allowedSourcePaths: ReadonlySet<string>): PerformanceFirstBrief {
  const value = record(input, "writing brief")
  requireOnlyKeys(value, ["schemaVersion", "objectId", "purpose", "materialPaths", "lockedFacts", "genreSuggestions"], "writing brief")
  if (value.schemaVersion !== 4) throw new Error("growth_invalid: writing brief schemaVersion must be 4")
  const materialPaths = paths(value.materialPaths, "materialPaths", 12)
  const invalidMaterial = materialPaths.find((path) => !allowedSourcePaths.has(path))
  if (invalidMaterial) throw new Error(`growth_invalid: writing brief material is not available: ${invalidMaterial}`)
  const lockedFacts = records(value.lockedFacts, "lockedFacts", 12).map((item, index) => {
    requireOnlyKeys(item, ["id", "text", "sourcePaths"], `lockedFacts[${index}]`)
    const sourcePaths = paths(item.sourcePaths, `lockedFacts[${index}].sourcePaths`, 8)
    const invalid = sourcePaths.find((path) => !allowedSourcePaths.has(path))
    if (invalid) throw new Error(`growth_invalid: locked fact source is not available: ${invalid}`)
    return { id: text(item.id, `lockedFacts[${index}].id`, 160), text: text(item.text, `lockedFacts[${index}].text`, 2000), sourcePaths }
  })
  if (new Set(lockedFacts.map((fact) => fact.id)).size !== lockedFacts.length) throw new Error("growth_invalid: locked fact IDs must be unique")
  const suggestions = record(value.genreSuggestions, "genreSuggestions")
  requireOnlyKeys(suggestions, ["primary", "alternatives", "techniques", "avoid"], "genreSuggestions")
  return {
    schemaVersion: 4,
    objectId: text(value.objectId, "objectId", 160),
    purpose: text(value.purpose, "purpose", 2000),
    materialPaths,
    lockedFacts,
    genreSuggestions: {
      primary: text(suggestions.primary, "genreSuggestions.primary", 200),
      alternatives: strings(suggestions.alternatives, "genreSuggestions.alternatives", 8),
      techniques: strings(suggestions.techniques, "genreSuggestions.techniques", 12),
      avoid: strings(suggestions.avoid, "genreSuggestions.avoid", 12),
    },
  }
}

export function validatePublicWorldBody(body: string) {
  if (!body.trim()) throw new Error("growth_invalid: public body is empty")
  if (body.includes("�")) throw new Error("growth_invalid: public body contains invalid UTF-8 replacement characters")
  if (/(?:criticalGaps?|contentCards?|consistencyGuard|sourceLevel|epistemicStatus|\bsource\s*:\s*(?:source|derived|created)|\bderived\s*:|\bcreated\s*:)/iu.test(body)) {
    throw new Error("growth_invalid: public body exposes internal production labels")
  }
  if (/(?:卷首[^\n]{0,20}(?:问|问题)|先问[一二三四五六七八九十0-9]|(?:以下|下列)[^\n]{0,12}(?:问题|问句)|必须先[^。\n]{0,40}(?:问题|问清|发问)|先自行提出)/u.test(body)) {
    throw new Error("growth_invalid: public body exposes private self-questioning scaffolding")
  }
  if (/^#{1,6}\s*(?:事件定位|对象定位|叙述边界|运行边界|证据边界|研究包|检索过程|写作简报)\s*$/mu
    .test(body) || /(?:现有事实支持|来源没有给出|不支持在没有新增依据时|本段将|本文将从|接下来将介绍)/u.test(body)) {
    throw new Error("growth_invalid: public body exposes editorial or production scaffolding")
  }
  if (/(?:现实世界|现实历史|现实意义上的|本应存在|原本应该存在|另一条世界线)/u.test(body)) {
    throw new Error("growth_invalid: public body leaks external creative framing")
  }
}

export function validatePostWriteExtraction(input: unknown, context: {
  objectId: string
  bodySha256: string
  body: string
}): PostWriteExtraction {
  validatePublicWorldBody(context.body)
  const value = record(input, "post-write extraction")
  requireOnlyKeys(value, ["facts", "relations", "contradictions", "lockedFactConflicts"], "post-write extraction")
  const contradictions = strings(value.contradictions, "contradictions", 20)
  if (contradictions.length) throw new Error(`growth_invalid: within-article contradiction blocks completion: ${contradictions.join("; ")}`)
  const lockedFactConflicts = strings(value.lockedFactConflicts, "lockedFactConflicts", 20)
  if (lockedFactConflicts.length) throw new Error(`growth_invalid: locked fact conflict blocks completion: ${lockedFactConflicts.join("; ")}`)
  const facts = records(value.facts, "facts", 80).map((item, index) => {
    requireOnlyKeys(item, ["id", "text"], `facts[${index}]`)
    return { id: text(item.id, `facts[${index}].id`, 160), text: text(item.text, `facts[${index}].text`, 2000), sourceLevel: "created" as const, sourcePaths: [] }
  })
  const factIds = new Set(facts.map((fact) => fact.id))
  if (factIds.size !== facts.length) throw new Error("growth_invalid: extracted fact IDs must be unique")
  const relations = records(value.relations, "relations", 120).map((item, index) => {
    requireOnlyKeys(item, ["fromFactId", "toFactId", "type", "reason"], `relations[${index}]`)
    const fromFactId = text(item.fromFactId, `relations[${index}].fromFactId`, 160)
    const toFactId = text(item.toFactId, `relations[${index}].toFactId`, 160)
    if (!factIds.has(fromFactId) || !factIds.has(toFactId) || fromFactId === toFactId) throw new Error("growth_invalid: extracted relation endpoints are invalid")
    if (!(["supports", "causes", "located-in", "belongs-to", "related-to"] as const).includes(item.type as PostWriteExtraction["relations"][number]["type"])) {
      throw new Error(`growth_invalid: relations[${index}].type is invalid`)
    }
    return { fromFactId, toFactId, type: item.type as PostWriteExtraction["relations"][number]["type"], reason: text(item.reason, `relations[${index}].reason`, 1000) }
  })
  return { schemaVersion: 4, objectId: context.objectId, bodySha256: context.bodySha256, facts, relations, contradictions, lockedFactConflicts }
}

function record(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`growth_invalid: ${name} must be an object`)
  return value as Record<string, unknown>
}

function records(value: unknown, name: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`growth_invalid: ${name} is invalid`)
  return value.map((item, index) => record(item, `${name}[${index}]`))
}

function strings(value: unknown, name: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`growth_invalid: ${name} is invalid`)
  return value.map((item, index) => text(item, `${name}[${index}]`, 2000))
}

function paths(value: unknown, name: string, maximum: number) {
  const values = strings(value, name, maximum).map((path) => path.replaceAll("\\", "/"))
  if (new Set(values).size !== values.length || values.some((path) => path.startsWith("/") || /^[a-z]:\//iu.test(path) || path.split("/").includes(".."))) {
    throw new Error(`growth_invalid: ${name} contains an invalid path`)
  }
  return values
}

function text(value: unknown, name: string, maximum: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`growth_invalid: ${name} is invalid`)
  return value.trim()
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: string[], name: string) {
  const invalid = Object.keys(value).find((key) => !allowed.includes(key))
  if (invalid) throw new Error(`growth_invalid: ${name} contains unknown field ${invalid}`)
}
