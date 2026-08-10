import { ClineCore, CoreSessionService, SqliteSessionStore } from "@cline/sdk"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  PUBLICATION_GENRE_BLUEPRINT_GUIDANCE,
  topicGenreCandidates,
  type WorldBlueprintLayerDocument,
} from "../../world-blueprint/src/index.ts"

const projectRoot = process.env.CREATX_STYLE_SOURCE_PROJECT?.trim() || "D:\\CodexCache\\Temp\\CreatX Pro V2 经典中世纪蓝图项目 3OVVWf"
const workRoot = "阿斯特拉恩"
const layer = "历史、时代与重大事件" as const
const evidenceDir = resolve(import.meta.dirname, "../../../../artifacts/growth-world-live/pro-v5-deepseek-history-style-selection")
const runRoot = await mkdtemp(join(tmpdir(), "creatx-history-style-selection-"))
const apiKey = requireEnvironment("DEEPSEEK_API_KEY")
const store = new SqliteSessionStore({ sessionsDir: join(runRoot, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(runRoot, "sessions") })
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-pro-style-selection-live",
  distinctId: "creatx-growth-world-pro-style-selection-live",
  sessionService,
  capabilities: { requestToolApproval: () => ({ approved: false, reason: "This classification Live does not permit tools" }) },
})

const expected = new Map([
  ["entry-dawn-kings", "era-history"],
  ["entry-old-road-code", "document-history"],
  ["entry-sinking-tide", "narrative-history"],
  ["entry-ash-rebellion", "legendary-chronicle"],
  ["entry-green-pact", "document-history"],
])

try {
  await mkdir(evidenceDir, { recursive: true })
  const blueprint = JSON.parse(await readFile(join(projectRoot, workRoot, layer, "蓝图.json"), "utf8")) as WorldBlueprintLayerDocument
  const samples = [...expected.keys()].map((key) => {
    const object = blueprint.objects.find((candidate) => candidate.key === key)
    if (!object || object.kind !== "entry") throw new Error(`STYLE SELECTION LIVE FAIL: missing entry ${key}`)
    return { key: object.key, title: object.title, locator: object.locator }
  })
  const allowed = topicGenreCandidates("classic-medieval-fantasy", layer)
  const prompt = `你正在为 Growth World Pro 的蓝图 entry 选择受限 genreKey。不要写正文，不要调用工具。当前题材是经典中古奇幻，只能根据对象本身的标题与定位，从 Runtime 给出的候选中选择；不得使用候选外文类。\n\n生产文类定义：\n${PUBLICATION_GENRE_BLUEPRINT_GUIDANCE}\n\n待选择对象：\n${JSON.stringify(samples, undefined, 2)}\n\n返回严格 JSON 对象：{"selections":[{"key":"原 key","genreKey":"受限键","reason":"一句具体理由"}]}。每个对象恰好一项，顺序保持不变；genreKey 只能从 ${allowed.join("、")} 中选择。不要输出 Markdown 围栏。`
  const session = await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title: "Growth World Pro 历史文类自动选择" },
    config: {
      providerId: "deepseek",
      modelId: process.env.CREATX_MODEL_ID?.trim() || "deepseek-chat",
      apiKey,
      cwd: runRoot,
      workspaceRoot: runRoot,
      mode: "act",
      systemPrompt: "你是世界设定集的蓝图编辑。根据对象语义选择最准确的受限出版文类，只返回要求的 JSON。",
      maxIterations: 1,
      enableTools: false,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      disableMcpSettingsTools: true,
    },
    toolPolicies: {},
  })
  const response = await core.send({ sessionId: session.sessionId, prompt, timeoutMs: 600_000 })
  if (!response?.text.trim()) throw new Error("STYLE SELECTION LIVE FAIL: Provider returned no selection")
  const parsed = JSON.parse(stripFence(response.text.trim())) as { selections?: Array<{ key?: unknown; genreKey?: unknown; reason?: unknown }> }
  if (!Array.isArray(parsed.selections) || parsed.selections.length !== samples.length) throw new Error("STYLE SELECTION LIVE FAIL: selection count is invalid")
  const actual = parsed.selections.map((selection, index) => {
    const sample = samples[index]!
    if (selection.key !== sample.key) throw new Error(`STYLE SELECTION LIVE FAIL: expected ${sample.key} at index ${index}`)
    if (typeof selection.genreKey !== "string" || !allowed.includes(selection.genreKey)) throw new Error(`STYLE SELECTION LIVE FAIL: ${sample.key} returned an invalid genreKey`)
    if (typeof selection.reason !== "string" || !selection.reason.trim()) throw new Error(`STYLE SELECTION LIVE FAIL: ${sample.key} returned no reason`)
    if (selection.genreKey !== expected.get(sample.key)) throw new Error(`STYLE SELECTION LIVE FAIL: ${sample.key} expected ${expected.get(sample.key)} but received ${selection.genreKey}`)
    return { ...sample, genreKey: selection.genreKey, reason: selection.reason.trim() }
  })
  const result = {
    status: "GROWTH WORLD PRO HISTORY STYLE SELECTION LIVE PASS",
    provider: "deepseek",
    model: process.env.CREATX_MODEL_ID?.trim() || "deepseek-chat",
    sampleCount: actual.length,
    selections: actual,
    scope: "Real Provider blueprint classification only; no project mutation, prose, Electron, or images",
  }
  await Promise.all([
    writeFile(join(evidenceDir, "Prompt.md"), `${prompt}\n`, "utf8"),
    writeFile(join(evidenceDir, "response.json"), `${JSON.stringify(parsed, undefined, 2)}\n`, "utf8"),
    writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, undefined, 2)}\n`, "utf8"),
  ])
  console.log(JSON.stringify(result))
  await core.stop(session.sessionId)
} finally {
  try {
    await core.dispose("Growth World Pro style selection Live cleanup")
  } finally {
    store.close()
    await rm(runRoot, { recursive: true, force: true })
  }
}

function stripFence(value: string) {
  return value.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/iu)?.[1]?.trim() ?? value
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
