export const growthSchemaVersion = 12

export const growthSchemaV1 = `
  CREATE TABLE IF NOT EXISTS growth_goal (
    goal_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    instruction TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'waiting', 'completed', 'cancelled', 'failed')),
    plan_file_id TEXT,
    required_image_task_ids TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS growth_goal_one_unterminated
    ON growth_goal(project_id)
    WHERE status IN ('active', 'paused', 'waiting');
  PRAGMA user_version = 1;
`

export const growthSchemaV2Migration = `
  CREATE TABLE growth_report_receipt (
    goal_id TEXT NOT NULL,
    report_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    resulting_version INTEGER NOT NULL CHECK (resulting_version >= 1),
    PRIMARY KEY (goal_id, report_id),
    FOREIGN KEY (goal_id) REFERENCES growth_goal(goal_id) ON DELETE CASCADE
  );
  PRAGMA user_version = 2;
`

export const growthSchemaV3Migration = `
  ALTER TABLE growth_goal ADD COLUMN status_reason TEXT;
  PRAGMA user_version = 3;
`

export const growthSchemaV4Migration = `
  CREATE TABLE growth_goal_steer (
    goal_id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES growth_goal(goal_id) ON DELETE CASCADE
  );
  PRAGMA user_version = 4;
`

export const growthSchemaV5Migration = `
  ALTER TABLE growth_goal ADD COLUMN work_root_path TEXT;
  PRAGMA user_version = 5;
`

export const growthSchemaV6Migration = `
  ALTER TABLE growth_goal ADD COLUMN world_entry_mode TEXT CHECK (world_entry_mode IN ('create', 'continue', 'reconcile'));
  ALTER TABLE growth_goal ADD COLUMN world_entry_stage TEXT CHECK (world_entry_stage IN ('blueprint-create', 'blueprint-review', 'materialization'));
  ALTER TABLE growth_goal ADD COLUMN predecessor_goal_id TEXT REFERENCES growth_goal(goal_id);
  PRAGMA user_version = 6;
`

export const growthSchemaV7Migration = `
  CREATE TABLE growth_issue (
    issue_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    work_item_id TEXT,
    error_code TEXT NOT NULL,
    impact TEXT NOT NULL CHECK (impact IN ('repairable', 'local', 'blocking')),
    status TEXT NOT NULL CHECK (status IN ('detected', 'repairing', 'resolved', 'bypassed', 'needs_help', 'waiting_user')),
    summary TEXT NOT NULL,
    detail TEXT,
    affected_object_ids TEXT NOT NULL,
    attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    version INTEGER NOT NULL CHECK (version >= 1),
    UNIQUE (goal_id, dedupe_key),
    FOREIGN KEY (goal_id) REFERENCES growth_goal(goal_id) ON DELETE CASCADE
  );
  CREATE INDEX growth_issue_goal_status ON growth_issue(goal_id, status, updated_at);
  PRAGMA user_version = 7;
`

export const growthSchemaV8Migration = `
  CREATE TABLE growth_stage_attempt (
    attempt_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    stage_key TEXT NOT NULL,
    started_version INTEGER NOT NULL CHECK (started_version >= 1),
    report_count_before INTEGER NOT NULL CHECK (report_count_before >= 0),
    fingerprint_before TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'missing', 'reported')),
    report_id TEXT,
    fingerprint_after TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (goal_id, sequence),
    FOREIGN KEY (goal_id) REFERENCES growth_goal(goal_id) ON DELETE CASCADE
  );
  CREATE INDEX growth_stage_attempt_goal_status ON growth_stage_attempt(goal_id, status, sequence);
  PRAGMA user_version = 8;
`

const growthSchemaV9Tail = `
  CREATE INDEX IF NOT EXISTS growth_issue_stage_attempt ON growth_issue(stage_attempt_id, status, updated_at);
  PRAGMA user_version = 9;
`

