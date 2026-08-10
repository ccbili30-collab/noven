import { createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ProjectFile, ProjectSnapshot } from "@creatx/contracts"

export function MessageMarkdown({ text, project, documentPath, onOpenProjectFile, scrollToHeading, scrollRequestId, onScrollToHeading }: { text: string; project: ProjectSnapshot | undefined; documentPath?: string; onOpenProjectFile?: ((file: ProjectFile, heading?: string) => void) | undefined; scrollToHeading?: string; scrollRequestId?: number; onScrollToHeading?: (() => void) | undefined }) {
  return <ProjectMarkdownContext value={{ project, documentPath, onOpenProjectFile, scrollToHeading, scrollRequestId, onScrollToHeading }}><div className="message-markdown"><ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={markdownComponents}
    >{text}</ReactMarkdown></div></ProjectMarkdownContext>
}

const ProjectMarkdownContext = createContext<{ project: ProjectSnapshot | undefined; documentPath: string | undefined; onOpenProjectFile: ((file: ProjectFile, heading?: string) => void) | undefined; scrollToHeading: string | undefined; scrollRequestId: number | undefined; onScrollToHeading: (() => void) | undefined }>({ project: undefined, documentPath: undefined, onOpenProjectFile: undefined, scrollToHeading: undefined, scrollRequestId: undefined, onScrollToHeading: undefined })

const markdownComponents: Components = {
  a: ({ children, href }) => <ContextProjectMarkdownLink href={href}>{children}</ContextProjectMarkdownLink>,
  img: ({ alt, src }) => <ContextProjectMarkdownImage alt={alt ?? "项目图片"} source={src} />,
  h1: ({ children }) => <ContextHeading level={1}>{children}</ContextHeading>,
  h2: ({ children }) => <ContextHeading level={2}>{children}</ContextHeading>,
  h3: ({ children }) => <ContextHeading level={3}>{children}</ContextHeading>,
  h4: ({ children }) => <ContextHeading level={4}>{children}</ContextHeading>,
}

function ContextHeading({ children, level }: { children: ReactNode; level: 1 | 2 | 3 | 4 }) {
  const context = useContext(ProjectMarkdownContext)
  const element = useRef<HTMLHeadingElement>(null)
  const heading = normalizeHeadingText(children)
  useLayoutEffect(() => {
    if (!context.scrollToHeading || heading !== normalizeHeading(context.scrollToHeading)) return
    const firstMatch = Array.from(element.current?.closest(".message-markdown")?.querySelectorAll<HTMLElement>("[data-markdown-heading]") ?? []).find((candidate) => candidate.dataset.markdownHeading === heading)
    if (firstMatch !== element.current) return
    firstMatch.scrollIntoView({ block: "start" })
    context.onScrollToHeading?.()
  }, [context.scrollRequestId, context.scrollToHeading, heading])
  if (level === 1) return <h1 ref={element} data-markdown-heading={heading}>{children}</h1>
  if (level === 2) return <h2 ref={element} data-markdown-heading={heading}>{children}</h2>
  if (level === 3) return <h3 ref={element} data-markdown-heading={heading}>{children}</h3>
  return <h4 ref={element} data-markdown-heading={heading}>{children}</h4>
}

function ContextProjectMarkdownLink({ children, href }: { children: ReactNode; href: string | undefined }) {
  const context = useContext(ProjectMarkdownContext)
  const reference = resolveProjectFileReference(context.project, href, context.documentPath)
  const enabled = reference && context.onOpenProjectFile
  return <a href={href} title={href} aria-disabled={enabled ? undefined : true} onClick={(event) => {
    event.preventDefault()
    if (enabled) enabled(reference.file, reference.heading)
  }}>{children}</a>
}

function ContextProjectMarkdownImage({ alt, source }: { alt: string; source: string | undefined }) {
  const context = useContext(ProjectMarkdownContext)
  return <ProjectMarkdownImage alt={alt} source={source} project={context.project} documentPath={context.documentPath} onOpenProjectFile={context.onOpenProjectFile} />
}

