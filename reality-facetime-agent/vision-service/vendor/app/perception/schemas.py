"""Data contracts for the perception layer.

`VerificationResult` matches the "Verification Contract" in the README, so the
engine (Part C) and dashboard can consume it directly.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Predicates
# --------------------------------------------------------------------------- #
class PredicateType(str, Enum):
    ON_TOP_OF = "ON_TOP_OF"                    # args: [A, B]  -> A rests on B
    HELD_UP = "HELD_UP"                        # args: [X]     -> X held up toward camera
    LEFT_OF = "LEFT_OF"                        # args: [A, B]  -> A left of B
    ORDER_LEFT_TO_RIGHT = "ORDER_LEFT_TO_RIGHT"  # args: [A, B, C, ...]
    COVERED = "COVERED"                        # args: [X]     -> X covered by a hand
    HIDDEN = "HIDDEN"                          # args: [X]     -> X out of sight, rest of scene still visible
    SHOW = "SHOW"                              # args: [kind]  -> any object of that kind shown (need not be scanned)


ARITY = {
    PredicateType.ON_TOP_OF: (2, 2),
    PredicateType.HELD_UP: (1, 1),
    PredicateType.LEFT_OF: (2, 2),
    PredicateType.ORDER_LEFT_TO_RIGHT: (2, 6),
    PredicateType.COVERED: (1, 1),
    PredicateType.HIDDEN: (1, 1),
    PredicateType.SHOW: (1, 1),
}


class Predicate(BaseModel):
    type: PredicateType
    args: list[str]  # object names exactly as returned by the inventory

    def model_post_init(self, __context) -> None:
        lo, hi = ARITY[self.type]
        if not lo <= len(self.args) <= hi:
            raise ValueError(f"{self.type.value} takes {lo}-{hi} args, got {len(self.args)}")

    def __str__(self) -> str:
        return f"{self.type.value}({', '.join(self.args)})"

    @classmethod
    def parse(cls, text: str) -> "Predicate":
        """Parse 'ON_TOP_OF(bottle, notebook)' or 'ORDER_LEFT_TO_RIGHT([a,b,c])'."""
        text = text.strip()
        name, _, rest = text.partition("(")
        if not rest.endswith(")"):
            raise ValueError(f"bad predicate: {text!r}")
        inner = rest[:-1].replace("[", "").replace("]", "")
        args = [a.strip().strip("'\"") for a in inner.split(",") if a.strip()]
        return cls(type=PredicateType(name.strip().upper()), args=args)


# --------------------------------------------------------------------------- #
# Inventory
# --------------------------------------------------------------------------- #
class DetectedObject(BaseModel):
    name: str = Field(description="Short, unique, lowercase noun, e.g. 'bottle', 'notebook', 'pen'.")
    description: str = Field(description="Distinguishing visual details: color, material, size.")
    box_2d: list[int] = Field(
        default_factory=list,
        description="[ymin, xmin, ymax, xmax] normalized to 0-1000.",
    )


class InventoryResult(BaseModel):
    objects: list[DetectedObject]
    latency_ms: float = 0.0


# --------------------------------------------------------------------------- #
# What the model returns for ONE frame (raw, untrusted)
# --------------------------------------------------------------------------- #
class ObjectLocation(BaseModel):
    name: str
    visible: bool
    box_2d: list[int] = Field(default_factory=list, description="[ymin, xmin, ymax, xmax] 0-1000")


class FrameJudgment(BaseModel):
    """Schema handed to Gemini as response_schema."""
    satisfied: bool
    confidence: float = Field(ge=0.0, le=1.0)
    objects: list[ObjectLocation] = Field(default_factory=list)
    evidence: str = Field(description="One short sentence describing what is visible that decides the answer.")
    correction_hint: Optional[str] = Field(
        default=None,
        description="If not satisfied: one short, friendly instruction to fix it. Null if satisfied.",
    )


class FrameVerdict(BaseModel):
    """FrameJudgment after deterministic post-processing."""
    frame_index: int
    satisfied: bool
    confidence: float
    evidence: str
    correction_hint: Optional[str] = None
    objects_seen: list[str] = Field(default_factory=list)
    geometry_override: Optional[str] = None  # set when code-side geometry overruled the model
    error: Optional[str] = None
    latency_ms: float = 0.0


# --------------------------------------------------------------------------- #
# Final answer for one verification round (the README contract + extras)
# --------------------------------------------------------------------------- #
class VerificationResult(BaseModel):
    satisfied: bool
    confidence: float
    objects_seen: list[str]
    evidence: str
    correction_hint: Optional[str] = None
    # extras for the engine / dashboard
    predicate: str = ""
    votes_for: int = 0
    votes_total: int = 0
    evidence_frame_index: Optional[int] = None   # index into the frames passed in
    status: str = "checked"   # checked | unstable_scene | no_frames | model_error
    frame_verdicts: list[FrameVerdict] = Field(default_factory=list)
    latency_ms: float = 0.0
