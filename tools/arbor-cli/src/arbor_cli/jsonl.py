from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from arbor_cli.models import (
    EpicEntry, EpicNode, FlatLedgerRow, Ledger, MetaEntry,
    StoryEntry, StoryNode, TaskEntry, WaveEntry,
)
from arbor_cli.queue import _all_tasks, _sort_key
from arbor_cli.util import REPO_ROOT


def find_ledger() -> Path:
    return REPO_ROOT / "plan" / "ledger.jsonl"


def build_hierarchical_ledger(file_path: str) -> tuple[Ledger, list[str]]:
    """Parse the flat JSONL cache into a nested Ledger view tree."""
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
                    errors.append(
                        f"Line {line_idx}: field error at '{field_path}': {err['msg']} "
                        f"(got: '{err.get('input')}')"
                    )

    return view_tree, errors


def write_ledger_jsonl(ledger: Ledger, path: Path) -> None:
    """Write the canonical JSONL cache from a Ledger object."""
    lines: list[str] = []

    for epic_node in ledger.epics:
        e = epic_node.epic
        lines.append(json.dumps({"type": "epic", "id": e.id, "title": e.title}))

    for epic_node in ledger.epics:
        for story_node in epic_node.stories:
            s = story_node.story
            lines.append(json.dumps({
                "type": "story", "id": s.id, "epic": s.epic,
                "layer": s.layer, "title": s.title,
            }))

    for wave in ledger.waves:
        lines.append(json.dumps({"type": "wave", "id": wave.id, "name": wave.name}))

    wave_order = {w.id: i for i, w in enumerate(ledger.waves)}
    tasks = _all_tasks(ledger)
    tasks.sort(key=lambda t: _sort_key(wave_order, t))
    for task in tasks:
        obj: dict = {
            "type": "task", "id": task.id, "epic": task.epic, "story": task.story,
            "kind": task.kind, "wave": task.wave, "layer": task.layer,
            "status": task.status.value, "text": task.text, "file": task.file,
            "deps": list(task.deps),
        }
        if task.size is not None:
            obj["size"] = task.size.value
        if task.rank is not None:
            obj["rank"] = task.rank
        lines.append(json.dumps(obj))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
