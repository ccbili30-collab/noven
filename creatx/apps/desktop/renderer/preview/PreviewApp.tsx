import { useEffect, useMemo, useState } from "react"
import { ChevronDown, MessageSquare, Plus } from "lucide-react"
import type {
  AttachmentReference,
  ArtLibrarySnapshot,
  CreativeLibrarySnapshot,
  FilePreview,
  GrowthGoalProjection,
  TimelineItem,
  ModelSettingsSnapshot,
  ProjectFile,
  ProjectSnapshot,
  SaveImageModelSettingsCommand,
  SaveProjectTextCommand,
  SaveTextModelProfileCommand,
  SessionSummary,
  WorkbenchEntry,
  WorkbenchSnapshot,
} from "@creatx/contracts"
import { WorkspaceShell } from "../src/WorkspaceShell"
import type { RightSurface } from "../src/WorkspaceShell"
import type { ArtLibraryApi } from "../src/ArtLibraryPage"

const mapImage = new URL("../src/assets/worldbuilder-map.jpg", import.meta.url).href

const artLibrarySnapshot: ArtLibrarySnapshot = {
  revision: 1,
  incomingCount: 2,
  approvalItems: [{
    id: "preview-art-approval",
    state: "approval",
    title: "群山与河谷图",
    artist: "Web Preview Fixture",
    collectedAt: "2026-08-10T00:00:00.000Z",
    styleAnalysis: "暖灰山脊沿画面横向展开，蜿蜒河道切开中景，细密地形纹理与大块留白形成疏密对照。",
    palette: ["#d7c8a7", "#7b7668", "#49605a"],
    patternTags: ["纸本纹理", "细密地形线"],
    compositionTags: ["横向全景", "河道引导"],
    moodTags: ["沉静", "辽阔"],
    curation: { status: "current", method: "visual-curation-v1", reversePrompt: { style: "matte paper texture, restrained earth colors, fine topographic marks", composition: "wide panoramic terrain, winding river as the primary visual path", scene: "a mountain basin crossed by a narrow river", negative: ["glossy 3D", "logo", "watermark", "garbled text"] } },
    suggestedLibrary: { title: "世界地图", confidence: .88 },
    sourceKind: "project-file",
    sourceLabel: "Web Preview Fixture · worldbuilder-map.jpg",
    projectRelativePath: "地图与图像/世界总览.jpg",
    imageUrl: mapImage,
    image: { mediaType: "image/jpeg", bytes: 130594, width: 1600, height: 1000, sha256: "0".repeat(64) },
  }],
  libraries: [{
    title: "世界地图",
    itemCount: 1,
    items: [{
      id: "preview-art-approved",
      state: "approved",
      title: "北境地形总览",
      artist: "Web Preview Fixture",
      collectedAt: "2026-08-09T00:00:00.000Z",
      styleAnalysis: "低饱和山地层层叠向远方，河流连接前后景，纸张底色让地形标记保持克制。",
      palette: ["#d7c8a7", "#7b7668"],
      patternTags: ["纸本纹理", "地形线"],
      compositionTags: ["鸟瞰全景", "层叠山地"],
      moodTags: ["辽阔"],
      curation: { status: "current", method: "visual-curation-v1", reversePrompt: { style: "matte paper terrain illustration", composition: "wide layered mountain panorama", scene: "a northern mountain range", negative: ["logo", "watermark"] } },
      suggestedLibrary: { title: "世界地图", confidence: .94 },
      sourceKind: "seed",
      sourceLabel: "Web Preview Fixture",
      imageUrl: mapImage,
      image: { mediaType: "image/jpeg", bytes: 130594, width: 1600, height: 1000, sha256: "1".repeat(64) },
      library: "世界地图",
    }],
  }],
  refreshedAt: "2026-08-10T00:00:00.000Z",
}

const artLibraryApi: ArtLibraryApi = {
  readArtLibrary: async () => ({ ok: true, value: artLibrarySnapshot }),
  reviewArtApproval: async () => ({ ok: false, error: { code: "library_invalid", message: "Web Preview 不会修改真实艺术库。", detail: "preview_fixture_read_only" } }),
  exportArtStyleKeywords: async (library) => ({ ok: true, value: { library, itemCount: 1, keywords: ["纸本纹理", "地形线", "鸟瞰全景", "层叠山地", "辽阔"], text: "纸本纹理, 地形线, 鸟瞰全景, 层叠山地, 辽阔" } }),
}

