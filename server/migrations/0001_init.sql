CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL CHECK (json_valid(data))
);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY,
  company TEXT,
  position_title TEXT,
  pay_low REAL,
  pay_high REAL,
  pay_unit TEXT CHECK (pay_unit IN ('hour', 'month', 'year')),
  location TEXT,
  location_type TEXT CHECK (location_type IN ('in_person', 'hybrid', 'remote', 'unknown')),
  start_date TEXT,
  cover_letter TEXT CHECK (cover_letter IN ('required', 'optional', 'none')),
  cover_letter_sent INTEGER NOT NULL DEFAULT 0 CHECK (cover_letter_sent IN (0, 1)),
  description TEXT,
  link TEXT,
  source TEXT CHECK (source IN ('simplify', 'linkedin', 'website')),
  resume_link TEXT,
  req_id TEXT,
  deadline TEXT,
  contacts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(contacts)),
  notes TEXT
);

CREATE TABLE status_events (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  note TEXT
);

CREATE INDEX status_events_by_application ON status_events (application_id, at);
