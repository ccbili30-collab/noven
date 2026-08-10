export type AnnotationTool = "rectangle" | "pen"
export type AnnotationWidth = 2 | 5 | 9

export interface AnnotationPoint {
  x: number
  y: number
}

export interface RectangleAnnotation {
  kind: "rectangle"
  color: string
  width: AnnotationWidth
  start: AnnotationPoint
  end: AnnotationPoint
}

export interface PenAnnotation {
  kind: "pen"
  color: string
  width: AnnotationWidth
  points: AnnotationPoint[]
}

export type AnnotationCommand = RectangleAnnotation | PenAnnotation

interface ActiveRectangleAnnotation {
  kind: "rectangle"
  color: string
  width: AnnotationWidth
  start: AnnotationPoint
  end: AnnotationPoint
}

interface ActivePenAnnotation {
  kind: "pen"
  color: string
  width: AnnotationWidth
  points: AnnotationPoint[]
}

type ActiveAnnotation = ActiveRectangleAnnotation | ActivePenAnnotation

export interface AnnotationDraft {
  sourceId: string
  commands: AnnotationCommand[]
  undo: AnnotationCommand[][]
  redo: AnnotationCommand[][]
  active?: ActiveAnnotation | undefined
  dirty: boolean
}

const MAX_COMMANDS = 500
const MAX_PEN_POINTS = 4_096
const HEX_COLOR = /^#[0-9A-F]{6}$/

export function createAnnotationDraft(sourceId: string): AnnotationDraft {
  if (!sourceId.trim()) throw invalid("source")
  return { sourceId, commands: [], undo: [], redo: [], dirty: false }
}

export function beginAnnotation(
  draft: AnnotationDraft,
  tool: AnnotationTool,
  point: AnnotationPoint,
  canvas: { width: number; height: number },
  color: string,
  width: AnnotationWidth,
): AnnotationDraft {
  if (draft.active || !isTool(tool) || !HEX_COLOR.test(color) || !isWidth(width)) throw invalid("style")
  const normalized = normalizePoint(point, canvas)
  const active = tool === "rectangle"
    ? { kind: tool, color, width, start: normalized, end: normalized }
    : { kind: tool, color, width, points: [normalized] }
  return { ...draft, active }
}

export function appendAnnotationPoint(
  draft: AnnotationDraft,
  point: AnnotationPoint,
  canvas: { width: number; height: number },
): AnnotationDraft {
  if (!draft.active) throw invalid("inactive")
  const normalized = normalizePoint(point, canvas)
  if (draft.active.kind === "rectangle") return { ...draft, active: { ...draft.active, end: normalized } }
  if (draft.active.points.length >= MAX_PEN_POINTS) return draft
  return { ...draft, active: { ...draft.active, points: [...draft.active.points, normalized] } }
}

export function finishAnnotation(draft: AnnotationDraft): AnnotationDraft {
  if (!draft.active) throw invalid("inactive")
  if (draft.commands.length >= MAX_COMMANDS) throw invalid("command_limit")
  const command = draft.active.kind === "rectangle"
    ? { ...draft.active }
    : { ...draft.active, points: [...draft.active.points] }
  return {
    ...draft,
    commands: [...draft.commands, command],
    undo: [...draft.undo, draft.commands],
    redo: [],
    active: undefined,
    dirty: true,
  }
}

export function undoAnnotation(draft: AnnotationDraft): AnnotationDraft {
  if (draft.active || draft.undo.length === 0) return draft
  const commands = draft.undo.at(-1) ?? []
  return {
    ...draft,
    commands,
    undo: draft.undo.slice(0, -1),
    redo: [...draft.redo, draft.commands],
    dirty: commands.length > 0,
  }
}

export function redoAnnotation(draft: AnnotationDraft): AnnotationDraft {
  if (draft.active || draft.redo.length === 0) return draft
  const commands = draft.redo.at(-1) ?? []
  return {
    ...draft,
    commands,
    undo: [...draft.undo, draft.commands],
    redo: draft.redo.slice(0, -1),
    dirty: commands.length > 0,
  }
}

export function clearAnnotations(draft: AnnotationDraft): AnnotationDraft {
  if (draft.active || draft.commands.length === 0) return draft
  return {
    ...draft,
    commands: [],
    undo: [...draft.undo, draft.commands],
    redo: [],
    dirty: false,
  }
}

function normalizePoint(point: AnnotationPoint, canvas: { width: number; height: number }) {
  if (![point.x, point.y, canvas.width, canvas.height].every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0) {
    throw invalid("geometry")
  }
  return {
    x: Math.min(1, Math.max(0, point.x / canvas.width)),
    y: Math.min(1, Math.max(0, point.y / canvas.height)),
  }
}

function isTool(tool: string): tool is AnnotationTool {
  return tool === "rectangle" || tool === "pen"
}

function isWidth(width: number): width is AnnotationWidth {
  return width === 2 || width === 5 || width === 9
}

function invalid(reason: string) {
  return new Error(`workbench_annotation_invalid: ${reason}`)
}
