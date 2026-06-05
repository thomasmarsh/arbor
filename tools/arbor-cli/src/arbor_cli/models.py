from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field, RootModel


class TaskStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELED = "canceled"
    NEXT = "next"
    TODO = "todo"


class Size(str, Enum):
    XS = "xs"
    S = "s"
    M = "m"
    L = "l"
    XL = "xl"


STATUS_ORDER = [
    TaskStatus.IN_PROGRESS,
    TaskStatus.NEXT,
    TaskStatus.TODO,
    TaskStatus.DONE,
    TaskStatus.CANCELED,
]


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
    size: Optional[Size] = None
    deps: List[int] = Field(default_factory=list)
    rank: Optional[int] = None


class FlatLedgerRow(RootModel):
    root: Union[MetaEntry, EpicEntry, StoryEntry, WaveEntry, TaskEntry] = Field(
        ..., discriminator="type"
    )


class StoryNode(BaseModel):
    story: StoryEntry
    tasks: List[TaskEntry] = Field(default_factory=list)


class EpicNode(BaseModel):
    epic: EpicEntry
    stories: List[StoryNode] = Field(default_factory=list)


class Ledger(BaseModel):
    meta: Optional[MetaEntry] = None
    epics: List[EpicNode] = Field(default_factory=list)
    waves: List[WaveEntry] = Field(default_factory=list)
