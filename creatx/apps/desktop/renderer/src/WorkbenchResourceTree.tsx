import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronRight, FileImage, FileText, Folder } from "lucide-react"
import type { ProjectFile, ProjectSnapshot, WorkbenchEntry } from "@creatx/contracts"

export function WorkbenchResourceTree(props: {
  entries: WorkbenchEntry[]
  project: ProjectSnapshot | undefined
  selectedFileId: string | undefined
  namespace: string
  collapsedDirectories: Set<string>
  variant: "navigation" | "rail"
  onToggleDirectory: (key: string) => void
  onOpenFile: (file: ProjectFile) => void
}) {
  const visibleEntries = useMemo(() => visibleWorkbenchEntries(props.entries, props.namespace, props.collapsedDirectories), [props.collapsedDirectories, props.entries, props.namespace])

  return <div className={props.variant === "navigation" ? "wb-workbench-resource-tree" : "wb-tree-scroll workbench-file-list files-workbench"} role="tree">
    {visibleEntries.map((entry) => <WorkbenchResourceRow
      key={entry.relativePath}
      entry={entry}
      project={props.project}
      selected={entry.fileId === props.selectedFileId}
      collapsed={props.collapsedDirectories.has(workbenchEntryKey(props.namespace, entry.relativePath))}
      variant={props.variant}
      onToggleDirectory={() => props.onToggleDirectory(workbenchEntryKey(props.namespace, entry.relativePath))}
      onOpenFile={props.onOpenFile}
    />)}
  </div>
}

function WorkbenchResourceRow(props: {
  entry: WorkbenchEntry
  project: ProjectSnapshot | undefined
  selected: boolean
  collapsed: boolean
  variant: "navigation" | "rail"
  onToggleDirectory: () => void
  onOpenFile: (file: ProjectFile) => void
}) {
  const file = props.entry.fileId ? props.project?.files.find((candidate) => candidate.id === props.entry.fileId) : undefined
  const depth = Math.max(0, props.entry.relativePath.split(/[\\/]/).length - 1)
  if (props.entry.kind === "directory") return <button
    className={props.variant === "navigation" ? "wb-workbench-file-folder" : "wb-tree-group-heading"}
    style={{ paddingLeft: `${props.variant === "navigation" ? 7 + depth * 12 : 6 + depth * 12}px` }}
    role="treeitem"
    aria-expanded={!props.collapsed}
    onClick={props.onToggleDirectory}
    onKeyDown={(event) => {
      if (event.key === "ArrowRight" && props.collapsed || event.key === "ArrowLeft" && !props.collapsed) {
        event.preventDefault()
        props.onToggleDirectory()
      }
    }}
  >{props.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<Folder size={13} /><WorkbenchEntryLabel name={props.entry.name} /></button>
  return <button
    className={props.variant === "navigation" ? `wb-workbench-file-item ${props.selected ? "is-active" : ""}` : `wb-tree-item file-row ${props.selected ? "is-active selected" : ""}`}
    style={{ paddingLeft: `${props.variant === "navigation" ? 21 + depth * 12 : 20 + depth * 12}px` }}
    role="treeitem"
    aria-current={props.selected ? "page" : undefined}
    disabled={!file}
    onClick={() => { if (file) props.onOpenFile(file) }}
  >{file?.kind === "image" ? <FileImage size={13} /> : <FileText size={13} />}<WorkbenchEntryLabel name={props.entry.name} />{props.variant === "rail" && props.selected && <i />}</button>
}

function WorkbenchEntryLabel({ name }: { name: string }) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [flyout, setFlyout] = useState<CSSProperties>()
  useEffect(() => {
    const label = labelRef.current
    if (!label) return
    const update = () => setOverflowing(label.scrollWidth > label.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(label)
    return () => observer.disconnect()
  }, [name])
  const show = () => {
    const label = labelRef.current
    const row = label?.parentElement
    if (!label || !row || !overflowing) return
    const rect = row.getBoundingClientRect()
    setFlyout({ left: rect.left, top: Math.max(6, rect.top - 31), width: rect.width })
  }
  return <>
    <span className="wb-tree-entry-label" ref={labelRef} title={name} onPointerEnter={show} onPointerLeave={() => setFlyout(undefined)}>{name}</span>
    {flyout && createPortal(<div className="wb-tree-entry-flyout" style={flyout} aria-hidden="true"><div><span>{name}</span><span>{name}</span></div></div>, document.body)}
  </>
}

export function visibleWorkbenchEntries(entries: WorkbenchEntry[], namespace: string, collapsedDirectories: Set<string>) {
  return entries.filter((entry) => {
    const parts = entry.relativePath.replaceAll("\\", "/").split("/")
    return parts.slice(0, -1).every((_, index) => !collapsedDirectories.has(workbenchEntryKey(namespace, parts.slice(0, index + 1).join("/"))))
  })
}

export function workbenchEntryKey(namespace: string, relativePath: string) {
  return `${namespace}:${relativePath.replaceAll("\\", "/")}`
}
