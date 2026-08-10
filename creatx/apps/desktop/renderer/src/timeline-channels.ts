import type { TimelineItem } from "@creatx/contracts"

export interface TimelineActivityGroup {
  activityId: string
  workItemId: string
  title: string
  items: TimelineItem[]
}

export interface CompactTimelineItem {
  item: TimelineItem
  repeatCount: number
}

export interface ConversationTurn {
  turnId: string
  user?: TimelineItem
  details: TimelineItem[]
  notices: TimelineItem[]
  final?: TimelineItem
  waiting: boolean
}

export function partitionTimeline(items: readonly TimelineItem[]) {
  const ordered = [...items].sort(compareTimelineItems)
  const conversation = ordered.filter((item) => !item.activity)
  const groups = new Map<string, TimelineActivityGroup>()
  for (const item of ordered) {
    if (!item.activity) continue
    const group = groups.get(item.activity.activityId) ?? {
      activityId: item.activity.activityId,
      workItemId: item.activity.workItemId,
      title: item.activity.title,
      items: [],
    }
    group.items.push(item)
    groups.set(group.activityId, group)
  }
  return { conversation, activities: [...groups.values()] }
}

export function reduceTimeline(current: readonly TimelineItem[], item: TimelineItem) {
  const existingIndex = current.findIndex((candidate) => candidate.itemId === item.itemId)
  if (existingIndex >= 0 && compareTimelineItems(current[existingIndex]!, item) === 0) {
    const next = [...current]
    next[existingIndex] = item
    return next
  }
  const next = existingIndex < 0 ? [...current] : [...current.slice(0, existingIndex), ...current.slice(existingIndex + 1)]
  let low = 0
  let high = next.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (compareTimelineItems(next[middle]!, item) <= 0) low = middle + 1
    else high = middle
  }
  next.splice(low, 0, item)
  return next
}

export function mergeTimelineSnapshot(current: readonly TimelineItem[], incoming: readonly TimelineItem[]) {
  const optimistic = current.filter((item) => item.itemId.startsWith("local-") && item.kind === "message" && item.presentation === "user")
    .filter((item) => !incoming.some((candidate) => sameUserMessage(item, candidate)))
  return [...incoming, ...optimistic].sort(compareTimelineItems)
}

export function projectConversationTurns(items: readonly TimelineItem[], active: boolean, detachedActivity = false) {
  const ordered = items.every((item, index) => index === 0 || compareTimelineItems(items[index - 1]!, item) <= 0) ? items : [...items].sort(compareTimelineItems)
  const buckets: { turnId: string; items: TimelineItem[] }[] = []
  for (const item of ordered) {
    if (isUserMessage(item)) {
      buckets.push({ turnId: item.itemId, items: [item] })
      continue
    }
    const previous = buckets.at(-1)
    const detachedGrowthItem = Boolean(item.activity) || item.itemId.startsWith("growth:")
    const previousBoundary = previous?.items.some(isUserMessage) || previous?.items.some(isTopLevelGrowthFinal)
    const sameActivation = Boolean(item.ownerActivationId && previous?.items.some((candidate) => candidate.ownerActivationId === item.ownerActivationId))
    const detach = detachedActivity && detachedGrowthItem && previousBoundary && !sameActivation && !previous?.items.some((candidate) => candidate.activity && candidate.itemId.startsWith(item.itemId.split(":").slice(0, 2).join(":")))
    const bucket = detach ? { turnId: `orphan:${item.itemId}`, items: [] } : previous ?? { turnId: `orphan:${item.itemId}`, items: [] }
    if (detach) buckets.push(bucket)
    if (!buckets.length) buckets.push(bucket)
    bucket.items.push(item)
  }
  return buckets.map<ConversationTurn>((bucket, index) => {
    const user = bucket.items.find(isUserMessage)
    const notices = bucket.items.filter((item) => item.kind === "notice" || item.presentation === "system")
    const candidates = bucket.items.filter(isFinalAssistantCandidate)
    const final = active && index === buckets.length - 1 ? undefined : candidates.at(-1)
    const details = bucket.items.filter((item) => item !== user && item !== final && !notices.includes(item))
    return { turnId: bucket.turnId, ...(user ? { user } : {}), details, notices, ...(final ? { final } : {}), waiting: active && index === buckets.length - 1 && Boolean(user) && details.length === 0 && !final }
  })
}

export function compactActivityItems(items: readonly TimelineItem[]) {
  return items.reduce<CompactTimelineItem[]>((compacted, item) => {
    const previous = compacted.at(-1)
    if (previous && sameFailure(previous.item, item)) {
      previous.repeatCount += 1
      return compacted
    }
    compacted.push({ item, repeatCount: 1 })
    return compacted
  }, [])
}

function sameFailure(left: TimelineItem, right: TimelineItem) {
  return left.kind === "tool"
    && right.kind === "tool"
    && left.state === "failed"
    && right.state === "failed"
    && left.toolName === right.toolName
    && left.error === right.error
}

function sameUserMessage(left: TimelineItem, right: TimelineItem) {
  if (!isUserMessage(right) || left.text !== right.text) return false
  const identity = (item: TimelineItem) => (item.attachments ?? []).map((attachment) => attachment.kind === "image" ? `image:${attachment.mediaType ?? "unknown"}` : `file:${attachment.name}`).sort()
  const leftAttachments = identity(left)
  const rightAttachments = identity(right)
  return leftAttachments.length === rightAttachments.length && leftAttachments.every((value, index) => value === rightAttachments[index])
}

function isUserMessage(item: TimelineItem) {
  return item.kind === "message" && item.presentation === "user"
}

function isFinalAssistantCandidate(item: TimelineItem) {
  return item.kind === "message" && item.presentation === "assistant" && item.state === "completed" && !item.activity
}

function isTopLevelGrowthFinal(item: TimelineItem) {
  return item.itemId.startsWith("growth:") && isFinalAssistantCandidate(item)
}

function compareTimelineItems(left: TimelineItem, right: TimelineItem) {
  const sequence = left.sequence - right.sequence
  if (sequence) return sequence
  if (left.itemId.startsWith("local-") !== right.itemId.startsWith("local-")) return left.itemId.startsWith("local-") ? -1 : 1
  return left.itemId.localeCompare(right.itemId, "en-US")
}
