import { describe, expect, test } from "bun:test"
import { buildWorkbenchExhibition } from "../src/workbench-exhibition"

describe("workbench exhibition", () => {
  test("groups real documents and images without exposing machine json", () => {
    const result = buildWorkbenchExhibition([
      { kind: "directory", name: "角色", relativePath: "世界/角色" },
      { kind: "file", name: "主角.md", relativePath: "世界/角色/主角.md", fileId: "character" },
      { kind: "file", name: "主角.png", relativePath: "世界/角色/主角.png", fileId: "portrait" },
      { kind: "file", name: "state.json", relativePath: "世界/state.json", fileId: "machine" },
    ])
    expect(result.documents.map((item) => item.fileId)).toEqual(["character"])
    expect(result.images.map((item) => item.fileId)).toEqual(["portrait"])
    expect(result.groups).toEqual(["角色"])
  })
})
