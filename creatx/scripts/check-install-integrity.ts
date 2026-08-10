import { resolve } from "node:path"
import { inspectInstalledFile, inspectInstalledPackage, inspectInstalledPackageVariants } from "./install-integrity"

const root = resolve(import.meta.dir, "..")
const checks = [
  {
    label: "@cline/sdk@0.0.65",
    execute: () => inspectInstalledPackage(root, {
      name: "@cline/sdk",
      version: "0.0.65",
      requiredFiles: ["dist/index.js", "dist/index.d.ts"],
      requiredPackages: [{
        name: "@cline/core",
        version: "0.0.65",
        requiredFiles: ["dist/index.js", "dist/index.d.ts"],
        requiredPackages: [{
          name: "@cline/llms",
          version: "0.0.65",
          requiredFiles: ["dist/index.js", "dist/providers.js"],
        }],
      }],
    }),
  },
  {
    label: "@sap-ai-sdk/foundation-models@2.13.0",
    execute: () => inspectInstalledPackageVariants(root, {
      name: "@sap-ai-sdk/foundation-models",
      version: "2.13.0",
      requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    }),
  },
  {
    label: "@sap-ai-sdk/orchestration@2.13.0",
    execute: () => inspectInstalledPackageVariants(root, {
      name: "@sap-ai-sdk/orchestration",
      version: "2.13.0",
      requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    }),
  },
  {
    label: "vite@7.2.4",
    execute: () => inspectInstalledPackage(root, {
      name: "vite",
      version: "7.2.4",
      requiredFiles: ["bin/vite.js", "dist/node/index.js"],
    }),
  },
  {
    label: "vite Windows shim",
    execute: () => inspectInstalledFile(root, "node_modules/.bin/vite.exe", "vite Windows shim"),
  },
]

const results = await Promise.allSettled(checks.map((check) => check.execute()))
results.forEach((result, index) => {
  if (result.status === "fulfilled") {
    console.log(`Install integrity PASS: ${checks[index]!.label}`)
    return
  }
  console.error(`Install integrity FAIL: ${checks[index]!.label}: ${messageOf(result.reason)}`)
})

if (results.some((result) => result.status === "rejected")) process.exitCode = 1

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
