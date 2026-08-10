import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ProjectSnapshot } from "@creatx/contracts"
import { findProjectImage, MessageMarkdown, normalizeProjectImageSource, resolveProjectFileReference, resolveProjectImagePreview } from "../src/MessageMarkdown"

const project: ProjectSnapshot = {
  id: "project-1",
  name: "测试项目",
  displayPath: "D:\\测试项目",
  refreshedAt: "2026-07-29T00:00:00.000Z",
  files: [
    { id: "image-1", relativePath: "研究/风格 实验.png", name: "风格 实验.png", kind: "image", size: 1, modifiedAt: "2026-07-29T00:00:00.000Z" },
    { id: "novel-1", relativePath: "小说/正文.md", name: "正文.md", kind: "markdown", size: 1, modifiedAt: "2026-07-29T00:00:00.000Z" },
  ],
}

describe("conversation Markdown", () => {
  test("renders GFM structure without executing raw HTML", () => {
    const html = renderToStaticMarkup(<MessageMarkdown project={project} text={"## 标题\n\n**重点**\n\n- 一\n- 二\n\n| 项 | 值 |\n| --- | --- |\n| A | B |\n\n<script>window.bad = true</script>"} />)

    expect(html).toContain('<h2 data-markdown-heading="标题">标题</h2>')
    expect(html).toContain("<strong>重点</strong>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<table>")
    expect(html).not.toContain("<script>")
  })

  test("resolves only current-project relative images", () => {
    expect(normalizeProjectImageSource("%E7%A0%94%E7%A9%B6/%E9%A3%8E%E6%A0%BC%20%E5%AE%9E%E9%AA%8C.png")).toBe("研究/风格 实验.png")
    expect(findProjectImage(project, "./研究/风格%20实验.png")?.id).toBe("image-1")
    expect(findProjectImage(project, "../研究/风格%20实验.png", "小说/第一章.md")?.id).toBe("image-1")
    expect(normalizeProjectImageSource("../../../秘密.png", "小说/第一章.md")).toBeUndefined()
    expect(normalizeProjectImageSource("../秘密.png")).toBeUndefined()
    expect(normalizeProjectImageSource("C:/秘密.png")).toBeUndefined()
    expect(normalizeProjectImageSource("file:///C:/秘密.png")).toBeUndefined()
    expect(normalizeProjectImageSource("https://example.com/tracker.png")).toBeUndefined()
    expect(normalizeProjectImageSource("data:image/png;base64,AAAA")).toBeUndefined()
  })

  test("keeps the project image renderer mounted while streaming text grows", () => {
    const first = MessageMarkdown({ project, text: "![风格实验](研究/风格%20实验.png)" })
    const next = MessageMarkdown({ project, text: "![风格实验](研究/风格%20实验.png)\n\n继续生成正文" })

    expect(first.props.children.props.children.props.components.img).toBe(next.props.children.props.children.props.components.img)
  })

  test("prefers a stable project protocol URL over a legacy Base64 payload", () => {
    expect(resolveProjectImagePreview({ assetUrl: "creatx-workbench://token/image.png", dataUrl: "data:image/png;base64,AAAA" })).toBe("creatx-workbench://token/image.png")
    expect(resolveProjectImagePreview({ dataUrl: "data:image/png;base64,AAAA" })).toBe("data:image/png;base64,AAAA")
  })

  test("resolves current-project file links and decoded heading anchors", () => {
    expect(resolveProjectFileReference(project, "../小说/正文.md#%E7%AC%AC%E4%B8%89%E7%AB%A0", "研究/笔记.md")).toEqual({
      file: project.files[1]!,
      heading: "第三章",
    })
    expect(resolveProjectFileReference(project, "小说/正文.md")).toEqual({ file: project.files[1]!, heading: undefined })
  })

  test("fails closed for external, absolute, traversing, queried and missing file links", () => {
    expect(resolveProjectFileReference(project, "https://example.com/正文.md")).toBeUndefined()
    expect(resolveProjectFileReference(project, "file:///D:/小说/正文.md")).toBeUndefined()
    expect(resolveProjectFileReference(project, "D:/小说/正文.md")).toBeUndefined()
    expect(resolveProjectFileReference(project, "../../../正文.md", "研究/笔记.md")).toBeUndefined()
    expect(resolveProjectFileReference(project, "小说/正文.md?download=1")).toBeUndefined()
    expect(resolveProjectFileReference(project, "小说/不存在.md")).toBeUndefined()
  })

  test("renders resolved project links as keyboard-reachable controls", () => {
    const html = renderToStaticMarkup(<MessageMarkdown project={project} text="[查看第三章](小说/正文.md#第三章)" onOpenProjectFile={() => undefined} />)

    expect(html).toContain("<a href=")
    expect(html).not.toContain('aria-disabled="true"')
  })
})
