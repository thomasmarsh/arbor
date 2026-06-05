from __future__ import annotations

from typing import TYPE_CHECKING

from arbor_cli.jsonl import find_ledger, write_ledger_jsonl
from arbor_cli.models import (
    EpicEntry, EpicNode, Ledger, StoryEntry, StoryNode,
    TaskEntry, TaskStatus, WaveEntry,
)

if TYPE_CHECKING:
    import psycopg

_COL_MAP = {
    "status": "status",
    "rank": "rank",
    "text": "text",
    "size": "size",
    "wave": "wave_id",
}


def load_ledger_from_pg(conn: psycopg.Connection) -> Ledger:
    ledger = Ledger()
    epic_index: dict[str, EpicNode] = {}
    story_index: dict[str, StoryNode] = {}

    with conn.cursor() as cur:
        cur.execute("SELECT id, title FROM ledger_epics ORDER BY id")
        for epic_id, title in cur.fetchall():
            node = EpicNode(epic=EpicEntry(type="epic", id=epic_id, title=title))
            epic_index[epic_id] = node
            ledger.epics.append(node)

        cur.execute("SELECT id, epic_id, layer, title FROM ledger_stories ORDER BY epic_id, id")
        for story_id, epic_id, layer, title in cur.fetchall():
            node = StoryNode(story=StoryEntry(
                type="story", id=story_id, epic=epic_id, layer=layer, title=title,
            ))
            story_index[story_id] = node
            if epic_id in epic_index:
                epic_index[epic_id].stories.append(node)

        cur.execute("SELECT id, name, position FROM ledger_waves ORDER BY position")
        for wave_id, name, _ in cur.fetchall():
            ledger.waves.append(WaveEntry(type="wave", id=wave_id, name=name))

        cur.execute("""
            SELECT t.id, t.kind, t.epic_id, t.story_id, t.wave_id, t.layer,
                   t.status, t.size, t.text, t.file, t.rank, t.deps
            FROM ledger_tasks t
            JOIN ledger_waves w ON t.wave_id = w.id
            ORDER BY w.position, COALESCE(t.rank, t.id * 100)
        """)
        for row in cur.fetchall():
            tid, kind, epic_id, story_id, wave_id, layer, status, size, text, file, rank, deps = row
            entry = TaskEntry(
                type="task", id=tid, kind=kind, epic=epic_id, story=story_id,
                wave=wave_id, layer=layer, status=TaskStatus(status),
                size=size, text=text, file=file, rank=rank, deps=deps or [],
            )
            if story_id in story_index:
                story_index[story_id].tasks.append(entry)

    return ledger


def update_task_pg(conn: psycopg.Connection, task_id: int, updates: dict) -> None:
    parts = [f"{_COL_MAP.get(k, k)} = %s" for k in updates]
    vals = list(updates.values()) + [task_id]
    with conn.cursor() as cur:
        cur.execute(f"UPDATE ledger_tasks SET {', '.join(parts)} WHERE id = %s", vals)
    conn.commit()


def sync_snapshot(conn: psycopg.Connection) -> None:
    """Sync the JSONL cache from Postgres. Called automatically after every write."""
    write_ledger_jsonl(load_ledger_from_pg(conn), find_ledger())
