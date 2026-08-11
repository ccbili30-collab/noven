import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { creatXToolsForWorkerProfile, sessionToolPolicies } from "@creatx/cline-adapter"
import { ProjectFileService, type ProjectFileQueryPort } from "@creatx/project-files"
import { ART_ATLAS_CURATED_SNAPSHOT, ArtLibraryService, createArtLibraryTools, decodeArtCandidate, decodeArtItemMetadata, inspectArtImage, isPublicAddress, materializeBundledArtAtlasSeed, readBundledArtAtlasSeedManifest, requireArtItemMetadata, requireReviewArtApprovalCommand, safeArtDirectoryName, type ArtCandidateRecord, type ArtItemMetadataV1 } from "../src"

function png(width = 512, height = 384) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

const candidate: ArtCandidateRecord = {
  schemaVersion: 1,
  id: "candidate-1",
  batchId: "batch-1",
  query: "巨构艺术",
  collectedAt: "2026-08-08T00:00:00.000Z",
  source: { pageUrl: "https://example.com/work", imageUrl: "https://example.com/work.jpg" },
  image: { fileName: "original.png", mediaType: "image/png", bytes: 24, width: 512, height: 384, sha256: "a".repeat(64) },
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库 "))
  roots.push(root)
  const service = new ArtLibraryService({ root, fetch: request, resolveHost: async () => ["93.184.216.34"], now: () => new Date("2026-08-08T00:00:00.000Z") })
  await service.initialize()
  return { root, service }
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    title: "雪城中轴",
    artist: "1hz脉冲",
    styleAnalysis: "绝对轴线与无限重复形成压迫秩序。",
    palette: ["#334455"],
    patternTags: ["无限住宅墙", "Concrete"],
    compositionTags: ["强中轴"],
    moodTags: ["冷峻", " concrete "],
    reversePrompt: {
      style: "opaque mineral pigments, cold gray-blue palette, hard-edged concrete planes, diffuse fog light, weathered grain",
      composition: "wide frame, strict central axis, repeated walls compressing deep space, tiny scale references",
      scene: "a remote snow settlement embedded in a monumental concrete corridor",
      negative: ["cozy village", "glossy 3D render", "logo", "watermark", "garbled text"],
    },
    suggestedLibrary: { title: "巨构艺术", confidence: 0.86 },
    ...overrides,
  }
}

