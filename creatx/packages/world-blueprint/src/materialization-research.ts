import type { WorldBlueprintObject } from "./schema.ts"
import type { WorldWritingContract } from "./writing-contract.ts"

export const WORLD_MATERIALIZATION_RESEARCH_ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "contentBrief", "claims", "contentCards", "terms", "consistencyGuard", "criticalGaps"],
  properties: {
    action: { const: "submit_research" },
    contentBrief: {
      type: "object",
      additionalProperties: false,
      required: ["focus", "requiredElements", "concreteDetails", "developmentSpace", "avoidDuplication"],
      properties: {
        focus: { type: "string", minLength: 1, maxLength: 1000 },
        requiredElements: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", minLength: 1 } },
        concreteDetails: { type: "array", minItems: 1, maxItems: 40, items: { type: "string", minLength: 1 } },
        developmentSpace: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", minLength: 1 } },
        avoidDuplication: { type: "array", maxItems: 30, items: { type: "string", minLength: 1 } },
      },
    },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "claim", "epistemicStatus", "sourcePaths", "relevance"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 160 },
          claim: { type: "string", minLength: 1, maxLength: 2000 },
          epistemicStatus: { enum: ["established", "contested", "inferred"] },
          sourcePaths: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } },
          relevance: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
    contentCards: {
      type: "array",
      minItems: 0,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "claimId"],
        properties: {
          beat: { type: "string", minLength: 1, maxLength: 300 },
          claimId: { type: "string", minLength: 1, maxLength: 160 },
        },
      },
    },
    terms: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canonical", "claimId"],
        properties: {
          canonical: { type: "string", minLength: 1, maxLength: 200 },
          aliases: { type: "array", maxItems: 20, items: { type: "string", minLength: 1 } },
          claimId: { type: "string", minLength: 1, maxLength: 160 },
        },
      },
    },
    consistencyGuard: {
      type: "object",
      additionalProperties: false,
      required: ["invariants", "attributedClaims"],
      properties: {
        invariants: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "claimIds"],
            properties: {
              text: { type: "string", minLength: 1, maxLength: 2000 },
              claimIds: { type: "array", minItems: 1, maxItems: 1, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 160 } },
            },
          },
        },
        attributedClaims: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "attributionClaimId", "claimIds"],
            properties: {
              text: { type: "string", minLength: 1, maxLength: 2000 },
              attributionClaimId: { type: "string", minLength: 1, maxLength: 160 },
              claimIds: { type: "array", minItems: 1, maxItems: 1, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 160 } },
            },
          },
        },
      },
    },
    criticalGaps: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "reason"],
        properties: {
          beat: { type: "string", minLength: 1, maxLength: 300 },
          reason: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
    excludedExternalTerms: { type: "array", maxItems: 30, items: { type: "string", minLength: 1 } },
  },
} satisfies Record<string, unknown>

export interface WorldMaterializationClaim {
  id: string
  claim: string
  epistemicStatus: "established" | "contested" | "inferred"
  sourcePaths: string[]
  relevance: string
}

export interface WorldMaterializationResearchPacketV6 {
  schemaVersion: 6
  objectId: string
  writingContractHash: string
  contentBrief: {
    focus: string
    requiredElements: string[]
    concreteDetails: string[]
    developmentSpace: string[]
    avoidDuplication: string[]
  }
  claims: WorldMaterializationClaim[]
  contentCards: Array<{ beat: string; text: string; claimIds: string[] }>
  terms: Array<{ canonical: string; aliases: string[]; usedBy: string }>
  consistencyGuard: {
    invariants: Array<{ text: string; claimIds: string[] }>
    attributedClaims: Array<{ text: string; attribution: string; claimIds: string[] }>
    openFields: string[]
  }
  unresolvedDetails: string[]
  criticalGaps: string[]
  excludedExternalTerms: string[]
}

