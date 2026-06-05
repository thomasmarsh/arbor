"""Re-export hub — import from here for backward compatibility."""

from arbor_cli.models import (  # noqa: F401
    EpicEntry, EpicNode, FlatLedgerRow, Ledger, MetaEntry,
    Size, STATUS_ORDER, StoryEntry, StoryNode, TaskEntry, TaskStatus, WaveEntry,
)
from arbor_cli.jsonl import (  # noqa: F401
    build_hierarchical_ledger, find_ledger, write_ledger_jsonl,
)
from arbor_cli.queue import (  # noqa: F401
    _all_tasks, _sort_key, compute_display_groups, compute_queue,
    compute_queue_all, get_all_tasks,
)
from arbor_cli.pg_store import (  # noqa: F401
    load_ledger_from_pg, sync_snapshot, update_task_pg,
)


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
