import { createHash } from "node:crypto"
import type { CreatXError, CreatXToolContribution, CreatXToolExecutionContext } from "@creatx/contracts"
import type { ProjectFileCommandPort, ProjectFileQueryPort, ProjectInternalStatePort } from "@creatx/project-files"
import type { WorkbenchCommandPort, WorkbenchQueryPort } from "@creatx/workbench"
import {
  parseJson,
  validateWorldBlueprintDocuments,
  WORLD_BLUEPRINT_LAYERS,
  type WorldBlueprintCausalRelation,
  type WorldBlueprintIndexDocument,
  type WorldBlueprintLayer,
  type WorldBlueprintLayerDocument,
  type WorldBlueprintObject,
  type WorldBlueprintRelationsDocument,
  type WorldBlueprintCreativeDirection,
  type WorldBlueprintSourceRecord,
  type WorldBlueprintStateDocument,
  type WorldBlueprintArtifactEvidence,
} from "./schema.ts"
import { publicationGenreKeys } from "./publication-genres.ts"
import { TOPIC_GENRE_PROFILE_KEYS, topicGenreCandidates, topicGenreProfile } from "./topic-genre-profiles.ts"
import { requireWorldStyleProfile, type WorldStyleProfile } from "./writing-contract.ts"
import { blueprintInternalKey, GROWTH_INTERNAL_NAMESPACE, worldOwnerKey } from "./internal-state.ts"
import { blueprintReconciliationKey } from "./internal-state.ts"
import { reconciliationCoverageSummary, type WorldReconciliationCoverage, type WorldReconciliationManifest, type WorldReconciliationMapping } from "./reconciliation.ts"

export * from "./schema.ts"
export * from "./materialization.ts"
export * from "./materialization-terminal.ts"
export * from "./materialization-issue-reconciliation.ts"
export * from "./materialization-research.ts"
export * from "./publication-genres.ts"
export * from "./topic-genre-profiles.ts"
export * from "./writing-contract.ts"
export * from "./internal-state.ts"
export * from "./migration.ts"
export * from "./world-entry-recovery.ts"
export * from "./reconciliation.ts"
export * from "./performance-first.ts"

type InitializeInput = {
  action: "initialize"
  root: string
  worldName: string
  route: WorldBlueprintStateDocument["route"]
  topicProfileKey: string
  worldStyleProfile: WorldStyleProfile
  sources: WorldBlueprintSourceRecord[]
  direction: WorldBlueprintCreativeDirection
}

type AppendInput = {
  action: "append"
  root: string
  layer: WorldBlueprintLayer
  batchId: string
  objects: Array<{ key: string; title: string; kind: "group" | "entry"; parentKey?: string; genreKey?: string; rationale: string }>
  causes: Array<{ fromKey: string; toKey: string; reason: string }>
}

type WorldVisualStyleInput = {
  artMovementAndMedium: string
  colorAndLighting: string
  eraMaterialsAndCraft: string
  architectureCostumeAndWeapons: string
  motifsSymbolsAndMarks: string
  lineDetailAndComposition: string
  forbiddenElements: string[]
}

type PrepareReviewInput = { action: "prepare_review"; root: string; visualStyle: WorldVisualStyleInput }
type FreezeInput = { action: "freeze"; root: string }
type InspectInput = { action: "inspect"; root: string }
type MapSourcesInput = { action: "map_sources"; root: string; batchId: string; mappings: Array<{ objectKey: string; coverage: WorldReconciliationCoverage; sourcePaths: string[]; note: string }> }
type AmendInput = Omit<AppendInput, "action"> & { action: "amend"; worldName?: string; sources?: WorldBlueprintSourceRecord[]; direction?: WorldBlueprintCreativeDirection; topicProfileKey?: string; worldStyleProfile?: WorldStyleProfile }
type ToolInput = InitializeInput | AppendInput | AmendInput | PrepareReviewInput | FreezeInput | InspectInput | MapSourcesInput
type WorldBlueprintAction = ToolInput["action"]

const blueprintWriteActionsByStage = {
  "route-and-sources": new Set<WorldBlueprintAction>(["initialize"]),
  "twelve-layer-skeleton": new Set<WorldBlueprintAction>(),
  "world-blueprint-create": new Set<WorldBlueprintAction>(["append", "map_sources", "prepare_review"]),
  "world-blueprint-confirm": new Set<WorldBlueprintAction>(["amend", "prepare_review", "freeze"]),
} as const

const decoder = new TextDecoder()
const invalidWindowsNames = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu

export class WorldBlueprintService {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly projectFiles: ProjectFileQueryPort
  private readonly projectCommands: ProjectFileCommandPort
  private readonly internalState: ProjectInternalStatePort
  private readonly workbenchCommands: WorkbenchCommandPort
  private readonly workbenchQueries: WorkbenchQueryPort

  constructor(
    projectFiles: ProjectFileQueryPort,
    projectCommands: ProjectFileCommandPort,
    internalState: ProjectInternalStatePort,
    workbenchCommands: WorkbenchCommandPort,
    workbenchQueries: WorkbenchQueryPort,
  ) {
    this.projectFiles = projectFiles
    this.projectCommands = projectCommands
    this.internalState = internalState
    this.workbenchCommands = workbenchCommands
    this.workbenchQueries = workbenchQueries
  }

  tool(): CreatXToolContribution {
    return {
      name: "write_world_blueprint",
      audiences: ["world-blueprint"],
      description: "Create, reconcile, review, and freeze a Growth World Pro V3 twelve-layer blueprint. prepare_review requires a project-level visualStyle and creates <root>/视觉设定/统一画风.md before review. In reconcile mode, map every entry to existing, partial, conflicting, or missing project material first. Source mapping never moves or rewrites source files. Every entry requires a topic-bound genreKey; groups reject genreKey. V1/V2 blueprints are retained as read-only evidence and are not migrated.",
      inputSchema: worldBlueprintInputSchema,
      scope: "project",
      approval: "required",
      timeoutMs: 120_000,
      execute: async (input, context) => {
        if (!context.projectId) return { ok: false, error: blueprintError("project_invalid: project identity is required") }
        if (!context.growthGoalId || context.growthGoalVersion === undefined) return { ok: false, error: blueprintError("blueprint_invalid: trusted Growth Goal identity is required") }
        try {
          const parsed = requireToolInput(input)
          requireBlueprintStageAction(context.growthStageKey, parsed.action)
          const value = await this.serialize(`${context.projectId}\0${parsed.root}`, async () => {
            this.throwIfAborted(context)
            if (parsed.action === "inspect") return this.inspect(context.projectId!, parsed, context)
            if (parsed.action === "initialize") return this.initialize(context.projectId!, parsed, context)
            if (parsed.action === "append") return this.append(context.projectId!, parsed, context)
            if (parsed.action === "map_sources") return this.mapSources(context.projectId!, parsed, context)
            if (parsed.action === "amend") return this.amend(context.projectId!, parsed, context)
            if (parsed.action === "prepare_review") return this.prepareReview(context.projectId!, parsed, context)
            return this.freeze(context.projectId!, parsed, context)
          })
          return { ok: true, value }
        } catch (error) {
          return { ok: false, error: blueprintError(error) }
        }
      },
    }
  }

