import { createHash } from "node:crypto"
import { publicationGenre } from "./publication-genres.ts"
import { topicGenreCandidates, topicGenreProfile, type TopicGenreProfileKey } from "./topic-genre-profiles.ts"
import { WORLD_BLUEPRINT_LAYERS, type WorldBlueprintObject } from "./schema.ts"

const NARRATIVE_DISTANCES = ["intimate", "observational", "historical", "institutional"] as const
const REGISTERS = ["plain", "literary", "oral", "documentary"] as const
const KNOWLEDGE_POSITIONS = ["in-world-limited", "retrospective", "contemporary", "editorial"] as const

export interface WorldStyleProfile {
  schemaVersion: 1
  narrativeDistance: typeof NARRATIVE_DISTANCES[number]
  register: typeof REGISTERS[number]
  knowledgePosition: typeof KNOWLEDGE_POSITIONS[number]
  languageConventions: string[]
  forbiddenPatterns: string[]
  sourceIds: string[]
}

export interface WorldWritingContract {
  schemaVersion: 1
  genreLibraryVersion: 1
  topicProfileKey: TopicGenreProfileKey
  topicProfileVersion: 1
  genreKey: string
  genreLabel: string
  object: {
    id: string
    key: string
    title: string
    layer: WorldBlueprintObject["layer"]
    locator: string
  }
  appliesTo: string
  narrator: string
  reader: string
  structure: string[]
  language: string[]
  researchDimensions: string[]
  forbidden: string[]
  worldStyle: WorldStyleProfile
}

export function resolveWritingContract(input: {
  topicProfileKey: string
  worldStyleProfile: WorldStyleProfile
  object: WorldBlueprintObject & { genreKey: string }
}): WorldWritingContract {
  const topic = topicGenreProfile(input.topicProfileKey)
  const style = requireWorldStyleProfile(input.worldStyleProfile)
  if (input.object.kind !== "entry") throw new Error("growth_invalid: only entry objects have a writing contract")
  if (!topicGenreCandidates(topic.key, input.object.layer).includes(input.object.genreKey)) {
    throw new Error(`growth_invalid: genreKey ${input.object.genreKey} is not allowed by topic ${topic.key} for layer ${input.object.layer}`)
  }
  const genre = publicationGenre(input.object.layer, input.object.genreKey)
  return {
    schemaVersion: 1,
    genreLibraryVersion: 1,
    topicProfileKey: topic.key,
    topicProfileVersion: topic.version,
    genreKey: genre.key,
    genreLabel: genre.label,
    object: {
      id: input.object.id,
      key: input.object.key,
      title: input.object.title,
      layer: input.object.layer,
      locator: input.object.locator,
    },
    appliesTo: genre.appliesTo,
    narrator: genre.narrator,
    reader: genre.reader,
    structure: [...genre.structure],
    language: [...genre.language],
    researchDimensions: [...genre.researchDimensions],
    forbidden: [...genre.forbidden],
    worldStyle: style,
  }
}

export function requireWorldStyleProfile(value: unknown): WorldStyleProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("blueprint_invalid: worldStyleProfile must be an object")
  const profile = value as Record<string, unknown>
  requireOnlyKeys(profile, ["schemaVersion", "narrativeDistance", "register", "knowledgePosition", "languageConventions", "forbiddenPatterns", "sourceIds"])
  if (profile.schemaVersion !== 1) throw new Error("blueprint_invalid: worldStyleProfile schemaVersion must be 1")
  if (!NARRATIVE_DISTANCES.includes(profile.narrativeDistance as typeof NARRATIVE_DISTANCES[number])) throw new Error("blueprint_invalid: worldStyleProfile narrativeDistance is invalid")
  if (!REGISTERS.includes(profile.register as typeof REGISTERS[number])) throw new Error("blueprint_invalid: worldStyleProfile register is invalid")
  if (!KNOWLEDGE_POSITIONS.includes(profile.knowledgePosition as typeof KNOWLEDGE_POSITIONS[number])) throw new Error("blueprint_invalid: worldStyleProfile knowledgePosition is invalid")
  return {
    schemaVersion: 1,
    narrativeDistance: profile.narrativeDistance as WorldStyleProfile["narrativeDistance"],
    register: profile.register as WorldStyleProfile["register"],
    knowledgePosition: profile.knowledgePosition as WorldStyleProfile["knowledgePosition"],
    languageConventions: stringArray(profile.languageConventions, "worldStyleProfile.languageConventions", 12, true),
    forbiddenPatterns: stringArray(profile.forbiddenPatterns, "worldStyleProfile.forbiddenPatterns", 12),
    sourceIds: stringArray(profile.sourceIds, "worldStyleProfile.sourceIds", 20),
  }
}