export interface WorldMaterializationResearchPacketV7 {
  schemaVersion: 7
  objectId: string
  writingContractHash: string
  contentBrief: WorldMaterializationResearchPacketV6["contentBrief"]
  claims: WorldMaterializationClaim[]
  contentCards: Array<{ beat: string; claimId: string }>
  terms: Array<{ canonical: string; aliases: string[]; claimId: string }>
  consistencyGuard: {
    invariants: Array<{ text: string; claimIds: string[] }>
    attributedClaims: Array<{ text: string; attributionClaimId: string; claimIds: string[] }>
  }
  criticalGaps: Array<{ beat: string; reason: string }>
  excludedExternalTerms: string[]
}

export type WorldMaterializationResearchPacket = WorldMaterializationResearchPacketV6 | WorldMaterializationResearchPacketV7

function requireResearchPacketV6(input: unknown, object: WorldBlueprintObject, contract: WorldWritingContract, writingContractHash: string): WorldMaterializationResearchPacketV6 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: research input must be an object")
  const value = input as Record<string, unknown>
  const claims = objectArray(value.claims, "claims", 1, 30).map((item, index) => ({
    id: text(item.id, `claims[${index}].id`, 160),
    claim: text(item.claim, `claims[${index}].claim`, 2000),
    epistemicStatus: epistemicStatus(item.epistemicStatus, index),
    sourcePaths: normalizedPaths(item.sourcePaths, `claims[${index}].sourcePaths`),
    relevance: text(item.relevance, `claims[${index}].relevance`, 1000),
  }))
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) throw new Error("growth_invalid: claim IDs must be unique")
  if (contract.object.id !== object.id || contract.genreKey !== object.genreKey) throw new Error("growth_invalid: writing contract does not match the research object")
  const claimIds = new Set(claims.map((claim) => claim.id))
  const contentCards = objectArray(value.contentCards, "contentCards", contract.structure.length, 30).map((item, index) => ({
    beat: text(item.beat, `contentCards[${index}].beat`, 300),
    text: text(item.text, `contentCards[${index}].text`, 2000),
    claimIds: stringArray(item.claimIds, `contentCards[${index}].claimIds`, 1, 20),
  }))
  const invalidBeat = contentCards.find((card) => !contract.structure.includes(card.beat))
  if (invalidBeat) throw new Error(`growth_invalid: content card beat is not allowed for ${contract.genreKey}: ${invalidBeat.beat}`)
  const missingBeat = contract.structure.find((beat) => !contentCards.some((card) => card.beat === beat))
  if (missingBeat) throw new Error(`growth_invalid: content cards do not cover genre beat: ${missingBeat}`)
  const unknownClaimId = contentCards.flatMap((card) => card.claimIds).find((id) => !claimIds.has(id))
  if (unknownClaimId) throw new Error(`growth_invalid: content card references unknown claim: ${unknownClaimId}`)
  const exposedProductionLanguage = contentCards.find((card) => containsProductionAnalysisLanguage(card.text))
  if (exposedProductionLanguage) throw new Error("growth_invalid: content cards must translate production analysis into genre-ready material")
  const terms = objectArray(value.terms, "terms", 1, 30).map((item, index) => ({
    canonical: text(item.canonical, `terms[${index}].canonical`, 200),
    aliases: optionalStringArray(item.aliases, `terms[${index}].aliases`, 20),
    usedBy: text(item.usedBy, `terms[${index}].usedBy`, 500),
  }))
  const invalidTerm = terms.find((term) => [term.canonical, ...term.aliases, term.usedBy].some(containsProductionAnalysisLanguage))
  if (invalidTerm) throw new Error(`growth_invalid: formal term ${invalidTerm.canonical} contains production analysis language`)
  const consistencyGuard = requireConsistencyGuard(value.consistencyGuard, claims)
  const invariantClaimIds = new Set(consistencyGuard.invariants.flatMap((item) => item.claimIds))
  const unguardedEstablishedClaim = contentCards
    .flatMap((card) => card.claimIds)
    .map((id) => claims.find((claim) => claim.id === id)!)
    .find((claim) => claim.epistemicStatus === "established" && !invariantClaimIds.has(claim.id))
  if (unguardedEstablishedClaim) throw new Error(`growth_invalid: established content card claim requires invariant: ${unguardedEstablishedClaim.id}`)
  const criticalGaps = optionalStringArray(value.criticalGaps, "criticalGaps", 20)
  if (criticalGaps.length) throw new Error(`growth_invalid: critical genre gaps block Writer dispatch: ${criticalGaps.join("；")}`)
  const unresolvedDetails = optionalStringArray(value.unresolvedDetails, "unresolvedDetails", 30)
  if (unresolvedDetails.some(containsProductionAnalysisLanguage)) throw new Error("growth_invalid: unresolved details must describe world-facing uncertainty")
  return {
    schemaVersion: 6,
    objectId: object.id,
    writingContractHash,
    contentBrief: requireContentBrief(value.contentBrief),
    claims,
    contentCards,
    terms,
    consistencyGuard,
    unresolvedDetails,
    criticalGaps,
    excludedExternalTerms: optionalStringArray(value.excludedExternalTerms, "excludedExternalTerms", 30),
  }
}

