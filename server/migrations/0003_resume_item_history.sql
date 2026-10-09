CREATE TABLE resume_item_history (
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  change TEXT NOT NULL CHECK (change IN ('updated', 'deleted')),
  PRIMARY KEY (kind, source_id, valid_from)
);

CREATE TRIGGER resume_item_updated AFTER UPDATE OF data ON resume_items
WHEN old.data IS NOT new.data
BEGIN
  INSERT INTO resume_item_history VALUES (old.kind, old.source_id, old.data, old.synced_at, new.synced_at, 'updated');
END;

CREATE TRIGGER resume_item_deleted AFTER DELETE ON resume_items
BEGIN
  INSERT INTO resume_item_history
  VALUES (old.kind, old.source_id, old.data, old.synced_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'deleted');
END;
