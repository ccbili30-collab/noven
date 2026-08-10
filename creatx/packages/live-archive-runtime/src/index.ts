import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { backup, DatabaseSync } from "node:sqlite"
import { promoteClineLiveArchive } from "@creatx/cline-adapter"
import { GrowthGoalStore } from "@creatx/growth-runtime"
import { promoteGrowthLiveArchive } from "@creatx/growth-runtime/live-archive"
import { ImageTaskStore } from "@creatx/image-runtime/queue"
import { promoteImageLiveArchive } from "@creatx/image-runtime/live-archive"
import { projectId } from "@creatx/project-files"
import { promoteSessionPermissionArchive, SessionPermissionStore } from "@creatx/session-runtime"

interface LiveArchiveManifest {
  schemaVersion: 1
  archiveId: string
  kind: "growth-world-pro-live-test"
  createdAt: string
  goalId: string
  ownerSessionId: string
  sourceProjectId: string
  workRootPath: string
  targetProjectRelativePath: string
  projectDigest: string
  projectFileCount: number
  sessionIds: string[]
}

export interface QueueLiveArchiveInput {
  sourceProjectRoot: string
  sourceUserData: string
  targetUserData: string
  goalId: string
}

export interface PromotedLiveArchive {
  archiveId: string
  goalId: string
  projectId: string
  projectRoot: string
  ownerSessionId: string
  sessionCount: number
  issueCount: number
  reportCount: number
  imageTaskCount: number
}

export async function queueCompletedLiveArchive(input: QueueLiveArchiveInput) {
  const sourceProjectRoot = resolve(input.sourceProjectRoot)
  const sourceUserData = resolve(input.sourceUserData)
  const targetUserData = resolve(input.targetUserData)
  if (sourceUserData === targetUserData) throw new Error("live_archive_invalid: source and target userData must differ")
  const sourceGrowth = new DatabaseSync(join(sourceUserData, "creatx", "growth.sqlite"), { readOnly: true })
  const sourceSessions = new DatabaseSync(join(sourceUserData, "cline", "database", "sessions.db"), { readOnly: true })
  try {
    requireQuickCheck(sourceGrowth, "Growth")
    requireQuickCheck(sourceSessions, "Cline")
    const hasOwnerReplyPending = (sourceGrowth.prepare("PRAGMA table_info(growth_goal)").all() as unknown as Array<{ name: string }>).some((column) => column.name === "owner_reply_pending")
    const goal = sourceGrowth.prepare(`SELECT goal_id, project_id, session_id, status, ${hasOwnerReplyPending ? "owner_reply_pending" : "0 AS owner_reply_pending"}, work_root_path FROM growth_goal WHERE goal_id = ?`).get(input.goalId) as unknown as { goal_id: string; project_id: string; session_id: string; status: string; owner_reply_pending: number; work_root_path: string | null } | undefined
    if (!goal) throw new Error("live_archive_invalid: completed Growth Goal is missing")
    if (goal.status !== "completed" || goal.owner_reply_pending !== 0 || !goal.work_root_path) throw new Error("live_archive_invalid: only a completed Growth Goal with a delivered Owner reply can be archived")
    if (goal.project_id !== projectId(sourceProjectRoot)) throw new Error("live_archive_invalid: source project path does not match the Growth Project ID")
    if (!sourceSessions.prepare("SELECT 1 FROM sessions WHERE session_id = ?").get(goal.session_id)) throw new Error("live_archive_invalid: Owner session is missing from Cline history")
    const sessionIds = [goal.session_id]
    const projectEvidence = await directoryEvidence(sourceProjectRoot)
    const archiveId = `live-${goal.goal_id}`
    const inboxRoot = join(targetUserData, "creatx", "live-archives", "inbox")
    const inbox = join(inboxRoot, archiveId)
    const completed = join(targetUserData, "creatx", "live-archives", "completed", archiveId)
    const completedManifest = await readManifest(completed)
    if (completedManifest) {
      if (completedManifest.goalId !== goal.goal_id || completedManifest.projectDigest !== projectEvidence.digest) throw new Error(`live_archive_conflict: completed Archive ${archiveId} contains different content`)
      return { archiveId, inbox: completed, manifest: completedManifest }
    }
    const existing = await readManifest(inbox)
    if (existing) {
      if (existing.goalId !== goal.goal_id || existing.projectDigest !== projectEvidence.digest) throw new Error(`live_archive_conflict: Inbox ${archiveId} already contains different content`)
      return { archiveId, inbox, manifest: existing }
    }
    const createdAt = new Date().toISOString()
    const targetProjectRelativePath = await chooseTargetProjectRelativePath(targetUserData, goal.work_root_path, goal.goal_id)
    const manifest: LiveArchiveManifest = {
      schemaVersion: 1,
      archiveId,
      kind: "growth-world-pro-live-test",
      createdAt,
      goalId: goal.goal_id,
      ownerSessionId: goal.session_id,
      sourceProjectId: goal.project_id,
      workRootPath: goal.work_root_path,
      targetProjectRelativePath,
      projectDigest: projectEvidence.digest,
      projectFileCount: projectEvidence.files,
      sessionIds,
    }
    const staging = join(inboxRoot, `.${archiveId}.staging-${process.pid}`)
    if (await optionalStat(staging)) await rm(staging, { recursive: true, force: true })
    await mkdir(join(staging, "cline", "sessions"), { recursive: true })
    await mkdir(join(staging, "creatx"), { recursive: true })
    await cp(sourceProjectRoot, join(staging, "project"), { recursive: true, errorOnExist: true })
    await Promise.all(sessionIds.map((sessionId) => cp(
      join(sourceUserData, "cline", "sessions", sessionId),
      join(staging, "cline", "sessions", sessionId),
      { recursive: true, errorOnExist: true },
    )))
    await snapshotDatabase(join(sourceUserData, "cline", "database", "sessions.db"), join(staging, "cline", "database", "sessions.db"))
    await Promise.all(["growth.sqlite", "image-queue.sqlite", "session.sqlite"].map((name) => snapshotDatabase(
      join(sourceUserData, "creatx", name),
      join(staging, "creatx", name),
    )))
    new GrowthGoalStore(join(staging, "creatx", "growth.sqlite")).close()
    await writeFile(join(staging, "manifest.json"), `${JSON.stringify(manifest, undefined, 2)}\n`, "utf8")
    await mkdir(inboxRoot, { recursive: true })
    await rename(staging, inbox)
    return { archiveId, inbox, manifest }
  } finally {
    sourceGrowth.close()
    sourceSessions.close()
  }
}