const now = "2026-08-03T09:30:00.000Z"
const referenceDocumentPath = "05.章节创作/第3章 逐鹿中原.md"
const referenceImagePath = "05.章节创作/逐鹿中原.png"
const fixturePaths = [
  referenceDocumentPath,
  referenceImagePath,
  "世界导览.md",
  "核心规则/白塔术式余波.md",
  "地区与地理/北境补给路危机.md",
  "地区与地理/北境灯火重现.md",
  "国家与势力/封印器疑缺.md",
  "国家与势力/灰暮骑士团分裂.md",
  "经济与贸易/粮仓征税与河域抵抗.md",
  "经济与贸易/粮盐价差.md",
  "历史与事件/七渡激地归属争端.md",
  "历史与事件/三湖边界重划.md",
  "历史与事件/失灯雪路.md",
  "人物与阵营/无神王位与摄政.md",
  "人物与阵营/舟户特许反弹.md",
  "人物与阵营/白塔城与木工院.md",
  "人物与阵营/冠城与灰冠高层.md",
  "地图与图像/白塔术式余波.png",
  "地图与图像/北境补给路危机.png",
  "地图与图像/北境灯火重现.png",
  "地图与图像/封印器疑缺.png",
  "地图与图像/灰暮骑士团分裂.png",
  "地图与图像/粮仓征税与河域抵抗.png",
  "地图与图像/世界总览.jpg",
] as const
const files: ProjectFile[] = fixturePaths.map((relativePath, index) => ({
  id: `fixture-file-${index + 1}`,
  relativePath,
  name: relativePath.split("/").at(-1)!,
  kind: relativePath.endsWith(".md") ? "markdown" : "image",
  size: relativePath.endsWith(".md") ? 4200 + index * 173 : 130594 + index * 911,
  modifiedAt: now,
}))
const workbenchEntries: WorkbenchEntry[] = [
  ...Array.from(new Set(files.flatMap((file) => file.relativePath.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))))).map((relativePath) => ({
    kind: "directory" as const,
    name: relativePath.split("/").at(-1)!,
    relativePath,
  })),
  ...files.map((file) => ({ kind: "file" as const, name: file.name, relativePath: file.relativePath, fileId: file.id })),
].sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN"))
const project: ProjectSnapshot = {
  id: "preview-project",
  name: "乱世烽烟：大胤风云",
  displayPath: "D:\\CreatX\\乱世烽烟-大胤风云",
  files,
  refreshedAt: now,
}
const workbenches: WorkbenchSnapshot = {
  projectId: project.id,
  workbenches: [
    { id: "builtin:files", source: "builtin", title: "文件", folder: ".", state: "ready", entries: workbenchEntries },
    {
      id: "workbench-world",
      source: "registered",
      title: "世界工作台",
      folder: ".",
      state: "ready",
      entries: workbenchEntries,
    },
  ],
  diagnostics: [],
  refreshedAt: now,
}
const previews = Object.fromEntries(files.map((file) => [file.id, file.kind === "image"
  ? { file, dataUrl: mapImage }
  : {
      file,
      content: file.relativePath === referenceDocumentPath
        ? "# 第三章 逐鹿中原\n\n**视角：赵长风　·　时间：大胤宣和三十七年·秋　·　地点：中原·雍阳　·　字数：3287**\n\n宣和三十七年的秋天，天空像是被点燃的炭火，浓云翻涌，天地之间一片昏黄。中原大地历经数十年的割据与战乱，终至群雄并起，逐鹿之势，已不可逆转。\n\n雍阳城外，黄河之水滚滚而东，河面漂浮着断木与残旗。城墙高耸，旌旗猎猎，大胤王朝最后的龙旗在风中发出沉闷的声响。\n\n> 今日之战，不止为雍阳，而为天下。\n\n---\n\n战鼓擂动，号角长鸣。北境铁骑如黑云压境，逐鹿军的精锐步兵列阵如墙。弓弩齐发，箭雨遮天，喊杀声与马嘶声交织在一起，汇成一曲惨烈的战歌。\n\n这一战，决定的不仅是雍阳的归属，更是大胤王朝的命运。"
        : `# ${file.name.replace(/\.md$/u, "")}\n\n这是一份 Web Preview（网页预览）中的演示文稿，用于检查长项目在工作台中的浏览、阅读与编辑布局。\n\n## 当前记录\n\n旧道路仍连接着边境、粮仓与王城。围绕税收、继承和失落术式的争端，正在把原本分散的地方冲突推向同一个时代转折。`,
    }])) satisfies Record<string, FilePreview>