export function requireResearchSubmissionV7(input: unknown, object: WorldBlueprintObject, contract: WorldWritingContract, writingContractHash: string): WorldMaterializationResearchPacketV7 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: research input must be an object")
  const value = input as Record<string, unknown>
  const claims = requireClaims(value.claims)
  if (contract.object.id !== object.id || contract.genreKey !== object.genreKey) throw new Error("growth_invalid: writing contract does not match the research object")
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]))
  const criticalGaps = requireCriticalGaps(value.criticalGaps, contract)
  const gapBeats = new Set(criticalGaps.map((gap) => gap.beat))
  const contentCards = objectArray(value.contentCards, "contentCards", 0, 30).map((item, index) => {
    if (Object.keys(item).some((key) => !["beat", "claimId"].includes(key))) throw new Error(`growth_invalid: contentCards[${index}] contains unknown fields`)
    return {
      beat: text(item.beat, `contentCards[${index}].beat`, 300),
      claimId: text(item.claimId, `contentCards[${index}].claimId`, 160),
    }
  })
  const invalidBeat = contentCards.find((card) => !contract.structure.includes(card.beat))
  if (invalidBeat) throw new Error(`growth_invalid: content card beat is not allowed for ${contract.genreKey}: ${invalidBeat.beat}`)
  const unknownClaimId = contentCards.map((card) => card.claimId).find((id) => !claimsById.has(id))
  if (unknownClaimId) throw new Error(`growth_invalid: content card references unknown claim: ${unknownClaimId}`)
  const ambiguousBeat = contentCards.find((card) => gapBeats.has(card.beat))
  if (ambiguousBeat) throw new Error(`growth_invalid: genre beat cannot have both content and a critical gap: ${ambiguousBeat.beat}`)
  const missingBeat = contract.structure.find((beat) => !contentCards.some((card) => card.beat === beat) && !gapBeats.has(beat))
  if (missingBeat) throw new Error(`growth_invalid: genre beat requires content or a critical gap: ${missingBeat}`)
  const exposedProductionLanguage = contentCards.map((card) => claimsById.get(card.claimId)!).find((claim) => containsProductionAnalysisLanguage(claim.claim))
  if (exposedProductionLanguage) throw new Error("growth_invalid: adopted claims must translate production analysis into genre-ready material")
  const adoptedClaimIds = new Set(contentCards.map((card) => card.claimId))
  const terms = requireTermsV7(value.terms, claimsById, adoptedClaimIds)
  const consistencyGuard = requireConsistencyGuardV7(value.consistencyGuard, claims, adoptedClaimIds)
  return {
    schemaVersion: 7,
    objectId: object.id,
    writingContractHash,
    contentBrief: requireContentBrief(value.contentBrief),
    claims,
    contentCards,
    terms,
    consistencyGuard,
    criticalGaps,
    excludedExternalTerms: optionalStringArray(value.excludedExternalTerms, "excludedExternalTerms", 30),
  }
}

