import { expect, test } from "bun:test"
import type { GrowthIssueProjection } from "@creatx/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { GrowthIssues, visibleGrowthIssues } from "../src/WorkspaceShell"

test("groups repeated repairing issues into one visible error card", () => {
  const html = renderToStaticMarkup(<GrowthIssues issues={[
    issue("repair-a", "repairing", "第一次输入缺少 parentKey"),
    issue("repair-b", "repairing", "第二次输入引用未知对象"),
    issue("repair-c", "repairing", "第三次输入包含未知字段"),
  ]} />)

  expect(html.match(/wb-growth-issue error/g)).toHaveLength(1)
  expect(html).toContain("正在自动修复 × 3")
  expect(html).toContain("第一次输入缺少 parentKey")
  expect(html).toContain("第三次输入包含未知字段")
})

test("shows one green completed card before resolved issues expire", () => {
  const html = renderToStaticMarkup(<GrowthIssues issues={[
    issue("resolved-a", "resolved", "第一次修复记录"),
    issue("resolved-b", "resolved", "第二次修复记录"),
  ]} />)

  expect(html.match(/wb-growth-issue resolved/g)).toHaveLength(1)
  expect(html).toContain("已修复完成 × 2")
})

test("shows an authorized safe bypass as green before it expires", () => {
  const html = renderToStaticMarkup(<GrowthIssues issues={[issue("bypassed-a", "bypassed", "自动修复已耗尽，已保留缺失记录并继续。")]} />)

  expect(html).toContain("wb-growth-issue resolved")
  expect(html).toContain("已绕过")
})

test("removes repaired issues three seconds after their trusted resolution", () => {
  const resolved = issue("resolved-a", "resolved", "修复记录")
  const resolvedAt = new Date(resolved.resolvedAt!).getTime()

  expect(visibleGrowthIssues([resolved], resolvedAt + 2_999)).toEqual([resolved])
  expect(visibleGrowthIssues([resolved], resolvedAt + 3_000)).toEqual([])
  expect(visibleGrowthIssues([issue("repairing", "repairing", "仍在修复")], resolvedAt + 30_000)).toHaveLength(1)
})

function issue(issueId: string, status: GrowthIssueProjection["status"], detail: string): GrowthIssueProjection {
  return {
    issueId,
    goalId: "goal-1",
    stageAttemptId: "goal-1:stage:3",
    errorCode: "blueprint_invalid",
    impact: "repairable",
    status,
    summary: status === "resolved" ? "蓝图阶段已提交可信进度回执，先前问题已经在本阶段内修正。" : "蓝图阶段工具输入无效，正在按可信阶段合同修复。",
    detail,
    affectedObjectIds: [],
    attemptCount: 1,
    createdAt: "2026-08-07T01:00:00.000Z",
    updatedAt: "2026-08-07T01:01:00.000Z",
    ...(status === "resolved" || status === "bypassed" ? { resolvedAt: "2026-08-07T01:01:00.000Z" } : {}),
    version: 1,
  }
}
