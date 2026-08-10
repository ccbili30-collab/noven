import { createHash } from "node:crypto"
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test"
import { ArtLibraryService } from "@creatx/art-library-runtime"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const electronExecutable = process.env.CREATX_TEST_ELECTRON_EXECUTABLE?.trim() || resolve(workspace, "node_modules", "electron", "dist", "electron.exe")
const userData = await mkdtemp(join(tmpdir(), "noven-art-library-data-"))
const projectRoot = await mkdtemp(join(tmpdir(), "noven-art-library-project-"))
const artRoot = join(userData, "creatx", "art-library")
const formalProfiles = ["creatx", "CreatX", "诺文"].map((name) => join(process.env.APPDATA ?? "", name, "creatx", "art-library"))
const formalBefore = await Promise.all(formalProfiles.map(snapshotTree))
const prepared = await prepareApprovals()
const launchedPids: number[] = []
const activeApps: ElectronApplication[] = []

try {
  const first = await launch()
  launchedPids.push(requirePid(first.app))
  const initial = await first.page.evaluate(() => window.creatx.readArtLibrary())
  if (!initial.ok) throw new Error(`Initial art snapshot failed: ${JSON.stringify(initial)}`)
  if (initial.value.approvalItems.length !== 3) throw new Error(`Prepared approvals are missing: ${JSON.stringify(initial.value.approvalItems.map((item) => item.id))}`)
  if (initial.value.incomingCount !== 63) throw new Error(`Bundled seed reset did not leave exactly 63 re-curation candidates: ${initial.value.incomingCount}`)
  const sourceKinds = initial.value.approvalItems.map((item) => item.sourceKind).sort()
  if (JSON.stringify(sourceKinds) !== JSON.stringify(["chat-attachment", "project-file", "web"])) throw new Error(`Source projections changed: ${JSON.stringify(sourceKinds)}`)

  await openApproval(first.page)
  await selectApproval(first.page, "待批作品 1")
  await first.page.getByLabel("标题").fill("实机修订作品")
  await first.page.getByLabel("分类").fill("实机验收分类")
  await first.page.getByLabel("作品解读").fill("冷灰建筑占据画面中央，橙色天空从背后勾出轮廓，低角度透视把垂直体量压向观看者。")
  await first.page.getByTitle("删除 #7b7668").click()
  await first.page.getByLabel("添加色板颜色").fill("#112233")
  await first.page.getByLabel("添加色板颜色").press("Enter")
  await first.page.getByTitle("删除 原始形式0").click()
  await addTag(first.page, "添加形式语言标签", "用户形式")
  await addTag(first.page, "添加构图标签", "用户构图")
  await first.page.getByTitle("删除 原始情绪0").click()
  await addTag(first.page, "添加情绪标签", "用户情绪")
  await first.page.getByLabel("STYLE").fill("matte architectural illustration, hard charcoal edges, cold gray masses, restrained orange backlight")
  await first.page.getByLabel("COMPOSITION").fill("low-angle vertical composition, central monolithic subject, compressed foreground, narrow sky margin")
  await first.page.getByLabel("SCENE").fill("a tiered observatory rises above a dry plain at dusk")
  await first.page.getByTitle("删除 logo").click()
  await addTag(first.page, "添加NEGATIVE", "错误文字")
  await first.page.getByRole("button", { name: "批准并归档" }).click()
  await first.page.getByText("已批准并移入正式分类。").waitFor({ timeout: 10_000 })

  await first.page.getByRole("button", { name: "返回列表" }).click()
  await selectApproval(first.page, "待批作品 2")
  await first.page.getByRole("button", { name: "暂缓" }).click()
  await first.page.getByText("已保留在待审批列表。").waitFor({ timeout: 10_000 })
  await first.page.getByLabel("标题").fill("")
  await first.page.getByRole("button", { name: "批准并归档" }).click()
  const invalid = first.page.locator(".wb-art-library-result.is-error")
  await invalid.waitFor({ timeout: 10_000 })
  if (!await invalid.getByText("你的选择和编辑草稿均已保留，可以修改后重试。").count()) throw new Error("Invalid approval did not preserve the visible draft")
  if (await first.page.getByLabel("标题").inputValue() !== "") throw new Error("Invalid approval replaced the user's draft")
  await first.page.getByRole("button", { name: "返回列表" }).click()
  await selectApproval(first.page, "待批作品 2")
  if (await first.page.getByLabel("标题").inputValue() !== "") throw new Error("Returning to an approval discarded the unsaved draft")

  await first.page.getByRole("button", { name: "返回列表" }).click()
  await selectApproval(first.page, "待批作品 3")
  await first.page.getByRole("button", { name: "拒绝" }).click()
  const rejectDialog = first.page.getByRole("dialog")
  await rejectDialog.waitFor()
  await rejectDialog.getByRole("button", { name: "确认拒绝" }).click()
  await first.page.getByText("已拒绝并删除待审批内容。").waitFor({ timeout: 10_000 })

  await first.page.locator(".wb-art-library-header").getByRole("button", { name: "分类" }).click()
  const category = first.page.locator(".wb-art-library-categories article").filter({ hasText: "实机验收分类" })
  await category.getByRole("button", { name: "导出关键词" }).click()
  const exportedText = await first.page.getByLabel("导出的关键词").inputValue()
  if (exportedText !== "用户形式, 原始构图0, 用户构图, 用户情绪") throw new Error(`Deterministic keyword export changed: ${exportedText}`)

  const afterActions = await first.page.evaluate(() => window.creatx.readArtLibrary())
  if (!afterActions.ok) throw new Error(`Post-action snapshot failed: ${JSON.stringify(afterActions)}`)
  assertPersistedSnapshot(afterActions.value)
  await close(first.app)

  const second = await launch()
  launchedPids.push(requirePid(second.app))
  const restarted = await second.page.evaluate(() => window.creatx.readArtLibrary())
  if (!restarted.ok) throw new Error(`Restarted art snapshot failed: ${JSON.stringify(restarted)}`)
  assertPersistedSnapshot(restarted.value)
  await second.page.locator(".wb-library-actions").getByText("艺术库", { exact: true }).click()
  await second.page.locator(".wb-art-library-list").waitFor({ timeout: 10_000 })
  await second.page.getByText("实机验收分类", { exact: true }).waitFor()

  const protocol = await second.page.evaluate(async (id) => {
    const loadImage = (source: string) => new Promise<boolean>((resolveLoad) => {
      const image = new Image()
      image.onload = () => resolveLoad(image.naturalWidth > 0 && image.naturalHeight > 0)
      image.onerror = () => resolveLoad(false)
      image.src = source
    })
    return {
      valid: await loadImage(`creatx-art-library://item/${id}/original`),
      metadata: await loadImage(`creatx-art-library://item/${id}/metadata.json`),
      query: await loadImage(`creatx-art-library://item/${id}/original?metadata=true`),
      traversal: await loadImage("creatx-art-library://item/..%2F..%2Fsecret/original"),
    }
  }, prepared.approvedId)
  if (!protocol.valid || protocol.metadata || protocol.query || protocol.traversal) throw new Error(`Constrained art protocol failed: ${JSON.stringify(protocol)}`)
  await close(second.app)

  const approvedOriginal = await findApprovedOriginal(prepared.approvedId)
  await writeFile(approvedOriginal, Buffer.concat([await readFile(approvedOriginal), Buffer.from([0])]))
  const third = await launch()
  launchedPids.push(requirePid(third.app))
  const tamperedLoaded = await third.page.evaluate(async (id) => new Promise<boolean>((resolveLoad) => {
    const image = new Image()
    image.onload = () => resolveLoad(true)
    image.onerror = () => resolveLoad(false)
    image.src = `creatx-art-library://item/${id}/original`
  }), prepared.approvedId)
  if (tamperedLoaded) throw new Error("Tampered art original was served")
  await close(third.app)

  const formalAfter = await Promise.all(formalProfiles.map(snapshotTree))
  if (JSON.stringify(formalAfter) !== JSON.stringify(formalBefore)) throw new Error(`Formal art-library Profile changed: ${JSON.stringify({ before: formalBefore, after: formalAfter })}`)
  await assertProcessesExited(launchedPids)

  console.log(JSON.stringify({
    status: "ART LIBRARY ELECTRON PASS",
    isolatedUserData: basename(userData),
    sourceKinds,
    seedCandidates: initial.value.incomingCount,
    approval: { approved: prepared.approvedId, held: prepared.heldId, rejected: prepared.rejectedId },
    exportedText,
    protocol,
    restart: "persisted",
    formalProfileBoundary: formalBefore,
    provider: "not called",
  }))
} finally {
  await Promise.allSettled(activeApps.map((app) => app.close()))
  await Promise.all([removeTemporary(projectRoot), removeTemporary(userData)])
}

