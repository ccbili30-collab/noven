import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, Dispatch, FormEvent, KeyboardEvent, PointerEvent, SetStateAction } from "react"
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Eye,
  Feather,
  FileImage,
  FileText,
  Files,
  Folder,
  FolderOpen,
  Globe2,
  History,
  Info,
  LayoutGrid,
  LoaderCircle,
  Map,
  MessageSquare,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Redo2,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import type {
  AttachmentReference,
  ApprovalRequest,
  CreatXError,
  CreativeLibrarySnapshot,
  FilePreview,
  GrowthGoalProjection,
  ImageTaskAction,
  ImageTaskProjection,
  ModelSettingsSnapshot,
  ProjectFile,
  ProjectSnapshot,
  RestartApplicationResult,
  RunState,
  SessionSummary,
  SaveImageModelSettingsCommand,
  SaveTextModelProfileCommand,
  SaveProjectTextCommand,
  SetCreativeLibraryReactionCommand,
  WorkbenchEntry,
  WorkbenchProjection,
  WorkbenchPresentationProjection,
  WorkbenchSnapshot,
  TimelineItem,
} from "@creatx/contracts"
import { CREATIVE_SLASH_COMMANDS } from "@creatx/creative-skills/slash-commands"
import { growthGoalDisplayInstruction } from "@creatx/creative-skills/growth-goal-instruction"
import { MessageMarkdown } from "./MessageMarkdown"
import { ImageTaskProgress } from "./ImageTaskProgress"
import { ProjectNavigation } from "./ProjectNavigation"
import { IdeaLibraryPage } from "./IdeaLibraryPage"
import { ArtLibraryPage, type ArtLibraryApi, type ArtLibraryRoute } from "./ArtLibraryPage"
import { HeritageLibraryPage } from "./HeritageLibraryPage"
import { ConversationScrollController } from "./conversation-scroll-controller"
import { ProcessingScrollController } from "./processing-scroll-controller"
import { compactActivityItems, projectConversationTurns, type ConversationTurn } from "./timeline-channels"
import { growthActionAvailability, growthOwnerDeliveryMessage, growthTerminalRemainingMs } from "./growth-status-visibility"
import { editDocument, openDocument, redoDocument, saveDocument, undoDocument, type DocumentEditorState } from "./document-editor-state"
import { buildWorkbenchExhibition } from "./workbench-exhibition"
import { appearanceStorageKey, defaultAppearancePreferences, interfaceFontStacks, parseAppearancePreferences, type AppearancePreferences } from "./appearance-preferences"
import { clampWorkspaceSplitRatio, collapsedNavigationWidth, defaultAuxiliaryPanelWidth, defaultWorkspaceMode, scalePanelWidthForViewport, settleProjectNavigationResize, transitionWorkspaceMode, type WorkspaceMode } from "./workspace-layout"
import { SkillSequenceControl } from "./SkillSequenceControl"
import type { SkillSequenceSlot } from "./skill-sequence-preferences"
import { DesktopDialog } from "./DesktopDialog"
import { WorkbenchResourceTree } from "./WorkbenchResourceTree"
import { WorkbenchAnnotationOverlay } from "./WorkbenchAnnotationOverlay"
import { markOnboardingSeen, OnboardingTour, readOnboardingSeen } from "./OnboardingTour"
import { VISIBLE_PRODUCT_NAME } from "../../src/product-brand"
import { isTransientRecoveringError, transientErrorHiddenMs, transientErrorRecoveringMs } from "./transient-error-presentation"

export type RightSurface = "files" | "preview" | { workbenchId: string } | undefined

export function reconcileWorkbenchSurface(surface: RightSurface, workbenches: { workbenches: readonly { id: string }[] } | undefined): RightSurface {
  if (!workbenches || typeof surface !== "object") return surface
  if (workbenches.workbenches.some((workbench) => workbench.id === surface.workbenchId)) return surface
  return { workbenchId: "builtin:files" }
}

type WorkspacePanel = "project" | "conversation" | "workbench" | "inspector"
type WorkspaceSeparator = "project-conversation" | "conversation-workbench" | "workbench-canvas" | "canvas-inspector"

interface WorkspacePanelWidths {
  project: number
  conversation: number
  workbench: number
  inspector: number
}

const panelLayoutStorageKey = "creatx.workspace.panel-widths.v4"
const panelWidthLimits: Record<WorkspacePanel, { min: number; max: number }> = {
  project: { min: collapsedNavigationWidth, max: 520 },
  conversation: { min: 280, max: 620 },
  workbench: { min: 168, max: 520 },
  inspector: { min: 220, max: 420 },
}

