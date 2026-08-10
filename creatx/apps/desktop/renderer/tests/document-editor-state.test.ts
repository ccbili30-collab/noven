import { describe, expect, test } from "bun:test"
import { editDocument, openDocument, redoDocument, saveDocument, undoDocument } from "../src/document-editor-state"
import { runAfterEditorSave } from "../src/WorkspaceShell"

describe("document editor state", () => {
  test("runs navigation synchronously when the editor has nothing to save", () => {
    const order: string[] = []

    runAfterEditorSave(true, () => order.push("navigate"))
    order.push("returned")

    expect(order).toEqual(["navigate", "returned"])
  })

  test("waits for a dirty editor save and blocks navigation on failure", async () => {
    let release: (saved: boolean) => void = () => undefined
    const saved = new Promise<boolean>((resolve) => { release = resolve })
    const order: string[] = []

    runAfterEditorSave(saved, () => order.push("navigate"))
    order.push("waiting")
    release(false)
    await saved
    await Promise.resolve()

    expect(order).toEqual(["waiting"])
  })

  test("keeps a dirty draft until the exact file version is saved", () => {
    const opened = openDocument({ fileId: "file-1", content: "first", modifiedAt: "v1" })
    const edited = editDocument(opened, "second")
    expect(edited.dirty).toBe(true)
    expect(saveDocument(edited, "v2")).toEqual({ fileId: "file-1", content: "second", baseline: "second", modifiedAt: "v2", dirty: false, undoStack: [], redoStack: [] })
  })

  test("undoes and redoes draft edits without changing the saved baseline", () => {
    const opened = openDocument({ fileId: "file-1", content: "first", modifiedAt: "v1" })
    const edited = editDocument(editDocument(opened, "second"), "third")
    const undone = undoDocument(edited)

    expect(undone.content).toBe("second")
    expect(undone.dirty).toBe(true)
    expect(redoDocument(undone).content).toBe("third")
    expect(undoDocument(undoDocument(edited))).toMatchObject({ content: "first", dirty: false })
  })

  test("clears redo history after a new edit and bounds draft history", () => {
    const opened = openDocument({ fileId: "file-1", content: "0", modifiedAt: "v1" })
    const edited = Array.from({ length: 105 }, (_, index) => String(index + 1)).reduce(editDocument, opened)
    const replacement = editDocument(undoDocument(edited), "replacement")

    expect(edited.undoStack).toHaveLength(100)
    expect(replacement.redoStack).toEqual([])
  })
})