async function prepareApprovals() {
  const service = new ArtLibraryService({ root: artRoot })
  await service.initialize()
  const glass = await readFile(join(workspace, "apps", "desktop", "renderer", "src", "assets", "creatx-glass-buildings.png"))
  const map = await readFile(join(workspace, "apps", "desktop", "renderer", "src", "assets", "worldbuilder-map.jpg"))
  const imported = await service.importImages({
    query: "Electron 艺术库验收",
    images: [
      { bytes: glass, source: { pageUrl: "creatx-chat://turn/0", imageUrl: "creatx-chat://turn/0", kind: "chat-attachment", displayName: "对话参考.png" } },
      { bytes: map, source: { pageUrl: "creatx-project://project/test/地图.jpg", imageUrl: "creatx-project://project/test/地图.jpg", kind: "project-file", displayName: "地图.jpg", projectRelativePath: "素材/地图.jpg" } },
      { bytes: Buffer.concat([map, Buffer.from([0])]), source: { pageUrl: "https://example.test/art", imageUrl: "https://example.test/art.jpg", kind: "web", displayName: "网页参考.jpg" } },
    ],
  })
  if (imported.collected !== 3) throw new Error(`Could not prepare three unique art candidates: ${JSON.stringify(imported)}`)
  const ids = imported.successes.map((success) => success.id)
  for (const [index, candidateId] of ids.entries()) {
    await service.submitApproval([{ candidateId, metadata: {
      title: `待批作品 ${index + 1}`,
      artist: "未知作者",
      styleAnalysis: `可见主体 ${index + 1} 位于中央，低饱和色块划分前后景，清晰边缘形成视觉重心。`,
      palette: ["#7b7668"],
      patternTags: [`原始形式${index}`],
      compositionTags: [`原始构图${index}`],
      moodTags: [`原始情绪${index}`],
      reversePrompt: { style: `matte graphic rendering ${index}`, composition: `central layered composition ${index}`, scene: `a geometric structure in an open landscape ${index}`, negative: ["logo"] },
      suggestedLibrary: { title: "待定分类", confidence: .8 },
    } }])
  }
  await writeFile(join(projectRoot, "地图.jpg"), map)
  return { approvedId: ids[0]!, heldId: ids[1]!, rejectedId: ids[2]! }
}