  async progressEvidence(projectId: string, goalId: string, root: string): Promise<readonly WorldBlueprintArtifactEvidence[]> {
    const state = await this.requireState(projectId, root, goalId)
    if (state.ownerGoalId !== goalId) throw new Error("blueprint_conflict: blueprint belongs to another Growth Goal")
    const paths = [statePath(root), indexPath(root), relationsPath(root), ...WORLD_BLUEPRINT_LAYERS.map((layer) => layerPath(root, layer))]
    return Promise.all(paths.map(async (relativePath) => {
      const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, blueprintInternalKey(goalId, relativePath))
      return { relativePath, ...(record ? { text: decoder.decode(record.bytes) } : {}) }
    }))
  }

  private async inspect(projectId: string, input: InspectInput, context: CreatXToolExecutionContext) {
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const relations = await this.requireJson<WorldBlueprintRelationsDocument>(projectId, context.growthGoalId!, relationsPath(input.root))
    if (context.growthStageKey === "twelve-layer-skeleton" && layers.some((layer) => layer.objects.length > 0)) {
      throw new Error("blueprint_conflict: twelve-layer skeleton inspection requires all layer object counts to remain zero")
    }
    return {
      action: "inspect",
      root: state.root,
      worldName: state.worldName,
      route: state.route,
      status: state.status,
      revision: state.revision,
      topicProfileKey: state.topicProfileKey,
      layerObjectCounts: Object.fromEntries(layers.map((layer) => [layer.layer, layer.objects.length])),
      causalRelationCount: relations.relations.length,
      genreCandidates: allGenreCandidates(state.topicProfileKey),
      ...(context.growthWorldEntryMode === "reconcile" ? { reconciliation: await this.reconciliationStatus(projectId, context.growthGoalId!, state.root, layers) } : {}),
    }
  }

  private async initialize(projectId: string, input: InitializeInput, context: CreatXToolExecutionContext) {
    const legacyState = await this.readLegacyJsonIfExists<WorldBlueprintStateDocument>(projectId, statePath(input.root))
    if (legacyState) {
      if (legacyState.schemaVersion !== 3) throw new Error("blueprint_conflict: V1/V2 blueprint is retained as evidence and cannot be resumed as V3")
      throw new Error("blueprint_conflict: legacy V3 blueprint requires explicit Growth resume migration")
    }
    await this.requireOrClaimWorldOwner(projectId, input.root, context.growthGoalId!)
    const existingState = await this.readJsonIfExists<WorldBlueprintStateDocument>(projectId, context.growthGoalId!, statePath(input.root))
    const topic = topicGenreProfile(input.topicProfileKey)
    const state: WorldBlueprintStateDocument = {
      schemaVersion: 3,
      root: input.root,
      worldName: input.worldName,
      route: input.route,
      topicProfileKey: topic.key,
      topicProfileVersion: topic.version,
      worldStyleProfile: input.worldStyleProfile,
      sources: input.sources,
      direction: input.direction,
      ownerGoalId: context.growthGoalId!,
      acceptedGoalVersion: context.growthGoalVersion!,
      revision: 1,
      status: "draft",
      batches: [],
    }
    if (existingState) {
      if (existingState.schemaVersion !== 3) throw new Error("blueprint_conflict: V1/V2 blueprint is retained as evidence and cannot be resumed as V3")
      this.requireOwner(existingState, context)
      const existingMetadata = { root: existingState.root, worldName: existingState.worldName, route: existingState.route, topicProfileKey: existingState.topicProfileKey, topicProfileVersion: existingState.topicProfileVersion, worldStyleProfile: existingState.worldStyleProfile, sources: existingState.sources, direction: existingState.direction, ownerGoalId: existingState.ownerGoalId }
      const requestedMetadata = { root: state.root, worldName: state.worldName, route: state.route, topicProfileKey: state.topicProfileKey, topicProfileVersion: state.topicProfileVersion, worldStyleProfile: state.worldStyleProfile, sources: state.sources, direction: state.direction, ownerGoalId: state.ownerGoalId }
      if (canonicalJson(existingMetadata) !== canonicalJson(requestedMetadata)) throw new Error("blueprint_conflict: blueprint metadata differs from the existing initialization")
      if (context.growthWorldEntryMode === "reconcile") {
        await this.ensureReconciliationManifest(projectId, context.growthGoalId!, input.root)
      }
      await this.ensureWorldWorkbench(projectId, input.root, existingState.worldName)
      return { action: "initialize", root: input.root, status: existingState.status, workbenchCount: 1, topicProfileKey: existingState.topicProfileKey, genreCandidates: allGenreCandidates(existingState.topicProfileKey), replayed: true }
    }

    await this.ensureExactFile(projectId, `${input.root}/世界基准.md`, worldBaseline(input))
    this.throwIfAborted(context)
    await this.ensureExactFile(projectId, `${input.root}/资料索引.md`, sourceIndex(input))
    this.throwIfAborted(context)
    await this.ensureInternalExactFile(projectId, context.growthGoalId!, relationsPath(input.root), jsonText({ schemaVersion: 3, relations: [] } satisfies WorldBlueprintRelationsDocument))
    this.throwIfAborted(context)
    for (const layer of WORLD_BLUEPRINT_LAYERS) {
      await this.ensureInternalExactFile(projectId, context.growthGoalId!, layerPath(input.root, layer), jsonText({ schemaVersion: 3, layer, objects: [] } satisfies WorldBlueprintLayerDocument))
      this.throwIfAborted(context)
    }
    await this.ensureInternalExactFile(projectId, context.growthGoalId!, indexPath(input.root), jsonText(buildIndex(input.root, emptyLayers(), [], "draft")))
    this.throwIfAborted(context)
    await this.ensureWorldWorkbench(projectId, input.root, input.worldName)
    this.throwIfAborted(context)
    await this.ensureInternalExactFile(projectId, context.growthGoalId!, statePath(input.root), jsonText(state))
    if (context.growthWorldEntryMode === "reconcile") {
      await this.ensureReconciliationManifest(projectId, context.growthGoalId!, input.root)
    }
    return { action: "initialize", root: input.root, status: "draft", workbenchCount: 1, topicProfileKey: state.topicProfileKey, genreCandidates: allGenreCandidates(state.topicProfileKey), replayed: false }
  }

  private async mapSources(projectId: string, input: MapSourcesInput, context: CreatXToolExecutionContext) {
    if (context.growthWorldEntryMode !== "reconcile") throw new Error("blueprint_invalid: map_sources is only available to a trusted reconcile Growth entry")
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    if (state.status !== "draft") throw new Error(`blueprint_conflict: ${state.status} blueprint cannot accept source mappings`)
    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const entries = layers.flatMap((layer) => layer.objects).filter((object) => object.kind === "entry")
    const byKey = new Map(entries.map((object) => [object.key, object]))
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, blueprintReconciliationKey(context.growthGoalId!))
    if (!record) throw new Error("blueprint_invalid: reconcile manifest is missing")
    const manifest = parseJson<WorldReconciliationManifest>(decoder.decode(record.bytes))
    if (!manifest || manifest.schemaVersion !== 1 || manifest.goalId !== context.growthGoalId || manifest.root !== input.root) throw new Error("blueprint_invalid: reconcile manifest is invalid")
    const payloadHash = hash(canonicalJson(input))
    const replay = manifest.batches.find((batch) => batch.batchId === input.batchId)
    if (replay) {
      if (replay.payloadHash !== payloadHash) throw new Error("blueprint_conflict: reconciliation batchId was already used with different content")
      return { action: "map_sources", root: input.root, batchId: input.batchId, mappedCount: manifest.mappings.length, coverage: reconciliationCoverageSummary(manifest), replayed: true }
    }
    const incomingKeys = new Set<string>()
    const mappings: WorldReconciliationMapping[] = []
    for (const mapping of input.mappings) {
      if (incomingKeys.has(mapping.objectKey)) throw new Error(`blueprint_invalid: duplicate reconciliation object key: ${mapping.objectKey}`)
      incomingKeys.add(mapping.objectKey)
      const object = byKey.get(mapping.objectKey)
      if (!object) throw new Error(`blueprint_invalid: reconciliation references an unknown entry object: ${mapping.objectKey}`)
      if (mapping.coverage === "missing" && mapping.sourcePaths.length) throw new Error(`blueprint_invalid: missing object ${mapping.objectKey} cannot cite source paths`)
      if (mapping.coverage !== "missing" && !mapping.sourcePaths.length) throw new Error(`blueprint_invalid: ${mapping.coverage} object ${mapping.objectKey} requires at least one source path`)
      const sourcePaths = [...new Set(mapping.sourcePaths.map((path) => requireSourcePath(path)))]
      for (const sourcePath of sourcePaths) {
        if (!await this.fileEntry(projectId, sourcePath)) throw new Error(`blueprint_invalid: reconciliation source file does not exist: ${sourcePath}`)
      }
      mappings.push({ objectId: object.id, objectKey: object.key, coverage: mapping.coverage, sourcePaths, note: mapping.note })
    }
    const existing = new Map(manifest.mappings.map((mapping) => [mapping.objectKey, mapping]))
    for (const mapping of mappings) {
      const previous = existing.get(mapping.objectKey)
      if (previous && canonicalJson(previous) !== canonicalJson(mapping)) throw new Error(`blueprint_conflict: reconciliation mapping already differs for ${mapping.objectKey}`)
      existing.set(mapping.objectKey, mapping)
    }
    const next: WorldReconciliationManifest = { ...manifest, mappings: [...existing.values()], batches: [...manifest.batches, { batchId: input.batchId, payloadHash }] }
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key: blueprintReconciliationKey(context.growthGoalId!), content: jsonText(next), expectedModifiedAt: record.modifiedAt })
    return { action: "map_sources", root: input.root, batchId: input.batchId, mappedCount: next.mappings.length, coverage: reconciliationCoverageSummary(next), replayed: false }
  }

  private async append(projectId: string, input: AppendInput, context: CreatXToolExecutionContext) {
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    if (state.status !== "draft") throw new Error(`blueprint_conflict: ${state.status} blueprint cannot accept append batches`)
    const allowedGenres = topicGenreCandidates(state.topicProfileKey, input.layer)
    const invalidGenre = input.objects.find((object) => object.kind === "entry" && (!object.genreKey || !allowedGenres.includes(object.genreKey)))
    if (invalidGenre) throw new Error(`blueprint_invalid: genreKey ${invalidGenre.genreKey ?? "<missing>"} is not allowed by topic ${state.topicProfileKey} for ${input.layer}`)
    const payloadHash = hash(canonicalJson(input))
    if (state.pendingBatch) {
      if (state.pendingBatch.batchId !== input.batchId || state.pendingBatch.payloadHash !== payloadHash || canonicalJson(state.pendingBatch.payload) !== canonicalJson({ objects: input.objects, causes: input.causes })) {
        throw new Error("blueprint_conflict: an interrupted batch exists with different content")
      }
    }
    const existingBatch = state.batches.find((batch) => batch.batchId === input.batchId)
    if (existingBatch) {
      if (existingBatch.payloadHash !== payloadHash || existingBatch.layer !== input.layer) throw new Error("blueprint_conflict: batchId was already used with different content")
      return { action: "append", root: input.root, layer: input.layer, batchId: input.batchId, genreCandidates: topicGenreCandidates(state.topicProfileKey, input.layer), replayed: true }
    }

    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const relations = await this.requireJson<WorldBlueprintRelationsDocument>(projectId, context.growthGoalId!, relationsPath(input.root))
    const allObjects = layers.flatMap((document) => document.objects)
    const byKey = new Map(allObjects.map((object) => [object.key, object]))
    const incomingKeys = new Set<string>()
    for (const object of input.objects) {
      if (incomingKeys.has(object.key)) throw new Error(`blueprint_invalid: duplicate key in batch: ${object.key}`)
      incomingKeys.add(object.key)
      const existing = byKey.get(object.key)
      if (existing && existing.id !== objectId(input.root, object.key)) throw new Error(`blueprint_conflict: key already exists: ${object.key}`)
    }

    const targetLayer = layers[WORLD_BLUEPRINT_LAYERS.indexOf(input.layer)]!
    let missingObjectCount = 0
    const materialized = input.objects.map((object): WorldBlueprintObject => {
      const parent = object.parentKey ? byKey.get(object.parentKey) ?? input.objects.find((candidate) => candidate.key === object.parentKey) : undefined
      const parentId = parent && "id" in parent ? parent.id : parent ? objectId(input.root, parent.key) : null
      if (object.parentKey && (!parent || ("layer" in parent && parent.layer !== input.layer))) {
        throw new Error(`blueprint_invalid: object ${object.key} must reference a parent in the same layer`)
      }
      if (object.kind === "entry" && !parent) throw new Error(`blueprint_invalid: entry ${object.key} must reference a parent in the same layer`)
      const plannedPath = object.kind === "entry" ? `${input.root}/${input.layer}/${safeMarkdownName(object.title)}.md` : undefined
      const existing = byKey.get(object.key)
      const order = existing?.order ?? targetLayer.objects.length + ++missingObjectCount
      const result: WorldBlueprintObject = {
        id: objectId(input.root, object.key),
        key: object.key,
        title: object.title,
        layer: input.layer,
        kind: object.kind,
        parentId,
        ...(plannedPath ? { plannedPath } : {}),
        ...(object.genreKey ? { genreKey: object.genreKey } : {}),
        locator: `${input.layer}｜${object.rationale}`,
        order,
        status: "planned",
      }
      return result
    })
    const existingIncoming = materialized.filter((object) => byKey.has(object.key))
    if (existingIncoming.length && existingIncoming.some((object) => canonicalJson(byKey.get(object.key)) !== canonicalJson(object))) {
      throw new Error("blueprint_conflict: materialized batch differs from the submitted semantic content")
    }
    const missingIncoming = materialized.filter((object) => !byKey.has(object.key))
    const nextLayer = missingIncoming.length ? { ...targetLayer, objects: [...targetLayer.objects, ...missingIncoming] } : targetLayer
    const nextLayers = layers.map((document) => document.layer === input.layer ? nextLayer : document)
    const nextObjects = nextLayers.flatMap((document) => document.objects)
    const nextByKey = new Map(nextObjects.map((object) => [object.key, object]))
    const currentEdges = new Map(relations.relations.map((relation) => [`${relation.from}\0${relation.to}`, relation]))
    const incomingEdgeKeys = new Set<string>()
    const incomingRelations = input.causes.map((cause): WorldBlueprintCausalRelation => {
      const from = nextByKey.get(cause.fromKey)
      const to = nextByKey.get(cause.toKey)
      if (!from || !to) throw new Error(`blueprint_invalid: causal edge references unknown key: ${cause.fromKey} -> ${cause.toKey}`)
      if (from.id === to.id) throw new Error("blueprint_invalid: causal edge cannot reference itself")
      const edgeKey = `${from.id}\0${to.id}`
      if (incomingEdgeKeys.has(edgeKey)) throw new Error(`blueprint_invalid: duplicate causal edge in batch: ${cause.fromKey} -> ${cause.toKey}`)
      incomingEdgeKeys.add(edgeKey)
      return { from: from.id, to: to.id, type: "causes", reason: cause.reason }
    })
    for (const relation of incomingRelations) {
      const existing = currentEdges.get(`${relation.from}\0${relation.to}`)
      if (existing && canonicalJson(existing) !== canonicalJson(relation)) throw new Error(`blueprint_conflict: causal edge already exists with different content: ${relation.from} -> ${relation.to}`)
      currentEdges.set(`${relation.from}\0${relation.to}`, relation)
    }
    const nextRelations = { schemaVersion: 3, relations: [...currentEdges.values()] } satisfies WorldBlueprintRelationsDocument
    const nextIndex = buildIndex(input.root, nextLayers, nextRelations.relations, "draft")
    const validation = validateWorldBlueprintDocuments(input.root, nextLayers, nextRelations, nextIndex, false)
    if (validation) throw new Error(`blueprint_invalid: ${validation}`)

    if (!state.pendingBatch) await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({ ...state, acceptedGoalVersion: context.growthGoalVersion!, pendingBatch: { batchId: input.batchId, payloadHash, layer: input.layer, payload: { objects: input.objects, causes: input.causes } } }))
    this.throwIfAborted(context)
    if (missingIncoming.length) await this.updateInternalFile(projectId, context.growthGoalId!, layerPath(input.root, input.layer), jsonText(nextLayer))
    this.throwIfAborted(context)
    if (canonicalJson(relations) !== canonicalJson(nextRelations)) await this.updateInternalFile(projectId, context.growthGoalId!, relationsPath(input.root), jsonText(nextRelations))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, indexPath(input.root), jsonText(nextIndex))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({ ...state, acceptedGoalVersion: context.growthGoalVersion!, pendingBatch: undefined, batches: [...state.batches, { batchId: input.batchId, payloadHash, layer: input.layer }] }))
    return { action: "append", root: input.root, layer: input.layer, batchId: input.batchId, objectCount: nextLayer.objects.length, causalRelationCount: nextRelations.relations.length, genreCandidates: topicGenreCandidates(state.topicProfileKey, input.layer), replayed: missingIncoming.length === 0 }
  }

  private async prepareReview(projectId: string, input: PrepareReviewInput, context: CreatXToolExecutionContext) {
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    if (state.pendingBatch) throw new Error("blueprint_conflict: interrupted batch must be recovered before review")
    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const relations = await this.requireJson<WorldBlueprintRelationsDocument>(projectId, context.growthGoalId!, relationsPath(input.root))
    const index = buildIndex(input.root, layers, relations.relations, "review")
    const validation = validateWorldBlueprintDocuments(input.root, layers, relations, index, true)
    if (validation) throw new Error(`blueprint_invalid: ${validation}`)
    if (context.growthWorldEntryMode === "reconcile") {
      const reconciliation = await this.reconciliationStatus(projectId, context.growthGoalId!, input.root, layers)
      if (reconciliation.unmappedCount) throw new Error(`blueprint_invalid: reconcile blueprint still has ${reconciliation.unmappedCount} unmapped entry objects`)
    }
    if (state.status !== "draft" && state.status !== "review") throw new Error(`blueprint_conflict: ${state.status} blueprint cannot enter review`)
    await this.ensureWorldWorkbench(projectId, input.root, state.worldName)
    const visualStylePath = await this.ensureVisualStyleFile(projectId, input.root, input.visualStyle)
    if (state.status === "review") return { action: "prepare_review", root: input.root, status: "review", revision: state.revision, visualStylePath, replayed: true }
    await this.updateInternalFile(projectId, context.growthGoalId!, indexPath(input.root), jsonText(index))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({ ...state, acceptedGoalVersion: context.growthGoalVersion!, status: "review" }))
    return { action: "prepare_review", root: input.root, status: "review", revision: state.revision, visualStylePath, objectCount: layers.flatMap((layer) => layer.objects).length, causalRelationCount: relations.relations.length, replayed: false }
  }

  private async amend(projectId: string, input: AmendInput, context: CreatXToolExecutionContext) {
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    if (state.status !== "review") throw new Error("blueprint_conflict: only a reviewed blueprint can be amended")
    const amendedSources = input.sources ? requireSources(input.sources, state.route) : state.sources
    const amendedTopic = topicGenreProfile(input.topicProfileKey ?? state.topicProfileKey)
    const amendedWorldStyle = input.worldStyleProfile ?? state.worldStyleProfile
    const payloadHash = hash(canonicalJson(input))
    if (state.pendingBatch && (state.pendingBatch.batchId !== input.batchId || state.pendingBatch.payloadHash !== payloadHash)) throw new Error("blueprint_conflict: an interrupted amendment exists with different content")
    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const otherObjects = layers.flatMap((document) => document.layer === input.layer ? [] : document.objects)
    const incomingByKey = new Map(input.objects.map((object) => [object.key, object]))
    if (incomingByKey.size !== input.objects.length) throw new Error("blueprint_invalid: amendment object keys must be unique")
    const replacement: WorldBlueprintLayerDocument = {
      schemaVersion: 3,
      layer: input.layer,
      objects: input.objects.map((object, index) => {
        const parent = object.parentKey ? incomingByKey.get(object.parentKey) : undefined
        if (object.parentKey && !parent) throw new Error(`blueprint_invalid: amended object ${object.key} has an unknown same-layer parent`)
        if (object.kind === "entry" && !parent) throw new Error(`blueprint_invalid: amended entry ${object.key} requires a parent`)
        return {
          id: objectId(input.root, object.key), key: object.key, title: object.title, layer: input.layer, kind: object.kind,
          parentId: parent ? objectId(input.root, parent.key) : null,
          ...(object.kind === "entry" ? { plannedPath: `${input.root}/${input.layer}/${safeMarkdownName(object.title)}.md` } : {}),
          ...(object.genreKey ? { genreKey: object.genreKey } : {}),
          locator: `${input.layer}｜${object.rationale}`, order: index + 1, status: "planned",
        }
      }),
    }
    const nextLayers = layers.map((document) => document.layer === input.layer ? replacement : document)
    const invalidGenre = nextLayers.flatMap((document) => document.objects)
      .find((object) => object.kind === "entry" && (!object.genreKey || !topicGenreCandidates(amendedTopic.key, object.layer).includes(object.genreKey)))
    if (invalidGenre) throw new Error(`blueprint_invalid: genreKey ${invalidGenre.genreKey ?? "<missing>"} is not allowed by topic ${amendedTopic.key} for ${invalidGenre.layer}`)
    const allByKey = new Map([...otherObjects, ...replacement.objects].map((object) => [object.key, object]))
    const nextRelations: WorldBlueprintRelationsDocument = {
      schemaVersion: 3,
      relations: input.causes.map((cause) => {
        const from = allByKey.get(cause.fromKey)
        const to = allByKey.get(cause.toKey)
        if (!from || !to) throw new Error(`blueprint_invalid: amended causal edge references unknown key: ${cause.fromKey} -> ${cause.toKey}`)
        return { from: from.id, to: to.id, type: "causes", reason: cause.reason }
      }),
    }
    const nextIndex = buildIndex(input.root, nextLayers, nextRelations.relations, "draft")
    const validation = validateWorldBlueprintDocuments(input.root, nextLayers, nextRelations, nextIndex, false)
    if (validation) throw new Error(`blueprint_invalid: ${validation}`)
    if (!state.pendingBatch) await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({ ...state, acceptedGoalVersion: context.growthGoalVersion!, pendingBatch: { batchId: input.batchId, payloadHash, layer: input.layer, payload: { objects: input.objects, causes: input.causes } } }))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, layerPath(input.root, input.layer), jsonText(replacement))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, relationsPath(input.root), jsonText(nextRelations))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, indexPath(input.root), jsonText(nextIndex))
    this.throwIfAborted(context)
    const amendedMetadata: InitializeInput = { action: "initialize", root: input.root, worldName: input.worldName ?? state.worldName, route: state.route, topicProfileKey: amendedTopic.key, worldStyleProfile: amendedWorldStyle, sources: amendedSources, direction: input.direction ?? state.direction }
    await this.updateFile(projectId, `${input.root}/世界基准.md`, worldBaseline(amendedMetadata))
    this.throwIfAborted(context)
    await this.updateFile(projectId, `${input.root}/资料索引.md`, sourceIndex(amendedMetadata))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({
      ...state,
      worldName: amendedMetadata.worldName,
      sources: amendedSources,
      direction: amendedMetadata.direction,
      topicProfileKey: amendedTopic.key,
      topicProfileVersion: amendedTopic.version,
      worldStyleProfile: amendedWorldStyle,
      acceptedGoalVersion: context.growthGoalVersion!,
      revision: state.revision + 1,
      status: "draft",
      pendingBatch: undefined,
      batches: [...state.batches, { batchId: input.batchId, payloadHash, layer: input.layer }],
    }))
    return { action: "amend", root: input.root, layer: input.layer, status: "draft", revision: state.revision + 1 }
  }

  private async freeze(projectId: string, input: FreezeInput, context: CreatXToolExecutionContext) {
    const state = await this.requireState(projectId, input.root, context.growthGoalId!)
    this.requireOwner(state, context)
    if (state.status === "frozen") return { action: "freeze", root: input.root, status: "frozen", replayed: true }
    if (state.status !== "review") throw new Error("blueprint_conflict: blueprint must enter review before freeze")
    const layers = await this.readLayers(projectId, input.root, context.growthGoalId!)
    const relations = await this.requireJson<WorldBlueprintRelationsDocument>(projectId, context.growthGoalId!, relationsPath(input.root))
    const index = buildIndex(input.root, layers, relations.relations, "frozen")
    const validation = validateWorldBlueprintDocuments(input.root, layers, relations, index, true)
    if (validation) throw new Error(`blueprint_invalid: ${validation}`)
    await this.requireVisualStyleFile(projectId, input.root)
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, indexPath(input.root), jsonText(index))
    this.throwIfAborted(context)
    await this.updateInternalFile(projectId, context.growthGoalId!, statePath(input.root), jsonText({ ...state, acceptedGoalVersion: context.growthGoalVersion!, status: "frozen" }))
    return { action: "freeze", root: input.root, status: "frozen", revision: state.revision, objectCount: layers.flatMap((layer) => layer.objects).length, causalRelationCount: relations.relations.length, replayed: false }
  }

  private async ensureWorldWorkbench(projectId: string, root: string, worldName: string) {
    await this.workbenchCommands.register({ projectId, folder: root, title: worldName })
    const snapshot = await this.workbenchQueries.snapshot(projectId)
    const folders = new Set(snapshot.workbenches.filter((workbench) => workbench.state === "ready").map((workbench) => workbench.folder.replaceAll("\\", "/").toLocaleLowerCase("en-US")))
    if (!folders.has(root.toLocaleLowerCase("en-US"))) throw new Error(`blueprint_invalid: world workbench registration did not persist for ${root}`)
  }

  private async ensureVisualStyleFile(projectId: string, root: string, style: WorldVisualStyleInput) {
    const relativePath = visualStylePath(root)
    const entry = await this.fileEntry(projectId, relativePath)
    if (!entry) {
      await this.projectCommands.writeFile({ projectId, relativePath, content: visualStyleMarkdown(style), expectedModifiedAt: null })
    }
    await this.requireVisualStyleFile(projectId, root)
    return relativePath
  }

  private async requireVisualStyleFile(projectId: string, root: string) {
    const relativePath = visualStylePath(root)
    const entry = await this.fileEntry(projectId, relativePath)
    if (!entry) throw new Error(`blueprint_invalid: required visual style file is missing: ${relativePath}`)
    const text = decoder.decode(await this.projectFiles.readBytes(projectId, relativePath)).trim()
    if (!text) throw new Error(`blueprint_invalid: required visual style file is empty: ${relativePath}`)
    return text
  }

  private async reconciliationStatus(projectId: string, goalId: string, root: string, layers: readonly WorldBlueprintLayerDocument[]) {
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, blueprintReconciliationKey(goalId))
    if (!record) throw new Error("blueprint_invalid: reconcile manifest is missing")
    const manifest = parseJson<WorldReconciliationManifest>(decoder.decode(record.bytes))
    if (!manifest || manifest.schemaVersion !== 1 || manifest.goalId !== goalId || manifest.root !== root) throw new Error("blueprint_invalid: reconcile manifest is invalid")
    const entries = layers.flatMap((layer) => layer.objects).filter((object) => object.kind === "entry")
    const entryIds = new Set(entries.map((object) => object.id))
    if (manifest.mappings.some((mapping) => !entryIds.has(mapping.objectId))) throw new Error("blueprint_invalid: reconcile manifest references an entry that is not in the current blueprint")
    const mappedIds = new Set(manifest.mappings.map((mapping) => mapping.objectId))
    return { mappedCount: mappedIds.size, unmappedCount: entries.filter((entry) => !mappedIds.has(entry.id)).length, coverage: reconciliationCoverageSummary(manifest) }
  }

  private async readLayers(projectId: string, root: string, goalId: string) {
    return Promise.all(WORLD_BLUEPRINT_LAYERS.map((layer) => this.requireJson<WorldBlueprintLayerDocument>(projectId, goalId, layerPath(root, layer))))
  }

  private async requireState(projectId: string, root: string, goalId: string) {
    const owner = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, worldOwnerKey(root))
    if (owner) {
      const ownership = parseJson<{ schemaVersion: number; root: string; goalId: string }>(decoder.decode(owner.bytes))
      if (!ownership || ownership.schemaVersion !== 1 || ownership.root !== root) throw new Error("blueprint_invalid: world ownership record is invalid")
      if (ownership.goalId !== goalId) throw new Error("blueprint_conflict: blueprint belongs to another Growth Goal")
    }
    const state = await this.requireJson<WorldBlueprintStateDocument>(projectId, goalId, statePath(root))
    if (state.schemaVersion !== 3) throw new Error("blueprint_conflict: V1/V2 blueprint is retained as evidence and cannot be resumed as V3")
    if (state.root !== root || !Array.isArray(state.batches)) throw new Error("blueprint_invalid: state.json does not match the requested root")
    return state
  }

  private async requireOrClaimWorldOwner(projectId: string, root: string, goalId: string) {
    const key = worldOwnerKey(root)
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (record) {
      const owner = parseJson<{ schemaVersion: number; root: string; goalId: string }>(decoder.decode(record.bytes))
      if (!owner || owner.schemaVersion !== 1 || owner.root !== root) throw new Error("blueprint_invalid: world ownership record is invalid")
      if (owner.goalId !== goalId) throw new Error("blueprint_conflict: blueprint belongs to another Growth Goal")
      return
    }
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content: jsonText({ schemaVersion: 1, root, goalId }), expectedModifiedAt: null })
  }

  private requireOwner(state: WorldBlueprintStateDocument, context: CreatXToolExecutionContext) {
    if (state.ownerGoalId !== context.growthGoalId) throw new Error("blueprint_conflict: blueprint belongs to another Growth Goal")
    if (context.growthGoalVersion! < state.acceptedGoalVersion) throw new Error("blueprint_conflict: stale Growth Goal version cannot write the blueprint")
  }

  private throwIfAborted(context: CreatXToolExecutionContext) {
    if (context.signal?.aborted) throw new Error(`blueprint_conflict: blueprint operation was cancelled${context.signal.reason ? `: ${String(context.signal.reason)}` : ""}`)
  }

  private async requireJson<T>(projectId: string, goalId: string, relativePath: string) {
    const value = await this.readJsonIfExists<T>(projectId, goalId, relativePath)
    if (!value) throw new Error(`blueprint_invalid: missing or invalid JSON file: ${relativePath}`)
    return value
  }

  private async readJsonIfExists<T>(projectId: string, goalId: string, relativePath: string) {
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, blueprintInternalKey(goalId, relativePath))
    if (!record) return undefined
    return parseJson<T>(decoder.decode(record.bytes))
  }

  private async readLegacyJsonIfExists<T>(projectId: string, relativePath: string) {
    const entry = await this.fileEntry(projectId, relativePath)
    if (!entry) return undefined
    return parseJson<T>(decoder.decode(await this.projectFiles.readBytes(projectId, relativePath)))
  }

  private async ensureReconciliationManifest(projectId: string, goalId: string, root: string) {
    const key = blueprintReconciliationKey(goalId)
    const existing = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (existing) {
      const manifest = parseJson<WorldReconciliationManifest>(decoder.decode(existing.bytes))
      if (!manifest || manifest.schemaVersion !== 1 || manifest.goalId !== goalId || manifest.root !== root) throw new Error("blueprint_conflict: reconcile manifest identity differs from the current Growth entry")
      return
    }
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content: jsonText({ schemaVersion: 1, goalId, root, mappings: [], batches: [] } satisfies WorldReconciliationManifest), expectedModifiedAt: null })
  }

  private async ensureInternalExactFile(projectId: string, goalId: string, relativePath: string, content: string) {
    const key = blueprintInternalKey(goalId, relativePath)
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (!record) {
      await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content, expectedModifiedAt: null })
      return
    }
    if (decoder.decode(record.bytes) !== content) throw new Error(`blueprint_conflict: existing internal state differs from initialization: ${relativePath}`)
  }

  private async updateInternalFile(projectId: string, goalId: string, relativePath: string, content: string) {
    const key = blueprintInternalKey(goalId, relativePath)
    const record = await this.internalState.readFile(projectId, GROWTH_INTERNAL_NAMESPACE, key)
    if (!record) throw new Error(`blueprint_invalid: internal state does not exist: ${relativePath}`)
    await this.internalState.writeFile({ projectId, namespace: GROWTH_INTERNAL_NAMESPACE, key, content, expectedModifiedAt: record.modifiedAt })
  }

  private async ensureExactFile(projectId: string, relativePath: string, content: string) {
    const entry = await this.fileEntry(projectId, relativePath)
    if (!entry) {
      await this.projectCommands.writeFile({ projectId, relativePath, content, expectedModifiedAt: null })
      return
    }
    const current = decoder.decode(await this.projectFiles.readBytes(projectId, relativePath))
    if (current !== content) throw new Error(`blueprint_conflict: existing file differs from initialization: ${relativePath}`)
  }

  private async updateFile(projectId: string, relativePath: string, content: string) {
    const entry = await this.fileEntry(projectId, relativePath)
    if (!entry?.modifiedAt) throw new Error(`blueprint_invalid: file does not exist: ${relativePath}`)
    await this.projectCommands.writeFile({ projectId, relativePath, content, expectedModifiedAt: entry.modifiedAt })
  }

  private async fileEntry(projectId: string, relativePath: string) {
    const normalized = relativePath.replaceAll("\\", "/")
    const parts = normalized.split("/")
    const directory = await this.projectFiles.listDirectory(projectId, parts.slice(0, -1).join("/") || ".", "content")
    return directory?.entries.find((entry) => entry.kind === "file" && entry.relativePath === normalized)
  }

  private async serialize<T>(key: string, operation: () => Promise<T>) {
    const previous = this.queues.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    this.queues.set(key, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(key) === tail) this.queues.delete(key)
    }
  }
}

const worldStyleProfileInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "narrativeDistance", "register", "knowledgePosition", "languageConventions", "forbiddenPatterns", "sourceIds"],
  properties: {
    schemaVersion: { const: 1 },
    narrativeDistance: { enum: ["intimate", "observational", "historical", "institutional"] },
    register: { enum: ["plain", "literary", "oral", "documentary"] },
    knowledgePosition: { enum: ["in-world-limited", "retrospective", "contemporary", "editorial"] },
    languageConventions: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 200 } },
    forbiddenPatterns: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 200 } },
    sourceIds: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 200 } },
  },
} as const

const visualStyleInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artMovementAndMedium", "colorAndLighting", "eraMaterialsAndCraft", "architectureCostumeAndWeapons", "motifsSymbolsAndMarks", "lineDetailAndComposition", "forbiddenElements"],
  properties: {
    artMovementAndMedium: { type: "string", minLength: 20, maxLength: 2000 },
    colorAndLighting: { type: "string", minLength: 20, maxLength: 2000 },
    eraMaterialsAndCraft: { type: "string", minLength: 20, maxLength: 2000 },
    architectureCostumeAndWeapons: { type: "string", minLength: 20, maxLength: 2000 },
    motifsSymbolsAndMarks: { type: "string", minLength: 20, maxLength: 2000 },
    lineDetailAndComposition: { type: "string", minLength: 20, maxLength: 2000 },
    forbiddenElements: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 2, maxLength: 300 } },
  },
} as const

