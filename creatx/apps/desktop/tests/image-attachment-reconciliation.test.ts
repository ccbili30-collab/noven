import { expect, test } from "bun:test"
import { reportableImageAttachmentFailures } from "../src/image-attachment-reconciliation"

test("silences only attachment position conflicts during project reconciliation", () => {
  const unavailable = { imageTaskId: "image-2", artifactPath: "世界/第二篇.md", error: "image_attachment_unavailable: attachment service is not configured" }
  expect(reportableImageAttachmentFailures([
    { imageTaskId: "image-1", artifactPath: "世界/第一篇.md", error: "image_attachment_conflict: expected one exact heading anchor, found 0" },
    unavailable,
  ])).toEqual([unavailable])
})
