type SingleInstanceApp = {
  requestSingleInstanceLock(): boolean
  on(event: "second-instance", listener: () => void): void
  quit(): void
}

type FocusableWindow = {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function configureSingleInstance(app: SingleInstanceApp, readWindow: () => FocusableWindow | undefined) {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  app.on("second-instance", () => {
    const window = readWindow()
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  return true
}
