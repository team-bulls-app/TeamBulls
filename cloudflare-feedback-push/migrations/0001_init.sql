-- Start at migration time so deploying the bridge never re-sends historical feedback.
CREATE TABLE IF NOT EXISTS cursor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  created_at TEXT NOT NULL,
  document_name TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO cursor_state (id, created_at, document_name)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '');

CREATE TABLE IF NOT EXISTS feedback_outbox (
  feedback_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  trainer_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  page_token TEXT NOT NULL DEFAULT '',
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'ignored'))
);
CREATE INDEX IF NOT EXISTS feedback_outbox_ready
  ON feedback_outbox(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS feedback_delivery (
  feedback_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'invalid')),
  PRIMARY KEY (feedback_id, device_id),
  FOREIGN KEY (feedback_id) REFERENCES feedback_outbox(feedback_id) ON DELETE CASCADE
);
