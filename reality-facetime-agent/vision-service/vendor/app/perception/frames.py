"""Frame intake, sampling, downscaling, and cheap quality checks.

Part A (integration) pushes frames in with `FrameBuffer.add(...)`. Everything
else here is pure Python/numpy, no model calls.
"""
from __future__ import annotations

import io
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from PIL import Image

MAX_SIDE = 768        # px; Gemini handles this fine and it keeps uploads small
JPEG_QUALITY = 80
THUMB = (64, 48)      # for motion/blur checks


@dataclass
class Frame:
    image: Image.Image          # RGB
    ts: float = field(default_factory=time.monotonic)
    _jpeg: Optional[bytes] = field(default=None, repr=False)

    def jpeg(self) -> bytes:
        """Downscaled JPEG bytes (cached)."""
        if self._jpeg is None:
            self._jpeg = encode_jpeg(downscale(self.image))
        return self._jpeg


# --------------------------------------------------------------------------- #
# Conversions
# --------------------------------------------------------------------------- #
def to_pil(obj: Any) -> Image.Image:
    """Accept PIL image, numpy array (HxWx3/4), JPEG/PNG bytes, a file path,
    or a LiveKit `rtc.VideoFrame` (duck-typed) and return an RGB PIL image."""
    if isinstance(obj, Image.Image):
        return obj.convert("RGB")
    if isinstance(obj, (bytes, bytearray)):
        return Image.open(io.BytesIO(obj)).convert("RGB")
    if isinstance(obj, str):
        return Image.open(obj).convert("RGB")
    if isinstance(obj, np.ndarray):
        mode = "RGBA" if obj.ndim == 3 and obj.shape[2] == 4 else "RGB"
        return Image.fromarray(obj.astype(np.uint8), mode).convert("RGB")
    # LiveKit VideoFrame: has .convert(VideoBufferType.RGBA), .width, .height, .data
    if hasattr(obj, "convert") and hasattr(obj, "width") and hasattr(obj, "height"):
        try:
            from livekit import rtc  # type: ignore
            rgba = obj.convert(rtc.VideoBufferType.RGBA)
        except Exception:  # already RGBA or livekit not installed
            rgba = obj
        arr = np.frombuffer(bytes(rgba.data), dtype=np.uint8).reshape(rgba.height, rgba.width, 4)
        return Image.fromarray(arr, "RGBA").convert("RGB")
    raise TypeError(f"Unsupported frame type: {type(obj)!r}")


def downscale(img: Image.Image, max_side: int = MAX_SIDE) -> Image.Image:
    w, h = img.size
    scale = max_side / max(w, h)
    if scale >= 1:
        return img
    return img.resize((round(w * scale), round(h * scale)), Image.BILINEAR)


def encode_jpeg(img: Image.Image, quality: int = JPEG_QUALITY) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Quality checks
# --------------------------------------------------------------------------- #
def _gray_small(img: Image.Image, size=(160, 120)) -> np.ndarray:
    return np.asarray(img.convert("L").resize(size, Image.BILINEAR), dtype=np.float32)


def sharpness(img: Image.Image) -> float:
    """Variance of a Laplacian. Higher = sharper. Motion-blurred frames are ~<20."""
    g = _gray_small(img)
    lap = (-4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:])
    return float(lap.var())


def brightness(img: Image.Image) -> float:
    return float(_gray_small(img).mean())


def motion(a: Image.Image, b: Image.Image) -> float:
    """Mean absolute pixel difference (0-255) between two thumbnails."""
    return float(np.abs(_gray_small(a, THUMB) - _gray_small(b, THUMB)).mean())


@dataclass
class SceneCheck:
    ok: bool
    reason: Optional[str] = None     # spoken-friendly reason when not ok
    max_motion: float = 0.0
    min_sharpness: float = 0.0
    mean_brightness: float = 0.0


def check_scene(frames: list[Frame], *, max_motion: float = 18.0,
                min_sharpness: float = 15.0, min_brightness: float = 35.0) -> SceneCheck:
    """Is the scene still, sharp, and lit enough to judge? Thresholds are
    starting points; tune them on your own test captures."""
    if not frames:
        return SceneCheck(ok=False, reason="no_frames")
    sharp = [sharpness(f.image) for f in frames]
    bright = [brightness(f.image) for f in frames]
    mot = [motion(frames[i].image, frames[i + 1].image) for i in range(len(frames) - 1)]
    sc = SceneCheck(ok=True, max_motion=max(mot, default=0.0),
                    min_sharpness=min(sharp), mean_brightness=float(np.mean(bright)))
    if sc.mean_brightness < min_brightness:
        sc.ok, sc.reason = False, "too_dark"
    elif sc.max_motion > max_motion:
        sc.ok, sc.reason = False, "moving"
    elif sc.min_sharpness < min_sharpness:
        sc.ok, sc.reason = False, "blurry"
    return sc


# --------------------------------------------------------------------------- #
# Buffer + sampling
# --------------------------------------------------------------------------- #
class FrameBuffer:
    """Keeps the last few seconds of frames. Part A calls `add()` for every
    incoming frame (or every Nth); perception calls `sample()`."""

    def __init__(self, seconds: float = 4.0, min_interval: float = 0.1):
        self.seconds = seconds
        self.min_interval = min_interval   # drop frames arriving faster than this
        self._frames: deque[Frame] = deque()

    def add(self, raw: Any, ts: Optional[float] = None) -> None:
        ts = time.monotonic() if ts is None else ts
        if self._frames and ts - self._frames[-1].ts < self.min_interval:
            return
        self._frames.append(Frame(image=to_pil(raw), ts=ts))
        while self._frames and ts - self._frames[0].ts > self.seconds:
            self._frames.popleft()

    def __len__(self) -> int:
        return len(self._frames)

    def latest(self) -> Optional[Frame]:
        return self._frames[-1] if self._frames else None

    def sample(self, n: int = 3, span: float = 1.5) -> list[Frame]:
        """Pick `n` frames spread evenly over the last `span` seconds, favoring
        the sharpest frame near each target time."""
        if not self._frames:
            return []
        end = self._frames[-1].ts
        window = [f for f in self._frames if end - f.ts <= span]
        if len(window) <= n:
            return list(window)
        targets = [end - span + span * (i + 1) / n for i in range(n)]
        picked: list[Frame] = []
        for t in targets:
            # 2 nearest candidates to the target time, take the sharper one
            near = sorted((f for f in window if f not in picked), key=lambda f: abs(f.ts - t))[:2]
            picked.append(max(near, key=lambda f: sharpness(f.image)))
        return sorted(picked, key=lambda f: f.ts)
