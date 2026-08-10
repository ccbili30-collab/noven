import { ClineCore, CoreSessionService, SqliteSessionStore } from "@cline/sdk"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  buildWorldMaterializationWritingPrompt,
  hashWritingContract,
  PUBLICATION_GENRE_LIBRARY,
  requireResearchSubmissionV7,
  resolveWritingContract,
  topicGenreCandidates,
  type WorldBlueprintObject,
  type WorldBlueprintLayer,
  type WorldMaterializationResearchPacket,
} from "../../world-blueprint/src/index.ts"

const historicalLayer = "历史、时代与重大事件" as const
const topicProfileKey = "classic-medieval-fantasy"
const workRoot = "烬冠诸国"
const crossGenre = process.env.CREATX_CROSS_GENRE === "1"
const evidenceName = process.env.CREATX_MEDIEVAL_EVIDENCE_NAME?.trim() || (crossGenre ? "pro-v3-deepseek-cross-genre" : "pro-v3-deepseek-medieval-consistency")
if (!/^[a-z0-9-]+$/u.test(evidenceName)) throw new Error("MEDIEVAL CONTRACT LIVE FAIL: CREATX_MEDIEVAL_EVIDENCE_NAME must be a safe lowercase name")
const evidenceDir = resolve(import.meta.dirname, `../../../../artifacts/growth-world-live/${evidenceName}`)
const runRoot = await mkdtemp(join(tmpdir(), "creatx-medieval-contract-live-"))
const apiKey = requireEnvironment("DEEPSEEK_API_KEY")
const modelId = process.env.CREATX_MODEL_ID?.trim() || "deepseek-chat"
const store = new SqliteSessionStore({ sessionsDir: join(runRoot, "database") })
store.init()
const sessionService = new CoreSessionService(store, { sessionArtifactsDir: join(runRoot, "sessions") })
const core = await ClineCore.create({
  backendMode: "local",
  clientName: "creatx-growth-world-pro-medieval-contract-live",
  distinctId: "creatx-growth-world-pro-medieval-contract-live",
  sessionService,
  capabilities: { requestToolApproval: () => ({ approved: false, reason: "This bounded prose Live does not permit tools" }) },
})
const startedAt = Date.now()

