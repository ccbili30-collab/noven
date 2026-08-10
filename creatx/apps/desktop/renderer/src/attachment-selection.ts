import type { AttachmentReference } from "@creatx/contracts"

export function appendAttachmentSelection(current: readonly AttachmentReference[], incoming: readonly AttachmentReference[]) {
  const selected = [...current, ...incoming.filter((attachment) => !current.some((existing) => existing.id === attachment.id))]
  if (selected.length > 20) throw new Error("attachment_invalid: a conversation can include at most 20 attachments")
  return selected
}
