import { useEffect, useId, useRef, useState } from "react"
import { ArrowLeft, Check, Download, Eye, LoaderCircle, MessageSquare, Palette, RotateCw, ShieldAlert, Trash2, X } from "lucide-react"
import { classifyRuntimeError, type ArtApprovalEdits, type ArtLibraryItemProjection, type ArtLibrarySnapshot, type ArtReversePrompt, type ArtStyleKeywordExport, type CreatXDesktopApi, type CreatXError } from "@creatx/contracts"

export type ArtLibraryRoute = "atlas" | "approval" | "exhibition"
export type ArtLibraryApi = Pick<CreatXDesktopApi, "readArtLibrary" | "reviewArtApproval" | "exportArtStyleKeywords">

export interface ArtApprovalDraft {
  title: string
  targetLibrary: string
  styleAnalysis: string
  palette: string[]
  patternTags: string[]
  compositionTags: string[]
  moodTags: string[]
  reversePrompt?: ArtReversePrompt
}

export type ArtLibraryPageState =
  | { status: "loading" }
  | { status: "error"; error: CreatXError }
  | { status: "ready"; snapshot: ArtLibrarySnapshot }

const approvalDraftCache = new Map<string, ArtApprovalDraft>()

export class ArtLibraryRefreshGate {
  private initialRead = false
  private revision = -1

  shouldRead(revision?: number) {
    if (revision === undefined) {
      if (this.initialRead) return false
      this.initialRead = true
      return true
    }
    if (revision <= this.revision) return false
    this.revision = revision
    return true
  }

  markApplied(revision: number) {
    this.revision = Math.max(this.revision, revision)
  }
}

