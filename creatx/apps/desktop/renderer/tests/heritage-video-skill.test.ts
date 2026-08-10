import { describe, expect, test } from "bun:test"
import { heritageVideoSkillPrompt } from "../src/heritage-video-skill"

describe("heritage video Skill request", () => {
  test("binds the request to transcript-first reading and approved installation", () => {
    const prompt = heritageVideoSkillPrompt({
      title: "How to build a fictional world",
      author: "Kate Messner",
      sourceUrl: "https://www.ted.com/talks/kate_messner_how_to_build_a_fictional_world",
      learningEvidence: { kind: "ted-transcript", transcriptUrl: "https://www.ted.com/talks/kate_messner_how_to_build_a_fictional_world?view=transcript", language: "en", cueCount: 105 },
    })

    expect(prompt).toContain("read_heritage_video_transcript")
    expect(prompt).toContain("install_heritage_skill")
    expect(prompt.indexOf("read_heritage_video_transcript")).toBeLessThan(prompt.indexOf("install_heritage_skill"))
    expect(prompt).toContain("没有取得真实字幕就停止")
    expect(prompt).toContain("https://www.ted.com/talks/kate_messner_how_to_build_a_fictional_world?view=transcript")
  })
})
