"""Multi-frame voting and verdict stability. Pure functions, no I/O."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .schemas import FrameVerdict, VerificationResult


def p_satisfied(v: FrameVerdict) -> float:
    """Model's probability that the predicate holds in this frame."""
    return v.confidence if v.satisfied else 1.0 - v.confidence


def vote(verdicts: list[FrameVerdict], *, votes_needed: int = 2,
         min_confidence: float = 0.7, predicate: str = "") -> VerificationResult:
    """k-of-n vote, failing closed.

    A frame counts as a YES only if satisfied AND confidence >= min_confidence.
    Errored frames count as NO. So with 3 frames and 1 API error you need
    both remaining frames to agree.
    """
    yes = [v for v in verdicts if v.satisfied and v.confidence >= min_confidence and not v.error]
    no = [v for v in verdicts if v not in yes]
    ok = len(yes) >= votes_needed
    valid = [v for v in verdicts if not v.error]

    conf = round(sum(p_satisfied(v) for v in valid) / len(valid), 3) if valid else 0.0
    seen = sorted({o for v in valid for o in v.objects_seen})

    if ok:
        best = max(yes, key=lambda v: v.confidence)
        hint = None
    else:
        pool = [v for v in no if not v.error] or no
        best = max(pool, key=lambda v: v.confidence) if pool else None
        hints = [v.correction_hint for v in pool if v.correction_hint]
        hint = Counter(hints).most_common(1)[0][0] if hints else None
        if best and best.geometry_override and not hint:
            hint = None  # engine falls back to its own scripted hint

    return VerificationResult(
        satisfied=ok,
        confidence=conf,
        objects_seen=seen,
        evidence=(best.evidence if best else "no usable frames"),
        correction_hint=hint,
        predicate=predicate,
        votes_for=len(yes),
        votes_total=len(verdicts),
        evidence_frame_index=(best.frame_index if best else None),
        status="checked" if valid else "model_error",
        frame_verdicts=verdicts,
    )


@dataclass
class StabilityGate:
    """Require `required_streak` consecutive passing rounds before a mission
    is declared verified. Any failing round resets the streak.

    required_streak=1 -> trust a single 2-of-3 round (frames already span ~1.5s).
    required_streak=2 -> stricter; costs one extra round (~1-2s) per success.
    """
    required_streak: int = 1
    streak: int = 0
    verified: bool = False

    def update(self, result: VerificationResult) -> bool:
        if self.verified:
            return True
        self.streak = self.streak + 1 if result.satisfied else 0
        self.verified = self.streak >= self.required_streak
        return self.verified

    def reset(self) -> None:
        self.streak, self.verified = 0, False