export function ArtLibraryPage({ route = "atlas", revision, onOpenChat, api = window.creatx }: { route?: ArtLibraryRoute; revision?: number; onOpenChat: () => void; api?: ArtLibraryApi }) {
  const [state, setState] = useState<ArtLibraryPageState>({ status: "loading" })
  const [activeRoute, setActiveRoute] = useState(route)
  const [selectedItemId, setSelectedItemId] = useState<string>()
  const [draft, setDraft] = useState<ArtApprovalDraft>()
  const [busyAction, setBusyAction] = useState<string>()
  const [rejectPending, setRejectPending] = useState(false)
  const [actionError, setActionError] = useState<CreatXError>()
  const [actionStatus, setActionStatus] = useState<string>()
  const [exportResult, setExportResult] = useState<ArtStyleKeywordExport>()
  const refreshGate = useRef(new ArtLibraryRefreshGate())
  const readRequest = useRef(0)

  useEffect(() => {
    setActiveRoute(route)
    setSelectedItemId(undefined)
    setRejectPending(false)
  }, [route])

  useEffect(() => {
    if (!refreshGate.current.shouldRead(revision)) return
    readSnapshot(false)
  }, [api, revision])

  useEffect(() => {
    if (!selectedItemId || state.status !== "ready") return
    const item = findArtItem(state.snapshot, selectedItemId)
    if (item) setDraft(approvalDraftCache.get(item.id) ?? createArtApprovalEdits(item))
  }, [selectedItemId])

  useEffect(() => {
    if (!rejectPending) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setRejectPending(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [rejectPending])

  function changeRoute(next: ArtLibraryRoute) {
    setActiveRoute(next)
    setSelectedItemId(undefined)
    setRejectPending(false)
    setActionError(undefined)
  }

  function retry() {
    readSnapshot(true)
  }

  function readSnapshot(showLoading: boolean) {
    const request = ++readRequest.current
    if (showLoading) setState({ status: "loading" })
    void api.readArtLibrary().then((result) => {
      if (request !== readRequest.current) return
      if (!result.ok) {
        setState({ status: "error", error: result.error })
        return
      }
      refreshGate.current.markApplied(result.value.revision)
      setState({ status: "ready", snapshot: result.value })
      setSelectedItemId((current) => current && findArtItem(result.value, current) ? current : undefined)
    }).catch((failure) => {
      if (request === readRequest.current) setState({ status: "error", error: classifyRuntimeError(failure) })
    })
  }

  async function review(action: "approve" | "reject" | "hold") {
    if (busyAction || !selectedItemId || !draft) return
    setBusyAction(action)
    setActionError(undefined)
    setActionStatus(undefined)
    const item = state.status === "ready" ? findArtItem(state.snapshot, selectedItemId) : undefined
    const result = await api.reviewArtApproval({
      itemId: selectedItemId,
      action,
      ...(action === "approve" ? { targetLibrary: draft.targetLibrary, edits: toArtApprovalEdits(draft, item) } : {}),
    }).catch((failure) => ({ ok: false as const, error: classifyRuntimeError(failure) }))
    setBusyAction(undefined)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    refreshGate.current.markApplied(result.value.revision)
    setState({ status: "ready", snapshot: result.value })
    setRejectPending(false)
    if (action !== "hold") approvalDraftCache.delete(selectedItemId)
    const stillExists = findArtItem(result.value, selectedItemId)
    setSelectedItemId(stillExists ? selectedItemId : undefined)
    setActionStatus(action === "approve" ? "已批准并移入正式分类。" : action === "reject" ? "已拒绝并删除待审批内容。" : "已保留在待审批列表。")
  }

  async function exportKeywords(library: string) {
    if (busyAction) return
    setBusyAction(`export:${library}`)
    setActionError(undefined)
    const result = await api.exportArtStyleKeywords(library).catch((failure) => ({ ok: false as const, error: classifyRuntimeError(failure) }))
    setBusyAction(undefined)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    setExportResult(result.value)
    setActionStatus(`已从 ${result.value.itemCount} 张作品的当前标签确定性去重。`)
  }

  return <ArtLibraryPageContent
    state={state}
    route={activeRoute}
    {...(selectedItemId ? { selectedItemId } : {})}
    {...(draft ? { draft } : {})}
    {...(busyAction ? { busyAction } : {})}
    rejectPending={rejectPending}
    {...(actionError ? { actionError } : {})}
    {...(actionStatus ? { actionStatus } : {})}
    {...(exportResult ? { exportResult } : {})}
    onSelect={(itemId) => { setSelectedItemId(itemId); setRejectPending(false); setActionError(undefined); setActionStatus(undefined) }}
    onRoute={changeRoute}
    onDraftChange={(next) => {
      setDraft(next)
      if (selectedItemId) approvalDraftCache.set(selectedItemId, next)
    }}
    onReview={(action) => void review(action)}
    onRequestReject={() => setRejectPending(true)}
    onCancelReject={() => setRejectPending(false)}
    onExport={(library) => void exportKeywords(library)}
    onOpenChat={onOpenChat}
    onRetry={retry}
  />
}

export function ArtLibraryPageContent(props: {
  state: ArtLibraryPageState
  route: ArtLibraryRoute
  selectedItemId?: string
  draft?: ArtApprovalDraft
  busyAction?: string
  rejectPending?: boolean
  actionError?: CreatXError
  actionStatus?: string
  exportResult?: ArtStyleKeywordExport
  onSelect: (itemId: string | undefined) => void
  onRoute: (route: ArtLibraryRoute) => void
  onDraftChange: (draft: ArtApprovalDraft) => void
  onReview: (action: "approve" | "reject" | "hold") => void
  onRequestReject: () => void
  onCancelReject: () => void
  onExport: (library: string) => void
  onOpenChat: () => void
  onRetry: () => void
}) {
  const snapshot = props.state.status === "ready" ? props.state.snapshot : undefined
  const selected = snapshot && props.selectedItemId ? findArtItem(snapshot, props.selectedItemId) : undefined
  const route = props.route === "exhibition" ? "atlas" : props.route

  return <section className="wb-art-library" aria-label="艺术库">
    <header className="wb-art-library-header">
      <div className="wb-art-library-heading"><Palette size={18} /><span><strong>艺术库</strong><small>{snapshot ? `候选区 ${snapshot.incomingCount} · 待审批 ${snapshot.approvalItems.length}` : "真实文件库"}</small></span></div>
      <nav aria-label="艺术库区域">
        <button className={route === "atlas" ? "is-active" : ""} type="button" onClick={() => props.onRoute("atlas")}><Eye size={15} />分类</button>
        <button className={route === "approval" ? "is-active" : ""} type="button" onClick={() => props.onRoute("approval")}><Check size={15} />审批{snapshot ? ` ${snapshot.approvalItems.length}` : ""}</button>
        <button type="button" onClick={props.onOpenChat}><MessageSquare size={15} />对话</button>
      </nav>
    </header>

    {props.state.status === "loading" && <div className="wb-art-library-state" role="status"><LoaderCircle className="spin" size={22} /><strong>正在读取真实艺术库</strong><span>从本机艺术库状态读取候选、审批和正式分类。</span></div>}
    {props.state.status === "error" && <div className="wb-art-library-state is-error" role="alert"><ShieldAlert size={22} /><strong>{props.state.error.message}</strong>{props.state.error.detail && <code>{props.state.error.detail}</code>}<span>没有修改任何艺术库文件，当前页面可安全重试。</span><button type="button" onClick={props.onRetry}><RotateCw size={15} />重新读取</button></div>}

    {snapshot && <div className={`wb-art-library-body ${selected ? "has-detail" : ""}`}>
      <main className="wb-art-library-list" aria-label={route === "approval" ? "待审批作品" : "正式艺术分类"}>
        {selected && <button className="wb-art-library-back" type="button" onClick={() => props.onSelect(undefined)}><ArrowLeft size={15} />返回列表</button>}
        {!selected && route === "approval" && <ApprovalList items={snapshot.approvalItems} onSelect={props.onSelect} />}
        {!selected && route === "atlas" && <LibraryList snapshot={snapshot} {...(props.busyAction ? { busyAction: props.busyAction } : {})} onSelect={props.onSelect} onExport={props.onExport} onOpenChat={props.onOpenChat} />}
        {selected && props.draft && <ArtItemDetail item={selected} draft={props.draft} {...(props.busyAction ? { busyAction: props.busyAction } : {})} onDraftChange={props.onDraftChange} onReview={props.onReview} onRequestReject={props.onRequestReject} />}
      </main>

      {(props.actionError || props.actionStatus || props.exportResult) && <aside className={`wb-art-library-result ${props.actionError ? "is-error" : ""}`} aria-live="polite">
        {props.actionError && <><strong>{props.actionError.message}</strong>{props.actionError.detail && <code>{props.actionError.detail}</code>}<span>你的选择和编辑草稿均已保留，可以修改后重试。</span></>}
        {!props.actionError && props.actionStatus && <strong>{props.actionStatus}</strong>}
        {props.exportResult && <><span>“{props.exportResult.library}”关键词 · 零模型调用</span><textarea aria-label="导出的关键词" readOnly value={props.exportResult.text} /></>}
      </aside>}
    </div>}

    {props.rejectPending && selected && <div className="wb-art-library-dialog-backdrop">
      <div className="wb-art-library-dialog" role="dialog" aria-modal="true" aria-labelledby="art-reject-title">
        <button className="wb-art-library-dialog-close" type="button" title="关闭" onClick={props.onCancelReject}><X size={16} /></button>
        <Trash2 size={21} />
        <h2 id="art-reject-title">拒绝“{selected.title}”？</h2>
        <p>这会只删除本机艺术库中的这条待审批内容；原项目或原对话附件不受影响。此操作无法从艺术库恢复。</p>
        <div><button type="button" onClick={props.onCancelReject}>取消</button><button className="is-danger" type="button" disabled={Boolean(props.busyAction)} onClick={() => props.onReview("reject")}>{props.busyAction === "reject" ? "正在删除" : "确认拒绝"}</button></div>
      </div>
    </div>}
  </section>
}

function ApprovalList({ items, onSelect }: { items: ArtLibraryItemProjection[]; onSelect: (itemId: string) => void }) {
  if (!items.length) return <div className="wb-art-library-empty"><Check size={22} /><strong>暂无待审批作品</strong><span>AI 完成单图视觉整理后，作品会出现在这里。</span></div>
  return <div className="wb-art-library-grid">{items.map((item) => <button className="wb-art-library-card" type="button" key={item.id} onClick={() => onSelect(item.id)}>
    <img src={item.imageUrl} alt="" />
    <span><strong>{item.title}</strong><small>{item.suggestedLibrary.title} · {item.sourceLabel}</small><em className={item.curation.status === "current" ? "is-current" : "is-legacy"}>{item.curation.status === "current" ? "当前视觉整理" : "旧版未复核"}</em></span>
  </button>)}</div>
}

function LibraryList({ snapshot, busyAction, onSelect, onExport, onOpenChat }: { snapshot: ArtLibrarySnapshot; busyAction?: string; onSelect: (itemId: string) => void; onExport: (library: string) => void; onOpenChat: () => void }) {
  if (!snapshot.libraries.length) return <div className="wb-art-library-empty"><Palette size={22} /><strong>还没有正式艺术分类</strong><span>批准第一张作品时可以创建新分类。</span></div>
  return <div className="wb-art-library-categories">{snapshot.libraries.map((library) => <article key={library.title}>
    <header><span><strong>{library.title}</strong><small>{library.itemCount} 张作品</small></span><div><button type="button" disabled={Boolean(busyAction)} onClick={() => onExport(library.title)}><Download size={14} />{busyAction === `export:${library.title}` ? "正在导出" : "导出关键词"}</button><button type="button" onClick={onOpenChat}><MessageSquare size={14} />提取风格</button></div></header>
    <p>“导出关键词”只汇总当前标签并去重；“提取风格”会进入普通对话，由 AI 解读整个分类。</p>
    <div>{library.items.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item.id)}><img src={item.imageUrl} alt="" /><span>{item.title}</span></button>)}</div>
  </article>)}</div>
}

