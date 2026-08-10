import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { TimelineItem } from "@creatx/contracts"
import { ProcessingDisclosure, workspaceIsProcessing } from "../src/WorkspaceShell"

const detailText = "只在展开后挂载的内部明细"
const detail: TimelineItem = {
  sequence: 1,
  itemId: "worker-detail",
  kind: "notice",
  presentation: "internal",
  state: "completed",
  text: detailText,
}

test("does not mount completed processing details while collapsed", () => {
  const html = renderToStaticMarkup(<ProcessingDisclosure items={[detail]} active={false} project={undefined} onOpenAttachment={() => undefined} />)

  expect(html).not.toContain(detailText)
  expect(html).toContain("已处理")
})

test("mounts processing details while the turn is active", () => {
  const html = renderToStaticMarkup(<ProcessingDisclosure items={[detail]} active project={undefined} onOpenAttachment={() => undefined} />)

  expect(html).toContain(detailText)
  expect(html).toContain("正在处理")
})

test("does not activate processing for a completed session and completed Growth goal", () => {
  expect(workspaceIsProcessing("completed", "completed")).toBe(false)
  expect(workspaceIsProcessing("idle", "completed")).toBe(false)
})