function containsProductionAnalysisLanguage(value: string) {
  return /(?:现有(?:资料|事实|正文)|(?:证据|材料)(?:表明|显示|支持|不足)|(?:支持|不支持)在没有|(?:由此|据此)?推演(?:可知|得出|显示)?|可作(?:制度性)?推演|(?:统治|权力|制度|生产|关系|任务|内容)节点|(?:制度|权力|职责|功能|补给)接口|责任链|研究包|物化|Writer|写作者|制作流程)/iu.test(value)
}

function validateResearchPacketV6(value: unknown, object: WorldBlueprintObject, allowedSources: ReadonlySet<string>, contract: WorldWritingContract, writingContractHash: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("growth_invalid: object research packet is not an object")
  const packet = value as WorldMaterializationResearchPacketV6
  if (packet.schemaVersion !== 6 || packet.objectId !== object.id || packet.writingContractHash !== writingContractHash) throw new Error("growth_invalid: object research packet identity or writing contract is invalid")
  const normalized = requireResearchPacketV6(packet, object, contract, writingContractHash)
  for (const claim of normalized.claims) {
    const invalid = claim.sourcePaths.find((path) => !allowedSources.has(path))
    if (invalid) throw new Error(`growth_invalid: research source ${invalid} is not an allowed source`)
  }
  const writerVisible = [
    normalized.contentBrief.focus,
    ...normalized.contentBrief.requiredElements,
    ...normalized.contentBrief.concreteDetails,
    ...normalized.contentBrief.developmentSpace,
    ...normalized.contentBrief.avoidDuplication,
    ...normalized.claims.map((claim) => claim.claim),
    ...normalized.contentCards.map((card) => card.text),
    ...normalized.terms.flatMap((term) => [term.canonical, ...term.aliases, term.usedBy]),
    ...normalized.consistencyGuard.invariants.map((item) => item.text),
    ...normalized.consistencyGuard.attributedClaims.flatMap((item) => [item.text, item.attribution]),
    ...normalized.consistencyGuard.openFields,
    ...normalized.unresolvedDetails,
  ].join("\n").toLocaleLowerCase("zh-CN")
  const leaked = normalized.excludedExternalTerms.find((term) => writerVisible.includes(term.toLocaleLowerCase("zh-CN")))
  if (leaked) throw new Error(`growth_invalid: research facts leak excluded external knowledge: ${leaked}`)
  return normalized
}

export function validateNewResearchPacketV7(value: unknown, object: WorldBlueprintObject, allowedSources: ReadonlySet<string>, contract: WorldWritingContract, writingContractHash: string) {
  const packet = value as WorldMaterializationResearchPacketV7
  if (packet.schemaVersion !== 7 || packet.objectId !== object.id || packet.writingContractHash !== writingContractHash) throw new Error("growth_invalid: object research packet identity or writing contract is invalid")
  const normalized = requireResearchSubmissionV7(packet, object, contract, writingContractHash)
  return validateResearchSourcesAndLeaks(normalized, allowedSources, object, contract)
}

export function validatePersistedResearchPacket(value: unknown, object: WorldBlueprintObject, allowedSources: ReadonlySet<string>, contract: WorldWritingContract, writingContractHash: string): WorldMaterializationResearchPacket {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("growth_invalid: object research packet is not an object")
  const version = (value as { schemaVersion?: unknown }).schemaVersion
  if (version === 6) return validateResearchPacketV6(value, object, allowedSources, contract, writingContractHash)
  if (version === 7) return validateNewResearchPacketV7(value, object, allowedSources, contract, writingContractHash)
  throw new Error("growth_invalid: object research packet schemaVersion must be 6 or 7")
}

