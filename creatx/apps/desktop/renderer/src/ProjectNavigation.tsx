import { useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, MouseEvent, SetStateAction } from "react"
import { BookOpenText, ChevronDown, ChevronRight, CircleHelp, Folder, FolderOpen, Lightbulb, MoreHorizontal, Palette, PanelLeftClose, PanelLeftOpen, Pin, Plus, Power, RefreshCw, Settings, SquarePen, Trash2, X } from "lucide-react"
import type { ProjectFile, ProjectSnapshot, RestartApplicationActivity, RestartApplicationResult, SessionSummary, WorkbenchProjection } from "@creatx/contracts"
import birdWingLogo from "./assets/bird-wing-logo-clean.svg"
import { DesktopDialog } from "./DesktopDialog"
import { WorkbenchResourceTree } from "./WorkbenchResourceTree"
import { VISIBLE_PRODUCT_NAME } from "../../src/product-brand"

const navigationStorageKey = "creatx.workspace.navigation-preferences.v1"

interface NavigationPreferences {
  pinnedProjectIds: string[]
  pinnedSessionIds: string[]
  hiddenProjectIds: string[]
  projectAliases: Record<string, string>
}

interface NavigationProject {
  id: string
  name: string
  displayPath: string
  sessions: SessionSummary[]
}

interface ProjectNavigationProps {
  project: ProjectSnapshot | undefined
  sessions: SessionSummary[]
  activeSession: SessionSummary | undefined
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  onOpenProject: () => void
  onCreateSession: () => void
  onCreateProjectSession: (projectId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, title: string) => Promise<boolean>
  onRevealProject: (projectId: string) => void
  onDeleteSession: (sessionId: string) => Promise<boolean>
  onDeleteProjectSessions: (projectId: string) => Promise<boolean>
  onRemoveProject: (projectId: string) => void
  onRefresh: () => void
  onRestartApplication: (confirmed: boolean) => Promise<RestartApplicationResult | undefined>
  onOpenOnboarding: () => void
  onOpenSettings: () => void
  onOpenArtLibrary?: () => void
  artLibraryActive: boolean
  ideaLibraryActive: boolean
  onOpenIdeaLibrary: () => void
  heritageLibraryActive?: boolean
  onOpenHeritageLibrary?: () => void
  projectWorkbenches?: WorkbenchProjection[] | undefined
  activeWorkbenchId?: string | undefined
  workbenchOpen?: boolean | undefined
  selectedFileId?: string | undefined
  onSelectWorkbench?: (workbenchId: string) => void
  onOpenWorkbenchFile?: (file: ProjectFile) => void
  navigationContent?: "sessions" | "workbenches" | undefined
}

