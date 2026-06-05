from __future__ import annotations

from arbor_cli.models import Ledger, TaskEntry, TaskStatus, STATUS_ORDER


def _all_tasks(ledger: Ledger) -> list[TaskEntry]:
    return [
        task
        for epic_node in ledger.epics
        for story_node in epic_node.stories
        for task in story_node.tasks
    ]


def _sort_key(wave_order: dict[str, int], t: TaskEntry) -> tuple[int, int]:
    return (wave_order.get(t.wave, 999), t.rank if t.rank is not None else t.id * 100)


def compute_queue(ledger: Ledger) -> list[TaskEntry]:
    """Ready tasks: todo with all deps satisfied, sorted by (wave_index, rank ?? id*100)."""
    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    done_ids = {t.id for t in _all_tasks(ledger) if t.status == TaskStatus.DONE}
    ready = [
        t for t in _all_tasks(ledger)
        if t.status == TaskStatus.TODO and all(dep in done_ids for dep in t.deps)
    ]
    ready.sort(key=lambda t: _sort_key(wave_order, t))
    return ready


def compute_queue_all(
    ledger: Ledger,
) -> tuple[list[TaskEntry], list[tuple[TaskEntry, list[int]]]]:
    """All todo tasks split into (ready, blocked_with_pending_deps)."""
    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    done_ids = {t.id for t in _all_tasks(ledger) if t.status == TaskStatus.DONE}
    ready: list[TaskEntry] = []
    blocked: list[tuple[TaskEntry, list[int]]] = []
    for t in _all_tasks(ledger):
        if t.status != TaskStatus.TODO:
            continue
        blocking = [dep for dep in t.deps if dep not in done_ids]
        if blocking:
            blocked.append((t, blocking))
        else:
            ready.append(t)
    ready.sort(key=lambda t: _sort_key(wave_order, t))
    blocked.sort(key=lambda pair: _sort_key(wave_order, pair[0]))
    return ready, blocked


def get_all_tasks(ledger: Ledger) -> list[TaskEntry]:
    """All tasks sorted by status priority then wave/rank."""
    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    status_priority = {s: i for i, s in enumerate(STATUS_ORDER)}
    tasks = _all_tasks(ledger)
    tasks.sort(key=lambda t: (status_priority.get(t.status, 99), _sort_key(wave_order, t)))
    return tasks


def compute_display_groups(ledger: Ledger) -> tuple[
    list[TaskEntry],
    list[TaskEntry],
    list[tuple[TaskEntry, list[int]]],
    list[TaskEntry],
    list[TaskEntry],
]:
    """Partition all tasks into (in_progress, ready, blocked, done, canceled)."""
    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    tasks = _all_tasks(ledger)
    satisfied_ids = {t.id for t in tasks if t.status in (TaskStatus.DONE, TaskStatus.CANCELED)}

    in_progress: list[TaskEntry] = []
    ready: list[TaskEntry] = []
    blocked: list[tuple[TaskEntry, list[int]]] = []
    done: list[TaskEntry] = []
    canceled: list[TaskEntry] = []

    for t in tasks:
        if t.status in (TaskStatus.IN_PROGRESS, TaskStatus.NEXT):
            in_progress.append(t)
        elif t.status == TaskStatus.TODO:
            pending = [dep for dep in t.deps if dep not in satisfied_ids]
            if pending:
                blocked.append((t, pending))
            else:
                ready.append(t)
        elif t.status == TaskStatus.DONE:
            done.append(t)
        elif t.status == TaskStatus.CANCELED:
            canceled.append(t)

    key = lambda t: _sort_key(wave_order, t)
    in_progress.sort(key=key)
    ready.sort(key=key)
    blocked.sort(key=lambda pair: key(pair[0]))
    done.sort(key=key)
    canceled.sort(key=key)

    return in_progress, ready, blocked, done, canceled
