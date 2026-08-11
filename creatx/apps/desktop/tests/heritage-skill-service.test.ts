import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { HeritageSkillService, composeHeritageSkillRuntime, parseTedTranscriptPage } from "../src/heritage-skill-service"

const roots: string[] = []
const sourceUrl = "https://www.ted.com/talks/kate_messner_how_to_build_a_fictional_world"
const transcriptUrl = `${sourceUrl}?view=transcript`
const validSkill = `---
name: build-consistent-worlds
description: Build a fictional world with consistent physical and social rules. Use when creating or checking a setting for fiction.
---

# Build consistent worlds

1. Fix the place and time.
2. Define physical and social rules.
3. Trace history, power, belief and daily life.
4. Test how the world shapes characters and conflict.

Stop when source evidence does not support a claimed rule.

Source: ${sourceUrl}
`

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("HeritageSkillService", () => {
  test("extracts ordered TED transcript cues from NEXT_DATA", () => {
    expect(parseTedTranscriptPage(tedPage([
      { text: "Start with a place and time.", time: 1000 },
      { text: "Define consistent rules.\nThen test daily life.", time: 3000 },
    ]), transcriptUrl)).toEqual({
      sourceUrl,
      transcriptUrl,
      title: "How to build a fictional world",
      author: "Kate Messner",
      language: "en",
      cueCount: 2,
      transcript: "[00:01] Start with a place and time.\n[00:03] Define consistent rules. Then test daily life.",
    })
  })

  test("fails closed for unsupported hosts and empty transcripts", () => {
    expect(() => parseTedTranscriptPage(tedPage([]), transcriptUrl)).toThrow("heritage_skill_transcript")
    expect(() => parseTedTranscriptPage('<script id="__NEXT_DATA__" type="application/json">{invalid}</script>', transcriptUrl)).toThrow("heritage_skill_transcript")
    expect(() => parseTedTranscriptPage(tedPage([{ text: "method", time: 0 }]), "https://example.com/transcript")).toThrow("heritage_skill_network")
  })

  test("reads a bounded transcript through an automatic tool", async () => {
    const root = await testRoot()
    const service = new HeritageSkillService({
      root,
      fetch: async () => new Response(tedPage([{ text: "A real method.", time: 0 }]), { headers: { "content-type": "text/html; charset=utf-8" } }),
    })
    const tool = service.tools().find((item) => item.name === "read_heritage_video_transcript")!

    expect(tool.approval).toBe("automatic")
    expect(await tool.execute({ transcriptUrl }, { sessionId: "session-1" })).toMatchObject({ ok: true, value: { cueCount: 1, transcript: "[00:00] A real method." } })
    await service.dispose()
  })

  test("installs one approved single-file Skill idempotently without overwriting a conflict", async () => {
    const root = await testRoot()
    const service = new HeritageSkillService({ root, fetch: async () => new Response(tedPage([{ text: "A real method.", time: 0 }]), { headers: { "content-type": "text/html" } }) })
    const read = service.tools().find((item) => item.name === "read_heritage_video_transcript")!
    const tool = service.tools().find((item) => item.name === "install_heritage_skill")!
    const input = { name: "build-consistent-worlds", description: "Build a fictional world with consistent physical and social rules. Use when creating or checking a setting for fiction.", sourceUrl, skillMarkdown: validSkill }

    expect(tool.approval).toBe("required")
    expect(await tool.execute(input, { sessionId: "session-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    expect(await read.execute({ transcriptUrl }, { sessionId: "session-1" })).toMatchObject({ ok: true })
    expect(await tool.execute(input, { sessionId: "session-2" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    expect(await tool.execute(input, { sessionId: "session-1" })).toMatchObject({ ok: true, value: { status: "installed", restartRequired: true } })
    expect(await tool.execute(input, { sessionId: "session-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    expect(await readFile(join(root, "build-consistent-worlds", "SKILL.md"), "utf8")).toBe(validSkill.replaceAll("\r\n", "\n"))
    expect(await read.execute({ transcriptUrl }, { sessionId: "session-1" })).toMatchObject({ ok: true })
    expect(await tool.execute(input, { sessionId: "session-1" })).toMatchObject({ ok: true, value: { status: "already-installed" } })
    expect(await read.execute({ transcriptUrl }, { sessionId: "session-1" })).toMatchObject({ ok: true })
    expect(await tool.execute({ ...input, skillMarkdown: validSkill.replace("Fix the place", "Choose the place") }, { sessionId: "session-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_conflict" } })
    await service.dispose()
  })

  test("rejects malformed names, frontmatter and missing source before writing", async () => {
    const root = await testRoot()
    const service = new HeritageSkillService({ root, fetch: async () => new Response(tedPage([{ text: "A real method.", time: 0 }]), { headers: { "content-type": "text/html" } }) })
    const read = service.tools().find((item) => item.name === "read_heritage_video_transcript")!
    const tool = service.tools().find((item) => item.name === "install_heritage_skill")!
    const invalid = [
      { name: "../escape", skillMarkdown: validSkill },
      { name: "build-consistent-worlds", skillMarkdown: validSkill.replace("name: build-consistent-worlds", "name: another-name") },
      { name: "build-consistent-worlds", skillMarkdown: validSkill.replace("description: Build", "name: duplicate-name\ndescription: Build") },
      { name: "build-consistent-worlds", skillMarkdown: validSkill.replace(`Source: ${sourceUrl}`, "Source: unavailable") },
    ]
    expect(await read.execute({ transcriptUrl }, { sessionId: "session-1" })).toMatchObject({ ok: true })
    for (const value of invalid) {
      expect(await tool.execute({ description: "Build a fictional world with consistent physical and social rules. Use when creating or checking a setting for fiction.", sourceUrl, ...value }, { sessionId: "session-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    }
    expect(await service.installed()).toEqual({ skillDirectories: [], skills: [] })
    await service.dispose()
  })

  test("discovers only valid installed folders and composes them after built-ins", async () => {
    const root = await testRoot()
    await mkdir(join(root, "build-consistent-worlds"), { recursive: true })
    await writeFile(join(root, "build-consistent-worlds", "SKILL.md"), validSkill, "utf8")
    await mkdir(join(root, "broken-skill"), { recursive: true })
    await writeFile(join(root, "broken-skill", "SKILL.md"), "broken", "utf8")
    const linked = join(root, "linked-skill")
    await symlink(join(root, "build-consistent-worlds"), linked, "junction")
    const service = new HeritageSkillService({ root })

    expect(await service.installed()).toEqual({ skillDirectories: [root], skills: ["build-consistent-worlds"] })
    expect(composeHeritageSkillRuntime({ skillDirectories: ["builtins"], skills: ["creatx-study"] }, await service.installed())).toEqual({
      skillDirectories: ["builtins", root],
      skills: ["creatx-study", "build-consistent-worlds"],
    })
    await service.dispose()
  })

  test("fails closed for oversized, redirected and cancelled transcript responses", async () => {
    const oversized = new HeritageSkillService({
      root: await testRoot(),
      fetch: async () => new Response("x".repeat(1_000_001), { headers: { "content-type": "text/html" } }),
    })
    const oversizedTool = oversized.tools().find((item) => item.name === "read_heritage_video_transcript")!
    expect(await oversizedTool.execute({ transcriptUrl }, { sessionId: "oversized" })).toMatchObject({ ok: false, error: { code: "heritage_skill_network" } })
    await oversized.dispose()

    const redirected = new HeritageSkillService({ root: await testRoot(), fetch: async () => new Response(null, { status: 302 }) })
    const redirectedTool = redirected.tools().find((item) => item.name === "read_heritage_video_transcript")!
    expect(await redirectedTool.execute({ transcriptUrl }, { sessionId: "redirected" })).toMatchObject({ ok: false, error: { code: "heritage_skill_network" } })
    await redirected.dispose()

    const cancelled = new HeritageSkillService({
      root: await testRoot(),
      fetch: async (_url, init) => await new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })),
    })
    const cancelledTool = cancelled.tools().find((item) => item.name === "read_heritage_video_transcript")!
    const controller = new AbortController()
    const pending = cancelledTool.execute({ transcriptUrl }, { sessionId: "cancelled", signal: controller.signal })
    controller.abort(new Error("user cancelled"))
    expect(await pending).toMatchObject({ ok: false, error: { code: "heritage_skill_network" } })
    await cancelled.dispose()
  })

  test("installs a 抖音-derived Skill only after a real analysis minted a receipt for that exact source", async () => {
    const root = await testRoot()
    const service = new HeritageSkillService({ root, fetch: async () => new Response("", { status: 404 }) })
    const tool = service.tools().find((item) => item.name === "install_heritage_skill")!
    const douyinSource = "https://www.douyin.com/video/7412345678901234567"
    const douyinSkill = validSkill.replace(`Source: ${sourceUrl}`, `Source: ${douyinSource}`)
    const input = { name: "build-consistent-worlds", description: "Build a fictional world with consistent physical and social rules. Use when creating or checking a setting for fiction.", sourceUrl: douyinSource, skillMarkdown: douyinSkill }

    // Knowing the URL is not enough — without a receipt the install must still be refused.
    expect(await tool.execute(input, { sessionId: "douyin-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })

    // A receipt for a different video must not unlock this one.
    service.recordSourceRead("douyin-1", "https://www.douyin.com/video/7000000000000000001")
    expect(await tool.execute(input, { sessionId: "douyin-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })

    service.recordSourceRead("douyin-1", douyinSource)
    expect(await tool.execute(input, { sessionId: "douyin-1" })).toMatchObject({ ok: true, value: { status: "installed", restartRequired: true } })
    expect(await readFile(join(root, "build-consistent-worlds", "SKILL.md"), "utf8")).toContain(`Source: ${douyinSource}`)

    // The receipt is single-use, exactly as it already was for TED.
    expect(await tool.execute(input, { sessionId: "douyin-1" })).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    await service.dispose()
  })

  test("rejects source URLs outside the two canonical shapes", async () => {
    const service = new HeritageSkillService({ root: await testRoot(), fetch: async () => new Response("", { status: 404 }) })
    const tool = service.tools().find((item) => item.name === "install_heritage_skill")!
    const attempt = async (url: string) => {
      service.recordSourceRead("s", sourceUrl)
      return await tool.execute({ name: "x-skill", description: "A description long enough to pass the twenty character minimum check.", sourceUrl: url, skillMarkdown: validSkill }, { sessionId: "s" })
    }

    expect(() => service.recordSourceRead("s", "https://www.bilibili.com/video/BV1xx")).toThrow("heritage_skill_invalid")
    expect(() => service.recordSourceRead("s", "https://www.douyin.com/video/7412345678901234567?from=share")).toThrow("heritage_skill_invalid")
    expect(() => service.recordSourceRead("s", "http://www.douyin.com/video/7412345678901234567")).toThrow("heritage_skill_invalid")
    expect(await attempt("https://evil.example.com/video/7412345678901234567")).toMatchObject({ ok: false, error: { code: "heritage_skill_invalid" } })
    await service.dispose()
  })
})

async function testRoot() {
  const base = await mkdtemp(join(tmpdir(), "creatx-heritage-skills-"))
  roots.push(base)
  return join(base, "learned-skills", "v1")
}

function tedPage(cues: Array<{ text: string; time: number }>) {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { videoData: { title: "How to build a fictional world", presenterDisplayName: "Kate Messner", canonicalUrl: sourceUrl }, transcriptData: { translation: { language: { internalLanguageCode: "en" }, paragraphs: [{ cues: cues.map((cue) => ({ __typename: "Cue", ...cue })) }] } } } },
  })}</script></body></html>`
}
