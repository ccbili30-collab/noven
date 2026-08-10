import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Check, ChevronDown, Plus, Sparkles, X } from "lucide-react"
import { QUEUEABLE_CREATIVE_SKILLS } from "@creatx/creative-skills/skill-sequence"
import type { SkillSequenceSlot } from "./skill-sequence-preferences"

interface SkillSequenceControlProps {
  slots: readonly SkillSequenceSlot[]
  armed: boolean
  disabled: boolean
  onChange: (slots: SkillSequenceSlot[]) => void
  onArmedChange: (armed: boolean) => void
}

export function SkillSequenceControl(props: SkillSequenceControlProps) {
  const [open, setOpen] = useState(false)
  const basketRef = useRef<HTMLDivElement>(null)
  const enabledCount = props.slots.filter((slot) => slot.enabled).length
  const addSlot = () => {
    const skill = QUEUEABLE_CREATIVE_SKILLS[0]
    if (skill) props.onChange([...props.slots, { skillName: skill.name, enabled: true }])
  }
  const changeSlot = (index: number, update: Partial<SkillSequenceSlot>) => props.onChange(props.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...update } : slot))
  const moveSlot = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= props.slots.length) return
    const next = props.slots.map((slot) => ({ ...slot }))
    const slot = next[index]!
    next[index] = next[target]!
    next[target] = slot
    props.onChange(next)
  }
  useEffect(() => {
    if (!open) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!basketRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnPointerDown)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return <div className="wb-skill-basket" ref={basketRef}>
    <button className={`wb-skill-basket-arm ${props.armed ? "is-armed" : ""}`} type="button" role="checkbox" aria-checked={props.armed} aria-label={props.armed ? "取消本次发送的 Skill 挂篮" : "启用下一次发送的 Skill 挂篮"} title={props.armed ? "已启用：发送后自动取消" : "启用下一次发送"} disabled={props.disabled || enabledCount === 0} onClick={() => props.onArmedChange(!props.armed)}>{props.armed && <Check size={8} />}</button>
    <button className={`wb-skill-basket-trigger ${open ? "is-open" : ""} ${enabledCount ? "has-enabled" : ""}`} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)}>
      <Sparkles size={12} /><span>Skill</span>{props.slots.length > 0 && <em>{enabledCount}/{props.slots.length}</em>}<ChevronDown size={11} />
    </button>
    {open && <section className="wb-skill-basket-panel" aria-label="Skill 挂篮">
      <header><span>按顺序执行</span><button type="button" title="新建 Skill 槽位" aria-label="添加 Skill" disabled={props.disabled || props.slots.length >= 12} onClick={addSlot}><Plus size={13} /></button></header>
      {props.slots.length === 0 ? <button className="wb-skill-basket-empty" type="button" disabled={props.disabled} onClick={addSlot}><Plus size={13} />添加插槽</button> : <ol>
        {props.slots.map((slot, index) => <li key={`${slot.skillName}-${index}`} className={slot.enabled ? "is-enabled" : ""}>
          <button className="wb-skill-slot-toggle" type="button" role="checkbox" aria-checked={slot.enabled} aria-label={`${slot.enabled ? "取消选择" : "选择"}第 ${index + 1} 个 Skill`} disabled={props.disabled} onClick={() => changeSlot(index, { enabled: !slot.enabled })}>{slot.enabled && <Check size={11} />}</button>
          <span>{index + 1}</span>
          <select value={slot.skillName} aria-label={`第 ${index + 1} 个 Skill`} disabled={props.disabled} onChange={(event) => changeSlot(index, { skillName: event.target.value })}>
            {QUEUEABLE_CREATIVE_SKILLS.map((skill) => <option key={skill.name} value={skill.name}>{skill.title}</option>)}
          </select>
          <button type="button" title="上移" aria-label={`上移第 ${index + 1} 个 Skill`} disabled={props.disabled || index === 0} onClick={() => moveSlot(index, -1)}><ArrowUp size={12} /></button>
          <button type="button" title="下移" aria-label={`下移第 ${index + 1} 个 Skill`} disabled={props.disabled || index === props.slots.length - 1} onClick={() => moveSlot(index, 1)}><ArrowDown size={12} /></button>
          <button type="button" title="移除" aria-label={`移除第 ${index + 1} 个 Skill`} disabled={props.disabled} onClick={() => props.onChange(props.slots.filter((_, slotIndex) => slotIndex !== index))}><X size={12} /></button>
        </li>)}
      </ol>}
      <footer>{!enabledCount ? "未选择执行项" : props.armed ? `已启用，下次发送执行 ${enabledCount} 项` : "勾选挂签旁按钮后执行"}</footer>
    </section>}
  </div>
}
