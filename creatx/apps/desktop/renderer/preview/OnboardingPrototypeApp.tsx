import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Feather, RotateCcw, Sparkles } from "lucide-react"
import { PreviewApp } from "./PreviewApp"
import { OnboardingArtLibraryPrototype, onboardingArtLibrarySnapshot } from "./OnboardingArtLibraryPrototype"

type Variant = "spotlight" | "companion" | "cinematic"

interface OnboardingStep {
  id: string
  kicker: string
  title: string
  body: string
  prompt: string
  selector?: string
  action?: () => void
}

const variants: Array<{ id: Variant; label: string }> = [
  { id: "spotlight", label: "A · 聚光箭头" },
  { id: "companion", label: "B · AI 陪伴栏" },
  { id: "cinematic", label: "C · 章节舞台" },
]

const steps: readonly OnboardingStep[] = [
  {
    id: "welcome",
    kicker: "第一次见面",
    title: "把一次心动，种成一个世界",
    body: "诺文不是替你完成创作。它陪你把喜欢的内容变成种子，再由你决定这个世界往哪里生长。",
    prompt: "接下来约 3 分钟。原型不会连接 API，也不会修改任何真实文件。",
  },
  {
    id: "api",
    kicker: "01 · 连接创作能力",
    title: "先让诺文能够听懂你",
    body: "填写比赛提供的交流模型与生图模型信息。正式版本会在这里验证连接，成功后才进入创作。",
    prompt: "交流模型负责理解和行动；生图模型负责把世界变成画面。",
    selector: ".wb-settings-form",
    action: () => document.querySelector<HTMLButtonElement>('[title="设置"]')?.click(),
  },
  {
    id: "project",
    kicker: "02 · 选择创作空间",
    title: "你的作品，保存在真实文件夹中",
    body: "选择一个空文件夹作为项目。世界设定、角色、故事和图像都会成为你可以直接查看与带走的文件。",
    prompt: "这是内容的家，不是一个只能在软件里查看的黑盒。",
    selector: '[title="打开项目"]',
    action: returnToWorkspace,
  },
  {
    id: "seed",
    kicker: "03 · 种下第一颗种子",
    title: "把视频链接和创作愿望一起发给 AI",
    body: "例如：以这条视频为种子，帮我创作一个经典硬科幻世界，并写出其中的第一篇小说。",
    prompt: "真实版本会等待 AI 理解视频、凝练种子，再请你确认方向。",
    selector: 'textarea[aria-label="发送消息"]',
    action: returnToWorkspace,
  },
  {
    id: "workbench",
    kicker: "04 · 世界开始生长",
    title: "作品会在工作台里陆续出现",
    body: "这里不是结果展示页，而是你的创作空间。打开文件、直接编辑、查看图片、做视觉批注，再让 AI 继续理解你的修改。",
    prompt: "第一次看到真实作品文件，就是新手主线的完成点。",
    selector: ".wb-workbench-heading",
    action: returnToWorkspace,
  },
  {
    id: "art",
    kicker: "05 · 建立个人审美",
    title: "艺术库保存你真正喜欢的画面",
    body: "收集参考图、整理色彩与构图、人工审批分类，再把稳定的风格交给后续作品继承。",
    prompt: "AI 做整理，你决定什么能进入自己的审美。",
    selector: ".onboarding-art-library-prototype",
    action: () => document.querySelector<HTMLButtonElement>('[title="打开艺术库"]')?.click(),
  },
  {
    id: "idea",
    kicker: "06 · 保存创作火花",
    title: "灵感库分成启发与幻想",
    body: "问题进入启发，完整的异世界点子进入幻想。看到喜欢的点子，可以直接发送到任意项目会话继续创作。",
    prompt: "喜欢和收藏只代表你的本机热度，不伪造公共流行度。",
    selector: ".wb-idea-library-header",
    action: () => document.querySelector<HTMLButtonElement>('[title="打开灵感库"]')?.click(),
  },
  {
    id: "heritage",
    kicker: "07 · 向优秀创作者学习",
    title: "传承库保存方法，不冒充看过内容",
    body: "打开创作资料，查看来源与摘要；只有取得真实字幕的内容，才能让 AI 提炼并安装为可重复使用的 Skill。",
    prompt: "没有字幕就明确停止，不根据标题或封面编造方法。",
    selector: ".wb-heritage-header",
    action: () => document.querySelector<HTMLButtonElement>('[title="打开传承库"]')?.click(),
  },
  {
    id: "capabilities",
    kicker: "08 · AI 的创作能力",
    title: "你只需说想创造什么",
    body: "诺文会根据目标选择合适的 Skill 与工具。你也可以输入斜杠命令，明确指定一条创作路线。",
    prompt: "主界面只介绍用户能理解的能力；内部工具名放在技术详情中。",
    action: returnToWorkspace,
  },
  {
    id: "complete",
    kicker: "准备完成",
    title: "接下来，由你决定世界往哪里生长",
    body: "继续完善世界、创造第一位角色，或写下第一篇故事。诺文会保留真实过程，也允许你随时接管作品。",
    prompt: "正式版本可从帮助菜单重新打开这段引导。",
    action: returnToWorkspace,
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

function returnToWorkspace() {
  document.querySelector<HTMLButtonElement>(".wb-settings-back")?.click()
  document.querySelector<HTMLButtonElement>('.wb-idea-library [title="返回创作"]')?.click()
  document.querySelector<HTMLButtonElement>('.wb-heritage-library [title="返回创作"]')?.click()
}

function readVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get("variant")
  return variants.some((variant) => variant.id === value) ? value as Variant : "spotlight"
}

function readStep() {
  const value = Number(new URLSearchParams(window.location.search).get("step"))
  return Number.isInteger(value) ? Math.max(0, Math.min(steps.length - 1, value)) : 0
}

export function OnboardingPrototypeApp() {
  const [variant, setVariant] = useState(readVariant)
  const [stepIndex, setStepIndex] = useState(readStep)
  const [target, setTarget] = useState<DOMRect>()
  const step = steps[stepIndex]!

  useLayoutEffect(() => {
    step.action?.()
    const measure = () => setTarget(step.selector ? document.querySelector(step.selector)?.getBoundingClientRect() : undefined)
    const timer = window.setTimeout(measure, 160)
    const observer = new MutationObserver(measure)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [step])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set("variant", variant)
    url.searchParams.set("step", String(stepIndex))
    window.history.replaceState({}, "", url)
  }, [stepIndex, variant])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLElement && element.isContentEditable) return
      if (event.key === "Escape") { setStepIndex(steps.length - 1); return }
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setStepIndex((current) => Math.min(steps.length - 1, current + 1)); return }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const index = variants.findIndex((item) => item.id === variant)
      setVariant(variants[(index + (event.key === "ArrowRight" ? 1 : -1) + variants.length) % variants.length]!.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [variant])

  const move = (offset: number) => setStepIndex((current) => Math.max(0, Math.min(steps.length - 1, current + offset)))

  return <div className={`onboarding-prototype variant-${variant} step-${step.id}`}>
    <PreviewApp onboarding />
    {step.id === "art" && <OnboardingArtLibraryPrototype snapshot={onboardingArtLibrarySnapshot} />}
    <div className="prototype-stamp"><span>PROTOTYPE</span><strong>诺文首次引导</strong><small>只读演示 · {stepIndex + 1}/{steps.length}</small></div>
    <TargetHalo target={target} variant={variant} />
    {variant === "spotlight" && <SpotlightGuide step={step} target={target} stepIndex={stepIndex} move={move} />}
    {variant === "companion" && <CompanionGuide step={step} stepIndex={stepIndex} move={move} />}
    {variant === "cinematic" && <CinematicGuide step={step} stepIndex={stepIndex} move={move} />}
    <VariantSwitcher variant={variant} onChange={setVariant} />
  </div>
}