const blueprintCauseInputSchema = {
  type: "array",
  maxItems: 80,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["fromKey", "toKey", "reason"],
    properties: {
      fromKey: { type: "string", minLength: 1, maxLength: 160 },
      toKey: { type: "string", minLength: 1, maxLength: 160 },
      reason: { type: "string", minLength: 8, maxLength: 1000 },
    },
  },
} as const

function blueprintObjectsInputSchema(layer: WorldBlueprintLayer) {
  const shared = {
    key: { type: "string", minLength: 1, maxLength: 160 },
    title: { type: "string", minLength: 1, maxLength: 160 },
    parentKey: { type: "string", minLength: 1, maxLength: 160 },
    rationale: { type: "string", minLength: 8, maxLength: 1000 },
  } as const
  return {
    type: "array",
    minItems: 1,
    maxItems: 40,
    items: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["key", "title", "kind", "rationale"], properties: { ...shared, kind: { const: "group" } } },
        { type: "object", additionalProperties: false, required: ["key", "title", "kind", "genreKey", "rationale"], properties: { ...shared, kind: { const: "entry" }, genreKey: { enum: publicationGenreKeys(layer) } } },
      ],
    },
  } as const
}

function appendInputSchema(layer: WorldBlueprintLayer) {
  return {
    type: "object", additionalProperties: false, required: ["action", "root", "layer", "batchId", "objects"],
    properties: {
      action: { const: "append" }, root: { type: "string", minLength: 1 }, layer: { const: layer }, batchId: { type: "string", minLength: 1, maxLength: 120 },
      objects: blueprintObjectsInputSchema(layer),
      causes: blueprintCauseInputSchema,
    },
  } as const
}

