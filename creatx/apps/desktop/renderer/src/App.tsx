import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import type {
  AttachmentReference,
  ApprovalRequest,
  CreatXError,
  CreatXEvent,
  CreativeLibrarySnapshot,
  DesktopBootstrap,
  GrowthGoalProjection,
  ImageTaskAction,
  ImageTaskProjection,
  ModelSettingsSnapshot,
  ProjectFile,
  ProjectSnapshot,
  RestartApplicationResult,
  SessionSummary,
  SaveImageModelSettingsCommand,
  SaveTextModelProfileCommand,
  SaveProjectTextCommand,
  SetCreativeLibraryReactionCommand,
  TimelineItem,
  WorkbenchPresentationProjection,
} from "@creatx/contracts"
import { WorkspaceShell } from "./WorkspaceShell"
import { mergeTimelineSnapshot, reduceTimeline } from "./timeline-channels"
import { clearPendingOwnerCommand, pendingGrowthMessage, pendingGrowthResume, readPendingOwnerCommands, savePendingOwnerCommand } from "./owner-command-recovery"
import { initializeSessionRunStates, removeSessionRunState, runStateForSession, settleSessionRunState, updateSessionRunState } from "./session-run-states"
import { WorkspaceProjectionController, type WorkspaceProjectionState } from "./workspace-projection-controller"
import { mergeProjectImageTask } from "./image-task-activity"
import { enabledSkillSequenceForSession, readSkillSequencePreferences, setSessionSkillSequenceSlots, skillSequenceSlotsForSession, skillSequenceStorageKey } from "./skill-sequence-preferences"
import { appendAttachmentSelection } from "./attachment-selection"
import { acknowledgeDeletionBoundary, hideUserMessage, messageVisibilityStorageKey, readMessageVisibilityPreferences, visibleTimeline } from "./message-visibility-preferences"
import type { RightSurface } from "./WorkspaceShell"
import { VISIBLE_PRODUCT_NAME } from "../../src/product-brand"
import { SessionSwitchCoordinator, type SessionSelection } from "./session-switch-coordinator"
import { clearApplicationRestartSelection, readApplicationRestartSelection, resolveApplicationRestartSession, saveApplicationRestartSelection } from "./application-restart-recovery"
import { isTransientRecoveringError } from "./transient-error-presentation"

let localMessageId = 0

