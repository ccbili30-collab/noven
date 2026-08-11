import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"

export const onboardingSeenStorageKey = "creatx.workspace.onboarding.v1"

type OnboardingSurface = "workspace" | "settings" | "art" | "idea" | "heritage"

type OnboardingStep = {
  id: string
  kicker: string
  title: string
  body: string
  prompt: string
  surface: OnboardingSurface
  selector?: string
}

type StoragePort = Pick<Storage, "getItem" | "setItem">

type SpotlightRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type SpotlightPlacement = {
  side: "center" | "left" | "right" | "top" | "bottom"
  left: number
  top: number
  pointer: number
}

export const onboardingSteps: readonly OnboardingStep[] = [
  {
    id: "welcome",
    kicker: "第一次见面",
    title: "把一次心动，种成一个世界",
    body: "诺文不是替你完成创作。它陪你把喜欢的内容变成种子，再由你决定这个世界往哪里生长。",
    prompt: "接下来约 3 分钟。你可以随时跳过，之后从左下角重新打开。",
    surface: "workspace",
  },
  {
    id: "api",
    kicker: "01 · 连接创作能力",
    title: "先让诺文能够听懂你",
    body: "填写比赛提供的交流模型与生图模型信息。交流模型负责理解和行动，生图模型负责把世界变成画面。",
    prompt: "诺文不会在教程中读取、填写或测试你的 API Key。",
    surface: "settings",
    selector: '[data-onboarding="api"]',
  },
  {
    id: "project",
    kicker: "02 · 选择创作空间",
    title: "你的作品，保存在真实文件夹中",
    body: "选择一个空文件夹作为项目。世界设定、角色、故事和图像都会成为你可以直接查看与带走的文件。",
    prompt: "这是内容的家，不是一个只能在软件里查看的黑盒。",
    surface: "workspace",
    selector: '[data-onboarding="open-project"]',
  },
  {
    id: "seed",
    kicker: "03 · 种下第一颗种子",
    title: "把视频链接和创作愿望一起发给 AI",
    body: "例如：以这条视频为种子，帮我创作一个经典硬科幻世界，并写出其中的第一篇小说。",
    prompt: "打开项目并建立会话后，在这里粘贴视频链接；没有会话时教程会居中说明，不伪造输入框。",
    surface: "workspace",
    selector: '[data-onboarding="composer"]',
  },
  {
    id: "workbench",
    kicker: "04 · 世界开始生长",
    title: "作品会在工作台里陆续出现",
    body: "打开文件、直接编辑、查看图片、做视觉批注，再让 AI 继续理解你的修改。这里是创作空间，不只是结果展示页。",
    prompt: "第一次看到真实作品文件，就是新手主线的完成点。",
    surface: "workspace",
    selector: '[data-onboarding="workbench"]',
  },
  {
    id: "art",
    kicker: "05 · 建立个人审美",
    title: "艺术库保存你真正喜欢的画面",
    body: "收集参考图、整理色彩与构图、人工审批分类，再把稳定的风格交给后续作品继承。",
    prompt: "AI 做整理，你决定什么能进入自己的审美。",
    surface: "art",
    selector: '[data-onboarding="art-library"]',
  },
  {
    id: "idea",
    kicker: "06 · 保存创作火花",
    title: "灵感库分成启发与幻想",
    body: "问题进入启发，完整的异世界点子进入幻想。看到喜欢的点子，可以发送到任意项目会话继续创作。",
    prompt: "喜欢和收藏只代表你的本机热度，不伪造公共流行度。",
    surface: "idea",
    selector: '[data-onboarding="idea-library"]',
  },
  {
    id: "heritage",
    kicker: "07 · 向优秀创作者学习",
    title: "传承库保存方法，不冒充看过内容",
    body: "打开创作资料，查看来源与摘要；只有取得真实字幕的内容，才能让 AI 提炼并安装为可重复使用的 Skill。",
    prompt: "没有字幕就明确停止，不根据标题或封面编造方法。",
    surface: "heritage",
    selector: '[data-onboarding="heritage-library"]',
  },
  {
    id: "capabilities",
    kicker: "08 · AI 的创作能力",
    title: "你只需说想创造什么",
    body: "诺文会根据目标选择合适的 Skill 与工具。你也可以输入斜杠命令，明确指定一条创作路线。",
    prompt: "下面只列当前随应用安装的能力；实验中或尚未上线的 Skill 不冒充可用功能。",
    surface: "workspace",
  },
  {
    id: "complete",
    kicker: "准备完成",
    title: "接下来，由你决定世界往哪里生长",
    body: "继续完善世界、创造第一位角色，或写下第一篇故事。诺文会保留真实过程，也允许你随时接管作品。",
    prompt: "以后可以从左下角“新手教程”重新打开这段引导。",
    surface: "workspace",
  },
] as const

