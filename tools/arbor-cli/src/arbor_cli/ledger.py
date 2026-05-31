from enum import Enum
from typing import List, Optional, Union, Literal
from pydantic import BaseModel, Field, RootModel, ValidationError
import json

from arbor_cli.util import REPO_ROOT

class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SUPERSEDED = "superseded"
    BLOCKED = "blocked"
    NEXT = "next"
    QUEUED = "queued"

class MetaEntry(BaseModel):
    type: Literal["meta"]
    version: str
    description: str

class EpicEntry(BaseModel):
    type: Literal["epic"]
    id: str
    title: str

class StoryEntry(BaseModel):
    type: Literal["story"]
    id: str
    epic: str
    layer: str
    title: str

class WaveEntry(BaseModel):
    type: Literal["wave"]
    id: str
    name: str

class TaskEntry(BaseModel):
    type: Literal["task"]
    kind: Literal["spike", "task"]
    id: int
    epic: str
    story: str
    wave: str
    layer: str
    status: TaskStatus
    text: str
    file: str


# The complete Discriminated Union used to parse incoming lines
class FlatLedgerRow(RootModel):
    root: Union[MetaEntry, EpicEntry, StoryEntry, WaveEntry, TaskEntry] = Field(
        ..., discriminator="type"
    )

# =====================================================================
# PART B: The View Tree Hierarchy Nodes
# =====================================================================

class StoryNode(BaseModel):
    story: StoryEntry                        # Retains full, untouched original row data
    tasks: List[TaskEntry] = Field(default_factory=list)

class EpicNode(BaseModel):
    epic: EpicEntry                          # Retains full, untouched original row data
    stories: List[StoryNode] = Field(default_factory=list)

class Ledger(BaseModel):
    meta: Optional[MetaEntry] = None
    epics: List[EpicNode] = Field(default_factory=list)
    waves: List[WaveEntry] = Field(default_factory=list)



def build_hierarchical_ledger(file_path: str) -> tuple[Ledger, list[str]]:
    """Validates the unchanged flat JSONL schemas and nests them into an AST tree."""
    view_tree = Ledger()
    errors: list[str] = []
    
    # In-memory pointers to safely structure child items on the fly
    epic_index: dict[str, EpicNode] = {}
    story_index: dict[str, StoryNode] = {}

    with open(file_path, "r", encoding="utf-8") as f:
        for line_idx, line in enumerate(f, start=1):
            clean_line = line.strip()
            if not clean_line:
                continue
                
            try:
                raw_dict = json.loads(clean_line)
                
                parsed_row = FlatLedgerRow.model_validate(raw_dict).root
                
                if isinstance(parsed_row, MetaEntry):
                    view_tree.meta = parsed_row
                    
                elif isinstance(parsed_row, WaveEntry):
                    view_tree.waves.append(parsed_row)
                    
                elif isinstance(parsed_row, EpicEntry):
                    epic_node = EpicNode(epic=parsed_row)
                    epic_index[parsed_row.id] = epic_node
                    view_tree.epics.append(epic_node)
                    
                elif isinstance(parsed_row, StoryEntry):
                    story_node = StoryNode(story=parsed_row)
                    parent_epic_id = parsed_row.epic
                    
                    if parent_epic_id in epic_index:
                        epic_index[parent_epic_id].stories.append(story_node)
                        story_index[parsed_row.id] = story_node
                    else:
                        errors.append(f"Line {line_idx} (story): Orphaned. Epic ID '{parent_epic_id}' not found.")
                        
                elif isinstance(parsed_row, TaskEntry):
                    parent_story_id = parsed_row.story
                    
                    if parent_story_id in story_index:
                        story_index[parent_story_id].tasks.append(parsed_row)
                    else:
                        errors.append(f"Line {line_idx} (task/{parsed_row.kind}): Orphaned. Story ID '{parent_story_id}' not found.")

            except json.JSONDecodeError as e:
                errors.append(f"Line {line_idx}: Invalid string formatting syntax - {e}")
            except ValidationError as e:
                for err in e.errors():
                    # 1. Format the path to the error (e.g., 'root.task.status')
                    field_path = ".".join(str(p) for p in err["loc"])
                    
                    # 2. Get the exact value that failed validation
                    # Pydantic 2.x provides the bad value inside the 'input' key
                    bad_input = err.get("input")
                    
                    # 3. Format a comprehensive error message
                    errors.append(
                        f"Line {line_idx}: Field error at '{field_path}'. "
                        f"Reason: {err['msg']} "
                        f"(Offending Input: '{bad_input}')"
                    )

    return view_tree, errors

def demo():
    ledger_path = REPO_ROOT / "plan" / "ledger.jsonl"
    ledger_view, all_errors = build_hierarchical_ledger(ledger_path)
    for error in all_errors:
        print(error)

    # Safely traverse the generated tree structure
    for epic_node in ledger_view.epics:
        # Access original, unchanged row attributes directly
        print(f"Epic: {epic_node.epic.title} [ID: {epic_node.epic.id}]")
        
        for story_node in epic_node.stories:
            print(f"  └── Story: {story_node.story.title} Layer: {story_node.story.layer}")
            
            for task in story_node.tasks:
                print(f"      ├── [Task #{task.id}] {task.text} ({task.file})")