function amendInputSchema(layer: WorldBlueprintLayer) {
  return {
    type: "object", additionalProperties: false, required: ["action", "root", "layer", "batchId", "objects", "causes"],
    properties: {
      action: { const: "amend" }, root: { type: "string", minLength: 1 }, layer: { const: layer }, batchId: { type: "string", minLength: 1, maxLength: 120 },
      worldName: { type: "string", minLength: 1, maxLength: 120 }, topicProfileKey: { enum: TOPIC_GENRE_PROFILE_KEYS }, worldStyleProfile: worldStyleProfileInputSchema, sources: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } }, direction: { type: "object" },
      objects: blueprintObjectsInputSchema(layer),
      causes: blueprintCauseInputSchema,
    },
  } as const
}

const worldBlueprintInputSchema = {
  type: "object",
  oneOf: [
    {
      type: "object", additionalProperties: false, required: ["action", "root", "worldName", "route", "topicProfileKey", "worldStyleProfile", "sources", "direction"],
      properties: {
        action: { const: "initialize" }, root: { type: "string", minLength: 1 }, worldName: { type: "string", minLength: 1, maxLength: 120 },
        route: { enum: ["original", "canon", "fanwork"] },
        topicProfileKey: { enum: TOPIC_GENRE_PROFILE_KEYS },
        worldStyleProfile: worldStyleProfileInputSchema,
        sources: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: false, required: ["id", "kind", "locator", "authority", "summary"], properties: { id: { type: "string", minLength: 1 }, kind: { enum: ["user", "project", "web", "canon"] }, locator: { type: "string", minLength: 1 }, authority: { type: "string", minLength: 1 }, summary: { type: "string", minLength: 1 }, capturedAt: { type: "string", minLength: 1 }, contentHash: { type: "string", minLength: 1 }, excerpts: { type: "array", maxItems: 20, items: { type: "string", minLength: 1 } } } } },
        direction: { type: "object", additionalProperties: false, required: ["worldPremise", "creativeDirection", "tone", "themes", "constraints", "unresolvedQuestions"], properties: { worldPremise: { type: "string", minLength: 1 }, creativeDirection: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 }, themes: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1 } }, constraints: { type: "array", maxItems: 100, items: { type: "string", minLength: 1 } }, unresolvedQuestions: { type: "array", maxItems: 100, items: { type: "string", minLength: 1 } } } },
      },
    },
    ...WORLD_BLUEPRINT_LAYERS.map(appendInputSchema),
    ...WORLD_BLUEPRINT_LAYERS.map(amendInputSchema),
    {
      type: "object", additionalProperties: false, required: ["action", "root", "batchId", "mappings"],
      properties: {
        action: { const: "map_sources" }, root: { type: "string", minLength: 1 }, batchId: { type: "string", minLength: 1, maxLength: 120 },
        mappings: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["objectKey", "coverage", "sourcePaths", "note"], properties: { objectKey: { type: "string", minLength: 1, maxLength: 160 }, coverage: { enum: ["existing", "partial", "conflicting", "missing"] }, sourcePaths: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 1000 } }, note: { type: "string", minLength: 8, maxLength: 1000 } } } },
      },
    },
    { type: "object", additionalProperties: false, required: ["action", "root", "visualStyle"], properties: { action: { const: "prepare_review" }, root: { type: "string", minLength: 1 }, visualStyle: visualStyleInputSchema } },
    { type: "object", additionalProperties: false, required: ["action", "root"], properties: { action: { enum: ["inspect", "freeze"] }, root: { type: "string", minLength: 1 } } },
  ],
} satisfies Record<string, unknown>

