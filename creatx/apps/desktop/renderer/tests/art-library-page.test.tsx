import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ArtLibraryItemProjection, ArtLibrarySnapshot } from "@creatx/contracts"
import { ArtLibraryPageContent, ArtLibraryRefreshGate, createArtApprovalEdits } from "../src/ArtLibraryPage"

const currentItem: ArtLibraryItemProjection = {
  id: "art-current",
  state: "approval",
  title: "冷蓝水下对峙",
  artist: "未知",
  collectedAt: "2026-08-10T00:00:00.000Z",
  styleAnalysis: "冷蓝水体压低空间，象牙白角色与黑色甲壳形成冲突，粗重分格截断动作。",
  palette: ["#102A43", "#E7E1D1"],
  patternTags: ["粗重墨线", "平涂色块"],
  compositionTags: ["横向分格", "近景对峙"],
  moodTags: ["克制紧张"],
  curation: {
    status: "current",
    method: "visual-curation-v1",
    reversePrompt: {
      style: "opaque ink contours, flat cold-blue color fields",
      composition: "wide panel, two opposing subjects, compressed depth",
      scene: "an ivory figure faces a black armored creature underwater",
      negative: ["glossy 3D", "logo", "watermark"],
    },
  },
  suggestedLibrary: { title: "叙事插画", confidence: 0.86 },
  sourceKind: "project-file",
  sourceLabel: "参考图.png",
  projectRelativePath: "参考/参考图.png",
  imageUrl: "creatx-art-library://item/art-current/original",
  image: { mediaType: "image/png", bytes: 1200, width: 1600, height: 900, sha256: "a".repeat(64) },
}

const legacyItem: ArtLibraryItemProjection = {
  ...currentItem,
  id: "art-legacy",
  title: "旧整理作品",
  curation: { status: "legacy-unverified", promptDraft: "old template", negativeTags: ["watermark"] },
  imageUrl: "creatx-art-library://item/art-legacy/original",
}

const snapshot: ArtLibrarySnapshot = {
  revision: 12,
  incomingCount: 2,
  approvalItems: [currentItem, legacyItem],
  libraries: [{ title: "叙事插画", itemCount: 1, items: [{ ...currentItem, state: "approved", library: "叙事插画" }] }],
  refreshedAt: "2026-08-10T00:00:00.000Z",
}

const handlers = {
  onSelect: () => undefined,
  onRoute: () => undefined,
  onDraftChange: () => undefined,
  onReview: () => undefined,
  onRequestReject: () => undefined,
  onCancelReject: () => undefined,
  onExport: () => undefined,
  onOpenChat: () => undefined,
  onRetry: () => undefined,
}

test("renders honest loading, empty, and exact Runtime error states without an iframe", () => {
  const loading = renderToStaticMarkup(<ArtLibraryPageContent state={{ status: "loading" }} route="approval" {...handlers} />)
  const empty = renderToStaticMarkup(<ArtLibraryPageContent state={{ status: "ready", snapshot: { ...snapshot, approvalItems: [], libraries: [] } }} route="approval" {...handlers} />)
  const error = renderToStaticMarkup(<ArtLibraryPageContent state={{ status: "error", error: { code: "library_invalid", message: "审批作品不存在。", detail: "candidate art-404 does not exist" } }} route="approval" {...handlers} />)

  expect(loading).toContain("正在读取真实艺术库")
  expect(empty).toContain("暂无待审批作品")
  expect(error).toContain("审批作品不存在。")
  expect(error).toContain("candidate art-404 does not exist")
  expect(`${loading}${empty}${error}`).not.toContain("iframe")
})

test("renders approval and category lists from the Runtime snapshot", () => {
  const approvals = renderToStaticMarkup(<ArtLibraryPageContent state={{ status: "ready", snapshot }} route="approval" {...handlers} />)
  const libraries = renderToStaticMarkup(<ArtLibraryPageContent state={{ status: "ready", snapshot }} route="atlas" {...handlers} />)

  expect(approvals).toContain("冷蓝水下对峙")
  expect(approvals).toContain("旧整理作品")
  expect(approvals).toContain("待审批 2")
  expect(libraries).toContain("叙事插画")
  expect(libraries).toContain("导出关键词")
  expect(libraries).toContain("提取风格")
  expect(libraries).toContain("候选区 2")
})

test("renders every editable v2 approval field and disables repeated submission", () => {
  const html = renderToStaticMarkup(<ArtLibraryPageContent
    state={{ status: "ready", snapshot }}
    route="approval"
    selectedItemId="art-current"
    draft={createArtApprovalEdits(currentItem)}
    busyAction="approve"
    {...handlers}
  />)

  for (const label of ["标题", "分类", "作品解读", "色板", "形式语言标签", "构图标签", "情绪标签", "STYLE", "COMPOSITION", "SCENE", "NEGATIVE"]) expect(html).toContain(label)
  expect(html).toContain("当前视觉整理")
  expect(html).toContain("正在批准")
  expect(html).toContain("disabled")
  expect(html).toContain('src="creatx-art-library://item/art-current/original"')
})

test("marks legacy metadata as unverified instead of presenting it as a current reverse Prompt", () => {
  const html = renderToStaticMarkup(<ArtLibraryPageContent
    state={{ status: "ready", snapshot }}
    route="approval"
    selectedItemId="art-legacy"
    draft={createArtApprovalEdits(legacyItem)}
    {...handlers}
  />)

  expect(html).toContain("旧版整理，未经视觉复核")
  expect(html).toContain("需要重新看图整理后，才能编辑四层反推 Prompt")
  expect(html).not.toContain('name="reversePrompt.style"')
})

test("shows bounded reject confirmation and deterministic keyword export result", () => {
  const reject = renderToStaticMarkup(<ArtLibraryPageContent
    state={{ status: "ready", snapshot }}
    route="approval"
    selectedItemId="art-current"
    draft={createArtApprovalEdits(currentItem)}
    rejectPending
    {...handlers}
  />)
  const exported = renderToStaticMarkup(<ArtLibraryPageContent
    state={{ status: "ready", snapshot }}
    route="atlas"
    exportResult={{ library: "叙事插画", itemCount: 1, keywords: ["粗重墨线", "横向分格"], text: "粗重墨线, 横向分格" }}
    {...handlers}
  />)

  expect(reject).toContain('role="dialog"')
  expect(reject).toContain("只删除本机艺术库中的这条待审批内容")
  expect(exported).toContain("粗重墨线, 横向分格")
  expect(exported).toContain("零模型调用")
})

test("refresh gate reads once per new revision and accepts an already returned snapshot", () => {
  const gate = new ArtLibraryRefreshGate()

  expect(gate.shouldRead()).toBe(true)
  expect(gate.shouldRead()).toBe(false)
  gate.markApplied(12)
  expect(gate.shouldRead(12)).toBe(false)
  expect(gate.shouldRead(13)).toBe(true)
  expect(gate.shouldRead(13)).toBe(false)
  expect(gate.shouldRead(12)).toBe(false)
  expect(gate.shouldRead(14)).toBe(true)
})
