"""Predicate prompts + deterministic geometry checks.

Design rule: the model answers ONE narrow question per frame and reports
object boxes. Code then applies cheap geometric vetoes so the model can't
"talk itself into" a pass (e.g. LEFT_OF is checked from box centers).
Code can only turn a pass into a fail, never the other way (fail closed).
"""
from __future__ import annotations

from typing import Optional

from .schemas import DetectedObject, FrameJudgment, Predicate, PredicateType

SEPARATION = 30   # min x-gap between box centers (0-1000 scale) for left/right


# --------------------------------------------------------------------------- #
# Perspective: "left" for the player vs. left in the image
# --------------------------------------------------------------------------- #
def to_image_space(pred: Predicate, flip_left_right: bool) -> Predicate:
    """If the player faces the camera, the player's left is the image's right.
    We translate the predicate once so the model and geometry only ever
    reason in image coordinates."""
    if not flip_left_right:
        return pred
    if pred.type == PredicateType.LEFT_OF:
        return Predicate(type=pred.type, args=[pred.args[1], pred.args[0]])
    if pred.type == PredicateType.ORDER_LEFT_TO_RIGHT:
        return Predicate(type=pred.type, args=list(reversed(pred.args)))
    return pred


# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #
INVENTORY_PROMPT = """You are the vision system for a game played over a video call.
List the distinct, hand-held physical objects the player is showing to the camera
(things on the desk or in their hands). Ignore the person, furniture, walls,
screens in the background, and anything mostly out of frame.

Rules:
- At most {max_objects} objects, most prominent first.
- `name`: a short, lowercase, UNIQUE noun (e.g. "bottle", "notebook", "pen").
  If two objects share a noun, disambiguate ("red mug", "blue mug").
- `description`: color/material/size details that would let someone pick it out.
- `box_2d`: [ymin, xmin, ymax, xmax] normalized to 0-1000.
"""

_QUESTIONS = {
    PredicateType.ON_TOP_OF: (
        'Is "{a}" resting ON TOP OF "{b}"? It must be physically supported by "{b}" '
        '(its base touching the top surface of "{b}"), not merely in front of it, '
        "behind it, overlapping it in the image, or being held above it by a hand."
    ),
    PredicateType.HELD_UP: (
        'Is "{a}" being held up in a hand toward the camera, clearly lifted off any '
        "surface and plainly visible (not lying on the desk)?"
    ),
    PredicateType.LEFT_OF: (
        'In IMAGE coordinates (the left edge of the picture is left), is "{a}" '
        'positioned to the LEFT of "{b}"?'
    ),
    PredicateType.ORDER_LEFT_TO_RIGHT: (
        "In IMAGE coordinates (the left edge of the picture is left), are these "
        "objects arranged from left to right in exactly this order: {seq}?"
    ),
    PredicateType.COVERED: (
        'Is "{a}" covered by the player\'s hand, so that the hand is on top of it and '
        "hides most of it? A hand merely near it does not count."
    ),
    PredicateType.HIDDEN: (
        'The object "{a}" must be HIDDEN: is "{a}" completely out of sight in this frame '
        "(no part of it visible), while the camera still clearly shows the desk and the "
        "other listed objects? If the picture is dark, blocked, or blurry, answer false."
    ),
    PredicateType.SHOW: (
        'Is the player clearly showing a {a} (any {a} counts) to the camera, so that it is '
        'plainly visible? Report it in `objects` under the exact name "{a}". A picture of a '
        "{a} on a screen, or a different kind of object, does not count."
    ),
}

VERIFY_PROMPT = """You are a strict referee for a physical game played over a video call.
Judge ONLY what is visible in this single frame. Do not assume anything that is not visible.
If the frame is blurry, dark, or the objects are cut off, answer satisfied=false with low confidence.

Objects in play:
{objects}

Question: {question}

Respond with:
- satisfied: true only if you are sure the condition holds in this frame.
- confidence: 0.0-1.0, your probability that `satisfied` is correct.
- objects: for EVERY object in play listed above (use those exact names), whether it is visible
  and its box_2d [ymin, xmin, ymax, xmax] normalized 0-1000 (empty list if not visible).
- evidence: one short sentence on the visual fact that decides it.
- correction_hint: if not satisfied, one short friendly instruction the player could follow
  to fix it (max 15 words, refer to objects by name). null if satisfied.
"""