function requireBlueprintStageAction(stageKey: string | undefined, action: WorldBlueprintAction) {
  if (action === "inspect") return
  const allowed = blueprintWriteActionsByStage[stageKey as keyof typeof blueprintWriteActionsByStage]
  if (!allowed?.has(action)) throw new Error(`blueprint_invalid: action ${action} is not allowed during trusted Growth stage ${stageKey ?? "missing"}`)
}

function requireToolInput(input: unknown): ToolInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("blueprint_invalid: tool input must be an object")
  const value = input as Record<string, unknown>
  const action = requireString(value.action, "action")
  const root = requireRoot(value.root)
  if (action === "inspect" || action === "freeze") {
    requireOnlyKeys(value, ["action", "root"])
    return { action, root }
  }
  if (action === "prepare_review") {
    requireOnlyKeys(value, ["action", "root", "visualStyle"])
    return { action, root, visualStyle: requireVisualStyle(value.visualStyle) }
  }
  if (action === "initialize") {
    requireOnlyKeys(value, ["action", "root", "worldName", "route", "topicProfileKey", "worldStyleProfile", "sources", "direction"])
    if (value.route !== "original" && value.route !== "canon" && value.route !== "fanwork") throw new Error("blueprint_invalid: route must be original, canon, or fanwork")
    return { action, root, worldName: boundedString(value.worldName, "worldName", 120), route: value.route, topicProfileKey: topicGenreProfile(requireString(value.topicProfileKey, "topicProfileKey")).key, worldStyleProfile: requireWorldStyleProfile(value.worldStyleProfile), sources: requireSources(value.sources, value.route), direction: requireDirection(value.direction) }
  }
  if (action === "map_sources") {
    requireOnlyKeys(value, ["action", "root", "batchId", "mappings"])
    if (!Array.isArray(value.mappings) || value.mappings.length < 1 || value.mappings.length > 40) throw new Error("blueprint_invalid: mappings must contain 1 to 40 items")
    return {
      action,
      root,
      batchId: boundedString(value.batchId, "batchId", 120),
      mappings: value.mappings.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`blueprint_invalid: mappings[${index}] must be an object`)
        const mapping = item as Record<string, unknown>
        requireOnlyKeys(mapping, ["objectKey", "coverage", "sourcePaths", "note"])
        if (mapping.coverage !== "existing" && mapping.coverage !== "partial" && mapping.coverage !== "conflicting" && mapping.coverage !== "missing") throw new Error(`blueprint_invalid: mappings[${index}].coverage is invalid`)
        if (!Array.isArray(mapping.sourcePaths) || mapping.sourcePaths.length > 20) throw new Error(`blueprint_invalid: mappings[${index}].sourcePaths must contain at most 20 items`)
        return { objectKey: boundedString(mapping.objectKey, `mappings[${index}].objectKey`, 160), coverage: mapping.coverage, sourcePaths: mapping.sourcePaths.map((path, pathIndex) => boundedString(path, `mappings[${index}].sourcePaths[${pathIndex}]`, 1000)), note: boundedString(mapping.note, `mappings[${index}].note`, 1000, 8) }
      }),
    }
  }
  if (action !== "append" && action !== "amend") throw new Error("blueprint_invalid: unknown action")
  requireOnlyKeys(value, action === "amend" ? ["action", "root", "layer", "batchId", "objects", "causes", "worldName", "topicProfileKey", "worldStyleProfile", "sources", "direction"] : ["action", "root", "layer", "batchId", "objects", "causes"])
  if (!WORLD_BLUEPRINT_LAYERS.includes(value.layer as WorldBlueprintLayer)) throw new Error("blueprint_invalid: layer must be one of the exact twelve layer names")
  if (!Array.isArray(value.objects) || value.objects.length < 1 || value.objects.length > 40) throw new Error("blueprint_invalid: objects must contain 1 to 40 items")
  const causesInput = value.causes ?? []
  if (!Array.isArray(causesInput)) throw new Error("blueprint_invalid: causes must be an array when provided")
  if (causesInput.length > 80) throw new Error("blueprint_invalid: causes must contain at most 80 items")
  const objects = value.objects.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`blueprint_invalid: objects[${index}] must be an object`)
    const object = item as Record<string, unknown>
    requireOnlyKeys(object, ["key", "title", "kind", "parentKey", "genreKey", "rationale"])
    if (object.kind !== "group" && object.kind !== "entry") throw new Error(`blueprint_invalid: objects[${index}].kind is invalid`)
    const kind: "group" | "entry" = object.kind
    if (kind === "group" && object.genreKey !== undefined) throw new Error(`blueprint_invalid: objects[${index}].genreKey is only valid for entry objects`)
    if (kind === "entry" && object.genreKey === undefined) throw new Error(`blueprint_invalid: objects[${index}].genreKey is required for entry objects`)
    const genreKey = object.genreKey === undefined ? undefined : boundedString(object.genreKey, `objects[${index}].genreKey`, 80)
    if (genreKey && !publicationGenreKeys(value.layer as WorldBlueprintLayer).includes(genreKey)) throw new Error(`blueprint_invalid: objects[${index}].genreKey is not allowed for ${String(value.layer)}`)
    return { key: boundedString(object.key, `objects[${index}].key`, 160), title: boundedString(object.title, `objects[${index}].title`, 160), kind, ...(object.parentKey === undefined ? {} : { parentKey: boundedString(object.parentKey, `objects[${index}].parentKey`, 160) }), ...(genreKey ? { genreKey } : {}), rationale: boundedString(object.rationale, `objects[${index}].rationale`, 1000, 8) }
  })
  const causes = causesInput.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`blueprint_invalid: causes[${index}] must be an object`)
    const cause = item as Record<string, unknown>
    requireOnlyKeys(cause, ["fromKey", "toKey", "reason"])
    return { fromKey: boundedString(cause.fromKey, `causes[${index}].fromKey`, 160), toKey: boundedString(cause.toKey, `causes[${index}].toKey`, 160), reason: boundedString(cause.reason, `causes[${index}].reason`, 1000, 8) }
  })
  if (action === "amend") {
    return {
      action, root, layer: value.layer as WorldBlueprintLayer, batchId: boundedString(value.batchId, "batchId", 120), objects, causes,
      ...(value.worldName === undefined ? {} : { worldName: boundedString(value.worldName, "worldName", 120) }),
      ...(value.topicProfileKey === undefined ? {} : { topicProfileKey: topicGenreProfile(requireString(value.topicProfileKey, "topicProfileKey")).key }),
      ...(value.worldStyleProfile === undefined ? {} : { worldStyleProfile: requireWorldStyleProfile(value.worldStyleProfile) }),
      ...(value.sources === undefined ? {} : { sources: requireSources(value.sources, "original") }),
      ...(value.direction === undefined ? {} : { direction: requireDirection(value.direction) }),
    }
  }
  return { action, root, layer: value.layer as WorldBlueprintLayer, batchId: boundedString(value.batchId, "batchId", 120), objects, causes }
}