function validateResearchSourcesAndLeaks(packet: WorldMaterializationResearchPacketV7, allowedSources: ReadonlySet<string>, object: WorldBlueprintObject, contract: WorldWritingContract) {
  for (const claim of packet.claims) {
    const invalid = claim.sourcePaths.find((path) => !allowedSources.has(path))
    if (invalid) throw new Error(`growth_invalid: research source ${invalid} is not an allowed source`)
  }
  const writerVisible = [
    packet.contentBrief.focus,
    ...packet.contentBrief.requiredElements,
    ...packet.contentBrief.concreteDetails,
    ...packet.contentBrief.developmentSpace,
    ...packet.contentBrief.avoidDuplication,
    ...packet.claims.map((claim) => claim.claim),
    ...packet.terms.flatMap((term) => [term.canonical, ...term.aliases]),
    ...packet.consistencyGuard.invariants.map((item) => item.text),
    ...packet.consistencyGuard.attributedClaims.map((item) => item.text),
  ].join("\n").toLocaleLowerCase("zh-CN")
  const leaked = packet.excludedExternalTerms.find((term) => writerVisible.includes(term.toLocaleLowerCase("zh-CN")))
  if (leaked) throw new Error(`growth_invalid: research facts leak excluded external knowledge: ${leaked}`)
  const protectedIdentity = [object.title, object.locator, contract.genreKey, contract.genreLabel].join("\n").toLocaleLowerCase("zh-CN")
  const excludedIdentity = packet.excludedExternalTerms.find((term) => protectedIdentity.includes(term.toLocaleLowerCase("zh-CN")))
  if (excludedIdentity) throw new Error(`growth_invalid: excluded external term conflicts with object or genre identity: ${excludedIdentity}`)
  return packet
}

function requireConsistencyGuard(input: unknown, claims: WorldMaterializationClaim[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: consistency guard must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !["invariants", "attributedClaims", "openFields"].includes(key))) throw new Error("growth_invalid: consistency guard contains unknown fields")
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]))
  const invariants = objectArray(value.invariants, "consistencyGuard.invariants", 0, 30).map((item, index) => ({
    text: text(item.text, `consistencyGuard.invariants[${index}].text`, 2000),
    claimIds: stringArray(item.claimIds, `consistencyGuard.invariants[${index}].claimIds`, 1, 1),
  }))
  const attributedClaims = objectArray(value.attributedClaims, "consistencyGuard.attributedClaims", 0, 30).map((item, index) => ({
    text: text(item.text, `consistencyGuard.attributedClaims[${index}].text`, 2000),
    attribution: text(item.attribution, `consistencyGuard.attributedClaims[${index}].attribution`, 1000),
    claimIds: stringArray(item.claimIds, `consistencyGuard.attributedClaims[${index}].claimIds`, 1, 1),
  }))
  for (const item of invariants) {
    const unknown = item.claimIds.find((id) => !claimsById.has(id))
    if (unknown) throw new Error(`growth_invalid: invariant references unknown claim: ${unknown}`)
    if (item.claimIds.some((id) => claimsById.get(id)!.epistemicStatus !== "established")) throw new Error("growth_invalid: invariant may reference only established claims")
    if (item.text !== claimsById.get(item.claimIds[0]!)!.claim) throw new Error("growth_invalid: invariant text must exactly match its established claim")
  }
  for (const item of attributedClaims) {
    const unknown = item.claimIds.find((id) => !claimsById.has(id))
    if (unknown) throw new Error(`growth_invalid: attributed claim references unknown claim: ${unknown}`)
    if (item.claimIds.some((id) => claimsById.get(id)!.epistemicStatus !== "contested")) throw new Error("growth_invalid: attributed claim may reference only contested claims")
    if (item.text !== claimsById.get(item.claimIds[0]!)!.claim) throw new Error("growth_invalid: attributed claim text must exactly match its contested claim")
  }
  const attributedIds = new Set(attributedClaims.flatMap((item) => item.claimIds))
  const unattributed = claims.find((claim) => claim.epistemicStatus === "contested" && !attributedIds.has(claim.id))
  if (unattributed) throw new Error(`growth_invalid: contested claim requires attribution: ${unattributed.id}`)
  const openFields = optionalStringArray(value.openFields, "consistencyGuard.openFields", 20)
  if ([...invariants.map((item) => item.text), ...attributedClaims.flatMap((item) => [item.text, item.attribution]), ...openFields].some(containsProductionAnalysisLanguage)) {
    throw new Error("growth_invalid: consistency guard must translate production analysis into world-facing constraints")
  }
  return { invariants, attributedClaims, openFields }
}

