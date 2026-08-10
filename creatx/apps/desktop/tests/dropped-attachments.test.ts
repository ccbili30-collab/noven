import { describe, expect, test } from "bun:test"
import { droppedAttachmentPaths } from "../src/dropped-attachments"

describe("dropped attachment path bridge", () => {
  test("resolves real files inside Preload and removes duplicate operating-system paths", () => {
    const first = new File(["one"], "一.md")
    const second = new File(["two"], "二.txt")
    const paths = new Map<File, string>([[first, "C:\\资料\\一.md"], [second, "C:\\资料\\二.txt"]])

    expect(droppedAttachmentPaths([first, second, first], (file) => paths.get(file) ?? "")).toEqual([
      "C:\\资料\\一.md",
      "C:\\资料\\二.txt",
    ])
  })

  test("fails closed for empty, forged and over-limit batches", () => {
    const file = new File(["one"], "一.md")
    expect(() => droppedAttachmentPaths([], () => "C:\\资料\\一.md")).toThrow("attachment_invalid")
    expect(() => droppedAttachmentPaths([file], () => "")).toThrow("attachment_invalid")
    expect(() => droppedAttachmentPaths([file], () => { throw new TypeError("not a real File") })).toThrow("attachment_invalid")
    expect(() => droppedAttachmentPaths(Array.from({ length: 21 }, () => file), () => "C:\\资料\\一.md")).toThrow("attachment_invalid")
  })
})
