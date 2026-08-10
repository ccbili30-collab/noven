import { describe, expect, test } from "bun:test"
import type { AttachmentReference } from "@creatx/contracts"
import { appendAttachmentSelection } from "../src/attachment-selection"

const attachment = (id: string): AttachmentReference => ({ id, name: `${id}.md`, displayPath: `${id}.md`, size: 1, modifiedAt: "2026-08-09T00:00:00.000Z", kind: "file" })

describe("attachment selection", () => {
  test("appends authorized files without exceeding the shared twenty-item limit", () => {
    expect(appendAttachmentSelection([attachment("a")], [attachment("b")]).map((item) => item.id)).toEqual(["a", "b"])
    expect(() => appendAttachmentSelection(Array.from({ length: 20 }, (_, index) => attachment(`a-${index}`)), [attachment("overflow")])).toThrow("attachment_invalid")
  })

  test("does not duplicate the same authorization token", () => {
    expect(appendAttachmentSelection([attachment("a")], [attachment("a"), attachment("b")]).map((item) => item.id)).toEqual(["a", "b"])
  })
})
