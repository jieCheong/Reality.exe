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
MIN_TOP_OVERLAP = 0.30   # share of the top object's width that must sit over the bottom one
SIDE_BY_SIDE_MAX = 0.60  # above this horizontal overlap (of the narrower box), two things are stacked, not side by side
CONTAINED = 0.85         # share of a box's area inside another box that counts as "sitting inside" it
# Local patch support-contact-v1; see vision-service/LOCAL-PATCHES.md.
# Bounding boxes are [ymin, xmin, ymax, xmax], normalized to 0-1000.
SUPPORT_CONTACT_MAX_TOLERANCE = 20  # at most 2% of image height
SUPPORT_CONTACT_HEIGHT_FRACTION = 0.10  # tighter for small detected objects


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
        'The object that must be ON TOP is "{a}". The object that must be UNDERNEATH is "{b}". '
        'Is "{a}" resting on top of "{b}", physically supported by it (its base touching the top '
        'surface of "{b}")? Answer false if "{b}" is on top of "{a}" instead, or if "{a}" is merely '
        'in front of, behind, beside, or held above "{b}".'
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


def _x_overlap(a: list[int], b: list[int]) -> float:
    return max(0, min(a[3], b[3]) - max(a[1], b[1]))


def _area(b: list[int]) -> float:
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def _inside_share(inner: list[int], outer: list[int]) -> float:
    """Share of `inner`'s area that lies inside `outer`."""
    h = max(0, min(inner[2], outer[2]) - max(inner[0], outer[0]))
    return h * _x_overlap(inner, outer) / _area(inner) if _area(inner) else 0.0


def stacking_veto(a: list[int], b: list[int], top: str, bottom: str) -> Optional[str]:
    """Geometry for ON_TOP_OF(top=a, bottom=b), boxes [ymin, xmin, ymax, xmax] on 0-1000.

    Only ever vetoes a model YES. Works for flat-on-flat (keys on a wallet, seen from above)
    and tall-on-flat (a bottle standing on a notebook, seen from the side).
    """
    width_a = max(1, a[3] - a[1])
    if _x_overlap(a, b) < MIN_TOP_OVERLAP * width_a:
        return f'"{top}" is not over "{bottom}"'
    # Most specific first: the "bottom" object sitting inside the "top" one is the reverse stack.
    if _inside_share(b, a) >= CONTAINED and _area(a) > 1.5 * _area(b):
        return f'"{bottom}" sits inside "{top}": looks like {bottom} on {top}'
    tol = max(20, 0.15 * (b[2] - b[0]))
    base = a[2]  # the top object's lowest edge = where it would touch its support
    if base < b[0] - tol:
        return f'"{top}" floats above "{bottom}" (no contact)'
    if base > b[2] + tol:
        return f'"{top}" reaches below "{bottom}": in front of it, not on it'
    return None


def side_by_side_veto(a: list[int], b: list[int], left: str, right: str) -> Optional[str]:
    """Geometry for LEFT_OF(left=a, right=b)."""
    if not _cx(a) + SEPARATION <= _cx(b):
        return f'boxes say "{left}" is not left of "{right}"'
    narrower = max(1, min(a[3] - a[1], b[3] - b[1]))
    if _x_overlap(a, b) > SIDE_BY_SIDE_MAX * narrower:
        return f'"{left}" and "{right}" overlap: stacked or one behind the other, not side by side'
    return None


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
        if a and b:
            return side_by_side_veto(a, b, args[0], args[1])

    elif t == PredicateType.ORDER_LEFT_TO_RIGHT:
        boxes = [_box(j, n) for n in args]
        if all(boxes):
            xs = [_cx(b) for b in boxes]  # type: ignore[arg-type]
            if not all(xs[i] + SEPARATION <= xs[i + 1] for i in range(len(xs) - 1)):
                order = [n for _, n in sorted(zip(xs, args))]
                return f"boxes give order {order}"

    elif t == PredicateType.ON_TOP_OF:
        a, b = _box(j, args[0]), _box(j, args[1])
        if a is None or b is None:
            return 'support check requires both normalized bounding boxes'
        for box in (a, b):
            if (not all(type(value) is int for value in box)
                    or not (0 <= box[0] < box[2] <= 1000
                            and 0 <= box[1] < box[3] <= 1000)):
                return 'support check requires valid normalized bounding boxes'
        overlap = min(a[3], b[3]) - max(a[1], b[1])
        if overlap <= 0:
            return f'"{args[0]}" and "{args[1]}" do not overlap horizontally'
        stacking_reason = stacking_veto(a, b, args[0], args[1])
        if stacking_reason:
            return stacking_reason
        # Only permit a small gap/penetration consistent with detection error.
        # Boxes alone cannot prove support; the model must still judge contact.
        tolerance = min(SUPPORT_CONTACT_MAX_TOLERANCE,
                        SUPPORT_CONTACT_HEIGHT_FRACTION * min(a[2] - a[0], b[2] - b[0]))
        if (a[0] + a[2]) / 2 >= (b[0] + b[2]) / 2:
            return f'"{args[0]}" is not above "{args[1]}"'
        if abs(a[2] - b[0]) > tolerance:
            return f'"{args[0]}" base is not near the top of "{args[1]}"'

    return None