export function ProjectNavigation(props: ProjectNavigationProps) {
  const showSessions = props.navigationContent !== "workbenches"
  const [preferences, setPreferences] = useState(readNavigationPreferences)
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set(props.project ? [props.project.id] : []))
  const [expandedWorkbenchId, setExpandedWorkbenchId] = useState<string>()
  const [collapsedWorkbenchDirectories, setCollapsedWorkbenchDirectories] = useState<Set<string>>(new Set())
  const [projectMenu, setProjectMenu] = useState<{ projectId: string; top: number }>()
  const [previewedSession, setPreviewedSession] = useState<{ session: SessionSummary; top: number }>()
  const [renameProject, setRenameProject] = useState<NavigationProject>()
  const [renameValue, setRenameValue] = useState("")
  const [editingSessionId, setEditingSessionId] = useState<string>()
  const [editingSessionValue, setEditingSessionValue] = useState("")
  const [confirmation, setConfirmation] = useState<{ kind: "session" | "project-sessions"; id: string; title: string }>()
  const [restartConfirmation, setRestartConfirmation] = useState<RestartApplicationActivity>()
  const [restartState, setRestartState] = useState<"idle" | "checking" | "restarting">("idle")
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const projectMenuTrigger = useRef<HTMLButtonElement>(null)
  const restartTrigger = useRef<HTMLButtonElement>(null)

  const requestRestart = async (confirmed: boolean) => {
    setRestartState("checking")
    const result = await props.onRestartApplication(confirmed)
    if (!result) {
      setRestartState("idle")
      return
    }
    if (result.state === "confirmation_required") {
      setRestartConfirmation(result.activity)
      setRestartState("idle")
      return
    }
    setRestartConfirmation(undefined)
    setRestartState("restarting")
  }

  const projects = useMemo(() => navigationProjects(props.project, props.sessions, preferences), [preferences, props.project, props.sessions])
  const pinnedSessions = preferences.pinnedSessionIds.flatMap((id) => props.sessions.find((session) => session.id === id) ?? [])

  useEffect(() => {
    window.localStorage.setItem(navigationStorageKey, JSON.stringify(preferences))
  }, [preferences])

  useEffect(() => {
    if (!props.project) return
    setExpandedProjectIds((current) => new Set(current).add(props.project!.id))
    setPreferences((current) => current.hiddenProjectIds.includes(props.project!.id)
      ? { ...current, hiddenProjectIds: current.hiddenProjectIds.filter((id) => id !== props.project!.id) }
      : current)
  }, [props.project?.id])

  useEffect(() => {
    if (props.activeWorkbenchId) setExpandedWorkbenchId((current) => current ?? props.activeWorkbenchId)
  }, [props.activeWorkbenchId])

  useEffect(() => {
    if (!projectMenu) return
    projectMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || projectMenuRef.current?.contains(target) || projectMenuTrigger.current?.contains(target)) return
      setProjectMenu(undefined)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setProjectMenu(undefined)
      projectMenuTrigger.current?.focus()
    }
    document.addEventListener("pointerdown", closeOnPointerDown)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [projectMenu?.projectId])

  if (!props.leftOpen) {
    return <aside className="wb-sidebar wb-project-navigation is-collapsed conversation-index-panel" aria-label="全局项目与会话导航" data-surface="session-tree">
      <div className="wb-project-rail">
        <span className="wb-project-monogram"><CreatXBirdMark /></span>
        <button title="展开项目导航" onClick={() => props.setLeftOpen(true)}><PanelLeftOpen size={17} /></button>
        {showSessions && <button title="新会话" disabled={!props.project} onClick={props.onCreateSession}><Plus size={16} /></button>}
        <button className={props.artLibraryActive ? "is-active" : ""} title={props.onOpenArtLibrary ? "打开艺术库" : "艺术库未配置"} disabled={!props.onOpenArtLibrary} onClick={props.onOpenArtLibrary}><Palette size={16} /></button>
        <button className={props.ideaLibraryActive ? "is-active" : ""} title="打开灵感库" onClick={props.onOpenIdeaLibrary}><Lightbulb size={16} /></button>
        {props.onOpenHeritageLibrary && <button className={props.heritageLibraryActive ? "is-active" : ""} title="打开传承库" onClick={props.onOpenHeritageLibrary}><BookOpenText size={16} /></button>}
        <button ref={restartTrigger} title="恢复诺文" disabled={restartState !== "idle"} onClick={() => void requestRestart(false)}><Power size={16} /></button>
        <button className="wb-rail-onboarding" title="新手教程" onClick={props.onOpenOnboarding}><CircleHelp size={16} /></button>
        <button className="wb-rail-settings" title="设置" onClick={props.onOpenSettings}><Settings size={16} /></button>
      </div>
    </aside>
  }

  const toggleProjectPin = (projectId: string) => {
    setPreferences((current) => ({
      ...current,
      pinnedProjectIds: toggleIdentity(current.pinnedProjectIds, projectId),
    }))
    setProjectMenu(undefined)
  }

  const toggleSessionPin = (sessionId: string) => {
    setPreferences((current) => ({
      ...current,
      pinnedSessionIds: toggleIdentity(current.pinnedSessionIds, sessionId),
    }))
  }

  const openProjectMenu = (projectId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    projectMenuTrigger.current = event.currentTarget
    const rect = event.currentTarget.getBoundingClientRect()
    setProjectMenu((current) => current?.projectId === projectId ? undefined : { projectId, top: Math.min(window.innerHeight - 282, Math.max(10, rect.top - 10)) })
    setPreviewedSession(undefined)
  }

  const saveProjectAlias = () => {
    if (!renameProject) return
    const alias = renameValue.trim()
    setPreferences((current) => {
      const projectAliases = { ...current.projectAliases }
      if (alias && alias !== renameProject.name) projectAliases[renameProject.id] = alias
      else delete projectAliases[renameProject.id]
      return { ...current, projectAliases }
    })
    setRenameProject(undefined)
  }

  const executeDeletion = async () => {
    if (!confirmation) return
    const removed = confirmation.kind === "session"
      ? await props.onDeleteSession(confirmation.id)
      : await props.onDeleteProjectSessions(confirmation.id)
    if (!removed) return
    setPreferences((current) => confirmation.kind === "session"
      ? { ...current, pinnedSessionIds: current.pinnedSessionIds.filter((id) => id !== confirmation.id) }
      : { ...current, pinnedSessionIds: current.pinnedSessionIds.filter((id) => !props.sessions.some((session) => session.projectId === confirmation.id && session.id === id)) })
    setConfirmation(undefined)
  }

  const menuProject = projects.find((project) => project.id === projectMenu?.projectId)

  const beginSessionRename = (session: SessionSummary) => {
    setPreviewedSession(undefined)
    setEditingSessionId(session.id)
    setEditingSessionValue(session.title)
  }

  const finishSessionRename = async (session: SessionSummary) => {
    if (editingSessionId !== session.id) return
    const title = editingSessionValue.trim()
    setEditingSessionId(undefined)
    if (!title || title === session.title) return
    await props.onRenameSession(session.id, title)
  }

  const sessionTitle = (session: SessionSummary) => editingSessionId === session.id
    ? <input className="wb-session-rename-input" autoFocus value={editingSessionValue} aria-label="会话名称" onChange={(event) => setEditingSessionValue(event.target.value)} onBlur={() => void finishSessionRename(session)} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); void finishSessionRename(session) }
        if (event.key === "Escape") { event.preventDefault(); setEditingSessionId(undefined) }
      }} />
    : <button data-session-id={session.id} className={session.id === props.activeSession?.id ? "is-active" : ""} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); beginSessionRename(session) }} onClick={() => props.onSelectSession(session.id)}><span>{session.title}</span></button>

  return <aside className="wb-sidebar wb-project-navigation is-docked conversation-index-panel" aria-label="全局项目与会话导航" data-surface="session-tree">
    <div className="wb-project-heading">
      <div className="wb-brand" aria-label={VISIBLE_PRODUCT_NAME}><CreatXBirdMark /><strong>{VISIBLE_PRODUCT_NAME}</strong></div>
      <button className="wb-project-collapse" title="收起项目导航" onClick={() => props.setLeftOpen(false)}><PanelLeftClose size={16} /></button>
    </div>
    <div className="wb-library-actions" aria-label="创作资料库">
      <button className={props.artLibraryActive ? "is-active" : ""} disabled={!props.onOpenArtLibrary} title={props.onOpenArtLibrary ? "打开艺术库" : "艺术库未配置"} aria-current={props.artLibraryActive ? "page" : undefined} onClick={props.onOpenArtLibrary}><Palette size={17} /><span>艺术库</span></button>
      <button className={props.ideaLibraryActive ? "is-active" : ""} title="打开灵感库" aria-current={props.ideaLibraryActive ? "page" : undefined} onClick={props.onOpenIdeaLibrary}><Lightbulb size={17} /><span>灵感库</span></button>
      {props.onOpenHeritageLibrary && <button className={props.heritageLibraryActive ? "is-active" : ""} title="打开传承库" aria-current={props.heritageLibraryActive ? "page" : undefined} onClick={props.onOpenHeritageLibrary}><BookOpenText size={17} /><span>传承库</span></button>}
    </div>
    {showSessions && <section className="wb-pinned-navigation" aria-label="置顶">
      <button className="wb-project-group-heading wb-section-toggle" aria-expanded={pinnedOpen} onClick={() => setPinnedOpen((open) => !open)}><span>置顶</span>{pinnedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
      {pinnedOpen && <div className="wb-pinned-list">
        {pinnedSessions.map((session) => <div className="wb-session-row wb-pinned-session-row" key={session.id}>
          {sessionTitle(session)}
          <div className="wb-session-row-actions">
            <button title="取消置顶会话" onClick={() => toggleSessionPin(session.id)}><Pin size={14} fill="currentColor" /></button>
            <button title="删除会话" onClick={() => setConfirmation({ kind: "session", id: session.id, title: session.title })}><Trash2 size={14} /></button>
          </div>
        </div>)}
        {!pinnedSessions.length && <span className="wb-pinned-empty">暂无置顶</span>}
      </div>}
    </section>}
    <nav className="wb-project-groups" aria-label={showSessions ? "项目会话" : "项目工作台"}>
      <section className="wb-project-group">
        <div className="wb-project-group-heading">
          <button className="wb-project-group-toggle" aria-expanded={projectsOpen} onClick={() => setProjectsOpen((open) => !open)}><span>项目</span>{projectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          <div className="wb-project-heading-actions">
            {showSessions && <button aria-label="新会话" title="新会话" disabled={!props.project} onClick={props.onCreateSession}><SquarePen size={15} /></button>}
            <button data-onboarding="open-project" aria-label="打开项目" title="打开项目" onClick={props.onOpenProject}><FolderOpen size={15} /></button>
          </div>
        </div>
        {projectsOpen && <div className="wb-project-list">
          {projects.map((project) => {
            const expanded = expandedProjectIds.has(project.id)
            const projectPinned = preferences.pinnedProjectIds.includes(project.id)
            return <div className={`wb-project-tree ${project.id === props.project?.id ? "is-active" : ""}`} key={project.id}>
              <div className="wb-project-row">
                <button className="wb-project-main" title={project.displayPath} aria-expanded={expanded} onClick={() => {
                  setExpandedProjectIds((current) => {
                    const next = new Set(current)
                    if (next.has(project.id)) next.delete(project.id)
                    else next.add(project.id)
                    return next
                  })
                  if (project.id !== props.project?.id) props.onSelectProject(project.id)
                }}>
                  {expanded ? <FolderOpen size={17} /> : <Folder size={17} />}
                  <span>{project.name}</span>
                  {projectPinned && <Pin className="wb-pinned-indicator" size={12} fill="currentColor" />}
                  <ChevronDown className={expanded ? "is-open" : ""} size={13} />
                </button>
                <div className="wb-project-row-actions">
                  {showSessions && <button title={`在 ${project.name} 中新建会话`} onClick={(event) => { event.stopPropagation(); props.onCreateProjectSession(project.id) }}><SquarePen size={15} /></button>}
                  <button title={`${project.name} 项目菜单`} aria-expanded={projectMenu?.projectId === project.id} onClick={(event) => openProjectMenu(project.id, event)}><MoreHorizontal size={16} /></button>
                </div>
              </div>
              {expanded && !showSessions ? <div className="wb-workbench-launcher-list" role="list" aria-label={`${project.name} 工作台`}>
                {project.id === props.project?.id && props.projectWorkbenches?.map((workbench) => <div className="wb-workbench-launcher" role="listitem" key={workbench.id}>
                  <button className={workbench.id === props.activeWorkbenchId ? "is-active" : ""} aria-expanded={expandedWorkbenchId === workbench.id} onClick={() => {
                    if (!props.workbenchOpen) {
                      setExpandedWorkbenchId(workbench.id)
                      props.onSelectWorkbench?.(workbench.id)
                      return
                    }
                    if (expandedWorkbenchId === workbench.id) { setExpandedWorkbenchId(undefined); return }
                    setExpandedWorkbenchId(workbench.id)
                    if (workbench.id !== props.activeWorkbenchId) props.onSelectWorkbench?.(workbench.id)
                  }} onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" && expandedWorkbenchId === workbench.id) {
                      event.preventDefault()
                      setExpandedWorkbenchId(undefined)
                      return
                    }
                    if (event.key !== "ArrowRight" || expandedWorkbenchId === workbench.id) return
                    event.preventDefault()
                    setExpandedWorkbenchId(workbench.id)
                    if (!props.workbenchOpen || workbench.id !== props.activeWorkbenchId) props.onSelectWorkbench?.(workbench.id)
                  }}><BookOpenText size={15} /><span><strong>{workbench.title}</strong><small>进入创作空间</small></span>{expandedWorkbenchId === workbench.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  {expandedWorkbenchId === workbench.id && <div className="wb-workbench-file-expansion" aria-label={`${workbench.title} 文件`}>
                    <WorkbenchResourceTree
                      entries={workbench.entries}
                      project={props.project}
                      selectedFileId={props.selectedFileId}
                      namespace={workbench.id}
                      collapsedDirectories={collapsedWorkbenchDirectories}
                      variant="navigation"
                      onToggleDirectory={(key) => setCollapsedWorkbenchDirectories((current) => {
                        const next = new Set(current)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return next
                      })}
                      onOpenFile={(file) => props.onOpenWorkbenchFile?.(file)}
                    />
                  </div>}
                </div>)}
                {project.id === props.project?.id && !props.projectWorkbenches?.length && <span className="wb-project-empty">还没有工作台</span>}
                {project.id !== props.project?.id && <span className="wb-project-empty">选择项目后显示工作台</span>}
              </div> : expanded && <div className="wb-project-sessions" role="list">
                {project.sessions.filter((session) => !preferences.pinnedSessionIds.includes(session.id)).map((session) => <div
                  className="wb-session-row"
                  key={session.id}
                  role="listitem"
                  onMouseEnter={(event) => setPreviewedSession({ session, top: Math.min(window.innerHeight - 112, Math.max(10, event.currentTarget.getBoundingClientRect().top - 8)) })}
                  onMouseLeave={() => setPreviewedSession(undefined)}
                  onFocus={(event) => setPreviewedSession({ session, top: Math.min(window.innerHeight - 112, Math.max(10, event.currentTarget.getBoundingClientRect().top - 8)) })}
                  onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewedSession(undefined) }}
                >
                  {sessionTitle(session)}
                  <div className="wb-session-row-actions">
                    <button title={preferences.pinnedSessionIds.includes(session.id) ? "取消置顶会话" : "置顶会话"} onClick={() => toggleSessionPin(session.id)}><Pin size={14} fill={preferences.pinnedSessionIds.includes(session.id) ? "currentColor" : "none"} /></button>
                    <button title="删除会话" onClick={() => setConfirmation({ kind: "session", id: session.id, title: session.title })}><Trash2 size={14} /></button>
                  </div>
                </div>)}
                {!project.sessions.some((session) => !preferences.pinnedSessionIds.includes(session.id)) && <span className="wb-project-empty">还没有会话</span>}
              </div>}
            </div>
          })}
          {!projects.length && <button className="wb-open-project-empty" onClick={props.onOpenProject}><FolderOpen size={16} /><span>选择已有文件夹</span></button>}
        </div>}
      </section>
    </nav>
    <div className="wb-secondary-nav"><button onClick={props.onRefresh} disabled={!props.project}><RefreshCw size={15} /><span>刷新项目</span></button><button ref={restartTrigger} title="安全重启整个应用" disabled={restartState !== "idle"} onClick={() => void requestRestart(false)}><Power size={15} /><span>{restartState === "restarting" ? "正在恢复诺文…" : "恢复诺文"}</span></button><button title="新手教程" onClick={props.onOpenOnboarding}><CircleHelp size={15} /><span>新手教程</span></button><button title="设置" onClick={props.onOpenSettings}><Settings size={15} /><span>设置</span></button></div>
    {previewedSession && !projectMenu && <div className="wb-session-preview" style={{ top: previewedSession.top }} role="tooltip">
      <div><strong>{previewedSession.session.title}</strong><time>{relativeSessionAge(previewedSession.session.updatedAt)}</time></div>
      <span><Folder size={16} />{projects.find((project) => project.id === previewedSession.session.projectId)?.name ?? "当前项目"}</span>
    </div>}
    {menuProject && projectMenu && <div ref={projectMenuRef} className="wb-project-menu" style={{ top: projectMenu.top }} role="menu" aria-label={`${menuProject.name} 项目菜单`} onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
      event.preventDefault()
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length
      items[next]?.focus()
    }}>
      <button role="menuitem" onClick={() => toggleProjectPin(menuProject.id)}><Pin size={16} fill={preferences.pinnedProjectIds.includes(menuProject.id) ? "currentColor" : "none"} /><span>{preferences.pinnedProjectIds.includes(menuProject.id) ? "取消置顶项目" : "置顶项目"}</span></button>
      <button role="menuitem" onClick={() => { setProjectMenu(undefined); props.onRevealProject(menuProject.id) }}><FolderOpen size={16} /><span>在资源管理器中打开</span></button>
      <button role="menuitem" onClick={() => { setProjectMenu(undefined); setRenameProject(menuProject); setRenameValue(menuProject.name) }}><SquarePen size={16} /><span>编辑项目名称</span></button>
      <button role="menuitem" onClick={() => { setProjectMenu(undefined); setConfirmation({ kind: "project-sessions", id: menuProject.id, title: menuProject.name }) }}><Trash2 size={16} /><span>删除聊天</span></button>
      <button className="is-danger" role="menuitem" onClick={() => {
        setPreferences((current) => ({ ...current, hiddenProjectIds: [...new Set([...current.hiddenProjectIds, menuProject.id])], pinnedProjectIds: current.pinnedProjectIds.filter((id) => id !== menuProject.id) }))
        setProjectMenu(undefined)
        props.onRemoveProject(menuProject.id)
      }}><X size={16} /><span>从列表移除</span></button>
    </div>}
    {renameProject && <DesktopDialog className="wb-navigation-dialog" backdropClassName="wb-navigation-dialog-backdrop" labelId="wb-rename-title" returnFocus={projectMenuTrigger.current} onClose={() => setRenameProject(undefined)}>
      <form className="wb-navigation-dialog-form" onSubmit={(event) => { event.preventDefault(); saveProjectAlias() }}>
        <strong id="wb-rename-title">编辑项目名称</strong>
        <p>只修改{VISIBLE_PRODUCT_NAME}中的显示名称，不会重命名磁盘文件夹。</p>
        <input data-dialog-initial-focus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label="项目显示名称" />
        <div><button type="button" onClick={() => setRenameProject(undefined)}>取消</button><button className="is-primary" type="submit">保存</button></div>
      </form>
    </DesktopDialog>}
    {restartConfirmation && <DesktopDialog className="wb-navigation-dialog wb-restart-dialog" backdropClassName="wb-navigation-dialog-backdrop" labelId="wb-restart-title" kind="alertdialog" returnFocus={restartTrigger.current} onClose={() => setRestartConfirmation(undefined)}>
      <>
        <strong id="wb-restart-title">恢复诺文并中断当前工作？</strong>
        <p>{restartActivityMessage(restartConfirmation)}重启后会回到当前项目和会话，但不会自动重发消息、模型请求或工具调用。</p>
        <div><button data-dialog-initial-focus disabled={restartState !== "idle"} onClick={() => setRestartConfirmation(undefined)}>取消</button><button className="is-primary" disabled={restartState !== "idle"} onClick={() => void requestRestart(true)}>{restartState === "checking" ? "正在准备…" : "确认恢复"}</button></div>
      </>
    </DesktopDialog>}
    {confirmation && <DesktopDialog className="wb-navigation-dialog" backdropClassName="wb-navigation-dialog-backdrop" labelId="wb-delete-title" kind="alertdialog" returnFocus={projectMenuTrigger.current} onClose={() => setConfirmation(undefined)}>
      <>
        <strong id="wb-delete-title">{confirmation.kind === "session" ? "删除这个会话？" : `删除 ${confirmation.title} 的全部聊天？`}</strong>
        <p>{confirmation.kind === "session" ? `“${confirmation.title}”的 Cline 历史将永久删除，无法恢复。` : "该项目的全部 Cline 会话历史将永久删除；项目文件不会被删除。"}</p>
        <div><button data-dialog-initial-focus onClick={() => setConfirmation(undefined)}>取消</button><button className="is-danger" onClick={() => void executeDeletion()}>删除</button></div>
      </>
    </DesktopDialog>}
  </aside>
}

