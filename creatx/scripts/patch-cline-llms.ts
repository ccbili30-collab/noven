import { dirname, join } from "node:path"
import { readdir } from "node:fs/promises"

const nodeModules = join(import.meta.dir, "..", "node_modules")
const manifests = [join(nodeModules, "@cline", "llms", "package.json")]
const isolatedPackages = (await readdir(join(nodeModules, ".bun"), { withFileTypes: true }).catch((error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return []
  throw error
}))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("@cline+llms@0.0.65"))
  .map((entry) => join(nodeModules, ".bun", entry.name, "node_modules", "@cline", "llms", "package.json"))
manifests.push(...isolatedPackages)
const installedManifests = (await Promise.all(manifests.map(async (path) => await Bun.file(path).exists() ? path : undefined)))
  .filter((path): path is string => Boolean(path))
const packageRoots = [...new Set(installedManifests.map(dirname))]

if (!packageRoots.length) throw new Error("cline_patch_package_missing: @cline/llms is not installed")

const patches = [
  {
    alternatives: [{
      original: "for(let i of Object.keys(e))try{n(r[i])}catch{}",
      replacement: "for(let i of[...Object.keys(e),...Object.getOwnPropertyNames(Object.getPrototypeOf(e)??{})])try{n(r[i])}catch{}",
    }],
  },
  {
    alternatives: ["vt", "dt"].map((extractError) => ({
      original: `if(d)m=l,v=c;else if(e.usage)try{m=await e.usage}catch(p){if(!d)d=i?.current??${extractError}(p);m=l,v=c}else m=l,v=c;`,
      replacement: `if(d)m=l,v=c;else{let p=e.usage;if(p)try{m=await p}catch(g){if(!d)d=i?.current??${extractError}(g);m=l,v=c}else m=l,v=c}`,
    })),
  },
]

for (const packageRoot of packageRoots) {
  const manifest = await Bun.file(join(packageRoot, "package.json")).json() as { version?: string }
  if (manifest.version !== "0.0.65") {
    throw new Error(`cline_patch_version_mismatch: expected @cline/llms 0.0.65, received ${manifest.version ?? "missing"}`)
  }
  for (const relativePath of ["dist/index.js", "dist/providers.js"]) {
    const path = join(packageRoot, relativePath)
    const source = await Bun.file(path).text()
    const patched = patches.reduce((current, patch) => {
      if (patch.alternatives.some((alternative) => current.includes(alternative.replacement))) return current
      const matches = patch.alternatives.flatMap((alternative) => Array(current.split(alternative.original).length - 1).fill(alternative))
      if (matches.length !== 1) throw new Error(`cline_patch_contract_mismatch: ${path} contains ${matches.length} matches for a cancellation guard`)
      return current.replace(matches[0]!.original, matches[0]!.replacement)
    }, source)
    if (patched !== source) await Bun.write(path, patched)
  }
}