function requireConsistencyGuardV7(input: unknown, claims: WorldMaterializationClaim[], adoptedClaimIds: ReadonlySet<string>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: consistency guard must be an object")
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !["invariants", "attributedClaims"].includes(key))) throw new Error("growth_invalid: consistency guard contains unknown fields")
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]))
  const invariants = objectArray(value.invariants, "consistencyGuard.invariants", 0, 30).map((item, index) => ({
    text: text(item.text, `consistencyGuard.invariants[${index}].text`, 2000),
    claimIds: stringArray(item.claimIds, `consistencyGuard.invariants[${index}].claimIds`, 1, 1),
  }))
  const attributedClaims = objectArray(value.attributedClaims, "consistencyGuard.attributedClaims", 0, 30).map((item, index) => ({
    text: text(item.text, `consistencyGuard.attributedClaims[${index}].text`, 2000),
    attributionClaimId: text(item.attributionClaimId, `consistencyGuard.attributedClaims[${index}].attributionClaimId`, 160),
    claimIds: stringArray(item.claimIds, `consistencyGuard.attributedClaims[${index}].claimIds`, 1, 1),
  }))
  for (const item of invariants) {
    const id = item.claimIds[0]!
    const claim = claimsById.get(id)
    if (!claim) throw new Error(`growth_invalid: invariant references unknown claim: ${id}`)
    if (!adoptedClaimIds.has(id)) throw new Error(`growth_invalid: invariant references an unadopted claim: ${id}`)
    if (claim.epistemicStatus !== "established") throw new Error("growth_invalid: invariant may reference only established claims")
    if (item.text !== claim.claim) throw new Error("growth_invalid: invariant text must exactly match its established claim")
  }
  for (const item of attributedClaims) {
    const id = item.claimIds[0]!
    const claim = claimsById.get(id)
    if (!claim) throw new Error(`growth_invalid: attributed claim references unknown claim: ${id}`)
    if (!adoptedClaimIds.has(id)) throw new Error(`growth_invalid: attributed claim references an unadopted claim: ${id}`)
    if (claim.epistemicStatus !== "contested") throw new Error("growth_invalid: attributed claim may reference only contested claims")
    if (item.text !== claim.claim) throw new Error("growth_invalid: attributed claim text must exactly match its contested claim")
    const attributionClaim = claimsById.get(item.attributionClaimId)
    if (!attributionClaim) throw new Error(`growth_invalid: attribution references unknown claim: ${item.attributionClaimId}`)
    if (attributionClaim.epistemicStatus !== "established") throw new Error("growth_invalid: attribution must reference an established claim")
    if (!adoptedClaimIds.has(item.attributionClaimId)) throw new Error(`growth_invalid: attribution references an unadopted claim: ${item.attributionClaimId}`)
    if (containsProductionAnalysisLanguage(attributionClaim.claim)) throw new Error("growth_invalid: attribution claim must contain world-facing material")
  }
  const invariantIds = new Set(invariants.flatMap((item) => item.claimIds))
  const attributedIds = new Set(attributedClaims.flatMap((item) => item.claimIds))
  const unguardedEstablished = [...adoptedClaimIds].map((id) => claimsById.get(id)!).find((claim) => claim.epistemicStatus === "established" && !invariantIds.has(claim.id))
  if (unguardedEstablished) throw new Error(`growth_invalid: established content card claim requires invariant: ${unguardedEstablished.id}`)
  const unattributed = [...adoptedClaimIds].map((id) => claimsById.get(id)!).find((claim) => claim.epistemicStatus === "contested" && !attributedIds.has(claim.id))
  if (unattributed) throw new Error(`growth_invalid: contested content card claim requires attribution: ${unattributed.id}`)
  if ([...invariants.map((item) => item.text), ...attributedClaims.map((item) => item.text)].some(containsProductionAnalysisLanguage)) {
    throw new Error("growth_invalid: consistency guard must translate production analysis into world-facing constraints")
  }
  return { invariants, attributedClaims }
}