const historicalSamples = [
  {
    layer: historicalLayer,
    key: "era-dawn-crowns",
    title: "诸王黎明纪",
    locator: "历史、时代与重大事件｜旧帝国覆亡后诸侯、教会与自由城逐步形成新秩序的百年时代",
    expectedGenreKey: "era-history",
    facts: [
      "赤历元年，奥雷帝国最后一位皇帝死于没有继承人的冬季。",
      "最初三十年由旧军团将领和行省总督割据，帝国道路仍维持远途征税。",
      "烛光教会在第四十年至第六十年间承认七顶王冠，换取主教法庭与修院土地。",
      "自由城在后半世纪通过城墙税、行会民兵和共同货币摆脱邻近领主。",
      "赤历一百零三年的七王会议被后世视为诸王时代正式开始。",
    ],
  },
  {
    layer: historicalLayer,
    key: "document-old-road-code",
    title: "旧路法典",
    locator: "历史、时代与重大事件｜规范王道通行、桥税、驿马和旅人保护并经历多次争议修订的法典",
    expectedGenreKey: "document-history",
    facts: [
      "法典由摄政王阿德里安在赤历二十七年召集十二座驿城代表议定。",
      "初版规定持王印者免桥税，却要求沿途村庄无偿提供驿马，引发三郡抗税。",
      "赤历三十一年修订后，驿马改由道路银库按里程偿付。",
      "七港商团支持统一秤量条款，北境边侯反对商人武装护卫越过领界。",
      "今日仍有四个王国援引法典保护朝圣者，但对军队征用条款解释不同。",
    ],
    contestedFacts: [
      "洛恩王国法官称军队征用条款只适用于王道境内；此说见于洛恩王室法庭的《旧路释例》。",
      "北境边侯的战时抄本称军队可以越过领界征用驿马；此说由北境关隘书记官署名保存。",
    ],
  },
  {
    layer: historicalLayer,
    key: "event-sunken-harvest",
    title: "沉穗之年",
    locator: "历史、时代与重大事件｜连续阴雨、河堤溃决与仓粮霉变造成的灾年及其政治后果",
    expectedGenreKey: "narrative-history",
    facts: [
      "赤历八十八年春季，艾尔河上游积雪骤融，三处旧帝国河堤在五日内相继溃决。",
      "王都粮官最初禁止外运，七港商船因此转售北岸，内陆价格在两个月内上涨四倍。",
      "圣烛修院开放冬储，却在六月发现半数黑麦因潮湿发霉。",
      "摄政议会最终撤销禁运并免除受灾三郡秋税，军队护送盐路粮车进入河谷。",
      "灾年造成大规模迁居，但没有英雄式决定性战役，也未推翻当时王朝。",
    ],
  },
  {
    layer: historicalLayer,
    key: "event-ash-rebellion",
    title: "灰烬起义",
    locator: "历史、时代与重大事件｜烧炭领民反抗旧税契并以一次不可逆选择改变北境统治秩序的起义",
    expectedGenreKey: "legendary-chronicle",
    facts: [
      "北境边侯以修复灰脊关为名恢复早已废止的双倍炭税，并扣押拒缴者的冬粮。",
      "烧炭女艾芙琳在雪夜焚毁税契库，主动断绝以赎金求和的可能。",
      "起义军第一次攻桥失败，艾芙琳的弟弟和四十七名村民战死，余众退入灰林。",
      "她随后联合被逐出的关隘骑士，从冰封支流绕过七拱桥，迫使边侯开城谈判。",
      "新契约取消世袭炭税并设三村议席；后世冬至仍点燃灰灯纪念死者。",
    ],
  },
] as const
const crossGenreSamples = [
  sample("rule-oathfire", "核心规则与边界", "誓火法则", "核心规则与边界｜誓约魔法如何成立、付出代价并在违约时失败", "rulebook", [
    "誓火只能在双方都听懂誓词并自愿报出真名时点燃。",
    "立誓者必须各自投入一件亲手持有超过一年的物品作为誓质。",
    "誓约不能迫使任何一方完成其身体上绝不可能完成的行为。",
    "主动违约者会失去辨认誓质所属之人的能力，持续到另一方解除誓约。",
    "火焰在胁迫、译词歧义或誓质被调包时只会熄灭，不会形成誓约。",
  ]),
  sample("region-mist-fir-basin", "宇宙、自然与地理", "雾杉盆地", "宇宙、自然与地理｜被三道山脊环抱、河流从地下峡口离开的湿润盆地", "regional-gazetteer", [
    "雾杉盆地位于灰脊山脉南麓，北、东、西三面由连续山脊包围。",
    "两条雪水河在盆地中央汇成缓慢的白苇河，随后从南侧地下峡口流出。",
    "春季低云贴近杉林，夏季午后多短促雷雨，冬季只有北坡长期积雪。",
    "西北隘口是马车能够通行的主要入口，东侧猎径只容单人和驮兽。",
    "盆地中央是湿草甸，村落集中在高出洪线的扇形砾地上。",
  ]),
  sample("species-bell-antler-deer", "生态、资源与物种", "钟角鹿", "生态、资源与物种｜生活在雾杉盆地林缘、角枝会在奔跑时相击发声的鹿类", "natural-history", [
    "成年钟角鹿肩高约至成人胸口，灰褐短毛在冬季变得浓密。",
    "雄鹿角枝中空而外弯，奔跑转向时会相互轻击，声音像远处小钟。",
    "它们春季在湿草甸结小群取食，入冬后退入南坡杉林。",
    "雌鹿每两年通常产下一只幼鹿，幼鹿最初六周躲在白苇丛中。",
    "盆地居民不驯养钟角鹿，只在落角季收集自然脱落的角制作响片。",
  ]),
  sample("craft-blue-salt-lamp", "经济、技术与力量体系", "蓝盐炼灯术", "经济、技术与力量体系｜利用海盐杂质制作耐风蓝焰灯的沿海工艺", "craft-treatise", [
    "蓝盐炼灯使用七港外滩晒盐池底部带蓝灰色的结晶残渣。",
    "匠人先以淡水反复淘洗残渣，再混入蜂蜡和磨细的贝壳灰。",
    "灯芯必须由三股浸油亚麻绞成，过紧会冒黑烟，过松会在风中熄灭。",
    "合格蓝焰灯能在海风中连续燃烧一夜，但遇雨仍需玻璃罩保护。",
    "炼制失败的主要征兆是蜡面起绿色泡沫，此时整锅材料不能再用。",
  ]),
  sample("custom-returning-lights", "社会、文化与日常生活", "归灯节", "社会、文化与日常生活｜沿海家庭在秋末迎接远航者并悼念失踪者的节庆", "customs", [
    "归灯节在秋季最后一次大潮后的傍晚举行。",
    "每户把一盏蓝焰灯放在朝海的窗台，并在门边留一碗不加盐的热汤。",
    "平安归来的水手先敲邻居的门，再进入自己家，表示航路由全街共同守望。",
    "失踪者家庭不宣告死亡，而把旧缆绳剪下一段系在公共灯架上。",
    "富裕商人使用彩色玻璃灯罩，渔户多用磨薄的贝壳片挡风。",
  ]),
  sample("state-lorn", "国家、组织与权力", "洛恩王国", "国家、组织与权力｜控制中央粮原、王权受领主会议与圣烛教会共同限制的王国", "state-profile", [
    "洛恩王国占据中央粮原和白苇河中游，王都卡伦位于三条王道交会处。",
    "国王的继承必须得到十二名大领主中至少八人承认，并由圣烛教会主持加冕。",
    "日常税收由各领地征收，王室只直接掌握王道关税、铸币和三座粮仓。",
    "七港同盟反对王室提高河运税，北境边侯则要求更多粮食修复灰脊关。",
    "现任国王病重且没有公开指定继承人，三名近亲正在争取领主支持。",
  ]),
  sample("city-seven-ports", "地区、城市与重要地点", "七港城", "地区、城市与重要地点｜沿弧形海湾生长、由七座旧码头连接成片的港城", "city-portrait", [
    "从海上最先看见七港城的是西岬白塔和沿弧形海湾排列的七列桅杆。",
    "旧城沿潮湿石坡向上，盐市、绳匠街和鱼棚依次贴近三座最早的码头。",
    "东侧新港有更宽的仓街，清晨是搬运工和驮车最拥挤的时候。",
    "退潮后居民可以沿黑石滩在四个港区之间步行，涨潮时只能走坡上拱廊。",
    "夜间蓝焰路灯只覆盖商会出资的主街，山坡住宅区仍依靠窗灯辨路。",
  ]),
  sample("situation-three-crowns", "当前局势与核心冲突", "三冠继承危机", "当前局势与核心冲突｜洛恩国王病重后三名继承候选人正在争取领主、教会和港口支持", "current-affairs", [
    "洛恩国王已经连续四十日没有公开露面，王室仍未公布继承文书。",
    "长公主控制王都粮仓并争取圣烛教会支持，但只有五名大领主公开承认她。",
    "国王的侄子驻守北境，承诺免除两年边地税，已有四名北方领主响应。",
    "七港同盟支持最年轻的王弟，条件是新王不得提高河运税。",
    "下一次领主会议将在二十日后召开，王都近来出现抢购粮食和护卫涨价。",
  ]),
  sample("character-mira", "人物、关系与阵营", "药草师弥拉", "人物、关系与阵营｜出身雾杉盆地、在王都行医并被继承危机卷入的年轻药草师", "biography", [
    "弥拉出生在雾杉盆地白苇河边的采药家庭，十二岁时随母亲学习辨认湿地药草。",
    "她十七岁离开盆地，到王都卡伦为圣烛修院抄写药方并照料病人。",
    "一次仓库失火中，她违抗修院长命令救出被锁住的异乡伤兵，因此被逐出修院。",
    "她与长公主的侍从索安保持秘密友谊，同时欠七港药材商一笔无法按期偿还的债。",
    "国王病重后，三方都想确认她是否接触过王室医师；她必须决定保护病人秘密还是换取归乡所需的钱。",
  ]),
  sample("legend-white-reed-bride", "故事、传说与叙事入口", "白苇新娘", "故事、传说与叙事入口｜雾杉盆地关于河水、失约与归途的完整民间传说", "legend-retelling", [
    "传说一名准备远嫁的姑娘在白苇河涨水时等待没有按约到来的船夫。",
    "她把嫁衣撕成白条系满河岸苇秆，请河水替她指认失约者。",
    "夜里所有白条同时指向上游，村民在那里发现船夫为救落水儿童而死。",
    "姑娘没有完成婚礼，而是在河边守渡四十年，帮助旅人辨认安全水道。",
    "盆地不同村庄对结尾有两种说法：她死后变成第一丛白苇，或在最后一次洪水中乘空船离开。",
  ]),
  sample("visual-lorn-travel-catalogue", "视觉、地图与关系索引", "洛恩诸国旅行图录", "视觉、地图与关系索引｜供普通读者辨认洛恩王国、七港城、雾杉盆地与主要道路的视觉图录", "visual-catalogue", [
    "图录封面以暗蓝海湾、金色粮原和灰白山脊构成三个水平色带。",
    "洛恩王室使用麦穗环绕白冠的纹章，底色为深红。",
    "七港同盟以七枚蓝色船钉排成弧形，不使用王冠图案。",
    "雾杉盆地的图版以灰绿杉林、白苇河和角枝相击的钟角鹿作为识别元素。",
    "道路页用赭色实线表示王道、蓝线表示可通航河段、黑色三角表示山口。",
  ]),
] as const
const samples = crossGenre ? crossGenreSamples : historicalSamples
const requestedTitles = process.env.CREATX_MEDIEVAL_TITLES?.split(",").map((title) => title.trim()).filter(Boolean)
const liveSamples = requestedTitles?.length ? samples.filter((sample) => requestedTitles.includes(sample.title)) : samples
if (!liveSamples.length || (requestedTitles && liveSamples.length !== requestedTitles.length)) throw new Error("MEDIEVAL CONTRACT LIVE FAIL: CREATX_MEDIEVAL_TITLES contains an unknown or duplicate title")