export function hashWritingContract(contract: WorldWritingContract) {
  return createHash("sha256").update(canonicalJson(contract)).digest("hex")
}

export function requireWritingContractSnapshot(value: unknown): WorldWritingContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("growth_invalid: writing contract snapshot must be an object")
  const contract = value as Record<string, unknown>
  requireOnlyKeys(contract, ["schemaVersion", "genreLibraryVersion", "topicProfileKey", "topicProfileVersion", "genreKey", "genreLabel", "object", "appliesTo", "narrator", "reader", "structure", "language", "researchDimensions", "forbidden", "worldStyle"], "writing contract")
  if (contract.schemaVersion !== 1 || contract.genreLibraryVersion !== 1 || contract.topicProfileVersion !== 1) throw new Error("growth_invalid: writing contract snapshot version is invalid")
  if (!contract.object || typeof contract.object !== "object" || Array.isArray(contract.object)) throw new Error("growth_invalid: writing contract object identity is invalid")
  const object = contract.object as Record<string, unknown>
  requireOnlyKeys(object, ["id", "key", "title", "layer", "locator"], "writing contract object")
  if (!WORLD_BLUEPRINT_LAYERS.includes(object.layer as WorldBlueprintObject["layer"])) throw new Error("growth_invalid: writing contract object layer is invalid")
  return {
    schemaVersion: 1,
    genreLibraryVersion: 1,
    topicProfileKey: requiredText(contract.topicProfileKey, "writing contract topicProfileKey") as TopicGenreProfileKey,
    topicProfileVersion: 1,
    genreKey: requiredText(contract.genreKey, "writing contract genreKey"),
    genreLabel: requiredText(contract.genreLabel, "writing contract genreLabel"),
    object: {
      id: requiredText(object.id, "writing contract object id"),
      key: requiredText(object.key, "writing contract object key"),
      title: requiredText(object.title, "writing contract object title"),
      layer: object.layer as WorldBlueprintObject["layer"],
      locator: requiredText(object.locator, "writing contract object locator"),
    },
    appliesTo: requiredText(contract.appliesTo, "writing contract appliesTo"),
    narrator: requiredText(contract.narrator, "writing contract narrator"),
    reader: requiredText(contract.reader, "writing contract reader"),
    structure: stringArray(contract.structure, "writing contract structure", 30, true),
    language: stringArray(contract.language, "writing contract language", 30, true),
    researchDimensions: stringArray(contract.researchDimensions, "writing contract researchDimensions", 30, true),
    forbidden: stringArray(contract.forbidden, "writing contract forbidden", 30),
    worldStyle: requireWorldStyleProfile(contract.worldStyle),
  }
}

function stringArray(value: unknown, name: string, maxItems: number, required = false) {
  if (!Array.isArray(value) || value.length > maxItems || (required && value.length === 0)) throw new Error(`blueprint_invalid: ${name} is invalid`)
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim() || item.length > 200) throw new Error(`blueprint_invalid: ${name}[${index}] is invalid`)
    return item.trim()
  })
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: string[], name = "worldStyleProfile") {
  const invalid = Object.keys(value).find((key) => !allowed.includes(key))
  if (invalid) throw new Error(`blueprint_invalid: ${name} contains unknown field ${invalid}`)
}

function requiredText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(`growth_invalid: ${name} is invalid`)
  return value.trim()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
  return JSON.stringify(value)
}
