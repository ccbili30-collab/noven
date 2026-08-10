import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)))
const port = process.env.CREATX_PREVIEW_PORT ?? "4179"
const url = `http://127.0.0.1:${port}/preview.html`
const evidenceDir = resolve(workspace, "..", "artifacts", "frontend-redesign", "web-preview")
const fixtureProjectName = "乱世烽烟：大胤风云"
const fixtureSessionName = "新会话"
const server = spawn(process.execPath, [resolve(workspace, "node_modules", "vite", "bin", "vite.js"), "--config", "vite.preview.config.ts", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
  cwd: workspace,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
})
const serverOutput: string[] = []
server.stdout?.on("data", (chunk) => serverOutput.push(String(chunk)))
server.stderr?.on("data", (chunk) => serverOutput.push(String(chunk)))

try {
  await waitForServer(url)
  await mkdir(evidenceDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const pageErrors: string[] = []
    const externalRequests: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    page.on("request", (request) => {
      const requestUrl = new URL(request.url())
      if (requestUrl.hostname !== "127.0.0.1") externalRequests.push(request.url())
    })
    await page.goto(`${url}?variant=chat-focus`)
    await page.locator(".workspace-shell").waitFor()

    const boundary = await page.evaluate(() => ({
      creatxApi: "creatx" in window,
      badge: document.querySelector(".web-preview-badge")?.textContent,
      brand: document.querySelector(".wb-brand")?.textContent,
      bird: document.querySelectorAll(".wb-brand img.wb-bird-mark").length,
      projectTree: document.querySelectorAll(".wb-project-tree").length,
      legacyProjectCard: document.querySelectorAll(".wb-project-switcher").length,
      separators: document.querySelectorAll('[role="separator"]').length,
    }))
    if (boundary.creatxApi || boundary.badge !== "Web Preview · 演示状态" || !boundary.brand?.includes("诺文") || boundary.bird !== 1 || boundary.projectTree !== 1 || boundary.legacyProjectCard !== 0 || boundary.separators !== 3) {
      throw new Error(`Web Preview boundary mismatch: ${JSON.stringify(boundary)}`)
    }

    const workspaceFixture = await page.evaluate(() => ({
      workbenchTitle: document.querySelector(".wb-workbench-switcher strong")?.textContent,
      workbenchFiles: document.querySelectorAll(".workbench-file-list .file-row").length,
      growthStatus: document.querySelector(".wb-growth-status")?.getAttribute("data-growth-status"),
      progress: document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
      emptyCanvas: document.querySelector(".wb-stage-empty")?.textContent,
      selectedFiles: document.querySelectorAll(".workbench-file-list .file-row.selected").length,
    }))
    if (workspaceFixture.workbenchTitle !== "世界工作台" || workspaceFixture.workbenchFiles !== 24 || workspaceFixture.growthStatus !== "active" || workspaceFixture.progress !== "128" || !workspaceFixture.emptyCanvas?.includes("从工作台目录中选择") || workspaceFixture.selectedFiles !== 0) {
      throw new Error(`Formal-like Preview fixture mismatch: ${JSON.stringify(workspaceFixture)}`)
    }
    const variantControls = page.getByLabel("Workbench 原型布局切换")
    if (await variantControls.getByRole("button").count() !== 5) throw new Error("Workbench Preview variants are incomplete")
    await page.setViewportSize({ width: 1672, height: 941 })
    await variantControls.getByRole("button", { name: /Workbench 界面/u }).click()
    await page.locator(".wb-document-page h1", { hasText: "第三章 逐鹿中原" }).waitFor()
    await page.waitForTimeout(350)
    const referenceVariant = await page.evaluate(() => ({
      variant: document.documentElement.dataset.previewVariant,
      mapColumn: getComputedStyle(document.querySelector(".wb-map-stage")!).gridColumn,
      chatColumn: getComputedStyle(document.querySelector(".wb-context-panel")!).gridColumn,
      treeColumn: getComputedStyle(document.querySelector(".wb-tree-panel")!).gridColumn,
      regions: [".wb-project-navigation", ".wb-tree-panel", ".wb-map-stage", ".wb-context-panel"].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect()
        return { x: Math.round(rect.x), width: Math.round(rect.width) }
      }),
    }))
    if (
      referenceVariant.variant !== "reference-studio"
      || referenceVariant.mapColumn !== "5"
      || referenceVariant.chatColumn !== "7"
      || referenceVariant.treeColumn !== "3"
      || referenceVariant.regions[0]!.width !== 52
      || referenceVariant.regions[1]!.width < 240
      || referenceVariant.regions[2]!.width < 690
      || referenceVariant.regions[3]!.width < 340
    ) {
      throw new Error(`Reference Studio Preview variant did not project: ${JSON.stringify(referenceVariant)}`)
    }
    const sessionSwitcher = page.locator(".preview-session-switcher")
    if (await sessionSwitcher.count() !== 1) throw new Error("Reference Studio must expose exactly one conversation switcher")
    await sessionSwitcher.locator(".preview-session-current").click()
    const sessionMenu = page.getByRole("menu", { name: "切换对话" })
    if (await sessionMenu.getByRole("menuitem").count() !== 3) throw new Error("Conversation switcher did not expose the Preview sessions")
    await sessionMenu.getByRole("menuitem", { name: "世界结构整理", exact: true }).click()
    if (!await sessionSwitcher.locator(".preview-session-current").getByText("世界结构整理", { exact: true }).isVisible()) throw new Error("Conversation switcher did not change the active conversation")
    if (!await page.locator(".wb-document-page h1", { hasText: "第三章 逐鹿中原" }).isVisible()) throw new Error("Changing conversations closed the active Workbench document")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-reference-studio-pass1.png"), fullPage: false })
    await page.screenshot({ path: resolve(evidenceDir, "creatx-dual-mode-workbench-final.png"), fullPage: false })
    await page.setViewportSize({ width: 1440, height: 900 })
    await variantControls.getByRole("button", { name: /Chat 界面/u }).click()
    const chatVariant = await page.evaluate(() => ({
      variant: document.documentElement.dataset.previewVariant,
      projectColumn: getComputedStyle(document.querySelector(".wb-project-navigation")!).gridColumn,
      chatColumn: getComputedStyle(document.querySelector(".wb-context-panel")!).gridColumn,
      treeDisplay: getComputedStyle(document.querySelector(".wb-tree-panel")!).display,
    }))
    if (chatVariant.variant !== "chat-studio" || chatVariant.projectColumn !== "1" || chatVariant.chatColumn !== "3" || chatVariant.treeDisplay !== "none") throw new Error(`Chat Studio Preview variant did not project: ${JSON.stringify(chatVariant)}`)
    if (!await page.locator(".wb-project-workbenches").getByRole("button", { name: "世界工作台", exact: true }).isVisible()) throw new Error("Chat Studio project tree did not replace conversations with workbenches")
    if (await page.locator(".wb-project-workbenches").getByRole("button", { name: fixtureSessionName, exact: true }).count()) throw new Error("Chat Studio still nests conversations under the project")
    if (!await sessionSwitcher.locator(".preview-session-current").getByText("世界结构整理", { exact: true }).isVisible()) throw new Error("Chat and Workbench did not retain the same active conversation")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-dual-mode-chat-final.png"), fullPage: false })
    await variantControls.getByRole("button", { name: /工作台核心/u }).click()
    const workbenchVariant = await page.evaluate(() => ({
      variant: document.documentElement.dataset.previewVariant,
      query: new URL(window.location.href).searchParams.get("variant"),
      mapColumn: getComputedStyle(document.querySelector(".wb-map-stage")!).gridColumn,
      chatColumn: getComputedStyle(document.querySelector(".wb-context-panel")!).gridColumn,
    }))
    if (workbenchVariant.variant !== "workbench-core" || workbenchVariant.query !== "workbench-core" || workbenchVariant.mapColumn !== "5" || workbenchVariant.chatColumn !== "7") {
      throw new Error(`Workbench Preview variant did not project: ${JSON.stringify(workbenchVariant)}`)
    }
    await variantControls.getByRole("button", { name: /Chat 对照/u }).click()
    if (await page.locator('html[data-preview-variant="chat-focus"]').count() !== 1) throw new Error("Workbench Preview did not return to Chat comparison")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-web-preview-initial.png"), fullPage: false })
    await page.getByTitle("暂停 Growth").click()
    if (await page.locator('.wb-growth-status[data-growth-status="paused"]').count() !== 1) throw new Error("Preview Growth did not pause")
    await page.getByTitle("继续 Growth").click()
    if (await page.locator('.wb-growth-status[data-growth-status="active"]').count() !== 1) throw new Error("Preview Growth did not resume")

    const compactActions = await page.evaluate(() => ({
      headingActions: document.querySelectorAll(".wb-project-group .wb-project-heading-actions button").length,
      legacyGlobalActions: document.querySelectorAll(".wb-global-actions").length,
      libraryButtons: Array.from(document.querySelectorAll<HTMLButtonElement>(".wb-library-actions button")).map((button) => ({ text: button.textContent, disabled: button.disabled })),
      pinnedHeading: document.querySelector(".wb-pinned-navigation .wb-project-group-heading")?.textContent,
    }))
    if (compactActions.headingActions !== 2 || compactActions.legacyGlobalActions !== 0 || compactActions.libraryButtons.map((button) => button.text).join("|") !== "艺术库|点子库|传承库" || compactActions.libraryButtons.some((button) => button.disabled) || compactActions.pinnedHeading !== "置顶") {
      throw new Error(`Compact navigation actions mismatch: ${JSON.stringify(compactActions)}`)
    }
    const navigationThemeBeforeArtLibrary = await page.locator(".wb-project-navigation").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element.querySelector(".wb-brand")!).color,
    }))
    const pageCountBeforeArtLibrary = page.context().pages().length
    await page.locator(".wb-library-actions").getByRole("button", { name: "艺术库", exact: true }).click()
    const artLibrary = page.locator(".wb-art-library")
    await artLibrary.waitFor()
    if (await artLibrary.locator(".wb-art-library-header").count() !== 0) throw new Error("Embedded Art Atlas still renders the removed header bar")
    if (await artLibrary.locator(".wb-art-library-back").count() !== 0) throw new Error("Embedded Art Atlas still renders the redundant floating return button")
    const navigationThemeInArtLibrary = await page.locator(".wb-project-navigation").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element.querySelector(".wb-brand")!).color,
    }))
    if (JSON.stringify(navigationThemeInArtLibrary) !== JSON.stringify(navigationThemeBeforeArtLibrary)) throw new Error(`Art Library changed the stable navigation theme: ${JSON.stringify({ navigationThemeBeforeArtLibrary, navigationThemeInArtLibrary })}`)
    const artFrame = page.locator(".wb-art-library-frame")
    await page.frameLocator(".wb-art-library-frame").locator("h1").waitFor()
    const atlasFrame = page.frameLocator(".wb-art-library-frame")
    const portalBeforeIntro = await atlasFrame.locator(".portal-switch").boundingBox()
    if (!portalBeforeIntro) throw new Error("Art Atlas portal switch has no cold-start layout box")
    if (await atlasFrame.locator("html.has-atlas-intro").count()) {
      await page.waitForTimeout(3_760)
      const portalDuringIntro = await atlasFrame.locator(".portal-switch").boundingBox()
      if (!portalDuringIntro || Math.abs(portalDuringIntro.x - portalBeforeIntro.x) > 1 || Math.abs(portalDuringIntro.y - portalBeforeIntro.y) > 11) throw new Error(`Art Atlas portal switch drifted outside its reveal motion: ${JSON.stringify({ portalBeforeIntro, portalDuringIntro })}`)
    }
    await page.waitForFunction(() => {
      const frame = document.querySelector<HTMLIFrameElement>(".wb-art-library-frame")
      const images = Array.from(frame?.contentDocument?.images ?? [])
      return images.length >= 8 && images.every((image) => image.complete && image.naturalWidth > 0)
    })
    await page.waitForFunction(() => {
      const frame = document.querySelector<HTMLIFrameElement>(".wb-art-library-frame")
      const orbit = (frame?.contentWindow as Window & { __artOrbit?: { getState: () => { animationRunning: boolean; imageScale: number; introProgress: number; renderedSlots: number; targetImageScale: number } } } | null)?.__artOrbit
      const state = orbit?.getState()
      return state?.introProgress === 1 && state.renderedSlots === 7 && state.animationRunning === false && Math.abs(state.imageScale - 1.256) < .005 && state.targetImageScale === 1.256
    })
    const atlasLanding = await artFrame.evaluate((element: HTMLIFrameElement) => ({
      title: element.contentDocument?.title,
      heading: element.contentDocument?.querySelector("h1")?.textContent?.trim(),
      images: element.contentDocument?.images.length,
      decoded: Array.from(element.contentDocument?.images ?? []).filter((image) => image.complete && image.naturalWidth > 0).length,
      path: element.contentWindow?.location.pathname,
      paper: element.contentDocument?.documentElement.style.getPropertyValue("--paper"),
      ink: element.contentDocument?.documentElement.style.getPropertyValue("--ink"),
      orbit: (element.contentWindow as Window & { __artOrbit?: { getState: () => unknown } } | null)?.__artOrbit?.getState(),
      chatDisabled: element.contentDocument?.querySelector<HTMLButtonElement>(".portal-switch > .chat-reveal")?.disabled,
    }))
    const portalAfterIntro = await atlasFrame.locator(".portal-switch").boundingBox()
    if (!portalAfterIntro || Math.abs(portalAfterIntro.x - portalBeforeIntro.x) > 1 || Math.abs(portalAfterIntro.y - portalBeforeIntro.y) > 11) throw new Error(`Art Atlas portal switch did not preserve its structural position: ${JSON.stringify({ portalBeforeIntro, portalAfterIntro })}`)
    if (page.context().pages().length !== pageCountBeforeArtLibrary || atlasLanding.path !== "/art-library/art-atlas.html" || atlasLanding.title !== "艺术馆 / 圆环展览" || atlasLanding.heading !== "CreatX" || !atlasLanding.images || atlasLanding.images < 8 || !atlasLanding.decoded || atlasLanding.decoded < 4 || atlasLanding.paper !== "#fbfaf6" || atlasLanding.ink !== "#2e2a22" || atlasLanding.chatDisabled !== false) throw new Error(`Embedded Art Atlas landing mismatch: ${JSON.stringify(atlasLanding)}`)
    await page.screenshot({ path: resolve(evidenceDir, "creatx-art-atlas-three-work-focus.png"), fullPage: false })
    const chatPreview = atlasFrame.locator(".portal-switch > .chat-reveal")
    const portalCenters = await atlasFrame.locator(".portal-switch").evaluate((portal) => {
      const left = portal.querySelector<HTMLElement>(".portal-link--left")!.getBoundingClientRect()
      const right = portal.querySelector<HTMLElement>(".portal-link--right")!.getBoundingClientRect()
      const chat = portal.querySelector<HTMLElement>(".chat-reveal")!.getBoundingClientRect()
      return { buttons: ((left.left + left.width / 2) + (right.left + right.width / 2)) / 2, chat: chat.left + chat.width / 2 }
    })
    if (Math.abs(portalCenters.buttons - portalCenters.chat) > .5) throw new Error(`Art Atlas Chat is not centered below the two portal actions: ${JSON.stringify(portalCenters)}`)
    await chatPreview.hover({ force: true })
    await page.waitForTimeout(560)
    const chatHover = await chatPreview.evaluate((element) => ({ color: getComputedStyle(element).color, shadow: getComputedStyle(element).textShadow }))
    if (chatHover.color !== "rgb(176, 141, 62)" || chatHover.shadow === "none") throw new Error(`Art Atlas Chat hover treatment mismatch: ${JSON.stringify(chatHover)}`)
    await atlasFrame.locator("h1").hover({ force: true })
    await atlasFrame.getByRole("link", { name: "进入审批" }).click()
    await atlasFrame.locator(".approval-stage").waitFor()
    const approvalProjection = await artFrame.evaluate(async (element: HTMLIFrameElement) => {
      const frameWindow = element.contentWindow as Window & { ART_CONCEPT_DATA?: { approvalItems?: Array<{ cover_href: string }> } }
      const items = frameWindow.ART_CONCEPT_DATA?.approvalItems ?? []
      const decoded = await Promise.all(items.map((item) => new Promise<boolean>((resolveImage) => {
        const image = element.contentDocument!.createElement("img")
        image.onload = () => resolveImage(image.naturalWidth > 0)
        image.onerror = () => resolveImage(false)
        image.src = new URL(item.cover_href, frameWindow.location.href).href
      })))
      return {
        itemCount: items.length,
        decoded: decoded.filter(Boolean).length,
        returnDirection: element.contentDocument?.querySelector(".approval-return")?.getAttribute("data-route-mist"),
      }
    })
    if (approvalProjection.itemCount !== 6 || approvalProjection.decoded !== 6 || approvalProjection.returnDirection !== "ltr") throw new Error(`Embedded Art Atlas approval mismatch: ${JSON.stringify(approvalProjection)}`)
    await atlasFrame.getByRole("link", { name: "返回主展览" }).click()
    await atlasFrame.locator("h1").waitFor()
    await atlasFrame.getByRole("link", { name: /展览/u }).click()
    await atlasFrame.locator(".library-list").waitFor()
    const atlasLibrary = await artFrame.evaluate((element: HTMLIFrameElement) => ({
      title: element.contentDocument?.title,
      items: (element.contentWindow as Window & { ART_CONCEPT_DATA?: { orbitItems?: unknown[] } } | null)?.ART_CONCEPT_DATA?.orbitItems?.length,
      groups: element.contentDocument?.querySelectorAll(".library-list button").length,
      cards: element.contentDocument?.querySelectorAll(".library-orbit__card").length,
    }))
    if (atlasLibrary.title !== "艺术馆 / 艺术库目录" || atlasLibrary.items !== 57 || atlasLibrary.groups !== 3 || !atlasLibrary.cards || atlasLibrary.cards < 6) throw new Error(`Embedded Art Atlas library mismatch: ${JSON.stringify(atlasLibrary)}`)
    // Art Atlas uses a 1.02s native View Transition whose snapshot layer is not exposed through DOM styles.
    await page.waitForTimeout(1_100)
    await page.screenshot({ path: resolve(evidenceDir, "creatx-art-library-embedded.png"), fullPage: false })
    await page.locator(".wb-library-actions").getByRole("button", { name: "灵感库", exact: true }).click()
    await artLibrary.waitFor({ state: "detached" })
    const ideaLibrary = page.locator(".wb-idea-library")
    await ideaLibrary.waitFor()
    if (
      await ideaLibrary.locator(".wb-idea-card").count() !== 50
      || await ideaLibrary.locator(".wb-idea-card > footer").count() !== 50
      || await ideaLibrary.locator(".wb-idea-card .wb-library-card-actions button").count() !== 150
      || await ideaLibrary.getByTitle("喜欢", { exact: true }).count() !== 50
      || await ideaLibrary.getByTitle("收藏", { exact: true }).count() !== 50
      || await ideaLibrary.getByTitle("发送到对话", { exact: true }).count() !== 50
      || await ideaLibrary.locator(".wb-idea-rank").count() !== 50
    ) throw new Error("Fantasy library did not render 50 attributed, locally ranked cards with actions")
    if (await ideaLibrary.locator(".wb-idea-card").first().locator(":scope > p").count() !== 1 || await ideaLibrary.getByText("https://", { exact: false }).count()) throw new Error("Idea card face exposed metadata or invalid structure")
    const bubbleProjection = await ideaLibrary.locator(".wb-idea-card").evaluateAll((cards) => ({
      complete: cards.every((card) => card.getAttribute("data-bubble-size")),
      backgrounds: new Set(cards.map((card) => getComputedStyle(card).backgroundColor)).size,
      featured: cards.filter((card) => card.getAttribute("data-bubble-size") === "featured").length,
      tails: cards.every((card) => getComputedStyle(card, "::after").content === '""'),
      tailsOnRight: cards.every((card) => getComputedStyle(card, "::after").right === "-7px" && getComputedStyle(card, "::after").transform.startsWith("matrix(-1")),
      widths: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().width))).size,
    }))
    if (!bubbleProjection.complete || bubbleProjection.backgrounds !== 1 || bubbleProjection.featured !== 3 || !bubbleProjection.tails || !bubbleProjection.tailsOnRight || bubbleProjection.widths < 3) throw new Error(`Idea message-bubble projection mismatch: ${JSON.stringify(bubbleProjection)}`)
    await ideaLibrary.getByRole("button", { name: "启发", exact: true }).click()
    if (await ideaLibrary.locator(".wb-idea-card").count() !== 50) throw new Error("Inspiration library did not contain 50 question seeds")
    await ideaLibrary.getByRole("textbox", { name: "搜索点子" }).fill("全人类")
    if (await ideaLibrary.locator(".wb-idea-card").count() !== 1 || !await ideaLibrary.getByText("同时听到一句话", { exact: false }).isVisible()) throw new Error("Inspiration search did not match hidden tags and preserve the full question")
    await ideaLibrary.getByTitle("清空搜索").click()
    await ideaLibrary.getByRole("button", { name: "幻想", exact: true }).click()
    if (await ideaLibrary.locator(".wb-idea-card").count() !== 50) throw new Error("Fantasy library did not restore 50 statement seeds")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-idea-library-waterfall.png"), fullPage: false })
    await ideaLibrary.getByTitle("返回创作").click()
    await ideaLibrary.waitFor({ state: "detached" })
    if (!await page.locator(".wb-context-panel").isVisible() || !await page.locator(".wb-project-tree").isVisible()) throw new Error("Idea library return did not restore the workspace")
    await page.getByTitle("收起项目导航").click()
    await page.locator(".wb-project-rail").getByTitle("打开点子库").click()
    await ideaLibrary.waitFor()
    if (await ideaLibrary.locator(".wb-idea-card").count() !== 50) throw new Error("Collapsed navigation did not open the same idea library")
    await page.setViewportSize({ width: 900, height: 700 })
    const narrowIdeaLayout = await ideaLibrary.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollOwners: Array.from(element.querySelectorAll(".wb-idea-library-scroll")).filter((node) => getComputedStyle(node).overflowY === "auto").length,
      columns: new Set(Array.from(element.querySelectorAll(".wb-idea-card")).map((card) => Math.round(card.getBoundingClientRect().x))).size,
    }))
    if (narrowIdeaLayout.scrollWidth !== narrowIdeaLayout.clientWidth || narrowIdeaLayout.scrollOwners !== 1 || narrowIdeaLayout.columns < 2) throw new Error(`Narrow idea library layout mismatch: ${JSON.stringify(narrowIdeaLayout)}`)
    await ideaLibrary.getByTitle("返回创作").click()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByTitle("展开项目导航").click()
    await page.getByTitle("设置", { exact: true }).click()
    const settingsPage = page.locator(".wb-settings-page")
    await settingsPage.waitFor()
    if (!await settingsPage.getByRole("heading", { name: "模型", exact: true }).isVisible() || await page.locator(".dialog-backdrop").count()) throw new Error("Settings did not open as a full workspace page")
    await settingsPage.getByRole("button", { name: "生图", exact: true }).click()
    if (!await settingsPage.getByRole("heading", { name: "生图", exact: true }).isVisible() || !await settingsPage.getByText("仅供交流模型调用图片工具", { exact: false }).count()) throw new Error("Image settings section did not render")
    await settingsPage.getByRole("button", { name: "模型", exact: true }).click()
    await page.screenshot({ path: resolve(evidenceDir, "creatx-settings-page.png") })
    await page.getByTitle("关闭设置").click()
    await settingsPage.waitFor({ state: "detached" })
    await page.getByTitle("展开工作台").click()
    const inspector = page.locator(".wb-floating-inspector")
    const inspectorBefore = await inspector.boundingBox()
    if (!inspectorBefore) throw new Error("Floating inspector is not visible")
    const inspectorHandle = page.locator(".wb-inspector-drag-handle")
    await inspectorHandle.hover()
    await page.mouse.down()
    await page.mouse.move(inspectorBefore.x - 70, inspectorBefore.y + 70)
    await page.mouse.up()
    const inspectorAfter = await inspector.boundingBox()
    if (!inspectorAfter || inspectorAfter.x === inspectorBefore.x && inspectorAfter.y === inspectorBefore.y) throw new Error("Floating inspector did not move")
    await page.getByTitle("收起检查器").click()
    if (!await inspector.evaluate((element) => element.classList.contains("is-collapsed")) || await inspector.locator(".wb-inspector-scroll").count()) throw new Error("Floating inspector did not collapse")
    await page.getByTitle("展开检查器").click()
    await inspector.locator(".wb-inspector-scroll").waitFor()
    const pinnedToggle = page.locator(".wb-pinned-navigation > .wb-section-toggle")
    await pinnedToggle.click()
    if (await page.locator(".wb-pinned-list").count()) throw new Error("Pinned section did not collapse")
    await pinnedToggle.click()
    const projectsToggle = page.locator(".wb-project-group-toggle")
    await projectsToggle.click()
    if (await page.locator(".wb-project-list").count()) throw new Error("Project section did not collapse")
    await projectsToggle.click()

    const projectHeadingBox = await page.locator(".wb-project-group > .wb-project-group-heading").boundingBox()
    const navigationBox = await page.locator(".wb-project-navigation").boundingBox()
    if (!projectHeadingBox || !navigationBox || projectHeadingBox.x - navigationBox.x > 32) throw new Error("Project heading is not left aligned")

    await page.locator(".wb-project-row").hover()
    const projectMenuButton = page.getByTitle(`${fixtureProjectName} 项目菜单`)
    if (!await projectMenuButton.isVisible() || !await page.getByTitle(`在 ${fixtureProjectName} 中新建会话`).isVisible()) throw new Error("Project hover actions are incomplete")
    await projectMenuButton.click()
    for (const item of ["置顶项目", "在资源管理器中打开", "编辑项目名称", "删除聊天", "从列表移除"]) {
      if (!await page.getByRole("menuitem", { name: item, exact: true }).isVisible()) throw new Error(`Project menu is missing ${item}`)
    }
    await page.screenshot({ path: resolve(evidenceDir, "creatx-project-actions.png") })
    await page.getByRole("menuitem", { name: "置顶项目", exact: true }).click()
    const storedPreferences = await page.evaluate(() => window.localStorage.getItem("creatx.workspace.navigation-preferences.v1"))
    if (!storedPreferences?.includes("preview-project")) throw new Error("Project pin did not persist as a Renderer preference")

    await page.locator(".wb-project-row").hover()
    await projectMenuButton.click()
    await page.getByRole("menuitem", { name: "删除聊天", exact: true }).click()
    const projectDeleteDialog = page.getByRole("alertdialog")
    await projectDeleteDialog.waitFor()
    if (!await projectDeleteDialog.getByText("永久删除", { exact: false }).count()) throw new Error("Project chat deletion is not presented as permanent")
    await projectDeleteDialog.getByRole("button", { name: "取消", exact: true }).click()

    const fixtureSessionRow = page.locator(".wb-session-row").filter({ has: page.getByRole("button", { name: fixtureSessionName, exact: true }) })
    await fixtureSessionRow.hover()
    if (!await fixtureSessionRow.getByTitle("置顶会话").isVisible() || !await fixtureSessionRow.getByTitle("删除会话").isVisible()) throw new Error("Session hover actions are incomplete")
    const sessionPreview = page.locator(".wb-session-preview")
    await sessionPreview.waitFor()
    if (!await sessionPreview.getByText(fixtureProjectName, { exact: true }).count()) throw new Error("Web Preview session hover did not preserve project ownership")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-global-navigation-hover.png") })
    await fixtureSessionRow.getByTitle("置顶会话").click()
    if (!await page.locator(".wb-pinned-list .wb-pinned-session-row").getByRole("button", { name: fixtureSessionName, exact: true }).isVisible()) throw new Error("Pinned session did not move into the pinned section")
    if (await page.locator(".wb-project-sessions").getByRole("button", { name: fixtureSessionName, exact: true }).count()) throw new Error("Pinned session remained duplicated under its project")
    await page.locator(".wb-pinned-session-row").hover()
    await page.getByTitle("取消置顶会话").click()
    if (!await page.locator(".wb-project-sessions").getByRole("button", { name: fixtureSessionName, exact: true }).isVisible()) throw new Error("Unpinned session did not return to its project")
    const sessionButton = page.locator(".wb-project-sessions").getByRole("button", { name: fixtureSessionName, exact: true })
    await sessionButton.dblclick()
    const renameInput = page.getByRole("textbox", { name: "会话名称" })
    await renameInput.fill("重命名测试")
    await renameInput.press("Enter")
    if (!await page.locator(".wb-project-sessions").getByRole("button", { name: "重命名测试", exact: true }).isVisible()) throw new Error("Double-click session rename did not commit")
    await page.locator(".wb-project-sessions").getByRole("button", { name: "重命名测试", exact: true }).dblclick()
    await page.getByRole("textbox", { name: "会话名称" }).fill(fixtureSessionName)
    await page.getByRole("textbox", { name: "会话名称" }).press("Enter")
    await page.getByTitle("选择会话权限").click()
    if (!await page.getByRole("menuitemradio", { name: "审批", exact: true }).isVisible() || !await page.getByRole("menuitemradio", { name: "自由", exact: true }).isVisible()) throw new Error("Permission selector did not open its choice menu")
    await page.getByRole("menuitemradio", { name: "审批", exact: true }).click()
    if (!await page.getByTitle("选择会话权限").getByText("审批", { exact: true }).count()) throw new Error("Permission selector did not switch to approval")
    await page.getByTitle("选择会话权限").click()
    await page.getByRole("menuitemradio", { name: "自由", exact: true }).click()

    const composer = page.locator(".composer textarea")
    await composer.fill("/")
    const slashMenu = page.getByRole("listbox", { name: "创作 Skill 命令" })
    await slashMenu.waitFor()
    if (
      await slashMenu.getByRole("option").count() !== 6
      || !await slashMenu.getByText("分阶段生产大型世界观与配图", { exact: true }).isVisible()
      || !await slashMenu.getByText("规划并生成可继续使用的世界地图", { exact: true }).isVisible()
      || !await slashMenu.getByText("把文本转成具有连续画风与分镜的漫画", { exact: true }).isVisible()
    ) throw new Error("Slash command menu is incomplete")
    await page.screenshot({ path: resolve(evidenceDir, "creatx-slash-command-menu.png") })
    await composer.press("ArrowDown")
    await composer.press("ArrowDown")
    await composer.press("Enter")
    if (await composer.inputValue() !== "/growth_world_pro ") throw new Error("Slash command keyboard selection did not insert the canonical command")
    await composer.fill("")

    await page.getByRole("button", { name: "世界总览.jpg", exact: true }).click()
    const map = page.locator('.wb-map-canvas img[alt="世界总览.jpg"]')
    await map.waitFor()
    if (!await map.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)) throw new Error("Web Preview map did not decode")
    await inspector.evaluate((element: HTMLElement) => { element.style.pointerEvents = "none" })
    await map.hover()
    await page.waitForTimeout(320)
    const mapTransform = await map.evaluate((image) => getComputedStyle(image).transform)
    if (mapTransform === "none" || mapTransform.includes("matrix(1, 0, 0, 1")) throw new Error(`Art library preview did not enlarge on hover: ${mapTransform}`)
    await page.getByTitle("在艺术库中查看").click()
    await artLibrary.waitFor()
    if (page.context().pages().length !== pageCountBeforeArtLibrary) throw new Error("Image preview opened a second tab instead of the embedded art library")
    await page.locator(".wb-project-sessions").getByRole("button", { name: fixtureSessionName, exact: true }).click()
    await artLibrary.waitFor({ state: "detached" })
    await page.getByRole("button", { name: "世界导览.md", exact: true }).click()
    await page.locator(".wb-document-page h1", { hasText: "世界导览" }).waitFor()

    await composer.fill("把边境城市再展开一些。")
    await page.getByTitle("发送", { exact: true }).click()
    const activeProcessing = page.locator(".wb-processing-disclosure.is-active").last()
    await activeProcessing.waitFor()
    if (!await activeProcessing.evaluate((element: HTMLDetailsElement) => element.open)) await activeProcessing.locator("summary").click()
    await activeProcessing.getByText("这是网页预览中的演示回复。", { exact: false }).waitFor()

    const separator = page.locator('[data-separator="conversation-workbench"]')
    const before = await page.locator(".worldbuilder-app").evaluate((shell) => shell.style.getPropertyValue("--wb-conversation-width"))
    const box = await separator.boundingBox()
    if (!box) throw new Error("Web Preview separator is not visible")
    const dragY = box.y + box.height - 24
    await page.mouse.move(box.x + box.width / 2, dragY)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 24, dragY)
    await page.mouse.up()
    await page.waitForFunction((previous) => document.querySelector<HTMLElement>(".worldbuilder-app")?.style.getPropertyValue("--wb-conversation-width") !== previous, before, { timeout: 1_000 }).catch(() => undefined)
    const after = await page.locator(".worldbuilder-app").evaluate((shell) => shell.style.getPropertyValue("--wb-conversation-width"))
    if (before === after) {
      const hit = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return { tag: element?.tagName, className: element?.className, separator: element?.getAttribute("data-separator"), disabled: element?.getAttribute("aria-disabled") }
      }, { x: box.x + box.width / 2, y: dragY })
      throw new Error(`Web Preview did not share production panel resizing: ${JSON.stringify({ before, after, box, hit })}`)
    }

    await page.screenshot({ path: resolve(evidenceDir, "creatx-web-preview.png") })
    if (pageErrors.length || externalRequests.length) throw new Error(`Web Preview emitted unexpected activity: ${JSON.stringify({ pageErrors, externalRequests })}`)
    console.log(JSON.stringify({ status: "WEB PREVIEW PASS", url, screenshot: resolve(evidenceDir, "creatx-web-preview.png") }))
  } finally {
    await browser.close()
  }
} finally {
  server.kill()
  await Promise.race([
    new Promise<void>((resolveExit) => server.once("exit", () => resolveExit())),
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ])
}

async function waitForServer(target: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Web Preview server exited before startup:\n${serverOutput.join("")}`)
    try {
      const response = await fetch(target)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Web Preview server did not start:\n${serverOutput.join("")}`)
}
