export const imageQueueSchemaVersion = 4

export const imageQueueSchemaV1 = `
  CREATE TABLE image_task (
    queue_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    image_task_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    prompt TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    model TEXT NOT NULL CHECK (model IN ('gpt-image-2-cheap', 'gpt-image-2')),
    size TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'generating', 'succeeded', 'failed', 'interrupted')),
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    UNIQUE (project_id, idempotency_key)
  );
  CREATE UNIQUE INDEX image_task_live_output
    ON image_task(project_id, relative_path)
    WHERE status IN ('queued', 'generating', 'succeeded');
  CREATE INDEX image_task_queue_order ON image_task(status, queue_sequence);
  PRAGMA user_version = 1;
`

export const imageQueueSchemaV2 = `
  CREATE TABLE image_task (
    queue_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_rank INTEGER NOT NULL,
    image_task_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    prompt TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    model TEXT NOT NULL CHECK (model IN ('gpt-image-2-cheap', 'gpt-image-2')),
    size TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'generating', 'succeeded', 'failed', 'interrupted', 'cancelled')),
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    attachment_document_path TEXT,
    attachment_alt TEXT,
    attachment_placement TEXT CHECK (attachment_placement IS NULL OR attachment_placement IN ('end', 'after_heading', 'after_anchor')),
    attachment_anchor TEXT,
    attachment_status TEXT CHECK (attachment_status IS NULL OR attachment_status IN ('pending', 'succeeded', 'failed')),
    attachment_error_code TEXT,
    attachment_error_message TEXT,
    UNIQUE (project_id, idempotency_key)
  );
  CREATE TABLE image_task_attempt (
    attempt_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    image_task_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('generating', 'succeeded', 'failed', 'interrupted', 'cancelled')),
    error_code TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (image_task_id, attempt_number),
    FOREIGN KEY (image_task_id) REFERENCES image_task(image_task_id) ON DELETE RESTRICT
  );
  CREATE UNIQUE INDEX image_task_live_output
    ON image_task(project_id, relative_path)
    WHERE status IN ('queued', 'generating', 'succeeded');
  CREATE INDEX image_task_queue_order ON image_task(status, project_id, queue_rank, queue_sequence);
  CREATE INDEX image_task_attempt_history ON image_task_attempt(image_task_id, attempt_number);
  PRAGMA user_version = 2;
`

export const imageQueueMigrationV1ToV2 = `
  DROP INDEX image_task_live_output;
  DROP INDEX image_task_queue_order;
  ALTER TABLE image_task RENAME TO image_task_v1;
  ${imageQueueSchemaV2.replace("PRAGMA user_version = 2;", "")}
  INSERT INTO image_task (
    queue_sequence, queue_rank, image_task_id, project_id, idempotency_key, prompt, relative_path,
    model, size, status, error_code, error_message, created_at, updated_at, started_at, completed_at
  )
  SELECT
    queue_sequence, queue_sequence, image_task_id, project_id, idempotency_key, prompt, relative_path,
    model, size, status, error_code, error_message, created_at, updated_at, started_at, completed_at
  FROM image_task_v1;
  INSERT INTO image_task_attempt (
    image_task_id, attempt_number, status, error_code, error_message, started_at, completed_at
  )
  SELECT
    image_task_id, 1, status, error_code, error_message, COALESCE(started_at, updated_at), completed_at
  FROM image_task_v1
  WHERE status IN ('generating', 'succeeded', 'failed', 'interrupted');
  DROP TABLE image_task_v1;
  PRAGMA user_version = 2;
`

export const imageQueueSchemaV3 = imageQueueSchemaV2
  .replace("    attachment_document_path TEXT,", `    growth_goal_id TEXT,
    growth_work_item_id TEXT,
    growth_attempt_id TEXT,
    attachment_document_path TEXT,`)
  .replace("PRAGMA user_version = 2;", "PRAGMA user_version = 3;")

export const imageQueueSchemaV4 = imageQueueSchemaV3
  .replace("PRAGMA user_version = 3;", `
  CREATE TABLE image_project_gate (
    project_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('blocked', 'probing')),
    blocking_task_id TEXT NOT NULL,
    probe_task_id TEXT,
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    agent_probe_used INTEGER NOT NULL CHECK (agent_probe_used IN (0, 1)),
    opened_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  PRAGMA user_version = ${imageQueueSchemaVersion};`)

export const imageQueueMigrationV2ToV3 = `
  ALTER TABLE image_task ADD COLUMN growth_goal_id TEXT;
  ALTER TABLE image_task ADD COLUMN growth_work_item_id TEXT;
  ALTER TABLE image_task ADD COLUMN growth_attempt_id TEXT;
  PRAGMA user_version = 3;
`

export const imageQueueMigrationV3ToV4 = `
  CREATE TABLE image_project_gate (
    project_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('blocked', 'probing')),
    blocking_task_id TEXT NOT NULL,
    probe_task_id TEXT,
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    agent_probe_used INTEGER NOT NULL CHECK (agent_probe_used IN (0, 1)),
    opened_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  PRAGMA user_version = ${imageQueueSchemaVersion};
`