describe("art library runtime foundations", () => {
  test("normalizes Windows-safe human-readable directory names", () => {
    expect(safeArtDirectoryName("  巨构：艺术 / 冷雾  ")).toBe("巨构 艺术 冷雾")
    expect(safeArtDirectoryName("CON")).toBe("未分类")
    expect(safeArtDirectoryName("冷峻... ")).toBe("冷峻")
  })

  test("inspects real image signatures and rejects unsafe dimensions", () => {
    expect(inspectArtImage(png())).toEqual({ mediaType: "image/png", extension: "png", width: 512, height: 384 })
    expect(() => inspectArtImage(png(1, 1))).toThrow("below 256")
    expect(() => inspectArtImage(new Uint8Array([1, 2, 3]))).toThrow("unsupported or damaged")
  })

  test("creates strict schema v2 metadata and keeps legacy v1 readable without rewriting it", () => {
    expect(requireArtItemMetadata(metadata(), candidate)).toMatchObject({
      schemaVersion: 2,
      curationMethod: "visual-curation-v1",
      id: "candidate-1",
      source: candidate.source,
      image: candidate.image,
      reversePrompt: { style: expect.any(String), composition: expect.any(String), scene: expect.any(String), negative: ["cozy village", "glossy 3D render", "logo", "watermark", "garbled text"] },
      suggestedLibrary: { title: "巨构艺术", confidence: 0.86 },
    })
    expect(() => requireArtItemMetadata({ title: "缺字段" }, candidate)).toThrow("artist is required")
    expect(() => requireArtItemMetadata(metadata({ reversePrompt: undefined }), candidate)).toThrow("reversePrompt")
    expect(() => requireArtItemMetadata(metadata({ promptDraft: "legacy prompt", negativeTags: ["legacy negative"] }), candidate)).toThrow("unsupported fields")
    expect(() => requireArtItemMetadata(metadata({ reversePrompt: { ...metadata().reversePrompt as Record<string, unknown>, style: "雪城中轴 by 1hz脉冲" } }), candidate)).toThrow("title or artist")
    expect(() => requireArtItemMetadata(metadata({ suggestedLibrary: { title: "x", confidence: 2 } }), candidate)).toThrow("between 0 and 1")

    const legacy: ArtItemMetadataV1 = {
      schemaVersion: 1,
      id: candidate.id,
      title: "旧用户作品",
      artist: "未知",
      collectedAt: candidate.collectedAt,
      styleAnalysis: "旧版解读",
      palette: ["#334455"],
      patternTags: ["旧形式"],
      compositionTags: ["旧构图"],
      moodTags: ["旧情绪"],
      promptDraft: "legacy prompt",
      negativeTags: ["legacy negative"],
      suggestedLibrary: { title: "旧分类", confidence: 0.5 },
      source: candidate.source,
      image: candidate.image,
    }
    expect(decodeArtItemMetadata(JSON.stringify(legacy))).toEqual(legacy)
  })

  test("decodes legacy web sources and bounded local provenance", () => {
    expect(decodeArtCandidate(JSON.stringify(candidate)).source).toEqual(candidate.source)
    expect(decodeArtCandidate(JSON.stringify({
      ...candidate,
      source: {
        pageUrl: "creatx-project://project-1/reference%2Fcity.png",
        imageUrl: "creatx-project://project-1/reference%2Fcity.png",
        kind: "project-file",
        displayName: "city.png",
        projectRelativePath: "reference/city.png",
      },
    })).source).toMatchObject({ kind: "project-file", displayName: "city.png", projectRelativePath: "reference/city.png" })
    expect(() => decodeArtCandidate(JSON.stringify({ ...candidate, source: { ...candidate.source, kind: "filesystem", absolutePath: "C:\\secret.png" } }))).toThrow("source")
  })

  test("recognizes public and private network addresses", () => {
    expect(isPublicAddress("93.184.216.34")).toBeTrue()
    expect(isPublicAddress("127.0.0.1")).toBeFalse()
    expect(isPublicAddress("192.168.1.2")).toBeFalse()
    expect(isPublicAddress("::1")).toBeFalse()
    expect(isPublicAddress("2001:db8::1")).toBeFalse()
    expect(isPublicAddress("203.0.113.4")).toBeFalse()
    expect(isPublicAddress("2606:4700:4700::1111")).toBeTrue()
  })

  test("collects valid public images, removes duplicate bytes, and leaves no partial entries", async () => {
    const requests: string[] = []
    const image = png(640, 480)
    const { root, service } = await setup(async (input) => {
      const url = String(input)
      requests.push(url)
      if (url === "https://page.example/work") return new Response('<meta property="og:image" content="/one.png"><img src="https://cdn.example/two.png">', { headers: { "content-type": "text/html" } })
      if (url === "https://page.example/one.png" || url === "https://cdn.example/two.png") return new Response(image, { headers: { "content-type": "application/octet-stream" } })
      return new Response("missing", { status: 404 })
    })

    const result = await service.collect({ query: "巨构艺术", count: 2, sourceUrls: ["https://page.example/work"] })

    expect(result.collected).toBe(1)
    expect(result.skipped).toEqual([expect.objectContaining({ reason: "duplicate", existingId: result.successes[0]?.id })])
    expect(requests).toEqual(["https://page.example/work", "https://page.example/one.png", "https://cdn.example/two.png"])
    expect((await service.snapshot()).incomingBatches).toHaveLength(1)
    expect(await stat(join(root, "incoming", result.batchId, result.successes[0]!.id, "original.png"))).toBeTruthy()
  })

  test("ingests trusted bytes through the same candidate and duplicate boundary as web collection", async () => {
    const image = png(640, 480)
    const { root, service } = await setup(async () => new Response(image, { headers: { "content-type": "image/png" } }))

    const imported = await service.importImages({
      query: "项目参考图",
      images: [{
        bytes: image,
        source: {
          pageUrl: "creatx-project://project-1/reference%2Fcity.png",
          imageUrl: "creatx-project://project-1/reference%2Fcity.png",
          kind: "project-file",
          displayName: "city.png",
          projectRelativePath: "reference/city.png",
        },
      }],
    })
    const collected = await service.collect({ query: "同图公网来源", count: 1, sourceUrls: ["https://images.example/city.png"] })
    const record = JSON.parse(await readFile(join(root, "incoming", imported.batchId, imported.successes[0]!.id, "candidate.json"), "utf8"))

    expect(imported).toMatchObject({ collected: 1, skipped: [], failures: [] })
    expect(record.source).toMatchObject({ kind: "project-file", projectRelativePath: "reference/city.png" })
    expect(collected).toMatchObject({ collected: 0, skipped: [{ reason: "duplicate", existingId: imported.successes[0]!.id }] })
  })

  test("imports a trusted current-project image without mutating its source", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 艺术库项目 "))
    roots.push(projectRoot)
    await mkdir(join(projectRoot, "reference"), { recursive: true })
    await writeFile(join(projectRoot, "reference", "city.png"), png(640, 480))
    const projectFiles = new ProjectFileService()
    const project = await projectFiles.openProject(projectRoot)
    const { root, service } = await setup(async () => new Response("unused"))
    const importTool = createArtLibraryTools(service, { projectFiles: projectFiles.queries }).find((tool) => tool.name === "import_art_images")!
    const before = createHash("sha256").update(await readFile(join(projectRoot, "reference", "city.png"))).digest("hex")

    const result = await importTool.execute({ query: "环城参考", sources: [{ kind: "project_file", relativePath: "reference/city.png" }] }, { sessionId: "session-1", projectId: project.id })
    const after = createHash("sha256").update(await readFile(join(projectRoot, "reference", "city.png"))).digest("hex")
    const value = result.ok ? result.value as Awaited<ReturnType<ArtLibraryService["importImages"]>> : undefined
    const record = JSON.parse(await readFile(join(root, "incoming", value!.batchId, value!.successes[0]!.id, "candidate.json"), "utf8"))

    expect(result.ok).toBeTrue()
    expect(value).toMatchObject({ collected: 1, failures: [] })
    expect(record.source).toMatchObject({ kind: "project-file", projectRelativePath: "reference/city.png", displayName: "city.png" })
    expect(after).toBe(before)
  })

  test("rejects untrusted, missing, non-image, and changing project sources without candidates", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "CreatX 艺术库项目失败 "))
    roots.push(projectRoot)
    await writeFile(join(projectRoot, "notes.txt"), "not an image")
    const projectFiles = new ProjectFileService()
    const project = await projectFiles.openProject(projectRoot)
    const { service } = await setup(async () => new Response("unused"))
    const importTool = createArtLibraryTools(service, { projectFiles: projectFiles.queries }).find((tool) => tool.name === "import_art_images")!

    expect(await importTool.execute({ query: "x", sources: [{ kind: "project_file", relativePath: "notes.txt" }] }, { sessionId: "personal" })).toEqual({ ok: false, error: expect.objectContaining({ code: "art_library_invalid", detail: expect.stringContaining("no project") }) })
    expect(await importTool.execute({ query: "x", sources: [{ kind: "project_file", relativePath: "../secret.png" }] }, { sessionId: "project", projectId: project.id })).toEqual({ ok: false, error: expect.objectContaining({ detail: expect.stringContaining("stay relative") }) })
    expect(await importTool.execute({ query: "x", sources: [{ kind: "project_file", relativePath: "missing.png" }] }, { sessionId: "project", projectId: project.id })).toEqual({ ok: false, error: expect.objectContaining({ detail: expect.stringContaining("does not exist") }) })
    expect(await importTool.execute({ query: "x", sources: [{ kind: "project_file", relativePath: "notes.txt" }] }, { sessionId: "project", projectId: project.id })).toEqual({ ok: false, error: expect.objectContaining({ detail: expect.stringContaining("not an image") }) })
    expect((await service.snapshot()).incomingBatches).toEqual([])

    const changedProjectFiles: ProjectFileQueryPort = {
      refreshProject: async () => ({ id: project.id, name: "changing", displayPath: "changing", refreshedAt: new Date().toISOString(), files: [{ id: "image", relativePath: "image.png", name: "image.png", kind: "image", size: 24, modifiedAt: "2026-08-10T00:00:00.000Z" }] }),
      readBytes: (() => { let reads = 0; return async () => png(reads++ ? 800 : 640, 480) })(),
      readFile: async () => { throw new Error("unused") },
      listDirectory: async () => undefined,
    }
    const changedTool = createArtLibraryTools(service, { projectFiles: changedProjectFiles }).find((tool) => tool.name === "import_art_images")!
    expect(await changedTool.execute({ query: "x", sources: [{ kind: "project_file", relativePath: "image.png" }] }, { sessionId: "project", projectId: project.id })).toEqual({ ok: false, error: expect.objectContaining({ detail: expect.stringContaining("changed") }) })
    expect((await service.snapshot()).incomingBatches).toEqual([])
  })

  test("imports only a trusted image snapshot from the current chat turn", async () => {
    const { root, service } = await setup(async () => new Response("unused"))
    const turnImages = {
      read: (sessionId: string, index: number) => {
        if (sessionId !== "session-a" || index !== 0) throw new Error("art_library_missing: current turn image is unavailable")
        const bytes = png(640, 480)
        return { index, displayName: "构图参考.png", mediaType: "image/png" as const, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
      },
    }
    const importTool = createArtLibraryTools(service, { turnImages }).find((tool) => tool.name === "import_art_images")!

    const result = await importTool.execute({ query: "构图参考", sources: [{ kind: "turn_attachment", index: 0 }] }, { sessionId: "session-a" })
    const value = result.ok ? result.value as Awaited<ReturnType<ArtLibraryService["importImages"]>> : undefined
    const record = JSON.parse(await readFile(join(root, "incoming", value!.batchId, value!.successes[0]!.id, "candidate.json"), "utf8"))

    expect(result.ok).toBeTrue()
    expect(record.source).toMatchObject({ kind: "chat-attachment", displayName: "构图参考.png" })
    expect(JSON.stringify(record)).not.toContain("AppData")
    expect(await importTool.execute({ query: "越权", sources: [{ kind: "turn_attachment", index: 0 }] }, { sessionId: "session-b" })).toEqual({ ok: false, error: expect.objectContaining({ detail: expect.stringContaining("unavailable") }) })
  })

  test("blocks private targets before transport and reports zero candidates", async () => {
    let requests = 0
    const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库私网 "))
    roots.push(root)
    const service = new ArtLibraryService({ root, fetch: async () => { requests += 1; return new Response(png()) } })

    const result = await service.collect({ query: "private", count: 1, sourceUrls: ["http://127.0.0.1/image.png"] })

    expect(requests).toBe(0)
    expect(result).toMatchObject({ collected: 0, failures: [{ error: expect.stringContaining("public addresses") }] })
    expect((await service.snapshot()).incomingBatches).toEqual([])
  })

  test("blocks a redirect to a private target before the second request", async () => {
    let requests = 0
    const { service } = await setup(async () => {
      requests += 1
      return new Response(undefined, { status: 302, headers: { location: "http://127.0.0.1/private.png" } })
    })

    const result = await service.collect({ query: "redirect", count: 1, sourceUrls: ["https://page.example/redirect"] })

    expect(requests).toBe(1)
    expect(result.failures[0]?.error).toContain("public addresses")
  })

  test("propagates cancellation and does not leave a partial candidate", async () => {
    const controller = new AbortController()
    const { root, service } = await setup(async () => {
      controller.abort(new Error("cancelled by test"))
      throw controller.signal.reason
    })

    expect(service.collect({ query: "cancel", count: 1, sourceUrls: ["https://page.example/cancel"], signal: controller.signal })).rejects.toThrow("cancelled by test")
    expect((await readdir(join(root, "incoming"))).filter((name) => name.includes("partial"))).toEqual([])
  })

  test("fails closed for non-vision models and returns bounded real image blocks to vision models", async () => {
    const { service } = await setup(async () => new Response(png(640, 480), { headers: { "content-type": "image/png" } }))
    const collected = await service.collect({ query: "known", count: 1, sourceUrls: ["https://images.example/one.png"] })
    const id = collected.successes[0]!.id

    expect(service.readCandidates([id], false)).rejects.toThrow("does not support image input")
    expect(await service.readCandidates([id], true)).toEqual([
      { type: "text", text: expect.stringContaining(id) },
      { type: "image", data: expect.any(String), mediaType: "image/png" },
    ])
    expect(service.readCandidates([id, id], true)).rejects.toThrow("exactly one")
  })

  test("moves complete entries through approval, creates a category, and exports first-seen unique style words", async () => {
    const { root, service } = await setup(async () => new Response(png(640, 480), { headers: { "content-type": "image/png" } }))
    const first = await service.collect({ query: "first", count: 1, sourceUrls: ["https://images.example/one.png"] })
    const firstId = first.successes[0]!.id

    expect(await service.submitApproval([{ candidateId: firstId, metadata: metadata() }])).toEqual([{ itemId: firstId, state: "approval", replayed: false }])
    expect((await service.snapshot()).approvalIds).toEqual([firstId])
    expect(await service.review({ itemId: firstId, action: "approve" })).toEqual({ itemId: firstId, state: "approved", library: "巨构艺术", replayed: false })
    expect(await service.review({ itemId: firstId, action: "approve", targetLibrary: "巨构艺术" })).toEqual({ itemId: firstId, state: "approved", library: "巨构艺术", replayed: true })
    expect(await service.exportStyleKeywords("巨构艺术")).toEqual({
      library: "巨构艺术",
      itemCount: 1,
      keywords: ["无限住宅墙", "Concrete", "强中轴", "冷峻"],
      text: "无限住宅墙, Concrete, 强中轴, 冷峻",
    })
    expect(JSON.parse(await readFile(join(root, "libraries", "巨构艺术", "library.json"), "utf8"))).toMatchObject({ title: "巨构艺术" })
  })

  test("exposes bounded classification evidence and current style extraction materials", async () => {
    const { root, service } = await setup(async (input) => new Response(String(input).includes("ink") ? png(640, 480) : png(800, 600), { headers: { "content-type": "image/png" } }))
    const ink = await service.collect({ query: "ink", count: 1, sourceUrls: ["https://images.example/ink.png"] })
    const glass = await service.collect({ query: "glass", count: 1, sourceUrls: ["https://images.example/glass.png"] })
    await service.submitApproval([{ candidateId: ink.successes[0]!.id, metadata: metadata({ title: "水下门廊", styleAnalysis: "粗黑墨线切开青灰水体，低机位门廊压住画面，右侧气泡留白缓解了结构重量。", patternTags: ["水下", "粗黑墨线", "纸面颗粒"], compositionTags: ["低机位", "右侧留白"], moodTags: ["压迫"], suggestedLibrary: { title: "墨线水域", confidence: 0.9 } }) }])
    await service.review({ itemId: ink.successes[0]!.id, action: "approve" })
    await service.submitApproval([{ candidateId: glass.successes[0]!.id, metadata: metadata({ title: "水下门廊二", styleAnalysis: "半透明玻璃体悬在亮青水层中，正面水平视角保持平稳，均匀辉光消除了硬边阴影。", patternTags: ["水下", "半透明玻璃", "柔光渐变"], compositionTags: ["正面水平", "中央悬浮"], moodTags: ["宁静"], suggestedLibrary: { title: "玻璃水域", confidence: 0.92 } }) }])
    await service.review({ itemId: glass.successes[0]!.id, action: "approve" })

    const all = await service.snapshot({ kind: "all" })
    expect(all.libraries.map((library) => library.title)).toEqual(["玻璃水域", "墨线水域"])
    expect(all.styleScope).toMatchObject({ kind: "all", itemCount: 2, keywordFrequencies: { pattern: expect.arrayContaining([{ keyword: "水下", count: 2 }, { keyword: "粗黑墨线", count: 1 }, { keyword: "半透明玻璃", count: 1 }]) } })
    expect(all.styleScope.representatives).toHaveLength(2)
    expect(all.styleScope.representatives[0]).toEqual(expect.objectContaining({ id: expect.stringMatching(/^art_/u), title: expect.any(String), styleAnalysis: expect.any(String), library: expect.any(String) }))
    expect(JSON.stringify(all)).not.toContain(root)
    expect(JSON.stringify(all)).not.toContain("original.png")

    const scoped = await service.snapshot({ kind: "library", title: "墨线水域" })
    expect(scoped.libraries.map((library) => library.title)).toEqual(["墨线水域"])
    expect(scoped.styleScope).toMatchObject({ kind: "library", title: "墨线水域", itemCount: 1, keywordFrequencies: { composition: [{ keyword: "低机位", count: 1 }, { keyword: "右侧留白", count: 1 }] } })
    expect(service.snapshot({ kind: "library", title: "不存在" })).rejects.toThrow("does not exist")
    expect(service.snapshot({ kind: "all", title: "越权字段" } as never)).rejects.toThrow("scope is invalid")
  })

  test("projects real approval and category items without paths and reads originals by id", async () => {
    const image = png(640, 480)
    const { root, service } = await setup(async () => new Response(image, { headers: { "content-type": "image/png" } }))
    const collected = await service.collect({ query: "projection", count: 1, sourceUrls: ["https://images.example/projection.png"] })
    const id = collected.successes[0]!.id
    await service.submitApproval([{ candidateId: id, metadata: metadata({ title: "投影项" }) }])

    const pending = await service.projection()
    expect(pending).toMatchObject({ incomingCount: 0, approvalItems: [{ id, state: "approval", title: "投影项", imageUrl: `creatx-art-library://item/${id}/original` }], libraries: [] })
    expect(JSON.stringify(pending)).not.toContain(service.root)
    expect(await service.readOriginal(id)).toEqual({ mediaType: "image/png", bytes: image })

    await service.review({ itemId: id, action: "approve" })
    expect(await service.projection()).toMatchObject({ approvalItems: [], libraries: [{ title: "巨构艺术", itemCount: 1, items: [{ id, state: "approved", library: "巨构艺术" }] }] })
    await writeFile(join(root, "libraries", "巨构艺术", "items", `投影项-${id}`, "original.png"), png(800, 600))
    expect(service.readOriginal(id)).rejects.toThrow("hash changed")
  })

  test("emits monotonic revisions only for real art-library mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库事件 "))
    roots.push(root)
    const revisions: number[] = []
    const service = new ArtLibraryService({
      root,
      fetch: async () => new Response(png(640, 480), { headers: { "content-type": "image/png" } }),
      resolveHost: async () => ["93.184.216.34"],
      onChanged: (revision) => revisions.push(revision),
    })
    const collected = await service.collect({ query: "event", count: 1, sourceUrls: ["https://images.example/event.png"] })
    const id = collected.successes[0]!.id
    await service.collect({ query: "duplicate", count: 1, sourceUrls: ["https://images.example/event.png"] })
    await service.submitApproval([{ candidateId: id, metadata: metadata() }])
    await service.review({ itemId: id, action: "hold" })
    await service.review({ itemId: id, action: "approve" })

    expect(revisions).toEqual([1, 2, 3])
    expect((await service.projection()).revision).toBe(3)
  })

  test("holds without mutation and rejects with an idempotent image-free tombstone", async () => {
    const { root, service } = await setup(async () => new Response(png(800, 600), { headers: { "content-type": "image/png" } }))
    const collected = await service.collect({ query: "reject", count: 1, sourceUrls: ["https://images.example/reject.png"] })
    const id = collected.successes[0]!.id
    await service.submitApproval([{ candidateId: id, metadata: metadata({ title: "拒绝项" }) }])

    expect(await service.review({ itemId: id, action: "hold" })).toEqual({ itemId: id, state: "approval", replayed: true })
    expect(await service.review({ itemId: id, action: "reject" })).toEqual({ itemId: id, state: "rejected", replayed: false })
    expect(await service.review({ itemId: id, action: "reject" })).toEqual({ itemId: id, state: "rejected", replayed: true })
    expect((await service.snapshot()).approvalIds).toEqual([])
    expect(JSON.parse(await readFile(join(root, ".state", "rejected", `${id}.json`), "utf8"))).toEqual(expect.objectContaining({ id }))
  })

  test("edits complete visual curation before approval without changing the original", async () => {
    const image = png(900, 700)
    const { root, service } = await setup(async () => new Response(image, { headers: { "content-type": "image/png" } }))
    const collected = await service.collect({ query: "review edits", count: 1, sourceUrls: ["https://images.example/review.png"] })
    const id = collected.successes[0]!.id
    await service.submitApproval([{ candidateId: id, metadata: metadata({ title: "初稿" }) }])

    expect(service.review({ itemId: id, action: "approve", edits: { title: "越权", hiddenField: "bad" } } as never)).rejects.toThrow("unsupported fields")
    expect(service.review({ itemId: id, action: "approve", edits: { palette: [42] } } as never)).rejects.toThrow("palette")
    expect(() => requireReviewArtApprovalCommand({ itemId: id, action: "approve", rendererPath: "C:\\secret" })).toThrow("unsupported fields")
    expect((await service.snapshot()).approvalIds).toEqual([id])

    const reversePrompt = {
      style: "matte screenprint layers, oxidized teal and chalk white, angular silhouettes, dry paper grain",
      composition: "wide frame, low horizon, off-center figure, large upper negative space, stepped depth",
      scene: "a surveyor crossing a flooded machine hall",
      negative: ["glossy 3D", "symmetrical portrait", "logo", "watermark", "garbled text"],
    }
    expect(await service.review({
      itemId: id,
      action: "approve",
      targetLibrary: "修订分类",
      edits: {
        title: "人工修订作品",
        styleAnalysis: "氧化青色块压低水面，粉白人物在左下形成尺度锚点，大片无纹理上空把机器大厅拉成停滞舞台。",
        palette: ["#27666b", "#e7e0cf"],
        patternTags: ["丝网印刷", "干纸颗粒"],
        compositionTags: ["低地平线", "上方留白"],
        moodTags: ["由低饱和与空场支持的停滞感"],
        reversePrompt,
      },
    })).toEqual({ itemId: id, state: "approved", library: "修订分类", replayed: false })

    const savedRoot = join(root, "libraries", "修订分类", "items", `人工修订作品-${id}`)
    expect(decodeArtItemMetadata(await readFile(join(savedRoot, "metadata.json"), "utf8"))).toMatchObject({
      schemaVersion: 2,
      title: "人工修订作品",
      styleAnalysis: "氧化青色块压低水面，粉白人物在左下形成尺度锚点，大片无纹理上空把机器大厅拉成停滞舞台。",
      palette: ["#27666b", "#e7e0cf"],
      patternTags: ["丝网印刷", "干纸颗粒"],
      compositionTags: ["低地平线", "上方留白"],
      moodTags: ["由低饱和与空场支持的停滞感"],
      reversePrompt,
      suggestedLibrary: { title: "修订分类" },
    })
    expect(createHash("sha256").update(await readFile(join(savedRoot, "original.png"))).digest("hex")).toBe(createHash("sha256").update(image).digest("hex"))
  })

  test("registers application art tools for ordinary personal and project sessions only", async () => {
    const { service } = await setup(async () => new Response(png(), { headers: { "content-type": "image/png" } }))
    const tools = createArtLibraryTools(service)
    const approvals = Object.fromEntries(tools.map((tool) => [tool.name, tool.approval]))

    expect(tools.map((tool) => tool.name)).toEqual(["collect_art_images", "import_art_images", "read_art_images", "submit_art_approval", "inspect_art_library", "review_art_approval", "export_art_style_keywords"])
    expect(tools.every((tool) => tool.scope === "application" && tool.audiences.includes("ordinary"))).toBeTrue()
    expect(approvals).toEqual({ collect_art_images: "required", import_art_images: "required", read_art_images: "automatic", submit_art_approval: "automatic", inspect_art_library: "automatic", review_art_approval: "required", export_art_style_keywords: "automatic" })
    expect(sessionToolPolicies("approval", "personal", tools).collect_art_images).toEqual({ enabled: true, autoApprove: false })
    expect(sessionToolPolicies("approval", "project", tools).read_art_images).toEqual({ enabled: true, autoApprove: true })
    expect(creatXToolsForWorkerProfile(tools, "growth-stage")).toEqual([])
  })

  test("enforces one authoritative single-image visual curation method", () => {
    const tools = createArtLibraryTools(new ArtLibraryService({ root: "C:\\isolated-art-library" }))
    const read = tools.find((tool) => tool.name === "read_art_images")!
    const submit = tools.find((tool) => tool.name === "submit_art_approval")!
    const readSchema = read.inputSchema as { properties: { candidateIds: { minItems: number; maxItems: number } } }
    const submitSchema = submit.inputSchema as { properties: { items: { minItems: number; maxItems: number; items: { properties: { metadata: { required: string[]; properties: Record<string, unknown> } } } } } }

    expect(readSchema.properties.candidateIds).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(submitSchema.properties.items).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(submitSchema.properties.items.items.properties.metadata.required).toContain("reversePrompt")
    expect(submitSchema.properties.items.items.properties.metadata.properties).not.toHaveProperty("promptDraft")
    expect(submitSchema.properties.items.items.properties.metadata.properties).not.toHaveProperty("negativeTags")
    expect(`${read.description}\n${submit.description}`).toContain("STYLE / COMPOSITION / SCENE / NEGATIVE")
    expect(`${read.description}\n${submit.description}`).toContain("每次只分析一张")
    expect(`${read.description}\n${submit.description}`).toContain("不得自动批准")
  })

  test("materializes all 63 bundled works into their pre-approved libraries", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库种子 "))
    roots.push(root)
    const sourceRoot = join(process.cwd(), "apps", "art-library", "public", "art-library")
    const service = new ArtLibraryService({ root, now: () => new Date("2026-08-10T00:00:00.000Z") })
    await service.initialize()

    const manifest = await readBundledArtAtlasSeedManifest([sourceRoot])
    expect(manifest.entries).toHaveLength(63)
    expect(manifest.entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.library]: (result[entry.library] ?? 0) + 1 }), {})).toEqual({ 巨构艺术: 41, 暖色风格: 18, 纪念碑谷: 4 })
    expect(await materializeBundledArtAtlasSeed(service, [sourceRoot])).toEqual({ status: "materialized", approved: 63, moved: 0 })

    const projection = await service.projection()
    expect(Object.fromEntries(projection.libraries.map((library) => [library.title, library.items.length]))).toEqual({ 巨构艺术: 41, 暖色风格: 18, 纪念碑谷: 4 })
    expect((await service.snapshot()).approvalIds).toEqual([])
    expect((await readdir(join(root, "incoming"))).length).toBe(0)
    expect(await materializeBundledArtAtlasSeed(service, [sourceRoot])).toEqual({ status: "already-materialized", approved: 63, moved: 0 })
    expect(await stat(join(root, ".state", "seeds", `${ART_ATLAS_CURATED_SNAPSHOT}.json`))).toBeDefined()
  })

  test("recovers reset seed candidates without changing user art and fails closed on ownership conflicts", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库种子恢复 "))
    roots.push(root)
    const sourceRoot = join(process.cwd(), "apps", "art-library", "public", "art-library")
    const service = new ArtLibraryService({ root, now: () => new Date("2026-08-10T00:00:00.000Z") })
    await service.initialize()
    const userImage = png(1000, 700)
    const userImport = await service.importImages({ query: "user", images: [{ bytes: userImage, source: { pageUrl: "https://user.example/work", imageUrl: "https://user.example/work.png", kind: "web" } }] })
    const userId = userImport.successes[0]!.id
    await service.submitApproval([{ candidateId: userId, metadata: metadata({ title: "用户作品", suggestedLibrary: { title: "用户分类", confidence: 1 } }) }])
    await service.review({ itemId: userId, action: "approve" })
    const userRoot = join(root, "libraries", "用户分类", "items", `用户作品-${userId}`)
    const userMetadataBefore = await readFile(join(userRoot, "metadata.json"))
    const userImageBefore = await readFile(join(userRoot, "original.png"))

    const manifest = await readBundledArtAtlasSeedManifest([sourceRoot])
    for (let offset = 0; offset < manifest.entries.length; offset += 20) {
      const imported = await service.importImages({ query: "内置艺术原图重新整理", images: manifest.entries.slice(offset, offset + 20).map((entry) => ({ bytes: entry.bytes, source: entry.source })) })
      expect(imported.failures).toEqual([])
    }
    expect(await materializeBundledArtAtlasSeed(service, [sourceRoot])).toEqual({ status: "materialized", approved: 63, moved: 63 })
    expect(Object.fromEntries((await service.projection()).libraries.map((library) => [library.title, library.items.length]))).toEqual({ 巨构艺术: 41, 暖色风格: 18, 纪念碑谷: 4, 用户分类: 1 })
    expect((await service.snapshot()).approvalIds).toEqual([])
    expect(await readFile(join(userRoot, "metadata.json"))).toEqual(userMetadataBefore)
    expect(await readFile(join(userRoot, "original.png"))).toEqual(userImageBefore)

    const conflictRoot = await mkdtemp(join(tmpdir(), "CreatX 艺术库种子冲突 "))
    roots.push(conflictRoot)
    const conflictService = new ArtLibraryService({ root: conflictRoot })
    await conflictService.initialize()
    const first = manifest.entries[0]!
    await conflictService.importImages({ query: "用户同字节作品", images: [{ bytes: first.bytes, source: { pageUrl: "https://user.example/collision", imageUrl: "https://user.example/collision.jpg", kind: "web" } }] })
    expect(materializeBundledArtAtlasSeed(conflictService, [sourceRoot])).rejects.toThrow("ownership")
    expect((await readdir(join(conflictRoot, ".state", "seeds")).catch(() => [])).some((name) => name === `${ART_ATLAS_CURATED_SNAPSHOT}.json`)).toBeFalse()

    const hashRoot = await mkdtemp(join(tmpdir(), "CreatX 艺术库种子哈希冲突 "))
    roots.push(hashRoot)
    const hashService = new ArtLibraryService({ root: hashRoot })
    await hashService.initialize()
    await hashService.importImages({ query: "错误重置中断", images: [{ bytes: first.bytes, source: first.source }] })
    const batch = (await readdir(join(hashRoot, "incoming"), { withFileTypes: true })).find((entry) => entry.isDirectory())!
    const candidateRoot = join(hashRoot, "incoming", batch.name, first.id)
    await writeFile(join(candidateRoot, first.image.fileName), png(777, 777))
    expect(materializeBundledArtAtlasSeed(hashService, [sourceRoot])).rejects.toThrow("hash")
    expect((await readdir(join(hashRoot, ".state", "seeds")).catch(() => [])).some((name) => name === `${ART_ATLAS_CURATED_SNAPSHOT}.json`)).toBeFalse()
  })

  test("moves verified legacy approved and approval seed directories into the accepted libraries", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 艺术库旧种子 "))
    roots.push(root)
    const sourceRoot = join(process.cwd(), "apps", "art-library", "public", "art-library")
    const service = new ArtLibraryService({ root })
    await service.initialize()
    const manifest = await readBundledArtAtlasSeedManifest([sourceRoot])

    for (const [index, entry] of manifest.entries.entries()) {
      const target = entry.legacyState === "approval" ? join(root, "approval", entry.id) : join(root, "libraries", "旧种子分类", "items", `${index}-${entry.id}`)
      await mkdir(target, { recursive: true })
      await writeFile(join(target, entry.image.fileName), entry.bytes)
      await writeFile(join(target, "metadata.json"), `${JSON.stringify({ ...entry.metadata, id: entry.id, image: entry.image }, undefined, 2)}\n`)
      await writeFile(join(target, "source.json"), `${JSON.stringify(entry.source, undefined, 2)}\n`)
    }
    await mkdir(join(root, ".state", "seeds"), { recursive: true })
    await writeFile(join(root, ".state", "seeds", `${manifest.snapshot}.json`), "{}\n")

    expect(await materializeBundledArtAtlasSeed(service, [sourceRoot])).toEqual({ status: "materialized", approved: 63, moved: 63 })
    expect(Object.fromEntries((await service.projection()).libraries.map((library) => [library.title, library.itemCount]))).toEqual({ 巨构艺术: 41, 暖色风格: 18, 纪念碑谷: 4 })
    expect((await service.snapshot()).approvalIds).toEqual([])
    expect(await readdir(join(root, "libraries", "旧种子分类")).catch(() => [])).toEqual([])
  })
})
