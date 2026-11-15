"""PerceptionService: the public API of Part B.

    svc = PerceptionService(GeminiVision())
    inv = await svc.inventory(buffer.sample(2))          # SCAN
    res = await svc.verify(Predicate.parse("ON_TOP_OF(bottle, notebook)"),
                           buffer.sample(3))             # each check
    res.satisfied, res.confidence, res.evidence, res.correction_hint

The engine (Part C) owns roles, timers and state. It passes object NAMES
(from the inventory), never role names, into predicates.
"""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Optional

from .frames import Frame, FrameBuffer, check_scene
from .model import VisionModel
from .predicates import INVENTORY_PROMPT, build_verify_prompt, geometry_veto, to_image_space
from .schemas import (
    DetectedObject, FrameJudgment, FrameVerdict, InventoryResult, Predicate, VerificationResult,
)
from .voting import vote

SCENE_HINTS = {
    "moving": "Hold still for a second so I can check.",
    "blurry": "Hold still for a second so I can check.",
    "too_dark": "It's too dark for my sensors. Can you add some light?",
    "no_frames": None,
}


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes"}


@dataclass
class PerceptionConfig:
    n_frames: int = 3
    votes_needed: int = 2
    min_confidence: float = 0.7
    sample_span_s: float = 1.5
    # True when the player faces the camera (their left = image right).
    # CHECK THIS on the first real call: hold an object in your LEFT hand
    # and see which side of the received frame it's on.
    flip_left_right: bool = _env_bool("FLIP_LEFT_RIGHT", True)
    scene_check: bool = True
    max_objects: int = 3


class PerceptionService:
    def __init__(self, model: VisionModel, config: Optional[PerceptionConfig] = None):
        self.model = model
        self.cfg = config or PerceptionConfig()
        self.catalog: dict[str, DetectedObject] = {}

    # ---------------------------------------------------------------- scan
    async def inventory(self, frames: list[Frame], max_objects: Optional[int] = None) -> InventoryResult:
        """Identify objects. Uses up to 2 frames in one call. Caches the result
        so later checks only ask about the predicate."""
        t0 = time.perf_counter()
        imgs = [f.jpeg() for f in frames[-2:]]
        prompt = INVENTORY_PROMPT.format(max_objects=max_objects or self.cfg.max_objects)
        res = await self.model.ask(imgs, prompt, InventoryResult)
        # normalize + dedupe names
        seen: dict[str, DetectedObject] = {}
        for o in res.objects:
            name = o.name.strip().lower()
            base, k = name, 2
            while name in seen:
                name, k = f"{base} {k}", k + 1
            seen[name] = o.model_copy(update={"name": name})
        res = InventoryResult(objects=list(seen.values()),
                              latency_ms=round((time.perf_counter() - t0) * 1000, 1))
        self.catalog = dict(seen)
        return res

    def set_catalog(self, objects: list[DetectedObject]) -> None:
        """For tests / eval / manual override."""
        self.catalog = {o.name: o for o in objects}

    # -------------------------------------------------------------- verify
    async def _judge(self, idx: int, frame: Frame, pred_img: Predicate, prompt: str) -> FrameVerdict:
        t0 = time.perf_counter()
        try:
            j = await self.model.ask([frame.jpeg()], prompt, FrameJudgment)
        except Exception as e:
            return FrameVerdict(frame_index=idx, satisfied=False, confidence=0.0,
                                evidence="model error", error=repr(e)[:200],
                                latency_ms=round((time.perf_counter() - t0) * 1000, 1))
        veto = geometry_veto(pred_img, j) if j.satisfied else None
        return FrameVerdict(
            frame_index=idx,
            satisfied=j.satisfied and veto is None,
            confidence=j.confidence,
            evidence=j.evidence,
            correction_hint=j.correction_hint,
            objects_seen=[o.name for o in j.objects if o.visible],
            geometry_override=veto,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    async def verify(self, predicate: Predicate, frames: list[Frame]) -> VerificationResult:
        t0 = time.perf_counter()
        label = str(predicate)
        if not frames:
            return VerificationResult(satisfied=False, confidence=0.0, objects_seen=[],
                                      evidence="no frames", predicate=label, status="no_frames")

        if self.cfg.scene_check:
            sc = check_scene(frames)
            if not sc.ok:
                return VerificationResult(
                    satisfied=False, confidence=0.0, objects_seen=[],
                    evidence=f"scene not checkable: {sc.reason}",
                    correction_hint=SCENE_HINTS.get(sc.reason or ""),
                    predicate=label, status="unstable_scene",
                    latency_ms=round((time.perf_counter() - t0) * 1000, 1))

        pred_img = to_image_space(predicate, self.cfg.flip_left_right)
        prompt = build_verify_prompt(pred_img, self.catalog)
        verdicts = await asyncio.gather(
            *(self._judge(i, f, pred_img, prompt) for i, f in enumerate(frames)))
        res = vote(list(verdicts), votes_needed=min(self.cfg.votes_needed, len(frames)),
                   min_confidence=self.cfg.min_confidence, predicate=label)
        res.latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        return res

    async def verify_buffer(self, predicate: Predicate, buffer: FrameBuffer) -> VerificationResult:
        return await self.verify(predicate, buffer.sample(self.cfg.n_frames, self.cfg.sample_span_s))
