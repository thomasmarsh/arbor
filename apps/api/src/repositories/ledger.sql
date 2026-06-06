/* @name GetAllTasks */
SELECT
  t.id,
  t.kind,
  t.epic_id  AS epic,
  t.story_id AS story,
  t.wave_id  AS wave,
  t.layer,
  t.status,
  t.size,
  t.text,
  t.file,
  t.rank,
  t.deps
FROM ledger_tasks t
JOIN ledger_waves w ON t.wave_id = w.id
ORDER BY w.position, COALESCE(t.rank, t.id * 100);

/* @name GetAllWaves */
SELECT id, name FROM ledger_waves ORDER BY position;

/* @name GetTaskById */
SELECT
  id,
  kind,
  epic_id  AS epic,
  story_id AS story,
  wave_id  AS wave,
  layer,
  status,
  size,
  text,
  file,
  rank,
  deps
FROM ledger_tasks
WHERE id = :id;

/* @name UpdateTaskStatus */
UPDATE ledger_tasks
SET status = :status
WHERE id = :id
RETURNING
  id,
  kind,
  epic_id  AS epic,
  story_id AS story,
  wave_id  AS wave,
  layer,
  status,
  size,
  text,
  file,
  rank,
  deps;

/* @name UpdateTaskRank */
UPDATE ledger_tasks
SET rank = :rank
WHERE id = :id
RETURNING
  id,
  kind,
  epic_id  AS epic,
  story_id AS story,
  wave_id  AS wave,
  layer,
  status,
  size,
  text,
  file,
  rank,
  deps;

/* @name GetAllEpics */
SELECT id, title FROM ledger_epics ORDER BY id;

/* @name GetAllStories */
SELECT id, epic_id AS epic, layer, title FROM ledger_stories ORDER BY epic_id, id;
