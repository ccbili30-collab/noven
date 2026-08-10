import { describe, expect, test } from "bun:test"
import type { WorkbenchEntry } from "@creatx/contracts"
import { visibleWorkbenchEntries, workbenchEntryKey } from "../src/WorkbenchResourceTree"

const entries: WorkbenchEntry[] = [
  { kind: "directory", name: "地图源", relativePath: "地图源" },
  { kind: "directory", name: "脚本", relativePath: "地图源/脚本" },
  { kind: "file", name: "生成掩码.mjs", relativePath: "地图源/脚本/生成掩码.mjs", fileId: "mask" },
  { kind: "file", name: "总览.md", relativePath: "总览.md", fileId: "summary" },
]

describe("workbench resource tree", () => {
  test("normalizes directory identities without mixing workbenches", () => {
    expect(workbenchEntryKey("files", "地图源\\脚本")).toBe("files:地图源/脚本")
    expect(workbenchEntryKey("world", "地图源\\脚本")).toBe("world:地图源/脚本")
  })

  test("collapses only descendants and restores them without changing entries", () => {
    expect(visibleWorkbenchEntries(entries, "files", new Set(["files:地图源"])).map((entry) => entry.relativePath)).toEqual(["地图源", "总览.md"])
    expect(visibleWorkbenchEntries(entries, "files", new Set()).map((entry) => entry.relativePath)).toEqual(entries.map((entry) => entry.relativePath))
  })

  test("keeps another workbench's directory state independent", () => {
    expect(visibleWorkbenchEntries(entries, "world", new Set(["files:地图源"]))).toEqual(entries)
  })
})
