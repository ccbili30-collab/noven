import type { WorldMaterializationReceipt, WorldMaterializationStateDocument } from "./materialization.ts"

export type MaterializationTerminalDisposition = "bypassed" | "needs_help"

export type MaterializationObjectOutcome =
  | { status: "completed"; objectId: string; title: string; path: string; attemptId: string }
  | { status: "accepted-existing"; objectId: string; title: string; path: string; attemptId: string }
  | { status: "unverified-file"; objectId: string; title: string; path: string }
  | { status: "bypassed-missing"; objectId: string; title: string; path: string }
  | { status: "needs-help"; objectId: string; title: string; path: string }

export interface MaterializationTerminalEvidence {
  total: number
  trustedCompleted: number
  untrusted: number
  isPartial: boolean
  outcomes: MaterializationObjectOutcome[]
}

export function projectMaterializationTerminal(input: {
  state: WorldMaterializationStateDocument
  receipts: readonly WorldMaterializationReceipt[]
  existingPaths: ReadonlySet<string>
  dispositions?: ReadonlyMap<string, MaterializationTerminalDisposition>
}): MaterializationTerminalEvidence {
  const receipts = new Map(input.receipts.map((receipt) => [receipt.objectId, receipt]))
  const outcomes = input.state.objects.map((object): MaterializationObjectOutcome => {
    const common = {
      objectId: object.objectId,
      title: object.writingContract.object.title,
      path: object.plannedPath,
    }
    const receipt = receipts.get(object.objectId)
    if (receipt) {
      return receipt.phase === "recovery"
        ? { ...common, status: "accepted-existing", attemptId: receipt.attemptId }
        : { ...common, status: "completed", attemptId: receipt.attemptId }
    }
    if (input.existingPaths.has(object.plannedPath)) return { ...common, status: "unverified-file" }
    if (input.dispositions?.get(object.objectId) === "bypassed") return { ...common, status: "bypassed-missing" }
    return { ...common, status: "needs-help" }
  })
  const trustedCompleted = outcomes.filter((outcome) => outcome.status === "completed" || outcome.status === "accepted-existing").length
  return {
    total: outcomes.length,
    trustedCompleted,
    untrusted: outcomes.length - trustedCompleted,
    isPartial: trustedCompleted !== outcomes.length,
    outcomes,
  }
}