try {
  await mkdir(evidenceDir, { recursive: true })
  const selectionObjects = liveSamples.map((sample) => {
    const candidates = topicGenreCandidates(topicProfileKey, sample.layer)
    return {
      key: sample.key,
      title: sample.title,
      layer: sample.layer,
      locator: sample.locator,
      candidates: PUBLICATION_GENRE_LIBRARY[sample.layer].genres
        .filter((genre) => candidates.includes(genre.key))
        .map((genre) => ({ key: genre.key, label: genre.label, appliesTo: genre.appliesTo, structure: genre.structure })),
    }
  })
  const selectionPrompt = `你是大型中古奇幻世界设定集的蓝图编辑。只为下面对象选择适合它自身的出版文类，不写正文。每个对象所属层和合法候选都已经单独给出；只能从该对象自己的 candidates 中选择，不能因为题材相同就统一成一种写法。\n\n对象与逐对象候选：\n${JSON.stringify(selectionObjects, undefined, 2)}\n\n返回严格 JSON：{"selections":[{"key":"对象 key","genreKey":"该对象候选 key","reason":"一句具体理由"}]}。每个对象恰好一项，顺序不变，不要 Markdown 围栏。`
  const selectionText = await runTurn("中古历史文类选择", "你是世界设定集的蓝图编辑。只返回要求的 JSON。", selectionPrompt)
  const selection = JSON.parse(stripFence(selectionText)) as { selections?: Array<{ key?: unknown; genreKey?: unknown; reason?: unknown }> }
  if (!Array.isArray(selection.selections) || selection.selections.length !== liveSamples.length) throw new Error("MEDIEVAL CONTRACT LIVE FAIL: invalid selection count")
  const selected = selection.selections.map((item, index) => {
    const sample = liveSamples[index]!
    const candidates = topicGenreCandidates(topicProfileKey, sample.layer)
    if (item.key !== sample.key || typeof item.genreKey !== "string" || !candidates.includes(item.genreKey) || typeof item.reason !== "string" || !item.reason.trim()) {
      throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: invalid selection for ${sample.title}`)
    }
    if ("expectedGenreKey" in sample && item.genreKey !== sample.expectedGenreKey) throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: ${sample.title} expected ${sample.expectedGenreKey} but received ${item.genreKey}`)
    return { ...sample, genreKey: item.genreKey, reason: item.reason.trim() }
  })
  await Promise.all([
    writeFile(join(evidenceDir, "selection-prompt.md"), `${selectionPrompt}\n`, "utf8"),
    writeFile(join(evidenceDir, "selection-response.json"), `${JSON.stringify(selection, undefined, 2)}\n`, "utf8"),
  ])

  const results = []
  for (const [index, sample] of selected.entries()) {
    const object: WorldBlueprintObject & { plannedPath: string; genreKey: string } = {
      id: `live-history-${index + 1}`,
      key: sample.key,
      title: sample.title,
      layer: sample.layer,
      kind: "entry",
      parentId: `live-layer-${index + 1}-group`,
      plannedPath: `${workRoot}/${sample.layer}/${sample.title}.md`,
      genreKey: sample.genreKey,
      locator: sample.locator,
      order: index + 1,
      status: "planned",
    }
    const contract = resolveWritingContract({
      topicProfileKey,
      worldStyleProfile: {
        schemaVersion: 1,
        narrativeDistance: crossGenre ? "observational" : "historical",
        register: "literary",
        knowledgePosition: crossGenre ? "in-world-limited" : "retrospective",
        languageConventions: crossGenre
          ? ["使用世界内部称呼和普通读者可以理解的具体语言", "服从对象文类的叙述位置，不统一套用史家、编年或论文框架"]
          : ["使用世界内部纪年、地名和制度称呼", "历史判断必须归属于后世记录或具体群体"],
        forbiddenPatterns: crossGenre
          ? ["现代项目管理语言", "研究审计腔", "把非历史对象写成后世史书"]
          : ["现代项目管理语言", "研究审计腔", "把普通灾难传奇化"],
        sourceIds: ["medieval-live-baseline"],
      },
      object,
    })
    const contractHash = hashWritingContract(contract)
    const research = await buildResearchPacket(object, contract, contractHash, sample.facts, "contestedFacts" in sample ? sample.contestedFacts : [])
    const packet = research.packet
    const attributionInstruction = packet.consistencyGuard.attributedClaims.length
      ? "正文至少采用一条带归属的争议说法，并逐字保留其归属主体；不得把它改写成无来源的上帝视角结论。"
      : "本对象没有争议说法，不要凭空制造来源冲突。"
    const writingPrompt = buildWorldMaterializationWritingPrompt(
      workRoot,
      object,
      packet,
      contract,
      `不要调用任何工具。只在回复中输出完整 Markdown 正文，至少约 1600 个非空白中文字符；不得用重复、提纲或空泛总结凑长。${attributionInstruction}`,
    )
    const body = stripFence(await runTurn(`${sample.title}：正式正文`, "你是成熟的中古奇幻世界设定集作者。每个对象都必须服从它自己的冻结文类，不要把不同对象统一写成史书、百科或论文。只返回可出版正文。", writingPrompt))
    const characters = body.replace(/\s/gu, "").length
    if (characters < 1_200) throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: ${sample.title} returned only ${characters} non-whitespace characters`)
    const auditTerms = [...new Set(body.match(/(?:现有事实支持|研究包|物化|Writer|制作流程|(?:制度|权力|职责|功能|补给)接口|(?:统治|权力|制度|生产|关系|任务|内容)节点)/gu) ?? [])]
    if (auditTerms.length) throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: ${sample.title} exposed production language: ${auditTerms.join("、")}`)
    await Promise.all([
      writeFile(join(evidenceDir, `contract-${sample.key}.json`), `${JSON.stringify({ hash: contractHash, contract }, undefined, 2)}\n`, "utf8"),
      writeFile(join(evidenceDir, `research-${sample.key}.json`), `${JSON.stringify(packet, undefined, 2)}\n`, "utf8"),
      writeFile(join(evidenceDir, `research-responses-${sample.key}.json`), `${JSON.stringify(research.responses, undefined, 2)}\n`, "utf8"),
      writeFile(join(evidenceDir, `prompt-${sample.key}.md`), `${writingPrompt}\n`, "utf8"),
      writeFile(join(evidenceDir, `${sample.title}.md`), `${body}\n`, "utf8"),
    ])
    results.push({
      title: sample.title,
      layer: sample.layer,
      genreKey: contract.genreKey,
      genreLabel: contract.genreLabel,
      suggestedGenreKey: "suggestedGenreKey" in sample ? sample.suggestedGenreKey : sample.expectedGenreKey,
      contractHash,
      characters,
      auditTerms,
      selectionReason: sample.reason,
    })
    console.log(JSON.stringify({ status: "MEDIEVAL_CONTRACT_SAMPLE_COMPLETED", title: sample.title, genreKey: contract.genreKey, characters }))
  }

  const result = {
    status: "GROWTH WORLD PRO V3 MEDIEVAL CONTRACT AUTOMATED CHECK PASS — HUMAN REVIEW REQUIRED",
    provider: "deepseek",
    model: modelId,
    topicProfileKey,
    testMode: crossGenre ? "cross-genre-neutral-style" : "historical-subgenres",
    sampleCount: results.length,
    results,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    evidenceDir,
    scope: "Real Provider genre selection + Research cards + frozen Writing Contract + isolated Writer; no Electron, persistent image queue, complete Blueprint tool run, or twelve-layer claim",
  }
  await writeFile(join(evidenceDir, "result.json"), `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
  console.log(JSON.stringify(result))
} finally {
  try {
    await core.dispose("Growth World Pro medieval contract Live cleanup")
  } finally {
    store.close()
    await rm(runRoot, { recursive: true, force: true })
  }
}

async function runTurn(title: string, systemPrompt: string, prompt: string) {
  const session = await core.start({
    source: "desktop",
    interactive: false,
    sessionMetadata: { title },
    config: {
      providerId: "deepseek",
      modelId,
      apiKey,
      cwd: runRoot,
      workspaceRoot: runRoot,
      mode: "act",
      systemPrompt,
      maxIterations: 1,
      enableTools: false,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      disableMcpSettingsTools: true,
    },
    toolPolicies: {},
  })
  try {
    const response = await core.send({ sessionId: session.sessionId, prompt, timeoutMs: 600_000 })
    if (!response?.text.trim()) throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: Provider returned no content for ${title}`)
    return response.text.trim()
  } finally {
    await core.stop(session.sessionId)
  }
}

