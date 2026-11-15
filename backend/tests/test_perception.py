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
    assert '"bottle": water bottle' in model.calls[0] and "ON TOP OF" in model.calls[0]


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
