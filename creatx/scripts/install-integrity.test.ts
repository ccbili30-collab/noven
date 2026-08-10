import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspectBunStorePackage, inspectInstalledFile, inspectInstalledPackage, inspectInstalledPackageVariants } from "./install-integrity"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("installed package integrity", () => {
  test("accepts a complete package from a Bun hoisted install", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@sap-ai-sdk", "foundation-models")
    await mkdir(join(packageRoot, "dist"), { recursive: true })
    await Bun.write(join(packageRoot, "package.json"), JSON.stringify({ name: "@sap-ai-sdk/foundation-models", version: "2.13.0" }))
    await Bun.write(join(packageRoot, "dist", "index.js"), "export const ready = true")

    expect(await inspectInstalledPackageVariants(root, {
      name: "@sap-ai-sdk/foundation-models",
      version: "2.13.0",
      requiredFiles: ["dist/index.js"],
    })).toEqual([{ name: "@sap-ai-sdk/foundation-models", version: "2.13.0", path: packageRoot }])
  })

  test("checks every matching Bun store package variant", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const first = join(root, "node_modules", ".bun", "@sap-ai-sdk+foundation-models@2.13.0+first", "node_modules", "@sap-ai-sdk", "foundation-models")
    const second = join(root, "node_modules", ".bun", "@sap-ai-sdk+foundation-models@2.13.0+second", "node_modules", "@sap-ai-sdk", "foundation-models")
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    await Bun.write(join(first, "package.json"), JSON.stringify({ name: "@sap-ai-sdk/foundation-models", version: "2.13.0" }))

    expect(inspectBunStorePackage(root, { name: "@sap-ai-sdk/foundation-models", version: "2.13.0" }))
      .rejects.toThrow("install_integrity_empty: @sap-ai-sdk/foundation-models@2.13.0 resolves to an empty package directory")
  })

  test("classifies a missing installed command shim", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)

    expect(inspectInstalledFile(root, "node_modules/.bin/vite", "vite Windows shim"))
      .rejects.toThrow("install_integrity_missing: vite Windows shim is missing at node_modules/.bin/vite")
  })

  test("classifies a missing package before source verification starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65" }))
      .rejects.toThrow("install_integrity_missing: @cline/sdk@0.0.65 is not installed")
  })

  test("classifies an empty installed package directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    await mkdir(join(root, "node_modules", "@cline", "sdk"), { recursive: true })

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65" }))
      .rejects.toThrow("install_integrity_empty: @cline/sdk@0.0.65 resolves to an empty package directory")
  })

  test("requires an installed package manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(packageRoot, { recursive: true })
    await Bun.write(join(packageRoot, "README.md"), "incomplete package")

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65" }))
      .rejects.toThrow("install_integrity_manifest: @cline/sdk@0.0.65 has no readable package.json")
  })

  test("classifies an invalid package manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(packageRoot, { recursive: true })
    await Bun.write(join(packageRoot, "package.json"), "not-json")

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65" }))
      .rejects.toThrow("install_integrity_manifest: @cline/sdk@0.0.65 has an unreadable package.json")
  })

  test("rejects an installed package with the wrong version", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(packageRoot, { recursive: true })
    await Bun.write(join(packageRoot, "package.json"), JSON.stringify({ name: "@cline/sdk", version: "0.0.64" }))

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65" }))
      .rejects.toThrow("install_integrity_version: expected @cline/sdk@0.0.65, received @cline/sdk@0.0.64")
  })

  test("requires package entry files used by the application", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(packageRoot, { recursive: true })
    await Bun.write(join(packageRoot, "package.json"), JSON.stringify({ name: "@cline/sdk", version: "0.0.65" }))

    expect(inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65", requiredFiles: ["dist/index.js"] }))
      .rejects.toThrow("install_integrity_manifest: @cline/sdk@0.0.65 is missing required file dist/index.js")
  })

  test("returns the resolved package target after validating its files", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const target = join(root, "store", "@cline", "sdk")
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(join(target, "dist"), { recursive: true })
    await mkdir(join(root, "node_modules", "@cline"), { recursive: true })
    await Bun.write(join(target, "package.json"), JSON.stringify({ name: "@cline/sdk", version: "0.0.65" }))
    await Bun.write(join(target, "dist", "index.js"), "export const ready = true")
    await symlink(target, packageRoot, "junction")

    expect(await inspectInstalledPackage(root, { name: "@cline/sdk", version: "0.0.65", requiredFiles: ["dist/index.js"] }))
      .toEqual({ name: "@cline/sdk", version: "0.0.65", path: target })
  })

  test("classifies a missing transitive package as a dependency failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const packageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(packageRoot, { recursive: true })
    await Bun.write(join(packageRoot, "package.json"), JSON.stringify({ name: "@cline/sdk", version: "0.0.65" }))

    expect(inspectInstalledPackage(root, {
      name: "@cline/sdk",
      version: "0.0.65",
      requiredPackages: [{ name: "@cline/core", version: "0.0.65" }],
    })).rejects.toThrow("install_integrity_dependency: @cline/sdk@0.0.65 requires @cline/core@0.0.65")
  })

  test("resolves a transitive package from the parent Bun isolated install", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatx-install-integrity-"))
    roots.push(root)
    const isolatedNodeModules = join(root, "node_modules", ".bun", "@cline+sdk@0.0.65+fixture", "node_modules")
    const sdkTarget = join(isolatedNodeModules, "@cline", "sdk")
    const coreTarget = join(isolatedNodeModules, "@cline", "core")
    const sdkPackageRoot = join(root, "node_modules", "@cline", "sdk")
    await mkdir(sdkTarget, { recursive: true })
    await mkdir(coreTarget, { recursive: true })
    await mkdir(join(root, "node_modules", "@cline"), { recursive: true })
    await Bun.write(join(sdkTarget, "package.json"), JSON.stringify({ name: "@cline/sdk", version: "0.0.65" }))
    await Bun.write(join(coreTarget, "package.json"), JSON.stringify({ name: "@cline/core", version: "0.0.65" }))
    await symlink(sdkTarget, sdkPackageRoot, "junction")

    expect(await inspectInstalledPackage(root, {
      name: "@cline/sdk",
      version: "0.0.65",
      requiredPackages: [{ name: "@cline/core", version: "0.0.65" }],
    })).toEqual({ name: "@cline/sdk", version: "0.0.65", path: sdkTarget })
  })
})
