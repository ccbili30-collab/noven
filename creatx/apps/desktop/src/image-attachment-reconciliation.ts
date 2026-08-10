import { isSilentImageAttachmentConflict } from "@creatx/contracts"

export function reportableImageAttachmentFailures<T extends { error: string }>(failures: T[]) {
  return failures.filter((failure) => !isSilentImageAttachmentConflict(failure.error))
}