function ArtItemDetail({ item, draft, busyAction, onDraftChange, onReview, onRequestReject }: { item: ArtLibraryItemProjection; draft: ArtApprovalDraft; busyAction?: string; onDraftChange: (draft: ArtApprovalDraft) => void; onReview: (action: "approve" | "hold") => void; onRequestReject: () => void }) {
  const editable = item.state === "approval" && !busyAction
  const fieldId = useId()
  return <article className="wb-art-library-detail">
    <figure><img src={item.imageUrl} alt={item.title} /><figcaption>{item.image.width} × {item.image.height} · {formatBytes(item.image.bytes)} · {sourceKindLabel(item)}</figcaption></figure>
    <div className="wb-art-library-editor">
      <header><span><strong>{item.title}</strong><small>{item.artist} · {item.sourceLabel}</small></span><em className={item.curation.status === "current" ? "is-current" : "is-legacy"}>{item.curation.status === "current" ? "当前视觉整理" : "旧版整理，未经视觉复核"}</em></header>
      <div className="wb-art-library-fields two-columns">
        <label htmlFor={`${fieldId}-title`}>标题<input id={`${fieldId}-title`} value={draft.title} disabled={!editable} onChange={(event) => onDraftChange({ ...draft, title: event.currentTarget.value })} /></label>
        <label htmlFor={`${fieldId}-library`}>分类<input id={`${fieldId}-library`} value={draft.targetLibrary} disabled={!editable} onChange={(event) => onDraftChange({ ...draft, targetLibrary: event.currentTarget.value })} /></label>
      </div>
      <label className="wb-art-library-field" htmlFor={`${fieldId}-analysis`}>作品解读<textarea id={`${fieldId}-analysis`} value={draft.styleAnalysis} disabled={!editable} rows={6} onChange={(event) => onDraftChange({ ...draft, styleAnalysis: event.currentTarget.value })} /></label>
      <PaletteEditor values={draft.palette} disabled={!editable} onChange={(palette) => onDraftChange({ ...draft, palette })} />
      <TagEditor label="形式语言标签" values={draft.patternTags} disabled={!editable} onChange={(patternTags) => onDraftChange({ ...draft, patternTags })} />
      <TagEditor label="构图标签" values={draft.compositionTags} disabled={!editable} onChange={(compositionTags) => onDraftChange({ ...draft, compositionTags })} />
      <TagEditor label="情绪标签" values={draft.moodTags} disabled={!editable} onChange={(moodTags) => onDraftChange({ ...draft, moodTags })} />
      {draft.reversePrompt ? <div className="wb-art-library-prompt">
        <PromptField label="STYLE" value={draft.reversePrompt.style} disabled={!editable} name="reversePrompt.style" onChange={(style) => onDraftChange({ ...draft, reversePrompt: { ...draft.reversePrompt!, style } })} />
        <PromptField label="COMPOSITION" value={draft.reversePrompt.composition} disabled={!editable} name="reversePrompt.composition" onChange={(composition) => onDraftChange({ ...draft, reversePrompt: { ...draft.reversePrompt!, composition } })} />
        <PromptField label="SCENE" value={draft.reversePrompt.scene} disabled={!editable} name="reversePrompt.scene" onChange={(scene) => onDraftChange({ ...draft, reversePrompt: { ...draft.reversePrompt!, scene } })} />
        <TagEditor label="NEGATIVE" values={draft.reversePrompt.negative} disabled={!editable} onChange={(negative) => onDraftChange({ ...draft, reversePrompt: { ...draft.reversePrompt!, negative } })} />
      </div> : <div className="wb-art-library-legacy"><ShieldAlert size={17} /><span><strong>旧 Prompt 不能作为新版反推依据</strong><small>需要重新看图整理后，才能编辑四层反推 Prompt。旧内容不会被伪装成当前结果。</small></span></div>}
      {item.state === "approval" && <footer><button type="button" disabled={Boolean(busyAction)} onClick={() => onReview("hold")}>{busyAction === "hold" ? "正在保留" : "暂缓"}</button><button className="is-danger" type="button" disabled={Boolean(busyAction)} onClick={onRequestReject}>拒绝</button><button className="is-primary" type="button" disabled={Boolean(busyAction)} onClick={() => onReview("approve")}>{busyAction === "approve" ? "正在批准" : "批准并归档"}</button></footer>}
    </div>
  </article>
}