const initialSessions: SessionSummary[] = [
  {
    id: "preview-session",
    title: "新会话",
    projectId: project.id,
    displayPath: project.displayPath,
    status: "idle",
    startedAt: now,
    updatedAt: now,
    providerId: "deepseek",
    modelId: "deepseek-chat",
    kind: "project",
    permission: { mode: "free", projectTools: true, trustWarning: "Web Preview 不执行任何真实工具。" },
  },
  {
    id: "preview-session-structure",
    title: "世界结构整理",
    projectId: project.id,
    displayPath: project.displayPath,
    status: "idle",
    startedAt: now,
    updatedAt: now,
    providerId: "deepseek",
    modelId: "deepseek-chat",
    kind: "project",
    permission: { mode: "free", projectTools: true, trustWarning: "Web Preview 不执行任何真实工具。" },
  },
  {
    id: "preview-session-characters",
    title: "人物关系校对",
    projectId: project.id,
    displayPath: project.displayPath,
    status: "idle",
    startedAt: now,
    updatedAt: now,
    providerId: "deepseek",
    modelId: "deepseek-chat",
    kind: "project",
    permission: { mode: "free", projectTools: true, trustWarning: "Web Preview 不执行任何真实工具。" },
  },
]
const initialTimeline: TimelineItem[] = [
  { sequence: 1, itemId: "preview-message-user", kind: "message", presentation: "user", state: "completed", text: "/growth_world_pro 创建一个经典、宏大、完整的长篇世界项目。", attachments: [] },
  { sequence: 2, itemId: "preview-tool", kind: "tool", presentation: "assistant", state: "completed", toolName: "read_files" },
  { sequence: 3, itemId: "preview-message-assistant", kind: "message", presentation: "assistant", state: "completed", text: "阶段一已完成方向判断与资料边界整理；当前正在按既有世界蓝图填充故事、传说与叙事入口。", attachments: [] },
  { sequence: 4, itemId: "preview-message-user-followup", kind: "message", presentation: "user", state: "completed", text: "把第三章的开场再加强一些，战争要有压迫感，也要保留人物选择。", attachments: [] },
  { sequence: 5, itemId: "preview-message-assistant-followup", kind: "message", presentation: "assistant", state: "completed", text: "可以。我会把压迫感放进具体的声音、气味和军阵变化里，让赵长风面对的不只是宏大战争，也是一项会改变他命运的选择。", attachments: [] },
  { sequence: 6, itemId: "growth:preview:active", kind: "reasoning", presentation: "assistant", state: "streaming", text: "正在检索已完成的世界节点并整理当前对象的引用关系。" },
]
const initialGrowth: GrowthGoalProjection = {
  goalId: "preview-growth",
  projectId: project.id,
  sessionId: "preview-session",
  instruction: "创建一个经典、宏大、完整，适合长期扩展的中古剑与魔法世界。",
  status: "active",
  statusReason: "正在按世界蓝图逐层填充内容。",
  requiredImageTaskIds: [],
  createdAt: now,
  updatedAt: now,
  version: 20,
  progress: {
    phase: "故事、传说与叙事入口",
    total: 141,
    completed: 128,
    active: 1,
    retryable: 0,
    blocked: 0,
    unknown: 0,
    currentObjects: [{ title: "无神的灰河港", layer: "故事、传说与叙事入口", status: "active" }],
  },
}
const initialSettings: ModelSettingsSnapshot = {
  textProfiles: [
    { id: "deepseek", name: "DeepSeek", providerId: "deepseek", modelId: "deepseek-chat", apiKeyConfigured: true },
    { id: "luna", name: "5.6 Luna", providerId: "openai-compatible", modelId: "gpt-5.6-luna", baseUrl: "https://example.invalid/v1", apiKeyConfigured: true },
  ],
  selectedTextProfileId: "deepseek",
  image: { baseUrl: "https://example.invalid/v1", defaultModel: "gpt-image-2-cheap", apiKeyConfigured: true, configured: true },
}

type PreviewVariant = "chat-studio" | "reference-studio" | "workbench-core" | "workbench-balanced" | "chat-focus"

const previewVariants: Array<{ id: PreviewVariant; label: string; description: string }> = [
  { id: "chat-studio", label: "Chat 界面", description: "项目下只放工作台，对话占满主区" },
  { id: "reference-studio", label: "Workbench 界面", description: "工作台目录在左，AI 在右侧协作" },
  { id: "workbench-core", label: "工作台核心", description: "画布最大，Chat 作为右侧协作者" },
  { id: "workbench-balanced", label: "均衡布局", description: "工作台与 Chat 保持平衡" },
  { id: "chat-focus", label: "Chat 对照", description: "当前生产顺序，用于比较" },
]

