"""Perception tests — no network, FakeVision only."""
import asyncio
import re

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.perception import (
    DetectedObject, FakeVision, Frame, FrameBuffer, FrameJudgment, FrameVerdict, InventoryResult,
    PerceptionConfig, PerceptionService, Predicate, PredicateType, StabilityGate, check_scene, vote,
)
from app.perception.predicates import geometry_veto, to_image_space
from app.perception.schemas import ObjectLocation


# ----------------------------------------------------------------- helpers
def scene(seed=0, shift=0, dark=False, blur=False) -> Image.Image:
    """Synthetic textured 'desk' image."""
    rng = np.random.default_rng(seed)
    arr = rng.integers(60, 200, (240, 320, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    d = ImageDraw.Draw(img)
    d.rectangle([40 + shift, 60, 120 + shift, 200], fill=(20, 20, 220))
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(6))
    if dark:
        img = Image.eval(img, lambda p: p // 8)
    return img


def frames(n=3, **kw):
    return [Frame(image=scene(**kw), ts=i * 0.5) for i in range(n)]


def judgment(sat, conf, boxes=None, hint=None):
    boxes = boxes or {}
    return FrameJudgment(
        satisfied=sat, confidence=conf, evidence="ev", correction_hint=hint,
        objects=[ObjectLocation(name=n, visible=b is not None, box_2d=b or []) for n, b in boxes.items()],
    )


def fv(i, sat, conf, err=None, hint=None):
    return FrameVerdict(frame_index=i, satisfied=sat, confidence=conf, evidence=f"f{i}",
                        error=err, correction_hint=hint)


BOX_L = [100, 100, 300, 200]   # center x 150
BOX_M = [100, 400, 300, 500]   # center x 450
BOX_R = [100, 700, 300, 800]   # center x 750


# ----------------------------------------------------------------- predicates
def test_parse_predicates():
    p = Predicate.parse("ON_TOP_OF(bottle, notebook)")
    assert p.type == PredicateType.ON_TOP_OF and p.args == ["bottle", "notebook"]
    p = Predicate.parse("ORDER_LEFT_TO_RIGHT([pen, 'bottle', notebook])")
    assert p.args == ["pen", "bottle", "notebook"]
    with pytest.raises(ValueError):
        Predicate.parse("HELD_UP(a, b)")


def test_flip_translates_left_right_only():
    lo = Predicate.parse("LEFT_OF(a, b)")
    assert to_image_space(lo, True).args == ["b", "a"]
    assert to_image_space(lo, False).args == ["a", "b"]
    order = Predicate.parse("ORDER_LEFT_TO_RIGHT([a,b,c])")
    assert to_image_space(order, True).args == ["c", "b", "a"]
    on = Predicate.parse("ON_TOP_OF(a, b)")
    assert to_image_space(on, True).args == ["a", "b"]


def test_geometry_veto():
    left = Predicate.parse("LEFT_OF(a, b)")
    assert geometry_veto(left, judgment(True, .9, {"a": BOX_L, "b": BOX_R})) is None
    assert geometry_veto(left, judgment(True, .9, {"a": BOX_R, "b": BOX_L})) is not None
    assert geometry_veto(left, judgment(True, .9, {"a": BOX_L, "b": None})) is not None  # b not visible

    order = Predicate.parse("ORDER_LEFT_TO_RIGHT([a,b,c])")
    assert geometry_veto(order, judgment(True, .9, {"a": BOX_L, "b": BOX_M, "c": BOX_R})) is None
    assert geometry_veto(order, judgment(True, .9, {"a": BOX_M, "b": BOX_L, "c": BOX_R})) is not None

    on = Predicate.parse("ON_TOP_OF(a, b)")
    assert geometry_veto(on, judgment(True, .9, {"a": BOX_L, "b": BOX_R})) is not None  # no overlap
    assert geometry_veto(on, judgment(True, .9, {"a": [50, 120, 150, 180], "b": BOX_L})) is None

    cov = Predicate.parse("COVERED(a)")
    assert geometry_veto(cov, judgment(True, .9, {"a": None})) is None  # covered thing may be hidden


# ----------------------------------------------------------------- voting
def test_vote_two_of_three():
    r = vote([fv(0, True, .9), fv(1, True, .8), fv(2, False, .9)])
    assert r.satisfied and r.votes_for == 2 and r.evidence_frame_index == 0


def test_vote_fails_closed_on_low_confidence():
    r = vote([fv(0, True, .65), fv(1, True, .6), fv(2, True, .9)], min_confidence=.7)
    assert not r.satisfied and r.votes_for == 1


def test_vote_errors_count_as_no():
    r = vote([fv(0, True, .9), fv(1, False, 0, err="timeout"), fv(2, False, 0, err="timeout")])
    assert not r.satisfied
    r = vote([fv(0, False, 0, err="x")] * 3)
    assert not r.satisfied and r.status == "model_error"


def test_vote_picks_majority_hint():
    r = vote([fv(0, False, .9, hint="Move the bottle onto the notebook"),
              fv(1, False, .8, hint="Move the bottle onto the notebook"),
              fv(2, False, .7, hint="other")])
    assert r.correction_hint == "Move the bottle onto the notebook"


def test_stability_gate():
    g = StabilityGate(required_streak=2)
    ok, bad = vote([fv(0, True, .9)] * 3), vote([fv(0, False, .9)] * 3)
    assert not g.update(ok)
    assert not g.update(bad)      # reset
    assert not g.update(ok)
    assert g.update(ok)
    assert g.update(bad)          # sticky once verified


# ----------------------------------------------------------------- frames
def test_scene_check():
    assert check_scene(frames()).ok
    assert check_scene(frames(dark=True)).reason == "too_dark"
    moving = [Frame(image=scene(seed=i, shift=60 * i), ts=i) for i in range(3)]
    assert check_scene(moving).reason == "moving"
    assert check_scene(frames(blur=True)).reason == "blurry"


def test_buffer_sampling_and_downscale():
    buf = FrameBuffer(seconds=4, min_interval=0.1)
    big = np.zeros((1080, 1920, 3), dtype=np.uint8)
    for i in range(50):
        buf.add(big, ts=i * 0.1)
    assert len(buf) <= 41
    s = buf.sample(3, span=1.5)
    assert len(s) == 3 and s[0].ts < s[1].ts < s[2].ts
    assert s[-1].ts >= 4.9 - 0.6 and s[0].ts >= 4.9 - 1.5
    jpg = s[0].jpeg()
    assert jpg[:2] == b"\xff\xd8"
    assert max(Image.open(__import__("io").BytesIO(jpg)).size) == 768


# ----------------------------------------------------------------- service
CATALOG = [DetectedObject(name="bottle", description="water bottle"),
           DetectedObject(name="notebook", description="black notebook"),
           DetectedObject(name="pen", description="silver pen")]


def run(coro):
    return asyncio.run(coro)


def test_service_verify_pass_and_prompt_contents():
    model = FakeVision(lambda im, p, s: judgment(True, .9, {"bottle": [50, 120, 150, 180], "notebook": BOX_L}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=False))
    svc.set_catalog(CATALOG)
    r = run(svc.verify(Predicate.parse("ON_TOP_OF(bottle, notebook)"), frames()))
    assert r.satisfied and r.votes_for == 3 and len(model.calls) == 3
    assert '"bottle": water bottle' in model.calls[0] and "must be ON TOP" in model.calls[0]


def test_service_geometry_overrides_model_yes():
    # model claims LEFT_OF but boxes disagree -> must not verify
    model = FakeVision(lambda im, p, s: judgment(True, .95, {"pen": BOX_R, "notebook": BOX_L}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=False))
    svc.set_catalog(CATALOG)
    r = run(svc.verify(Predicate.parse("LEFT_OF(pen, notebook)"), frames()))
    assert not r.satisfied
    assert all(v.geometry_override for v in r.frame_verdicts)


def test_service_flip_uses_player_perspective():
    # Player says "pen LEFT_OF notebook" from their view; in the image pen is on the RIGHT.
    model = FakeVision(lambda im, p, s: judgment(True, .9, {"notebook": BOX_L, "pen": BOX_R}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=True))
    svc.set_catalog(CATALOG)
    r = run(svc.verify(Predicate.parse("LEFT_OF(pen, notebook)"), frames()))
    assert r.satisfied
    assert re.search(r'is "notebook" positioned to the LEFT of "pen"', model.calls[0])


def test_service_unstable_scene_skips_model():
    model = FakeVision(lambda im, p, s: judgment(True, .9))
    svc = PerceptionService(model)
    r = run(svc.verify(Predicate.parse("HELD_UP(pen)"), frames(dark=True)))
    assert r.status == "unstable_scene" and not r.satisfied and model.calls == []
    assert r.correction_hint


def test_service_survives_one_model_error():
    n = {"i": 0}

    def resp(im, p, s):
        n["i"] += 1
        return RuntimeError("boom") if n["i"] == 1 else judgment(True, .9, {"pen": BOX_L})
    svc = PerceptionService(FakeVision(resp))
    svc.set_catalog(CATALOG)
    r = run(svc.verify(Predicate.parse("HELD_UP(pen)"), frames()))
    assert r.satisfied and r.votes_for == 2


def test_inventory_normalizes_and_dedupes():
    inv = InventoryResult(objects=[
        DetectedObject(name="Mug ", description="red", box_2d=BOX_L),
        DetectedObject(name="mug", description="blue", box_2d=BOX_R),
        DetectedObject(name="Pen", description="silver", box_2d=BOX_M)])
    svc = PerceptionService(FakeVision(lambda im, p, s: inv))
    res = run(svc.inventory(frames(2)))
    assert [o.name for o in res.objects] == ["mug", "mug 2", "pen"]
    assert set(svc.catalog) == {"mug", "mug 2", "pen"}


def test_parallel_calls_latency():
    svc = PerceptionService(FakeVision(lambda im, p, s: judgment(True, .9, {"pen": BOX_L}), delay_s=0.3))
    svc.set_catalog(CATALOG)
    r = run(svc.verify(Predicate.parse("HELD_UP(pen)"), frames()))
    assert r.latency_ms < 600   # 3 calls in parallel, not 900ms sequential


def test_lenient_name_matching():
    left = Predicate.parse("LEFT_OF(pen, notebook)")
    j = FrameJudgment(satisfied=True, confidence=.9, evidence="e", objects=[
        ObjectLocation(name="Silver Pen", visible=True, box_2d=BOX_L),
        ObjectLocation(name="notebook", visible=True, box_2d=BOX_R)])
    assert geometry_veto(left, j) is None


# ----------------------------------------------------------------- hide / show tasks
def test_hidden_veto():
    hid = Predicate.parse("HIDDEN(keys)")
    ok = judgment(True, .9, {"keys": None, "wallet": BOX_L})
    assert geometry_veto(hid, ok) is None                                   # gone, desk still in view
    assert geometry_veto(hid, judgment(True, .9, {"keys": BOX_R, "wallet": BOX_L}))  # still visible
    assert geometry_veto(hid, judgment(True, .9, {"keys": None, "wallet": None}))    # blank/blocked camera
    assert geometry_veto(hid, judgment(True, .9, {}))                                 # nothing reported


def test_show_veto():
    show = Predicate.parse("SHOW(pen)")
    assert geometry_veto(show, judgment(True, .9, {"pen": BOX_M})) is None
    assert geometry_veto(show, judgment(True, .9, {"pen": None})) is not None
    assert geometry_veto(show, judgment(True, .9, {"marker": BOX_M})) is not None


def test_hidden_prompt_lists_other_objects():
    model = FakeVision(lambda im, p, s: judgment(True, .9, {"keys": None, "wallet": BOX_L, "phone": BOX_R}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=False))
    svc.set_catalog([DetectedObject(name="keys", description="silver keys"),
                     DetectedObject(name="wallet", description="brown wallet"),
                     DetectedObject(name="phone", description="black phone")])
    r = run(svc.verify(Predicate.parse("HIDDEN(keys)"), frames()))
    assert r.satisfied
    prompt = model.calls[0]
    assert 'must be HIDDEN' in prompt and '"wallet": brown wallet' in prompt and '"phone": black phone' in prompt


def test_show_generic_object_not_in_catalog():
    model = FakeVision(lambda im, p, s: judgment(True, .9, {"pen": BOX_M}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=False))
    svc.set_catalog(CATALOG[:2])  # pen is NOT one of the scanned objects
    r = run(svc.verify(Predicate.parse("SHOW(pen)"), frames()))
    assert r.satisfied and 'any pen counts' in model.calls[0]


# ----------------------------------------------------------------- B1 geometry: stacking and side by side
from app.perception.predicates import side_by_side_veto, stacking_veto

WALLET = [400, 300, 700, 700]        # flat, wide
KEYS_ON_WALLET = [480, 420, 600, 560]  # small, sitting inside the wallet's box (seen from above)
BOTTLE_ON_BOOK = [100, 440, 470, 560]  # tall, base at the book's top surface (seen from the side)
BOOK = [440, 300, 620, 700]


def test_stacking_accepts_real_stacks():
    assert stacking_veto(KEYS_ON_WALLET, WALLET, "keys", "wallet") is None       # flat on flat
    assert stacking_veto(BOTTLE_ON_BOOK, BOOK, "bottle", "book") is None          # tall on flat


def test_stacking_rejects_reversed_stack():
    # the eval's two false passes: asked "wallet on keys" when keys are on the wallet
    assert "sits inside" in stacking_veto(WALLET, KEYS_ON_WALLET, "wallet", "keys")


def test_stacking_rejects_in_front_held_above_and_beside():
    in_front = [380, 450, 820, 550]      # standing nearer the camera: base lower than the book's bottom edge
    assert "in front" in stacking_veto(in_front, BOOK, "bottle", "book")
    held_above = [60, 450, 300, 550]     # base well above the book's top edge
    assert "floats above" in stacking_veto(held_above, BOOK, "bottle", "book")
    beside = [460, 720, 600, 860]        # no horizontal overlap
    assert "not over" in stacking_veto(beside, BOOK, "keys", "book")
    edge = [480, 650, 600, 850]          # only 25% of its width over the book
    assert "not over" in stacking_veto(edge, BOOK, "keys", "book")


def test_side_by_side():
    left, right = [400, 100, 600, 300], [400, 500, 600, 700]
    assert side_by_side_veto(left, right, "a", "b") is None
    assert "not left of" in side_by_side_veto(right, left, "b", "a")
    stacked = [300, 120, 450, 320]       # centre slightly left, but mostly over the other box
    assert "overlap" in side_by_side_veto(stacked, [400, 160, 600, 360], "a", "b")


def test_on_top_of_veto_runs_through_service():
    # model says YES, boxes show the reverse stack -> not verified
    model = FakeVision(lambda im, p, s: judgment(True, .95, {"wallet": WALLET, "keys": KEYS_ON_WALLET}))
    svc = PerceptionService(model, PerceptionConfig(flip_left_right=False))
    svc.set_catalog([DetectedObject(name="wallet", description="brown wallet"),
                     DetectedObject(name="keys", description="silver keys")])
    r = run(svc.verify(Predicate.parse("ON_TOP_OF(wallet, keys)"), frames()))
    assert not r.satisfied and all("sits inside" in v.geometry_override for v in r.frame_verdicts)
    assert all(v.model_satisfied is True and v.boxes["keys"] == KEYS_ON_WALLET for v in r.frame_verdicts)
    prompt = model.calls[0]
    assert 'must be ON TOP is "wallet"' in prompt and 'UNDERNEATH is "keys"' in prompt
