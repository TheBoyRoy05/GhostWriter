-- Without AUTOINCREMENT SQLite hands an undone event's id to the next event, so a stale undo would delete the new one.
CREATE TABLE status_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  note TEXT
);
INSERT INTO status_events_new (id, application_id, status, at, note)
  SELECT id, application_id, status, at, note FROM status_events;
DROP TABLE status_events;
ALTER TABLE status_events_new RENAME TO status_events;
CREATE INDEX status_events_by_application ON status_events (application_id, at);
