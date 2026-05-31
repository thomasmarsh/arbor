import click

from arbor_cli.ledger import demo

@click.group()
def main():
    """Arbor Monorepo Tooling CLI"""
    pass

@main.command()
def bootstrap():
    """Bootstrap the monorepo environment."""
    click.echo("Bootstrapping Arbor...")

@main.command()
def plan():
    """Launch the TUI ledger."""
    demo()
    click.echo("Launching TUI (Not implemented yet)...")
    # This is where you will import and run your Textual App

if __name__ == "__main__":
    main()