function TargetHalo({ target, variant }: { target: DOMRect | undefined; variant: Variant }) {
  if (!target) return variant === "spotlight" ? <div className="prototype-full-scrim" /> : undefined
  const visibleTarget = {
    top: Math.max(0, target.top),
    right: Math.min(window.innerWidth, target.right),
    bottom: Math.min(window.innerHeight, target.bottom),
    left: Math.max(0, target.left),
  }
  if (visibleTarget.right <= visibleTarget.left || visibleTarget.bottom <= visibleTarget.top) {
    return variant === "spotlight" ? <div className="prototype-full-scrim" /> : undefined
  }
  const gap = 8
  if (variant === "spotlight") return <>
    <div className="spotlight-scrim is-top" style={{ height: Math.max(0, visibleTarget.top - gap) }} />
    <div className="spotlight-scrim is-bottom" style={{ top: visibleTarget.bottom + gap }} />
    <div className="spotlight-scrim is-left" style={{ top: Math.max(0, visibleTarget.top - gap), width: Math.max(0, visibleTarget.left - gap), height: visibleTarget.bottom - visibleTarget.top + gap * 2 }} />
    <div className="spotlight-scrim is-right" style={{ top: Math.max(0, visibleTarget.top - gap), left: visibleTarget.right + gap, height: visibleTarget.bottom - visibleTarget.top + gap * 2 }} />
    <div className="prototype-target" style={{ left: visibleTarget.left - gap, top: visibleTarget.top - gap, width: visibleTarget.right - visibleTarget.left + gap * 2, height: visibleTarget.bottom - visibleTarget.top + gap * 2 }} />
  </>
  return <div className="prototype-target" style={{ left: target.left - 7, top: target.top - 7, width: target.width + 14, height: target.height + 14 }} />
}

