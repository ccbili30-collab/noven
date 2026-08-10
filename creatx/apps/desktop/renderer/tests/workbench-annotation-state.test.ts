import { describe, expect, test } from "bun:test"
import { appendAnnotationPoint, beginAnnotation, clearAnnotations, createAnnotationDraft, finishAnnotation, redoAnnotation, undoAnnotation } from "../src/workbench-annotation-state"

describe("workbench annotation draft", () => {
  test("commits normalized rectangles and replays them at another canvas size", () => {
    const started = beginAnnotation(createAnnotationDraft("project:file:1"), "rectangle", { x: 50, y: 25 }, { width: 200, height: 100 }, "#FF0066", 5)
    const finished = finishAnnotation(appendAnnotationPoint(started, { x: 175, y: 80 }, { width: 200, height: 100 }))

    expect(finished.commands).toEqual([{ kind: "rectangle", color: "#FF0066", width: 5, start: { x: 0.25, y: 0.25 }, end: { x: 0.875, y: 0.8 } }])
    expect(finished.dirty).toBe(true)
  })

  test("bounds freehand sampling and supports undo redo and undoable clear", () => {
    const draft = createAnnotationDraft("project:file:2")
    const first = finishAnnotation(appendAnnotationPoint(beginAnnotation(draft, "pen", { x: 0, y: 0 }, { width: 100, height: 100 }, "#112233", 2), { x: 100, y: 100 }, { width: 100, height: 100 }))
    const second = finishAnnotation(appendAnnotationPoint(beginAnnotation(first, "pen", { x: 10, y: 10 }, { width: 100, height: 100 }, "#445566", 9), { x: 20, y: 30 }, { width: 100, height: 100 }))

    expect(second.commands).toHaveLength(2)
    expect(undoAnnotation(second).commands).toHaveLength(1)
    expect(redoAnnotation(undoAnnotation(second)).commands).toHaveLength(2)
    const cleared = clearAnnotations(second)
    expect(cleared.commands).toEqual([])
    expect(undoAnnotation(cleared).commands).toHaveLength(2)
  })

  test("rejects invalid tools, colors, widths and canvas geometry", () => {
    const draft = createAnnotationDraft("project:file:3")
    expect(() => beginAnnotation(draft, "pen", { x: 0, y: 0 }, { width: 0, height: 10 }, "#000000", 2)).toThrow("workbench_annotation_invalid")
    expect(() => beginAnnotation(draft, "pen", { x: 0, y: 0 }, { width: 10, height: 10 }, "red", 2)).toThrow("workbench_annotation_invalid")
    expect(() => beginAnnotation(draft, "pen", { x: 0, y: 0 }, { width: 10, height: 10 }, "#000000", 4 as never)).toThrow("workbench_annotation_invalid")
  })
})
