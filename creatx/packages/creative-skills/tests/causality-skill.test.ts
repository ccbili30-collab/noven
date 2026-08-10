import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { CAUSALITY_SKILL_NAME, installBuiltinCreativeSkills } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("built-in Causality Skill", () => {
  test("builds an offline viewer from only explicit causal relations", async () => {
    const root = await mkdtemp(join(tmpdir(), "noven-causality-"))
    roots.push(root)
    const appData = join(root, "app-data")
    const projectRoot = join(root, "project")
    const goalRoot = join(projectRoot, ".creatx", "growth", "goals", "goal_world", "world", "materialization")
    await mkdir(goalRoot, { recursive: true })
    await mkdir(join(projectRoot, "worlds", "测试世界", "核心规则与边界"), { recursive: true })
    await mkdir(join(projectRoot, "worlds", "测试世界", "当前局势与核心冲突"), { recursive: true })
    await writeFile(join(projectRoot, "worlds", "测试世界", "核心规则与边界", "潮汐法则.md"), "# 潮汐法则\n", "utf8")
    await writeFile(join(projectRoot, "worlds", "测试世界", "当前局势与核心冲突", "断航危机.md"), "# 断航危机\n", "utf8")
    await writeFile(join(goalRoot, "relations.json"), `${JSON.stringify({
      schemaVersion: 1,
      nodes: [
        { id: "rule", title: "潮汐法则", layer: "作品", path: "worlds/测试世界/核心规则与边界/潮汐法则.md" },
        { id: "crisis", title: "断航危机", layer: "作品", path: "worlds/测试世界/当前局势与核心冲突/断航危机.md" },
      ],
      relations: [
        { from: "rule", to: "crisis", type: "causes", reason: "潮汐变化使航道周期性封闭，直接引发断航危机。" },
        { from: "crisis", to: "rule", type: "references", reason: "危机记录引用潮汐法则。" },
      ],
    }, undefined, 2)}\n`, "utf8")

    const installed = await installBuiltinCreativeSkills(appData)
    const skillRoot = join(installed.skillDirectories[0]!, CAUSALITY_SKILL_NAME)
    const outputRoot = join(projectRoot, "worlds", "测试世界", "世界因果图")
    const child = Bun.spawn([process.execPath, join(skillRoot, "scripts", "build-causality.mjs"), "--project-root", projectRoot], { stdout: "pipe", stderr: "pipe" })
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])

    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" })
    const summary = JSON.parse(stdout)
    expect(summary).toMatchObject({ prototype: false, requiresNetwork: false, counts: { workRelations: 1, factRelations: 0 } })
    expect(summary.outputRoot).toBe(outputRoot.replaceAll("\\", "/"))
    expect(await readFile(join(summary.outputRoot, "index.html"), "utf8")).toContain("全世界因果链")
    expect(await readFile(join(summary.outputRoot, "graph-data.js"), "utf8")).toContain('"type":"causes"')
    expect(await readFile(join(summary.outputRoot, "graph-data.js"), "utf8")).not.toContain('"type":"references"')

    const escaped = Bun.spawn([process.execPath, join(skillRoot, "scripts", "build-causality.mjs"), "--project-root", projectRoot, "--output", join(root, "escaped")], { stdout: "pipe", stderr: "pipe" })
    const [escapedExitCode, escapedStderr] = await Promise.all([escaped.exited, new Response(escaped.stderr).text()])
    expect(escapedExitCode).not.toBe(0)
    expect(escapedStderr).toContain("OUTPUT_UNSAFE")

    const linkedOutput = join(projectRoot, "worlds", "测试世界", "链接输出")
    const linkedTarget = join(root, "escaped-output")
    await mkdir(linkedTarget)
    await symlink(linkedTarget, linkedOutput, "junction")
    const linked = Bun.spawn([process.execPath, join(skillRoot, "scripts", "build-causality.mjs"), "--project-root", projectRoot, "--output", "worlds/测试世界/链接输出"], { stdout: "pipe", stderr: "pipe" })
    const [linkedExitCode, linkedStderr] = await Promise.all([linked.exited, new Response(linked.stderr).text()])
    expect(linkedExitCode).not.toBe(0)
    expect(linkedStderr).toContain("OUTPUT_UNSAFE")
  })

  test("fails closed when the selected world has no explicit causal relation", async () => {
    const root = await mkdtemp(join(tmpdir(), "noven-causality-empty-"))
    roots.push(root)
    const appData = join(root, "app-data")
    const projectRoot = join(root, "project")
    const goalRoot = join(projectRoot, ".creatx", "growth", "goals", "goal_world", "world", "materialization")
    await mkdir(goalRoot, { recursive: true })
    await writeFile(join(goalRoot, "relations.json"), `${JSON.stringify({ schemaVersion: 1, nodes: [{ id: "a", path: "worlds/空世界/核心规则与边界/A.md" }, { id: "b", path: "worlds/空世界/核心规则与边界/B.md" }], relations: [{ from: "a", to: "b", type: "references" }] })}\n`, "utf8")
    const installed = await installBuiltinCreativeSkills(appData)
    const child = Bun.spawn([process.execPath, join(installed.skillDirectories[0]!, CAUSALITY_SKILL_NAME, "scripts", "build-causality.mjs"), "--project-root", projectRoot], { stdout: "pipe", stderr: "pipe" })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain("NO_CAUSALITY")
  })
})
