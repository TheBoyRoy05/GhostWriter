-- Sync upserts set only sort and data, so a classified row survives every resync, and prune drops it with its skill.
ALTER TABLE resume_items ADD COLUMN skill_row TEXT
  CHECK (skill_row IS NULL OR (kind = 'skills' AND skill_row IN ('languages', 'tools', 'domain')));