async function buildResearchPacket(
  object: WorldBlueprintObject & { plannedPath: string; genreKey: string },
  contract: ReturnType<typeof resolveWritingContract>,
  contractHash: string,
  facts: readonly string[],
  contestedFacts: readonly string[],
) {
  const contestedSection = contestedFacts.length ? contestedFacts.map((fact) => `- ${fact}`).join("\n") : "- 无"
  const initialPrompt = `你是 Growth World Pro 的一次性私有研究编辑，不写正文。\n\n对象：${object.title}\n冻结文类：${contract.genreKey} / ${contract.genreLabel}\n组织节拍：\n${contract.structure.map((beat) => `- ${beat}`).join("\n")}\n已建立事实：\n${facts.map((fact) => `- ${fact}`).join("\n")}\n争议解释：\n${contestedSection}\n\n返回严格 JSON，只含 contentBrief、claims、contentCards、terms、consistencyGuard、criticalGaps、excludedExternalTerms。claims 每项含 id、claim、epistemicStatus、sourcePaths（固定填 ["${workRoot}/世界基准.md"]）、relevance；给定事实标 established，争议标 contested，新增事实必须标 inferred。contentCards 每项只能含 beat 和一个 claimId，不得含 text 或 claimIds；每个组织节拍必须有卡。terms 每项只含 canonical、aliases、claimId，名称必须逐字出现在实际采用的 claim 中。consistencyGuard 只能含 invariants 和 attributedClaims；采用的 established claim 必须逐字进入 invariant，采用的 contested claim 必须逐字进入 attributedClaims，归属用 attributionClaimId 引用另一条也被内容卡采用并进入 invariant 的 established claim，未采用 contested claim 不进入 guard。criticalGaps 是 {beat,reason} 数组，本诊断输入充足时应为空。禁止研究包、物化、Writer、节点接口、支持或不支持等制作分析语言。不要 Markdown 围栏。`
  const prompt = `${initialPrompt}\n\n覆盖门禁：每张内容卡只引用一个认识状态明确的 claim；任何新增事实必须先成为 inferred claim。`
  return attemptResearchPacket(object, contract, contractHash, prompt, prompt, [], 1)
}

