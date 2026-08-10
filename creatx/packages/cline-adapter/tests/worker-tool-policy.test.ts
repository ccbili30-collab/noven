import { describe, expect, test } from "bun:test"
import type { CreatXToolAudience, CreatXToolContribution } from "@creatx/contracts"
import { creatXToolsForWorkerProfile, latestAssistantText, SessionToolPolicyController, sessionToolPolicies, skillsForWorkerProfile } from "../src"

const tools = [
  "complete_world_materialization_object",
  "submit_image_generation",
  "report_growth_progress",
  "register_workbench",
  "write_world_blueprint",
].map(toolContribution)

describe("Growth object Worker tool policy", () => {
  test("research is deny-by-default with only reading and research completion", () => {
    const policies = sessionToolPolicies("free", "project", tools, "enabled", "world-research")
    expect(policies["*"]).toEqual({ enabled: false, autoApprove: false })
    expect(policies.read_files).toEqual({ enabled: true, autoApprove: true })
    expect(policies.complete_world_materialization_object).toEqual({ enabled: true, autoApprove: true })
    for (const name of ["editor", "apply_patch", "run_commands", "search_codebase", "fetch_web_content", "skills", "ask_question", "submit_and_exit", "submit_image_generation", "report_growth_progress", "register_workbench"]) {
      expect(policies[name]).toEqual({ enabled: false, autoApprove: false })
    }
  })

  test("writer and recovery expose only their exact object-scoped tools", () => {
    const writer = sessionToolPolicies("free", "project", tools, "enabled", "world-writer")
    for (const name of ["read_files", "apply_patch", "editor", "submit_image_generation", "complete_world_materialization_object"]) {
      expect(writer[name]).toEqual({ enabled: true, autoApprove: true })
    }
    expect(writer.report_growth_progress).toEqual({ enabled: false, autoApprove: false })
    expect(writer.run_commands).toEqual({ enabled: false, autoApprove: false })

    const recovery = sessionToolPolicies("free", "project", tools, "disabled", "world-recovery")
    for (const name of ["read_files", "submit_image_generation", "complete_world_materialization_object"]) {
      expect(recovery[name]).toEqual({ enabled: true, autoApprove: true })
    }
    expect(recovery.editor).toEqual({ enabled: false, autoApprove: false })
    expect(recovery.report_growth_progress).toEqual({ enabled: false, autoApprove: false })
  })

  test("blueprint Workers can inspect sources and use only dedicated mutation and reporting tools", () => {
    const blueprint = sessionToolPolicies("free", "project", tools, "enabled", "world-blueprint")
    for (const name of ["read_files", "search_codebase", "fetch_web_content", "skills", "write_world_blueprint", "report_growth_progress"]) {
      expect(blueprint[name]).toEqual({ enabled: true, autoApprove: true })
    }
    for (const name of ["editor", "apply_patch", "run_commands", "ask_question", "submit_and_exit", "submit_image_generation", "register_workbench"]) {
      expect(blueprint[name]).toEqual({ enabled: false, autoApprove: false })
    }
    expect(creatXToolsForWorkerProfile(tools, "world-blueprint").map((tool) => tool.name)).toEqual(["report_growth_progress", "write_world_blueprint"])
  })

  test("projects a profile-specific schema without changing the underlying tool", () => {
    const tool = toolContribution("complete_world_materialization_object")
    tool.inputSchemaForWorkerProfile = (profile) => ({ type: "object", properties: { action: { const: profile === "world-research" ? "submit_research" : "complete_object" } } })
    const research = creatXToolsForWorkerProfile([tool], "world-research")[0]!
    const writer = creatXToolsForWorkerProfile([tool], "world-writer")[0]!

    expect((research.inputSchema.properties as { action: { const: string } }).action.const).toBe("submit_research")
    expect((writer.inputSchema.properties as { action: { const: string } }).action.const).toBe("complete_object")
    expect(tool.inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false })
  })

  test("permission mode changes cannot widen a restricted Worker profile", () => {
    const controller = new SessionToolPolicyController("free", "project", tools, "enabled", "world-research")
    const reference = controller.policies
    controller.setMode("approval")
    expect(controller.policies).toBe(reference)
    expect(reference["*"]).toEqual({ enabled: false, autoApprove: false })
    expect(reference.report_growth_progress).toEqual({ enabled: false, autoApprove: false })
    expect(reference.complete_world_materialization_object).toEqual({ enabled: true, autoApprove: true })
  })

  test("ordinary free project sessions exclude Growth-internal tools from policy and model visibility", () => {
    expect(sessionToolPolicies("free", "project", tools)).toMatchObject({
      "*": { enabled: true, autoApprove: true },
      skills: { enabled: true, autoApprove: true },
      submit_image_generation: { enabled: true, autoApprove: true },
      register_workbench: { enabled: true, autoApprove: true },
      report_growth_progress: { enabled: false, autoApprove: false },
      write_world_blueprint: { enabled: false, autoApprove: false },
      complete_world_materialization_object: { enabled: false, autoApprove: false },
    })
    expect(creatXToolsForWorkerProfile(tools).map((tool) => tool.name)).toEqual(["submit_image_generation", "register_workbench"])
  })

  test("ordinary sessions and Worker profiles receive different Skill allowlists", () => {
    const workerSkills = {
      "growth-stage": ["creatx-growth"],
      "world-blueprint": ["creatx-growth", "creatx-growth-world-pro"],
    } as const
    expect(skillsForWorkerProfile(["creatx-novel-start", "creatx-study"], workerSkills)).toEqual(["creatx-novel-start", "creatx-study"])
    expect(skillsForWorkerProfile(["creatx-novel-start", "creatx-study"], workerSkills, "world-blueprint")).toEqual(["creatx-growth", "creatx-growth-world-pro"])
    expect(skillsForWorkerProfile(["creatx-novel-start"], workerSkills, "world-writer")).toEqual([])
  })

  test("unknown Worker profiles fail closed", () => {
    expect(() => sessionToolPolicies("free", "project", tools, "enabled", "unknown" as never)).toThrow("compatibility")
    expect(() => creatXToolsForWorkerProfile(tools, "unknown" as never)).toThrow("compatibility")
  })

  test("keeps the final Worker explanation when a completed turn leaves no durable evidence", () => {
    expect(latestAssistantText([
      { role: "assistant", content: [{ type: "tool_use", id: "read-1", name: "read_files", input: {} }] },
      { role: "assistant", content: [{ type: "text", text: "缺少可用的正文写入工具，因此没有伪造完成回执。" }] },
    ] as never)).toBe("缺少可用的正文写入工具，因此没有伪造完成回执。")
  })
})

function toolContribution(name: string): CreatXToolContribution {
  const audiences = (name === "submit_image_generation"
    ? ["ordinary", "world-writer", "world-recovery"]
    : name === "register_workbench"
      ? ["ordinary"]
      : name === "write_world_blueprint" || name === "report_growth_progress"
        ? ["world-blueprint"]
        : ["world-research", "world-writer", "world-recovery"]) satisfies CreatXToolAudience[]
  return {
    name,
    description: "A test-only CreatX tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scope: "project",
    approval: "required",
    execute: async () => ({ ok: true, value: "ok" }),
    audiences,
  }
}
