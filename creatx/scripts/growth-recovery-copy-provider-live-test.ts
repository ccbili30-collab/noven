import { cp, mkdtemp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { ClineAdapter } from "@creatx/cline-adapter"
import type { CreatXEvent, GrowthGoalProjection } from "@creatx/contracts"
import { ProjectFileService } from "@creatx/project-files"
import { SessionPermissionStore } from "@creatx/session-runtime"
import { WorldMaterializationService } from "@creatx/world-blueprint"

const sourceProject = resolve(process.argv[2] ?? "")
const workRoot = process.argv[3]?.trim()
const goalId = process.argv[4]?.trim()
const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
if (!sourceProject || !workRoot || !goalId) throw new Error("usage: growth-recovery-copy-provider-live-test.ts <snapshot-project> <work-root> <goal-id>")
if (!apiKey) throw new Error("LIVE BLOCKED: DEEPSEEK_API_KEY is not configured")

const temporaryRoot = await mkdtemp(join(tmpdir(), "CreatX recovery Provider copy "))
const projectRoot = join(temporaryRoot, "project")
const adapterData = join(temporaryRoot, "cline")
const permissionDatabase = join(temporaryRoot, "session.sqlite")
const projectFiles = new ProjectFileService()
const permissions = new SessionPermissionStore(permissionDatabase)
const events: CreatXEvent[] = []
let adapter: ClineAdapter | undefined
let passed = false

try {
  await cp(sourceProject, projectRoot, { recursive: true, force: false, errorOnExist: true })
  const project = await projectFiles.openProject(projectRoot)
  let goal: GrowthGoalProjection
  const materialization = new WorldMaterializationService(
    projectFiles.queries,
    projectFiles.internal,
    async () => undefined,
    (candidateGoalId) => candidateGoalId === goalId ? goal : undefined,
  )
  adapter = await ClineAdapter.create({
    dataDir: adapterData,
    providerId: "deepseek",
    modelId: "deepseek-chat",
    apiKey,
    tools: [materialization.tool()],
    resolveProjectId: (root) => projectFiles.rememberProjectRoot(root),
    sessionPermissions: permissions,
    onEvent: (event) => events.push(event),
  })
  const session = await adapter.createProjectSession({ projectId: project.id, projectRoot })
  const now = new Date().toISOString()
  goal = {
    goalId,
    projectId: project.id,
    sessionId: session.id,
    instruction: "Growth World Pro recovery-copy Provider verification",
    status: "active",
    workRootPath: workRoot,
    requiredImageTaskIds: [],
    createdAt: now,
    updatedAt: now,
    version: 5,
  }
  const before = await materialization.progress(project.id, goalId)
  const batch = await materialization.dispatchBatch({ projectId: project.id, sessionId: session.id, goalId, expectedVersion: goal.version, root: workRoot })
  if (!batch.commands.length || batch.commands.length > 3) throw new Error(`LIVE FAIL: expected 1-3 bounded recovery commands, received ${batch.commands.length}`)
  if (batch.commands.some((command) => command.workerProfile !== "world-research")) throw new Error("LIVE FAIL: recovery copy did not dispatch isolated research Workers first")
  const results = await adapter.runGrowthStageBatch(batch.commands)
  await materialization.settleBatch(project.id, goalId, workRoot, batch.commands.map((command) => command.workItemId!), results)
  const after = await materialization.progress(project.id, goalId)
  const durable = await materialization.prepare(project.id, goalId, workRoot)
  const dispatchedStates = durable.objects
    .filter((object) => batch.commands.some((command) => command.workItemId === object.objectId))
    .map((object) => ({ objectId: object.objectId, status: object.status }))
  const timeline = events.filter((event) => event.type === "timeline.upsert")
  const sequences = timeline.map((event) => event.type === "timeline.upsert" ? event.item.sequence : 0)
  if (!timeline.some((event) => event.type === "timeline.upsert" && event.item.kind === "tool")) throw new Error("LIVE FAIL: no tool appeared in the unified Timeline")
  if (!timeline.some((event) => event.type === "timeline.upsert" && (event.item.kind === "reasoning" || event.item.kind === "message"))) throw new Error("LIVE FAIL: no model content appeared in the unified Timeline")
  if (sequences.some((sequence) => !Number.isSafeInteger(sequence) || sequence < 1)) throw new Error("LIVE FAIL: Timeline sequence is invalid")
  const succeeded = results.filter((result) => result.state === "completed").length
  if (succeeded !== results.length) throw new Error(`LIVE FAIL: an isolated Worker did not finish normally: ${JSON.stringify(results.map((result) => ({ state: result.state, reason: bounded(result.reason) })))}`)
  if (!after || after.total !== 124 || after.completed !== 3) throw new Error(`LIVE FAIL: recovery projection changed completed identity: ${JSON.stringify(after)}`)
  const toolTerminals = timeline.flatMap((event) => event.type === "timeline.upsert" && event.item.kind === "tool" && event.item.state !== "streaming" ? [{ name: event.item.toolName, state: event.item.state, error: event.item.error }] : [])
  if (after.retryable || after.unknown || dispatchedStates.length !== batch.commands.length || dispatchedStates.some((object) => object.status !== "ready" && object.status !== "blocked")) throw new Error(`LIVE FAIL: Provider Runs ended without durable research: ${JSON.stringify({ results: results.map((result) => ({ state: result.state, reason: bounded(result.reason) })), after, dispatchedStates, toolTerminals: toolTerminals.map((item) => ({ ...item, error: bounded(item.error) })), notices: timeline.flatMap((event) => event.type === "timeline.upsert" && event.item.kind === "notice" ? [bounded(event.item.text)] : []) })}`)
  passed = true
  console.log(JSON.stringify({
    status: "GROWTH RECOVERY COPY PROVIDER LIVE PASS",
    provider: adapter.providerId,
    model: adapter.modelId,
    migratedObjects: after.total,
    completedBodies: after.completed,
    dispatched: batch.commands.length,
    workerSucceeded: succeeded,
    workerFailed: results.length - succeeded,
    dispatchedStates,
    timelineKinds: [...new Set(timeline.map((event) => event.type === "timeline.upsert" ? event.item.kind : ""))],
    before: before ?? null,
    after,
  }))
} finally {
  await adapter?.dispose()
  permissions.close()
  if (passed) await rm(temporaryRoot, { recursive: true, force: true })
  else console.error(`GROWTH RECOVERY COPY PRESERVED: ${temporaryRoot}`)
}

function bounded(value: unknown) {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)
  return text.length > 500 ? `${text.slice(0, 497)}…` : text
}
