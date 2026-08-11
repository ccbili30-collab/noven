import { describe, expect, test } from "bun:test"
import { douyinAnalysisPrompt, draftWithDouyinLink, findDouyinLink } from "../src/video-link"

describe("composer video links", () => {
  test("finds the link inside the sentence 抖音's share button copies", () => {
    // The trailing slash is dropped here exactly as extractDouyinUrl drops it in the main process.
    expect(findDouyinLink("7.85 复制打开抖音，看看【某人的作品】画草稿的手法  https://v.douyin.com/iRNBho6/ 复制此链接，打开Dou音搜索"))
      .toBe("https://v.douyin.com/iRNBho6")
    expect(findDouyinLink("https://www.douyin.com/video/7412345678901234567?modal_id=1")).toBe("https://www.douyin.com/video/7412345678901234567?modal_id=1")
    expect(findDouyinLink("看看 https://www.douyin.com/video/7412345678901234567。")).toBe("https://www.douyin.com/video/7412345678901234567")
  })

  test("ignores text without a 抖音 link so ordinary pasting is untouched", () => {
    expect(findDouyinLink("帮我写一段开场白")).toBeUndefined()
    expect(findDouyinLink("https://www.bilibili.com/video/BV1xx411c7mD")).toBeUndefined()
    expect(findDouyinLink("https://example.com/douyin.com/video/1")).toBeUndefined()
  })

  test("replaces an empty draft but never overwrites something already typed", () => {
    expect(draftWithDouyinLink("", "https://v.douyin.com/abc")).toBe(douyinAnalysisPrompt("https://v.douyin.com/abc"))
    expect(draftWithDouyinLink("  ", "https://v.douyin.com/abc")).toBe(douyinAnalysisPrompt("https://v.douyin.com/abc"))
    expect(draftWithDouyinLink("这条视频的分镜怎么做的", "https://v.douyin.com/abc")).toBe("这条视频的分镜怎么做的\nhttps://v.douyin.com/abc\n")
  })
})
