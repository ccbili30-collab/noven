import { normalizeCreativeSkillSequence } from "@creatx/creative-skills/skill-sequence"

export const skillSequenceStorageKey = "creatx.composer.skill-sequences.v2"
const legacySkillSequenceStorageKey = "creatx.composer.skill-sequences.v1"

export interface SkillSequenceSlot {
  skillName: string
  enabled: boolean
}

export interface SkillSequencePreferences {
  version: 2
  sessions: Record<string, SkillSequenceSlot[]>
}

export const emptySkillSequencePreferences: SkillSequencePreferences = { version: 2, sessions: {} }

export function readSkillSequencePreferences(storage: Pick<Storage, "getItem">) {
  return parseSkillSequencePreferences(storage.getItem(skillSequenceStorageKey) ?? storage.getItem(legacySkillSequenceStorageKey))
}

export function parseSkillSequencePreferences(value: string | null): SkillSequencePreferences {
  if (!value) return emptySkillSequencePreferences
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptySkillSequencePreferences
    const input = parsed as { version?: unknown; sessions?: unknown }
    if ((input.version !== 1 && input.version !== 2) || !input.sessions || typeof input.sessions !== "object" || Array.isArray(input.sessions)) return emptySkillSequencePreferences
    const sessions = Object.fromEntries(Object.entries(input.sessions).flatMap(([sessionId, value]) => {
      if (!sessionId.trim() || !Array.isArray(value) || value.length > 12) throw new Error("skill_sequence_invalid: invalid session slots")
      const slots = input.version === 1
        ? normalizeCreativeSkillSequence(value).map((skillName) => ({ skillName, enabled: true }))
        : normalizeSkillSequenceSlots(value)
      return slots.length ? [[sessionId, slots] as const] : []
    }))
    return { version: 2, sessions }
  } catch {
    return emptySkillSequencePreferences
  }
}

export function skillSequenceSlotsForSession(preferences: SkillSequencePreferences, sessionId: string | undefined) {
  if (!sessionId) return []
  return (preferences.sessions[sessionId] ?? []).map((slot) => ({ ...slot }))
}

export function enabledSkillSequenceForSession(preferences: SkillSequencePreferences, sessionId: string | undefined) {
  return skillSequenceSlotsForSession(preferences, sessionId).filter((slot) => slot.enabled).map((slot) => slot.skillName)
}

export function setSessionSkillSequenceSlots(preferences: SkillSequencePreferences, sessionId: string, slots: readonly SkillSequenceSlot[]) {
  const id = sessionId.trim()
  if (!id) throw new Error("skill_sequence_invalid: sessionId is required")
  const normalized = normalizeSkillSequenceSlots(slots)
  const sessions = { ...preferences.sessions }
  if (normalized.length) sessions[id] = normalized
  if (!normalized.length) delete sessions[id]
  return { version: 2, sessions } satisfies SkillSequencePreferences
}

function normalizeSkillSequenceSlots(value: readonly unknown[]) {
  if (value.length > 12) throw new Error("skill_sequence_invalid: sequence must contain at most 12 Skills")
  const slots = value.map((slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) throw new Error("skill_sequence_invalid: slot must be an object")
    const input = slot as { skillName?: unknown; enabled?: unknown }
    if (typeof input.enabled !== "boolean") throw new Error("skill_sequence_invalid: slot enabled state is required")
    return { skillName: normalizeCreativeSkillSequence([input.skillName])[0]!, enabled: input.enabled }
  })
  return slots
}
