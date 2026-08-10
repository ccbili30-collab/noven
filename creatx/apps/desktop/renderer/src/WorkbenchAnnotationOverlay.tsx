import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"
import { createPortal } from "react-dom"
import { Check, Eraser, MousePointer2, Palette, PenLine, Redo2, Square, Undo2, X } from "lucide-react"
import type { AttachmentReference } from "@creatx/contracts"
import { appendAnnotationPoint, beginAnnotation, clearAnnotations, createAnnotationDraft, finishAnnotation, redoAnnotation, undoAnnotation, type AnnotationDraft, type AnnotationTool, type AnnotationWidth } from "./workbench-annotation-state"
import { WorkbenchColorPicker } from "./WorkbenchColorPicker"

export function WorkbenchAnnotationOverlay({ projectId, sourceId, sourceName, canAttach, onAttachment, onDirty, onExit }: { projectId: string; sourceId: string; sourceName: string; canAttach: boolean; onAttachment: (attachment: AttachmentReference) => void; onDirty: (dirty: boolean) => void; onExit: () => void }) {
  const [draft, setDraft] = useState(() => createAnnotationDraft(`${projectId}:${sourceId}`))
  const draftRef = useRef(draft)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>()
  const [tool, setTool] = useState<AnnotationTool>("pen")
  const [width, setWidth] = useState<AnnotationWidth>(5)
  const [color, setColor] = useState("#FF3B30")
  const [recent, setRecent] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sampling, setSampling] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string>()

  const updateDraft = (next: AnnotationDraft) => {
    draftRef.current = next
    setDraft(next)
  }
  useEffect(() => onDirty(draft.dirty), [draft.dirty, onDirty])
  useLayoutEffect(() => {
    const surface = anchorRef.current?.closest<HTMLElement>(".wb-map-canvas")
    if (!surface) return
    const update = () => {
      const rect = surface.getBoundingClientRect()
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(surface)
    surface.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      surface.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => drawAnnotations(canvas, draft)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draft])

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { point: { x: event.clientX - rect.left, y: event.clientY - rect.top }, canvas: { width: rect.width, height: rect.height } }
  }
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (sampling) { void sample(event); return }
    event.currentTarget.setPointerCapture(event.pointerId)
    const location = point(event)
    updateDraft(beginAnnotation(draftRef.current, tool, location.point, location.canvas, color, width))
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current.active || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const location = point(event)
    updateDraft(appendAnnotationPoint(draftRef.current, location.point, location.canvas))
  }
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current.active) return
    const location = point(event)
    updateDraft(finishAnnotation(appendAnnotationPoint(draftRef.current, location.point, location.canvas)))
    setRecent((current) => [color, ...current.filter((item) => item !== color)].slice(0, 8))
  }
  const sample = async (event: PointerEvent<HTMLCanvasElement>) => {
    const location = point(event)
    setCapturing(true)
    await nextPaint()
    const result = await window.creatx.sampleWorkbenchColor({ projectId, sourceId, x: location.point.x / location.canvas.width, y: location.point.y / location.canvas.height })
    setCapturing(false)
    setSampling(false)
    if (!result.ok) { setError(result.error.detail ?? result.error.message); return }
    const sampled = await centerPixel(result.value)
    setColor(sampled)
    setRecent((current) => [sampled, ...current.filter((item) => item !== sampled)].slice(0, 8))
  }
  const attach = async () => {
    if (!draftRef.current.commands.length || !canAttach) return
    setError(undefined)
    setCapturing(true)
    await nextPaint()
    const result = await window.creatx.captureWorkbenchAnnotation({ projectId, sourceId, name: `${sourceName.replace(/\.[^.]+$/, "")}-批注.png` })
    setCapturing(false)
    if (!result.ok) { setError(result.error.detail ?? result.error.message); return }
    onAttachment(result.value)
    onDirty(false)
    onExit()
  }
  const exit = () => {
    if (draftRef.current.dirty && !window.confirm("当前批注还没有加入对话，确定丢弃吗？")) return
    onDirty(false)
    onExit()
  }

  const layer = bounds && <div className={`wb-annotation-layer ${capturing ? "is-capturing" : ""} ${sampling ? "is-sampling" : ""}`} style={bounds}>
    <canvas ref={canvasRef} aria-label="视觉批注蒙版" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
    <div className="wb-annotation-controls" role="toolbar" aria-label="视觉批注工具">
      <button className={tool === "rectangle" ? "is-active" : ""} title="矩形框" onClick={() => setTool("rectangle")}><Square size={15} /></button>
      <button className={tool === "pen" ? "is-active" : ""} title="自由画笔" onClick={() => setTool("pen")}><PenLine size={15} /></button>
      <div className="wb-annotation-widths">{([2, 5, 9] as const).map((value) => <button key={value} className={width === value ? "is-active" : ""} title={`${value}px`} onClick={() => setWidth(value)}><i style={{ width: value, height: value }} /></button>)}</div>
      <div className="wb-annotation-picker-anchor"><button title="选择颜色" onClick={() => setPickerOpen((open) => !open)}><Palette size={15} /><i className="wb-current-color" style={{ backgroundColor: color }} /></button>{pickerOpen && <WorkbenchColorPicker color={color} recent={recent} onColor={setColor} onSample={() => { setPickerOpen(false); setSampling(true) }} />}</div>
      <button title="撤销" disabled={!draft.undo.length} onClick={() => updateDraft(undoAnnotation(draftRef.current))}><Undo2 size={15} /></button>
      <button title="重做" disabled={!draft.redo.length} onClick={() => updateDraft(redoAnnotation(draftRef.current))}><Redo2 size={15} /></button>
      <button title="清空批注" disabled={!draft.commands.length} onClick={() => updateDraft(clearAnnotations(draftRef.current))}><Eraser size={15} /></button>
      <span className="wb-annotation-spacer" />
      {sampling && <span className="wb-annotation-hint"><MousePointer2 size={14} />点击作品取色</span>}
      <button className="wb-annotation-attach" title={canAttach ? "作为待发送图片加入对话" : "当前对话附件已达上限"} disabled={!draft.commands.length || !canAttach || capturing} onClick={() => void attach()}><Check size={15} />加入对话</button>
      <button title="退出批注" onClick={exit}><X size={15} /></button>
    </div>
    {error && <div className="wb-annotation-error">{error}</div>}
  </div>
  return <><span ref={anchorRef} hidden />{layer ? createPortal(layer, document.body) : undefined}</>
}

