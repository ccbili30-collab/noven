import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SkillSequenceControl } from "../src/SkillSequenceControl"

test("renders the armed Skill control with a compact leading check", () => {
  const html = renderToStaticMarkup(<SkillSequenceControl
    slots={[{ skillName: "study", enabled: true }]}
    armed
    disabled={false}
    onChange={() => undefined}
    onArmedChange={() => undefined}
  />)

  expect(html).toContain("wb-skill-basket-arm is-armed")
  expect(html).toContain('width="8"')
  expect(html.indexOf("wb-skill-basket-arm")).toBeLessThan(html.indexOf("wb-skill-basket-trigger"))
})
