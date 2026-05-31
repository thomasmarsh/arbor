from pathlib import Path
from enum import Enum
from typing import List, Optional, Union, Literal
from pydantic import BaseModel, Field, RootModel, ValidationError
import json

from arbor_cli.util import REPO_ROOT


class TaskStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELED = "canceled"
    NEXT = "next"
    TODO = "todo"


class Size(str, Enum):
    XS = "xs"
    S = "s"
    M = "m"
    L = "l"
    XL = "xl"

STATUS_ORDER = [
    TaskStatus.IN_PROGRESS,
    TaskStatus.NEXT,
    TaskStatus.TODO,
    TaskStatus.DONE,
    TaskStatus.CANCELED,
]


class MetaEntry(BaseModel):
    type: Literal["meta"]
    version: str
    description: str

class EpicEntry(BaseModel):
    type: Literal["epic"]
    id: str
    title: str


class StoryEntry(BaseModel):
    type: Literal["story"]
    id: str
    epic: str
    layer: str
    title: str


class WaveEntry(BaseModel):
    type: Literal["wave"]
    id: str
    name: str


class TaskEntry(BaseModel):
    type: Literal["task"]
    kind: Literal["spike", "task"]
    id: int
    epic: str
    story: str
    wave: str
    layer: str
    status: TaskStatus
    text: str
    file: str
    size: Optional[Size]
    deps: List[int] = Field(default_factory=list)
    rank: Optional[int] = None


# Discriminated union for parsing flat JSONL rows
class FlatLedgerRow(RootModel):
    root: Union[MetaEntry, EpicEntry, StoryEntry, WaveEntry, TaskEntry] = Field(
        ..., discriminator="type"
    )


# ── View tree ────────────────────────────────────────────────────────────────

class StoryNode(BaseModel):
    story: StoryEntry
    tasks: List[TaskEntry] = Field(default_factory=list)


class EpicNode(BaseModel):
    epic: EpicEntry
    stories: List[StoryNode] = Field(default_factory=list)


class Ledger(BaseModel):
    meta: Optional[MetaEntry] = None
    epics: List[EpicNode] = Field(default_factory=list)
    waves: List[WaveEntry] = Field(default_factory=list)


# ── I/O ──────────────────────────────────────────────────────────────────────

def find_ledger() -> Path:
    return REPO_ROOT / "plan" / "ledger.jsonl"


def build_hierarchical_ledger(file_path: str) -> tuple[Ledger, list[str]]:
    """Parse the flat JSONL ledger into a nested view tree."""
    view_tree = Ledger()
    errors: list[str] = []
    epic_index: dict[str, EpicNode] = {}
    story_index: dict[str, StoryNode] = {}

    with open(file_path, "r", encoding="utf-8") as f:
        for line_idx, line in enumerate(f, start=1):
            clean_line = line.strip()
            if not clean_line:
                continue
            try:
                raw_dict = json.loads(clean_line)
                parsed_row = FlatLedgerRow.model_validate(raw_dict).root

                if isinstance(parsed_row, MetaEntry):
                    view_tree.meta = parsed_row
                elif isinstance(parsed_row, WaveEntry):
                    view_tree.waves.append(parsed_row)
                elif isinstance(parsed_row, EpicEntry):
                    epic_node = EpicNode(epic=parsed_row)
                    epic_index[parsed_row.id] = epic_node
                    view_tree.epics.append(epic_node)
                elif isinstance(parsed_row, StoryEntry):
                    story_node = StoryNode(story=parsed_row)
                    if parsed_row.epic in epic_index:
                        epic_index[parsed_row.epic].stories.append(story_node)
                        story_index[parsed_row.id] = story_node
                    else:
                        errors.append(
                            f"Line {line_idx} (story): orphaned — epic '{parsed_row.epic}' not found"
                        )
                elif isinstance(parsed_row, TaskEntry):
                    if parsed_row.story in story_index:
                        story_index[parsed_row.story].tasks.append(parsed_row)
                    else:
                        errors.append(
                            f"Line {line_idx} (task/{parsed_row.kind}): orphaned — story '{parsed_row.story}' not found"
                        )

            except json.JSONDecodeError as e:
                errors.append(f"Line {line_idx}: invalid JSON — {e}")
            except ValidationError as e:
                for err in e.errors():
                    field_path = ".".join(str(p) for p in err["loc"])
                    bad_input = err.get("input")
                    errors.append(
                        f"Line {line_idx}: field error at '{field_path}': {err['msg']} "
                        f"(got: '{bad_input}')"
                    )

    return view_tree, errors


