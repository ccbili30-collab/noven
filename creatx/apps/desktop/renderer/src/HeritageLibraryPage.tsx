import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, BookOpenText, ExternalLink, Eye, Globe2, Palette, RefreshCw, Search, Sparkles, Upload, UserRound, X } from "lucide-react"
import type { CreativeLibraryReaction, ImportedHeritageLibraryItem, SessionSummary } from "@creatx/contracts"
import { filterHeritageLibrarySeeds, heritageLibraryFilters, type HeritageLibraryCategory, type HeritageLibraryPlatform, type HeritageLibrarySeed } from "./heritage-library-seeds"
import { VISIBLE_PRODUCT_NAME } from "../../src/product-brand"
import { CreativeLibraryActions, ShareDialog } from "./CreativeLibraryActions"
import { heritageVideoSkillPrompt } from "./heritage-video-skill"

type HeritageLibraryItem = Omit<HeritageLibrarySeed, "category" | "platform" | "verifiedAt"> & { category: string; platform: string; verifiedAt?: string; imported?: boolean }

export function HeritageLibraryPage(props: {
  onClose: () => void
  imported: ImportedHeritageLibraryItem[]
  reactions: CreativeLibraryReaction[]
  sessions: SessionSummary[]
  onImport: () => Promise<boolean>
  onRefresh: () => Promise<boolean>
  onReaction: (itemId: string, reaction: "liked" | "saved", value: boolean) => Promise<boolean>
  onShare: (sessionId: string, prompt: string) => Promise<boolean>
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"全部" | HeritageLibraryCategory>("全部")
  const [platform, setPlatform] = useState<"全部" | HeritageLibraryPlatform>("全部")
  const [selected, setSelected] = useState<HeritageLibraryItem>()
  const [studySelection, setStudySelection] = useState<HeritageLibraryItem>()
  const [busy, setBusy] = useState<"import" | "refresh">()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)
  const filters = useMemo(() => heritageLibraryFilters(props.imported), [props.imported])
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN")
    const imported: HeritageLibraryItem[] = props.imported.filter((item) => {
      if (category !== "全部" && item.category !== category) return false
      if (platform !== "全部" && item.platform !== platform) return false
      return !normalized || [item.title, item.author, item.category, item.platform, item.skillDirection ?? ""].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized))
    }).map((item) => ({ ...item, coverUrl: item.coverUrl ?? "", analysisPreview: item.analysisPreview ?? "尚未分析。", skillDirection: item.skillDirection ?? "待分析", imported: true }))
    return [...imported, ...filterHeritageLibrarySeeds(query, category, platform).map((item) => ({ ...item, imported: false }))]
      .sort((left, right) => Number(Boolean(right.learningEvidence)) - Number(Boolean(left.learningEvidence)))
  }, [category, platform, props.imported, query])

  const run = async (kind: "import" | "refresh", action: () => Promise<boolean>) => {
    setBusy(kind)
    await action()
    setBusy(undefined)
  }

  const openDetail = (item: HeritageLibraryItem) => {
    scrollTop.current = scrollRef.current?.scrollTop ?? 0
    setSelected(item)
  }

  const closeDetail = () => {
    const id = selected?.id
    setSelected(undefined)
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollTop.current
      if (id) document.getElementById(`heritage-card-${id}`)?.focus()
    })
  }

  useEffect(() => {
    if (!selected) return
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      closeDetail()
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [selected])

  return <section className="wb-heritage-library" data-onboarding="heritage-library" aria-labelledby="heritage-library-title">
    <header className="wb-heritage-header">
      <div className="wb-heritage-heading">
        <button type="button" title={selected ? "返回传承库" : "返回创作"} aria-label={selected ? "返回传承库" : "返回创作"} onClick={selected ? closeDetail : props.onClose}><ArrowLeft size={17} /></button>
        <span><BookOpenText size={19} /><strong id="heritage-library-title">传承库</strong><small>创作方法与艺术欣赏 · 20 条</small></span>
      </div>
      {!selected && <div className="wb-library-header-actions">
        <label className="wb-heritage-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索视频、作者或方法" aria-label="搜索传承库" />{query && <button type="button" title="清空搜索" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button>}</label>
        <button type="button" title="导入本机 JSON" disabled={Boolean(busy)} onClick={() => void run("import", props.onImport)}><Upload size={16} /></button>
        <button type="button" title="刷新本机传承资料" disabled={Boolean(busy)} onClick={() => void run("refresh", props.onRefresh)}><RefreshCw className={busy === "refresh" ? "spin" : ""} size={16} /></button>
      </div>}
    </header>
    {selected
      ? <HeritageDetail item={selected} onGenerate={() => setStudySelection(selected)} />
      : <>
          <div className="wb-heritage-toolbar">
            <nav className="wb-heritage-platforms" aria-label="内容来源">
              {filters.platforms.map((item) => <button type="button" key={item} className={platform === item ? "is-active" : ""} aria-pressed={platform === item} onClick={() => setPlatform(item)}>{item}</button>)}
            </nav>
            <nav className="wb-heritage-categories" aria-label="内容类别">
              {filters.categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
            </nav>
            <span aria-live="polite">{items.length} 条</span>
          </div>
          <div className="wb-heritage-scroll" ref={scrollRef}>
            {items.length > 0
              ? <div className="wb-heritage-waterfall" aria-label="传承库内容">
                  {items.map((item) => <article id={`heritage-card-${item.id}`} className="wb-heritage-card" key={item.id} data-heritage-id={item.id} tabIndex={-1}>
                    <button className="wb-heritage-card-open" type="button" onClick={() => openDetail(item)}><HeritageCover item={item} /><span className="wb-heritage-card-body"><small>{item.category}{item.learningEvidence && <b>可学习</b>}</small><strong>{item.title}</strong><span>{item.author}</span><em>{item.skillDirection}</em></span></button>
                    <footer><span>{item.imported ? "本机导入" : item.platform}</span><CreativeLibraryActions
                      itemId={item.id}
                      reaction={props.reactions.find((reaction) => reaction.kind === "heritage" && reaction.itemId === item.id)}
                      sessions={props.sessions}
                      shareText={`我想参考这条传承资料继续创作：\n\n${item.title}\n作者：${item.author}\n来源：${item.sourceUrl}`}
                      onReaction={(reaction, value) => props.onReaction(item.id, reaction, value)}
                      onShare={props.onShare}
                    /></footer>
                  </article>)}
                </div>
              : <div className="wb-heritage-empty"><Search size={20} /><strong>没有找到对应内容</strong><button type="button" onClick={() => { setQuery(""); setCategory("全部"); setPlatform("全部") }}>查看全部</button></div>}
          </div>
        </>}
    {studySelection?.learningEvidence && createPortal(<ShareDialog
      title="选择学习会话"
      sessions={props.sessions}
      onClose={() => setStudySelection(undefined)}
      onShare={async (sessionId) => {
        const sent = await props.onShare(sessionId, heritageVideoSkillPrompt({ ...studySelection, learningEvidence: studySelection.learningEvidence! }))
        if (sent) setStudySelection(undefined)
        return sent
      }}
    />, document.body)}
  </section>
}

function HeritageDetail({ item, onGenerate }: { item: HeritageLibraryItem; onGenerate: () => void }) {
  return <div className="wb-heritage-detail">
    <div className="wb-heritage-detail-media">
      <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="在浏览器打开原始来源">
        <HeritageCover item={item} detail />
        <span className="wb-heritage-open-source"><ExternalLink size={17} />前往原始来源</span>
      </a>
      <p><b>{item.platform}</b><span>原始内容保留在来源网站，{VISIBLE_PRODUCT_NAME}不复制或冒充内容所有者。</span></p>
    </div>
    <article className="wb-heritage-detail-copy">
      <header><small>{item.category}</small><h2>{item.title}</h2><p>{item.author}</p></header>
      <section>
        <div><Sparkles size={16} /><h3>内容摘要</h3><span>来源已核验</span></div>
        <p>{item.analysisPreview}</p>
      </section>
      <section>
        <div><BookOpenText size={16} /><h3>可生成 Skill</h3><span>{item.learningEvidence ? "字幕已核验" : "缺少可读字幕"}</span></div>
        <strong>{item.skillDirection}</strong>
        <p>{item.learningEvidence ? `已核验 ${item.learningEvidence.cueCount} 条英文字幕。AI 会在普通对话中读取字幕、提炼方法，并在原生审批后安装 Skill；安装成功需重启诺文生效。` : "当前来源没有系统可读取的真实字幕。第一版不会根据标题或封面生成 Skill。"}</p>
        <button type="button" disabled={!item.learningEvidence} onClick={onGenerate}>{item.learningEvidence ? "学习并生成 Skill" : "暂无可读字幕"}</button>
      </section>
    </article>
  </div>
}

function HeritageCover({ item, detail = false }: { item: HeritageLibraryItem; detail?: boolean }) {
  return <span className={`wb-heritage-cover${detail ? " is-detail" : ""}`}>
    <span className="wb-heritage-cover-art" data-category={item.category} aria-hidden="true">
      <small>公开创作方法</small>
      <HeritageCoverIcon category={item.category} />
      <strong>{item.skillDirection}</strong>
      <em>预览封面</em>
    </span>
    {item.coverUrl && <img src={item.coverUrl} alt={detail ? `${item.title}封面` : ""} loading={detail ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}
    {!detail && <i data-platform={item.platform}>{item.platform === "哔哩哔哩" ? "BILI" : item.platform.slice(0, 6)}</i>}
    {!detail && item.learningEvidence && <b className="wb-heritage-learnable">可学习</b>}
  </span>
}

function HeritageCoverIcon({ category }: { category: string }) {
  if (category === "OC创作") return <UserRound size={32} strokeWidth={1.5} />
  if (category === "图画创作") return <Palette size={32} strokeWidth={1.5} />
  if (category === "世界观") return <Globe2 size={32} strokeWidth={1.5} />
  return <Eye size={32} strokeWidth={1.5} />
}