function SpotlightGuide({ step, target, stepIndex, move }: GuideProps & { target: DOMRect | undefined }) {
  const card = useRef<HTMLElement>(null)
  const [placement, setPlacement] = useState({ side: "center", left: window.innerWidth / 2, top: window.innerHeight / 2, pointer: 0 })

  useLayoutEffect(() => {
    const position = () => {
      if (!target || !card.current) {
        setPlacement({ side: "center", left: window.innerWidth / 2, top: window.innerHeight / 2, pointer: 0 })
        return
      }
      const width = card.current.offsetWidth
      const height = card.current.offsetHeight
      if (step.id === "art") {
        setPlacement({
          side: "center",
          left: Math.min(window.innerWidth - width / 2 - 28, target.left + 240 + width / 2),
          top: window.innerHeight - height / 2 - 28,
          pointer: 0,
        })
        return
      }
      const margin = 18
      const gap = 22
      const spaces = [
        { side: "left", value: target.left, fits: target.left >= width + gap },
        { side: "right", value: window.innerWidth - target.right, fits: window.innerWidth - target.right >= width + gap },
        { side: "top", value: target.top, fits: target.top >= height + gap },
        { side: "bottom", value: window.innerHeight - target.bottom, fits: window.innerHeight - target.bottom >= height + gap },
      ]
      const best = spaces.filter((space) => space.fits).sort((a, b) => b.value - a.value)[0]
        ?? spaces.sort((a, b) => b.value - a.value)[0]!
      const horizontal = Math.min(window.innerWidth - width - margin, Math.max(margin, target.left + target.width / 2 - width / 2))
      const vertical = Math.min(window.innerHeight - height - margin, Math.max(margin, target.top + target.height / 2 - height / 2))
      const left = best.side === "left" ? Math.max(margin, target.left - width - gap)
        : best.side === "right" ? Math.min(window.innerWidth - width - margin, target.right + gap)
        : horizontal
      const top = best.side === "top" ? Math.max(margin, target.top - height - gap)
        : best.side === "bottom" ? Math.min(window.innerHeight - height - margin, target.bottom + gap)
        : vertical
      const pointer = best.side === "left" || best.side === "right"
        ? Math.max(20, Math.min(height - 20, target.top + target.height / 2 - top))
        : Math.max(20, Math.min(width - 20, target.left + target.width / 2 - left))
      setPlacement({ side: best.side, left, top, pointer })
    }
    position()
    const frame = window.requestAnimationFrame(position)
    window.addEventListener("resize", position)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", position)
    }
  }, [step, target])

  return <article ref={card} className="guide-card spotlight-card" data-side={placement.side} data-step={step.id} style={{ left: placement.left, top: placement.top }}>
    {placement.side !== "center" && <span className="spotlight-pointer" style={placement.side === "left" || placement.side === "right" ? { top: placement.pointer } : { left: placement.pointer }} />}
    <div className="spotlight-content"><GuideCopy step={step} />{step.id === "capabilities" && <CapabilityGrid />}</div>
    <GuideControls stepIndex={stepIndex} move={move} />
  </article>
}

