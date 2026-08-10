import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolvePreloadPath } from "../src/preload-path.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("production preload path", () => {
  test("selects the single content-addressed bridge and ignores the old stable name", async () => {
    const root = await createOutput()
    await writeFile(join(root, "preload", "preload.cjs"), "stale bridge", "utf8")
    await writeFile(join(root, "preload", "preload-Ab12_cd.cjs"), "current bridge", "utf8")
    expect(resolvePreloadPath(join(root, "main"))).toBe(join(root, "preload", "preload-Ab12_cd.cjs"))
  })

  test("fails closed when the build contains no bridge or competing bridges", async () => {
    const root = await createOutput()
    expect(() => resolvePreloadPath(join(root, "main"))).toThrow("found 0")
    await writeFile(join(root, "preload", "preload-one.cjs"), "one", "utf8")
    await writeFile(join(root, "preload", "preload-two.cjs"), "two", "utf8")
    expect(() => resolvePreloadPath(join(root, "main"))).toThrow("found 2")
  })
})

test("preload keeps the deferred project package workflow out of the desktop surface", async () => {
  const source = await Bun.file(join(import.meta.dir, "../src/preload.ts")).text()
  expect(source).not.toContain("ProjectPackage")
  expect(source).not.toContain("projectPackage")

  const main = await Bun.file(join(import.meta.dir, "../src/main.ts")).text()
  const rootPackage = await Bun.file(join(import.meta.dir, "../../../package.json")).json()
  const desktopPackage = await Bun.file(join(import.meta.dir, "../package.json")).json()
  expect(main).not.toContain("project-package-runtime")
  expect(main).not.toContain("ProjectPackageDesktopService")
  expect(rootPackage.dependencies["@creatx/project-package-runtime"]).toBeUndefined()
  expect(desktopPackage.dependencies["@creatx/project-package-runtime"]).toBeUndefined()
})

async function createOutput() {
  const root = await mkdtemp(join(tmpdir(), "creatx-preload-path-"))
  temporaryDirectories.push(root)
  await mkdir(join(root, "main"))
  await mkdir(join(root, "preload"))
  return root
}