interface WorkspaceShellProps {
  configured: boolean
  modelSettings: ModelSettingsSnapshot | undefined
  project: ProjectSnapshot | undefined
  sessions: SessionSummary[]
  activeSession: SessionSummary | undefined
  timeline: TimelineItem[]
  timelineLoading: boolean
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  skillSequenceSlots: readonly SkillSequenceSlot[]
  skillSequenceArmed: boolean
  onSkillSequenceSlotsChange: (slots: SkillSequenceSlot[]) => void
  onSkillSequenceArmedChange: (armed: boolean) => void
  selectedAttachments: AttachmentReference[]
  setSelectedAttachments: Dispatch<SetStateAction<AttachmentReference[]>>
  runState: RunState
  growth: GrowthGoalProjection | undefined
  imageTasks: ImageTaskProjection[]
  error: CreatXError | undefined
  approval: ApprovalRequest | undefined
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  rightSurface: RightSurface
  setRightSurface: Dispatch<SetStateAction<RightSurface>>
  selectedFileId: string | undefined
  preview: FilePreview | undefined
  workbenches: WorkbenchSnapshot | undefined
  workbenchPresentationRequest?: { requestId: number; projectId: string; sessionId: string; workbenchId: string; entry: string } | undefined
  onWorkbenchPresentationRequestHandled?: ((requestId: number) => void) | undefined
  onOpenProject: () => void
  artLibraryEnabled?: boolean
  artLibraryRevision?: number
  artLibraryApi?: ArtLibraryApi
  creativeLibrary: CreativeLibrarySnapshot | undefined
  heritageLibraryEnabled?: boolean
  onCreateSession: () => void
  onCreateProjectSession: (projectId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (sessionId: string) => void
  onRefreshCreativeLibrary: () => Promise<boolean>
  onImportCreativeLibrary: (kind: "idea" | "heritage") => Promise<boolean>
  onSetCreativeLibraryReaction: (command: SetCreativeLibraryReactionCommand) => Promise<boolean>
  onShareToSession: (sessionId: string, prompt: string) => Promise<boolean>
  onOpenArtChat: () => Promise<boolean>
  onRenameSession: (sessionId: string, title: string) => Promise<boolean>
  onRevealProject: (projectId: string) => void
  onDeleteSession: (sessionId: string) => Promise<boolean>
  onDeleteProjectSessions: (projectId: string) => Promise<boolean>
  onRemoveProject: (projectId: string) => void
  onChooseAttachments: () => void
  onDropAttachments: (files: readonly File[]) => void
  onSaveTextModelProfile: (command: SaveTextModelProfileCommand) => Promise<boolean>
  onSelectModel: (profileId: string) => Promise<boolean>
  onSaveImageModelSettings: (command: SaveImageModelSettingsCommand) => Promise<boolean>
  onSend: () => void
  messageDeletionAcknowledged: boolean
  onAcknowledgeMessageDeletion: () => void
  onDeleteUserMessage: (item: TimelineItem) => void
  onEditUserMessage: (item: TimelineItem) => void
  editingMessageId?: string
  onCancelUserMessageEdit: () => void
  onResendUserMessage: (item: TimelineItem) => void
  onCancelRun: () => void
  onSetPermission: (mode: "approval" | "free") => void
  onGrowthAction: (action: "pause" | "resume" | "cancel") => void
  onImageTaskAction: (imageTaskId: string, action: ImageTaskAction) => Promise<boolean>
  onOpenMessageAttachment: (messageId: string, attachmentIndex: number) => void
  onOpenFile: (file: ProjectFile) => void
  onOpenWorkbenchFile: (file: ProjectFile) => void
  onResolveWorkbenchPresentation: (command: { projectId: string; workbenchId: string; entry: string }) => Promise<WorkbenchPresentationProjection | undefined>
  onResolveHtmlPresentation: (projectId: string, fileId: string) => Promise<WorkbenchPresentationProjection | undefined>
  onSaveTextFile: (command: SaveProjectTextCommand) => Promise<FilePreview | undefined>
  onRefresh: () => void
  onRestartApplication: (confirmed: boolean) => Promise<RestartApplicationResult | undefined>
  onApprovalDecision: (approved: boolean) => void
  onDismissError: () => void
  navigationContent?: "sessions" | "workbenches"
  preserveWorkspaceOnSessionChange?: boolean
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const [workbenchMenuOpen, setWorkbenchMenuOpen] = useState(false)
  const [workbenchSearchOpen, setWorkbenchSearchOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [artLibraryOpen, setArtLibraryOpen] = useState(false)
  const [artChatOpen, setArtChatOpen] = useState(false)
  const [artLibraryRoute, setArtLibraryRoute] = useState<ArtLibraryRoute>("atlas")
  const [ideaLibraryOpen, setIdeaLibraryOpen] = useState(false)
  const [heritageLibraryOpen, setHeritageLibraryOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(() => !readOnboardingSeen(window.localStorage))
  const [appearance, setAppearance] = useState(() => parseAppearancePreferences(window.localStorage.getItem(appearanceStorageKey)))
  const [query, setQuery] = useState("")
  const [panelWidths, setPanelWidths] = useState(readPanelWidths)
  const expandedProjectWidth = useRef(panelWidths.project)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(defaultWorkspaceMode)
  const [workbenchNavigationOpen, setWorkbenchNavigationOpen] = useState(true)
  const [editor, setEditor] = useState<DocumentEditorState>()
  const [saving, setSaving] = useState(false)
  const [stageMode, setStageMode] = useState<"render" | "edit" | "exhibition">("render")
  const [interactivePresentation, setInteractivePresentation] = useState<WorkbenchPresentationProjection>()
  const [annotationActive, setAnnotationActive] = useState(false)
  const [annotationDirty, setAnnotationDirty] = useState(false)
  const [workbenchHeadingTarget, setWorkbenchHeadingTarget] = useState<{ fileId: string; heading: string; requestId: number }>()
  const saveInFlight = useRef<Promise<boolean> | undefined>(undefined)
  const handlingPresentationRequest = useRef<number | undefined>(undefined)
  const presentationEpoch = useRef(0)
  const headingRequestId = useRef(0)
  const [resizing, setResizing] = useState<WorkspaceSeparator>()
  const shellRef = useRef<HTMLElement>(null)
  const viewportWidth = useRef(window.innerWidth)
  const drag = useRef<{ separator: WorkspaceSeparator; pointerX: number; widths: WorkspacePanelWidths; latestWidths: WorkspacePanelWidths; projectOpen: boolean; workbenchMode: boolean } | undefined>(undefined)
  const activeWorkbenchId = typeof props.rightSurface === "object" ? props.rightSurface.workbenchId : undefined
  const workbenchCanvasOpen = workspaceMode === "workbench"
  const activeWorkbench = props.workbenches?.workbenches.find((workbench) => workbench.id === activeWorkbenchId)
  const visibleEntries = useMemo(() => {
    const entries = activeWorkbench?.entries ?? projectEntries(props.project)
    const normalized = query.trim().toLocaleLowerCase("zh-CN")
    if (!normalized) return entries
    return entries.filter((entry) => entry.name.toLocaleLowerCase("zh-CN").includes(normalized) || entry.relativePath.toLocaleLowerCase("zh-CN").includes(normalized))
  }, [activeWorkbench, props.project, query])

  useEffect(() => {
    const reconciled = reconcileWorkbenchSurface(props.rightSurface, props.workbenches)
    if (typeof reconciled !== "object" || reconciled.workbenchId === activeWorkbenchId) return
    setInteractivePresentation(undefined)
    setWorkbenchHeadingTarget(undefined)
    props.setRightSurface(reconciled)
  }, [activeWorkbenchId, props.workbenches?.refreshedAt])

  useEffect(() => {
    const preview = props.preview
    if (preview?.content === undefined || (preview.file.kind !== "markdown" && preview.file.kind !== "text")) {
      if (!editor?.dirty) setEditor(undefined)
      return
    }
    if (editor?.fileId === preview.file.id) return
    if (!editor?.dirty) setEditor(openDocument({ fileId: preview.file.id, content: preview.content, modifiedAt: preview.file.modifiedAt }))
  }, [props.preview?.file.id, props.preview?.file.modifiedAt])

  const saveEditor = () => {
    if (saveInFlight.current) return saveInFlight.current
    if (!editor?.dirty || !props.project) return true
    setSaving(true)
    const task = props.onSaveTextFile({ projectId: props.project.id, fileId: editor.fileId, content: editor.content, expectedModifiedAt: editor.modifiedAt }).then((saved) => {
      if (!saved) return false
      setEditor((current) => current?.fileId === saved.file.id ? saveDocument(current, saved.file.modifiedAt) : current)
      return true
    }).finally(() => {
      setSaving(false)
      if (saveInFlight.current === task) saveInFlight.current = undefined
    })
    saveInFlight.current = task
    return task
  }

  const afterSave = (action: () => void) => runAfterEditorSave(saveEditor(), action)

  const discardAnnotation = () => {
    if (!annotationActive) return true
    if (annotationDirty && !window.confirm("当前批注还没有加入对话，确定丢弃并继续吗？")) return false
    setAnnotationActive(false)
    setAnnotationDirty(false)
    return true
  }

  const afterAnnotation = (action: () => void) => {
    if (!discardAnnotation()) return
    action()
  }

  const returnToWorkspace = (action: () => void) => {
    setSettingsOpen(false)
    setArtLibraryOpen(false)
    setArtChatOpen(false)
    setIdeaLibraryOpen(false)
    setHeritageLibraryOpen(false)
    action()
  }

  const showOnboardingSurface = (surface: "workspace" | "settings" | "art" | "idea" | "heritage") => {
    props.setLeftOpen(true)
    void afterSave(() => afterAnnotation(() => {
      setSettingsOpen(surface === "settings")
      setArtLibraryOpen(surface === "art")
      setArtChatOpen(false)
      setIdeaLibraryOpen(surface === "idea")
      setHeritageLibraryOpen(surface === "heritage")
      if (surface === "art") setArtLibraryRoute("atlas")
    }))
  }

  const openWorkbenchFile = async (file: ProjectFile, heading?: string) => {
    if (file.id === editor?.fileId && workbenchCanvasOpen) {
      if (heading) setWorkbenchHeadingTarget({ fileId: file.id, heading, requestId: ++headingRequestId.current })
      return
    }
    if (!discardAnnotation()) return
    const epoch = ++presentationEpoch.current
    if (!await saveEditor()) return
    setStageMode("render")
    setInteractivePresentation(undefined)
    if (activeWorkbenchId) props.setRightSurface({ workbenchId: activeWorkbenchId })
    setWorkspaceMode((current) => transitionWorkspaceMode(current, "open-workbench"))
    props.onOpenWorkbenchFile(file)
    setWorkbenchHeadingTarget(heading ? { fileId: file.id, heading, requestId: ++headingRequestId.current } : undefined)
    if (file.kind !== "html" || !props.project) return
    const presentation = await props.onResolveHtmlPresentation(props.project.id, file.id)
    if (presentation && epoch === presentationEpoch.current) setInteractivePresentation(presentation)
  }

  const changeStageMode = async (mode: "render" | "edit" | "exhibition") => {
    if (mode === stageMode) return
    if (stageMode !== "edit" || await saveEditor()) {
      setInteractivePresentation(undefined)
      setStageMode(mode)
    }
  }

  const showWorkbenchPresentation = async (workbench: WorkbenchProjection, entry: string, annotationAlreadyDiscarded = false) => {
    if (!annotationAlreadyDiscarded && !discardAnnotation()) return
    const epoch = ++presentationEpoch.current
    if (!props.project || !await saveEditor()) return
    setInteractivePresentation(undefined)
    const presentation = await props.onResolveWorkbenchPresentation({ projectId: props.project.id, workbenchId: workbench.id, entry })
    if (!presentation || epoch !== presentationEpoch.current) return
    props.setRightSurface({ workbenchId: workbench.id })
    setWorkspaceMode((current) => transitionWorkspaceMode(current, "open-workbench"))
    setStageMode("render")
    setInteractivePresentation(presentation)
  }

  const selectWorkbench = async (workbenchId: string) => {
    if (!discardAnnotation()) return
    if (!await saveEditor()) return
    const workbench = props.workbenches?.workbenches.find((candidate) => candidate.id === workbenchId)
    props.setRightSurface({ workbenchId })
    setWorkspaceMode((current) => transitionWorkspaceMode(current, "open-workbench"))
    setWorkbenchMenuOpen(false)
    setDetailsOpen(false)
    setInteractivePresentation(undefined)
    if (workbench?.home?.state === "ready") await showWorkbenchPresentation(workbench, workbench.home.entry, true)
  }

  useEffect(() => {
    const request = props.workbenchPresentationRequest
    if (!request || request.projectId !== props.project?.id || request.sessionId !== props.activeSession?.id) return
    const workbench = props.workbenches?.workbenches.find((candidate) => candidate.id === request.workbenchId)
    if (!workbench || handlingPresentationRequest.current === request.requestId) return
    handlingPresentationRequest.current = request.requestId
    void showWorkbenchPresentation(workbench, request.entry).finally(() => {
      props.onWorkbenchPresentationRequestHandled?.(request.requestId)
      if (handlingPresentationRequest.current === request.requestId) handlingPresentationRequest.current = undefined
    })
  }, [props.workbenchPresentationRequest?.requestId, props.workbenches?.refreshedAt])

  useEffect(() => {
    setInteractivePresentation(undefined)
    setWorkbenchHeadingTarget(undefined)
  }, [props.project?.id])

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1100px)")
    const narrow = window.matchMedia("(max-width: 900px)")
    const closeProjectNavigation = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) props.setLeftOpen(false)
    }
    const closeWorkbenchNavigation = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setWorkbenchNavigationOpen(false)
    }
    closeProjectNavigation(compact)
    closeWorkbenchNavigation(narrow)
    compact.addEventListener("change", closeProjectNavigation)
    narrow.addEventListener("change", closeWorkbenchNavigation)
    return () => {
      compact.removeEventListener("change", closeProjectNavigation)
      narrow.removeEventListener("change", closeWorkbenchNavigation)
    }
  }, [props.setLeftOpen])

  useEffect(() => {
    window.localStorage.setItem(panelLayoutStorageKey, JSON.stringify(panelWidths))
  }, [panelWidths])

  useEffect(() => {
    const resize = () => {
      const previous = viewportWidth.current
      const next = window.innerWidth
      if (previous === next) return
      viewportWidth.current = next
      setPanelWidths((current) => ({
        ...current,
        project: scalePanelWidthForViewport(current.project, previous, next, panelWidthLimits.project.min, panelWidthLimits.project.max),
        conversation: scalePanelWidthForViewport(current.conversation, previous, next, panelWidthLimits.conversation.min, panelWidthLimits.conversation.max),
        workbench: scalePanelWidthForViewport(current.workbench, previous, next, panelWidthLimits.workbench.min, panelWidthLimits.workbench.max),
      }))
      if (props.leftOpen) expandedProjectWidth.current = scalePanelWidthForViewport(expandedProjectWidth.current, previous, next, panelWidthLimits.project.min, panelWidthLimits.project.max)
    }
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(appearanceStorageKey, JSON.stringify(appearance))
  }, [appearance])

  useEffect(() => {
    setWorkspaceMode((current) => transitionWorkspaceMode(current, "change-session", props.preserveWorkspaceOnSessionChange))
  }, [props.activeSession?.id, props.preserveWorkspaceOnSessionChange])

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (!drag.current) return
      const widths = resizePanels(drag.current.widths, drag.current.separator, event.clientX - drag.current.pointerX, drag.current.projectOpen, drag.current.workbenchMode)
      drag.current.latestWidths = widths
      applyPanelWidths(shellRef.current, widths)
      shellRef.current?.querySelector(`[data-separator="${drag.current.separator}"]`)?.setAttribute("aria-valuenow", String(separatorValue(widths, drag.current.separator)))
    }
    const stop = () => {
      const completedDrag = drag.current
      drag.current = undefined
      if (completedDrag?.separator === "project-conversation") {
        const outcome = settleProjectNavigationResize(completedDrag.widths.project, completedDrag.latestWidths.project)
        if (!outcome.collapsed) expandedProjectWidth.current = outcome.width
        setPanelWidths({ ...completedDrag.latestWidths, project: outcome.collapsed ? expandedProjectWidth.current : outcome.width })
        if (outcome.collapsed) props.setLeftOpen(false)
      } else if (completedDrag) setPanelWidths(completedDrag.latestWidths)
      setResizing(undefined)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])

  const beginResize = (separator: WorkspaceSeparator, event: PointerEvent<HTMLDivElement>) => {
    if (workspaceSeparatorDisabled(separator, props.leftOpen, workbenchCanvasOpen && workbenchNavigationOpen)) return
    event.preventDefault()
    if (separator === "project-conversation") expandedProjectWidth.current = panelWidths.project
    drag.current = { separator, pointerX: event.clientX, widths: panelWidths, latestWidths: panelWidths, projectOpen: props.leftOpen, workbenchMode: workbenchCanvasOpen }
    setResizing(separator)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const nudgeResize = (separator: WorkspaceSeparator, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    if (workspaceSeparatorDisabled(separator, props.leftOpen, workbenchCanvasOpen && workbenchNavigationOpen)) return
    event.preventDefault()
    setPanelWidths((current) => {
      const next = resizePanels(current, separator, event.key === "ArrowRight" ? 12 : -12, props.leftOpen, workbenchCanvasOpen)
      if (separator !== "project-conversation") return next
      const outcome = settleProjectNavigationResize(expandedProjectWidth.current, next.project)
      if (outcome.collapsed) props.setLeftOpen(false)
      if (event.key === "ArrowRight") expandedProjectWidth.current = outcome.width
      return { ...next, project: outcome.collapsed ? expandedProjectWidth.current : next.project }
    })
  }

  const displayedPanelWidths = drag.current?.latestWidths ?? panelWidths
  const layoutStyle = {
    "--wb-project-nav-width": `${displayedPanelWidths.project}px`,
    "--wb-conversation-width": `${displayedPanelWidths.conversation}px`,
    "--wb-workbench-width": `${displayedPanelWidths.workbench}px`,
    "--wb-inspector-width": `${displayedPanelWidths.inspector}px`,
    "--wb-interface-font": interfaceFontStacks[appearance.font],
    "--wb-interface-font-size": `${appearance.interfaceFontSize}px`,
    "--wb-interface-font-delta": `${appearance.interfaceFontSize - 13}px`,
    "--wb-reading-font-size": `${appearance.readingFontSize}px`,
  } as CSSProperties

  const separator = (id: WorkspaceSeparator, label: string) => {
    const panel: WorkspacePanel = id === "project-conversation" ? "project" : id === "conversation-workbench" ? "conversation" : id === "workbench-canvas" ? "workbench" : "inspector"
    return <PanelResizeHandle
      key={id}
      id={id}
      label={label}
      active={resizing === id}
      disabled={workspaceSeparatorDisabled(id, props.leftOpen, workbenchCanvasOpen && workbenchNavigationOpen)}
      value={panelWidths[panel]}
      min={panelWidthLimits[panel].min}
      max={panelWidthLimits[panel].max}
      onPointerDown={(event) => beginResize(id, event)}
      onKeyDown={(event) => nudgeResize(id, event)}
    />
  }

  return <main
    ref={shellRef}
    className={`workspace-shell worldbuilder-app ${props.leftOpen ? "" : "project-nav-collapsed"} ${workbenchCanvasOpen ? "" : "workbench-canvas-collapsed"} ${workbenchNavigationOpen ? "" : "workbench-navigation-collapsed"}`}
    data-run-state={props.runState}
    data-resizing={resizing}
    data-layout-mode={workspaceMode}
    data-surface-mode="paper"
    style={layoutStyle}
  >
    <ProjectNavigation {...props}
      navigationContent={props.navigationContent}
      {...(props.navigationContent === "workbenches" && props.workbenches ? { projectWorkbenches: props.workbenches.workbenches } : {})}
      activeWorkbenchId={activeWorkbenchId}
      workbenchOpen={workbenchCanvasOpen}
      selectedFileId={props.selectedFileId}
      onSelectWorkbench={(workbenchId) => void selectWorkbench(workbenchId)}
      onOpenWorkbenchFile={(file) => void openWorkbenchFile(file)}
      onOpenOnboarding={() => {
        props.setLeftOpen(true)
        setOnboardingOpen(true)
      }}
      artLibraryActive={artLibraryOpen || artChatOpen}
      {...(props.artLibraryEnabled ? { onOpenArtLibrary: () => void afterSave(() => afterAnnotation(() => { setSettingsOpen(false); setIdeaLibraryOpen(false); setHeritageLibraryOpen(false); setArtChatOpen(false); setArtLibraryRoute("atlas"); setArtLibraryOpen(true) })) } : {})}
      ideaLibraryActive={ideaLibraryOpen}
      onOpenIdeaLibrary={() => void afterSave(() => afterAnnotation(() => { setSettingsOpen(false); setArtLibraryOpen(false); setArtChatOpen(false); setHeritageLibraryOpen(false); setIdeaLibraryOpen(true) }))}
      heritageLibraryActive={heritageLibraryOpen}
      {...(props.heritageLibraryEnabled ? { onOpenHeritageLibrary: () => void afterSave(() => afterAnnotation(() => { setSettingsOpen(false); setArtLibraryOpen(false); setArtChatOpen(false); setIdeaLibraryOpen(false); setHeritageLibraryOpen(true) })) } : {})}
      onOpenSettings={() => void afterSave(() => afterAnnotation(() => { setArtLibraryOpen(false); setArtChatOpen(false); setIdeaLibraryOpen(false); setHeritageLibraryOpen(false); setSettingsOpen(true) }))}
      onOpenProject={() => void afterSave(() => afterAnnotation(() => returnToWorkspace(props.onOpenProject)))}
      onCreateSession={() => void afterSave(() => afterAnnotation(() => returnToWorkspace(props.onCreateSession)))}
      onCreateProjectSession={(projectId) => void afterSave(() => afterAnnotation(() => returnToWorkspace(() => props.onCreateProjectSession(projectId))))}
      onSelectProject={(projectId) => void afterSave(() => afterAnnotation(() => returnToWorkspace(() => props.onSelectProject(projectId))))}
      onSelectSession={(sessionId) => void afterSave(() => afterAnnotation(() => returnToWorkspace(() => props.onSelectSession(sessionId))))}
    />
    {separator("project-conversation", "调整项目导航与会话宽度")}
    {artChatOpen ? <ArtLibraryChatSurface props={props} onOpenModelSettings={() => { setArtChatOpen(false); setSettingsOpen(true) }} onRoute={(route) => { setArtChatOpen(false); setArtLibraryRoute(route); setArtLibraryOpen(true) }} /> : artLibraryOpen && props.artLibraryEnabled ? <ArtLibraryPage route={artLibraryRoute} {...(props.artLibraryRevision === undefined ? {} : { revision: props.artLibraryRevision })} {...(props.artLibraryApi ? { api: props.artLibraryApi } : {})} onOpenChat={() => {
      void props.onOpenArtChat().then((opened) => {
        if (!opened) return
        setArtLibraryOpen(false)
        setArtChatOpen(true)
      })
    }} /> : ideaLibraryOpen ? <IdeaLibraryPage
      onClose={() => setIdeaLibraryOpen(false)}
      imported={props.creativeLibrary?.ideaItems ?? []}
      reactions={props.creativeLibrary?.reactions ?? []}
      sessions={props.sessions}
      onImport={() => props.onImportCreativeLibrary("idea")}
      onRefresh={props.onRefreshCreativeLibrary}
      onReaction={(itemId, reaction, value) => props.onSetCreativeLibraryReaction({ kind: "idea", itemId, reaction, value })}
      onShare={props.onShareToSession}
    /> : heritageLibraryOpen ? <HeritageLibraryPage
      onClose={() => setHeritageLibraryOpen(false)}
      imported={props.creativeLibrary?.heritageItems ?? []}
      reactions={props.creativeLibrary?.reactions ?? []}
      sessions={props.sessions}
      onImport={() => props.onImportCreativeLibrary("heritage")}
      onRefresh={props.onRefreshCreativeLibrary}
      onReaction={(itemId, reaction, value) => props.onSetCreativeLibraryReaction({ kind: "heritage", itemId, reaction, value })}
      onShare={props.onShareToSession}
    /> : settingsOpen ? <SettingsPage
      settings={props.modelSettings}
      onClose={() => setSettingsOpen(false)}
      onSaveText={props.onSaveTextModelProfile}
      onSaveImage={props.onSaveImageModelSettings}
      appearance={appearance}
      onAppearance={setAppearance}
    /> : <>
      <ConversationPanel {...props} showSessionList onOpenModelSettings={() => setSettingsOpen(true)} onOpenProjectFile={(file, heading) => void openWorkbenchFile(file, heading)} />
      {separator("conversation-workbench", "调整对话与工作台画布宽度")}
      <CreationStage
      project={props.project}
      workbench={activeWorkbench}
      preview={props.preview}
      interactivePresentation={interactivePresentation}
      onOpenProject={props.onOpenProject}
      {...(props.artLibraryEnabled ? { onOpenArtLibrary: () => void afterSave(() => { setSettingsOpen(false); setIdeaLibraryOpen(false); setHeritageLibraryOpen(false); setArtChatOpen(false); setArtLibraryRoute("atlas"); setArtLibraryOpen(true) }) } : {})}
      onRefresh={interactivePresentation && activeWorkbench ? () => { props.onRefresh(); void showWorkbenchPresentation(activeWorkbench, interactivePresentation.entry) } : props.onRefresh}
      collapsed={!workbenchCanvasOpen}
      onCollapseWorkbench={() => setWorkspaceMode((current) => transitionWorkspaceMode(current, "collapse-workbench"))}
      detailsOpen={detailsOpen}
      onToggleDetails={() => setDetailsOpen((open) => !open)}
      editor={editor}
      saving={saving}
      mode={stageMode}
      onMode={(mode) => void changeStageMode(mode)}
      entries={activeWorkbench?.entries ?? projectEntries(props.project)}
      onOpenFile={(file) => void openWorkbenchFile(file)}
      headingTarget={workbenchHeadingTarget}
      onHeadingScrolled={(requestId) => setWorkbenchHeadingTarget((current) => current?.requestId === requestId ? undefined : current)}
      onOpenProjectFile={(file, heading) => void openWorkbenchFile(file, heading)}
      onEdit={(content) => setEditor((current) => current ? editDocument(current, content) : current)}
      onUndo={() => setEditor((current) => current ? undoDocument(current) : current)}
      onRedo={() => setEditor((current) => current ? redoDocument(current) : current)}
      annotationActive={annotationActive}
      onAnnotationActive={setAnnotationActive}
      onAnnotationDirty={setAnnotationDirty}
      canAttachAnnotation={props.selectedAttachments.length < 20}
      onAnnotationAttachment={(attachment) => {
        props.setSelectedAttachments((current) => [...current, attachment])
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus())
      }}
      />
      {separator("workbench-canvas", "调整工作台画布与工作台导航宽度")}
      <WorkbenchTree
      sessions={props.sessions.filter((session) => session.projectId === props.project?.id)}
      activeSession={props.activeSession}
      workbenches={props.workbenches}
      activeWorkbench={activeWorkbench}
      activeWorkbenchId={activeWorkbenchId}
      showSessionList={false}
      entries={visibleEntries}
      project={props.project}
      selectedFileId={props.selectedFileId}
      query={query}
      menuOpen={workbenchMenuOpen}
      searchOpen={workbenchSearchOpen}
      navigationOpen={workbenchNavigationOpen}
      onToggleNavigation={() => setWorkbenchNavigationOpen((open) => !open)}
      onToggleMenu={() => setWorkbenchMenuOpen((open) => !open)}
      onToggleSearch={() => setWorkbenchSearchOpen((open) => !open)}
      canvasOpen={workbenchCanvasOpen}
      onToggleCanvas={() => setWorkspaceMode((current) => transitionWorkspaceMode(current, workbenchCanvasOpen ? "collapse-workbench" : "open-workbench"))}
      detailsOpen={detailsOpen}
      onToggleDetails={() => setDetailsOpen((open) => !open)}
      onQuery={setQuery}
      onSelectWorkbench={(workbenchId) => void selectWorkbench(workbenchId)}
      onOpenFile={(file) => void openWorkbenchFile(file)}
      onSelectSession={(sessionId) => void afterSave(() => afterAnnotation(() => props.onSelectSession(sessionId)))}
      onCreateSession={() => void afterSave(() => afterAnnotation(props.onCreateSession))}
      />
      {workbenchCanvasOpen && detailsOpen && <Inspector {...props} workbench={activeWorkbench} onClose={() => setDetailsOpen(false)} />}
    </>}
    {props.approval && <ApprovalDialog approval={props.approval} onDecision={props.onApprovalDecision} />}
    {onboardingOpen && <OnboardingTour
      onDismiss={() => {
        markOnboardingSeen(window.localStorage)
        setOnboardingOpen(false)
        returnToWorkspace(() => undefined)
      }}
      onSurface={showOnboardingSurface}
    />}
  </main>
}