def describe_objects(names: list[str], catalog: dict[str, DetectedObject]) -> str:
    lines = []
    for n in names:
        d = catalog.get(n)
        lines.append(f'- "{n}": {d.description}' if d else f'- "{n}"')
    return "\n".join(lines)


def build_verify_prompt(pred_img: Predicate, catalog: dict[str, DetectedObject]) -> str:
    q = _QUESTIONS[pred_img.type]
    a = pred_img.args[0]
    b = pred_img.args[1] if len(pred_img.args) > 1 else ""
    seq = " -> ".join(f'"{x}"' for x in pred_img.args)
    question = q.format(a=a, b=b, seq=seq)
    names = list(pred_img.args)
    if pred_img.type == PredicateType.HIDDEN:
        # List the other scanned objects too: they prove the camera can still see the desk.
        names += [n for n in catalog if n not in names]
    return VERIFY_PROMPT.format(objects=describe_objects(names, catalog), question=question)


# --------------------------------------------------------------------------- #
# Geometry vetoes (image space)
# --------------------------------------------------------------------------- #
def _same(a: str, b: str) -> bool:
    """Lenient name match: 'bottle' == 'water bottle' == 'Bottle'."""
    a, b = a.strip().lower().strip('"'), b.strip().lower().strip('"')
    return a == b or a in b or b in a


def _find(j: FrameJudgment, name: str):
    exact = [o for o in j.objects if o.name.strip().lower() == name.strip().lower()]
    return exact[0] if exact else next((o for o in j.objects if _same(o.name, name)), None)


def _box(j: FrameJudgment, name: str) -> Optional[list[int]]:
    o = _find(j, name)
    return o.box_2d if o and o.visible and len(o.box_2d) == 4 else None


def _visible(j: FrameJudgment, name: str) -> bool:
    o = _find(j, name)
    return bool(o and o.visible)


def _cx(b: list[int]) -> float:
    return (b[1] + b[3]) / 2


def geometry_veto(pred_img: Predicate, j: FrameJudgment) -> Optional[str]:
    """Return a reason string if geometry contradicts a model PASS, else None."""
    t, args = pred_img.type, pred_img.args

    if t == PredicateType.HIDDEN:
        target = args[0]
        if _visible(j, target):
            return f'"{target}" is still visible'
        # Fail closed if nothing else is visible: a covered or blank camera is not "hidden".
        if not any(o.visible and not _same(o.name, target) for o in j.objects):
            return "no other object visible; camera may be blocked"
        return None

    # Every named object must be visible (except the thing being covered).
    must_see = args if t != PredicateType.COVERED else []
    for n in must_see:
        if not _visible(j, n):
            return f'"{n}" not visible'

    if t == PredicateType.LEFT_OF:
        a, b = _box(j, args[0]), _box(j, args[1])
        if a and b and not (_cx(a) + SEPARATION <= _cx(b)):
            return f'boxes say "{args[0]}" is not left of "{args[1]}"'

    elif t == PredicateType.ORDER_LEFT_TO_RIGHT:
        boxes = [_box(j, n) for n in args]
        if all(boxes):
            xs = [_cx(b) for b in boxes]  # type: ignore[arg-type]
            if not all(xs[i] + SEPARATION <= xs[i + 1] for i in range(len(xs) - 1)):
                order = [n for _, n in sorted(zip(xs, args))]
                return f"boxes give order {order}"

    elif t == PredicateType.ON_TOP_OF:
        a, b = _box(j, args[0]), _box(j, args[1])
        if a and b:
            overlap = min(a[3], b[3]) - max(a[1], b[1])
            if overlap <= 0:
                return f'"{args[0]}" and "{args[1]}" do not overlap horizontally'

    return None