function restartActivityMessage(activity: RestartApplicationActivity) {
  const effects = [
    activity.conversation ? "当前回复或工具会被中断" : undefined,
    activity.growth ? "持续创作任务会暂停" : undefined,
    activity.imageGeneration ? "正在生成的图片会标记为中断" : undefined,
  ].filter((effect): effect is string => Boolean(effect))
  return `${effects.join("；")}。`
}

function CreatXBirdMark() {
  return <img className="wb-bird-mark" src={birdWingLogo} alt={`${VISIBLE_PRODUCT_NAME}飞鸟标志`} />
}

function navigationProjects(project: ProjectSnapshot | undefined, sessions: SessionSummary[], preferences: NavigationPreferences) {
  const projects = new Map<string, NavigationProject>()
  for (const session of sessions) {
    const current = projects.get(session.projectId)
    const displayPath = session.displayPath
    projects.set(session.projectId, {
      id: session.projectId,
      name: preferences.projectAliases[session.projectId] ?? current?.name ?? projectName(displayPath),
      displayPath,
      sessions: [...(current?.sessions ?? []), session],
    })
  }
  if (project) {
    const current = projects.get(project.id)
    projects.set(project.id, {
      id: project.id,
      name: preferences.projectAliases[project.id] ?? project.name,
      displayPath: project.displayPath,
      sessions: current?.sessions ?? [],
    })
  }
  return sortPinned(
    [...projects.values()].filter((candidate) => candidate.id === project?.id || !preferences.hiddenProjectIds.includes(candidate.id)),
    preferences.pinnedProjectIds,
    (candidate) => candidate.id,
  )
}