function requireRoot(value: unknown) {
  const root = requireString(value, "root").replaceAll("\\", "/")
  if (root.startsWith("/") || /^[A-Za-z]:\//u.test(root) || root === "." || root.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) throw new Error("blueprint_invalid: root must be a safe project-relative non-internal directory")
  return root
}

function requireVisualStyle(value: unknown): WorldVisualStyleInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("blueprint_invalid: visualStyle must be an object")
  const style = value as Record<string, unknown>
  requireOnlyKeys(style, ["artMovementAndMedium", "colorAndLighting", "eraMaterialsAndCraft", "architectureCostumeAndWeapons", "motifsSymbolsAndMarks", "lineDetailAndComposition", "forbiddenElements"])
  if (!Array.isArray(style.forbiddenElements) || style.forbiddenElements.length < 1 || style.forbiddenElements.length > 20) throw new Error("blueprint_invalid: visualStyle.forbiddenElements must contain 1 to 20 items")
  return {
    artMovementAndMedium: boundedString(style.artMovementAndMedium, "visualStyle.artMovementAndMedium", 2000, 20),
    colorAndLighting: boundedString(style.colorAndLighting, "visualStyle.colorAndLighting", 2000, 20),
    eraMaterialsAndCraft: boundedString(style.eraMaterialsAndCraft, "visualStyle.eraMaterialsAndCraft", 2000, 20),
    architectureCostumeAndWeapons: boundedString(style.architectureCostumeAndWeapons, "visualStyle.architectureCostumeAndWeapons", 2000, 20),
    motifsSymbolsAndMarks: boundedString(style.motifsSymbolsAndMarks, "visualStyle.motifsSymbolsAndMarks", 2000, 20),
    lineDetailAndComposition: boundedString(style.lineDetailAndComposition, "visualStyle.lineDetailAndComposition", 2000, 20),
    forbiddenElements: style.forbiddenElements.map((item, index) => boundedString(item, `visualStyle.forbiddenElements[${index}]`, 300, 2)),
  }
}

function visualStylePath(root: string) {
  return `${root}/视觉设定/统一画风.md`
}

