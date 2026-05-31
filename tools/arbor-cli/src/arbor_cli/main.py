import click

from arbor_cli.ledger import (
    TaskStatus,
    build_hierarchical_ledger,
    compute_queue,
    compute_queue_all,
    find_ledger,
    update_task,
    _all_tasks,
)


@click.group()
def main():
    """Arbor monorepo tooling CLI."""
    pass


@main.command()
def bootstrap():
    """Bootstrap the monorepo environment."""
    click.echo("Bootstrapping Arbor...")


# ── Queue commands ────────────────────────────────────────────────────────────

@main.command("queue")
@click.option("--limit", "-n", default=20, show_default=True, help="Max rows to show")
@click.option("--all", "show_all", is_flag=True, help="Include blocked tasks")
def queue_cmd(limit: int, show_all: bool):
    """Show the work queue.

    By default only shows tasks whose dependencies are all done (ready to pick up).
    Use --all to also see blocked tasks with their unmet deps listed.
    """
    ledger, errors = build_hierarchical_ledger(str(find_ledger()))
    for e in errors:
        click.echo(f"  warn: {e}", err=True)

    header = f"  {'#':<4} {'ID':<5} {'Wave':<8} {'Rank':<6} {'Story':<7} Task"
    rule   = f"  {'-'*4} {'-'*5} {'-'*8} {'-'*6} {'-'*7} {'-'*50}"

    if show_all:
        ready, blocked = compute_queue_all(ledger)
        click.echo(f"\n  ── Ready ({len(ready)}) ──\n")
        if ready:
            click.echo(header)
            click.echo(rule)
            for i, t in enumerate(ready[:limit], 1):
                rank = str(t.rank) if t.rank is not None else "—"
                click.echo(f"  {i:<4} {t.id:<5} {t.wave:<8} {rank:<6} {t.story:<7} {t.text}")
            if len(ready) > limit:
                click.echo(f"\n  … {len(ready) - limit} more")
        else:
            click.echo("  (none)")

        click.echo(f"\n  ── Blocked ({len(blocked)}) ──\n")
        if blocked:
            click.echo(f"  {'ID':<5} {'Wave':<8} {'Blocking':<14} Task")
            click.echo(f"  {'-'*5} {'-'*8} {'-'*14} {'-'*50}")
            for t, blocking in blocked:
                deps_str = ",".join(f"#{d}" for d in blocking)
                click.echo(f"  {t.id:<5} {t.wave:<8} {deps_str:<14} {t.text}")
        else:
            click.echo("  (none)")
        click.echo()
    else:
        q = compute_queue(ledger)
        if not q:
            click.echo("\n  Queue is empty.\n")
            return
        click.echo(f"\n  Queue  ({len(q)} ready)\n")
        click.echo(header)
        click.echo(rule)
        for i, t in enumerate(q[:limit], 1):
            rank = str(t.rank) if t.rank is not None else "—"
            click.echo(f"  {i:<4} {t.id:<5} {t.wave:<8} {rank:<6} {t.story:<7} {t.text}")
        if len(q) > limit:
            click.echo(f"\n  … {len(q) - limit} more (use -n to show more)")
        click.echo()


@main.command("next")
def next_cmd():
    """Print the active task (status: next) or the top of the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))

    active = next(
        (t for t in _all_tasks(ledger) if t.status == TaskStatus.NEXT),
        None,
    )
    if active:
        click.echo(f"\n  Active: #{active.id}  {active.text}")
        click.echo(f"  Wave: {active.wave} | Story: {active.story} | File: plan/{active.file}\n")
        return

    q = compute_queue(ledger)
    if not q:
        click.echo("\n  No active task and queue is empty.\n")
        return
    task = q[0]
    click.echo(f"\n  No active task. Top of queue:")
    click.echo(f"  → #{task.id}  {task.text}  [wave: {task.wave}]")
    click.echo(f"    Run: arbor set {task.id} next\n")


@main.command("set")
@click.argument("task_id", type=int)
@click.argument("status")
def set_cmd(task_id: int, status: str):
    """Set a task's status.

    STATUS: queued | next | done | blocked | superseded
    """
    valid = {s.value for s in TaskStatus}
    if status not in valid:
        click.echo(
            f"  Invalid status '{status}'. Valid: {', '.join(sorted(valid))}", err=True
        )
        raise SystemExit(1)
    update_task(task_id, {"status": status})
    click.echo(f"  ✓ Task #{task_id} → {status}")


@main.command("bump")
@click.argument("task_id", type=int)
def bump_cmd(task_id: int):
    """Promote a task to the front of its wave in the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))
    q = compute_queue(ledger)

    target = next((t for t in q if t.id == task_id), None)
    if target is None:
        click.echo(f"  Task #{task_id} is not in the ready queue.", err=True)
        raise SystemExit(1)

    wave_tasks = [t for t in q if t.wave == target.wave]
    effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
    new_rank = max(1, min(effective) - 10)
    update_task(task_id, {"rank": new_rank})
    click.echo(f"  ✓ Task #{task_id} bumped → rank {new_rank} (wave {target.wave})")


@main.command("defer")
@click.argument("task_id", type=int)
def defer_cmd(task_id: int):
    """Push a task to the back of its wave in the queue."""
    ledger, _ = build_hierarchical_ledger(str(find_ledger()))
    q = compute_queue(ledger)

    target = next((t for t in q if t.id == task_id), None)
    if target is None:
        click.echo(f"  Task #{task_id} is not in the ready queue.", err=True)
        raise SystemExit(1)

    wave_tasks = [t for t in q if t.wave == target.wave]
    effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
    new_rank = max(effective) + 10
    update_task(task_id, {"rank": new_rank})
    click.echo(f"  ✓ Task #{task_id} deferred → rank {new_rank} (wave {target.wave})")


@main.command("tui")
def tui_cmd():
    """Launch the interactive queue browser."""
    from arbor_cli.tui import QueueApp
    QueueApp().run()


# ── Legacy ────────────────────────────────────────────────────────────────────

@main.command("plan")
def plan_cmd():
    """(Legacy) Print the ledger tree."""
    ledger, errors = build_hierarchical_ledger(str(find_ledger()))
    for e in errors:
        click.echo(f"warn: {e}", err=True)
    for epic_node in ledger.epics:
        click.echo(f"Epic: {epic_node.epic.title} [{epic_node.epic.id}]")
        for story_node in epic_node.stories:
            click.echo(f"  └── Story: {story_node.story.title}")
            for task in story_node.tasks:
                click.echo(f"      ├── [{task.status.value:10}] #{task.id} {task.text}")


if __name__ == "__main__":
    main()
