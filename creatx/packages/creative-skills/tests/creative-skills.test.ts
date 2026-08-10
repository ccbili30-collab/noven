import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  BUILTIN_CREATIVE_SKILLS_VERSION,
  CAUSALITY_SKILL_FILES,
  CAUSALITY_SKILL_NAME,
  CAUSALITY_SKILL_SOURCE,
  DRAW_MAP_SKILL_NAME,
  DRAW_MAP_SKILL_FILES,
  DRAW_MAP_SKILL_SOURCE,
  DRAW_COMIC_SKILL_NAME,
  DRAW_COMIC_SKILL_FILES,
  DRAW_COMIC_SKILL_SOURCE,
  CHARACTER_GALLERY_SKILL_NAME,
  CHARACTER_GALLERY_SKILL_FILES,
  CHARACTER_GALLERY_SKILL_SOURCE,
  GROWTH_SKILL_NAME,
  GROWTH_SKILL_SOURCE,
  GROWTH_WORLD_SKILL_NAME,
  GROWTH_WORLD_SKILL_SOURCE,
  GROWTH_WORLD_PRO_SKILL_NAME,
  GROWTH_WORLD_PRO_SKILL_SOURCE,
  GROWTH_WORLD_PRO_BLUEPRINT_RELATION_TYPES,
  GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS,
  GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS,
  GROWTH_WORLD_PRO_STAGE_COUNT,
  GROWTH_WORLD_PRO_STAGES,
  GROWTH_WORLD_PRO_WORLD_LAYERS,
  NOVEL_START_SKILL_NAME,
  NOVEL_START_SKILL_FILES,
  NOVEL_START_SKILL_SOURCE,
  QUEUEABLE_CREATIVE_SKILLS,
  OC_PRO_SKILL_SOURCE,
  STUDY_SKILL_NAME,
  STUDY_SKILL_SOURCE,
  WORKBENCH_CORE_GUIDANCE,
  installBuiltinCreativeSkills,
  parseGrowthCommand,
  parseGrowthWorldCommand,
  GROWTH_WORLD_STAGE_CARDS,
  advanceGrowthWorldStage,
  buildGrowthWorldHiddenContext,
  enterGrowthWorldMode,
  recordGrowthWorldReview,
  parseGrowthWorldProCommand,
  CREATIVE_SLASH_COMMANDS,
  isSlashCommandInput,
  resolveCreativeSlashCommand,
  growthGoalDisplayInstruction,
  growthWorldProStagePolicy,
  validateGrowthWorldProBlueprintArtifacts,
  validateGrowthWorldProReviewArtifacts,
  normalizeCreativeSkillSequence,
} from "../src"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("built-in Creative Skills", () => {
  test("registers only installed ordinary Skills for Composer sequencing", () => {
    expect(QUEUEABLE_CREATIVE_SKILLS.map((skill) => skill.name)).toEqual([
      DRAW_MAP_SKILL_NAME,
      CHARACTER_GALLERY_SKILL_NAME,
      NOVEL_START_SKILL_NAME,
      DRAW_COMIC_SKILL_NAME,
      STUDY_SKILL_NAME,
    ])
    expect(QUEUEABLE_CREATIVE_SKILLS.every((skill) => skill.title.trim() && skill.description.trim())).toBe(true)
    expect(QUEUEABLE_CREATIVE_SKILLS.some((skill) => skill.name === GROWTH_SKILL_NAME)).toBe(false)
  })

  test("normalizes a bounded ordered Skill sequence without removing deliberate repeats", () => {
    expect(normalizeCreativeSkillSequence([DRAW_MAP_SKILL_NAME, CHARACTER_GALLERY_SKILL_NAME, NOVEL_START_SKILL_NAME, DRAW_COMIC_SKILL_NAME])).toEqual([
      DRAW_MAP_SKILL_NAME,
      CHARACTER_GALLERY_SKILL_NAME,
      NOVEL_START_SKILL_NAME,
      DRAW_COMIC_SKILL_NAME,
    ])
    expect(normalizeCreativeSkillSequence([DRAW_MAP_SKILL_NAME, DRAW_COMIC_SKILL_NAME, DRAW_MAP_SKILL_NAME])).toEqual([
      DRAW_MAP_SKILL_NAME,
      DRAW_COMIC_SKILL_NAME,
      DRAW_MAP_SKILL_NAME,
    ])
    expect(normalizeCreativeSkillSequence(undefined)).toEqual([])
    expect(() => normalizeCreativeSkillSequence([GROWTH_SKILL_NAME])).toThrow("skill_sequence_invalid")
    expect(() => normalizeCreativeSkillSequence(["not-installed"])).toThrow("skill_sequence_invalid")
    expect(() => normalizeCreativeSkillSequence(Array.from({ length: 13 }, () => DRAW_MAP_SKILL_NAME))).toThrow("skill_sequence_invalid")
  })

  test("hides durable Growth route markers from the user-visible goal", () => {
    expect(growthGoalDisplayInstruction("Growth World Pro 专用目标：继续完成当前世界")).toBe("继续完成当前世界")
    expect(growthGoalDisplayInstruction("Growth World 专用目标：整理并扩展当前世界")).toBe("整理并扩展当前世界")
    expect(growthGoalDisplayInstruction("建立国家：洛恩王国")).toBe("建立国家：洛恩王国")
  })

  test("installs the novel Skill below CreatX application data with an explicit allowlist", async () => {
    const appData = await mkdtemp(join(tmpdir(), "CreatX 技能 "))
    roots.push(appData)

    const installed = await installBuiltinCreativeSkills(appData)
    const expectedRoot = join(appData, "creative-skills", BUILTIN_CREATIVE_SKILLS_VERSION)
    const skillFile = join(expectedRoot, NOVEL_START_SKILL_NAME, "SKILL.md")
    const growthSkillFile = join(expectedRoot, GROWTH_SKILL_NAME, "SKILL.md")
    const growthWorldSkillFile = join(expectedRoot, GROWTH_WORLD_SKILL_NAME, "SKILL.md")
    const growthWorldProSkillFile = join(expectedRoot, GROWTH_WORLD_PRO_SKILL_NAME, "SKILL.md")
    const studySkillFile = join(expectedRoot, STUDY_SKILL_NAME, "SKILL.md")
    const drawMapSkillFile = join(expectedRoot, DRAW_MAP_SKILL_NAME, "SKILL.md")
    const drawComicSkillFile = join(expectedRoot, DRAW_COMIC_SKILL_NAME, "SKILL.md")
    const characterGallerySkillFile = join(expectedRoot, CHARACTER_GALLERY_SKILL_NAME, "SKILL.md")
    const causalitySkillFile = join(expectedRoot, CAUSALITY_SKILL_NAME, "SKILL.md")

    expect(installed).toEqual({
      skillDirectories: [expectedRoot],
      skills: [NOVEL_START_SKILL_NAME, STUDY_SKILL_NAME, DRAW_MAP_SKILL_NAME, CHARACTER_GALLERY_SKILL_NAME, DRAW_COMIC_SKILL_NAME, CAUSALITY_SKILL_NAME],
      workerSkills: {
        "growth-stage": [GROWTH_SKILL_NAME],
        "growth-recovery": [GROWTH_SKILL_NAME],
        "world-blueprint": [GROWTH_SKILL_NAME, GROWTH_WORLD_SKILL_NAME, GROWTH_WORLD_PRO_SKILL_NAME],
        "world-research": [GROWTH_WORLD_PRO_SKILL_NAME],
        "world-writer": [GROWTH_WORLD_PRO_SKILL_NAME],
        "world-recovery": [GROWTH_WORLD_PRO_SKILL_NAME],
      },
    })
    expect(await readFile(skillFile, "utf8")).toBe(NOVEL_START_SKILL_SOURCE)
    expect(await readFile(growthSkillFile, "utf8")).toBe(GROWTH_SKILL_SOURCE)
    expect(await readFile(growthWorldSkillFile, "utf8")).toBe(GROWTH_WORLD_SKILL_SOURCE)
    expect(await readFile(growthWorldProSkillFile, "utf8")).toBe(GROWTH_WORLD_PRO_SKILL_SOURCE)
    expect(await readFile(studySkillFile, "utf8")).toBe(STUDY_SKILL_SOURCE)
    expect(await readFile(drawMapSkillFile, "utf8")).toBe(DRAW_MAP_SKILL_SOURCE)
    expect(await readFile(drawComicSkillFile, "utf8")).toBe(DRAW_COMIC_SKILL_SOURCE)
    expect(await readFile(characterGallerySkillFile, "utf8")).toBe(CHARACTER_GALLERY_SKILL_SOURCE)
    expect(await readFile(causalitySkillFile, "utf8")).toBe(CAUSALITY_SKILL_SOURCE)
    for (const [relativePath, base64] of Object.entries(NOVEL_START_SKILL_FILES)) expect(await readFile(join(expectedRoot, NOVEL_START_SKILL_NAME, ...relativePath.split("/")))).toEqual(Buffer.from(base64, "base64"))
    for (const [relativePath, base64] of Object.entries(DRAW_MAP_SKILL_FILES)) expect(await readFile(join(expectedRoot, DRAW_MAP_SKILL_NAME, ...relativePath.split("/")))).toEqual(Buffer.from(base64, "base64"))
    for (const [relativePath, base64] of Object.entries(DRAW_COMIC_SKILL_FILES)) expect(await readFile(join(expectedRoot, DRAW_COMIC_SKILL_NAME, ...relativePath.split("/")))).toEqual(Buffer.from(base64, "base64"))
    for (const [relativePath, base64] of Object.entries(CHARACTER_GALLERY_SKILL_FILES)) expect(await readFile(join(expectedRoot, CHARACTER_GALLERY_SKILL_NAME, ...relativePath.split("/")))).toEqual(Buffer.from(base64, "base64"))
    for (const [relativePath, base64] of Object.entries(CAUSALITY_SKILL_FILES)) expect(await readFile(join(expectedRoot, CAUSALITY_SKILL_NAME, ...relativePath.split("/")))).toEqual(Buffer.from(base64, "base64"))
    const transpiler = new Bun.Transpiler({ loader: "js" })
    for (const script of [
      join(expectedRoot, DRAW_MAP_SKILL_NAME, "scripts", "build-interactive-map.mjs"),
      join(expectedRoot, DRAW_MAP_SKILL_NAME, "assets", "viewer", "app.js"),
      join(expectedRoot, CHARACTER_GALLERY_SKILL_NAME, "scripts", "build-character-gallery.mjs"),
      join(expectedRoot, CHARACTER_GALLERY_SKILL_NAME, "assets", "viewer", "gallery.js"),
      join(expectedRoot, CHARACTER_GALLERY_SKILL_NAME, "assets", "viewer", "character.js"),
      join(expectedRoot, CAUSALITY_SKILL_NAME, "scripts", "build-causality.mjs"),
      join(expectedRoot, CAUSALITY_SKILL_NAME, "assets", "viewer", "app.js"),
    ]) expect(transpiler.scan(await readFile(script, "utf8"))).toBeDefined()
    expect(NOVEL_START_SKILL_SOURCE).toContain("Write two chapters by default")
    expect(NOVEL_START_SKILL_SOURCE).toContain("deadline")
    expect(NOVEL_START_SKILL_SOURCE).toContain("no existing world")
    expect(NOVEL_START_SKILL_SOURCE).toContain("register_workbench")
    expect(WORKBENCH_CORE_GUIDANCE).toContain(".creatx")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("the first tool action must load that Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("use rename_workbench")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("use set_workbench_visibility")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("autoIncludeNewFiles=true")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Only load the Growth Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Load the Novel Start Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Load the Draw Map Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Load the Character Gallery Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Load the Draw Comic Skill")
    expect(WORKBENCH_CORE_GUIDANCE).toContain("Load the Causality Skill")
  })

  test("keeps the packaged production skill files byte-exact", () => {
    expect(Object.keys(DRAW_MAP_SKILL_FILES).sort()).toEqual(["SKILL.md", "agents/openai.yaml", "assets/viewer/app.js", "assets/viewer/index.html", "assets/viewer/styles.css", "references/base-map-quality.md", "references/output-contract.md", "references/region-plan-contract.md", "scripts/build-interactive-map.mjs", "scripts/derive-region-mask.mjs"])
    expect(Object.keys(CHARACTER_GALLERY_SKILL_FILES).sort()).toEqual(["SKILL.md", "agents/openai.yaml", "assets/viewer/character.css", "assets/viewer/character.html", "assets/viewer/character.js", "assets/viewer/gallery.css", "assets/viewer/gallery.html", "assets/viewer/gallery.js", "references/manifest-contract.md", "scripts/build-character-gallery.mjs"])
    expect(Object.keys(NOVEL_START_SKILL_FILES).sort()).toEqual(["SKILL.md", "agents/openai.yaml", "references/story-engine.md"])
    expect(packagedSkillHashes(DRAW_COMIC_SKILL_FILES)).toEqual({
      "SKILL.md": "4D773D4A25629C1DCCF0BED71FA4F685FC09051479FCE7F51797F60829B7FF75",
      "agents/openai.yaml": "321D0BB88FED101084D386F381C13E4969A35B6AB661CAEC536B1229D537901C",
      "references/direction-contracts.md": "D920FBCC9C2F4F28D35686F1E3840D4C5DDACC7FE0B0DA200926AEC0C435987F",
      "references/gpt-image-2-workflow.md": "E65FE74C97474136C7AD8D809694495A9B70763B83EA0A42F464B360E0B16178",
      "references/quality-review.md": "E6F1327BE43AF85AAE1850DABA2D017BBFA09E61F0093219FC4D65E11D32D9EC",
    })
  })

  test("OC Pro deepens one existing world character for design production", () => {
    expect(OC_PRO_SKILL_SOURCE).toContain("只处理一个已经选定的世界角色")
    expect(OC_PRO_SKILL_SOURCE).toContain("快速档")
    expect(OC_PRO_SKILL_SOURCE).toContain("完整档")
    expect(OC_PRO_SKILL_SOURCE).toContain("制作档")
    expect(OC_PRO_SKILL_SOURCE).toContain("关系/index.json")
    expect(OC_PRO_SKILL_SOURCE).toContain("4 至 8 份")
    expect(OC_PRO_SKILL_SOURCE).toContain("design-manifest.json")
    expect(OC_PRO_SKILL_SOURCE).toContain("角色总卡.md")
    expect(OC_PRO_SKILL_SOURCE).toContain("人物圣经.md")
    expect(OC_PRO_SKILL_SOURCE).toContain("外在目标、内在需要、错误信念")
    expect(OC_PRO_SKILL_SOURCE).toContain("不可逆选择")
    expect(OC_PRO_SKILL_SOURCE).toContain("世界在角色身上留下的具体痕迹")
    expect(OC_PRO_SKILL_SOURCE).toContain("一句话角色印象")
    expect(OC_PRO_SKILL_SOURCE).toContain("正面、四分之三侧面、侧面、背面")
    expect(OC_PRO_SKILL_SOURCE).toContain("形状语言")
    expect(OC_PRO_SKILL_SOURCE).toContain("动作与姿态")
    expect(OC_PRO_SKILL_SOURCE).toContain("角色比例对照")
    expect(OC_PRO_SKILL_SOURCE).toContain("不得把来源中的生产分析语言直接复制进角色成品")
    expect(OC_PRO_SKILL_SOURCE).toContain("节点、接口、责任链")
    expect(OC_PRO_SKILL_SOURCE).toContain("功能模块、系统协调或结构闭环")
    expect(OC_PRO_SKILL_SOURCE).toContain("具体的人、行动、利益、选择与代价")
    expect(OC_PRO_SKILL_SOURCE).toContain("标准全身立绘")
    expect(OC_PRO_SKILL_SOURCE).toContain("表情设计页")
    expect(OC_PRO_SKILL_SOURCE).toContain("服装装备页")
    expect(OC_PRO_SKILL_SOURCE).toContain("先提交标准全身立绘")
    expect(OC_PRO_SKILL_SOURCE).toContain("不得并发提交互不关联的图片后声称后续设计图已经保持同一角色")
    expect(OC_PRO_SKILL_SOURCE).toContain("角色设定")
    expect(OC_PRO_SKILL_SOURCE).not.toContain("/oc_pro")
    expect(OC_PRO_SKILL_SOURCE).toContain("角色总卡、人物圣经、角色卡、关系文件、视觉制作规范")
  })

  test("Draw Map Skill preserves the native base image and complete rectangular ID mask", () => {
    expect(DRAW_MAP_SKILL_SOURCE).toContain("new native-resolution base PNG")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("scripts/derive-region-mask.mjs")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("image gradients")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("Retry at most three times")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("weak boundary alignment")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("compact draggable and closable floating card")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("register_workbench")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("Do not write `.creatx` metadata directly")
    expect(DRAW_MAP_SKILL_SOURCE).toContain("Cache only the currently selected region")
    expect(DRAW_MAP_SKILL_SOURCE).not.toContain("process.env")
    expect(DRAW_MAP_SKILL_SOURCE).not.toContain("CREATX_IMAGE_API_KEY")

    const quality = Buffer.from(DRAW_MAP_SKILL_FILES["references/base-map-quality.md"], "base64").toString("utf8")
    const plan = Buffer.from(DRAW_MAP_SKILL_FILES["references/region-plan-contract.md"], "base64").toString("utf8")
    const derive = Buffer.from(DRAW_MAP_SKILL_FILES["scripts/derive-region-mask.mjs"], "base64").toString("utf8")
    const viewer = Buffer.from(DRAW_MAP_SKILL_FILES["assets/viewer/app.js"], "base64").toString("utf8")
    expect(quality).toContain("12–35 visually distinct, closed, selectable territories")
    expect(quality).toContain("Mandatory visual review")
    expect(plan).toContain("minimumAlignmentRatio")
    expect(plan).toContain("Keep every seed at least five pixels from a visible boundary")
    expect(plan).toContain("one safe seed per part or basin")
    expect(derive).toContain("boundary_alignment_too_low")
    expect(derive).toContain("base_too_soft")
    expect(derive).toContain("regions_too_small")
    expect(viewer).toContain("let cachedRegionLayers")
    expect(viewer).not.toContain("const regionLayers = new Map()")
  })

  test("Character Gallery builds a diverse five-plus-one cast and registers one gallery workbench", () => {
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("Five notable figures")
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("One ordinary person")
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("Do not turn them into a secret heir")
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("six-part character bible")
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("register_workbench")
    expect(CHARACTER_GALLERY_SKILL_SOURCE).toContain("project's existing image queue")
  })

  test("Draw Comic Skill adapts accepted narrative into project-faithful panels and deterministic lettering", () => {
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Prefer a user-selected or accepted novel chapter")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Do not infer visual culture from the user's language")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Pass the story gate")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("protagonist and immediate goal")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("failure stakes")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Generate one image per approved panel by default")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("add dialogue, captions, and sound effects deterministically")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Use low-cost images only for disposable tests")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("hide lettering and verify the broad action remains understandable")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("mark the images unreviewed and stop")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("references/direction-contracts.md")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("references/gpt-image-2-workflow.md")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("references/quality-review.md")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("MUST PRESERVE")
    expect(DRAW_COMIC_SKILL_SOURCE).toContain("Never claim an image")

    const direction = Buffer.from(DRAW_COMIC_SKILL_FILES["references/direction-contracts.md"], "base64").toString("utf8")
    const workflow = Buffer.from(DRAW_COMIC_SKILL_FILES["references/gpt-image-2-workflow.md"], "base64").toString("utf8")
    const review = Buffer.from(DRAW_COMIC_SKILL_FILES["references/quality-review.md"], "base64").toString("utf8")
    expect(direction).toContain("Visual authority contract")
    expect(direction).toContain("A Western-fantasy project must not silently acquire Chinese historical buildings or clothing")
    expect(workflow).toContain("generate one panel image per approved panel by default")
    expect(workflow).toContain("Do not turn “separate lettering” into “silent comic.”")
    expect(workflow).toContain("Read the actual dimensions before composing or cropping")
    expect(review).toContain("Silent pass")
    expect(review).toContain("Cultural or period drift is a production failure")
    expect(review).toContain("File existence is not visual review")
  })

  test("Study Skill preserves sources and distills reusable creative methods", () => {
    expect(STUDY_SKILL_SOURCE).toContain("不要移动、重命名、覆盖或删除原始资料")
    expect(STUDY_SKILL_SOURCE).toContain("设定与组织方法")
    expect(STUDY_SKILL_SOURCE).toContain("文风")
    expect(STUDY_SKILL_SOURCE).toContain("视觉风格")
    expect(STUDY_SKILL_SOURCE).toContain("题材、色彩、光影、构图、媒介/笔触和装帧")
    expect(STUDY_SKILL_SOURCE).toContain("不得用题材或氛围相近代替画法相近")
    expect(STUDY_SKILL_SOURCE).toContain("禁止自动漂移成照片写实或电影概念图")
    expect(STUDY_SKILL_SOURCE).toContain("可直接复用的生图 Prompt")
    expect(STUDY_SKILL_SOURCE).toContain("代表性")
    expect(STUDY_SKILL_SOURCE).toContain("必须实际调用它读取图片")
    expect(STUDY_SKILL_SOURCE).toContain("只有 `read_files` 对具体图片返回明确错误后")
    expect(STUDY_SKILL_SOURCE).toContain("/study 学习当前项目里的资料和参考图片。")
    expect(STUDY_SKILL_SOURCE).toContain("不要求用户复述教程")
    expect(STUDY_SKILL_SOURCE).toContain("首轮 Study 最多创建或实质修改两份研究文件")
    expect(STUDY_SKILL_SOURCE).toContain("https://www.bing.com/search?format=rss&q=<URL编码后的查询词>")
    expect(STUDY_SKILL_SOURCE).toContain("RSS 中的标题、链接和摘要只用于发现候选来源")
    expect(STUDY_SKILL_SOURCE).toContain("分别调用 `fetch_web_content` 读取真实正文")
    expect(STUDY_SKILL_SOURCE).toContain("Wikipedia 可以作为基础入口")
    expect(STUDY_SKILL_SOURCE).toContain("不要反复请求同一个失败页面")
    expect(STUDY_SKILL_SOURCE).toContain("没有读取正文的搜索摘要不能列为已研究来源")
    expect(STUDY_SKILL_SOURCE).toContain("页面标题、URL 和一句用途")
    expect(STUDY_SKILL_SOURCE).toContain("研究/")
    expect(STUDY_SKILL_SOURCE).toContain("register_workbench")
    expect(STUDY_SKILL_SOURCE).toContain("<作品根>/研究/")
    expect(STUDY_SKILL_SOURCE).toContain("不能另建项目顶层研究产出根")
    expect(STUDY_SKILL_SOURCE).toContain("不单独注册研究目录")
    expect(STUDY_SKILL_SOURCE).not.toContain("向量数据库")
  })

  test("parses only an explicit Growth command and preserves its user instruction", () => {
    expect(parseGrowthCommand("帮我长期完成这部作品")).toBeUndefined()
    expect(parseGrowthCommand("请使用 /growth 帮我继续")).toBeUndefined()
    expect(parseGrowthCommand("/growthful 写完它")).toBeUndefined()
    expect(parseGrowthCommand("/living 天空")).toBeUndefined()
    expect(parseGrowthCommand("/Growth 写完它")).toBeUndefined()
    expect(parseGrowthCommand("/growth")).toEqual({ skillName: GROWTH_SKILL_NAME, instruction: "" })
    expect(parseGrowthCommand("/growth 写完 1-10 章")).toEqual({ skillName: GROWTH_SKILL_NAME, instruction: "写完 1-10 章" })
    expect(parseGrowthCommand("/growth\n先整理现有内容\n再持续完成目标")).toEqual({
      skillName: GROWTH_SKILL_NAME,
      instruction: "先整理现有内容\n再持续完成目标",
    })
  })

  test("Growth Skill defines dynamic work without fixed templates or automatic Living", () => {
    expect(GROWTH_SKILL_SOURCE).toContain("创作计划.md")
    expect(GROWTH_SKILL_SOURCE).toContain("滚动规划")
    expect(GROWTH_SKILL_SOURCE).toContain("report_growth_progress")
    expect(GROWTH_SKILL_SOURCE).toContain("必需图片")
    expect(GROWTH_SKILL_SOURCE).toContain("最多创建或实质修改两份内容文件")
    expect(GROWTH_SKILL_SOURCE).toContain("submit_image_generation")
    expect(GROWTH_SKILL_SOURCE).toContain("register_workbench")
    expect(GROWTH_SKILL_SOURCE).toContain("统一作品根目录")
    expect(GROWTH_SKILL_SOURCE).toContain("800 字以内")
    expect(GROWTH_SKILL_SOURCE).toContain("具体领域 Skill 决定")
    expect(GROWTH_SKILL_SOURCE).toContain("不要自行进入 Living")
    expect(GROWTH_SKILL_SOURCE).not.toContain("小说/大纲.md")
    expect(GROWTH_SKILL_SOURCE).not.toContain("世界 → 人物 → 小说")
  })

  test("parses only an explicit Growth World command and preserves a durable route marker", () => {
    expect(parseGrowthWorldCommand("创建一个中世纪世界")).toBeUndefined()
    expect(parseGrowthWorldCommand("请使用 /growth_world 创建世界")).toBeUndefined()
    expect(parseGrowthWorldCommand("/growth-world 创建世界")).toEqual({
      skillName: GROWTH_WORLD_SKILL_NAME,
      instruction: "创建世界",
      goalInstruction: "Growth World 专用目标：创建世界",
    })
    expect(parseGrowthWorldCommand("/growth_worldful 创建世界")).toBeUndefined()
    expect(parseGrowthWorldCommand("/Growth_world 创建世界")).toBeUndefined()
    expect(parseGrowthWorldCommand("/growth_world")).toEqual({
      skillName: GROWTH_WORLD_SKILL_NAME,
      instruction: "",
      goalInstruction: "",
    })
    expect(parseGrowthWorldCommand("/growth_world 创建一个中世纪世界")).toEqual({
      skillName: GROWTH_WORLD_SKILL_NAME,
      instruction: "创建一个中世纪世界",
      goalInstruction: "Growth World 专用目标：创建一个中世纪世界",
    })
    expect(parseGrowthWorldCommand("/growth_world\n整理并扩展当前世界\n生成配图")).toEqual({
      skillName: GROWTH_WORLD_SKILL_NAME,
      instruction: "整理并扩展当前世界\n生成配图",
      goalInstruction: "Growth World 专用目标：整理并扩展当前世界\n生成配图",
    })
  })

  test("Growth World Skill defines one world spine with original, canon, and fan-work truth routes", () => {
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("原创世界")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("原著整理")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("二创扩展")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("Study")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("本次新生成的研究、世界、人物、故事和图片都必须位于统一作品根之下")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("任何文件写入前先选择一个能代表持续作品的统一作品根")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("不能先在项目根写计划或研究")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("没有遗留在统一作品根之外")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("后续阶段默认读取研究文件")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("世界真相 → 下游推演")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("来源事实 → 结构化整理")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("不能因此只确认“某个术语存在”")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("单册简介或单一改编不能代替全系列")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("8 至 12 份高密度 Markdown 文件")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("若某一脊柱只有栏目名或术语清单")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("第一圈最多用两个有界阶段做网络研究")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("模型既有知识待核")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("不能为了逐项寻找理想来源无限搜索")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("表示已经形成可用的世界导航，不表示穷尽整部作品")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("次要人物支线、精确参数、逐章年表和全部改编差异进入后续扩展")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("不能因仍有可继续扩充的 U/P 项而无限保持")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("原作基线 + 分歧点 → 创作推演")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("通用世界脊柱")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("空间结构")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("运行系统")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("时间结构")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("行动者")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("当前局势")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("叙事入口")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("视觉体系")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("因果脊柱")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("世界导览.md")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("世界真相.md")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("世界骨架.md")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("最小完整世界")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("4 至 6 个有界阶段")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("6 至 8 份高密度 Markdown 文件")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("register_workbench")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("值得独立展示")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("submit_image_generation")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("report_growth_progress")
    expect(GROWTH_WORLD_SKILL_SOURCE).not.toContain("世界 → 人物 → 小说")
  })

  test("Growth World Skill includes the distilled fantasy worldbuilding progression", () => {
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("世界风格")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("底层架构")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("天文地理")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("自然阻隔")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("文明起点")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("语言和文字")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("货币与物价")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("传奇生物")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("等级制度")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("不是必须照抄的中古模板")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("为了填满栏目")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("会话状态与阶段复盘")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("创作记录/当前复盘.md")
    expect(GROWTH_WORLD_SKILL_SOURCE).toContain("第一条可见回复")
  })

  test("Growth World mode keeps a compact curriculum state and review loop", () => {
    expect(GROWTH_WORLD_STAGE_CARDS.length).toBe(9)
    const entered = enterGrowthWorldMode({ topic: "经典中古剑与魔法" })
    expect(entered.status).toBe("active")
    expect(entered.stage).toBe("world-style")
    expect(buildGrowthWorldHiddenContext(entered)).toContain("世界风格")
    const reviewed = recordGrowthWorldReview(entered, {
      stage: "world-style",
      confirmed: ["严肃但不绝望"],
      consequences: ["视觉保持克制"],
      openQuestions: ["魔法是否稀少"],
      nextDiscussion: "讨论魔法边界",
    })
    expect(reviewed.status).toBe("waiting-for-user")
    expect(reviewed.reviews).toHaveLength(1)
    expect(buildGrowthWorldHiddenContext(reviewed)).toContain("魔法是否稀少")
    const next = advanceGrowthWorldStage(reviewed)
    expect(next.stage).toBe("foundation")
    expect(next.status).toBe("active")
  })

  test("parses only an explicit Growth World Pro command and preserves a durable route marker", () => {
    expect(parseGrowthWorldProCommand("创建一个大型世界")).toBeUndefined()
    expect(parseGrowthWorldProCommand("请使用 /growth_world_pro 创建世界")).toBeUndefined()
    expect(parseGrowthWorldProCommand("/growth-world-pro 创建世界")).toEqual({
      skillName: GROWTH_WORLD_PRO_SKILL_NAME,
      instruction: "创建世界",
      goalInstruction: "Growth World Pro 专用目标：创建世界",
    })
    expect(parseGrowthWorldProCommand("/growth_world_prototype 创建世界")).toBeUndefined()
    expect(parseGrowthWorldProCommand("/Growth_world_pro 创建世界")).toBeUndefined()
    expect(parseGrowthWorldProCommand("/growth_world_pro")).toEqual({
      skillName: GROWTH_WORLD_PRO_SKILL_NAME,
      instruction: "",
      goalInstruction: "",
    })
    expect(parseGrowthWorldProCommand("/growth_world_pro 创建一个宏大完整的中世纪奇幻世界")).toEqual({
      skillName: GROWTH_WORLD_PRO_SKILL_NAME,
      instruction: "创建一个宏大完整的中世纪奇幻世界",
      goalInstruction: "Growth World Pro 专用目标：创建一个宏大完整的中世纪奇幻世界",
    })
    expect(parseGrowthWorldProCommand("/growth_world_pro\n整理当前资料\n建立大型世界档案")).toEqual({
      skillName: GROWTH_WORLD_PRO_SKILL_NAME,
      instruction: "整理当前资料\n建立大型世界档案",
      goalInstruction: "Growth World Pro 专用目标：整理当前资料\n建立大型世界档案",
    })
  })

  test("publishes one slash-command catalog and canonicalizes supported aliases", () => {
    expect(CREATIVE_SLASH_COMMANDS.map((item) => item.command)).toEqual([
      "/growth",
      "/growth_world",
      "/growth_world_pro",
      "/study",
      "/draw-map",
      "/draw-comic",
      "/causality",
    ])
    expect(resolveCreativeSlashCommand("/growth-world-pro 魔法禁书目录")).toEqual({
      definition: CREATIVE_SLASH_COMMANDS[2]!,
      instruction: "魔法禁书目录",
      canonicalMessage: "/growth_world_pro 魔法禁书目录",
    })
    expect(resolveCreativeSlashCommand("/growth_world_pro\n建立世界")).toEqual({
      definition: CREATIVE_SLASH_COMMANDS[2]!,
      instruction: "建立世界",
      canonicalMessage: "/growth_world_pro\n建立世界",
    })
    expect(resolveCreativeSlashCommand("/draw_comic 把第一章画成漫画")).toEqual({
      definition: CREATIVE_SLASH_COMMANDS[5]!,
      instruction: "把第一章画成漫画",
      canonicalMessage: "/draw-comic 把第一章画成漫画",
    })
    expect(resolveCreativeSlashCommand("/causality 灰冠诸境")).toEqual({
      definition: CREATIVE_SLASH_COMMANDS[6]!,
      instruction: "灰冠诸境",
      canonicalMessage: "/causality 灰冠诸境",
    })
    expect(resolveCreativeSlashCommand("/unknown 世界")).toBeUndefined()
    expect(resolveCreativeSlashCommand("普通消息")).toBeUndefined()
    expect(isSlashCommandInput("/unknown 世界")).toBe(true)
    expect(isSlashCommandInput("请使用 /growth")).toBe(false)
  })

  test("Growth World Pro defines one global blueprint run with one world workbench", () => {
    expect(GROWTH_SKILL_SOURCE).toContain("Growth World Pro 专用目标")
    expect(GROWTH_SKILL_SOURCE).toContain("creatx-growth-world-pro")
    expect(GROWTH_WORLD_PRO_WORLD_LAYERS).toHaveLength(12)
    for (const layer of GROWTH_WORLD_PRO_WORLD_LAYERS) expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain(layer)
    expect(GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS).toHaveLength(12)
    expect(GROWTH_WORLD_PRO_LAYER_MINIMUM_OBJECTS.reduce((total, count) => total + count, 0)).toBe(96)
    expect(GROWTH_WORLD_PRO_LAYER_TARGET_OBJECTS).toEqual({ minimum: 10, maximum: 14 })
    expect(GROWTH_WORLD_PRO_BLUEPRINT_RELATION_TYPES).toEqual(["causes"])
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("原著整理")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("二创扩展")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("四个可恢复产品阶段")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("唯一作品根工作台和十二份空层蓝图")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("不创建具体对象、不注册十二个工作台")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("十二层是一个整体设计图")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("同一个真实实体只登记一次")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("from 导致、塑造或限制了 to")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("不等于正文生成依据")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("居民能够观察、记录和争论的世界内部现象")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("当前版本不创建上帝视角真相文章")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("研究只形成短小写作简报")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("资料不足、未知细节、未覆盖建议项和普通语义缺口")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("Writer 可以更换主文类、混合备选文类")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("少量锁定事实之外为完整性与表现力自由创造")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("正文完成后，再执行轻量抽取")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("topicProfileKey")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("worldStyleProfile")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("genreKey 是候选写作建议")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("styleKey")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("legendary-chronicle")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("403、登录墙或反爬拒绝时换用其他域名")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("单层 80、全世界 720")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("不得在蓝图批次写正式正文")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("report_growth_progress")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("write_world_blueprint initialize")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("不手写蓝图 JSON")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("十二个蓝图 Worker")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("creatx-oc-pro")
  })

  test("Growth World Pro stage policy plans all twelve layers before prose", () => {
    expect(growthWorldProStagePolicy("完成普通长任务", 100)).toBeUndefined()
    expect(growthWorldProStagePolicy("Growth World 专用目标：创建小世界", 100)).toBeUndefined()
    expect(GROWTH_WORLD_PRO_STAGE_COUNT).toBe(4)
    expect(GROWTH_WORLD_PRO_STAGES).toHaveLength(4)
    expect(GROWTH_WORLD_PRO_STAGES[2]).toContain("审查")
    expect(GROWTH_WORLD_PRO_STAGES[2]).toContain("冻结")
    const first = growthWorldProStagePolicy("Growth World Pro 专用目标：创建大型世界", 0)
    expect(first?.stageInstruction).toContain("阶段一")
    expect(first?.stageKey).toBe("route-and-sources")
    expect(first?.stageInstruction).toContain("action=initialize")
    expect(first?.stageInstruction).toContain("outcome 必须为 continue")
    expect(first?.stageInstruction).toContain("不要等待用户确认")
    expect(first?.preventCompletion).toBeTrue()
    expect(first?.successfulReportOutcome).toBe("continue")
    expect(first?.workRootArtifactName).toBe("世界基准.md")
    expect(first?.requiredWorkbenchRoot).toBeTrue()
    expect(first?.maxIterations).toBe(16)
    const skeleton = growthWorldProStagePolicy("Growth World Pro 专用目标：创建大型世界", 1, "银冠诸境")
    expect(skeleton?.stageInstruction).toContain("阶段二")
    expect(skeleton?.stageKey).toBe("twelve-layer-skeleton")
    expect(skeleton?.stageInstruction).toContain("每层对象数均为 0")
    expect(skeleton?.stageInstruction).toContain("不得 append")
    expect(skeleton?.maxIterations).toBe(8)
    expect(skeleton?.successfulReportOutcome).toBe("continue")
    const second = growthWorldProStagePolicy("Growth World Pro 专用目标：创建大型世界", 2, "银冠诸境")
    expect(second?.stageInstruction).toContain("阶段三")
    expect(second?.stageInstruction).toContain("action=inspect")
    expect(second?.stageInstruction).toContain("禁止再次 initialize")
    expect(second?.stageInstruction).toContain("审查与冻结属于本阶段收尾")
    expect(second?.stageInstruction).toContain("Runtime 管理的内部证据")
    expect(second?.stageInstruction).not.toContain("世界蓝图/relations.json")
    expect(second?.executionMode).toBeUndefined()
    expect(second?.waitAfterContinueReason).toBeUndefined()
    expect(second?.successfulReportOutcome).toBe("continue")
    expect(second?.stageInstruction).toContain("自动进入蓝图确认步骤")
    expect(second?.stageInstruction).toContain("不得等待用户再次输入 Continue")
    expect(second?.stageKey).toBe("world-blueprint-create")
    const third = growthWorldProStagePolicy("Growth World Pro 专用目标：创建大型世界", 3, "银冠诸境")
    expect(third?.executionMode).toBeUndefined()
    expect(third?.stageKey).toBe("world-blueprint-confirm")
    expect(third?.workerProfile).toBe("world-blueprint")
    expect(third?.successfulReportOutcome).toBe("continue")
    expect(third?.trustedArtifactSource).toBe("world-blueprint")
    expect(third?.stageInstruction).toContain("银冠诸境/世界基准.md、银冠诸境/资料索引.md、银冠诸境/视觉设定/统一画风.md")
    expect(third?.stageInstruction).toContain("visualStyle")
    expect(third?.stageInstruction).not.toContain("世界蓝图/state.json")
    expect(third?.stageInstruction).toContain("蓝图确认 Run")
    expect(third?.stageInstruction).toContain("action=freeze")
    const fourth = growthWorldProStagePolicy("Growth World Pro 专用目标：创建大型世界", 4, "银冠诸境")
    expect(fourth?.executionMode).toBe("world-materialization")
    expect(fourth?.stageKey).toBe("free-materialization")
    const stillReviewing = growthWorldProStagePolicy("Growth World Pro 专用目标：继续审查", 4, "银冠诸境", "blueprint-review")
    expect(stillReviewing?.executionMode).toBeUndefined()
    expect(stillReviewing?.stageInstruction).toContain("蓝图确认 Run")
    const resumed = growthWorldProStagePolicy("Growth World Pro 专用目标：继续大型世界", 0, "银冠诸境", "materialization")
    expect(resumed?.executionMode).toBe("world-materialization")
    expect(resumed?.stageInstruction).not.toContain("action=initialize")
    const continuedDraft = growthWorldProStagePolicy("Growth World Pro 专用目标：继续草案", 0, "银冠诸境", "blueprint-create", "continue")
    expect(continuedDraft?.stageInstruction).toContain("先 inspect 已有权威状态")
    expect(continuedDraft?.stageInstruction).toContain("禁止再次 initialize")
    const reconciled = growthWorldProStagePolicy("Growth World Pro 专用目标：整理已有世界", 0, undefined, "blueprint-create", "reconcile")
    expect(reconciled?.stageInstruction).toContain("保留旧文件")
    expect(reconciled?.stageInstruction).toContain("选择不冲突的新作品根")
    const reconciledBlueprint = growthWorldProStagePolicy("Growth World Pro 专用目标：整理已有世界", 2, undefined, "blueprint-create", "reconcile")
    expect(reconciledBlueprint?.stageInstruction).toContain("existing、partial、conflicting 或 missing")
    expect(reconciledBlueprint?.stageInstruction).toContain("不得移动、重命名、删除或改写")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("文类与文风只提供建议")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("source / derived / created")
    expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("任何 criticalGap 都会阻止 Writer")
  })

  test("Growth World Pro blueprint gate requires the dedicated tool's frozen state", () => {
    expect(validateGrowthWorldProBlueprintArtifacts([])).toContain("state.json")
    const evidence = [{
      relativePath: "世界/世界蓝图/state.json",
      text: JSON.stringify({ schemaVersion: 2, root: "世界", worldName: "世界", route: "original", sources: [], direction: {}, ownerGoalId: "g", acceptedGoalVersion: 1, revision: 1, status: "draft", batches: [] }),
    }]
    expect(validateGrowthWorldProBlueprintArtifacts(evidence)).toContain("frozen")
  })

  test("restores authoritative built-in content on repeated installation", async () => {
    const appData = await mkdtemp(join(tmpdir(), "CreatX skill refresh "))
    roots.push(appData)
    const first = await installBuiltinCreativeSkills(appData)
    const skillFile = join(first.skillDirectories[0]!, NOVEL_START_SKILL_NAME, "SKILL.md")
    const growthSkillFile = join(first.skillDirectories[0]!, GROWTH_SKILL_NAME, "SKILL.md")
    const growthWorldSkillFile = join(first.skillDirectories[0]!, GROWTH_WORLD_SKILL_NAME, "SKILL.md")
    const growthWorldProSkillFile = join(first.skillDirectories[0]!, GROWTH_WORLD_PRO_SKILL_NAME, "SKILL.md")
    const studySkillFile = join(first.skillDirectories[0]!, STUDY_SKILL_NAME, "SKILL.md")
    const drawMapSkillFile = join(first.skillDirectories[0]!, DRAW_MAP_SKILL_NAME, "SKILL.md")
    const drawComicSkillFile = join(first.skillDirectories[0]!, DRAW_COMIC_SKILL_NAME, "SKILL.md")
    const characterGallerySkillFile = join(first.skillDirectories[0]!, CHARACTER_GALLERY_SKILL_NAME, "SKILL.md")
    const causalitySkillFile = join(first.skillDirectories[0]!, CAUSALITY_SKILL_NAME, "SKILL.md")
    const drawMapReference = join(first.skillDirectories[0]!, DRAW_MAP_SKILL_NAME, "references", "output-contract.md")
    const drawComicReference = join(first.skillDirectories[0]!, DRAW_COMIC_SKILL_NAME, "references", "quality-review.md")
    await writeFile(skillFile, "stale", "utf8")
    await writeFile(growthSkillFile, "stale", "utf8")
    await writeFile(growthWorldSkillFile, "stale", "utf8")
    await writeFile(growthWorldProSkillFile, "stale", "utf8")
    await writeFile(studySkillFile, "stale", "utf8")
    await writeFile(drawMapSkillFile, "stale", "utf8")
    await writeFile(drawComicSkillFile, "stale", "utf8")
    await writeFile(characterGallerySkillFile, "stale", "utf8")
    await writeFile(causalitySkillFile, "stale", "utf8")
    await writeFile(drawMapReference, "stale", "utf8")
    await writeFile(drawComicReference, "stale", "utf8")

    await installBuiltinCreativeSkills(appData)

    expect(await readFile(skillFile, "utf8")).toBe(NOVEL_START_SKILL_SOURCE)
    expect(await readFile(growthSkillFile, "utf8")).toBe(GROWTH_SKILL_SOURCE)
    expect(await readFile(growthWorldSkillFile, "utf8")).toBe(GROWTH_WORLD_SKILL_SOURCE)
    expect(await readFile(growthWorldProSkillFile, "utf8")).toBe(GROWTH_WORLD_PRO_SKILL_SOURCE)
    expect(await readFile(studySkillFile, "utf8")).toBe(STUDY_SKILL_SOURCE)
    expect(await readFile(drawMapSkillFile, "utf8")).toBe(DRAW_MAP_SKILL_SOURCE)
    expect(await readFile(drawComicSkillFile, "utf8")).toBe(DRAW_COMIC_SKILL_SOURCE)
    expect(await readFile(characterGallerySkillFile, "utf8")).toBe(CHARACTER_GALLERY_SKILL_SOURCE)
    expect(await readFile(causalitySkillFile, "utf8")).toBe(CAUSALITY_SKILL_SOURCE)
    expect(await readFile(drawMapReference)).toEqual(Buffer.from(DRAW_MAP_SKILL_FILES["references/output-contract.md"], "base64"))
    expect(await readFile(drawComicReference)).toEqual(Buffer.from(DRAW_COMIC_SKILL_FILES["references/quality-review.md"], "base64"))
  })
})

function packagedSkillHashes(files: Record<string, string>) {
  return Object.fromEntries(Object.entries(files).map(([relativePath, base64]) => [relativePath, createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex").toUpperCase()]))
}
