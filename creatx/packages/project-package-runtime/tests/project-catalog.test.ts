import { afterEach, describe, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ProjectCatalogStore } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("portable project catalog", () => {
  test("registers an imported project and resolves the same source identity idempotently", async () => {
    const value = await setup()
    const store = new ProjectCatalogStore(value.userData)
    const input = {
      localProjectId: "lineage-1",
      rootPath: value.projectA,
      displayName: "星环计划",
      source: "imported-package" as const,
      importedProjectId: "lineage-1",
      importedPackageId: "a".repeat(64),
    }

    const first = await store.register(input)
    const repeated = await store.register(input)
    const inspected = store.inspectImport("lineage-1", "a".repeat(64))

    expect(first.status).toBe("registered")
    expect(repeated).toEqual({ status: "existing", entry: first.entry })
    expect(inspected).toEqual({ kind: "existing", entry: first.entry })
    expect((await new ProjectCatalogStore(value.userData).list())).toEqual([first.entry])
  })

  test("blocks a different package from the same lineage until an explicit independent copy is registered", async () => {
    const value = await setup()
    const store = new ProjectCatalogStore(value.userData)
    await store.register({
      localProjectId: "lineage-1",
      rootPath: value.projectA,
      displayName: "原项目",
      source: "imported-package",
      importedProjectId: "lineage-1",
      importedPackageId: "a".repeat(64),
    })

    expect(store.inspectImport("lineage-1", "b".repeat(64))).toEqual({ kind: "conflict", existingLocalProjectIds: ["lineage-1"] })
    await expect(store.register({
      localProjectId: "lineage-1",
      rootPath: value.projectB,
      displayName: "错误覆盖",
      source: "imported-package",
      importedProjectId: "lineage-1",
      importedPackageId: "b".repeat(64),
    })).rejects.toThrow("project_catalog_conflict")

    const copy = await store.register({
      localProjectId: "copy-1",
      forkedFromProjectId: "lineage-1",
      rootPath: value.projectB,
      displayName: "独立副本",
      source: "imported-package",
      importedProjectId: "lineage-1",
      importedPackageId: "b".repeat(64),
    })
    expect(copy.entry).toMatchObject({ localProjectId: "copy-1", forkedFromProjectId: "lineage-1" })
    expect(store.inspectImport("lineage-1", "b".repeat(64))).toEqual({ kind: "existing", entry: copy.entry })
  })

  test("persists missing status across restart and removes a listing without deleting its directory", async () => {
    const value = await setup()
    const store = new ProjectCatalogStore(value.userData)
    await store.register({
      localProjectId: "local-a",
      rootPath: value.projectA,
      displayName: "本地 A",
      source: "opened-folder",
    })
    await store.register({
      localProjectId: "local-b",
      rootPath: value.projectB,
      displayName: "本地 B",
      source: "opened-folder",
    })
    await rm(value.projectA, { recursive: true })

    expect((await store.list()).find((entry) => entry.localProjectId === "local-a")?.availability).toBe("missing")
    expect((await new ProjectCatalogStore(value.userData).list()).find((entry) => entry.localProjectId === "local-a")?.availability).toBe("missing")
    expect(await store.remove("local-b")).toBe(true)
    await access(value.projectB)
    expect((await store.list()).map((entry) => entry.localProjectId)).toEqual(["local-a"])
  })

  test("fails closed for damaged storage and conflicting local identity or path", async () => {
    const value = await setup()
    const store = new ProjectCatalogStore(value.userData)
    await store.register({ localProjectId: "local-a", rootPath: value.projectA, displayName: "A", source: "opened-folder" })
    await expect(store.register({ localProjectId: "local-a", rootPath: value.projectB, displayName: "B", source: "opened-folder" })).rejects.toThrow("project_catalog_conflict")
    await expect(store.register({ localProjectId: "local-b", rootPath: value.projectA, displayName: "B", source: "opened-folder" })).rejects.toThrow("project_catalog_conflict")

    await writeFile(join(value.userData, "creatx", "projects.v1.json"), JSON.stringify({ schemaVersion: 1, entries: [{ forged: true }] }), "utf8")
    expect(() => new ProjectCatalogStore(value.userData)).toThrow("project_catalog_persistence")
  })

  test("serializes concurrent registrations without dropping entries", async () => {
    const value = await setup()
    const projectC = join(value.root, "project-c")
    await mkdir(projectC)
    const store = new ProjectCatalogStore(value.userData)
    const results = await Promise.all([
      store.register({ localProjectId: "local-a", rootPath: value.projectA, displayName: "A", source: "opened-folder" }),
      store.register({ localProjectId: "local-b", rootPath: value.projectB, displayName: "B", source: "opened-folder" }),
      store.register({ localProjectId: "local-c", rootPath: projectC, displayName: "C", source: "opened-folder" }),
    ])

    expect(results.every((result) => result.status === "registered")).toBe(true)
    expect((await new ProjectCatalogStore(value.userData).list()).map((entry) => entry.localProjectId)).toEqual(["local-a", "local-b", "local-c"])
    const stored = await readFile(join(value.userData, "creatx", "projects.v1.json"), "utf8")
    expect(stored).not.toContain("overview")
    expect(stored).not.toContain("conversation")
  })
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "noven-project-catalog-"))
  roots.push(root)
  const userData = join(root, "profile")
  const projectA = join(root, "project-a")
  const projectB = join(root, "project-b")
  await mkdir(userData)
  await mkdir(projectA)
  await mkdir(projectB)
  return { root, userData, projectA, projectB }
}