function requireClaims(input: unknown) {
  const claims = objectArray(input, "claims", 1, 30).map((item, index) => ({
    id: text(item.id, `claims[${index}].id`, 160),
    claim: text(item.claim, `claims[${index}].claim`, 2000),
    epistemicStatus: epistemicStatus(item.epistemicStatus, index),
    sourcePaths: normalizedPaths(item.sourcePaths, `claims[${index}].sourcePaths`),
    relevance: text(item.relevance, `claims[${index}].relevance`, 1000),
  }))
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) throw new Error("growth_invalid: claim IDs must be unique")
  return claims
}

function requireTerms(input: unknown) {
  const terms = objectArray(input, "terms", 1, 30).map((item, index) => ({
    canonical: text(item.canonical, `terms[${index}].canonical`, 200),
    aliases: optionalStringArray(item.aliases, `terms[${index}].aliases`, 20),
    usedBy: text(item.usedBy, `terms[${index}].usedBy`, 500),
  }))
  const invalidTerm = terms.find((term) => [term.canonical, ...term.aliases, term.usedBy].some(containsProductionAnalysisLanguage))
  if (invalidTerm) throw new Error(`growth_invalid: formal term ${invalidTerm.canonical} contains production analysis language`)
  return terms
}

function requireTermsV7(input: unknown, claimsById: ReadonlyMap<string, WorldMaterializationClaim>, adoptedClaimIds: ReadonlySet<string>) {
  const terms = objectArray(input, "terms", 1, 30).map((item, index) => {
    if (Object.keys(item).some((key) => !["canonical", "aliases", "claimId"].includes(key))) throw new Error(`growth_invalid: terms[${index}] contains unknown fields`)
    const term = {
      canonical: text(item.canonical, `terms[${index}].canonical`, 200),
      aliases: optionalStringArray(item.aliases, `terms[${index}].aliases`, 20),
      claimId: text(item.claimId, `terms[${index}].claimId`, 160),
    }
    const claim = claimsById.get(term.claimId)
    if (!claim) throw new Error(`growth_invalid: formal term references unknown claim: ${term.claimId}`)
    if (!adoptedClaimIds.has(term.claimId)) throw new Error(`growth_invalid: formal term references an unadopted claim: ${term.claimId}`)
    const unsupported = [term.canonical, ...term.aliases].find((value) => !claim.claim.includes(value))
    if (unsupported) throw new Error(`growth_invalid: formal term is absent from its adopted claim: ${unsupported}`)
    return term
  })
  const invalidTerm = terms.find((term) => [term.canonical, ...term.aliases].some(containsProductionAnalysisLanguage))
  if (invalidTerm) throw new Error(`growth_invalid: formal term ${invalidTerm.canonical} contains production analysis language`)
  return terms
}

function requireCriticalGaps(input: unknown, contract: WorldWritingContract) {
  const gaps = objectArray(input, "criticalGaps", 0, 20).map((item, index) => {
    if (Object.keys(item).some((key) => !["beat", "reason"].includes(key))) throw new Error(`growth_invalid: criticalGaps[${index}] contains unknown fields`)
    return {
      beat: text(item.beat, `criticalGaps[${index}].beat`, 300),
      reason: text(item.reason, `criticalGaps[${index}].reason`, 1000),
    }
  })
  const invalid = gaps.find((gap) => !contract.structure.includes(gap.beat))
  if (invalid) throw new Error(`growth_invalid: critical gap beat is not allowed for ${contract.genreKey}: ${invalid.beat}`)
  if (new Set(gaps.map((gap) => gap.beat)).size !== gaps.length) throw new Error("growth_invalid: critical gap beats must be unique")
  return gaps
}