export async function promotePendingLiveArchives(targetUserDataInput: string) {
  const targetUserData = resolve(targetUserDataInput)
  const inboxRoot = join(targetUserData, "creatx", "live-archives", "inbox")
  const entries = await readdir(inboxRoot, { withFileTypes: true }).catch((error: unknown) => {
    if (isNotFound(error)) return []
    throw error
  })
  const promoted: PromotedLiveArchive[] = []
  for (const entry of entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))) {
    const inbox = join(inboxRoot, entry.name)
    try {
      promoted.push(await promoteArchive(inbox, targetUserData))
    } catch (error) {
      await writeFile(join(inbox, "failure.json"), `${JSON.stringify({ failedAt: new Date().toISOString(), error: messageOf(error) }, undefined, 2)}\n`, "utf8").catch(() => undefined)
      console.warn(`[live_archive_failed] ${entry.name}: ${messageOf(error)}`)
    }
  }
  return promoted
}

async function promoteArchive(inbox: string, targetUserData: string): Promise<PromotedLiveArchive> {
  const manifest = await requireManifest(inbox)
  const sourceProject = join(inbox, "project")
  const evidence = await directoryEvidence(sourceProject)
  if (evidence.digest !== manifest.projectDigest || evidence.files !== manifest.projectFileCount) throw new Error("live_archive_invalid: project files do not match the Inbox manifest")
  const projectRoot = resolve(targetUserData, manifest.targetProjectRelativePath)
  requireInside(targetUserData, projectRoot)
  await copyDirectoryExact(sourceProject, projectRoot, manifest.projectDigest)
  const targetProjectId = projectId(projectRoot)
  const creatxData = join(targetUserData, "creatx")
  await initializeTargetStores(creatxData)
  const cline = await promoteClineLiveArchive({
    archiveId: manifest.archiveId,
    goalId: manifest.goalId,
    ownerSessionId: manifest.ownerSessionId,
    sourceProjectId: manifest.sourceProjectId,
    targetProjectId,
    targetProjectRoot: projectRoot,
    sourceDataDir: join(inbox, "cline"),
    targetDataDir: join(targetUserData, "cline"),
  })
  if (cline.sessionIds.some((sessionId) => !manifest.sessionIds.includes(sessionId)) || !cline.sessionIds.includes(manifest.ownerSessionId)) {
    throw new Error("live_archive_invalid: imported Cline sessions do not match the Inbox manifest")
  }
  promoteSessionPermissionArchive({
    sourceDatabasePath: join(inbox, "creatx", "session.sqlite"),
    targetDatabasePath: join(creatxData, "session.sqlite"),
    sessionIds: cline.sessionIds,
  })
  const growth = promoteGrowthLiveArchive({
    sourceDatabasePath: join(inbox, "creatx", "growth.sqlite"),
    targetDatabasePath: join(creatxData, "growth.sqlite"),
    goalId: manifest.goalId,
    sourceProjectId: manifest.sourceProjectId,
    targetProjectId,
  })
  const images = promoteImageLiveArchive({
    sourceDatabasePath: join(inbox, "creatx", "image-queue.sqlite"),
    targetDatabasePath: join(creatxData, "image-queue.sqlite"),
    sourceProjectId: manifest.sourceProjectId,
    targetProjectId,
    interruptedAt: manifest.createdAt,
  })
  const result = {
    archiveId: manifest.archiveId,
    goalId: manifest.goalId,
    projectId: targetProjectId,
    projectRoot,
    ownerSessionId: manifest.ownerSessionId,
    sessionCount: cline.sessionIds.length,
    issueCount: growth.issueCount,
    reportCount: growth.reportCount,
    imageTaskCount: images.taskCount,
  }
  await writeFile(join(inbox, "promoted.json"), `${JSON.stringify({ promotedAt: new Date().toISOString(), ...result }, undefined, 2)}\n`, "utf8")
  const completed = join(targetUserData, "creatx", "live-archives", "completed", manifest.archiveId)
  await mkdir(dirname(completed), { recursive: true })
  if (await optionalStat(completed)) throw new Error(`live_archive_conflict: completed Archive already exists: ${completed}`)
  await rename(inbox, completed)
  return result
}