async function launch() {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [workspace, `--user-data-dir=${userData}`, "--force-device-scale-factor=1"],
    cwd: workspace,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      CREATX_DESKTOP_TEST: "1",
      CREATX_PROJECT_ROOT: projectRoot,
      DEEPSEEK_API_KEY: "art-library-electron-test-key",
    },
  })
  activeApps.push(app)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForSelector(".workspace-shell", { timeout: 30_000 })
  return { app, page }
}

async function openApproval(page: Page) {
  await page.locator(".wb-library-actions").getByText("艺术库", { exact: true }).click()
  await page.locator(".wb-art-library-list").waitFor({ timeout: 10_000 })
  await page.locator(".wb-art-library-header").getByRole("button", { name: /审批/ }).click()
}

async function selectApproval(page: Page, title: string) {
  await page.locator(".wb-art-library-card").filter({ hasText: title }).click()
  await page.getByLabel("标题").waitFor()
}

async function addTag(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value)
  await page.getByLabel(label).press("Enter")
}

function assertPersistedSnapshot(snapshot: Awaited<ReturnType<ArtLibraryService["projection"]>>) {
  const approved = snapshot.libraries.flatMap((library) => library.items).find((item) => item.id === prepared.approvedId)
  if (!approved || approved.title !== "实机修订作品" || approved.library !== "实机验收分类") throw new Error(`Approved edits were not persisted: ${JSON.stringify(approved)}`)
  if (approved.styleAnalysis !== "冷灰建筑占据画面中央，橙色天空从背后勾出轮廓，低角度透视把垂直体量压向观看者。") throw new Error("Interpretation edit was not persisted")
  if (JSON.stringify(approved.palette) !== JSON.stringify(["#112233"])) throw new Error(`Palette edit was not persisted: ${JSON.stringify(approved.palette)}`)
  if (JSON.stringify(approved.patternTags) !== JSON.stringify(["用户形式"]) || JSON.stringify(approved.compositionTags) !== JSON.stringify(["原始构图0", "用户构图"]) || JSON.stringify(approved.moodTags) !== JSON.stringify(["用户情绪"])) throw new Error("Three-group tag edits were not persisted")
  if (approved.curation.status !== "current" || approved.curation.reversePrompt.style !== "matte architectural illustration, hard charcoal edges, cold gray masses, restrained orange backlight" || JSON.stringify(approved.curation.reversePrompt.negative) !== JSON.stringify(["错误文字"])) throw new Error("Four-layer reverse Prompt edit was not persisted")
  if (!snapshot.approvalItems.some((item) => item.id === prepared.heldId)) throw new Error("Held approval disappeared")
  if (snapshot.approvalItems.some((item) => item.id === prepared.rejectedId) || snapshot.libraries.some((library) => library.items.some((item) => item.id === prepared.rejectedId))) throw new Error("Rejected approval still appears in projection")
}