const capabilityCards = [
  ["世界生长", "长期推进完整世界、阶段、作品与配图"],
  ["小说创作", "把种子或已有世界转成长篇叙事"],
  ["人物群像", "建立角色群像、关系与人物档案"],
  ["资料学习", "阅读资料、文风、画风并形成研究成果"],
  ["地图", "生成视觉地图与可选择区域"],
  ["漫画", "把文本转成连续画风与分镜"],
  ["因果图", "展示世界中已经明确登记的因果关系"],
  ["图像", "生成、编辑、排队并挂接项目图片"],
  ["工作台", "组织、预览、编辑和批注真实作品"],
] as const

const skillCatalog = [
  {
    group: "随时可用的创作 Skill",
    items: [
      ["小说创作", "自然语言或 Skill 挂篮", "从一颗种子或已有世界建立故事大纲与小说开篇，保留已有正文，并把作品注册到工作台。"],
      ["资料研究", "/study", "阅读项目资料、参考图片、文风与画风，形成可追溯的研究文件；不会改写或重排原始资料。"],
      ["世界地图", "/draw-map", "规划地图区域，生成艺术底图、完整区域蒙版与可选择地图工作台；一张普通图片不冒充交互地图。"],
      ["人物群像", "自然语言或 Skill 挂篮", "建立五位重要人物与一位普通人的世界群像，整理关系、人物档案和可复用的角色画廊。"],
      ["连续漫画", "/draw-comic", "把已有文本改编成连续分镜，统一角色、场景与画风，保存真实漫画图片和制作资料。"],
      ["因果关系网", "/causality", "读取世界中已经明确登记的因果，只展示原因指向结果的关系，并生成可交互因果工作台。"],
    ],
  },
  {
    group: "长期创作路线",
    items: [
      ["长期目标", "/growth", "把一个长期创作目标拆成连续阶段，在同一项目中持续推进；可以暂停、继续，并保留每阶段的真实作品。"],
      ["完整世界", "/growth_world", "建立新世界、整理已有作品，或在保留原作边界的前提下扩展二创世界，形成可继续生长的完整项目。"],
      ["大型世界工程", "/growth_world_pro", "按路线、十二层蓝图、全世界审阅与自由物化四个阶段，生产大型世界观、人物、故事、图像和工作台。"],
    ],
  },
] as const

export function readOnboardingSeen(storage: Pick<StoragePort, "getItem">) {
  const saved = storage.getItem(onboardingSeenStorageKey)
  if (!saved) return false
  return saved === JSON.stringify({ version: 1, seen: true })
}

export function markOnboardingSeen(storage: Pick<StoragePort, "setItem">) {
  storage.setItem(onboardingSeenStorageKey, JSON.stringify({ version: 1, seen: true }))
}

