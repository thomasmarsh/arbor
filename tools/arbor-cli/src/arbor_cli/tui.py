from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.widgets import DataTable, Footer, Header, Static

from arbor_cli.ledger import (
    TaskEntry,
    TaskStatus,
    build_hierarchical_ledger,
    compute_display_groups,
    find_ledger,
    update_task,
)

_STATUS_LABELS: dict[TaskStatus, str] = {
    TaskStatus.IN_PROGRESS: "in_progress",
    TaskStatus.NEXT: "next",
    TaskStatus.TODO: "todo",
    TaskStatus.DONE: "done",
    TaskStatus.CANCELED: "canceled",
}
_GREYED = {TaskStatus.DONE, TaskStatus.CANCELED}


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
        Binding("a", "toggle_all", "Toggle All"),
        Binding("r", "refresh_queue", "Refresh"),
        Binding("q", "quit", "Quit"),
    ]

    show_all: reactive[bool] = reactive(False)

    def __init__(self) -> None:
        super().__init__()
        self._tasks: list[TaskEntry] = []

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="status")
        yield DataTable(cursor_type="row")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("ID", "Wave", "Rank", "State", "Size", "Deps", "Task")
        self.action_refresh_queue()

    def action_refresh_queue(self) -> None:
        ledger, _ = build_hierarchical_ledger(str(find_ledger()))
        table = self.query_one(DataTable)
        table.clear()
        self._tasks = []

        in_progress, ready, blocked, done, canceled = compute_display_groups(ledger)

        def _add(task: TaskEntry, deps: list[int], dim: bool = False) -> None:
            self._tasks.append(task)
            label = _STATUS_LABELS.get(task.status, task.status.value)
            size_str = task.size.value if task.size else "—"
            deps_str = ",".join(str(d) for d in deps) if deps else "—"

            def _c(val: str) -> "str | Text":
                return Text(val, style="dim") if dim else val

            table.add_row(
                _c(str(task.id)),
                _c(task.wave),
                _c(str(task.rank) if task.rank is not None else "—"),
                _c(label),
                _c(size_str),
                _c(deps_str),
                _c(task.text),
            )

        for t in in_progress:
            _add(t, [])
        for t in ready:
            _add(t, [])
        for t, pending in blocked:
            _add(t, pending)

        active_count = len(in_progress) + len(ready) + len(blocked)

        if self.show_all:
            for t in done:
                _add(t, [], dim=True)
            for t in canceled:
                _add(t, [], dim=True)
            greyed = len(done) + len(canceled)
            status = f"{active_count} active  {greyed} done/canceled  [a] to hide"
        else:
            status = (
                f"{len(in_progress)} in-progress  "
                f"{len(ready)} ready  "
                f"{len(blocked)} blocked  "
                f"[a] to show all"
            )

        self.query_one("#status", Static).update(status)

    def action_toggle_all(self) -> None:
        self.show_all = not self.show_all
        self.action_refresh_queue()

    def _selected_task(self) -> TaskEntry | None:
        table = self.query_one(DataTable)
        row = table.cursor_row
        if 0 <= row < len(self._tasks):
            return self._tasks[row]
        return None

    def _apply(self, updates: dict) -> None:
        task = self._selected_task()
        if task is not None:
            update_task(task.id, updates)
            self.action_refresh_queue()

    def action_set_next(self) -> None:
        self._apply({"status": TaskStatus.NEXT.value})

    def action_set_done(self) -> None:
        self._apply({"status": TaskStatus.DONE.value})

    def action_bump_task(self) -> None:
        task = self._selected_task()
        if task is None:
            return
        wave_tasks = [t for t in self._tasks if t.wave == task.wave]
        effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
        update_task(task.id, {"rank": max(1, min(effective) - 10)})
        self.action_refresh_queue()

    def action_defer_task(self) -> None:
        task = self._selected_task()
        if task is None:
            return
        wave_tasks = [t for t in self._tasks if t.wave == task.wave]
        effective = [t.rank if t.rank is not None else t.id * 100 for t in wave_tasks]
        update_task(task.id, {"rank": max(effective) + 10})
        self.action_refresh_queue()
