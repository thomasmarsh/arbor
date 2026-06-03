from typing import Annotated

import typer

from arbor_cli.ledger import (
    TaskStatus,
    _all_tasks,
    build_hierarchical_ledger,
    compute_queue,
    compute_queue_all,
    find_ledger,
    update_task,
)


def bootstrap():
    """Bootstrap the monorepo environment."""
    typer.echo("Bootstrapping Arbor...")


def task_cmd(
    limit: Annotated[int, typer.Option("--limit", "-n", help="Max rows to show")] = 20,
    show_all: Annotated[bool, typer.Option("--all", help="Include blocked tasks", is_flag=True)] = False,
):
    """Show the task queue.

    By default only shows tasks whose dependencies are all done (ready to pick up).
    Use --all to also see blocked tasks with their unmet deps listed.
    """
    ledger, errors = build_hierarchical_ledger(str(find_ledger()))
    for e in errors:
        typer.echo(f"  warn: {e}", err=True)

    header = f"  {'#':<4} {'ID':<5} {'Wave':<8} {'Rank':<6} {'Story':<7} Task"
    rule   = f"  {'-'*4} {'-'*5} {'-'*8} {'-'*6} {'-'*7} {'-'*50}"

    if show_all:
        ready, blocked = compute_queue_all(ledger)
        typer.echo(f"\n  ── Ready ({len(ready)}) ──\n")
        if ready:
            typer.echo(header)
            typer.echo(rule)
            for i, t in enumerate(ready[:limit], 1):
                rank = str(t.rank) if t.rank is not None else "—"
                typer.echo(f"  {i:<4} {t.id:<5} {t.wave:<8} {rank:<6} {t.story:<7} {t.text}")
            if len(ready) > limit:
                typer.echo(f"\n  … {len(ready) - limit} more")
        else:
            typer.echo("  (none)")

        typer.echo(f"\n  ── Blocked ({len(blocked)}) ──\n")
        if blocked:
            typer.echo(f"  {'ID':<5} {'Wave':<8} {'Blocking':<14} Task")
            typer.echo(f"  {'-'*5} {'-'*8} {'-'*14} {'-'*50}")
            for t, blocking in blocked:
                deps_str = ",".join(f"#{d}" for d in blocking)
                typer.echo(f"  {t.id:<5} {t.wave:<8} {deps_str:<14} {t.text}")
        else:
            typer.echo("  (none)")
        typer.echo()
    else:
        q = compute_queue(ledger)
        if not q:
            typer.echo("\n  Queue is empty.\n")
            return
        typer.echo(f"\n  Queue  ({len(q)} ready)\n")
        typer.echo(header)
        typer.echo(rule)
        for i, t in enumerate(q[:limit], 1):
            rank = str(t.rank) if t.rank is not None else "—"
            typer.echo(f"  {i:<4} {t.id:<5} {t.wave:<8} {rank:<6} {t.story:<7} {t.text}")
        if len(q) > limit:
            typer.echo(f"\n  … {len(q) - limit} more (use -n to show more)")
        typer.echo()


def next_cmd():
    """Print the active task (status: next) or the top of the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))

    active = next(
        (t for t in _all_tasks(ledger) if t.status == TaskStatus.NEXT),
        None,
    )
    if active:
        typer.echo(f"\n  Active: #{active.id}  {active.text}")
        typer.echo(f"  Wave: {active.wave} | Story: {active.story} | File: plan/{active.file}\n")
        return

    q = compute_queue(ledger)
    if not q:
        typer.echo("\n  No active task and queue is empty.\n")
        return
    task = q[0]
    typer.echo(f"\n  No active task. Top of queue:")
    typer.echo(f"  → #{task.id}  {task.text}  [wave: {task.wave}]")
    typer.echo(f"    Run: arbor set {task.id} next\n")


def set_cmd(task_id: int, status: str):
    """Set a task's status.

    STATUS: todo | next | done | canceled
    """
    valid = {s.value for s in TaskStatus}
    if status not in valid:
        typer.echo(
            f"  Invalid status '{status}'. Valid: {', '.join(sorted(valid))}", err=True
        )
        raise typer.Exit(1)
    update_task(task_id, {"status": status})
    typer.echo(f"  ✓ Task #{task_id} → {status}")


def bump_cmd(task_id: int):
    """Promote a task to the front of its wave in the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))
    q = compute_queue(ledger)

    target = next((t for t in q if t.id == task_id), None)
    if target is None:
        typer.echo(f"  Task #{task_id} is not in the ready queue.", err=True)
        raise typer.Exit(1)

    wave_tasks = [t for t in q if t.wave == target.wave]
    effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
    new_rank = max(1, min(effective) - 10)
    update_task(task_id, {"rank": new_rank})
    typer.echo(f"  ✓ Task #{task_id} bumped → rank {new_rank} (wave {target.wave})")


def defer_cmd(task_id: int):
    """Push a task to the back of its wave in the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))
    q = compute_queue(ledger)

    target = next((t for t in q if t.id == task_id), None)
    if target is None:
        typer.echo(f"  Task #{task_id} is not in the ready queue.", err=True)
        raise typer.Exit(1)

    wave_tasks = [t for t in q if t.wave == target.wave]
    effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
    new_rank = max(effective) + 10
    update_task(task_id, {"rank": new_rank})
    typer.echo(f"  ✓ Task #{task_id} deferred → rank {new_rank} (wave {target.wave})")


def tui_cmd():
    """Launch the interactive queue browser."""
    from arbor_cli.tui import QueueApp
    QueueApp().run()


def plan_cmd():
    """(Legacy) Print the ledger tree."""
    ledger, errors = build_hierarchical_ledger(str(find_ledger()))
    for e in errors:
        typer.echo(f"warn: {e}", err=True)
    for epic_node in ledger.epics:
        typer.echo(f"Epic: {epic_node.epic.title} [{epic_node.epic.id}]")
        for story_node in epic_node.stories:
            typer.echo(f"  └── Story: {story_node.story.title}")
            for task in story_node.tasks:
                typer.echo(f"      ├── [{task.status.value:10}] #{task.id} {task.text}")