function projectName(displayPath: string) {
  return displayPath.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || "项目"
}

function toggleIdentity(current: string[], id: string) {
  if (current.includes(id)) return current.filter((candidate) => candidate !== id)
  return [id, ...current]
}

function sortPinned<T>(items: T[], pinnedIds: string[], identify: (item: T) => string) {
  const pinned = new Map(pinnedIds.map((id, index) => [id, index]))
  return [...items].sort((left, right) => {
    const leftIndex = pinned.get(identify(left))
    const rightIndex = pinned.get(identify(right))
    if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex
    if (leftIndex !== undefined) return -1
    if (rightIndex !== undefined) return 1
    return 0
  })
}

function relativeSessionAge(updatedAt: string) {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) return ""
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天`
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(timestamp)
}

function readNavigationPreferences(): NavigationPreferences {
  const fallback = { pinnedProjectIds: [], pinnedSessionIds: [], hiddenProjectIds: [], projectAliases: {} }
  const saved = window.localStorage.getItem(navigationStorageKey)
  if (!saved) return fallback
  try {
    const parsed = JSON.parse(saved) as Partial<NavigationPreferences>
    return {
      pinnedProjectIds: stringList(parsed.pinnedProjectIds),
      pinnedSessionIds: stringList(parsed.pinnedSessionIds),
      hiddenProjectIds: stringList(parsed.hiddenProjectIds),
      projectAliases: parsed.projectAliases && typeof parsed.projectAliases === "object"
        ? Object.fromEntries(Object.entries(parsed.projectAliases).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())))
        : {},
    }
  } catch {
    return fallback
  }
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim())))]
}
