import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

export function DesktopDialog(props: {
  children: ReactNode
  labelId: string
  className: string
  backdropClassName: string
  kind?: "dialog" | "alertdialog"
  canClose?: boolean
  closeOnBackdrop?: boolean
  returnFocus?: HTMLElement | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const onClose = useRef(props.onClose)
  const canClose = useRef(props.canClose !== false)
  onClose.current = props.onClose
  canClose.current = props.canClose !== false
  useEffect(() => {
    const previousFocus = props.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
    const dialog = dialogRef.current
    const initialFocus = dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? dialog?.querySelector<HTMLElement>(focusableSelector)
    initialFocus?.focus()
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && canClose.current) {
        event.preventDefault()
        onClose.current()
        return
      }
      if (event.key !== "Tab" || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return }
      const first = focusable[0]!
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  return <div className={props.backdropClassName} role="presentation" onPointerDown={(event) => {
    if (event.target === event.currentTarget && canClose.current && props.closeOnBackdrop !== false) props.onClose()
  }}>
    <section ref={dialogRef} className={props.className} role={props.kind ?? "dialog"} aria-modal="true" aria-labelledby={props.labelId} tabIndex={-1}>{props.children}</section>
  </div>
}