export function runAfterEditorSave(saved: boolean | Promise<boolean>, action: () => void) {
  if (typeof saved === "boolean") {
    if (saved) action()
    return
  }
  void saved.then((accepted) => {
    if (accepted) action()
  })
}

function ArtLibraryChatSurface({ props, onOpenModelSettings, onRoute }: { props: WorkspaceShellProps; onOpenModelSettings: () => void; onRoute: (route: ArtLibraryRoute) => void }) {
  return <section className="wb-art-chat" aria-label="艺术库 Chat">
    <header className="wb-art-chat-header">
      <div><Palette size={17} /><span><strong>艺术库 Chat</strong><small>与策展助手讨论、整理和送审</small></span></div>
      <nav aria-label="艺术库页面">
        <button type="button" onClick={() => onRoute("approval")}><Check size={15} />审批</button>
        <button type="button" onClick={() => onRoute("exhibition")}><Eye size={15} />展览</button>
      </nav>
    </header>
    <ConversationPanel {...props} growth={undefined} onOpenModelSettings={onOpenModelSettings} />
  </section>
}

function PanelResizeHandle(props: {
  id: WorkspaceSeparator
  label: string
  active: boolean
  disabled: boolean
  value: number
  min: number
  max: number
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  return <div
    className={`wb-panel-resizer ${props.active ? "is-active" : ""}`}
    data-separator={props.id}
    role="separator"
    aria-label={props.label}
    aria-orientation="vertical"
    aria-valuemin={props.min}
    aria-valuemax={props.max}
    aria-valuenow={props.value}
    aria-disabled={props.disabled}
    tabIndex={props.disabled ? -1 : 0}
    onPointerDown={props.onPointerDown}
    onKeyDown={props.onKeyDown}
  />
}

function readPanelWidths(): WorkspacePanelWidths {
  const defaults = defaultPanelWidths()
  const saved = window.localStorage.getItem(panelLayoutStorageKey)
  if (!saved) return defaults
  try {
    const parsed = JSON.parse(saved) as Partial<Record<WorkspacePanel, unknown>>
    return {
      project: clampPanelWidth("project", parsed.project, defaults),
      conversation: clampPanelWidth("conversation", parsed.conversation, defaults),
      workbench: clampPanelWidth("workbench", parsed.workbench, defaults),
      inspector: clampPanelWidth("inspector", parsed.inspector, defaults),
    }
  } catch {
    return defaults
  }
}

function defaultPanelWidths(): WorkspacePanelWidths {
  return {
    project: defaultAuxiliaryPanelWidth(window.innerWidth, 220),
    conversation: 320,
    workbench: defaultAuxiliaryPanelWidth(window.innerWidth, panelWidthLimits.workbench.min),
    inspector: 292,
  }
}

function clampPanelWidth(panel: WorkspacePanel, value: unknown, defaults = defaultPanelWidths()) {
  const width = typeof value === "number" && Number.isFinite(value) ? value : defaults[panel]
  return Math.min(panelWidthLimits[panel].max, Math.max(panelWidthLimits[panel].min, Math.round(width)))
}

function resizePanels(widths: WorkspacePanelWidths, separator: WorkspaceSeparator, requestedDelta: number, projectOpen: boolean, workbenchMode: boolean): WorkspacePanelWidths {
  if (separator === "project-conversation") {
    const proposed = clampPanelWidth("project", widths.project + requestedDelta)
    return { ...widths, project: Math.min(proposed, Math.max(panelWidthLimits.project.min, window.innerWidth - widths.conversation - 302)) }
  }
  if (separator === "conversation-workbench") {
    if (!workbenchMode) return resizePair(widths, "conversation", "workbench", requestedDelta)
    const proposed = clampPanelWidth("conversation", widths.conversation + requestedDelta)
    const projectWidth = projectOpen ? widths.project : 52
    const max = Math.max(panelWidthLimits.conversation.min, window.innerWidth - projectWidth - 302)
    return { ...widths, conversation: Math.min(proposed, max) }
  }
  if (separator === "workbench-canvas") {
    const proposed = clampPanelWidth("workbench", widths.workbench - requestedDelta)
    return { ...widths, workbench: Math.min(proposed, canvasBudget(widths, "workbench", projectOpen)) }
  }
  const proposed = clampPanelWidth("inspector", widths.inspector - requestedDelta)
  return { ...widths, inspector: Math.min(proposed, canvasBudget(widths, "inspector", projectOpen)) }
}

function applyPanelWidths(shell: HTMLElement | null, widths: WorkspacePanelWidths) {
  if (!shell) return
  shell.style.setProperty("--wb-project-nav-width", `${widths.project}px`)
  shell.style.setProperty("--wb-conversation-width", `${widths.conversation}px`)
  shell.style.setProperty("--wb-workbench-width", `${widths.workbench}px`)
  shell.style.setProperty("--wb-inspector-width", `${widths.inspector}px`)
}

function separatorValue(widths: WorkspacePanelWidths, separator: WorkspaceSeparator) {
  if (separator === "project-conversation") return widths.project
  if (separator === "conversation-workbench") return widths.conversation
  if (separator === "workbench-canvas") return widths.workbench
  return widths.inspector
}

function canvasBudget(widths: WorkspacePanelWidths, panel: "workbench" | "inspector", projectOpen: boolean) {
  const projectWidth = projectOpen ? widths.project : 52
  const companionWidth = panel === "inspector" ? widths.workbench : 0
  const fixed = projectWidth + widths.conversation + 3 + companionWidth
  return Math.max(panelWidthLimits[panel].min, Math.min(panelWidthLimits[panel].max, window.innerWidth - fixed - 300))
}

function resizePair(widths: WorkspacePanelWidths, left: WorkspacePanel, right: WorkspacePanel, requestedDelta: number) {
  const lower = Math.max(panelWidthLimits[left].min - widths[left], widths[right] - panelWidthLimits[right].max)
  const upper = Math.min(panelWidthLimits[left].max - widths[left], widths[right] - panelWidthLimits[right].min)
  const bounded = Math.min(upper, Math.max(lower, requestedDelta))
  return { ...widths, [left]: widths[left] + bounded, [right]: widths[right] - bounded }
}

function ConversationPanel(props: WorkspaceShellProps & { onOpenModelSettings: () => void; showSessionList?: boolean; onOpenProjectFile?: ((file: ProjectFile, heading?: string) => void) | undefined }) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [slashSelection, setSlashSelection] = useState(0)
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [pendingMessageDeletion, setPendingMessageDeletion] = useState<{ item: TimelineItem; returnFocus: HTMLElement }>()
  const dropDepth = useRef(0)
  const slashMatch = props.draft.match(/^\/([^\s]*)$/)
  const slashQuery = slashMatch?.[1]?.toLocaleLowerCase("en-US")
  const slashCommands = slashQuery === undefined || slashMenuDismissed ? [] : CREATIVE_SLASH_COMMANDS.filter((item) => {
    const candidates = [item.command.slice(1), ...item.aliases.map((alias) => alias.slice(1)), item.title]
    return candidates.some((candidate) => candidate.toLocaleLowerCase("en-US").includes(slashQuery ?? ""))
  })
  useEffect(() => {
    if (!dropActive) return
    const cancelDrop = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      dropDepth.current = 0
      setDropActive(false)
    }
    window.addEventListener("keydown", cancelDrop)
    return () => window.removeEventListener("keydown", cancelDrop)
  }, [dropActive])
  const modelSwitchDisabled = !props.activeSession || props.runState === "running" || props.growth?.status === "active"
  const currentProfile = props.modelSettings?.textProfiles.find((profile) => profile.providerId === props.activeSession?.providerId && profile.modelId === props.activeSession?.modelId)
    ?? props.modelSettings?.textProfiles.find((profile) => profile.id === props.modelSettings?.selectedTextProfileId)
  const currentModel = currentProfile?.name ?? props.activeSession?.modelId ?? "配置模型"
  const permissionMode = props.activeSession?.permission.mode ?? "approval"
  const conversationProjectName = props.activeSession && props.activeSession.projectId !== props.project?.id
    ? props.activeSession.displayPath.split(/[\\/]/).filter(Boolean).at(-1) ?? props.activeSession.title
    : props.project?.name ?? "创作项目"
  const activeProjectReady = !props.activeSession || props.activeSession.projectId === props.project?.id
  const conversationProject = conversationProjectForSession(props.project, props.activeSession)
  const processing = workspaceIsProcessing(props.runState, props.growth?.status)
  const detachedGrowthActivity = props.timeline.some((item) => item.itemId.startsWith("growth:"))
    || (props.growth?.status === "active" && !props.timeline.some((item) => item.itemId.startsWith("local-") && item.kind === "message" && item.presentation === "user"))
  const turns = useMemo(() => projectConversationTurns(props.timeline, processing, detachedGrowthActivity), [props.timeline, processing, detachedGrowthActivity])
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const scrollController = useRef(new ConversationScrollController())
  const [newActivity, setNewActivity] = useState(false)
  useEffect(() => {
    scrollController.current.switchSession(props.activeSession?.id)
    setNewActivity(false)
  }, [props.activeSession?.id])
  useEffect(() => {
    const viewport = timelineScrollRef.current
    if (!viewport) return
    setNewActivity(scrollController.current.timelineCommitted(viewport, props.timeline.length > 0))
  }, [props.activeSession?.id, props.timeline])
  const returnToLatest = () => {
    const viewport = timelineScrollRef.current
    if (!viewport) return
    scrollController.current.returnToLatest(viewport)
    setNewActivity(false)
  }
  const selectSlashCommand = (index: number) => {
    const command = slashCommands[index]
    if (!command) return
    props.setDraft(`${command.command} `)
    setSlashMenuDismissed(true)
    setSlashSelection(0)
  }
  return <aside className={`wb-context-panel conversation-stage ${dropActive ? "is-file-drop-target" : ""}`} aria-label="主会话" data-surface="conversation"
    onDragEnter={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return
      event.preventDefault()
      dropDepth.current += 1
      setDropActive(true)
    }}
    onDragOver={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    }}
    onDragLeave={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return
      dropDepth.current = Math.max(0, dropDepth.current - 1)
      if (dropDepth.current === 0) setDropActive(false)
    }}
    onDrop={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return
      event.preventDefault()
      dropDepth.current = 0
      setDropActive(false)
      props.onDropAttachments(Array.from(event.dataTransfer.files))
    }}>
    {dropActive && <div className="wb-file-drop-overlay" role="status"><Paperclip size={24} /><strong>松开以添加到对话</strong><span>文件只会成为待发送附件</span></div>}
    <header className="wb-panel-heading"><div><MessageSquare size={16} /><strong>{conversationProjectName}</strong></div><div className="wb-heading-actions"><button title="新会话" disabled={!props.project || !activeProjectReady} onClick={props.onCreateSession}><Plus size={16} /></button></div></header>
    {props.showSessionList && <div className="wb-conversation-session-strip" aria-label="项目会话列表">
      {props.sessions.filter((session) => session.projectId === (props.activeSession?.projectId ?? props.project?.id)).map((session) => <button key={session.id} data-session-id={session.id} className={session.id === props.activeSession?.id ? "is-active" : ""} title={session.title} onClick={() => void props.onSelectSession(session.id)}><MessageSquare size={12} /><span>{session.title}</span></button>)}
    </div>}
    <div className="wb-context-scroll-region">
      <div className="wb-context-scroll" ref={timelineScrollRef} onScroll={(event) => {
        const viewport = event.currentTarget
        setNewActivity(scrollController.current.scrolled(viewport))
      }}>
        {!props.project && <div className="wb-context-empty"><Globe2 size={24} /><strong>打开你的创作项目</strong><p>文件仍保存在你选择的文件夹中。</p><button onClick={props.onOpenProject}><FolderOpen size={15} />打开项目</button></div>}
        {props.timelineLoading && !props.timeline.length && <div className="wb-context-empty" role="status"><LoaderCircle className="spin" size={22} /><strong>正在打开会话</strong><p>正在读取 {props.activeSession?.title ?? "对话"} 的历史。</p></div>}
        {props.project && !props.timelineLoading && !props.timeline.length && <div className="wb-context-empty"><Feather size={22} /><strong>{conversationProjectName}</strong><p>我已经来到这个项目。想先从哪里开始？</p></div>}
        {turns.map((turn, index) => <ConversationTurnView key={turn.turnId} turn={turn} active={processing && index === turns.length - 1} sessionId={props.activeSession?.id} project={conversationProject} onOpenAttachment={props.onOpenMessageAttachment} onOpenProjectFile={props.onOpenProjectFile}
          messageActionsDisabled={processing || Boolean(props.approval)}
          onDelete={(item, returnFocus) => {
            if (props.messageDeletionAcknowledged) {
              props.onDeleteUserMessage(item)
              return
            }
            setPendingMessageDeletion({ item, returnFocus })
          }}
          onEdit={props.onEditUserMessage}
          onResend={props.onResendUserMessage}
        />)}
      </div>
      {newActivity && <button className="wb-return-to-latest" onClick={returnToLatest}>回到最新</button>}
    </div>
    {props.growth && <GrowthStatus goal={props.growth} canResume={props.activeSession?.permission.mode === "free"} onAction={props.onGrowthAction} />}
    <ImageTaskProgress projectId={props.project?.id} tasks={props.imageTasks} onAction={props.onImageTaskAction} />
    {props.error && <ErrorBanner error={props.error} onClose={props.onDismissError} />}
    {props.selectedAttachments.length > 0 && <div className="wb-composer-attachments">{props.selectedAttachments.map((attachment) => <div className={`attachment-chip ${attachment.kind}`} key={attachment.id}>
      {attachment.kind === "image" && attachment.previewUrl ? <AttachmentImage name={attachment.name} url={attachment.previewUrl} compact /> : <><Paperclip size={12} /><span>{attachment.name}</span></>}
      <button title={`移除附件：${attachment.name}`} onClick={() => props.setSelectedAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X size={11} /></button>
    </div>)}</div>}
    <div className="wb-composer-row">
    <div className="wb-context-composer composer">
      {props.editingMessageId && <div className="wb-message-editing"><span>正在修改一条已发送消息；发送后原消息只在你的界面隐藏。</span><button type="button" onClick={props.onCancelUserMessageEdit}>取消修改</button></div>}
      {slashCommands.length > 0 && <div className="wb-slash-menu" id="creatx-slash-menu" role="listbox" aria-label="创作 Skill 命令">
        {slashCommands.map((command, index) => <button
          type="button"
          role="option"
          aria-selected={index === slashSelection}
          className={index === slashSelection ? "is-selected" : ""}
          key={command.command}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectSlashCommand(index)}
        ><Sparkles size={15} /><span><strong>{command.command}</strong><small>{command.description}</small></span>{command.activation === "growth" && <em>长期运行</em>}</button>)}
      </div>}
      <textarea data-onboarding="composer" value={props.draft} onChange={(event) => { props.setDraft(event.target.value); setSlashMenuDismissed(false); setSlashSelection(0) }} onKeyDown={(event) => {
        if (slashCommands.length > 0) {
          if (event.key === "ArrowDown") { event.preventDefault(); setSlashSelection((current) => (current + 1) % slashCommands.length); return }
          if (event.key === "ArrowUp") { event.preventDefault(); setSlashSelection((current) => (current - 1 + slashCommands.length) % slashCommands.length); return }
          if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); selectSlashCommand(slashSelection); return }
          if (event.key === "Escape") { event.preventDefault(); setSlashMenuDismissed(true); return }
        }
        if (event.key !== "Enter" || event.shiftKey) return
        event.preventDefault()
        props.onSend()
      }} placeholder={props.project ? "问问你对这个世界的看法……" : "请先打开项目"} aria-label="发送消息" aria-autocomplete="list" aria-controls={slashCommands.length > 0 ? "creatx-slash-menu" : undefined} disabled={!props.project} />
      <div className="wb-composer-toolbar">
        <div className="wb-composer-tools-left">
          <div className="wb-composer-menu-anchor">
            <button className={addMenuOpen ? "is-active" : ""} title="添加" aria-expanded={addMenuOpen} onClick={() => { setAddMenuOpen((open) => !open); setModelMenuOpen(false); setPermissionMenuOpen(false) }}><Plus size={16} /></button>
            {addMenuOpen && <div className="wb-composer-popover wb-add-menu" role="menu"><button role="menuitem" disabled={!props.project} onClick={() => { setAddMenuOpen(false); props.onChooseAttachments() }}><Paperclip size={15} /><span>添加附件</span></button></div>}
          </div>
          <div className="wb-permission-switch wb-composer-menu-anchor" aria-label="会话权限">
            <button className={permissionMenuOpen ? "is-active" : ""} title="选择会话权限" aria-expanded={permissionMenuOpen} disabled={!props.activeSession} onClick={() => { setPermissionMenuOpen((open) => !open); setAddMenuOpen(false); setModelMenuOpen(false) }}>{permissionMode === "free" ? <Sparkles size={14} /> : <ShieldCheck size={14} />}{permissionMode === "free" ? "自由" : "审批"}</button>
            {permissionMenuOpen && <div className="wb-composer-popover wb-permission-menu" role="menu" aria-label="会话权限选择">
              <button role="menuitemradio" aria-checked={permissionMode === "approval"} onClick={() => { setPermissionMenuOpen(false); props.onSetPermission("approval") }}><ShieldCheck size={14} /><span>审批</span>{permissionMode === "approval" && <Check size={13} />}</button>
              <button role="menuitemradio" aria-checked={permissionMode === "free"} disabled={props.growth?.status === "active" && permissionMode === "free"} onClick={() => { setPermissionMenuOpen(false); props.onSetPermission("free") }}><Sparkles size={14} /><span>自由</span>{permissionMode === "free" && <Check size={13} />}</button>
            </div>}
          </div>
          <SkillSequenceControl slots={props.skillSequenceSlots} armed={props.skillSequenceArmed} disabled={!props.activeSession || processing} onChange={props.onSkillSequenceSlotsChange} onArmedChange={props.onSkillSequenceArmedChange} />
        </div>
        <div className="wb-composer-tools-right">
          <div className="wb-composer-menu-anchor wb-model-anchor">
            <button className="wb-model-trigger" title={`切换交流模型：${currentModel}`} aria-expanded={modelMenuOpen} onClick={() => { setModelMenuOpen((open) => !open); setAddMenuOpen(false); setPermissionMenuOpen(false) }}><span>{currentModel}</span><ChevronDown size={10} /></button>
            {modelMenuOpen && <div className="wb-composer-popover wb-model-menu" role="menu" aria-label="交流模型">
              {props.modelSettings?.textProfiles.map((profile) => <button role="menuitemradio" aria-checked={profile.providerId === props.activeSession?.providerId && profile.modelId === props.activeSession?.modelId} disabled={modelSwitchDisabled || !profile.apiKeyConfigured} key={profile.id} onClick={() => { setModelMenuOpen(false); void props.onSelectModel(profile.id) }}><span><strong>{profile.name}</strong><small>{profile.modelId}</small></span>{profile.providerId === props.activeSession?.providerId && profile.modelId === props.activeSession?.modelId && <Check size={14} />}</button>)}
              <button className="wb-model-settings-entry" role="menuitem" onClick={() => { setModelMenuOpen(false); props.onOpenModelSettings() }}><Settings2 size={14} /><span>模型配置</span></button>
            </div>}
          </div>
          {props.runState === "running"
            ? <button className="wb-send is-stop" title="停止当前回复" aria-label="停止当前回复" onClick={props.onCancelRun}><Square size={13} fill="currentColor" /></button>
            : <button className="wb-send" title="发送" disabled={!props.project || !props.draft.trim()} onClick={props.onSend}><ArrowUp size={15} /></button>}
        </div>
      </div>
    </div>
    </div>
    {pendingMessageDeletion && <DesktopDialog className="message-delete-dialog" backdropClassName="dialog-backdrop" labelId="message-delete-title" kind="alertdialog" returnFocus={pendingMessageDeletion.returnFocus} onClose={() => setPendingMessageDeletion(undefined)}>
      <><span className="dialog-eyebrow">仅整理本机显示</span><h2 id="message-delete-title">从你的界面删除这条消息？</h2><p>这只会隐藏你在{VISIBLE_PRODUCT_NAME}里看到的这句话。AI 仍保留原消息，已有回复、工具操作和文件不会撤回。</p><div className="dialog-actions"><button data-dialog-initial-focus onClick={() => setPendingMessageDeletion(undefined)}>取消</button><button className="primary" onClick={() => {
        props.onAcknowledgeMessageDeletion()
        props.onDeleteUserMessage(pendingMessageDeletion.item)
        setPendingMessageDeletion(undefined)
      }}>只删除我这边</button></div></>
    </DesktopDialog>}
  </aside>
}

