import re
import secrets
import shutil
import subprocess
from pathlib import Path

import typer


def setup():
    """Scaffold .env.local files for each app (skips existing files)."""
    secret = secrets.token_hex(32)

    _copy_env(Path("apps/api/.env.example"), Path("apps/api/.env.local"))
    _copy_env(Path("apps/bff/.env.example"), Path("apps/bff/.env.local"), secret)
    _copy_env(Path("apps/bff/.env.example"), Path("apps/bff/.env.staging.local"), secret)

    typer.echo("\nDone.\n")
    typer.echo("To get started:\n")
    typer.echo("  pnpm install")
    typer.echo("  pnpm db:reset     # set up db")
    typer.echo("  pnpm db:generate  # codegen pgtype queries")
    typer.echo("  pnpm build        # compile")
    typer.echo("  pnpm dev:mock     # run stack")


def certs():
    """Generate local TLS certificates with mkcert."""
    if shutil.which("mkcert") is None:
        typer.echo("mkcert not found. Install with: brew install mkcert", err=True)
        raise typer.Exit(1)
    subprocess.run(["mkcert", "-install"], check=True)
    Path("certs").mkdir(exist_ok=True)
    subprocess.run(
        [
            "mkcert",
            "-cert-file", "certs/localhost+2.pem",
            "-key-file", "certs/localhost+2-key.pem",
            "localhost", "127.0.0.1", "::1",
        ],
        check=True,
    )
    typer.echo("✓ Certs generated in certs/")


def _copy_env(src: Path, dst: Path, session_secret: str | None = None) -> None:
    if dst.exists():
        typer.echo(f"skipped  {dst} (already exists)")
        return
    content = src.read_text()
    if session_secret:
        content = re.sub(
            r"^ARBOR_SESSION_SECRET=.*$",
            f"ARBOR_SESSION_SECRET={session_secret}",
            content,
            flags=re.MULTILINE,
        )
    dst.write_text(content)
    typer.echo(f"created  {dst}")