export function assertFormalBody(body: string, packet: WorldMaterializationResearchPacket, contract: WorldWritingContract) {
  const scaffolding = [/卷首[^\n]{0,20}(?:问|问题)/u, /先问[一二三四五六七八九十0-9]/u, /(?:以下|下列)[^\n]{0,12}(?:问题|问句)/u, /必须先[^。\n]{0,40}(?:问题|问清|发问)/u, /先自行提出/u]
  if (scaffolding.some((pattern) => pattern.test(body))) throw new Error("growth_invalid: formal body exposes private research questions")
  const auditScaffolding = [/^##\s*(?:事件定位|战争如何运行|叙述边界|运行边界|证据边界)\s*$/mu, /现有事实支持/u, /不支持在没有新增依据时/u]
  if (auditScaffolding.some((pattern) => pattern.test(body))) throw new Error(`growth_invalid: formal body does not follow ${contract.genreKey} and exposes editorial audit language`)
  const lowered = body.toLocaleLowerCase("zh-CN")
  const leaked = ["现实世界", "现实历史", "现实意义上的", "本应存在", "原本应该存在", "另一条世界线", "在这个世界里", "本世界", ...packet.excludedExternalTerms]
    .find((term) => term.trim() && lowered.includes(term.trim().toLocaleLowerCase("zh-CN")))
  if (leaked) throw new Error(`growth_invalid: formal body leaks external creative knowledge: ${leaked}`)
  const paragraphs = body.split(/\n\s*\n/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length >= 80)
  if (new Set(paragraphs).size !== paragraphs.length) throw new Error("growth_invalid: formal body repeats a substantial paragraph")
}

function requireContentBrief(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("growth_invalid: contentBrief must be an object")
  const value = input as Record<string, unknown>
  return {
    focus: text(value.focus, "contentBrief.focus", 1000),
    requiredElements: stringArray(value.requiredElements, "contentBrief.requiredElements", 1, 30),
    concreteDetails: stringArray(value.concreteDetails, "contentBrief.concreteDetails", 1, 40),
    developmentSpace: stringArray(value.developmentSpace, "contentBrief.developmentSpace", 1, 30),
    avoidDuplication: optionalStringArray(value.avoidDuplication, "contentBrief.avoidDuplication", 30),
  }
}

function epistemicStatus(input: unknown, index: number): WorldMaterializationClaim["epistemicStatus"] {
  if (input !== "established" && input !== "contested" && input !== "inferred") throw new Error(`growth_invalid: claims[${index}].epistemicStatus is invalid`)
  return input
}

function normalizedPaths(input: unknown, name: string) {
  const paths = stringArray(input, name, 1, 20).map(normalizePath)
  if (new Set(paths).size !== paths.length) throw new Error(`growth_invalid: ${name} must be unique`)
  return paths
}

function normalizePath(path: string) {
  const normalized = path.trim().replaceAll("\\", "/").replace(/^\.\//u, "")
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("growth_invalid: research paths must be project-relative")
  return normalized
}

function objectArray(input: unknown, name: string, minimum: number, maximum: number) {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum || input.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new Error(`growth_invalid: ${name} must contain ${minimum} to ${maximum} objects`)
  return input as Record<string, unknown>[]
}

function stringArray(input: unknown, name: string, minimum: number, maximum: number) {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum || input.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`growth_invalid: ${name} must contain ${minimum} to ${maximum} strings`)
  return input.map((item) => (item as string).trim())
}

function optionalStringArray(input: unknown, name: string, maximum: number) {
  if (input === undefined) return []
  return stringArray(input, name, 0, maximum)
}

function text(input: unknown, name: string, maximum: number) {
  if (typeof input !== "string" || !input.trim() || input.length > maximum) throw new Error(`growth_invalid: ${name} must contain 1 to ${maximum} characters`)
  return input.trim()
}
