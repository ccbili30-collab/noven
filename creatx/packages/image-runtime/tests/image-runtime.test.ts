import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProjectFileService } from "@creatx/project-files"
import { IMAGE_CORE_GUIDANCE, ImageRuntime, ImageRuntimeError, type ImageRuntimeConnection } from "../src"

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"))
const pngWithoutAlpha = Uint8Array.from(png)
pngWithoutAlpha[25] = 2
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(request: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const root = await mkdtemp(join(tmpdir(), "CreatX 图片 "))
  roots.push(root)
  const files = new ProjectFileService()
  const project = await files.openProject(root)
  return {
    root,
    project,
    files,
    runtime: new ImageRuntime({ baseUrl: "https://images.example/v1", apiKey: "secret", fileQueries: files.queries, fileCommands: files.commands, fetch: request }),
  }
}

async function writeEditInputs(files: ProjectFileService, projectId: string, mask = png) {
  await files.commands.writeFile({ projectId, relativePath: "地图/底图.png", content: png, expectedModifiedAt: null })
  await files.commands.writeFile({ projectId, relativePath: "地图/蒙版.png", content: mask, expectedModifiedAt: null })
}

describe("image runtime", () => {
  test("instructs the Agent to return successful project images as relative Markdown", () => {
    expect(IMAGE_CORE_GUIDANCE).toContain("![灯塔](图片/灯塔.png)")
    expect(IMAGE_CORE_GUIDANCE).toContain("Do not use absolute paths, file URLs, or invented paths")
    expect(IMAGE_CORE_GUIDANCE).toContain("When the Draw Comic Skill is loaded, use gpt-image-2 for final panels")
    expect(IMAGE_CORE_GUIDANCE).toContain("cheap generation remains appropriate only for comic thumbnails")
  })

  test("contributes a project-scoped approval tool with a conservative default model", async () => {
    const requests: unknown[] = []
    const { project, runtime } = await setup(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })
    const tool = runtime.tool()

    expect(tool.name).toBe("generate_image")
    expect(tool.scope).toBe("project")
    expect(tool.approval).toBe("required")
    expect(tool.description).toContain("never overwrites")
    expect(await tool.execute({ prompt: "red circle", relativePath: "图片/默认.png" }, { sessionId: "s1", projectId: project.id })).toEqual({
      ok: true,
      value: expect.objectContaining({ model: "gpt-image-2-cheap", relativePath: "图片/默认.png" }),
    })
    expect(requests).toEqual([expect.objectContaining({ model: "gpt-image-2-cheap", prompt: "red circle" })])
  })

  test("applies the nearest project visual style to synchronous generation exactly once", async () => {
    const requests: Array<Record<string, unknown>> = []
    const { project, files, runtime } = await setup(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })
    await files.commands.writeFile({
      projectId: project.id,
      relativePath: "作品/视觉设定/统一画风.md",
      content: "矿物颜料与旧金构成共同视觉语言。",
      expectedModifiedAt: null,
    })

    const result = await runtime.generateToProject({
      projectId: project.id,
      relativePath: "作品/人物/女王.png",
      model: "gpt-image-2",
      prompt: "绘制女王立绘",
    })

    expect(result.visualStyleApplied).toBeTrue()
    expect(requests[0]?.prompt).toMatch(/^\[项目统一画风（最高视觉约束，不得被本次图片内容覆盖）\]\n矿物颜料与旧金构成共同视觉语言。\n\n\[本次图片内容\]\n绘制女王立绘$/u)
  })

  test("uses the latest configured image connection and default model for an omitted tool model", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 动态生图配置 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    const requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = []
    let connection: ImageRuntimeConnection = { baseUrl: "https://first.example/v1", apiKey: "first-key", defaultModel: "gpt-image-2-cheap" }
    const runtime = new ImageRuntime({
      resolveConnection: () => connection,
      fileQueries: files.queries,
      fileCommands: files.commands,
      fetch: async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) })
        return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
      },
    })

    connection = { baseUrl: "https://second.example/v1", apiKey: "second-key", defaultModel: "gpt-image-2" }
    const result = await runtime.tool().execute({ prompt: "blue circle", relativePath: "图片/动态.png" }, { sessionId: "s1", projectId: project.id })

    expect(result).toMatchObject({ ok: true, value: { model: "gpt-image-2" } })
    expect(requests).toEqual([{
      url: "https://second.example/v1/images/generations",
      authorization: "Bearer second-key",
      body: expect.objectContaining({ model: "gpt-image-2", prompt: "blue circle" }),
    }])
  })

  test("reports missing image configuration without contacting a Provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "CreatX 未配置生图 "))
    roots.push(root)
    const files = new ProjectFileService()
    const project = await files.openProject(root)
    let requests = 0
    const runtime = new ImageRuntime({
      resolveConnection: () => undefined,
      fileQueries: files.queries,
      fileCommands: files.commands,
      fetch: async () => {
        requests += 1
        return Response.json({})
      },
    })

    expect(await runtime.tool().execute(
      { prompt: "blue circle", relativePath: "图片/未配置.png" },
      { sessionId: "s1", projectId: project.id },
    )).toMatchObject({ ok: false, error: { code: "provider_missing_credentials", message: "尚未配置生图模型。" } })
    expect(requests).toBe(0)
  })

  test("fails closed without project identity or with invalid tool input", async () => {
    let requests = 0
    const { runtime } = await setup(async () => {
      requests += 1
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })
    const tool = runtime.tool()

    expect(await tool.execute({ prompt: "red circle", relativePath: "图片/fail.png" }, { sessionId: "s1" })).toMatchObject({ ok: false, error: { code: "project_invalid" } })
    expect(await tool.execute({ prompt: "red circle", relativePath: "图片/fail.png", model: "unknown" }, { sessionId: "s1", projectId: "missing" })).toMatchObject({ ok: false, error: { code: "tool_failed" } })
    expect(requests).toBe(0)
  })

  test("rejects synchronous generation during a Growth stage", async () => {
    let requests = 0
    const { project, runtime } = await setup(async () => {
      requests += 1
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })

    expect(await runtime.tool().execute(
      { prompt: "world map", relativePath: "作品/图片/地图.png" },
      { sessionId: "s1", projectId: project.id, growthGoalId: "goal-1", growthGoalVersion: 1 },
    )).toMatchObject({ ok: false, error: { code: "tool_failed", detail: expect.stringContaining("submit_image_generation") } })
    expect(requests).toBe(0)
  })

  test("contributes edit_image and sends project source plus alpha mask as data URLs", async () => {
    const requests: Record<string, unknown>[] = []
    const { project, files, runtime } = await setup(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })
    await writeEditInputs(files, project.id)
    const tool = runtime.editTool()

    expect(tool.name).toBe("edit_image")
    expect(tool.scope).toBe("project")
    expect(tool.approval).toBe("required")
    expect(await tool.execute({
      sourceImagePath: "地图/底图.png",
      maskImagePath: "地图/蒙版.png",
      prompt: "沿山脉自然高亮，其他区域不变",
      relativePath: "地图/中央山脉高亮.png",
    }, { sessionId: "s1", projectId: project.id })).toEqual({
      ok: true,
      value: expect.objectContaining({ model: "gpt-image-2-cheap", relativePath: "地图/中央山脉高亮.png" }),
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ model: "gpt-image-2-cheap", prompt: "沿山脉自然高亮，其他区域不变", n: 1, size: "1024x1024" })
    expect(String(requests[0]?.image)).toStartWith("data:image/png;base64,")
    expect(String(requests[0]?.mask)).toStartWith("data:image/png;base64,")
    expect(await files.queries.readBytes(project.id, "地图/中央山脉高亮.png")).toEqual(png)
  })

  test("fails edit_image before Provider work for invalid input files and Growth", async () => {
    let requests = 0
    const { project, files, runtime } = await setup(async () => {
      requests += 1
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    })
    const tool = runtime.editTool()

    expect(await tool.execute({
      sourceImagePath: "地图/缺失.png",
      maskImagePath: "地图/缺失蒙版.png",
      prompt: "highlight",
      relativePath: "地图/输出.png",
    }, { sessionId: "s1", projectId: project.id })).toMatchObject({ ok: false, error: { code: "tool_failed", detail: expect.stringContaining("could not be read") } })

    await writeEditInputs(files, project.id, pngWithoutAlpha)
    expect(await tool.execute({
      sourceImagePath: "地图/底图.png",
      maskImagePath: "地图/蒙版.png",
      prompt: "highlight",
      relativePath: "地图/输出.png",
    }, { sessionId: "s1", projectId: project.id })).toMatchObject({ ok: false, error: { code: "tool_failed", detail: expect.stringContaining("alpha channel") } })

    expect(await tool.execute({
      sourceImagePath: "地图/底图.png",
      maskImagePath: "地图/蒙版.png",
      prompt: "highlight",
      relativePath: "地图/输出.png",
    }, { sessionId: "s1", projectId: project.id, growthGoalId: "goal-1", growthGoalVersion: 1 })).toMatchObject({ ok: false, error: { code: "tool_failed", detail: expect.stringContaining("queue tasks are not implemented") } })
    expect(requests).toBe(0)
  })

  test("tool preserves create-only storage semantics", async () => {
    const { project, runtime } = await setup(async () => Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }))
    const tool = runtime.tool()
    const input = { prompt: "red circle", relativePath: "图片/不覆盖.png", model: "gpt-image-2" }

    expect((await tool.execute(input, { sessionId: "s1", projectId: project.id })).ok).toBeTrue()
    expect(await tool.execute(input, { sessionId: "s1", projectId: project.id })).toMatchObject({ ok: false, error: { code: "file_conflict" } })
  })

  test("decodes base64 and persists the same project bytes", async () => {
    const { project, files, runtime } = await setup(async () => Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] }))
    const result = await runtime.generateToProject({ projectId: project.id, relativePath: "图片/标准.png", model: "gpt-image-2", prompt: "red circle" })

    expect(result).toMatchObject({ mimeType: "image/png", bytes: png.byteLength, transport: "b64_json" })
    expect(await files.queries.readBytes(project.id, "图片/标准.png")).toEqual(png)
  })

  test("downloads an HTTPS URL and persists the same project bytes", async () => {
    const calls: string[] = []
    const { project, runtime } = await setup(async (input) => {
      calls.push(String(input))
      if (calls.length === 1) return Response.json({ data: [{ url: "https://cdn.example/image.png" }] })
      return new Response(png, { headers: { "content-type": "image/png" } })
    })

    const result = await runtime.generateToProject({ projectId: project.id, relativePath: "图片/便宜.png", model: "gpt-image-2-cheap", prompt: "red circle" })
    expect(result.transport).toBe("url")
    expect(calls).toEqual(["https://images.example/v1/images/generations", "https://cdn.example/image.png"])
  })

  test("fails closed for missing credentials before a request", async () => {
    const { files } = await setup(async () => Response.json({ data: [] }))
    expect(() => new ImageRuntime({ baseUrl: "https://images.example/v1", apiKey: " ", fileQueries: files.queries, fileCommands: files.commands })).toThrow("image_config")
  })

  test("separates Provider errors and redacts key-shaped response text", async () => {
    const { project, runtime } = await setup(async () => new Response('{"error":"sk-leaked-value"}', { status: 429 }))
    const error = await runtime.generateToProject({ projectId: project.id, relativePath: "图片/fail.png", model: "gpt-image-2", prompt: "red circle" }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ImageRuntimeError)
    expect(String(error)).toContain("image_provider")
    expect(String(error)).not.toContain("sk-leaked-value")
  })

  test("classifies a closed paid request as unknown and does not write output", async () => {
    const { root, project, runtime } = await setup(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("socket closed"), { code: "ECONNRESET" }) })
    })
    const error = await runtime.generateToProject({ projectId: project.id, relativePath: "图片/unknown.png", model: "gpt-image-2", prompt: "red circle" }).catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ImageRuntimeError)
    expect(error).toMatchObject({ code: "image_result_unknown", requestFailureKind: "connection_reset" })
    expect(String(error)).toContain("ECONNRESET")
    expect(String(error)).toContain("do not retry automatically")
    await expect(stat(join(root, "图片", "unknown.png"))).rejects.toThrow()
  })

  test("classifies nested DNS failures without persisting raw transport messages", async () => {
    const { project, runtime } = await setup(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND private-host.example"), { code: "ENOTFOUND" }) })
    })
    const error = await runtime.generateToProject({ projectId: project.id, relativePath: "图片/dns.png", model: "gpt-image-2", prompt: "red circle" }).catch((value: unknown) => value)

    expect(error).toMatchObject({ code: "image_result_unknown", requestFailureKind: "dns" })
    expect(String(error)).toContain("ENOTFOUND")
    expect(String(error)).not.toContain("private-host.example")
  })

  test("does not write unknown payloads or non-images", async () => {
    for (const response of [Response.json({ data: [{}] }), Response.json({ data: [{ b64_json: Buffer.from("not-image").toString("base64") }] }), Response.json({ data: [{ b64_json: Buffer.from(png.slice(0, 24)).toString("base64") }] })]) {
      const { root, project, runtime } = await setup(async () => response.clone())
      await expect(runtime.generateToProject({ projectId: project.id, relativePath: "图片/fail.png", model: "gpt-image-2", prompt: "red circle" })).rejects.toThrow()
      await expect(stat(join(root, "图片", "fail.png"))).rejects.toThrow()
    }
  })

  test("rejects insecure image download URLs without a project write", async () => {
    const { root, project, runtime } = await setup(async () => Response.json({ data: [{ url: "http://cdn.example/image.png" }] }))
    await expect(runtime.generateToProject({ projectId: project.id, relativePath: "图片/fail.png", model: "gpt-image-2-cheap", prompt: "red circle" })).rejects.toThrow("Only HTTPS URLs")
    await expect(stat(join(root, "图片", "fail.png"))).rejects.toThrow()
  })

  test("rejects an oversized image response before a project write", async () => {
    let calls = 0
    const { root, project, runtime } = await setup(async () => {
      calls += 1
      if (calls === 1) return Response.json({ data: [{ url: "https://cdn.example/large.png" }] })
      return new Response(png, { headers: { "content-length": String(25 * 1024 * 1024 + 1) } })
    })
    await expect(runtime.generateToProject({ projectId: project.id, relativePath: "图片/large.png", model: "gpt-image-2-cheap", prompt: "red circle" })).rejects.toThrow("25 MiB")
    await expect(stat(join(root, "图片", "large.png"))).rejects.toThrow()
  })
})
