CREATE TABLE ledger_epics (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE ledger_stories (
  id      TEXT PRIMARY KEY,
  epic_id TEXT NOT NULL REFERENCES ledger_epics(id),
  layer   TEXT NOT NULL,
  title   TEXT NOT NULL
);

CREATE TABLE ledger_waves (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  position INT  NOT NULL
);

CREATE TABLE ledger_tasks (
  id       INT  PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('task', 'spike')),
  epic_id  TEXT NOT NULL REFERENCES ledger_epics(id),
  story_id TEXT NOT NULL REFERENCES ledger_stories(id),
  wave_id  TEXT NOT NULL REFERENCES ledger_waves(id),
  layer    TEXT NOT NULL,
  status   TEXT NOT NULL CHECK (status IN ('todo', 'next', 'in_progress', 'done', 'canceled')),
  size     TEXT          CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  text     TEXT NOT NULL,
  file     TEXT NOT NULL,
  rank     INT,
  deps     INT[] NOT NULL DEFAULT '{}'
);
