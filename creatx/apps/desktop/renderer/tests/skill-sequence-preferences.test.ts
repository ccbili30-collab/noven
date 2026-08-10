import { describe, expect, test } from "bun:test"
import { emptySkillSequencePreferences, enabledSkillSequenceForSession, parseSkillSequencePreferences, readSkillSequencePreferences, setSessionSkillSequenceSlots, skillSequenceSlotsForSession } from "../src/skill-sequence-preferences"

const map = { skillName: "creatx-draw-map", enabled: true }
const comicDisabled = { skillName: "creatx-draw-comic", enabled: false }

describe("Composer Skill sequence preferences", () => {
  test("keeps ordered enabled and disabled slots isolated by Cline session", () => {
    const first = setSessionSkillSequenceSlots(emptySkillSequencePreferences, "session-a", [map, comicDisabled])
    const second = setSessionSkillSequenceSlots(first, "session-b", [{ skillName: "creatx-study", enabled: true }])
    expect(skillSequenceSlotsForSession(second, "session-a")).toEqual([map, comicDisabled])
    expect(enabledSkillSequenceForSession(second, "session-a")).toEqual(["creatx-draw-map"])
    expect(enabledSkillSequenceForSession(second, "session-b")).toEqual(["creatx-study"])
    expect(skillSequenceSlotsForSession(second, "session-c")).toEqual([])
  })

  test("removes only the current session when its basket becomes empty", () => {
    const configured = setSessionSkillSequenceSlots(
      setSessionSkillSequenceSlots(emptySkillSequencePreferences, "session-a", [map]),
      "session-b",
      [comicDisabled],
    )
    const cleared = setSessionSkillSequenceSlots(configured, "session-a", [])
    expect(skillSequenceSlotsForSession(cleared, "session-a")).toEqual([])
    expect(skillSequenceSlotsForSession(cleared, "session-b")).toEqual([comicDisabled])
  })

  test("migrates V1 slots as enabled and fails closed for malformed or unknown Skills", () => {
    const legacy = JSON.stringify({ version: 1, sessions: { "session-a": ["creatx-draw-map", "creatx-draw-map"] } })
    expect(parseSkillSequencePreferences(legacy)).toEqual({ version: 2, sessions: { "session-a": [map, map] } })
    expect(readSkillSequencePreferences({ getItem: (key) => key.endsWith(".v1") ? legacy : null })).toEqual({ version: 2, sessions: { "session-a": [map, map] } })
    expect(parseSkillSequencePreferences("{")).toEqual(emptySkillSequencePreferences)
    expect(parseSkillSequencePreferences(JSON.stringify({ version: 2, sessions: { "session-a": [{ skillName: "creatx-growth", enabled: true }] } }))).toEqual(emptySkillSequencePreferences)
    expect(parseSkillSequencePreferences(JSON.stringify({ version: 2, sessions: { "session-a": [{ skillName: "creatx-study" }] } }))).toEqual(emptySkillSequencePreferences)
  })
})