export function workspaceSeparatorDisabled(separator: WorkspaceSeparator, projectOpen: boolean, workbenchBoundaryOpen: boolean) {
  if (separator === "project-conversation") return !projectOpen
  if (separator === "workbench-canvas") return !workbenchBoundaryOpen
  return false
}

export function conversationProjectForSession(project: ProjectSnapshot | undefined, session: SessionSummary | undefined) {
  if (session && session.projectId !== project?.id) return undefined
  return project
}

function WorkbenchTree(props: {
  sessions: SessionSummary[]
  activeSession: SessionSummary | undefined
  workbenches: WorkbenchSnapshot | undefined
  activeWorkbench: WorkbenchProjection | undefined
  activeWorkbenchId: string | undefined
  showSessionList: boolean
  entries: WorkbenchEntry[]
  project: ProjectSnapshot | undefined
  selectedFileId: string | undefined
  query: string
  menuOpen: boolean
  searchOpen: boolean
  canvasOpen: boolean
  navigationOpen: boolean
  detailsOpen: boolean
  onToggleMenu: () => void
  onToggleSearch: () => void
  onToggleCanvas: () => void
  onToggleNavigation: () => void
  onToggleDetails: () => void
  onQuery: (value: string) => void
  onSelectWorkbench: (workbenchId: string) => void
  onOpenFile: (file: ProjectFile) => void
  onSelectSession: (sessionId: string) => void
  onCreateSession: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const splitDrag = useRef<{ pointerY: number; startRatio: number; height: number; latestRatio: number } | undefined>(undefined)
  const [sessionPaneRatio, setSessionPaneRatio] = useState(readWorkspaceSplitRatio)
  const [splitResizing, setSplitResizing] = useState(false)
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set())
  const workbenchKey = props.activeWorkbenchId ?? "builtin:files"
  useEffect(() => {
    window.localStorage.setItem("creatx.workspace.right-sidebar-split.v1", String(sessionPaneRatio))
  }, [sessionPaneRatio])
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (!splitDrag.current) return
      splitDrag.current.latestRatio = clampWorkspaceSplitRatio(splitDrag.current.startRatio + (event.clientY - splitDrag.current.pointerY) / splitDrag.current.height, splitDrag.current.height)
      panelRef.current?.style.setProperty("--wb-session-pane-ratio", `${splitDrag.current.latestRatio * 100}%`)
      panelRef.current?.querySelector('[data-separator="sessions-files"]')?.setAttribute("aria-valuenow", String(Math.round(splitDrag.current.latestRatio * 100)))
    }
    const stop = () => {
      const ratio = splitDrag.current?.latestRatio
      splitDrag.current = undefined
      if (ratio !== undefined) setSessionPaneRatio(ratio)
      setSplitResizing(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])
  if (!props.navigationOpen) {
    return <aside className="wb-tree-panel workbench-rail wb-project-workspace is-collapsed" aria-label="已折叠的工作台导航" data-surface="registered-workbench-rail">
      <div className="wb-workbench-collapsed-rail"><button type="button" title="向左展开工作台导航" onClick={props.onToggleNavigation}><ChevronLeft size={17} /></button>{!props.canvasOpen && <button type="button" title="展开工作台画布" onClick={props.onToggleCanvas}><PanelRightOpen size={17} /></button>}</div>
    </aside>
  }
  return <aside ref={panelRef} className={`wb-tree-panel workbench-rail wb-project-workspace ${props.showSessionList ? "has-session-list" : "resources-only"} ${splitResizing ? "is-split-resizing" : ""}`} aria-label="项目工作台" data-surface="registered-workbench-rail" style={{ "--wb-session-pane-ratio": `${sessionPaneRatio * 100}%` } as CSSProperties}>
    {props.showSessionList && <section className="wb-workspace-session-pane" aria-label="项目会话">
      <header className="wb-panel-heading"><div><MessageSquare size={16} /><strong>会话</strong></div><div className="wb-heading-actions"><button title="新会话" disabled={!props.project} onClick={props.onCreateSession}><Plus size={16} /></button></div></header>
      <div className="wb-workspace-session-list" role="list">
        {props.sessions.map((session) => <button role="listitem" data-session-id={session.id} className={session.id === props.activeSession?.id ? "is-active" : ""} key={session.id} onClick={() => props.onSelectSession(session.id)}><MessageSquare size={14} /><span><strong>{session.title}</strong><small>{formatDate(session.updatedAt)}</small></span></button>)}
        {!props.sessions.length && <span className="wb-tree-empty">还没有会话</span>}
      </div>
    </section>}
    {props.showSessionList && <div
      className="wb-workspace-horizontal-resizer"
      data-separator="sessions-files"
      role="separator"
      aria-label="调整会话列表与文件树高度"
      aria-orientation="horizontal"
      aria-valuemin={25}
      aria-valuemax={70}
      aria-valuenow={Math.round(sessionPaneRatio * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        const height = panelRef.current?.clientHeight ?? 0
        if (height <= 0) return
        event.preventDefault()
        splitDrag.current = { pointerY: event.clientY, startRatio: sessionPaneRatio, height, latestRatio: sessionPaneRatio }
        setSplitResizing(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
        event.preventDefault()
        setSessionPaneRatio((current) => clampWorkspaceSplitRatio(current + (event.key === "ArrowDown" ? .03 : -.03), panelRef.current?.clientHeight ?? 0))
      }}
    />}
    <section className="wb-workspace-file-pane" aria-label="工作台文件树">
    <div className={`wb-workbench-menu-region ${props.menuOpen ? "is-pinned" : ""}`}>
      <header className="wb-panel-heading wb-workbench-heading" data-onboarding="workbench"><button className="wb-workbench-switcher" title="切换工作台" aria-expanded={props.menuOpen} onClick={props.onToggleMenu}><Map size={16} /><strong>{props.activeWorkbench?.title ?? "工作台"}</strong><ChevronDown className={props.menuOpen ? "is-open" : ""} size={14} /></button><button className={`wb-workbench-search-toggle ${props.searchOpen ? "is-active" : ""}`} title="搜索工作台内容" onClick={props.onToggleSearch}><Search size={15} /></button><button className={`wb-workbench-details-toggle ${props.detailsOpen ? "is-active" : ""}`} title={props.detailsOpen ? "关闭工作台目录详情" : "查看工作台目录详情"} aria-pressed={props.detailsOpen} onClick={props.onToggleDetails}><Info size={15} /></button>{!props.canvasOpen && <button className="wb-expand-workbench" title="展开工作台" onClick={props.onToggleCanvas}><PanelRightOpen size={16} /></button>}<button title="向右收起工作台导航" onClick={props.onToggleNavigation}><ChevronRight size={16} /></button></header>
      {props.searchOpen && <label className="wb-filter wb-filter-revealed"><input autoFocus value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="筛选工作台内容……" aria-label="筛选工作台内容" /></label>}
      {props.menuOpen && <div className="wb-workbench-menu is-pinned" role="menu" aria-label="注册工作台">{props.workbenches?.workbenches.map((workbench) => <button role="menuitem" key={workbench.id} className={`workbench-button ${props.activeWorkbenchId === workbench.id ? "is-active active" : ""}`} onClick={() => props.onSelectWorkbench(workbench.id)}><BookOpen size={15} /><span>{workbench.title}</span>{props.activeWorkbenchId === workbench.id && <Check size={14} />}</button>)}{!props.workbenches?.workbenches.length && <span className="wb-tree-empty">还没有注册工作台</span>}</div>}
    </div>
    {props.activeWorkbench?.state === "missing" && <div className="wb-tree-warning"><AlertTriangle size={15} />原文件夹缺失</div>}
    <WorkbenchResourceTree entries={props.entries} project={props.project} selectedFileId={props.selectedFileId} namespace={workbenchKey} collapsedDirectories={collapsedDirectories} variant="rail" onToggleDirectory={(key) => setCollapsedDirectories((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })} onOpenFile={props.onOpenFile} />
    {!props.entries.length && <div className="wb-tree-empty"><FolderOpen size={18} />暂无文件</div>}
    </section>
  </aside>
}

