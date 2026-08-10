import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DatabaseSync } from "node:sqlite"
import { promoteGrowthLiveArchive } from "../src/live-archive.ts"
import { GrowthGoalStore } from "../src/store.ts"

test("promotes a completed Growth graph with Project ID remapping and exact retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "creatx-growth-archive-"))
  const sourcePath = join(root, "source.sqlite")
  const targetPath = join(root, "target.sqlite")
  new GrowthGoalStore(sourcePath).close()
  new GrowthGoalStore(targetPath).close()
  const source = new DatabaseSync(sourcePath)
  source.exec("PRAGMA foreign_keys = ON")
  source.prepare(`INSERT INTO growth_goal (goal_id,request_id,project_id,session_id,instruction,status,plan_file_id,required_image_task_ids,created_at,updated_at,version,status_reason,work_root_path,world_entry_mode,world_entry_stage,predecessor_goal_id,owner_reply_pending) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "goal-live", "request-live", "source-project", "owner-session", "instruction", "completed", null, "[]", "2026-08-06T10:00:00.000Z", "2026-08-06T11:00:00.000Z", 3, null, "世界", "create", "materialization", null, 0,
  )
  source.prepare("INSERT INTO growth_stage_attempt (attempt_id,goal_id,sequence,stage_key,started_version,report_count_before,fingerprint_before,status,report_id,fingerprint_after,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("attempt-1", "goal-live", 1, "stage-one", 1, 0, "before", "reported", "report-1", "after", "2026-08-06T10:00:00.000Z", "2026-08-06T10:10:00.000Z")
  source.prepare("INSERT INTO growth_report_receipt (goal_id,report_id,payload_hash,resulting_version) VALUES (?,?,?,?)").run("goal-live", "report-1", "hash", 2)
  source.prepare("INSERT INTO growth_issue (issue_id,goal_id,dedupe_key,work_item_id,error_code,impact,status,summary,detail,affected_object_ids,attempt_count,created_at,updated_at,resolved_at,version,stage_attempt_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("issue-1", "goal-live", "dedupe", "object-1", "temporary", "repairable", "resolved", "fixed", null, "[]", 1, "2026-08-06T10:00:00.000Z", "2026-08-06T10:05:00.000Z", "2026-08-06T10:05:00.000Z", 2, "attempt-1")
  source.prepare("INSERT INTO growth_owner_activation (activation_id,kind,route,session_id,project_id,goal_id,prompt_hash,instruction,controller_tool_name,tool_call_id,status,result_json,owner_reply_hash,failure_reason,created_at,updated_at,version,delivery_source_activation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("activation-1", "start", "growth-world-pro", "owner-session", "source-project", "goal-live", "prompt-hash", "instruction", "run_growth", "tool-1", "completed", "{}", "reply-hash", null, "2026-08-06T10:00:00.000Z", "2026-08-06T11:00:00.000Z", 2, null)
  source.close()

  const input = { sourceDatabasePath: sourcePath, targetDatabasePath: targetPath, goalId: "goal-live", sourceProjectId: "source-project", targetProjectId: "target-project" }
  const expected = { goalId: "goal-live", issueCount: 1, reportCount: 1, attemptCount: 1, activationCount: 1 }
  assert.deepEqual(promoteGrowthLiveArchive(input), expected)
  assert.deepEqual(promoteGrowthLiveArchive(input), expected)
  const target = new DatabaseSync(targetPath, { readOnly: true })
  assert.equal((target.prepare("SELECT project_id FROM growth_goal WHERE goal_id = 'goal-live'").get() as { project_id: string }).project_id, "target-project")
  assert.equal((target.prepare("SELECT project_id FROM growth_owner_activation WHERE activation_id = 'activation-1'").get() as { project_id: string }).project_id, "target-project")
  assert.equal((target.prepare("SELECT count(*) count FROM growth_issue").get() as { count: number }).count, 1)
  target.close()
})