function ProjectMarkdownImage({ alt, source, project, documentPath, onOpenProjectFile }: { alt: string; source: string | undefined; project: ProjectSnapshot | undefined; documentPath: string | undefined; onOpenProjectFile: ((file: ProjectFile) => void) | undefined }) {
  const file = findProjectImage(project, source, documentPath)
  const [dataUrl, setDataUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [layout, setLayout] = useState<"float" | "wide">("float")

  useEffect(() => {
    setDataUrl(undefined)
    setFailed(false)
    setLayout("float")
    if (!project || !file) return
    let active = true
    void window.creatx.readFile(project.id, file.id).then((result) => {
      if (!active) return
      const resolved = result.ok ? resolveProjectImagePreview(result.value) : undefined
      if (!resolved) {
        setFailed(true)
        return
      }
      setDataUrl(resolved)
    })
    return () => { active = false }
  }, [project?.id, file?.id, file?.modifiedAt])

  if (!file || failed) return <span className="markdown-image-unavailable" role="img" aria-label={alt}>无法显示项目图片：{alt}</span>
  if (!dataUrl) return <span className="markdown-image-loading" role="status">正在读取图片...</span>
  const image = <img src={dataUrl} alt={alt} loading="lazy" onLoad={(event) => setLayout(event.currentTarget.naturalWidth / Math.max(1, event.currentTarget.naturalHeight) >= 1.6 ? "wide" : "float")} />
  return <figure className={`markdown-image is-${layout}`}>{onOpenProjectFile ? <button type="button" title={`在工作台打开：${file.name}`} onClick={() => onOpenProjectFile(file)}>{image}</button> : image}<figcaption>{alt}</figcaption></figure>
}

export function resolveProjectImagePreview(preview: { assetUrl?: string; dataUrl?: string }) {
  return preview.assetUrl ?? preview.dataUrl
}

export function findProjectImage(project: ProjectSnapshot | undefined, source: string | undefined, documentPath?: string): ProjectFile | undefined {
  const relativePath = normalizeProjectImageSource(source, documentPath)
  if (!project || !relativePath) return undefined
  const identity = relativePath.toLocaleLowerCase("en-US")
  return project.files.find((file) => file.kind === "image" && file.relativePath.toLocaleLowerCase("en-US") === identity)
}

export function resolveProjectFileReference(project: ProjectSnapshot | undefined, href: string | undefined, documentPath?: string) {
  if (!project || !href) return undefined
  const source = href.trim()
  if (!source || source.includes("?") || source.startsWith("/") || source.startsWith("\\") || /^[a-z][a-z0-9+.-]*:/i.test(source)) return undefined
  const hash = source.indexOf("#")
  const pathSource = hash >= 0 ? source.slice(0, hash) : source
  const headingSource = hash >= 0 ? source.slice(hash + 1) : undefined
  const relativePath = normalizeProjectImageSource(pathSource || documentPath, pathSource ? documentPath : undefined)
  const heading = headingSource ? decodeImageSource(headingSource) : undefined
  if (!relativePath || headingSource && !heading) return undefined
  const identity = relativePath.toLocaleLowerCase("en-US")
  const file = project.files.find((candidate) => candidate.relativePath.toLocaleLowerCase("en-US") === identity)
  return file ? { file, heading: heading ? normalizeHeading(heading) : undefined } : undefined
}

export function normalizeProjectImageSource(source: string | undefined, documentPath?: string) {
  if (!source) return undefined
  const decoded = decodeImageSource(source.trim())
  if (!decoded || decoded.startsWith("/") || decoded.startsWith("\\") || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.includes("?") || decoded.includes("#")) return undefined
  const input = decoded.replaceAll("\\", "/")
  const segments = documentPath ? documentPath.replaceAll("\\", "/").split("/").slice(0, -1) : []
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (!segments.length) return undefined
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.length ? segments.join("/") : undefined
}

function decodeImageSource(source: string) {
  try {
    return decodeURIComponent(source)
  } catch {
    return undefined
  }
}

function normalizeHeadingText(children: ReactNode) {
  return normalizeHeading(readHeadingText(children))
}

function readHeadingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(readHeadingText).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return readHeadingText(node.props.children)
  return ""
}

function normalizeHeading(heading: string) {
  return heading.trim().replace(/^#+\s*/u, "").replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN")
}