function readWorkspaceSplitRatio() {
  const saved = Number(window.localStorage.getItem("creatx.workspace.right-sidebar-split.v1"))
  return clampWorkspaceSplitRatio(Number.isFinite(saved) && saved > 0 ? saved : .4, window.innerHeight)
}

function CreationStage({ project, workbench, preview, interactivePresentation, onOpenProject, onOpenArtLibrary, onRefresh, collapsed, onCollapseWorkbench, detailsOpen, onToggleDetails, editor, saving, onEdit, onUndo, onRedo, mode, onMode, entries, onOpenFile, headingTarget, onHeadingScrolled, onOpenProjectFile, annotationActive, onAnnotationActive, onAnnotationDirty, canAttachAnnotation, onAnnotationAttachment }: { project: ProjectSnapshot | undefined; workbench: WorkbenchProjection | undefined; preview: FilePreview | undefined; interactivePresentation: WorkbenchPresentationProjection | undefined; onOpenProject: () => void; onOpenArtLibrary?: () => void; onRefresh: () => void; collapsed: boolean; onCollapseWorkbench: () => void; detailsOpen: boolean; onToggleDetails: () => void; editor: DocumentEditorState | undefined; saving: boolean; onEdit: (content: string) => void; onUndo: () => void; onRedo: () => void; mode: "render" | "edit" | "exhibition"; onMode: (mode: "render" | "edit" | "exhibition") => void; entries: WorkbenchEntry[]; onOpenFile: (file: ProjectFile) => void; headingTarget: { fileId: string; heading: string; requestId: number } | undefined; onHeadingScrolled: (requestId: number) => void; onOpenProjectFile: (file: ProjectFile, heading?: string) => void; annotationActive: boolean; onAnnotationActive: (active: boolean) => void; onAnnotationDirty: (dirty: boolean) => void; canAttachAnnotation: boolean; onAnnotationAttachment: (attachment: AttachmentReference) => void }) {
  const exhibition = useMemo(() => buildWorkbenchExhibition(entries), [entries])
  const fileFor = (entry: WorkbenchEntry) => entry.fileId ? project?.files.find((file) => file.id === entry.fileId) : undefined
  const annotationSource = preview?.file ?? (interactivePresentation ? project?.files.find((file) => file.relativePath === interactivePresentation.entry) : undefined)
  return <section className="wb-map-stage workbench-stage" aria-label="创作画布" aria-hidden={collapsed} inert={collapsed} data-surface="workbench-stage">
    <header className="wb-map-toolbar"><div className="wb-map-title">{mode === "exhibition" ? <LayoutGrid size={16} /> : interactivePresentation ? <Globe2 size={16} /> : preview?.file.kind === "image" ? <Map size={16} /> : <FileText size={16} />}<strong>{mode === "exhibition" ? workbench?.title ?? project?.name ?? "展览" : interactivePresentation?.entry ?? preview?.file.name ?? workbench?.title ?? project?.name ?? "创作画布"}</strong></div><div className="wb-map-actions"><div className="wb-stage-mode" role="group" aria-label="工作台显示模式">{mode === "edit" && editor && <><button title="撤销（Ctrl+Z）" disabled={!editor.undoStack.length} onPointerDown={(event) => event.preventDefault()} onClick={onUndo}><Undo2 size={15} /></button><button title="重做（Ctrl+Y）" disabled={!editor.redoStack.length} onPointerDown={(event) => event.preventDefault()} onClick={onRedo}><Redo2 size={15} /></button></>}{editor && !interactivePresentation && <button className={mode === "edit" ? "is-active" : ""} title={mode === "edit" ? "保存并返回预览" : "编辑文件"} disabled={saving || annotationActive} onClick={() => onMode(mode === "edit" ? "render" : "edit")}><SquarePen size={15} /></button>}{annotationSource && mode === "render" && <button className={annotationActive ? "is-active" : ""} title={annotationActive ? "请使用批注工具栏退出" : "视觉批注"} disabled={annotationActive} onClick={() => onAnnotationActive(true)}><Palette size={15} /></button>}<button className={mode === "exhibition" ? "is-active" : ""} disabled={annotationActive} onClick={() => onMode("exhibition")}>展览</button></div><button className={detailsOpen ? "is-active" : ""} title={detailsOpen ? "关闭详情" : "查看当前详情"} aria-pressed={detailsOpen} onClick={onToggleDetails}><Info size={15} /></button><button title="刷新真实文件" onClick={onRefresh} disabled={!project || annotationActive}><RefreshCw size={15} /></button><button className="wb-collapse-workbench" title="收起工作台" disabled={annotationActive} onClick={onCollapseWorkbench}><PanelRightClose size={15} /></button></div></header>
    {mode === "exhibition" ? <div className="wb-exhibition">
      <header><span>作品展览</span><small>{exhibition.groups.length} 个分组 · {exhibition.documents.length} 篇文本 · {exhibition.images.length} 张图片</small></header>
      {(preview?.assetUrl ?? preview?.dataUrl) && <button className="wb-exhibition-hero" onClick={() => onOpenFile(preview.file)}><img src={preview.assetUrl ?? preview.dataUrl} alt={preview.file.name} /><strong>{preview.file.name}</strong></button>}
      {exhibition.groups.length > 0 && <section><h2>分组</h2><div className="wb-exhibition-groups">{exhibition.groups.map((name) => <span key={name}><Folder size={14} />{name}</span>)}</div></section>}
      {exhibition.documents.length > 0 && <section><h2>文本</h2><div className="wb-exhibition-cards">{exhibition.documents.map((entry) => <button key={entry.relativePath} onClick={() => { const file = fileFor(entry); if (file) onOpenFile(file) }}><FileText size={17} /><strong>{entry.name}</strong><small>{entry.relativePath}</small></button>)}</div></section>}
      {exhibition.images.length > 0 && <section><h2>图像</h2><div className="wb-exhibition-cards">{exhibition.images.map((entry) => <button key={entry.relativePath} onClick={() => { const file = fileFor(entry); if (file) onOpenFile(file) }}><FileImage size={17} /><strong>{entry.name}</strong><small>{entry.relativePath}</small></button>)}</div></section>}
      {!exhibition.documents.length && !exhibition.images.length && <div className="wb-stage-empty"><LayoutGrid size={32} /><h1>暂无可展览内容</h1><p>Markdown、文本和图片文件会自动出现在这里。</p></div>}
    </div> :
    <div className={`wb-map-canvas ${interactivePresentation ? "is-interactive" : preview?.assetUrl || preview?.dataUrl ? "is-image" : "is-document"}`} data-annotation-project-id={annotationSource ? project?.id : undefined} data-annotation-source-id={annotationSource?.id}>
      {interactivePresentation && <iframe className="wb-interactive-workbench" title={`${workbench?.title ?? "工作台"}交互界面`} src={interactivePresentation.url} sandbox="allow-scripts allow-same-origin" />}
      {!project && <div className="wb-stage-empty"><Globe2 size={36} /><h1>开始一个创作项目</h1><p>选择已有文件夹，{VISIBLE_PRODUCT_NAME}不会复制或移动你的文件。</p><button onClick={onOpenProject}><FolderOpen size={16} />打开项目</button></div>}
      {project && !preview && !interactivePresentation && <div className="wb-stage-empty"><Files size={32} /><h1>{workbench?.title ?? project.name}</h1><p>{workbench?.home?.state === "missing" ? `默认界面 ${workbench.home.entry} 已不存在，请从目录选择其他文件。` : "从工作台目录中选择一个真实文件，在这里阅读和预览。"}</p></div>}
      {!interactivePresentation && (preview?.assetUrl ?? preview?.dataUrl) && (onOpenArtLibrary
        ? <button className="wb-art-library-preview" type="button" title="在艺术库中查看" onClick={onOpenArtLibrary}>
            <img src={preview.assetUrl ?? preview.dataUrl} alt={preview.file.name} />
            <span>进入艺术库</span>
          </button>
        : <img src={preview.assetUrl ?? preview.dataUrl} alt={preview.file.name} />)}
      {!interactivePresentation && mode === "edit" && editor && preview?.file.id === editor.fileId && <textarea className="wb-document-editor" aria-label={`编辑 ${preview.file.name}`} value={editor.content} onChange={(event) => onEdit(event.currentTarget.value)} onBlur={() => onMode("render")} onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return
        const key = event.key.toLocaleLowerCase("en-US")
        if (key === "s") { event.preventDefault(); onMode("render"); return }
        if (key === "z") { event.preventDefault(); event.shiftKey ? onRedo() : onUndo(); return }
        if (key === "y") { event.preventDefault(); onRedo() }
      }} />}
      {!interactivePresentation && mode === "render" && preview?.content !== undefined && <article className="wb-document-page"><MessageMarkdown text={editor?.fileId === preview.file.id ? editor.content : preview.content} project={project} documentPath={preview.file.relativePath} onOpenProjectFile={onOpenProjectFile} {...(headingTarget?.fileId === preview.file.id ? { scrollToHeading: headingTarget.heading, scrollRequestId: headingTarget.requestId, onScrollToHeading: () => onHeadingScrolled(headingTarget.requestId) } : {})} /></article>}
      {annotationActive && project && annotationSource && <WorkbenchAnnotationOverlay projectId={project.id} sourceId={annotationSource.id} sourceName={annotationSource.name} canAttach={canAttachAnnotation} onAttachment={onAnnotationAttachment} onDirty={onAnnotationDirty} onExit={() => onAnnotationActive(false)} />}
    </div>}
  </section>
}