function TagEditor({ label, values, disabled, onChange }: { label: string; values: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const [input, setInput] = useState("")
  return <fieldset className="wb-art-library-tags"><legend>{label}</legend><div>{values.map((value, index) => <span key={`${value}-${index}`}>{value}<button type="button" title={`删除 ${value}`} disabled={disabled} onClick={() => onChange(values.filter((_, target) => target !== index))}><X size={12} /></button></span>)}</div><input aria-label={`添加${label}`} value={input} disabled={disabled} placeholder="输入后按 Enter 或逗号添加" onChange={(event) => {
    const next = event.currentTarget.value
    if (!next.endsWith(",") && !next.endsWith("，")) {
      setInput(next)
      return
    }
    const value = next.slice(0, -1).trim()
    if (value) onChange(uniqueValues([...values, value]))
    setInput("")
  }} onKeyDown={(event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const value = input.trim()
    if (value) onChange(uniqueValues([...values, value]))
    setInput("")
  }} /></fieldset>
}

function PaletteEditor({ values, disabled, onChange }: { values: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const [input, setInput] = useState("")
  return <fieldset className="wb-art-library-tags wb-art-library-palette"><legend>色板</legend><div>{values.map((value, index) => <span key={`${value}-${index}`}><i style={{ background: safeColor(value) }} />{value}<button type="button" title={`删除 ${value}`} disabled={disabled} onClick={() => onChange(values.filter((_, target) => target !== index))}><X size={12} /></button></span>)}</div><input aria-label="添加色板颜色" value={input} disabled={disabled} placeholder="#RRGGBB，按 Enter 添加" onChange={(event) => setInput(event.currentTarget.value)} onKeyDown={(event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const value = input.trim()
    if (value) onChange(uniqueValues([...values, value]))
    setInput("")
  }} /></fieldset>
}

function PromptField({ label, name, value, disabled, onChange }: { label: string; name: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label>{label}<textarea name={name} value={value} disabled={disabled} rows={5} onChange={(event) => onChange(event.currentTarget.value)} /></label>
}

export function createArtApprovalEdits(item: ArtLibraryItemProjection): ArtApprovalDraft {
  return {
    title: item.title,
    targetLibrary: item.library ?? item.suggestedLibrary.title,
    styleAnalysis: item.styleAnalysis,
    palette: [...item.palette],
    patternTags: [...item.patternTags],
    compositionTags: [...item.compositionTags],
    moodTags: [...item.moodTags],
    ...(item.curation.status === "current" ? { reversePrompt: { ...item.curation.reversePrompt, negative: [...item.curation.reversePrompt.negative] } } : {}),
  }
}

function toArtApprovalEdits(draft: ArtApprovalDraft, item?: ArtLibraryItemProjection): ArtApprovalEdits {
  return {
    title: draft.title,
    styleAnalysis: draft.styleAnalysis,
    palette: draft.palette,
    patternTags: draft.patternTags,
    compositionTags: draft.compositionTags,
    moodTags: draft.moodTags,
    ...(item?.curation.status === "current" && draft.reversePrompt ? { reversePrompt: draft.reversePrompt } : {}),
  }
}

function findArtItem(snapshot: ArtLibrarySnapshot, itemId: string) {
  return snapshot.approvalItems.find((item) => item.id === itemId) ?? snapshot.libraries.flatMap((library) => library.items).find((item) => item.id === itemId)
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const display = value.normalize("NFKC").trim()
    const key = display.toLocaleLowerCase("en-US")
    if (!display || seen.has(key)) return []
    seen.add(key)
    return [display]
  })
}

function safeColor(value: string) {
  return /^#[\da-f]{3}([\da-f]{3})?$/iu.test(value) ? value : "transparent"
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function sourceKindLabel(item: ArtLibraryItemProjection) {
  if (item.sourceKind === "chat-attachment") return "对话附件"
  if (item.sourceKind === "project-file") return item.projectRelativePath ? `项目文件 · ${item.projectRelativePath}` : "项目文件"
  if (item.sourceKind === "seed") return "内置原图"
  return item.sourceUrl ? "公网收藏" : "网络来源"
}
