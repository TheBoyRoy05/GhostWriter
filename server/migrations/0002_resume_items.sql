CREATE TABLE resume_items (
  kind TEXT NOT NULL CHECK (kind IN ('experiences', 'education', 'projects', 'certifications', 'skills')),
  source_id TEXT NOT NULL,
  sort INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (kind, source_id)
);