async function attemptResearchPacket(
  object: WorldBlueprintObject & { plannedPath: string; genreKey: string },
  contract: ReturnType<typeof resolveWritingContract>,
  contractHash: string,
  initialPrompt: string,
  prompt: string,
  responses: string[],
  attempt: number,
): Promise<{ packet: WorldMaterializationResearchPacket; responses: string[] }> {
  const response = await runTurn(`${object.title}：研究卡 ${attempt}`, "你是出版研究编辑。只返回严格 JSON，不写正文。", prompt)
  const nextResponses = [...responses, response]
  try {
    return { packet: requireResearchSubmissionV7(JSON.parse(stripFence(response)), object, contract, contractHash), responses: nextResponses }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (attempt >= 3) {
      await Promise.all([
        writeFile(join(evidenceDir, `research-failure-${object.key}.json`), `${JSON.stringify({ error: detail, responses: nextResponses }, undefined, 2)}\n`, "utf8"),
        writeFile(join(evidenceDir, `research-failure-prompt-${object.key}.md`), `${prompt}\n`, "utf8"),
      ])
      throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: ${object.title} research packet rejected after ${attempt} attempts: ${detail}`)
    }
    return attemptResearchPacket(object, contract, contractHash, initialPrompt, `${initialPrompt}\n\n上一版被 Runtime 拒绝：${detail}。修正字段类型并重新返回完整 JSON；不得删减组织节拍。`, nextResponses, attempt + 1)
  }
}

function stripFence(value: string) {
  return value.match(/^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/iu)?.[1]?.trim() ?? value.trim()
}

function sample(
  key: string,
  layer: WorldBlueprintLayer,
  title: string,
  locator: string,
  suggestedGenreKey: string,
  facts: readonly string[],
) {
  return { key, layer, title, locator, suggestedGenreKey, facts }
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`MEDIEVAL CONTRACT LIVE FAIL: ${name} is not configured`)
  return value
}
