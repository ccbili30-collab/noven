import { useState } from "react"
import type { ArtLibraryItemProjection, ArtLibrarySnapshot } from "@creatx/contracts"

const assetRoot = "./art-library/assets/art-atlas-thumbnails"

const collections = [
  {
    title: "巨构艺术",
    description: "建筑在雾里留下文明的回声。",
    images: [
      ["冰壁巨柱", "254ad53ada322d6c.webp"],
      ["雾塔阵列", "044c4933ceb511d9.webp"],
      ["高墙天际", "fc4ac7ecdaf5c0c9.webp"],
      ["夜幕降临", "9a044cbfa065a212.webp"],
      ["最后的希望", "61703872a168f492.webp"],
    ],
  },
  {
    title: "暖色风格",
    description: "光线穿过旧纸、木材与傍晚的尘埃。",
    images: [
      ["日落档案", "64bae88dca863002.webp"],
      ["暖墙", "133d89bf71888c8f.webp"],
      ["归途", "ac083812fd09915a.webp"],
      ["旧城灯火", "09f80202cf2d2059.webp"],
      ["金色走廊", "0d7ed9c686180a20.webp"],
    ],
  },
  {
    title: "纪念碑谷",
    description: "尺度、寂静与遥远地平线组成的诗。",
    images: [
      ["无名碑谷", "1e3bd39ecbf6bf57.webp"],
      ["孤独结构", "1ea6ccd429a67154.webp"],
      ["风蚀入口", "1f62883f02b655f6.webp"],
      ["静默之门", "34d6fcf9776667b8.webp"],
      ["荒原记忆", "36284b96e3d8ed90.webp"],
    ],
  },
] as const

export const onboardingArtLibrarySnapshot: ArtLibrarySnapshot = {
  revision: 1,
  incomingCount: 2,
  approvalItems: [makeItem("approval-1", "等待整理的北境地图", "254ad53ada322d6c.webp", "approval", "巨构艺术")],
  libraries: collections.map((collection, collectionIndex) => ({
    title: collection.title,
    itemCount: collection.images.length,
    items: collection.images.map(([title, image], imageIndex) => makeItem(`${collectionIndex}-${imageIndex}`, title, image, "approved", collection.title)),
  })),
  refreshedAt: "2026-08-10T00:00:00.000Z",
}

function makeItem(id: string, title: string, image: string, state: "approval" | "approved", library: string): ArtLibraryItemProjection {
  return {
    id: `onboarding-art-${id}`,
    state,
    title,
    artist: "艺术库 Fixture",
    collectedAt: "2026-08-10T00:00:00.000Z",
    styleAnalysis: "以尺度、空间与克制色彩形成稳定的视觉语言。",
    palette: ["#d9d4c8", "#637576", "#26383a"],
    patternTags: ["建筑体量", "雾化层次"],
    compositionTags: ["纵深", "留白"],
    moodTags: ["沉静", "辽阔"],
    curation: { status: "current", method: "visual-curation-v1", reversePrompt: { style: "quiet monumental architecture", composition: "deep spatial layers", scene: title, negative: ["logo", "watermark"] } },
    suggestedLibrary: { title: library, confidence: .92 },
    sourceKind: "seed",
    sourceLabel: "Onboarding Prototype Fixture",
    imageUrl: `${assetRoot}/${image}`,
    image: { mediaType: "image/webp", bytes: 1, width: 538, height: 960, sha256: id.padEnd(64, "0").slice(0, 64) },
    ...(state === "approved" ? { library } : {}),
  }
}

export function OnboardingArtLibraryPrototype({ snapshot }: { snapshot: ArtLibrarySnapshot }) {
  const [activeLibrary, setActiveLibrary] = useState(snapshot.libraries[0]?.title ?? "")
  const library = snapshot.libraries.find((item) => item.title === activeLibrary) ?? snapshot.libraries[0]
  if (!library) return undefined
  const collection = collections.find((item) => item.title === library.title) ?? collections[0]

  return <section className="onboarding-art-library-prototype" aria-label="艺术库视觉恢复原型">
    <aside className="onboarding-art-index">
      <header className="onboarding-art-library-heading">
        <small>THE PERSONAL ATLAS</small>
        <h2>艺术库</h2>
      </header>
      <div className="onboarding-art-rule" />
      <nav aria-label="艺术分类">{snapshot.libraries.map((item, index) => <button className={item.title === library.title ? "is-active" : ""} type="button" key={item.title} onClick={() => setActiveLibrary(item.title)}>
        <small>{String(index + 1).padStart(2, "0")}</small>
        <strong>{item.title}</strong>
        <span>{item.itemCount} WORKS</span>
      </button>)}</nav>
      <footer>
        <span>候选 {snapshot.incomingCount}</span>
        <span>待审批 {snapshot.approvalItems.length}</span>
        <p>作品、来源和人工审批仍由真实艺术库状态拥有。</p>
      </footer>
    </aside>

    <main className="onboarding-art-stage">
      <div className="onboarding-art-copy">
        <small>{String(snapshot.libraries.findIndex((item) => item.title === library.title) + 1).padStart(2, "0")}</small>
        <h1>{library.title}</h1>
        <p>{collection.description}</p>
        <strong>{library.itemCount} WORKS</strong>
        <div><button type="button" onClick={() => setActiveLibrary(snapshot.libraries[(snapshot.libraries.findIndex((item) => item.title === library.title) - 1 + snapshot.libraries.length) % snapshot.libraries.length]!.title)}>←</button><span>浏览收藏</span><button type="button" onClick={() => setActiveLibrary(snapshot.libraries[(snapshot.libraries.findIndex((item) => item.title === library.title) + 1) % snapshot.libraries.length]!.title)}>→</button></div>
      </div>

      <div className="onboarding-art-constellation" key={library.title}>{library.items.slice(0, 5).map((item, index) => <button type="button" data-slot={index} key={item.id} title={`查看 ${item.title}`}>
        <img src={item.imageUrl} alt={item.title} />
        <span><strong>{item.title}</strong><small>{item.patternTags.join(" · ")}</small></span>
      </button>)}</div>

      <div className="onboarding-art-actions"><button type="button">审批 {snapshot.approvalItems.length}</button><button type="button">策展对话</button></div>
      <small className="onboarding-art-hint">SCROLL / DRAG / INFINITE EXHIBITION</small>
    </main>
  </section>
}
