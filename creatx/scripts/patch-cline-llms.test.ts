import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("patches a hoisted Cline install without a Bun isolated store", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-patch-cline-"))
  roots.push(root)
  const packageRoot = join(root, "node_modules", "@cline", "llms")
  await mkdir(join(root, "scripts"), { recursive: true })
  await mkdir(join(packageRoot, "dist"), { recursive: true })
  await Bun.write(join(root, "scripts", "patch-cline-llms.ts"), Bun.file(join(import.meta.dir, "patch-cline-llms.ts")))
  await Bun.write(join(packageRoot, "package.json"), JSON.stringify({ name: "@cline/llms", version: "0.0.65" }))
  const patchedSource = [
    "for(let i of[...Object.keys(e),...Object.getOwnPropertyNames(Object.getPrototypeOf(e)??{})])try{n(r[i])}catch{}",
    "if(d)m=l,v=c;else{let p=e.usage;if(p)try{m=await p}catch(g){if(!d)d=i?.current??vt(g);m=l,v=c}else m=l,v=c}",
  ].join("\n")
  await Bun.write(join(packageRoot, "dist", "index.js"), patchedSource)
  await Bun.write(join(packageRoot, "dist", "providers.js"), patchedSource)

  const child = Bun.spawn(["bun", "run", "scripts/patch-cline-llms.ts"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stderr = await new Response(child.stderr).text()

  expect({ exitCode: await child.exited, stderr }).toEqual({ exitCode: 0, stderr: "" })
})