function visualStyleMarkdown(style: WorldVisualStyleInput) {
  return `# 统一画风

本文件是本作品全部地图、角色立绘、小说插图和漫画共享的最高视觉约束。类型级与单图说明可以补充具体内容，但不得覆盖本文件。

## 美术流派与媒介质感

${style.artMovementAndMedium}

## 色彩和明暗体系

${style.colorAndLighting}

## 时代、材质与工艺边界

${style.eraMaterialsAndCraft}

## 建筑、服饰与武器的共同语言

${style.architectureCostumeAndWeapons}

## 纹样、象征与标志

${style.motifsSymbolsAndMarks}

## 线条、细节密度与构图倾向

${style.lineDetailAndComposition}

## 禁止出现的现代或违和元素

${style.forbiddenElements.map((item) => `- ${item}`).join("\n")}
`
}

function requireSourcePath(value: string) {
  const path = value.trim().replaceAll("\\", "/")
  if (path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".creatx")) throw new Error("blueprint_invalid: reconciliation source path must be a safe non-internal project-relative file")
  return path
}

function safeMarkdownName(value: string) {
  const name = value.trim().replace(/[<>:"/\\|?*]/gu, "-").replace(/[. ]+$/gu, "")
  if (!name || name === "." || name === ".." || invalidWindowsNames.test(name)) throw new Error(`blueprint_invalid: title cannot form a safe Windows file name: ${value}`)
  return name
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`blueprint_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function boundedString(value: unknown, name: string, maximum: number, minimum = 1) {
  const text = requireString(value, name)
  if (text.length < minimum || text.length > maximum) throw new Error(`blueprint_invalid: ${name} must contain ${minimum} to ${maximum} characters`)
  return text
}

function stringArray(value: unknown, name: string, maximum: number, required: boolean) {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length === 0)) throw new Error(`blueprint_invalid: ${name} has an invalid item count`)
  const result = value.map((item, index) => boundedString(item, `${name}[${index}]`, 1000))
  if (new Set(result).size !== result.length) throw new Error(`blueprint_invalid: ${name} contains duplicates`)
  return result
}

function requireSources(value: unknown, route: WorldBlueprintStateDocument["route"]): WorldBlueprintSourceRecord[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("blueprint_invalid: sources must contain 1 to 100 records")
  const sources = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`blueprint_invalid: sources[${index}] must be an object`)
    const source = item as Record<string, unknown>
    requireOnlyKeys(source, ["id", "kind", "locator", "authority", "summary", "capturedAt", "contentHash", "excerpts"])
    if (!['user', 'project', 'web', 'canon'].includes(String(source.kind))) throw new Error(`blueprint_invalid: sources[${index}].kind is invalid`)
    return {
      id: boundedString(source.id, `sources[${index}].id`, 160),
      kind: source.kind as WorldBlueprintSourceRecord["kind"],
      locator: boundedString(source.locator, `sources[${index}].locator`, 2000),
      authority: boundedString(source.authority, `sources[${index}].authority`, 1000),
      summary: boundedString(source.summary, `sources[${index}].summary`, 4000),
      ...(source.capturedAt === undefined ? {} : { capturedAt: boundedString(source.capturedAt, `sources[${index}].capturedAt`, 100) }),
      ...(source.contentHash === undefined ? {} : { contentHash: boundedString(source.contentHash, `sources[${index}].contentHash`, 200) }),
      ...(source.excerpts === undefined ? {} : { excerpts: stringArray(source.excerpts, `sources[${index}].excerpts`, 20, false) }),
    }
  })
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error("blueprint_invalid: source IDs must be unique")
  if (route === "canon" && !sources.some((source) => source.kind === "canon" || source.kind === "web")) throw new Error("blueprint_invalid: canon route requires a canon or web source")
  if (route === "fanwork" && (!sources.some((source) => source.kind === "canon" || source.kind === "web") || !sources.some((source) => source.kind === "project" || source.kind === "user"))) throw new Error("blueprint_invalid: fanwork route requires both canon evidence and user or project material")
  return sources
}

function requireDirection(value: unknown): WorldBlueprintCreativeDirection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("blueprint_invalid: direction must be an object")
  const direction = value as Record<string, unknown>
  requireOnlyKeys(direction, ["worldPremise", "creativeDirection", "tone", "themes", "constraints", "unresolvedQuestions"])
  return {
    worldPremise: boundedString(direction.worldPremise, "direction.worldPremise", 4000),
    creativeDirection: boundedString(direction.creativeDirection, "direction.creativeDirection", 2000),
    tone: boundedString(direction.tone, "direction.tone", 1000),
    themes: stringArray(direction.themes, "direction.themes", 20, true),
    constraints: stringArray(direction.constraints, "direction.constraints", 100, false),
    unresolvedQuestions: stringArray(direction.unresolvedQuestions, "direction.unresolvedQuestions", 100, false),
  }
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`blueprint_invalid: tool input contains unknown field ${unknown}`)
}

function objectId(root: string, key: string) {
  return `wbo_${hash(`${root}\0${key}`).slice(0, 20)}`
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
  return JSON.stringify(value)
}

function jsonText(value: unknown) {
  return `${JSON.stringify(value, undefined, 2)}\n`
}

function statePath(root: string) { return `${root}/世界蓝图/state.json` }
function indexPath(root: string) { return `${root}/世界蓝图/index.json` }
function relationsPath(root: string) { return `${root}/世界蓝图/relations.json` }
function layerPath(root: string, layer: WorldBlueprintLayer) { return `${root}/${layer}/蓝图.json` }

function emptyLayers(): WorldBlueprintLayerDocument[] {
  return WORLD_BLUEPRINT_LAYERS.map((layer) => ({ schemaVersion: 3, layer, objects: [] }))
}

function buildIndex(root: string, layers: readonly WorldBlueprintLayerDocument[], relations: readonly WorldBlueprintCausalRelation[], status: "draft" | "review" | "frozen"): WorldBlueprintIndexDocument {
  const objectLayers = new Map(layers.flatMap((document) => document.objects.map((object) => [object.id, object.layer] as const)))
  return {
    schemaVersion: 3,
    root,
    status,
    layers: layers.map((document) => ({ layer: document.layer, path: layerPath(root, document.layer), objectCount: document.objects.length, plannedPathCount: document.objects.filter((object) => object.plannedPath).length })),
    causalRelationCount: relations.length,
    crossLayerCausalRelationCount: relations.filter((relation) => objectLayers.get(relation.from) !== objectLayers.get(relation.to)).length,
  }
}

function worldBaseline(input: InitializeInput) {
  return `# ${input.worldName}：世界基准\n\n- 路线：${input.route}\n- 题材配置：${input.topicProfileKey}\n- 世界前提：${input.direction.worldPremise}\n- 创作方向：${input.direction.creativeDirection}\n- 基调：${input.direction.tone}\n- 主题：${input.direction.themes.join("；")}\n- 当前状态：蓝图规划中，尚未生成正式正文。\n`
}

function allGenreCandidates(topicProfileKey: string) {
  return Object.fromEntries(WORLD_BLUEPRINT_LAYERS.map((layer) => [layer, topicGenreCandidates(topicProfileKey, layer)]))
}

function sourceIndex(input: InitializeInput) {
  return `# 资料索引\n\n${input.sources.map((source) => `## ${source.id}\n\n- 类型：${source.kind}\n- 定位：${source.locator}\n- 权威：${source.authority}\n- 摘要：${source.summary}`).join("\n\n")}\n\n## 明确约束\n\n${list(input.direction.constraints, "暂无额外约束。")}\n\n## 未决问题\n\n${list(input.direction.unresolvedQuestions, "暂无已登记未知项。")}\n`
}

function list(items: readonly string[], empty: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`
}

function blueprintError(error: unknown): CreatXError {
  const detail = error instanceof Error ? error.message : String(error)
  if (detail.startsWith("project_invalid")) return { code: "project_invalid", message: "当前工具没有有效项目。", detail }
  if (detail.startsWith("blueprint_conflict") || detail.startsWith("file_conflict") || detail.startsWith("workbench_conflict")) return { code: "blueprint_conflict", message: "世界蓝图与现有状态冲突。", detail }
  return { code: "blueprint_invalid", message: "世界蓝图输入或持久状态无效。", detail }
}