function readPreviewVariant(): PreviewVariant {
  const value = new URLSearchParams(window.location.search).get("variant")
  return previewVariants.some((variant) => variant.id === value) ? value as PreviewVariant : "reference-studio"
}

if (typeof window !== "undefined" && ["reference-studio", "workbench-core", "workbench-balanced"].includes(new URLSearchParams(window.location.search).get("variant") ?? "reference-studio")) {
  window.localStorage.setItem("creatx.workspace.inspector-position.v1", JSON.stringify({ x: Math.max(8, window.innerWidth / 2 - 143), y: 70 }))
}

export function PreviewApp() {
  const [previewVariant, setPreviewVariant] = useState<PreviewVariant>(readPreviewVariant)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessions, setSessions] = useState(initialSessions)
  const [activeSessionId, setActiveSessionId] = useState(initialSessions[0]!.id)
  const [timeline, setTimeline] = useState(initialTimeline)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<AttachmentReference[]>([])
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightSurface, setRightSurface] = useState<RightSurface>({ workbenchId: "workbench-world" })
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>()
  const [growth, setGrowth] = useState(initialGrowth)
  const [settings, setSettings] = useState(initialSettings)
  const [previewByFile, setPreviewByFile] = useState(previews)
  const [creativeLibrary, setCreativeLibrary] = useState<CreativeLibrarySnapshot>({ ideaItems: [], heritageItems: [], reactions: [], artChatSessions: {}, refreshedAt: now })
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const preview = selectedFileId ? previewByFile[selectedFileId] : undefined
  const visiblePreview = useMemo(() => preview, [preview])

  useEffect(() => {
    document.documentElement.dataset.previewVariant = previewVariant
    const url = new URL(window.location.href)
    url.searchParams.set("variant", previewVariant)
    window.history.replaceState({}, "", url)
    return () => {
      delete document.documentElement.dataset.previewVariant
    }
  }, [previewVariant])

  useEffect(() => {
    if (previewVariant === "chat-studio") {
      setLeftOpen(true)
      setSessionMenuOpen(false)
      const collapse = window.setTimeout(() => document.querySelector<HTMLButtonElement>('[title="收起工作台"]')?.click())
      return () => window.clearTimeout(collapse)
    }
    if (previewVariant !== "reference-studio") return
    setLeftOpen(false)
    const open = window.setTimeout(() => {
      setSelectedFileId(files.find((file) => file.relativePath === referenceDocumentPath)?.id)
      document.querySelector<HTMLButtonElement>('[title="展开工作台"]')?.click()
      window.setTimeout(() => document.querySelector<HTMLButtonElement>('[title="收起检查器"]')?.click(), 40)
    })
    return () => window.clearTimeout(open)
  }, [previewVariant])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return
      event.preventDefault()
      const currentIndex = previewVariants.findIndex((variant) => variant.id === previewVariant)
      const nextIndex = (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + previewVariants.length) % previewVariants.length
      setPreviewVariant(previewVariants[nextIndex]!.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewVariant])

  const send = () => {
    const prompt = draft.trim()
    if (!prompt) return
    setTimeline((current) => [...current, { sequence: current.length + 1, itemId: `preview-user-${current.length}`, kind: "message", presentation: "user", state: "completed", text: prompt, attachments: attachments.map((attachment) => ({ name: attachment.name, displayPath: attachment.displayPath, kind: attachment.kind, ...(attachment.mediaType ? { mediaType: attachment.mediaType } : {}), ...(attachment.previewUrl ? { previewUrl: attachment.previewUrl } : {}) })) }, { sequence: current.length + 2, itemId: `preview-assistant-${current.length}`, kind: "message", presentation: "assistant", state: "completed", text: "这是网页预览中的演示回复。视觉修改会直接作用于 Electron 共用组件，真实 Agent 不会在浏览器中运行。", attachments: [] }])
    setDraft("")
    setAttachments([])
  }

  const saveText = async (command: SaveTextModelProfileCommand) => {
    const id = command.id ?? `preview-profile-${settings.textProfiles.length + 1}`
    setSettings((current) => ({ ...current, selectedTextProfileId: id, textProfiles: [...current.textProfiles.filter((profile) => profile.id !== id), { id, name: command.name, providerId: command.providerId, modelId: command.modelId, ...(command.baseUrl ? { baseUrl: command.baseUrl } : {}), apiKeyConfigured: Boolean(command.apiKey) }] }))
    return true
  }
  const saveImage = async (command: SaveImageModelSettingsCommand) => {
    setSettings((current) => ({ ...current, image: { baseUrl: command.baseUrl, defaultModel: command.defaultModel, apiKeyConfigured: Boolean(command.apiKey) || current.image.apiKeyConfigured, configured: true } }))
    return true
  }
  const saveProjectText = async (command: SaveProjectTextCommand) => {
    const current = previewByFile[command.fileId]
    if (!current || current.content === undefined || current.file.modifiedAt !== command.expectedModifiedAt) return undefined
    const saved = { file: { ...current.file, modifiedAt: new Date().toISOString(), size: command.content.length }, content: command.content }
    setPreviewByFile((items) => ({ ...items, [command.fileId]: saved }))
    return saved
  }

  return <>
    <WorkspaceShell
      configured
      modelSettings={settings}
      project={project}
      sessions={sessions}
      activeSession={activeSession}
      timeline={timeline}
      timelineLoading={false}
      draft={draft}
      setDraft={setDraft}
      skillSequenceSlots={[]}
      skillSequenceArmed={false}
      onSkillSequenceSlotsChange={() => undefined}
      onSkillSequenceArmedChange={() => undefined}
      selectedAttachments={attachments}
      setSelectedAttachments={setAttachments}
      runState="idle"
      growth={growth}
      imageTasks={[]}
      error={undefined}
      approval={undefined}
      leftOpen={leftOpen}
      setLeftOpen={setLeftOpen}
      rightSurface={rightSurface}
      setRightSurface={setRightSurface}
      selectedFileId={selectedFileId}
      preview={visiblePreview}
      workbenches={workbenches}
      onOpenProject={() => setTimeline((current) => [...current, { sequence: current.length + 1, itemId: `preview-system-${current.length}`, kind: "notice", presentation: "system", state: "completed", text: "Web Preview 不打开真实文件夹。" }])}
      onSaveTextFile={saveProjectText}
      artLibraryEnabled
      artLibraryApi={artLibraryApi}
      creativeLibrary={creativeLibrary}
      heritageLibraryEnabled
      onCreateSession={() => {
        const session = { ...initialSessions[0]!, id: `preview-session-${sessions.length + 1}`, title: `预览会话 ${sessions.length + 1}` }
        setSessions((current) => [...current, session])
        setActiveSessionId(session.id)
      }}
      onCreateProjectSession={() => {
        const session = { ...initialSessions[0]!, id: `preview-session-${sessions.length + 1}`, title: `预览会话 ${sessions.length + 1}` }
        setSessions((current) => [...current, session])
        setActiveSessionId(session.id)
      }}
      onSelectProject={() => undefined}
      onSelectSession={setActiveSessionId}
      onRefreshCreativeLibrary={async () => {
        setCreativeLibrary((current) => ({ ...current, refreshedAt: new Date().toISOString() }))
        return true
      }}
      onImportCreativeLibrary={async () => false}
      onSetCreativeLibraryReaction={async (command) => {
        setCreativeLibrary((current) => {
          const previous = current.reactions.find((reaction) => reaction.kind === command.kind && reaction.itemId === command.itemId)
          return { ...current, reactions: [...current.reactions.filter((reaction) => reaction.kind !== command.kind || reaction.itemId !== command.itemId), { kind: command.kind, itemId: command.itemId, liked: previous?.liked ?? false, saved: previous?.saved ?? false, [command.reaction]: command.value }] }
        })
        return true
      }}
      onShareToSession={async (sessionId, prompt) => {
        setActiveSessionId(sessionId)
        setTimeline((current) => [...current, { sequence: current.length + 1, itemId: `preview-share-${current.length}`, kind: "message", presentation: "user", state: "completed", text: prompt, attachments: [] }])
        return true
      }}
      onOpenArtChat={async () => true}
      onRenameSession={async (sessionId, title) => {
        setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, title } : session))
        return true
      }}
      onRevealProject={() => setTimeline((current) => [...current, { sequence: current.length + 1, itemId: `preview-system-${current.length}`, kind: "notice", presentation: "system", state: "completed", text: "Web Preview 不打开资源管理器。" }])}
      onDeleteSession={async (sessionId) => {
        setSessions((current) => current.filter((session) => session.id !== sessionId))
        if (activeSessionId === sessionId) setActiveSessionId("")
        return true
      }}
      onDeleteProjectSessions={async (projectId) => {
        setSessions((current) => current.filter((session) => session.projectId !== projectId))
        setActiveSessionId("")
        return true
      }}
      onRemoveProject={() => undefined}
      onChooseAttachments={() => setAttachments([{ id: "preview-attachment", name: "参考资料.md", displayPath: "浏览器演示引用", size: 1280, modifiedAt: now, kind: "file" }])}
      onDropAttachments={() => undefined}
      onSaveTextModelProfile={saveText}
      onSelectModel={async (profileId) => {
        const profile = settings.textProfiles.find((candidate) => candidate.id === profileId)
        if (!profile) return false
        setSettings((current) => ({ ...current, selectedTextProfileId: profileId }))
        setSessions((current) => current.map((session) => session.id === activeSessionId ? { ...session, providerId: profile.providerId, modelId: profile.modelId } : session))
        return true
      }}
      onSaveImageModelSettings={saveImage}
      onSend={send}
      messageDeletionAcknowledged
      onAcknowledgeMessageDeletion={() => undefined}
      onDeleteUserMessage={() => undefined}
      onEditUserMessage={() => undefined}
      onCancelUserMessageEdit={() => undefined}
      onResendUserMessage={() => undefined}
      onCancelRun={() => undefined}
      onSetPermission={(mode) => setSessions((current) => current.map((session) => session.id === activeSessionId ? { ...session, permission: { ...session.permission, mode } } : session))}
      onGrowthAction={(action) => setGrowth((current) => ({
        ...current,
        status: action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled",
        statusReason: action === "pause" ? "已在 Web Preview 中暂停。" : action === "resume" ? "正在按世界蓝图逐层填充内容。" : "已在 Web Preview 中结束。",
        updatedAt: new Date().toISOString(),
        version: current.version + 1,
      }))}
      onImageTaskAction={async () => true}
      onOpenMessageAttachment={() => undefined}
      onOpenFile={(file) => setSelectedFileId(file.id)}
      onOpenWorkbenchFile={(file) => setSelectedFileId(file.id)}
      onResolveWorkbenchPresentation={async () => undefined}
      onResolveHtmlPresentation={async () => undefined}
      onRefresh={() => undefined}
      onApprovalDecision={() => undefined}
      onDismissError={() => undefined}
      navigationContent={["chat-studio", "reference-studio"].includes(previewVariant) ? "workbenches" : "sessions"}
      preserveWorkspaceOnSessionChange={previewVariant === "reference-studio"}
    />
    {["chat-studio", "reference-studio"].includes(previewVariant) && <div className="preview-session-switcher">
      <button className="preview-session-current" type="button" aria-expanded={sessionMenuOpen} onClick={() => setSessionMenuOpen((open) => !open)}>
        <MessageSquare size={15} />
        <span>{activeSession?.title ?? "选择对话"}</span>
        <ChevronDown size={14} />
      </button>
      <button className="preview-session-create" type="button" title="新建对话" onClick={() => {
        const session = { ...initialSessions[0]!, id: `preview-session-${sessions.length + 1}`, title: `新对话 ${sessions.length + 1}` }
        setSessions((current) => [...current, session])
        setActiveSessionId(session.id)
      }}><Plus size={15} /></button>
      {sessionMenuOpen && <div className="preview-session-menu" role="menu" aria-label="切换对话">
        {sessions.map((session) => <button className={session.id === activeSessionId ? "is-active" : ""} type="button" role="menuitem" key={session.id} onClick={() => { setActiveSessionId(session.id); setSessionMenuOpen(false) }}>{session.title}</button>)}
      </div>}
    </div>}
    <aside className="web-preview-controls" aria-label="Workbench 原型布局切换">
      <div className="web-preview-controls-heading">
        <span className="web-preview-kicker">Workbench prototype</span>
        <strong>选择布局方向</strong>
        <small>只改变前端投影，不创建新会话。Alt + ← / → 可切换。</small>
      </div>
      <div className="web-preview-variant-list">
        {previewVariants.map((variant) => <button
          key={variant.id}
          className={previewVariant === variant.id ? "is-active" : ""}
          type="button"
          onClick={() => setPreviewVariant(variant.id)}
        >
          <span>{variant.label}</span>
          <small>{variant.description}</small>
        </button>)}
      </div>
      <span className="web-preview-badge">Web Preview · 演示状态</span>
    </aside>
  </>
}
