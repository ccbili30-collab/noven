import { timestamp } from "./schema.ts"

export interface TranscriptCue {
  atSeconds: number
  text: string
}

// Handles SRT (comma decimals) and WebVTT (dot decimals, optional cue identifiers, optional
// positioning suffix after the end time) with one parser, because --convert-subs srt can fail
// and leave the original .vtt behind.
export function parseSubtitleCues(input: string): TranscriptCue[] {
  const cues = input.replaceAll("\r\n", "\n").replace(/^﻿/u, "").split(/\n{2,}/u).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter((line) => line !== "")
    const timeIndex = lines.findIndex((line) => line.includes("-->"))
    if (timeIndex < 0) return []
    const start = lines[timeIndex]!.split("-->")[0]?.trim()
    const atSeconds = start === undefined ? undefined : parseCueTime(start)
    const text = normalizeCueText(lines.slice(timeIndex + 1).join(" "))
    return atSeconds === undefined || text === "" ? [] : [{ atSeconds, text }]
  })
  // 抖音 auto-captions roll the same sentence across consecutive cues; keeping every repeat
  // triples the transcript and buries the actual content.
  return cues.filter((cue, index) => index === 0 || cue.text !== cues[index - 1]!.text)
}

export function formatTranscript(cues: readonly TranscriptCue[]) {
  return cues.map((cue) => `[${timestamp(cue.atSeconds)}] ${cue.text}`).join("\n")
}

function parseCueTime(input: string) {
  const match = input.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/u)
  if (!match) return undefined
  return Number(match[1] ?? 0) * 3_600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1_000
}

function normalizeCueText(input: string) {
  return input.replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim()
}