export function resolveSpotlightPlacement(target: SpotlightRect | undefined, viewport: { width: number; height: number }, card: { width: number; height: number }): SpotlightPlacement {
  if (!target) return { side: "center", left: viewport.width / 2, top: viewport.height / 2, pointer: 0 }
  const margin = 18
  const gap = 22
  const spaces = [
    { side: "left" as const, value: target.left, fits: target.left >= card.width + gap + margin },
    { side: "right" as const, value: viewport.width - target.right, fits: viewport.width - target.right >= card.width + gap + margin },
    { side: "top" as const, value: target.top, fits: target.top >= card.height + gap + margin },
    { side: "bottom" as const, value: viewport.height - target.bottom, fits: viewport.height - target.bottom >= card.height + gap + margin },
  ]
  const best = spaces.filter((space) => space.fits).sort((left, right) => right.value - left.value)[0]
    ?? spaces.sort((left, right) => right.value - left.value)[0]!
  const horizontal = clamp(target.left + target.width / 2 - card.width / 2, margin, viewport.width - card.width - margin)
  const vertical = clamp(target.top + target.height / 2 - card.height / 2, margin, viewport.height - card.height - margin)
  const left = best.side === "left" ? clamp(target.left - card.width - gap, margin, viewport.width - card.width - margin)
    : best.side === "right" ? clamp(target.right + gap, margin, viewport.width - card.width - margin)
    : horizontal
  const top = best.side === "top" ? clamp(target.top - card.height - gap, margin, viewport.height - card.height - margin)
    : best.side === "bottom" ? clamp(target.bottom + gap, margin, viewport.height - card.height - margin)
    : vertical
  const pointer = best.side === "left" || best.side === "right"
    ? clamp(target.top + target.height / 2 - top, 20, card.height - 20)
    : clamp(target.left + target.width / 2 - left, 20, card.width - 20)
  return { side: best.side, left, top, pointer }
}

export function OnboardingTour({ onDismiss, onSurface }: { onDismiss: () => void; onSurface: (surface: OnboardingSurface) => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [target, setTarget] = useState<SpotlightRect>()
  const [placement, setPlacement] = useState<SpotlightPlacement>(() => ({ side: "center", left: typeof window === "undefined" ? 0 : window.innerWidth / 2, top: typeof window === "undefined" ? 0 : window.innerHeight / 2, pointer: 0 }))
  const card = useRef<HTMLElement>(null)
  const onSurfaceRef = useRef(onSurface)
  const step = onboardingSteps[stepIndex]!

  useLayoutEffect(() => {
    onSurfaceRef.current = onSurface
  }, [onSurface])

  useLayoutEffect(() => {
    onSurfaceRef.current(step.surface)
    setTarget(undefined)
    const measure = () => {
      const rect = step.selector ? document.querySelector(step.selector)?.getBoundingClientRect() : undefined
      setTarget(rect ? spotlightRect(rect) : undefined)
    }
    const timer = window.setTimeout(measure, 180)
    const observer = new MutationObserver(measure)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [step.id, step.selector, step.surface])

  useLayoutEffect(() => {
    const position = () => setPlacement(resolveSpotlightPlacement(target, { width: window.innerWidth, height: window.innerHeight }, { width: card.current?.offsetWidth ?? 300, height: card.current?.offsetHeight ?? 240 }))
    position()
    const frame = window.requestAnimationFrame(position)
    window.addEventListener("resize", position)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", position)
    }
  }, [step.id, target])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element instanceof HTMLElement && element.isContentEditable) return
      if (event.key === "Escape") { event.preventDefault(); onDismiss(); return }
      if (event.key === "ArrowLeft") { event.preventDefault(); setStepIndex((current) => Math.max(0, current - 1)); return }
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        if (stepIndex === onboardingSteps.length - 1) onDismiss()
        else setStepIndex((current) => current + 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onDismiss, stepIndex])

  return <section className="wb-onboarding-layer" role="dialog" aria-modal="true" aria-label={`诺文新手教程，第 ${stepIndex + 1} 步，共 ${onboardingSteps.length} 步`}>
    <TargetHalo target={target} />
    <article ref={card} className="wb-onboarding-card" data-side={placement.side} data-step={step.id} style={{ left: placement.left, top: placement.top }}>
      {placement.side !== "center" && <span className="wb-onboarding-pointer" style={placement.side === "left" || placement.side === "right" ? { top: placement.pointer } : { left: placement.pointer }} />}
      <div className="wb-onboarding-content">
        <small className="wb-onboarding-kicker">{step.kicker}</small>
        <h1>{step.title}</h1>
        <p>{step.body}</p>
        <blockquote><Sparkles size={15} />{step.prompt}</blockquote>
        {step.id === "capabilities" && <CapabilityCatalog />}
      </div>
      <footer className="wb-onboarding-controls">
        <button type="button" disabled={!stepIndex} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ChevronLeft size={16} />返回</button>
        <span>{stepIndex + 1} / {onboardingSteps.length}</span>
        <button className="wb-onboarding-skip" type="button" onClick={onDismiss}>跳过</button>
        <button className="wb-onboarding-primary" type="button" onClick={() => stepIndex === onboardingSteps.length - 1 ? onDismiss() : setStepIndex((current) => current + 1)}>{stepIndex === onboardingSteps.length - 1 ? "开始创作" : <>下一步<ChevronRight size={16} /></>}</button>
      </footer>
    </article>
  </section>
}