function Inspector(props: WorkspaceShellProps & { workbench: WorkbenchProjection | undefined; onClose: () => void }) {
  const [position, setPosition] = useState(readInspectorPosition)
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | undefined>(undefined)
  const file = props.preview?.file

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (!drag.current) return
      const width = 286
      const height = 430
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, drag.current.x + event.clientX - drag.current.pointerX)),
        y: Math.max(8, Math.min(window.innerHeight - Math.min(height, window.innerHeight - 16) - 8, drag.current.y + event.clientY - drag.current.pointerY)),
      })
    }
    const stop = () => { drag.current = undefined }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem("creatx.workspace.inspector-position.v1", JSON.stringify(position))
  }, [position])

  return <aside className="wb-inspector wb-floating-inspector" aria-label="当前详情" style={{ left: position.x, top: position.y }}>
    <header className="wb-panel-heading wb-inspector-drag-handle" title="拖动检查器" onPointerDown={(event) => {
      if ((event.target as HTMLElement).closest("button")) return
      event.preventDefault()
      drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}><div><Info size={15} /><strong>当前详情</strong></div><div className="wb-heading-actions"><button title="刷新项目" onClick={props.onRefresh} disabled={!props.project}><RefreshCw size={15} /></button><button title="关闭详情" onClick={props.onClose}><X size={15} /></button></div></header>
    <div className="wb-inspector-scroll">
      <span className="wb-eyebrow">{file ? file.kind === "image" ? "图像" : "文档" : props.workbench ? "工作台" : "项目"}</span>
      <h1>{file?.name ?? props.workbench?.title ?? props.project?.name ?? VISIBLE_PRODUCT_NAME}</h1>
      <span className="wb-subtitle">{file?.relativePath ?? props.workbench?.folder ?? "等待打开项目"}</span>
      <hr />
      <p className="wb-inspector-description">{file ? "当前画布读取的是项目中的真实文件。" : props.project ? "选择工作台和文件后，详细内容会出现在这里。" : `${VISIBLE_PRODUCT_NAME}直接在你的项目文件夹中工作。`}</p>
      <dl className="wb-metadata">
        <div><dt><ShieldCheck size={14} />模型状态</dt><dd>{props.configured ? "已就绪" : "未配置"}</dd></div>
        <div><dt><Sparkles size={14} />会话权限</dt><dd>{props.activeSession?.permission.mode === "free" ? "自由" : "审批"}</dd></div>
        <div><dt><Clock3 size={14} />运行状态</dt><dd>{runStateLabel(props.runState)}</dd></div>
        {file && <><div><dt><Files size={14} />大小</dt><dd>{formatSize(file.size)}</dd></div><div><dt><History size={14} />修改时间</dt><dd>{formatDate(file.modifiedAt)}</dd></div></>}
      </dl>
      {props.growth && <><hr /><strong className="wb-section-label">Growth</strong><p className="wb-notes">{props.growth.statusReason ?? props.growth.instruction}</p></>}
      {props.workbenches?.diagnostics.length ? <><hr /><strong className="wb-section-label">工作台诊断</strong>{props.workbenches.diagnostics.map((diagnostic, index) => <p className="wb-notes" key={`${diagnostic.code}:${index}`}>{diagnostic.message}</p>)}</> : undefined}
    </div>
  </aside>
}

function readInspectorPosition() {
  const fallback = { x: Math.max(8, window.innerWidth - 304), y: 68 }
  const saved = window.localStorage.getItem("creatx.workspace.inspector-position.v1")
  if (!saved) return fallback
  try {
    const value = JSON.parse(saved) as { x?: unknown; y?: unknown }
    return {
      x: typeof value.x === "number" && Number.isFinite(value.x) ? Math.max(8, Math.min(window.innerWidth - 198, value.x)) : fallback.x,
      y: typeof value.y === "number" && Number.isFinite(value.y) ? Math.max(8, Math.min(window.innerHeight - 56, value.y)) : fallback.y,
    }
  } catch {
    return fallback
  }
}

function ConversationTurnView({ turn, active, sessionId, project, onOpenAttachment, onOpenProjectFile, messageActionsDisabled, onDelete, onEdit, onResend }: {
  turn: ConversationTurn
  active: boolean
  sessionId: string | undefined
  project: ProjectSnapshot | undefined
  onOpenAttachment: (messageId: string, index: number) => void
  onOpenProjectFile?: ((file: ProjectFile, heading?: string) => void) | undefined
  messageActionsDisabled: boolean
  onDelete: (item: TimelineItem, returnFocus: HTMLElement) => void
  onEdit: (item: TimelineItem) => void
  onResend: (item: TimelineItem) => void
}) {
  return <section className="wb-conversation-turn">
    {turn.user && <TimelineRow item={turn.user} sessionId={sessionId} project={project} onOpenAttachment={onOpenAttachment} onOpenProjectFile={onOpenProjectFile} messageActionsDisabled={messageActionsDisabled} onDelete={onDelete} onEdit={onEdit} onResend={onResend} />}
    {turn.waiting && <div className="wb-assistant-waiting" role="status" aria-live="polite"><span>旅鸽</span><div><LoaderCircle className="spin" size={14} />正在准备回复…</div></div>}
    {turn.details.length > 0 && <ProcessingDisclosure items={turn.details} active={active} project={project} onOpenAttachment={onOpenAttachment} onOpenProjectFile={onOpenProjectFile} />}
    {turn.notices.map((item) => <TimelineRow key={item.itemId} item={item} sessionId={undefined} project={project} onOpenAttachment={onOpenAttachment} onOpenProjectFile={onOpenProjectFile} />)}
    {turn.final && <TimelineRow item={turn.final} sessionId={sessionId} project={project} onOpenAttachment={onOpenAttachment} onOpenProjectFile={onOpenProjectFile} />}
  </section>
}