export function App() {
  const restartSelection = useRef(readApplicationRestartSelection(window.localStorage))
  const [bootstrap, setBootstrap] = useState<DesktopBootstrap>()
  const [modelSettings, setModelSettings] = useState<ModelSettingsSnapshot>()
  const [error, setError] = useState<CreatXError>()
  const [workspace, setWorkspace] = useState<WorkspaceProjectionState>({})
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState<string>()
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [timelineLoadingSessionId, setTimelineLoadingSessionId] = useState<string>()
  const [draft, setDraft] = useState("")
  const [skillSequencePreferences, setSkillSequencePreferences] = useState(() => readSkillSequencePreferences(window.localStorage))
  const [skillSequenceArmed, setSkillSequenceArmed] = useState(false)
  const [selectedAttachments, setSelectedAttachments] = useState<AttachmentReference[]>([])
  const [messageVisibilityPreferences, setMessageVisibilityPreferences] = useState(() => readMessageVisibilityPreferences(window.localStorage))
  const [editingMessageId, setEditingMessageId] = useState<string>()
  const [submittingReplacementItemId, setSubmittingReplacementItemId] = useState<string>()
  const editingDraftBackup = useRef("")
  const pendingReplacement = useRef<{ sessionId: string; itemId: string; prompt: string; attachments: AttachmentReference[]; composerSubmission: boolean } | undefined>(undefined)
  const [sessionRunStates, setSessionRunStates] = useState(() => initializeSessionRunStates([]))
  const [approval, setApproval] = useState<ApprovalRequest>()
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightSurface, setRightSurface] = useState<RightSurface>()
  const [growth, setGrowth] = useState<GrowthGoalProjection>()
  const [imageTasks, setImageTasks] = useState<ImageTaskProjection[]>([])
  const [creativeLibrary, setCreativeLibrary] = useState<CreativeLibrarySnapshot>()
  const [artLibraryRevision, setArtLibraryRevision] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [workbenchPresentationRequest, setWorkbenchPresentationRequest] = useState<{ requestId: number; projectId: string; sessionId: string; workbenchId: string; entry: string }>()
  const sessionIdRef = useRef(sessionId)
  const projectRef = useRef(workspace.project)
  const projectionControllerRef = useRef<WorkspaceProjectionController | undefined>(undefined)
  const sessionSwitchCoordinatorRef = useRef<SessionSwitchCoordinator | undefined>(undefined)
  if (!projectionControllerRef.current) {
    projectionControllerRef.current = new WorkspaceProjectionController({
      refreshFiles: async (projectId) => requireDesktopValue(await window.creatx.refreshFiles(projectId)),
      readWorkbenches: async (projectId) => requireDesktopValue(await window.creatx.readWorkbenches(projectId)),
      readFile: async (projectId, fileId) => requireDesktopValue(await window.creatx.readFile(projectId, fileId)),
    }, setWorkspace, (failure) => setError(asCreatXError(failure)))
  }
  if (!sessionSwitchCoordinatorRef.current) sessionSwitchCoordinatorRef.current = new SessionSwitchCoordinator()
  const projectionController = projectionControllerRef.current
  const sessionSwitchCoordinator = sessionSwitchCoordinatorRef.current
  const project = workspace.project
  const workbenches = workspace.workbenches
  const selectedFileId = workspace.selectedFileId
  const preview = workspace.preview

  sessionIdRef.current = sessionId
  projectRef.current = workspace.project

  useEffect(() => {
    const unsubscribe = window.creatx.onEvent(handleEvent)
    void loadBootstrap()
    return unsubscribe
  }, [])

  useEffect(() => {
    setSelectedAttachments([])
    setEditingMessageId(undefined)
    setSubmittingReplacementItemId(undefined)
    pendingReplacement.current = undefined
    editingDraftBackup.current = ""
    setSkillSequenceArmed(false)
    if (!sessionId) {
      setTimeline([])
      setTimelineLoadingSessionId(undefined)
      return
    }
    void window.creatx.readTimeline(sessionId).then((result) => {
      if (sessionIdRef.current !== sessionId) return
      if (result.ok) setTimeline((current) => mergeTimelineSnapshot(current, result.value))
      if (!result.ok) setError(result.error)
      setTimelineLoadingSessionId((current) => current === sessionId ? undefined : current)
    })
  }, [sessionId])

  useEffect(() => {
    window.localStorage.setItem(skillSequenceStorageKey, JSON.stringify(skillSequencePreferences))
  }, [skillSequencePreferences])

  useEffect(() => {
    window.localStorage.setItem(messageVisibilityStorageKey, JSON.stringify(messageVisibilityPreferences))
  }, [messageVisibilityPreferences])

  const activeSession = sessions.find((session) => session.id === sessionId)
  const runState = runStateForSession(sessionRunStates, sessionId)
  const skillSequenceSlots = skillSequenceSlotsForSession(skillSequencePreferences, sessionId)
  const projectGlyph = project?.name.trim().slice(0, 1) || "C"

  async function loadBootstrap() {
    setLoading(true)
    const result = await window.creatx.bootstrap(restartSelection.current)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setBootstrap(result.value)
    clearApplicationRestartSelection(window.localStorage)
    setModelSettings(result.value.modelSettings)
    setSessions(result.value.sessions)
    setSessionRunStates(initializeSessionRunStates(result.value.sessions))
    setGrowth(result.value.growth)
    projectRef.current = result.value.project
    const initialSessionId = resolveApplicationRestartSession(restartSelection.current, result.value.sessions)?.id
      ?? result.value.sessions.find((session) => session.projectId === result.value.project?.id)?.id
    restartSelection.current = undefined
    activateSession(initialSessionId)
    void recoverPendingOwnerCommands(result.value.sessions)
    const library = await window.creatx.readCreativeLibrary()
    if (library.ok) setCreativeLibrary(library.value)
    if (!library.ok) setError(library.error)
    if (!result.value.project) {
      setImageTasks([])
      projectionController.close()
      return
    }
    void loadImageTasks(result.value.project.id)
    const workbenchResult = await window.creatx.readWorkbenches(result.value.project.id)
    projectionController.open(result.value.project, workbenchResult.ok ? workbenchResult.value : undefined)
    if (!workbenchResult.ok) setError(workbenchResult.error)
  }

  async function restartApplication(confirmed: boolean): Promise<RestartApplicationResult | undefined> {
    const selection = {
      ...(project?.id ? { projectId: project.id } : {}),
      ...(sessionId ? { sessionId } : {}),
    }
    if (selection.projectId || selection.sessionId) saveApplicationRestartSelection(window.localStorage, selection)
    const result = await window.creatx.restartApplication({ confirmed })
    if (!result.ok) {
      clearApplicationRestartSelection(window.localStorage)
      setError(result.error)
      return undefined
    }
    if (result.value.state === "confirmation_required") clearApplicationRestartSelection(window.localStorage)
    return result.value
  }

  function handleEvent(event: CreatXEvent) {
    if (event.type === "approval.requested") {
      setApproval(event.approval)
      return
    }
    if (event.type === "approval.resolved") {
      setApproval((current) => current?.id === event.approvalId ? undefined : current)
      return
    }
    if (event.type === "runtime.error") {
      setError(event.error)
      return
    }
    if (event.type === "image.task.changed") {
      setImageTasks((current) => mergeProjectImageTask(current, event.task, projectRef.current?.id))
      return
    }
    if (event.type === "growth.goal.changed") {
      if (event.goal.projectId === projectRef.current?.id) setGrowth(event.goal)
      return
    }
    if (event.type === "project.projection.invalidated") {
      void projectionController.invalidate(event)
      return
    }
    if (event.type === "workbench.presentation.requested") {
      if (event.projectId === projectRef.current?.id && event.sessionId === sessionIdRef.current) setWorkbenchPresentationRequest({ ...event, requestId: Date.now() })
      return
    }
    if (event.type === "run.state") {
      setSessionRunStates((current) => updateSessionRunState(current, event.sessionId, event.state))
      const replacement = pendingReplacement.current
      if (replacement?.sessionId === event.sessionId && event.state !== "running") {
        pendingReplacement.current = undefined
        setSubmittingReplacementItemId(undefined)
        if (event.state === "completed") setMessageVisibilityPreferences((current) => hideUserMessage(current, replacement.sessionId, replacement.itemId))
        if (event.state !== "completed" && replacement.composerSubmission) {
          setDraft(replacement.prompt)
          setSelectedAttachments(replacement.attachments)
          setEditingMessageId(replacement.itemId)
        }
      }
      return
    }
    if (event.type === "art_library.changed") {
      setArtLibraryRevision((current) => current === undefined || event.revision > current ? event.revision : current)
      return
    }
    if (event.sessionId !== sessionIdRef.current) return
    if (event.type === "timeline.snapshot") {
      setTimeline((current) => mergeTimelineSnapshot(current, event.items))
      setTimelineLoadingSessionId((current) => current === event.sessionId ? undefined : current)
      return
    }
    if (event.type === "timeline.upsert") {
      setTimeline((current) => reduceTimeline(current, event.item))
      return
    }
  }

  async function chooseProject() {
    const result = await window.creatx.chooseProject()
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    if (!result.value) return undefined
    projectRef.current = result.value
    setImageTasks([])
    const growthResult = await window.creatx.readGrowthGoal(result.value.id)
    if (growthResult.ok) setGrowth(growthResult.value)
    if (!growthResult.ok) setError(growthResult.error)
    const workbenchResult = await window.creatx.readWorkbenches(result.value.id)
    projectionController.open(result.value, workbenchResult.ok ? workbenchResult.value : undefined)
    void loadImageTasks(result.value.id)
    if (!workbenchResult.ok) setError(workbenchResult.error)
    activateSession(sessions.find((session) => session.projectId === result.value?.id)?.id)
    setRightSurface(undefined)
    setLeftOpen(true)
    return result.value
  }

  async function openProject(projectId: string, selection?: SessionSelection, reconcileMainProject = false) {
    if (projectRef.current?.id === projectId && !reconcileMainProject) return projectRef.current
    const result = selection
      ? await sessionSwitchCoordinator.runLatest(selection, () => window.creatx.openProject(projectId))
      : await window.creatx.openProject(projectId)
    if (!result) return undefined
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    if (projectRef.current?.id === result.value.id) return projectRef.current
    projectRef.current = result.value
    setImageTasks([])
    setGrowth(undefined)
    projectionController.open(result.value)
    void loadImageTasks(result.value.id)
    setRightSurface(undefined)
    setLeftOpen(true)
    void Promise.all([window.creatx.readGrowthGoal(result.value.id), window.creatx.readWorkbenches(result.value.id)]).then(([growthResult, workbenchResult]) => {
      if (projectRef.current?.id !== result.value.id) return
      if (growthResult.ok) setGrowth(growthResult.value)
      if (!growthResult.ok) setError(growthResult.error)
      if (workbenchResult.ok) projectionController.setWorkbenches(workbenchResult.value)
      if (!workbenchResult.ok) setError(workbenchResult.error)
    }).catch((failure) => {
      if (projectRef.current?.id === result.value.id) setError(asCreatXError(failure))
    })
    return result.value
  }

  async function createSession(targetProject = project, title?: string) {
    const selectedProject = targetProject ?? await chooseProject()
    if (!selectedProject) return undefined
    const result = await window.creatx.createSession(selectedProject.id, title)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    setSessions((current) => [result.value, ...current])
    setSessionRunStates((current) => updateSessionRunState(current, result.value.id, "idle"))
    activateSession(result.value.id)
    setSelectedAttachments([])
    return result.value.id
  }

  async function createProjectSession(projectId: string) {
    const targetProject = await openProject(projectId)
    if (targetProject) await createSession(targetProject)
  }

  async function selectProject(projectId: string) {
    const targetProject = await openProject(projectId)
    if (!targetProject) return
    activateSession(sessions.find((session) => session.projectId === projectId)?.id)
  }

  async function selectSession(targetSessionId: string) {
    const targetSession = sessions.find((session) => session.id === targetSessionId)
    if (!targetSession) return false
    if (targetSessionId === sessionIdRef.current && targetSession.projectId === projectRef.current?.id) return true
    const selection = sessionSwitchCoordinator.begin(targetSessionId, targetSession.projectId)
    activateSession(targetSessionId, selection)
    const reconcileMainProject = targetSession.projectId === projectRef.current?.id && sessionSwitchCoordinator.hasPendingProjectOpen()
    if (targetSession.projectId !== projectRef.current?.id) {
      setGrowth(undefined)
      setImageTasks([])
    }
    if ((targetSession.projectId !== projectRef.current?.id || reconcileMainProject) && !await openProject(targetSession.projectId, selection, reconcileMainProject)) return false
    return true
  }

  function activateSession(targetSessionId?: string, selection?: SessionSelection) {
    if (targetSessionId === sessionIdRef.current) return
    if (!selection) sessionSwitchCoordinator.activate(targetSessionId)
    sessionIdRef.current = targetSessionId
    setSessionId(targetSessionId)
    setTimeline([])
    setTimelineLoadingSessionId(targetSessionId)
  }

  async function renameSession(targetSessionId: string, title: string) {
    const result = await window.creatx.renameSession(targetSessionId, title)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setSessions((current) => current.map((session) => session.id === result.value.id ? result.value : session))
    return true
  }

  async function revealProject(projectId: string) {
    const result = await window.creatx.revealProject(projectId)
    if (!result.ok) setError(result.error)
  }

  async function deleteSession(targetSessionId: string) {
    const result = await window.creatx.deleteSession(targetSessionId)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    const remaining = sessions.filter((session) => session.id !== targetSessionId)
    setSessions(remaining)
    setSkillSequencePreferences((current) => setSessionSkillSequenceSlots(current, targetSessionId, []))
    setSessionRunStates((current) => removeSessionRunState(current, targetSessionId))
    if (sessionId === targetSessionId) {
      activateSession(remaining.find((session) => session.projectId === project?.id)?.id)
      setSelectedAttachments([])
    }
    return true
  }

  async function deleteProjectSessions(projectId: string) {
    const result = await window.creatx.deleteProjectSessions(projectId)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    const deleted = new Set(result.value)
    const remaining = sessions.filter((session) => !deleted.has(session.id))
    setSessions(remaining)
    setSkillSequencePreferences((current) => [...deleted].reduce((preferences, deletedSessionId) => setSessionSkillSequenceSlots(preferences, deletedSessionId, []), current))
    setSessionRunStates((current) => result.value.reduce(removeSessionRunState, current))
    if (sessionId && deleted.has(sessionId)) {
      activateSession(remaining.find((session) => session.projectId === project?.id)?.id)
      setSelectedAttachments([])
    }
    return true
  }

  function removeProject(projectId: string) {
    if (project?.id !== projectId) return
    projectionController.close()
    activateSession(undefined)
    setSelectedAttachments([])
    setGrowth(undefined)
    setRightSurface(undefined)
  }

  async function chooseAttachments() {
    const result = await window.creatx.chooseAttachments()
    if (!result.ok) {
      setError(result.error)
      return
    }
    try {
      setSelectedAttachments(appendAttachmentSelection(selectedAttachments, result.value))
    } catch (failure) {
      setError(asCreatXError(failure))
    }
  }

  async function authorizeDroppedAttachments(files: readonly File[]) {
    if (selectedAttachments.length + files.length > 20) {
      setError(asCreatXError(new Error("attachment_invalid: a conversation can include at most 20 attachments")))
      return
    }
    const result = await window.creatx.authorizeDroppedAttachments(files).catch((failure) => {
      setError(asCreatXError(failure))
      return undefined
    })
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    try {
      setSelectedAttachments(appendAttachmentSelection(selectedAttachments, result.value))
    } catch (failure) {
      setError(asCreatXError(failure))
    }
  }

  async function saveTextModelProfile(command: SaveTextModelProfileCommand) {
    const result = await window.creatx.saveTextModelProfile(command)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setModelSettings(result.value)
    setBootstrap((current) => current ? { ...current, modelSettings: result.value } : current)
    return true
  }

  async function selectModel(profileId: string) {
    if (!sessionId) return false
    const result = await window.creatx.selectSessionModel(sessionId, profileId)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setSessions((current) => current.map((session) => session.id === result.value.id ? result.value : session))
    const settings = await window.creatx.readModelSettings()
    if (!settings.ok) {
      setError(settings.error)
      return false
    }
    setModelSettings(settings.value)
    setBootstrap((current) => current ? {
      ...current,
      harness: { ...current.harness, providerId: result.value.providerId, modelId: result.value.modelId, configured: true },
      modelSettings: settings.value,
    } : current)
    return true
  }

  async function saveImageModelSettings(command: SaveImageModelSettingsCommand) {
    const result = await window.creatx.saveImageModelSettings(command)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setModelSettings(result.value)
    setBootstrap((current) => current ? { ...current, modelSettings: result.value } : current)
    return true
  }

  async function sendMessage(input?: { prompt?: string; replacementItemId?: string }) {
    const composerSubmission = input?.prompt === undefined
    const prompt = (input?.prompt ?? draft).trim()
    if (!prompt) return
    const targetSession = sessionIdRef.current ?? await createSession()
    if (!targetSession) return
    const replacementItemId = input?.replacementItemId ?? editingMessageId
    if (replacementItemId && runStateForSession(sessionRunStates, targetSession) === "running") return
    const attachments = composerSubmission ? selectedAttachments : []
    if (composerSubmission) {
      setDraft("")
      setSelectedAttachments([])
      setEditingMessageId(undefined)
    }
    setError(undefined)
    if (replacementItemId) {
      pendingReplacement.current = { sessionId: targetSession, itemId: replacementItemId, prompt, attachments, composerSubmission }
      setSubmittingReplacementItemId(replacementItemId)
    }
    const restoreFailedSubmission = () => {
      if (replacementItemId) {
        pendingReplacement.current = undefined
        setSubmittingReplacementItemId(undefined)
      }
      if (!composerSubmission) return
      setDraft(prompt)
      setSelectedAttachments(attachments)
      if (replacementItemId) setEditingMessageId(replacementItemId)
    }
    const optimisticMessageId = localId()
    setTimeline((current) => [...current, {
      sequence: Math.max(0, ...current.map((item) => item.sequence)) + 1,
      itemId: optimisticMessageId,
      kind: "message",
      presentation: "user",
      state: "completed",
      text: prompt,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        displayPath: attachment.displayPath,
        kind: attachment.kind,
        ...(attachment.mediaType ? { mediaType: attachment.mediaType } : {}),
        ...(attachment.previewUrl ? { previewUrl: attachment.previewUrl } : {}),
      })),
    }])
    const targetRunState = runStateForSession(sessionRunStates, targetSession)
    const targetSkillSequence = enabledSkillSequenceForSession(skillSequencePreferences, targetSession)
    const command = {
      requestId: optimisticMessageId,
      sessionId: targetSession,
      prompt,
      attachmentIds: attachments.map((attachment) => attachment.id),
      ...(targetRunState !== "running" && skillSequenceArmed && targetSkillSequence.length ? { skillSequence: targetSkillSequence } : {}),
    }
    if (runStateForSession(sessionRunStates, targetSession) === "running") {
      const result = await window.creatx.steerMessage(command)
      if (!result.ok) {
        setError(result.error)
        setTimeline((current) => current.filter((item) => item.itemId !== optimisticMessageId))
        restoreFailedSubmission()
      }
      return
    }
    setSessionRunStates((current) => updateSessionRunState(current, targetSession, "running"))
    const pending = pendingGrowthMessage(command)
    if (pending && !savePendingOwnerCommand(window.localStorage, pending)) {
      setError(asCreatXError(new Error("growth_conflict: another Owner command is still awaiting recovery")))
      setSessionRunStates((current) => updateSessionRunState(current, targetSession, "failed"))
      setTimeline((current) => current.filter((item) => item.itemId !== optimisticMessageId))
      restoreFailedSubmission()
      return
    }
    if (command.skillSequence) setSkillSequenceArmed(false)
    const result = await window.creatx.sendMessage(command).catch((failure) => {
      setError(asCreatXError(failure))
      setSessionRunStates((current) => updateSessionRunState(current, targetSession, "failed"))
      setTimeline((current) => current.filter((item) => item.itemId !== optimisticMessageId))
      restoreFailedSubmission()
      return undefined
    })
    if (!result) return
    if (pending) clearPendingOwnerCommand(window.localStorage, pending)
    if (!result.ok) {
      setError(result.error)
      setSessionRunStates((current) => updateSessionRunState(current, targetSession, result.error.code === "cancelled" ? "cancelled" : "failed"))
      setTimeline((current) => current.filter((item) => item.itemId !== optimisticMessageId))
      restoreFailedSubmission()
    }
    if (result.ok) {
      setSessionRunStates((current) => settleSessionRunState(current, targetSession))
      if (replacementItemId && composerSubmission) editingDraftBackup.current = ""
    }
    const history = await window.creatx.readTimeline(targetSession)
    if (history.ok && sessionIdRef.current === targetSession) setTimeline((current) => mergeTimelineSnapshot(current, history.value))
    if (!history.ok) setError(history.error)
    const latest = await window.creatx.bootstrap()
    if (latest.ok) setSessions(latest.value.sessions)
  }

  function deleteUserMessage(item: TimelineItem) {
    if (!sessionId) return
    setMessageVisibilityPreferences((current) => hideUserMessage(current, sessionId, item.itemId))
  }

  function editUserMessage(item: TimelineItem) {
    if (runState === "running" || approval) return
    editingDraftBackup.current = draft
    setDraft(item.text ?? "")
    setEditingMessageId(item.itemId)
  }

  function cancelUserMessageEdit() {
    setDraft(editingDraftBackup.current)
    editingDraftBackup.current = ""
    setEditingMessageId(undefined)
  }

  function resendUserMessage(item: TimelineItem) {
    if (runState === "running" || approval) return
    void sendMessage({ prompt: item.text ?? "", replacementItemId: item.itemId })
  }

  async function openMessageAttachment(messageId: string, attachmentIndex: number) {
    if (!sessionId || messageId.startsWith("local-")) return
    const result = await window.creatx.openMessageAttachment(sessionId, messageId, attachmentIndex)
    if (!result.ok) setError(result.error)
  }

  async function cancelRun() {
    if (growth?.status === "active") {
      await controlGrowth("pause")
      return
    }
    if (!sessionId) return
    const result = await window.creatx.cancelRun(sessionId)
    if (!result.ok) setError(result.error)
  }

  async function setPermissionMode(mode: "approval" | "free") {
    if (!sessionId || activeSession?.permission.mode === mode) return
    const result = await window.creatx.setSessionPermissionMode(sessionId, mode)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSessions((current) => current.map((session) => session.id === result.value.id ? result.value : session))
  }

  async function controlGrowth(action: "pause" | "resume" | "cancel") {
    if (!growth) return
    if (action === "resume" && !sessionId) {
      setError(asCreatXError(new Error("growth_session_missing: Growth Owner session is unavailable")))
      return
    }
    const resume = action === "resume" && sessionId ? pendingGrowthResume({ requestId: localId(), goalId: growth.goalId }, sessionId) : undefined
    if (resume && !savePendingOwnerCommand(window.localStorage, resume)) {
      setError(asCreatXError(new Error("growth_conflict: another Owner command is still awaiting recovery")))
      return
    }
    const result = await (action === "pause"
      ? window.creatx.pauseGrowth(growth.goalId)
      : resume
        ? window.creatx.resumeGrowth(resume.command)
        : window.creatx.cancelGrowth(growth.goalId)).catch((failure) => {
      setError(asCreatXError(failure))
      return undefined
    })
    if (!result) return
    if (resume) clearPendingOwnerCommand(window.localStorage, resume)
    if (result.ok) setGrowth(result.value)
    if (!result.ok) setError(result.error)
  }

  async function loadImageTasks(projectId: string) {
    const result = await window.creatx.readImageTasks(projectId)
    if (projectRef.current?.id !== projectId) return
    if (result.ok) setImageTasks(result.value)
    if (!result.ok) setError(result.error)
  }

  async function controlImageTask(imageTaskId: string, action: ImageTaskAction) {
    if (!project) return false
    const result = await window.creatx.controlImageTask({ projectId: project.id, imageTaskId, action })
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setImageTasks((current) => current.map((task) => task.imageTaskId === result.value.imageTaskId ? result.value : task))
    return true
  }

  async function recoverPendingOwnerCommands(knownSessions: SessionSummary[]) {
    const pendingCommands = readPendingOwnerCommands(window.localStorage)
    if (pendingCommands.length === 0) return
    await Promise.all(pendingCommands.map(async (pending) => {
      if (pending.kind === "growth-message") {
        setSessionRunStates((current) => updateSessionRunState(current, pending.command.sessionId, "running"))
        const result = await window.creatx.sendMessage(pending.command).catch(() => undefined)
        if (!result) {
          setSessionRunStates((current) => updateSessionRunState(current, pending.command.sessionId, "unknown"))
          return
        }
        clearPendingOwnerCommand(window.localStorage, pending)
        if (!result.ok) {
          if (sessionIdRef.current === pending.command.sessionId) setError(result.error)
          setSessionRunStates((current) => updateSessionRunState(current, pending.command.sessionId, result.error.code === "cancelled" ? "cancelled" : "failed"))
          return
        }
        setSessionRunStates((current) => settleSessionRunState(current, pending.command.sessionId))
        const history = await window.creatx.readTimeline(pending.command.sessionId)
        if (history.ok && sessionIdRef.current === pending.command.sessionId) setTimeline(history.value)
        return
      }
      const result = await window.creatx.resumeGrowth(pending.command).catch(() => undefined)
      if (!result) return
      clearPendingOwnerCommand(window.localStorage, pending)
      if (!result.ok) {
        if (!pending.sessionId || sessionIdRef.current === pending.sessionId) setError(result.error)
        return
      }
      const ownerSession = pending.sessionId ? knownSessions.find((session) => session.id === pending.sessionId) : undefined
      if ((!ownerSession && projectRef.current?.id === result.value.projectId) || ownerSession?.projectId === projectRef.current?.id) setGrowth(result.value)
    }))
    const latest = await window.creatx.bootstrap()
    if (!latest.ok) {
      setError(latest.error)
      return
    }
    setSessions(latest.value.sessions)
    if (latest.value.project?.id === projectRef.current?.id) setGrowth(latest.value.growth)
  }

  async function respondApproval(approved: boolean) {
    if (!approval) return
    const result = await window.creatx.respondApproval(approval.id, approved)
    if (!result.ok) setError(result.error)
    setApproval(undefined)
  }

  async function refreshFiles() {
    const activeProject = projectRef.current
    if (!activeProject) return
    await projectionController.invalidate({
      type: "project.projection.invalidated",
      projectId: activeProject.id,
      areas: ["files", "workbenches"],
    })
  }

  function openFile(file: ProjectFile) {
    void projectionController.select(file)
    setRightSurface("preview")
  }

  function openWorkbenchFile(file: ProjectFile) {
    void projectionController.select(file)
  }

  async function saveTextFile(command: SaveProjectTextCommand) {
    const result = await window.creatx.saveTextFile(command)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    await projectionController.invalidate({ type: "project.projection.invalidated", projectId: command.projectId, areas: ["files", "workbenches"] })
    return result.value
  }

  async function refreshCreativeLibrary() {
    const result = await window.creatx.readCreativeLibrary()
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCreativeLibrary(result.value)
    return true
  }

  async function importCreativeLibrary(kind: "idea" | "heritage") {
    const result = await window.creatx.chooseCreativeLibraryImport(kind)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    if (result.value) setCreativeLibrary(result.value)
    return Boolean(result.value)
  }

  async function setCreativeLibraryReaction(command: SetCreativeLibraryReactionCommand) {
    const result = await window.creatx.setCreativeLibraryReaction(command)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCreativeLibrary(result.value)
    return true
  }

  async function shareToSession(targetSessionId: string, prompt: string) {
    const targetSession = sessions.find((session) => session.id === targetSessionId)
    if (!targetSession || !await selectSession(targetSessionId)) {
      setError({ code: "session_missing", message: "选择的会话已经不存在。" })
      return false
    }
    const history = await window.creatx.readTimeline(targetSessionId)
    if (!history.ok) {
      setError(history.error)
      return false
    }
    const optimisticMessageId = localId()
    setTimeline([...history.value, {
      sequence: Math.max(0, ...history.value.map((item) => item.sequence)) + 1,
      itemId: optimisticMessageId,
      kind: "message",
      presentation: "user",
      state: "completed",
      text: prompt,
      attachments: [],
    }])
    setError(undefined)
    setSessionRunStates((current) => updateSessionRunState(current, targetSessionId, "running"))
    const command = { requestId: optimisticMessageId, sessionId: targetSessionId, prompt, attachmentIds: [] }
    const delivery = runStateForSession(sessionRunStates, targetSessionId) === "running" ? "steer" : "send"
    const result = await window.creatx.admitSharedMessage(command, delivery)
    if (!result.ok) {
      setTimeline((current) => current.filter((item) => item.itemId !== optimisticMessageId))
      setError(result.error)
      setSessionRunStates((current) => updateSessionRunState(current, targetSessionId, result.error.code === "cancelled" ? "cancelled" : "failed"))
      return false
    }
    return true
  }

  async function openArtChat() {
    if (!project) {
      setError({ code: "project_invalid", message: "请先打开一个项目，再进入艺术库 Chat。" })
      return false
    }
    const loadedLibrary = creativeLibrary ? undefined : await window.creatx.readCreativeLibrary()
    if (loadedLibrary && !loadedLibrary.ok) {
      setError(loadedLibrary.error)
      return false
    }
    const state = creativeLibrary ?? (loadedLibrary?.ok ? loadedLibrary.value : undefined)
    const boundSessionId = state?.artChatSessions[project.id]
    const boundSession = sessions.find((session) => session.id === boundSessionId && session.projectId === project.id)
    if (boundSession) return selectSession(boundSession.id)
    const createdSessionId = await createSession(project, "艺术库 Chat")
    if (!createdSessionId) return false
    const result = await window.creatx.bindArtChatSession({ projectId: project.id, sessionId: createdSessionId })
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCreativeLibrary(result.value)
    return true
  }

  async function resolveWorkbenchPresentation(command: { projectId: string; workbenchId: string; entry: string }): Promise<WorkbenchPresentationProjection | undefined> {
    const result = await window.creatx.resolveWorkbenchPresentation(command)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    return result.value
  }

  async function resolveHtmlPresentation(projectId: string, fileId: string): Promise<WorkbenchPresentationProjection | undefined> {
    const result = await window.creatx.resolveHtmlPresentation(projectId, fileId)
    if (!result.ok) {
      setError(result.error)
      return undefined
    }
    return result.value
  }

  function toggleSurface(surface: Exclude<RightSurface, undefined>) {
    setRightSurface((current) => sameSurface(current, surface) ? undefined : surface)
  }

  if (loading) {
    return <main className="boot-screen"><LoaderCircle className="spin" size={22} /><span>正在打开{VISIBLE_PRODUCT_NAME}</span></main>
  }

  return <WorkspaceShell
    configured={Boolean(bootstrap?.harness.configured)}
    modelSettings={modelSettings}
    project={project}
    sessions={sessions}
    activeSession={activeSession}
    timeline={visibleTimeline(timeline, messageVisibilityPreferences, sessionId).filter((item) => item.itemId !== submittingReplacementItemId)}
    timelineLoading={timelineLoadingSessionId === sessionId}
    draft={draft}
    setDraft={setDraft}
    skillSequenceSlots={skillSequenceSlots}
    skillSequenceArmed={skillSequenceArmed}
    onSkillSequenceSlotsChange={(slots) => {
      if (sessionId) setSkillSequencePreferences((current) => setSessionSkillSequenceSlots(current, sessionId, slots))
    }}
    onSkillSequenceArmedChange={setSkillSequenceArmed}
    selectedAttachments={selectedAttachments}
    setSelectedAttachments={setSelectedAttachments}
    runState={runState}
    growth={growth}
    imageTasks={imageTasks}
    error={visibleAppError(error)}
    approval={approval}
    leftOpen={leftOpen}
    setLeftOpen={setLeftOpen}
    rightSurface={rightSurface}
    setRightSurface={setRightSurface}
    selectedFileId={selectedFileId}
    preview={preview}
    workbenches={workbenches}
    workbenchPresentationRequest={workbenchPresentationRequest}
    onWorkbenchPresentationRequestHandled={(requestId) => setWorkbenchPresentationRequest((current) => current?.requestId === requestId ? undefined : current)}
    onOpenProject={() => void chooseProject()}
    artLibraryEnabled
    {...(artLibraryRevision === undefined ? {} : { artLibraryRevision })}
    creativeLibrary={creativeLibrary}
    heritageLibraryEnabled
    onCreateSession={() => void createSession()}
    onCreateProjectSession={(projectId) => void createProjectSession(projectId)}
    onSelectProject={(projectId) => void selectProject(projectId)}
    onSelectSession={(targetSessionId) => void selectSession(targetSessionId)}
    onRefreshCreativeLibrary={refreshCreativeLibrary}
    onImportCreativeLibrary={importCreativeLibrary}
    onSetCreativeLibraryReaction={setCreativeLibraryReaction}
    onShareToSession={shareToSession}
    onOpenArtChat={openArtChat}
    onRenameSession={renameSession}
    onRevealProject={(projectId) => void revealProject(projectId)}
    onDeleteSession={deleteSession}
    onDeleteProjectSessions={deleteProjectSessions}
    onRemoveProject={removeProject}
    onChooseAttachments={() => void chooseAttachments()}
    onDropAttachments={(files) => void authorizeDroppedAttachments(files)}
    onSaveTextModelProfile={saveTextModelProfile}
    onSelectModel={selectModel}
    onSaveImageModelSettings={saveImageModelSettings}
    onSend={() => void sendMessage()}
    messageDeletionAcknowledged={messageVisibilityPreferences.deletionBoundaryAcknowledged}
    onAcknowledgeMessageDeletion={() => setMessageVisibilityPreferences((current) => acknowledgeDeletionBoundary(current))}
    onDeleteUserMessage={deleteUserMessage}
    onEditUserMessage={editUserMessage}
    {...(editingMessageId ? { editingMessageId } : {})}
    onCancelUserMessageEdit={cancelUserMessageEdit}
    onResendUserMessage={resendUserMessage}
    onCancelRun={() => void cancelRun()}
    onSetPermission={(mode) => void setPermissionMode(mode)}
    onGrowthAction={(action) => void controlGrowth(action)}
    onImageTaskAction={controlImageTask}
    onOpenMessageAttachment={(messageId, index) => void openMessageAttachment(messageId, index)}
    onOpenFile={openFile}
    onOpenWorkbenchFile={openWorkbenchFile}
    onResolveWorkbenchPresentation={resolveWorkbenchPresentation}
    onResolveHtmlPresentation={resolveHtmlPresentation}
    onSaveTextFile={saveTextFile}
    onRefresh={() => void refreshFiles()}
    onRestartApplication={restartApplication}
    onApprovalDecision={(approved) => void respondApproval(approved)}
    onDismissError={() => setError(undefined)}
    navigationContent="sessions"
    preserveWorkspaceOnSessionChange
  />
}

function sameSurface(left: RightSurface, right: Exclude<RightSurface, undefined>) {
  if (typeof left === "object" && typeof right === "object") return left.workbenchId === right.workbenchId
  return left === right
}

export function visibleAppError(error: CreatXError | undefined) {
  return error?.code === "cancelled" || isTransientRecoveringError(error?.message) ? undefined : error
}

function localId() {
  localMessageId += 1
  return `local-${Date.now()}-${localMessageId}`
}

function requireDesktopValue<T>(result: { ok: true; value: T } | { ok: false; error: CreatXError }) {
  if (result.ok) return result.value
  throw result.error
}

function asCreatXError(error: unknown): CreatXError {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) return error as CreatXError
  const detail = error instanceof Error ? error.message : String(error)
  return { code: "runtime", message: "运行时发生错误。", detail }
}
