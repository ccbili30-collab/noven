import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { SessionSummary } from "@creatx/contracts"
import { ShareDialog } from "../src/CreativeLibraryActions"

test("renders a closeable searchable dialog with a bounded session window", () => {
  const sessions: SessionSummary[] = Array.from({ length: 917 }, (_, index) => ({
    id: `session-${index}`,
    title: `创作（${index + 1}）`,
    projectId: `project-${index}`,
    displayPath: `D:\\项目\\${index + 1}`,
    status: "ready",
    startedAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    providerId: "test",
    modelId: "test",
    kind: "project",
    permission: { mode: "approval", projectTools: true, trustWarning: "test" },
  }))
  const html = renderToStaticMarkup(<ShareDialog sessions={sessions} onClose={() => undefined} onShare={async () => true} />)

  expect(html).toContain("搜索会话名称或项目路径")
  expect(html).toContain('<button type="button" title="关闭">')
  expect(html.match(/wb-library-share-row/g)?.length).toBe(10)
  expect(html).not.toContain("创作（917）")
})
