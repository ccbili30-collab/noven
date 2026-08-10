import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Bookmark, Heart, Send, Share2, X } from "lucide-react"
import type { CreativeLibraryReaction, SessionSummary } from "@creatx/contracts"
import { DesktopDialog } from "./DesktopDialog"
import { creativeLibraryShareRowHeight, filterShareSessions, shareListWindow } from "./creative-library-share-list"

export function CreativeLibraryActions(props: {
  itemId: string
  reaction: CreativeLibraryReaction | undefined
  sessions: SessionSummary[]
  shareText: string
  onReaction: (reaction: "liked" | "saved", value: boolean) => Promise<boolean>
  onShare: (sessionId: string, prompt: string) => Promise<boolean>
}) {
  const [sharing, setSharing] = useState(false)
  const [optimistic, setOptimistic] = useState<Partial<Record<"liked" | "saved", boolean>>>({})
  const [pending, setPending] = useState<"liked" | "saved">()
  useEffect(() => setOptimistic({}), [props.reaction?.liked, props.reaction?.saved])
  const value = (reaction: "liked" | "saved") => optimistic[reaction] ?? props.reaction?.[reaction] ?? false
  const toggle = async (reaction: "liked" | "saved") => {
    const next = !value(reaction)
    setOptimistic((current) => ({ ...current, [reaction]: next }))
    setPending(reaction)
    if (!await props.onReaction(reaction, next)) setOptimistic((current) => ({ ...current, [reaction]: undefined }))
    setPending(undefined)
  }
  return <>
    <div className="wb-library-card-actions">
      <button className={value("liked") ? "is-active" : ""} type="button" aria-pressed={value("liked")} aria-busy={pending === "liked"} title={value("liked") ? "取消喜欢" : "喜欢"} disabled={Boolean(pending)} onClick={() => void toggle("liked")}><Heart size={15} fill={value("liked") ? "currentColor" : "none"} /></button>
      <button className={value("saved") ? "is-active" : ""} type="button" aria-pressed={value("saved")} aria-busy={pending === "saved"} title={value("saved") ? "取消收藏" : "收藏"} disabled={Boolean(pending)} onClick={() => void toggle("saved")}><Bookmark size={15} fill={value("saved") ? "currentColor" : "none"} /></button>
      <button type="button" title="发送到对话" onClick={() => setSharing(true)}><Share2 size={15} /></button>
    </div>
    {sharing && createPortal(<ShareDialog sessions={props.sessions} onClose={() => setSharing(false)} onShare={async (sessionId) => {
      const sent = await props.onShare(sessionId, props.shareText)
      if (sent) setSharing(false)
      return sent
    }} />, document.body)}
  </>
}

export function ShareDialog(props: { sessions: SessionSummary[]; title?: string; onClose: () => void; onShare: (sessionId: string) => Promise<boolean> }) {
  const [pending, setPending] = useState<string>()
  const [query, setQuery] = useState("")
  const [scrollTop, setScrollTop] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const sessions = useMemo(() => filterShareSessions(props.sessions, query), [props.sessions, query])
  const visible = shareListWindow(sessions.length, scrollTop, 420)
  return <DesktopDialog className="wb-library-share-dialog" backdropClassName="wb-library-share-backdrop" labelId="library-share-title" onClose={props.onClose}>
    <>
      <header><strong id="library-share-title">{props.title ?? "发送到对话"}</strong><button type="button" title="关闭" onClick={props.onClose}><X size={16} /></button></header>
      <div className="wb-library-share-content">
        <input data-dialog-initial-focus type="search" value={query} placeholder="搜索会话名称或项目路径" aria-label="搜索会话" onChange={(event) => { setQuery(event.target.value); setScrollTop(0); if (listRef.current) listRef.current.scrollTop = 0 }} />
        {sessions.length
          ? <div ref={listRef} className="wb-library-share-list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
            <div className="wb-library-share-spacer" style={{ height: visible.totalHeight }}>
              {sessions.slice(visible.start, visible.end).map((session, index) => <button className="wb-library-share-row" type="button" key={session.id} disabled={Boolean(pending)} style={{ height: creativeLibraryShareRowHeight, transform: `translateY(${visible.offset + index * creativeLibraryShareRowHeight}px)` }} onClick={() => {
                setPending(session.id)
                void props.onShare(session.id).finally(() => setPending(undefined))
              }}><span><strong>{session.title}</strong><small>{session.displayPath}</small></span><Send size={15} /></button>)}
            </div>
          </div>
          : <p>{props.sessions.length ? "没有匹配的会话。" : "还没有可用对话。请先在一个项目中创建会话。"}</p>}
      </div>
    </>
  </DesktopDialog>
}