export const growthSchemaV9Migration = `
  BEGIN IMMEDIATE;
  ALTER TABLE growth_issue ADD COLUMN stage_attempt_id TEXT REFERENCES growth_stage_attempt(attempt_id);
  ${growthSchemaV9Tail}
  COMMIT;
`

export const growthSchemaV9RecoveryMigration = `
  BEGIN IMMEDIATE;
  ${growthSchemaV9Tail}
  COMMIT;
`

const growthSchemaV10Tail = `
  CREATE TABLE IF NOT EXISTS growth_owner_activation (
    activation_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('start', 'resume', 'issue')),
    route TEXT CHECK (route IN ('growth', 'growth-world', 'growth-world-pro')),
    session_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    goal_id TEXT REFERENCES growth_goal(goal_id),
    prompt_hash TEXT NOT NULL,
    instruction TEXT,
    controller_tool_name TEXT NOT NULL,
    tool_call_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'result_ready', 'completed', 'failed', 'cancelled')),
    result_json TEXT,
    owner_reply_hash TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS growth_owner_activation_one_open_session
    ON growth_owner_activation(session_id)
    WHERE status IN ('pending', 'running', 'result_ready');
  CREATE INDEX IF NOT EXISTS growth_owner_activation_goal_status
    ON growth_owner_activation(goal_id, status, updated_at);

  UPDATE growth_goal
  SET status = 'waiting',
      status_reason = '旧版 Owner 完成记录缺少可验证的 Activation 关联，已停止等待检查。',
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      version = version + 1
  WHERE status = 'active' AND status_reason LIKE '<creatx_growth_owner_completion>%';

  PRAGMA user_version = 10;
`

export const growthSchemaV10Migration = `
  BEGIN IMMEDIATE;
  ALTER TABLE growth_goal ADD COLUMN owner_reply_pending INTEGER NOT NULL DEFAULT 0 CHECK (owner_reply_pending IN (0, 1));
  ${growthSchemaV10Tail}
  COMMIT;
`

export const growthSchemaV10RecoveryMigration = `
  BEGIN IMMEDIATE;
  ${growthSchemaV10Tail}
  COMMIT;
`

const growthSchemaV11Tail = `
  DROP INDEX IF EXISTS growth_owner_activation_one_open_session;
  CREATE UNIQUE INDEX IF NOT EXISTS growth_owner_activation_one_open_session
    ON growth_owner_activation(session_id)
    WHERE status IN ('pending', 'running', 'result_ready')
      AND delivery_source_activation_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS growth_owner_activation_one_open_delivery
    ON growth_owner_activation(session_id)
    WHERE status IN ('pending', 'running', 'result_ready')
      AND delivery_source_activation_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS growth_owner_activation_delivery_source
    ON growth_owner_activation(delivery_source_activation_id)
    WHERE delivery_source_activation_id IS NOT NULL;

  PRAGMA user_version = 11;
`

export const growthSchemaV11Migration = `
  BEGIN IMMEDIATE;
  ALTER TABLE growth_owner_activation
    ADD COLUMN delivery_source_activation_id TEXT REFERENCES growth_owner_activation(activation_id);
  ${growthSchemaV11Tail}
  COMMIT;
`

export const growthSchemaV11RecoveryMigration = `
  BEGIN IMMEDIATE;
  ${growthSchemaV11Tail}
  COMMIT;
`

export const growthSchemaV12Migration = `
  BEGIN IMMEDIATE;
  DROP INDEX IF EXISTS growth_owner_activation_delivery_source;
  CREATE UNIQUE INDEX IF NOT EXISTS growth_owner_activation_delivery_source
    ON growth_owner_activation(delivery_source_activation_id)
    WHERE delivery_source_activation_id IS NOT NULL
      AND status IN ('pending', 'running', 'result_ready', 'completed');

  PRAGMA user_version = ${growthSchemaVersion};
  COMMIT;
`
