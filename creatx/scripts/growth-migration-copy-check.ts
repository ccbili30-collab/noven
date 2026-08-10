import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectFileService } from "@creatx/project-files"
import { migrateLegacyWorldState, WorldMaterializationService } from "@creatx/world-blueprint"

const [sourceProject, workRoot, goalId] = process.argv.slice(2)
if (!sourceProject || !workRoot || !goalId) throw new Error("usage: bun run scripts/growth-migration-copy-check.ts <project-root> <work-root> <goal-id>")

const temporaryParent = await mkdtemp(join(tmpdir(), "CreatX migration copy "))
const copyRoot = join(temporaryParent, basename(sourceProject))
await cp(sourceProject, copyRoot, { recursive: true })

try {
  const files = new ProjectFileService()
  const project = await files.openProject(copyRoot)
  const sourceMaterialization = JSON.parse(await readFile(join(sourceProject, workRoot, "世界蓝图", "materialization.json"), "utf8")) as { objects: Array<{ plannedPath: string; status: string }> }
  const completedBefore = new Map(await Promise.all(sourceMaterialization.objects.filter((object) => object.status === "completed").map(async (object) => [object.plannedPath, Bun.hash(await readFile(join(sourceProject, object.plannedPath)))] as const)))
  const manifest = await migrateLegacyWorldState({ projectFiles: files.queries, internalState: files.internal, projectId: project.id, goalId, root: workRoot })
  const service = new WorldMaterializationService(files.queries, files.internal, async () => undefined, () => ({ projectId: project.id, version: 1, status: "active", workRootPath: workRoot }))
  const state = await service.prepare(project.id, goalId, workRoot)
  const completedAfter = new Map(await Promise.all([...completedBefore.keys()].map(async (path) => [path, Bun.hash(await readFile(join(copyRoot, path)))] as const)))
  if ([...completedBefore].some(([path, hash]) => completedAfter.get(path) !== hash)) throw new Error("completed body changed during copy migration")
  const visibleMachineJson = (await files.queries.refreshProject(project.id)).files.filter((file) => file.relativePath.includes("/世界蓝图/") || file.relativePath.endsWith("/蓝图.json") || file.relativePath.endsWith("/关系/index.json"))
  if (visibleMachineJson.length) throw new Error(`machine JSON remained visible: ${visibleMachineJson.map((file) => file.relativePath).join(", ")}`)
  console.log(JSON.stringify({ status: manifest.status, objects: state.objects.length, completed: state.objects.filter((object) => object.status === "completed").length, pending: state.objects.filter((object) => object.status === "pending").length, visibleMachineJson: 0 }, undefined, 2))
} finally {
  await rm(temporaryParent, { recursive: true, force: true })
}
