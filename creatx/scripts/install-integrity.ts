import { lstat, readdir, realpath } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

export interface InstalledPackageExpectation {
  name: string
  version: string
  requiredFiles?: readonly string[]
  requiredPackages?: readonly InstalledPackageExpectation[]
}

export async function inspectInstalledPackageVariants(root: string, expectation: InstalledPackageExpectation) {
  const packageRoot = join(root, "node_modules", ...expectation.name.split("/"))
  if (await pathExists(packageRoot)) return [await inspectInstalledPackage(root, expectation)]
  return inspectBunStorePackage(root, expectation)
}

export async function inspectBunStorePackage(root: string, expectation: InstalledPackageExpectation) {
  const storeRoot = join(root, "node_modules", ".bun")
  if (!(await pathExists(storeRoot))) {
    throw new Error(`install_integrity_missing: ${expectation.name}@${expectation.version} has no Bun store package`)
  }
  const prefix = `${expectation.name.replaceAll("/", "+")}@${expectation.version}`
  const variants = (await readdir(storeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
  if (!variants.length) {
    throw new Error(`install_integrity_missing: ${expectation.name}@${expectation.version} has no Bun store package`)
  }
  return Promise.all(variants.map((entry) => inspectPackageRoot(
    root,
    join(storeRoot, entry.name, "node_modules", ...expectation.name.split("/")),
    expectation,
  )))
}

export async function inspectInstalledFile(root: string, relativePath: string, label: string) {
  const path = resolve(root, relativePath)
  if (!(await Bun.file(path).exists())) {
    throw new Error(`install_integrity_missing: ${label} is missing at ${relativePath}`)
  }
  return { label, path: await realpath(path) }
}

export async function inspectInstalledPackage(root: string, expectation: InstalledPackageExpectation) {
  return inspectPackageRoot(root, join(root, "node_modules", ...expectation.name.split("/")), expectation)
}

async function inspectPackageRoot(root: string, packageRoot: string, expectation: InstalledPackageExpectation) {
  const installed = await lstat(packageRoot).then(
    () => true,
    (error: unknown) => {
      if (isFileNotFound(error)) return false
      throw error
    },
  )
  if (!installed) throw new Error(`install_integrity_missing: ${expectation.name}@${expectation.version} is not installed`)
  const resolvedPackageRoot = await realpath(packageRoot)
  if (!(await readdir(resolvedPackageRoot)).length) {
    throw new Error(`install_integrity_empty: ${expectation.name}@${expectation.version} resolves to an empty package directory`)
  }
  const manifestFile = Bun.file(join(resolvedPackageRoot, "package.json"))
  if (!(await manifestFile.exists())) {
    throw new Error(`install_integrity_manifest: ${expectation.name}@${expectation.version} has no readable package.json`)
  }
  const manifest = await manifestFile.json().catch((error: unknown) => {
    throw new Error(`install_integrity_manifest: ${expectation.name}@${expectation.version} has an unreadable package.json`, { cause: error })
  }) as { name?: unknown; version?: unknown }
  if (manifest.name !== expectation.name || manifest.version !== expectation.version) {
    const installedName = typeof manifest.name === "string" ? manifest.name : "missing-name"
    const installedVersion = typeof manifest.version === "string" ? manifest.version : "missing-version"
    throw new Error(`install_integrity_version: expected ${expectation.name}@${expectation.version}, received ${installedName}@${installedVersion}`)
  }
  const missingRequiredFile = (await Promise.all((expectation.requiredFiles ?? []).map(async (relativePath) => ({
    relativePath,
    exists: await Bun.file(join(resolvedPackageRoot, relativePath)).exists(),
  })))).find((file) => !file.exists)
  if (missingRequiredFile) {
    throw new Error(`install_integrity_manifest: ${expectation.name}@${expectation.version} is missing required file ${missingRequiredFile.relativePath}`)
  }
  await Promise.all((expectation.requiredPackages ?? []).map(async (requiredPackage) => {
    await inspectPackageRoot(root, await findRequiredPackageRoot(root, resolvedPackageRoot, requiredPackage.name), requiredPackage).catch((error: unknown) => {
      throw new Error(`install_integrity_dependency: ${expectation.name}@${expectation.version} requires ${requiredPackage.name}@${requiredPackage.version} (${messageOf(error)})`, { cause: error })
    })
  }))
  return { name: expectation.name, version: expectation.version, path: resolvedPackageRoot }
}

async function findRequiredPackageRoot(root: string, parentPackageRoot: string, packageName: string) {
  const boundary = resolve(root)
  const packageSegments = packageName.split("/")
  const candidates = dependencySearchPaths(boundary, dirname(parentPackageRoot), packageSegments)
  return await firstExistingPath(candidates) ?? join(root, "node_modules", ...packageSegments)
}

function dependencySearchPaths(boundary: string, current: string, packageSegments: readonly string[]): string[] {
  if (current !== boundary && !current.startsWith(`${boundary}${sep}`)) return []
  const candidate = join(current, "node_modules", ...packageSegments)
  if (current === boundary) return [candidate]
  return [candidate, ...dependencySearchPaths(boundary, dirname(current), packageSegments)]
}

async function firstExistingPath(paths: readonly string[]) {
  const results = await Promise.all(paths.map(async (path) => ({ path, exists: await pathExists(path) })))
  return results.find((result) => result.exists)?.path
}

async function pathExists(path: string) {
  return lstat(path).then(
    () => true,
    (error: unknown) => {
      if (isFileNotFound(error)) return false
      throw error
    },
  )
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
