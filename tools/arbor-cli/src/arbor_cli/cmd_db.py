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