async function initializeTargetStores(creatxData: string) {
  await mkdir(creatxData, { recursive: true })
  const growth = new GrowthGoalStore(join(creatxData, "growth.sqlite"))
  growth.close()
  const images = new ImageTaskStore(join(creatxData, "image-queue.sqlite"))
  images.close()
  const sessions = new SessionPermissionStore(join(creatxData, "session.sqlite"))
  sessions.close()
}

async function snapshotDatabase(source: string, target: string) {
  await mkdir(dirname(target), { recursive: true })
  const database = new DatabaseSync(source, { readOnly: true })
  try {
    requireQuickCheck(database, basename(source))
    await backup(database, target)
  } finally {
    database.close()
  }
}

async function chooseTargetProjectRelativePath(targetUserData: string, workRootPath: string, goalId: string) {
  const name = safeName(basename(workRootPath))
  const base = join("creatx", "projects", "live-tests", name)
  if (!await optionalStat(join(targetUserData, base))) return base
  return join("creatx", "projects", "live-tests", `${name}-${goalId.replace(/^goal_/u, "").slice(0, 8)}`)
}

async function copyDirectoryExact(source: string, target: string, expectedDigest: string) {
  const existing = await optionalStat(target)
  if (!existing) {
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target, { recursive: true, errorOnExist: true })
    return
  }
  if (!existing.isDirectory() || (await directoryEvidence(target)).digest !== expectedDigest) throw new Error(`live_archive_conflict: target project differs: ${target}`)
}

async function directoryEvidence(root: string) {
  const files = await listFiles(root)
  const hash = createHash("sha256")
  for (const path of files) {
    hash.update(relative(root, path).replaceAll("\\", "/"))
    hash.update(await readFile(path))
  }
  return { digest: hash.digest("hex"), files: files.length }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name)).map((entry) => {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`live_archive_invalid: symbolic links are not allowed: ${path}`)
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
  }))).flat()
}

function requireQuickCheck(database: DatabaseSync, label: string) {
  const integrity = database.prepare("PRAGMA quick_check").get() as unknown as { quick_check: string }
  if (integrity.quick_check !== "ok") throw new Error(`live_archive_invalid: ${label} database failed quick_check: ${integrity.quick_check}`)
}

async function readManifest(root: string) {
  const content = await readFile(join(root, "manifest.json"), "utf8").catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
  return content ? decodeManifest(content) : undefined
}

async function requireManifest(root: string) {
  const manifest = await readManifest(root)
  if (!manifest) throw new Error("live_archive_invalid: Inbox manifest is missing")
  return manifest
}

function decodeManifest(content: string) {
  const value = JSON.parse(content) as Partial<LiveArchiveManifest>
  if (value.schemaVersion !== 1 || value.kind !== "growth-world-pro-live-test" || !value.archiveId || !value.goalId || !value.ownerSessionId || !value.sourceProjectId || !value.workRootPath || !value.targetProjectRelativePath || !value.projectDigest || !Number.isSafeInteger(value.projectFileCount) || !Array.isArray(value.sessionIds)) {
    throw new Error("live_archive_invalid: Inbox manifest is invalid")
  }
  return value as LiveArchiveManifest
}

function safeName(value: string) {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_").replace(/[. ]+$/u, "").trim()
  if (!safe) throw new Error("live_archive_invalid: project name is not valid on Windows")
  return safe
}

function requireInside(root: string, path: string) {
  const relation = relative(resolve(root), resolve(path))
  if (!relation || relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../")) throw new Error("live_archive_invalid: target project path escapes userData")
}

async function optionalStat(path: string) {
  return stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
