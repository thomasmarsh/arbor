import secrets
import shutil
import subprocess
from pathlib import Path

import typer


def setup():
    """Scaffold .env.local files for each app (skips existing files)."""
    session_secret = secrets.token_hex(32)

    _create_env(
        Path("apps/api/.env.local"),
        "ARBOR_PG_URL=postgresql://arbor:arbor@localhost:5433/arbor_dev\n"
        "ARBOR_ORACLE_USER=user\n"
        "ARBOR_ORACLE_PASSWORD=password\n"
        "ARBOR_ORACLE_CONNECT_STRING=localhost:1521/XEPDB1\n"
        "API_PORT=3001\n",
    )
    _create_env(
        Path("apps/bff/.env.local"),
        "# OIDC credentials — only needed for dev:bff, not dev:mock\n"
        "ARBOR_OIDC_ISSUER=http://localhost:8080/realms/arbor\n"
        "ARBOR_OIDC_CLIENT_ID=arbor-bff\n"
        "ARBOR_OIDC_CLIENT_SECRET=\n"
        "ARBOR_OIDC_REDIRECT_URI=http://localhost:3000/auth/callback\n"
        f"ARBOR_SESSION_SECRET={session_secret}\n"
        "ARBOR_API_URL=http://localhost:3001\n"
        "NODE_ENV=development\n"
        "BFF_PORT=3000\n",
    )
    _create_env(
        Path("apps/bff/.env.staging.local"),
        "# Fill in real staging credentials before using dev:staging\n"
        "ARBOR_OIDC_ISSUER=https://your-idp.example.com/realms/arbor\n"
        "ARBOR_OIDC_CLIENT_ID=arbor-bff-staging\n"
        "ARBOR_OIDC_CLIENT_SECRET=\n"
        "ARBOR_OIDC_REDIRECT_URI=https://localhost:3000/auth/callback\n"
        f"ARBOR_SESSION_SECRET={session_secret}\n"
        "ARBOR_API_URL=http://localhost:3001\n",
    )
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


def _create_env(path: Path, contents: str) -> None:
    if path.exists():
        typer.echo(f"skipped  {path} (already exists)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents)
    typer.echo(f"created  {path}")
