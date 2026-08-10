export function droppedAttachmentPaths(files: readonly File[], getPath: (file: File) => string) {
  if (!files.length || files.length > 20) throw new Error("attachment_invalid: drop between 1 and 20 files")
  const paths = files.map((file) => {
    try {
      const path = getPath(file).trim()
      if (!path) throw new Error("missing operating-system path")
      return path
    } catch (error) {
      throw new Error(`attachment_invalid: dropped item is not a real operating-system file: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  return [...new Set(paths)]
}
