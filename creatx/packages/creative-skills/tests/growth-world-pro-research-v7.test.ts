import { expect, test } from "bun:test"
import { GROWTH_WORLD_PRO_SKILL_SOURCE } from "../src/growth-world-pro.ts"

test("Growth World Pro documents the V4 performance-first writing boundary", () => {
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("研究只形成短小写作简报")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("Writer 可以更换主文类、混合备选文类")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("正文完成后，再执行轻量抽取")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("source / derived / created")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).toContain("不得产生 criticalGap 或阻塞 Writer")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("提交 V7 contentBrief")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("contentCards 只允许 beat")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("Writer 没有事实级开放补写权限")
  expect(GROWTH_WORLD_PRO_SKILL_SOURCE).not.toContain("不得创造内容卡中不存在的新世界事实")
})
