import { readdirSync } from "node:fs"
import { join } from "node:path"

export function resolvePreloadPath(mainDirectory: string) {
  const directory = join(mainDirectory, "../preload")
  const candidates = readdirSync(directory).filter((name) => /^preload-[A-Za-z0-9_-]+\.cjs$/u.test(name))
  if (candidates.length !== 1) throw new Error(`desktop_preload_invalid: expected one content-addressed preload, found ${candidates.length}`)
  return join(directory, candidates[0]!)
}