function CompanionGuide({ step, stepIndex, move }: GuideProps) {
  return <aside className="companion-guide">
    <header><span className="companion-mark"><Feather size={24} /></span><div><small>诺文向导</small><strong>我陪你走完第一次创作</strong></div></header>
    <div className="companion-thread">
      <span className="companion-message is-old">每一步都可以跳过，之后也能从帮助里重新打开。</span>
      <div className="companion-message is-current"><GuideCopy step={step} /></div>
      {step.id === "capabilities" && <CapabilityGrid />}
    </div>
    <div className="companion-progress">{steps.map((item, index) => <i key={item.id} className={index <= stepIndex ? "is-complete" : ""} />)}</div>
    <GuideControls stepIndex={stepIndex} move={move} />
  </aside>
}

function CinematicGuide({ step, stepIndex, move }: GuideProps) {
  return <section className="cinematic-guide">
    <div className="cinematic-number">{String(stepIndex + 1).padStart(2, "0")}</div>
    <div className="cinematic-copy"><GuideCopy step={step} />{step.id === "capabilities" && <CapabilityGrid />}</div>
    <div className="cinematic-actions"><GuideControls stepIndex={stepIndex} move={move} /></div>
  </section>
}

function GuideCopy({ step }: { step: OnboardingStep }) {
  return <>
    <small className="guide-kicker">{step.kicker}</small>
    <h1>{step.title}</h1>
    <p>{step.body}</p>
    <blockquote><Sparkles size={15} />{step.prompt}</blockquote>
  </>
}

function CapabilityGrid() {
  return <div className="capability-wrap">
    <div className="capability-grid">{capabilityCards.map(([title, body]) => <div key={title}><strong>{title}</strong><span>{body}</span></div>)}</div>
    <details className="skill-catalog" open>
      <summary><span>查看 AI 的工具箱</span><small>当前内置 9 项创作 Skill</small></summary>
      <div className="skill-catalog-groups">{skillCatalog.map((group) => <section key={group.group}>
        <header><strong>{group.group}</strong><span>{group.items.length} 项</span></header>
        <div>{group.items.map(([title, invocation, description]) => <article key={title}>
          <div><strong>{title}</strong><code>{invocation}</code></div>
          <p>{description}</p>
        </article>)}</div>
      </section>)}</div>
      <p className="skill-catalog-note">这里只展示当前随应用安装的能力。实验中或尚未上线的 Skill 不列为可用功能。</p>
    </details>
  </div>
}

interface GuideProps {
  step: OnboardingStep
  stepIndex: number
  move: (offset: number) => void
}

function GuideControls({ stepIndex, move }: Omit<GuideProps, "step">) {
  const complete = stepIndex === steps.length - 1
  return <footer className="guide-controls">
    <button type="button" disabled={!stepIndex} onClick={() => move(-1)}><ChevronLeft size={16} />返回</button>
    <span>{stepIndex + 1} / {steps.length}</span>
    <button className="guide-skip" type="button" onClick={() => move(steps.length)}>跳过</button>
    <button className="guide-primary" type="button" onClick={() => complete ? move(-steps.length) : move(1)}>{complete ? <><RotateCcw size={15} />重播</> : <>下一步<ChevronRight size={16} /></>}</button>
  </footer>
}

function VariantSwitcher({ variant, onChange }: { variant: Variant; onChange: (variant: Variant) => void }) {
  const index = variants.findIndex((item) => item.id === variant)
  const change = (offset: number) => onChange(variants[(index + offset + variants.length) % variants.length]!.id)
  return <nav className="prototype-variant-switcher" aria-label="切换原型方案">
    <button title="上一种方案" onClick={() => change(-1)}><ArrowLeft size={16} /></button>
    <span><small>原型方案</small><strong>{variants[index]!.label}</strong></span>
    <button title="下一种方案" onClick={() => change(1)}><ArrowRight size={16} /></button>
  </nav>
}
