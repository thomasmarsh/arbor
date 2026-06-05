import os
import subprocess
import time
from urllib.parse import urlparse

import typer

_CONTAINER = "arbor-postgres"
_VOLUME = "arbor-postgres-data"
_IMAGE = "postgres:16-alpine"

db_app = typer.Typer(
    help="Manage the Postgres dev container.",
    no_args_is_help=True)


def _config() -> tuple[str, str, str, str]:
    pg_url = os.environ.get("ARBOR_PG_URL", "")
    if pg_url:
        p = urlparse(pg_url)
        return (
            p.username or "arbor",
            p.password or "arbor",
            str(p.port or 5433),
            (p.path or "/arbor_dev").lstrip("/"),
        )
    return "arbor", "arbor", "5433", "arbor_dev"


@db_app.command("up")
def db_up():
    """Start (or create) the Postgres container."""
    user, password, port, dbname = _config()
    exists = subprocess.run(["podman", "container", "exists", _CONTAINER]).returncode == 0
    if exists:
        subprocess.run(["podman", "start", _CONTAINER], check=True)
    else:
        subprocess.run(
            [
                "podman", "run", "-d",
                "--name", _CONTAINER,
                "-v", f"{_VOLUME}:/var/lib/postgresql/data",
                "-e", f"POSTGRES_DB={dbname}",
                "-e", f"POSTGRES_USER={user}",
                "-e", f"POSTGRES_PASSWORD={password}",
                "-p", f"{port}:5432",
                _IMAGE,
            ],
            check=True,
        )
    typer.echo("Waiting for postgres...")
    while subprocess.run(
        ["podman", "exec", _CONTAINER, "psql", "-U", user, "-d", dbname, "-c", "SELECT 1", "-q"],
        capture_output=True,
    ).returncode != 0:
        time.sleep(1)
    typer.echo("Postgres ready.")


@db_app.command("down")
def db_down():
    """Stop the Postgres container."""
    subprocess.run(["podman", "stop", _CONTAINER], check=True)


@db_app.command("reset")
def db_reset():
    """Destroy and recreate the container and volume."""
    subprocess.run(["podman", "rm", "-f", _CONTAINER], capture_output=True)
    subprocess.run(["podman", "volume", "rm", _VOLUME], capture_output=True)
    db_up()


@db_app.command("status")
def db_status():
    """Show container state and applied migrations."""
    user, _, _, dbname = _config()
    if subprocess.run(["podman", "container", "exists", _CONTAINER]).returncode != 0:
        typer.echo(f"Container: {_CONTAINER} (not found)")
        return
    status = subprocess.run(
        ["podman", "inspect", _CONTAINER, "--format", "{{.State.Status}}"],
        capture_output=True, text=True,
    ).stdout.strip()
    typer.echo(f"Container: {_CONTAINER} ({status})")
    if status == "running":
        r = subprocess.run(
            ["podman", "exec", _CONTAINER, "psql", "-U", user, "-d", dbname,
             "-c", "SELECT name, applied_at FROM schema_migrations ORDER BY name;"],
            capture_output=True, text=True,
        )
        typer.echo(r.stdout if r.returncode == 0 else "No migrations table yet")


@db_app.command("migrate")
def db_migrate():
    """Apply pending SQL migrations (delegates to the Node runner)."""
    from arbor_cli.util import REPO_ROOT
    result = subprocess.run(
        ["pnpm", "--filter", "@arbor/api", "db:migrate"],
        cwd=str(REPO_ROOT),
    )
    raise typer.Exit(result.returncode)


@db_app.command("seed")
def db_seed():
    """Load the JSONL cache into Postgres (idempotent — safe to re-run after a DB reset)."""
    from arbor_cli.ledger import build_hierarchical_ledger, find_ledger, Size, TaskStatus
    from arbor_cli.pg import get_conn

    ledger, errors = build_hierarchical_ledger(str(find_ledger()))
    for e in errors:
        typer.echo(f"  warn: {e}", err=True)

    conn = get_conn()
    with conn.cursor() as cur:
        for epic_node in ledger.epics:
            e = epic_node.epic
            cur.execute(
                "INSERT INTO ledger_epics (id, title) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title",
                (e.id, e.title),
            )
            for story_node in epic_node.stories:
                s = story_node.story
                cur.execute(
                    "INSERT INTO ledger_stories (id, epic_id, layer, title) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET epic_id = EXCLUDED.epic_id, layer = EXCLUDED.layer, title = EXCLUDED.title",
                    (s.id, s.epic, s.layer, s.title),
                )

        for i, wave in enumerate(ledger.waves):
            cur.execute(
                "INSERT INTO ledger_waves (id, name, position) VALUES (%s, %s, %s) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position",
                (wave.id, wave.name, i),
            )

        for epic_node in ledger.epics:
            for story_node in epic_node.stories:
                for task in story_node.tasks:
                    cur.execute(
                        """INSERT INTO ledger_tasks
                             (id, kind, epic_id, story_id, wave_id, layer, status, size, text, file, rank, deps)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET
                             kind = EXCLUDED.kind, epic_id = EXCLUDED.epic_id,
                             story_id = EXCLUDED.story_id, wave_id = EXCLUDED.wave_id,
                             layer = EXCLUDED.layer, status = EXCLUDED.status,
                             size = EXCLUDED.size, text = EXCLUDED.text,
                             file = EXCLUDED.file, rank = EXCLUDED.rank, deps = EXCLUDED.deps""",
                        (
                            task.id, task.kind, task.epic, task.story,
                            task.wave, task.layer, task.status.value,
                            task.size.value if task.size else None,
                            task.text, task.file, task.rank, task.deps,
                        ),
                    )
    conn.commit()
    conn.close()

    tasks_total = sum(len(sn.tasks) for en in ledger.epics for sn in en.stories)
    typer.echo(
        f"  ✓ Seeded {len(ledger.epics)} epics, "
        f"{sum(len(en.stories) for en in ledger.epics)} stories, "
        f"{len(ledger.waves)} waves, {tasks_total} tasks"
    )
