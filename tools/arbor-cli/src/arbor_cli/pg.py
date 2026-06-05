import os
from pathlib import Path
import psycopg

from arbor_cli.util import REPO_ROOT


def _load_env_local() -> None:
    """Load ARBOR_PG_URL from apps/api/.env.local if not already in the environment."""
    if os.environ.get("ARBOR_PG_URL"):
        return
    env_file = REPO_ROOT / "apps" / "api" / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key == "ARBOR_PG_URL" and key not in os.environ:
            os.environ[key] = value.strip()


def get_conn() -> psycopg.Connection:
    _load_env_local()
    url = os.environ.get("ARBOR_PG_URL")
    if not url:
        raise SystemExit("ARBOR_PG_URL not set — set it in apps/api/.env.local or the environment")
    return psycopg.connect(url)