async function findApprovedOriginal(id: string) {
  const libraries = join(artRoot, "libraries")
  for (const library of await readdir(libraries, { withFileTypes: true })) {
    if (!library.isDirectory()) continue
    const items = join(libraries, library.name, "items")
    for (const item of await readdir(items, { withFileTypes: true })) {
      if (!item.isDirectory()) continue
      const root = join(items, item.name)
      const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as { id?: string; image?: { fileName?: string } }
      if (metadata.id === id && metadata.image?.fileName) return join(root, metadata.image.fileName)
    }
  }
  throw new Error(`Approved original ${id} was not found`)
}

async function close(app: ElectronApplication) {
  await app.close()
  activeApps.splice(activeApps.indexOf(app), 1)
  await new Promise((resolveWait) => setTimeout(resolveWait, 250))
}

async function removeTemporary(root: string) {
  for (const delay of [0, 250, 750, 1_500]) {
    if (delay) await new Promise((resolveWait) => setTimeout(resolveWait, delay))
    try {
      await rm(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (delay === 1_500) throw error
    }
  }
}

function requirePid(app: ElectronApplication) {
  const pid = app.process().pid
  if (!pid) throw new Error("Electron Main PID is unavailable")
  return pid
}

async function assertProcessesExited(pids: number[]) {
  const alive = []
  for (const pid of pids) {
    try {
      process.kill(pid, 0)
      alive.push(pid)
    } catch {
      // The process no longer exists.
    }
  }
  if (alive.length) throw new Error(`Electron test processes remain: ${alive.join(", ")}`)
}

async function snapshotTree(root: string) {
  try {
    await access(root)
  } catch {
    return { root, state: "missing" as const }
  }
  const records: Array<{ path: string; bytes: number; modifiedAt: number; sha256: string }> = []
  const visit = async (directory: string, prefix = "") => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, "en-US"))) {
      const path = join(directory, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await visit(path, relativePath)
        continue
      }
      if (!entry.isFile()) continue
      const info = await stat(path)
      records.push({ path: relativePath, bytes: info.size, modifiedAt: info.mtimeMs, sha256: createHash("sha256").update(await readFile(path)).digest("hex") })
    }
  }
  await visit(root)
  return { root, state: "present" as const, digest: createHash("sha256").update(JSON.stringify(records)).digest("hex"), files: records.length }
}
