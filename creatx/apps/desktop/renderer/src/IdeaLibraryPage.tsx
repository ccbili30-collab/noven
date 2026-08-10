import { useMemo, useState } from "react"
import { ArrowLeft, Lightbulb, RefreshCw, Search, Upload, X } from "lucide-react"
import type { CreativeLibraryReaction, ImportedIdeaLibraryItem, SessionSummary } from "@creatx/contracts"
import { classifyIdeaSentence, filterIdeaLibrarySeeds, ideaLibraryCategories, localIdeaHeat, rankIdeasByLocalHeat } from "./idea-library-seeds"
import { VISIBLE_PRODUCT_NAME } from "../../src/product-brand"
import type { IdeaLibraryCategory } from "./idea-library-seeds"
import { CreativeLibraryActions } from "./CreativeLibraryActions"

const featuredIdeas = new Set(["idea-001", "idea-012", "idea-022"])

export function IdeaLibraryPage(props: {
  onClose: () => void
  imported: ImportedIdeaLibraryItem[]
  reactions: CreativeLibraryReaction[]
  sessions: SessionSummary[]
  onImport: () => Promise<boolean>
  onRefresh: () => Promise<boolean>
  onReaction: (itemId: string, reaction: "liked" | "saved", value: boolean) => Promise<boolean>
  onShare: (sessionId: string, prompt: string) => Promise<boolean>
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<IdeaLibraryCategory>("幻想")
  const [busy, setBusy] = useState<"import" | "refresh">()
  const ideas = useMemo(() => {
    const builtins = filterIdeaLibrarySeeds(query, category).map((idea) => ({
      ...idea,
      author: idea.sourceType === "user-conversation" ? "用户共创" : `${VISIBLE_PRODUCT_NAME}整理`,
      imported: false as const,
    }))
    const normalized = query.trim().toLocaleLowerCase("zh-CN")
    const imported = props.imported.filter((idea) => {
      if (classifyIdeaSentence(idea.sentence) !== category) return false
      return !normalized || idea.sentence.toLocaleLowerCase("zh-CN").includes(normalized) || idea.tags.some((tag) => tag.toLocaleLowerCase("zh-CN").includes(normalized))
    }).map((idea) => ({ ...idea, imported: true as const }))
    return rankIdeasByLocalHeat([...imported, ...builtins], props.reactions)
  }, [category, props.imported, props.reactions, query])

  const run = async (kind: "import" | "refresh", action: () => Promise<boolean>) => {
    setBusy(kind)
    await action()
    setBusy(undefined)
  }

  return <section className="wb-idea-library" data-onboarding="idea-library" aria-labelledby="idea-library-title">
    <header className="wb-idea-library-header">
      <div className="wb-idea-library-title">
        <button type="button" title="返回创作" aria-label="返回创作" onClick={props.onClose}><ArrowLeft size={17} /></button>
        <span><Lightbulb size={18} /><strong id="idea-library-title">灵感库</strong><small>本机收藏 · {ideas.length} 条</small></span>
      </div>
      <div className="wb-library-header-actions">
        <label className="wb-idea-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索点子" aria-label="搜索点子" />{query && <button type="button" title="清空搜索" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button>}</label>
        <button type="button" title="导入本机 JSON" disabled={Boolean(busy)} onClick={() => void run("import", props.onImport)}><Upload size={16} /></button>
        <button type="button" title="刷新本机点子" disabled={Boolean(busy)} onClick={() => void run("refresh", props.onRefresh)}><RefreshCw className={busy === "refresh" ? "spin" : ""} size={16} /></button>
      </div>
    </header>
    <nav className="wb-idea-filters" aria-label="点子题材">
      {ideaLibraryCategories.map((item) => <button
        type="button"
        key={item}
        className={category === item ? "is-active" : ""}
        aria-pressed={category === item}
        onClick={() => setCategory(item)}
      >{item}</button>)}
      <span aria-live="polite">本机热度排序 · {ideas.length} 条</span>
    </nav>
    <div className="wb-idea-library-scroll">
      {ideas.length > 0
        ? <div className="wb-idea-waterfall" aria-label="点子卡片">
            {ideas.map((idea, index) => {
              const sequence = Number.parseInt(idea.id.slice(-3), 10)
              const reaction = props.reactions.find((item) => item.kind === "idea" && item.itemId === idea.id)
              return <article
                className="wb-idea-card"
                key={idea.id}
                data-idea-id={idea.id}
                data-bubble-size={featuredIdeas.has(idea.id) ? "featured" : sequence % 4 === 0 ? "compact" : "regular"}
              >
                <div className="wb-idea-rank"><span>#{index + 1}</span><small>热度 {localIdeaHeat(reaction)}</small></div>
                <p>{idea.sentence}</p>
                <footer><span><strong>{idea.author}</strong><small>{idea.imported ? "本机导入" : idea.sourceType === "user-conversation" ? "共创灵感" : "公开素材整理"}</small></span><CreativeLibraryActions
                  itemId={idea.id}
                  reaction={reaction}
                  sessions={props.sessions}
                  shareText={`我想基于这个灵感继续创作：\n\n${idea.sentence}\n\n来源：灵感库 · ${idea.author}`}
                  onReaction={(reaction, value) => props.onReaction(idea.id, reaction, value)}
                  onShare={props.onShare}
                /></footer>
              </article>
            })}
          </div>
        : <div className="wb-idea-empty"><Search size={20} /><strong>没有找到对应点子</strong><button type="button" onClick={() => setQuery("")}>清空搜索</button></div>}
    </div>
  </section>
}
