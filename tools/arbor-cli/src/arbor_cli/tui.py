from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.widgets import DataTable, Footer, Header, Static

from arbor_cli.ledger import (
    TaskStatus,
    build_hierarchical_ledger,
    compute_queue,
    compute_queue_all,
    find_ledger,
    update_task,
)


class QueueApp(App):
    """Interactive ledger queue browser."""

    TITLE = "Arbor Queue"
    CSS = """
    #status { height: 1; padding: 0 1; color: $text-muted; }
    """
    BINDINGS = [
        Binding("n", "set_next", "Set Next"),
        Binding("d", "set_done", "Set Done"),
        Binding("b", "bump_task", "Bump"),
        Binding("D", "defer_task", "Defer"),
        Binding("a", "toggle_all", "Toggle Blocked"),
        Binding("r", "refresh_queue", "Refresh"),
        Binding("q", "quit", "Quit"),
    ]

    show_all: reactive[bool] = reactive(False)

    def __init__(self) -> None:
        super().__init__()
        self._task_ids: list[int] = []

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="status")
        yield DataTable(cursor_type="row")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("ID", "Wave", "Rank", "State", "Task")
        self.action_refresh_queue()

    def action_refresh_queue(self) -> None:
        ledger, _ = build_hierarchical_ledger(str(find_ledger()))
        table = self.query_one(DataTable)
        table.clear()
        self._task_ids = []

        if self.show_all:
            ready, blocked = compute_queue_all(ledger)
            for task in ready:
                self._task_ids.append(task.id)
                table.add_row(
                    str(task.id), task.wave,
                    str(task.rank) if task.rank is not None else "—",
                    "ready", task.text,
                )
            for task, blocking in blocked:
                self._task_ids.append(task.id)
                deps_str = "blocked:" + ",".join(f"#{d}" for d in blocking)
                table.add_row(
                    str(task.id), task.wave,
                    str(task.rank) if task.rank is not None else "—",
                    deps_str, task.text,
                )
            status = f"{len(ready)} ready  {len(blocked)} blocked  [a] to hide blocked"
        else:
            queue = compute_queue(ledger)
            for task in queue:
                self._task_ids.append(task.id)
                table.add_row(
                    str(task.id), task.wave,
                    str(task.rank) if task.rank is not None else "—",
                    "ready", task.text,
                )
            status = f"{len(queue)} ready  [a] to show blocked"

        self.query_one("#status", Static).update(status)

    def action_toggle_all(self) -> None:
        self.show_all = not self.show_all
        self.action_refresh_queue()

    def _selected_id(self) -> int | None:
        table = self.query_one(DataTable)
        row = table.cursor_row
        if 0 <= row < len(self._task_ids):
            return self._task_ids[row]
        return None

    def _apply(self, updates: dict) -> None:
        task_id = self._selected_id()
        if task_id is not None:
            update_task(task_id, updates)
            self.action_refresh_queue()

    def action_set_next(self) -> None:
        self._apply({"status": TaskStatus.NEXT.value})

    def action_set_done(self) -> None:
        self._apply({"status": TaskStatus.DONE.value})

    def action_bump_task(self) -> None:
        task_id = self._selected_id()
        if task_id is None:
            return
        ledger, _ = build_hierarchical_ledger(str(find_ledger()))
        queue = compute_queue(ledger)
        target = next((t for t in queue if t.id == task_id), None)
        if target is None:
            return
        wave_tasks = [t for t in queue if t.wave == target.wave]
        effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
        update_task(task_id, {"rank": max(1, min(effective) - 10)})
        self.action_refresh_queue()

    def action_defer_task(self) -> None:
        task_id = self._selected_id()
        if task_id is None:
            return
        ledger, _ = build_hierarchical_ledger(str(find_ledger()))
        queue = compute_queue(ledger)
        target = next((t for t in queue if t.id == task_id), None)
        if target is None:
            return
        wave_tasks = [t for t in queue if t.wave == target.wave]
        effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
        update_task(task_id, {"rank": max(effective) + 10})
        self.action_refresh_queue()