function TargetHalo({ target }: { target: SpotlightRect | undefined }) {
  if (!target) return <div className="wb-onboarding-full-scrim" />
  const visible = {
    top: Math.max(0, target.top),
    right: Math.min(window.innerWidth, target.right),
    bottom: Math.min(window.innerHeight, target.bottom),
    left: Math.max(0, target.left),
  }
  if (visible.right <= visible.left || visible.bottom <= visible.top) return <div className="wb-onboarding-full-scrim" />
  const gap = 8
  return <>
    <div className="wb-onboarding-scrim is-top" style={{ height: Math.max(0, visible.top - gap) }} />
    <div className="wb-onboarding-scrim is-bottom" style={{ top: visible.bottom + gap }} />
    <div className="wb-onboarding-scrim is-left" style={{ top: Math.max(0, visible.top - gap), width: Math.max(0, visible.left - gap), height: visible.bottom - visible.top + gap * 2 }} />
    <div className="wb-onboarding-scrim is-right" style={{ top: Math.max(0, visible.top - gap), left: visible.right + gap, height: visible.bottom - visible.top + gap * 2 }} />
    <div className="wb-onboarding-target" style={{ left: visible.left - gap, top: visible.top - gap, width: visible.right - visible.left + gap * 2, height: visible.bottom - visible.top + gap * 2 }} />
  </>
}

function CapabilityCatalog() {
  return <div className="wb-onboarding-capability-wrap">
    <div className="wb-onboarding-capability-grid">{capabilityCards.map(([title, body]) => <div key={title}><strong>{title}</strong><span>{body}</span></div>)}</div>
    <details className="wb-onboarding-skill-catalog" open>
      <summary><span>查看 AI 的工具箱</span><small>当前内置 9 项创作 Skill</small></summary>
      <div className="wb-onboarding-skill-groups">{skillCatalog.map((group) => <section key={group.group}>
        <header><strong>{group.group}</strong><span>{group.items.length} 项</span></header>
        <div>{group.items.map(([title, invocation, description]) => <article key={title}>
          <div><strong>{title}</strong><code>{invocation}</code></div>
          <p>{description}</p>
        </article>)}</div>
      </section>)}</div>
      <p className="wb-onboarding-skill-note">这里只展示当前随应用安装的能力。实验中或尚未上线的 Skill 不列为可用功能。</p>
    </details>
  </div>
}

function spotlightRect(rect: DOMRect): SpotlightRect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
