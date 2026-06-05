import typer

from arbor_cli import commands, cmd_setup
from arbor_cli.cmd_db import db_app

app = typer.Typer(
    help="Arbor monorepo tooling CLI.",
    no_args_is_help=True)

app.add_typer(db_app, name="db")

app.command()(commands.bootstrap)
app.command("task")(commands.task_cmd)
app.command("next")(commands.next_cmd)
app.command("set")(commands.set_cmd)
app.command("bump")(commands.bump_cmd)
app.command("defer")(commands.defer_cmd)
app.command("add")(commands.add_cmd)
app.command("tui")(commands.tui_cmd)
app.command("plan")(commands.plan_cmd)
app.command("snapshot")(commands.snapshot_cmd)
app.command("validate")(commands.validate_cmd)

app.command()(cmd_setup.setup)
app.command()(cmd_setup.certs)


def main():
    app()


if __name__ == "__main__":
    main()
