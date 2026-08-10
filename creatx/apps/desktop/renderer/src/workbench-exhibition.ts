import type { WorkbenchEntry } from "@creatx/contracts"

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const documentExtensions = new Set(["md", "mdx", "txt"])

export function buildWorkbenchExhibition(entries: readonly WorkbenchEntry[]) {
  return {
    groups: entries.filter((entry) => entry.kind === "directory").map((entry) => entry.name),
    documents: entries.filter((entry) => entry.kind === "file" && entry.fileId && documentExtensions.has(extension(entry.name))),
    images: entries.filter((entry) => entry.kind === "file" && entry.fileId && imageExtensions.has(extension(entry.name))),
  }
}

function extension(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("en-US") ?? ""
}