export function ProcessingDisclosure({ items, active, project, onOpenAttachment, onOpenProjectFile }: {
  items: TimelineItem[]
  active: boolean
  project: ProjectSnapshot | undefined
  onOpenAttachment: (messageId: string, index: number) => void
  onOpenProjectFile?: ((file: ProjectFile, heading?: string) => void) | undefined
}) {
  const startedAt = useRef<number | undefined>(undefined)
  const scrollViewport = useRef<HTMLDivElement | null>(null)
  const scrollController = useRef(new ProcessingScrollController())
  const wasOpen = useRef(false)
  const [elapsed, setElapsed] = useState(0)
  const [open, setOpen] = useState(active)
  useEffect(() => {
    if (!active) return
    startedAt.current ??= Date.now()
    const update = () => setElapsed(Date.now() - startedAt.current!)
    update()
    const interval = window.setInterval(update, 1_000)
    return () => window.clearInterval(interval)
  }, [active])
  useEffect(() => setOpen(active), [active])
  useLayoutEffect(() => {
    const viewport = scrollViewport.current
    if (!open || !viewport) {
      wasOpen.current = open
      return
    }
    if (!wasOpen.current) scrollController.current.opened(viewport, active)
    scrollController.current.contentCommitted(viewport, active)
    wasOpen.current = true
  }, [active, items, open])
  const duration = elapsed ? ` ${formatElapsed(elapsed)}` : ""
  return <details className={`wb-processing-disclosure ${active ? "is-active" : "is-complete"}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{active ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}<span>{active ? "正在处理" : "已处理"}{duration}</span><ChevronDown size={13} /></summary>
    {open && <div className="wb-processing-scroll" ref={scrollViewport} onScroll={(event) => scrollController.current.scrolled(event.currentTarget)}>
      {compactActivityItems(items).map(({ item, repeatCount }) => <div className="wb-processing-entry" key={item.itemId}>
        {item.activity && <small className="wb-processing-source">{item.activity.title}</small>}
        <TimelineRow item={item} sessionId={undefined} project={project} onOpenAttachment={onOpenAttachment} onOpenProjectFile={onOpenProjectFile} />
        {repeatCount > 1 && <small className="wb-growth-repeat">同一失败重复 {repeatCount} 次</small>}
      </div>)}
    </div>}
  </details>
}

export function workspaceIsProcessing(runState: RunState, growthStatus: GrowthGoalProjection["status"] | undefined) {
  return runState === "running" || growthStatus === "active"
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(1, Math.floor(milliseconds / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m${remainder ? ` ${remainder}s` : ""}`
}

function TimelineRow({ item, sessionId, project, onOpenAttachment, onOpenProjectFile, messageActionsDisabled = false, onDelete, onEdit, onResend }: {
  item: TimelineItem
  sessionId: string | undefined
  project: ProjectSnapshot | undefined
  onOpenAttachment: (messageId: string, index: number) => void
  onOpenProjectFile?: ((file: ProjectFile, heading?: string) => void) | undefined
  messageActionsDisabled?: boolean
  onDelete?: (item: TimelineItem, returnFocus: HTMLElement) => void
  onEdit?: (item: TimelineItem) => void
  onResend?: (item: TimelineItem) => void
}) {
  if (item.kind === "tool") {
    const error = formatTimelineToolError(item.error)
    return <div className={`wb-context-result ${item.state}`} role="status">{item.state === "streaming" ? <LoaderCircle className="spin" size={14} /> : item.state === "completed" ? <Check size={14} /> : <X size={14} />}<div><strong>{toolLabel(item.toolName ?? "工具")}</strong><small>{item.state === "streaming" ? "执行中" : item.state === "completed" ? "已完成" : item.state === "cancelled" ? "已取消" : "失败"}</small>{error && <small className="wb-tool-error" title={error}>{error}</small>}</div></div>
  }
  if (item.kind === "reasoning") {
    return <details className="wb-context-reasoning"><summary>{item.state === "streaming" ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}思考过程</summary>{item.text && <MessageMarkdown text={item.text} project={project} onOpenProjectFile={onOpenProjectFile} />}</details>
  }
  if (item.kind === "notice") {
    return <TimelineNotice item={item} />
  }
  const role = item.presentation === "user" ? "user" : item.presentation === "assistant" ? "assistant" : "system"
  const attachments = item.attachments ?? []
  const localActions = role === "user" && item.itemId.startsWith("message:") && onDelete && onEdit && onResend
  return <article className={`wb-context-message ${role} ${item.state}`}>
    {role !== "user" && <span>{role === "assistant" ? "旅鸽" : "系统"}</span>}
    <MessageMarkdown text={item.text ?? ""} project={project} onOpenProjectFile={onOpenProjectFile} />
    {item.state === "streaming" && <i className="wb-streaming-caret" aria-label="正在生成" />}
    {attachments.length > 0 && <div className="wb-context-attachments">{attachments.map((attachment, index) => {
      if (attachment.kind === "image") {
        const url = attachment.previewUrl ?? (sessionId ? messageAttachmentImageUrl(sessionId, item.itemId, index) : undefined)
        return url ? <AttachmentImage key={`${attachment.displayPath}:${index}`} name={attachment.name} url={url} /> : null
      }
      return item.itemId.startsWith("local-")
        ? <span key={`${attachment.displayPath}:${index}`}><Paperclip size={12} />{attachment.name}</span>
        : <button key={`${attachment.displayPath}:${index}`} onClick={() => onOpenAttachment(item.itemId, index)}><Paperclip size={12} />{attachment.name}</button>
    })}</div>}
    {localActions && <div className="wb-message-actions" aria-label="消息操作">
      <button type="button" title="修改后重新发送" aria-label="修改后重新发送" disabled={messageActionsDisabled} onClick={() => onEdit(item)}><SquarePen size={13} /><span>修改</span></button>
      <button type="button" title="重新发送并隐藏原消息" aria-label="重新发送并隐藏原消息" disabled={messageActionsDisabled} onClick={() => onResend(item)}><RefreshCw size={13} /><span>重发</span></button>
      <button type="button" title="只从你的界面删除" aria-label="只从你的界面删除" onClick={(event) => onDelete(item, event.currentTarget)}><Trash2 size={13} /><span>删除</span></button>
    </div>}
  </article>
}

function TimelineNotice({ item }: { item: TimelineItem }) {
  const transient = isTransientRecoveringError(item.text)
  const [phase, setPhase] = useState<"recovering" | "recovered" | "hidden">("recovering")

  useEffect(() => {
    if (!transient) return
    setPhase("recovering")
    const recovered = window.setTimeout(() => setPhase("recovered"), transientErrorRecoveringMs)
    const hidden = window.setTimeout(() => setPhase("hidden"), transientErrorHiddenMs)
    return () => {
      window.clearTimeout(recovered)
      window.clearTimeout(hidden)
    }
  }, [item.itemId, transient])

  if (transient && phase === "hidden") return null
  return <div className={`wb-context-notice ${transient ? `soft-${phase}` : item.state}`} role="status"><Info size={14} /><span>{transient && phase === "recovered" ? "已恢复！" : item.text}</span></div>
}

function AttachmentImage({ name, url, compact = false }: { name: string; url: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className={`wb-attachment-image ${compact ? "is-compact" : ""}`} title={`查看图片：${name}`} onClick={() => setOpen(true)}><img src={url} alt={name} /><span>{name}</span></button>
    {open && <div className="wb-attachment-lightbox" role="dialog" aria-modal="true" aria-label={name} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <button type="button" className="wb-attachment-lightbox-close" title="关闭图片预览" onClick={() => setOpen(false)}><X size={18} /></button>
      <img src={url} alt={name} />
    </div>}
  </>
}

function messageAttachmentImageUrl(sessionId: string, messageId: string, attachmentIndex: number) {
  return `creatx-attachment://message/${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}/${attachmentIndex}`
}

export function formatTimelineToolError(error?: string) {
  if (!error?.trim()) return ""
  const message = error.trim().replace(/^growth_[a-z_]+:\s*/u, "")
  return message.length > 180 ? `${message.slice(0, 177)}…` : message
}

function GrowthStatus({ goal, canResume, onAction }: { goal: GrowthGoalProjection; canResume: boolean; onAction: (action: "pause" | "resume" | "cancel") => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [terminalVisible, setTerminalVisible] = useState(growthTerminalRemainingMs(goal.status, goal.updatedAt) !== 0)
  const [issueClock, setIssueClock] = useState(Date.now())
  useEffect(() => {
    const remaining = growthTerminalRemainingMs(goal.status, goal.updatedAt)
    if (remaining === undefined) {
      setTerminalVisible(true)
      return
    }
    if (remaining === 0) {
      setTerminalVisible(false)
      return
    }
    setTerminalVisible(true)
    const timeout = window.setTimeout(() => setTerminalVisible(false), remaining)
    return () => window.clearTimeout(timeout)
  }, [goal.status, goal.updatedAt])
  useEffect(() => {
    const expiry = (goal.issues ?? []).flatMap((issue) => issue.resolvedAt ? [new Date(issue.resolvedAt).getTime() + 3_000] : []).filter((time) => time > Date.now()).sort((left, right) => left - right)[0]
    if (!expiry) return
    const timeout = window.setTimeout(() => setIssueClock(Date.now()), expiry - Date.now())
    return () => window.clearTimeout(timeout)
  }, [goal.issues])
  const displayInstruction = growthGoalDisplayInstruction(goal.instruction)
  const awaitingOwnerReply = goal.ownerReplyPending === true
  const waitingForUser = goal.status === "waiting" && goal.issues?.some((issue) => issue.status === "waiting_user")
  const actions = growthActionAvailability(goal.status, awaitingOwnerReply, waitingForUser === true)
  const statusLabel = awaitingOwnerReply ? "正在整理结果" : waitingForUser ? "等待回复" : growthStatusLabel(goal.status)
  const terminal = !awaitingOwnerReply && (goal.status === "completed" || goal.status === "cancelled" || goal.status === "failed")
  const progress = goal.progress
  const percentage = progress?.total ? progress.completed / progress.total * 100 : 0
  const stageObjective = progress?.phase ? `完成「${progress.phase}」` : displayInstruction
  if (terminal && !terminalVisible) return null
  if (terminal) return <section className={`wb-growth-status wb-growth-status-collapsed wb-growth-terminal ${goal.status}`} data-growth-status={goal.status}><Feather size={13} /><strong>Growth {statusLabel}</strong></section>
  if (collapsed) {
    return <section className={`wb-growth-status wb-growth-status-collapsed ${goal.status}`} data-growth-status={goal.status}>
      <div className="wb-growth-collapsed-lane">
        <div className="wb-growth-collapsed-slide">
          <div className="wb-growth-collapsed-progress"><div className="wb-growth-meter" role="progressbar" aria-label={`Growth ${statusLabel}`} aria-valuemin={0} aria-valuemax={progress?.total ?? 0} aria-valuenow={progress?.completed ?? 0}><i style={{ width: `${percentage}%` }} /></div></div>
          <div className="wb-growth-latest-objective" title={stageObjective}><em>阶段</em><span>{stageObjective}</span></div>
        </div>
      </div>
      <div className="wb-growth-collapsed-controls">
        {actions.active && <button title="暂停 Growth" aria-label="暂停 Growth" onClick={() => onAction("pause")}><Pause size={11} />暂停</button>}
        {actions.resumable && <button title={canResume ? "继续 Growth" : "切换为自由后继续"} aria-label="继续 Growth" disabled={!canResume} onClick={() => onAction("resume")}><Play size={11} />继续</button>}
        {actions.cancellable && <button title="结束 Growth" aria-label="结束 Growth" onClick={() => onAction("cancel")}><Square size={10} /></button>}
        <button className="wb-growth-toggle" title="展开 Growth 进度" aria-label="展开 Growth 进度" onClick={() => setCollapsed(false)}><ChevronUp size={12} /></button>
      </div>
    </section>
  }
  return <section className={`wb-growth-status ${goal.status}`} data-growth-status={goal.status}>
    <div><Feather size={14} /><strong>Growth {statusLabel}</strong><span>v{goal.version}</span></div>
    {progress && <div className="wb-growth-progress">
      <div><strong>{progress.phase ?? "收尾"}</strong><span>{progress.completed} / {progress.total}</span></div>
      <div className="wb-growth-meter" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed}><i style={{ width: `${percentage}%` }} /></div>
      <small>进行中 {progress.active} · 可重试 {progress.retryable} · 阻塞 {progress.blocked} · 待确认 {progress.unknown}</small>
      {progress.currentObjects.length > 0 && <ul>{progress.currentObjects.map((object) => <li key={`${object.layer}:${object.title}`}><span>{object.title}</span><em>{growthObjectStatusLabel(object.status)}</em></li>)}</ul>}
    </div>}
    <GrowthIssues issues={visibleGrowthIssues(goal.issues ?? [], issueClock)} />
    <p>{awaitingOwnerReply ? growthOwnerDeliveryMessage(goal.status) : waitingForUser ? "请直接回复补充信息；AI 判断足以解决后会自动继续。" : goal.statusReason ?? displayInstruction}</p>
    <div className="wb-growth-expanded-controls">{actions.active && <button title="暂停 Growth" onClick={() => onAction("pause")}><Pause size={12} />暂停</button>}{actions.resumable && <button title={canResume ? "继续 Growth" : "切换为自由后继续"} disabled={!canResume} onClick={() => onAction("resume")}><Play size={12} />继续</button>}{actions.cancellable && <button title="结束 Growth" onClick={() => onAction("cancel")}><Square size={12} />结束</button>}<button className="wb-growth-toggle" title="收起 Growth 进度" aria-label="收起 Growth 进度" onClick={() => setCollapsed(true)}><ChevronDown size={12} /></button></div>
  </section>
}

export function GrowthIssues({ issues }: { issues: NonNullable<GrowthGoalProjection["issues"]> }) {
  if (!issues.length) return null
  return <div className="wb-growth-issues">{groupGrowthIssues(issues).map((group) => {
    const issue = group.issues[0]
    if (!issue) return null
    const tone = issue.status === "resolved" || issue.status === "bypassed" ? "resolved" : issue.status === "needs_help" ? "warning" : "error"
    const label = issue.status === "repairing" ? "正在自动修复" : issue.status === "resolved" ? "已修复完成" : issue.status === "bypassed" ? "已绕过" : issue.status === "needs_help" ? "待返工" : issue.status === "waiting_user" ? "等待你的补充" : "已发现问题"
    const details = group.issues.flatMap((entry) => entry.detail ? [entry.detail] : [])
    return <article key={issue.issueId} className={`wb-growth-issue ${tone}`} data-issue-status={issue.status}>
      <div><strong>{label}{group.issues.length > 1 ? ` × ${group.issues.length}` : ""}</strong><span>{issue.summary}</span></div>
      {details.length > 0 && <details><summary>技术详情</summary><pre>{details.map((detail, index) => details.length > 1 ? `${index + 1}. ${detail}` : detail).join("\n\n")}</pre></details>}
    </article>
  })}</div>
}

export function visibleGrowthIssues(issues: NonNullable<GrowthGoalProjection["issues"]>, now: number) {
  return issues.filter((issue) => !issue.resolvedAt || now - new Date(issue.resolvedAt).getTime() < 3_000)
}

function groupGrowthIssues(issues: NonNullable<GrowthGoalProjection["issues"]>) {
  return issues.reduce<Array<{ key?: string; issues: NonNullable<GrowthGoalProjection["issues"]> }>>((groups, issue) => {
    if (issue.status !== "repairing" && issue.status !== "resolved" && issue.status !== "bypassed") return [...groups, { issues: [issue] }]
    const key = [issue.status, issue.impact, issue.errorCode, issue.summary].join("\0")
    const index = groups.findIndex((group) => group.key === key)
    if (index < 0) return [...groups, { key, issues: [issue] }]
    return groups.map((group, groupIndex) => groupIndex === index ? { ...group, issues: [...group.issues, issue] } : group)
  }, [])
}

function ErrorBanner({ error, onClose }: { error: CreatXError; onClose: () => void }) {
  return <div className="wb-error-banner"><div><strong>{error.message}</strong>{error.detail && <span>{error.detail}</span>}</div><button onClick={onClose}><X size={14} /></button></div>
}

function SettingsPage({ settings, appearance, onClose, onSaveText, onSaveImage, onAppearance }: {
  settings: ModelSettingsSnapshot | undefined
  appearance: AppearancePreferences
  onClose: () => void
  onSaveText: (command: SaveTextModelProfileCommand) => Promise<boolean>
  onSaveImage: (command: SaveImageModelSettingsCommand) => Promise<boolean>
  onAppearance: (appearance: AppearancePreferences) => void
}) {
  const [section, setSection] = useState<"models" | "images" | "appearance">("models")
  const [profileId, setProfileId] = useState(settings?.selectedTextProfileId ?? "")
  const selectedProfile = settings?.textProfiles.find((profile) => profile.id === profileId)
  const [name, setName] = useState(selectedProfile?.name ?? "")
  const [providerId, setProviderId] = useState(selectedProfile?.providerId ?? "deepseek")
  const [modelId, setModelId] = useState(selectedProfile?.modelId ?? "deepseek-chat")
  const [baseUrl, setBaseUrl] = useState(selectedProfile?.baseUrl ?? "")
  const [apiKey, setApiKey] = useState("")
  const [imageBaseUrl, setImageBaseUrl] = useState(settings?.image.baseUrl ?? "")
  const [imageApiKey, setImageApiKey] = useState("")
  const [imageModel, setImageModel] = useState<SaveImageModelSettingsCommand["defaultModel"]>(settings?.image.defaultModel ?? "gpt-image-2-cheap")
  const [savingText, setSavingText] = useState(false)
  const [savingImage, setSavingImage] = useState(false)

  useEffect(() => {
    const profile = settings?.textProfiles.find((candidate) => candidate.id === profileId)
    if (!profile) return
    setName(profile.name)
    setProviderId(profile.providerId)
    setModelId(profile.modelId)
    setBaseUrl(profile.baseUrl ?? "")
    setApiKey("")
  }, [profileId, settings])

  async function saveText(event: FormEvent) {
    event.preventDefault()
    setSavingText(true)
    const saved = await onSaveText({
      ...(profileId ? { id: profileId } : {}),
      name,
      providerId,
      modelId,
      ...(baseUrl.trim() ? { baseUrl } : {}),
      ...(apiKey.trim() ? { apiKey } : {}),
    })
    setSavingText(false)
    if (saved) setApiKey("")
  }

  async function saveImage(event: FormEvent) {
    event.preventDefault()
    setSavingImage(true)
    const saved = await onSaveImage({
      baseUrl: imageBaseUrl,
      defaultModel: imageModel,
      ...(imageApiKey.trim() ? { apiKey: imageApiKey } : {}),
    })
    setSavingImage(false)
    if (saved) setImageApiKey("")
  }

  function newProfile() {
    setProfileId("")
    setName("")
    setProviderId("openai-compatible")
    setModelId("")
    setBaseUrl("")
    setApiKey("")
  }

  return <section className="wb-settings-page" aria-labelledby="settings-title">
    <aside className="wb-settings-navigation">
      <header><Settings2 size={17} /><strong id="settings-title">设置</strong></header>
      <nav aria-label="设置分类">
        <button className={section === "models" ? "is-active" : ""} onClick={() => setSection("models")}><MessageSquare size={16} /><span>模型</span></button>
        <button className={section === "images" ? "is-active" : ""} onClick={() => setSection("images")}><FileImage size={16} /><span>生图</span></button>
        <button className={section === "appearance" ? "is-active" : ""} onClick={() => setSection("appearance")}><Palette size={16} /><span>外观</span></button>
        <button disabled><FolderOpen size={16} /><span>项目与文件</span><small>稍后</small></button>
        <button disabled><ShieldCheck size={16} /><span>权限</span><small>稍后</small></button>
        <button disabled><Info size={16} /><span>关于</span><small>稍后</small></button>
      </nav>
      <button className="wb-settings-back" onClick={onClose}><ChevronRight size={15} /><span>返回创作</span></button>
    </aside>
    <div className="wb-settings-content">
      <header className="wb-settings-hero">
        <div><span className="dialog-eyebrow">{VISIBLE_PRODUCT_NAME}偏好</span><h1>{section === "models" ? "模型" : section === "images" ? "生图" : "外观"}</h1><p>{section === "models" ? "管理交流模型。它负责理解你的目标、调用工具并持续推进创作。" : section === "images" ? "配置由交流模型按需调用的图片模型；它不会直接参与对话。" : `分别调整界面层级与阅读正文的字号；${VISIBLE_PRODUCT_NAME}统一使用 JetBrains Mono。`}</p></div>
        <button title="关闭设置" onClick={onClose}><X size={17} /></button>
      </header>
      {section === "models" && <form className="wb-settings-form" data-onboarding="api" onSubmit={(event) => void saveText(event)}>
        <div className="model-settings-section-heading"><div><MessageSquare size={16} /><span><strong>交流模型</strong><small>用于会话、推理和工具选择</small></span></div><button type="button" onClick={newProfile}><Plus size={13} />添加连接</button></div>
        {settings?.textProfiles.length ? <label><span>已保存连接</span><select value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">新连接</option>{settings.textProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.modelId}</option>)}</select></label> : undefined}
        <div className="model-settings-grid">
          <label><span>显示名称</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 DeepSeek Chat" /></label>
          <label><span>API Provider</span><input required value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder="deepseek / openai-compatible" /></label>
          <label className="is-wide"><span>Base URL <small>可选</small></span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
          <label><span>Model</span><input required value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="模型 ID" /></label>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selectedProfile?.apiKeyConfigured ? "已安全保存；留空保持不变" : "输入 API Key"} /></label>
        </div>
        <div className="model-settings-actions"><span>{selectedProfile?.apiKeyConfigured ? "凭据已配置并安全保存" : "尚未配置凭据"}</span><div><button type="button" disabled title="设计稿阶段尚未接入测试连接">测试连接</button><button className="primary" disabled={savingText}>{savingText ? "保存中…" : "保存"}</button></div></div>
      </form>}
      {section === "images" && <form className="wb-settings-form" onSubmit={(event) => void saveImage(event)}>
        <div className="model-settings-section-heading"><div><FileImage size={16} /><span><strong>生图模型</strong><small>仅供交流模型调用图片工具</small></span></div></div>
        <div className="model-settings-grid">
          <label className="is-wide"><span>Base URL</span><input required value={imageBaseUrl} onChange={(event) => setImageBaseUrl(event.target.value)} placeholder="https://jmrai.net/v1" /></label>
          <label><span>默认模型</span><select value={imageModel} onChange={(event) => setImageModel(event.target.value as SaveImageModelSettingsCommand["defaultModel"])}><option value="gpt-image-2-cheap">gpt-image-2-cheap</option><option value="gpt-image-2">gpt-image-2</option></select></label>
          <label><span>API Key</span><input type="password" value={imageApiKey} onChange={(event) => setImageApiKey(event.target.value)} placeholder={settings?.image.apiKeyConfigured ? "已安全保存；留空保持不变" : "输入 API Key"} /></label>
        </div>
        <div className="model-settings-actions"><span>{settings?.image.configured ? "生图工具已就绪" : "配置后由交流模型按需调用"}</span><button className="primary" disabled={savingImage}>{savingImage ? "保存中…" : "保存"}</button></div>
      </form>}
      {section === "appearance" && <section className="wb-settings-form wb-appearance-settings" aria-label="外观设置">
        <div className="model-settings-section-heading"><div><Palette size={16} /><span><strong>界面文字</strong><small>选择后立即生效并保存在本机</small></span></div></div>
        <div className="model-settings-grid">
          <label><span>字体</span><input value="JetBrains Mono" readOnly aria-label="字体" /></label>
          <label><span>界面字号</span><select value={appearance.interfaceFontSize} onChange={(event) => onAppearance({ ...appearance, interfaceFontSize: Number(event.target.value) })}>{[12, 13, 14, 15, 16, 17, 18].map((size) => <option value={size} key={size}>{size}px</option>)}</select></label>
          <label><span>阅读字号</span><select value={appearance.readingFontSize} onChange={(event) => onAppearance({ ...appearance, readingFontSize: Number(event.target.value) })}>{[12, 13, 14, 15, 16, 17, 18].map((size) => <option value={size} key={size}>{size}px</option>)}</select></label>
        </div>
        <div className="wb-appearance-preview"><small>即时预览</small><p>在一整个世界里，文字应当清晰、安静，并且适合长时间阅读。</p></div>
        <div className="model-settings-actions"><span>界面层级与阅读正文分别调整</span><button type="button" onClick={() => onAppearance(defaultAppearancePreferences)}>恢复默认</button></div>
      </section>}
    </div>
  </section>
}

function ApprovalDialog({ approval, onDecision }: { approval: ApprovalRequest; onDecision: (approved: boolean) => void }) {
  return <DesktopDialog className="approval-dialog" backdropClassName="dialog-backdrop" labelId="approval-title" kind="alertdialog" closeOnBackdrop={false} onClose={() => onDecision(false)}><><span className="dialog-eyebrow">真实工具审批</span><h2 id="approval-title">允许旅鸽执行{toolLabel(approval.toolName)}？</h2><pre>{JSON.stringify(approval.input, null, 2)}</pre><p>{approval.trustWarning}</p><div className="dialog-actions"><button data-dialog-initial-focus onClick={() => onDecision(false)}>拒绝</button><button className="primary" onClick={() => onDecision(true)}>允许一次</button></div></></DesktopDialog>
}

function projectEntries(project: ProjectSnapshot | undefined): WorkbenchEntry[] {
  if (!project) return []
  return project.files.map((file) => ({ kind: "file", name: file.name, relativePath: file.relativePath, fileId: file.id }))
}

function toolLabel(name: string) {
  const labels: Record<string, string> = { editor: "编辑文件", run_commands: "运行命令", apply_patch: "应用补丁", read_files: "读取文件", search_codebase: "搜索项目", register_workbench: "注册工作台", rename_workbench: "修改工作台标题", unregister_workbench: "移除工作台入口", generate_image: "生成图片", edit_image: "编辑图片" }
  return labels[name] ?? name
}

function growthStatusLabel(status: GrowthGoalProjection["status"]) {
  return ({ active: "运行中", waiting: "等待检查", paused: "已暂停", completed: "已完成", failed: "失败", cancelled: "已结束" } as const)[status]
}

function growthObjectStatusLabel(status: NonNullable<GrowthGoalProjection["progress"]>["currentObjects"][number]["status"]) {
  return ({ active: "正在处理", retryable: "准备重试", blocked: "需要补充", unknown: "等待确认" } as const)[status]
}

function runStateLabel(status: RunState) {
  return ({ idle: "空闲", running: "运行中", completed: "已完成", cancelled: "已取消", failed: "失败", unknown: "结果未知" } as const)[status]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