function drawAnnotations(canvas: HTMLCanvasElement, draft: AnnotationDraft) {
  const rect = canvas.getBoundingClientRect()
  const scale = window.devicePixelRatio
  const width = Math.max(1, Math.round(rect.width * scale))
  const height = Math.max(1, Math.round(rect.height * scale))
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
  const context = canvas.getContext("2d")
  if (!context) return
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)
  const commands = draft.active ? [...draft.commands, draft.active] : draft.commands
  commands.forEach((command) => {
    context.strokeStyle = command.color
    context.lineWidth = command.width
    context.lineCap = "round"
    context.lineJoin = "round"
    if (command.kind === "rectangle") {
      context.strokeRect(command.start.x * rect.width, command.start.y * rect.height, (command.end.x - command.start.x) * rect.width, (command.end.y - command.start.y) * rect.height)
      return
    }
    context.beginPath()
    command.points.forEach((point, index) => index === 0 ? context.moveTo(point.x * rect.width, point.y * rect.height) : context.lineTo(point.x * rect.width, point.y * rect.height))
    context.stroke()
  })
}

async function nextPaint() {
  await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())))
}

async function centerPixel(dataUrl: string) {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("workbench_capture_unavailable: color sampling canvas is unavailable")
  context.drawImage(image, 0, 0)
  const pixel = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
  return `#${[pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0].map((channel) => channel.toString(16).padStart(2, "0")).join("").toLocaleUpperCase("en-US")}`
}
