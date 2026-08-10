import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const allowed = resolve(root, "packages", "cline-adapter")
const violations: string[] = []

for await (const relativePath of new Bun.Glob("{apps,packages,scripts}/**/*.{ts,tsx}").scan({ cwd: root })) {
  const path = resolve(root, relativePath)
  if (path.startsWith(allowed)) continue
  const source = await Bun.file(path).text()
  if (/from\s+["']@cline\//.test(source) || /import\s*\(["']@cline\//.test(source)) violations.push(relativePath)
}

if (violations.length) {
  console.error(`Only packages/cline-adapter may import Cline packages:\n${violations.join("\n")}`)
  process.exit(1)
}

console.log("Cline import boundary: PASS")
