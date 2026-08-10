import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  OnboardingTour,
  markOnboardingSeen,
  onboardingSeenStorageKey,
  onboardingSteps,
  readOnboardingSeen,
  resolveSpotlightPlacement,
} from "../src/OnboardingTour"

function storage(initial?: string) {
  const values = new Map(initial === undefined ? [] : [[onboardingSeenStorageKey, initial]])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

test("opens once per Profile and records only an explicit dismissal", () => {
  const local = storage()
  expect(readOnboardingSeen(local)).toBe(false)
  markOnboardingSeen(local)
  expect(readOnboardingSeen(local)).toBe(true)
  expect(readOnboardingSeen(storage("broken"))).toBe(false)
})

test("keeps the accepted ten-step route and complete current Skill catalog", () => {
  expect(onboardingSteps.map((step) => step.id)).toEqual(["welcome", "api", "project", "seed", "workbench", "art", "idea", "heritage", "capabilities", "complete"])
  const html = renderToStaticMarkup(<OnboardingTour onDismiss={() => undefined} onSurface={() => undefined} />)
  expect(html).toContain("把一次心动，种成一个世界")
  expect(html).toContain("1 / 10")
})

test("keeps the Spotlight card inside the viewport and centers when a target is missing", () => {
  expect(resolveSpotlightPlacement(undefined, { width: 1600, height: 1000 }, { width: 300, height: 240 })).toEqual({ side: "center", left: 800, top: 500, pointer: 0 })
  const placement = resolveSpotlightPlacement({ left: 20, top: 820, right: 220, bottom: 970, width: 200, height: 150 }, { width: 1600, height: 1000 }, { width: 300, height: 240 })
  expect(placement.left).toBeGreaterThanOrEqual(18)
  expect(placement.top).toBeGreaterThanOrEqual(18)
  expect(placement.left + 300).toBeLessThanOrEqual(1582)
  expect(placement.top + 240).toBeLessThanOrEqual(982)
})