def _all_tasks(ledger: Ledger) -> list[TaskEntry]:
    return [
        task
        for epic_node in ledger.epics
        for story_node in epic_node.stories
        for task in story_node.tasks
    ]


# ── Queue computation ─────────────────────────────────────────────────────────

def _sort_key(wave_order: dict[str, int], t: "TaskEntry") -> tuple[int, int]:
    return (wave_order.get(t.wave, 999), t.rank if t.rank is not None else t.id * 100)


def compute_queue(ledger: Ledger) -> list[TaskEntry]:
    """Ready tasks: todo with all deps done, sorted by (wave_index, rank ?? id*100)."""
    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    done_ids = {t.id for t in _all_tasks(ledger) if t.status == TaskStatus.DONE}

    ready = [
        t for t in _all_tasks(ledger)
        if t.status == TaskStatus.TODO
        and all(dep in done_ids for dep in t.deps)
    ]
    ready.sort(key=lambda t: _sort_key(wave_order, t))
    return ready


def compute_queue_all(
    ledger: Ledger,
) -> tuple[list[TaskEntry], list[tuple[TaskEntry, list[int]]]]:
    """All todo tasks split into (ready, blocked).

    blocked entries are (task, [blocking_dep_ids]), sorted the same way as ready.
    """
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


# ── Mutations ─────────────────────────────────────────────────────────────────

def update_task(task_id: int, updates: dict) -> None:
    """Rewrite one task's fields in ledger.jsonl in-place."""
    path = find_ledger()
    lines = path.read_text(encoding="utf-8").splitlines()
    new_lines: list[str] = []
    found = False
    for line in lines:
        stripped = line.strip()
        if stripped:
            try:
                obj = json.loads(stripped)
                if obj.get("type") == "task" and obj.get("id") == task_id:
                    obj.update(updates)
                    line = json.dumps(obj)
                    found = True
            except json.JSONDecodeError:
                pass
        new_lines.append(line)
    if not found:
        raise ValueError(f"Task {task_id} not found in ledger")
    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def get_all_tasks(ledger: Ledger) -> list[TaskEntry]:
    """All tasks sorted by status priority (STATUS_ORDER) then wave/rank."""
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
    """Partition all tasks into display groups: (in_progress, ready, blocked, done, canceled).

    in_progress: IN_PROGRESS or NEXT status.
    ready: TODO with all deps satisfied (done or canceled).
    blocked: TODO with at least one unsatisfied dep — paired with the blocking dep ids.
    done / canceled: terminal statuses.
    All groups sorted by (wave_index, rank ?? id*100).
    """
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


# ── Legacy helpers ────────────────────────────────────────────────────────────

def export_to_mermaid_string(view_tree: Ledger) -> str:
    lines = ["graph TD"]
    for epic_node in view_tree.epics:
        epic = epic_node.epic
        lines.append(f'    epic_{epic.id}["EPIC: {epic.title}"]')
        for story_node in epic_node.stories:
            story = story_node.story
            lines.append(f'    story_{story.id}["STORY: {story.title}"]')
            lines.append(f"    epic_{epic.id} --> story_{story.id}")
            for task in story_node.tasks:
                lines.append(f'    task_{task.id}["Task #{task.id}: {task.text}"]')
                lines.append(f"    story_{story.id} --> task_{task.id}")
    return "\n".join(lines)
