"""Turn one video + a timeline file into a labeled eval set.

    python -m eval.make_dataset path/to/video.mov eval/timeline.txt
    python -m eval.run_eval

Writes frames to eval/data/ and cases to eval/labels.jsonl (overwrites it;
use --append to add to an existing one).

Timeline file format (one setup per line, `#` starts a comment):

    objects: phone = black phone in a blue case; wallet = brown leather wallet; keys = keys on a silver clip
    0:05-0:09  ON keys wallet          | dim
    0:10-0:14  NEAR keys wallet
    0:15-0:19  HELD keys
    0:20-0:25  ROW phone wallet keys   | cluttered
    0:26-0:30  COVER keys
    0:31-0:35  HAND_NEAR keys
    0:36-0:40  SKIP                    (transition / junk, ignored)

Scene keywords (describe what IS true; everything else is assumed false):
    ON a b         a resting on top of b
    NEAR a b       a next to / in front of / touching b, but NOT on it
    ABOVE a b      a held just above b (not resting on it)
    HELD x         x held up toward the camera
    ROW a b c      objects lying in a row, LEFT->RIGHT AS SEEN IN THE VIDEO
    COVER x        hand covering x
    HAND_NEAR x    hand next to x, not covering it
    SKIP           ignore this span
Words after `|` become condition tags (dim, cluttered, backlit ...).

From each setup the script derives several true/false questions, so one
4-second clip yields ~4-6 cases. It keeps every positive and the hardest
negatives, and grabs 2 frames per setup (away from the edges, where you were
still moving things).
"""
from __future__ import annotations

import argparse
import itertools
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KEYWORDS = {"ON": 2, "NEAR": 2, "ABOVE": 2, "HELD": 1, "ROW": None, "COVER": 1,
            "HAND_NEAR": 1, "SKIP": 0}
TIME = r"(\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?)"


# --------------------------------------------------------------------------- parsing
def to_seconds(t: str) -> float:
    if ":" in t:
        m, s = t.split(":")
        return int(m) * 60 + float(s)
    return float(t)


def parse_timeline(path: Path) -> tuple[dict[str, str], list[dict]]:
    objects: dict[str, str] = {}
    setups: list[dict] = []
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.lower().startswith("objects:"):
            for part in line.split(":", 1)[1].split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    objects[k.strip().lower()] = v.strip()
                elif part.strip():
                    objects[part.strip().lower()] = ""
            continue
        m = re.match(rf"{TIME}\s*-\s*{TIME}\s+(.*)$", line)
        if not m:
            raise SystemExit(f"{path}:{n}: can't read time range in: {raw!r}")
        start, end = to_seconds(m.group(1)), to_seconds(m.group(2))
        body, _, tags = m.group(3).partition("|")
        words = body.split()
        kw, args = words[0].upper(), [w.lower() for w in words[1:]]
        if kw not in KEYWORDS:
            raise SystemExit(f"{path}:{n}: unknown keyword {kw!r}. Use one of {sorted(KEYWORDS)}")
        want = KEYWORDS[kw]
        if want is not None and len(args) != want:
            raise SystemExit(f"{path}:{n}: {kw} takes {want} object(s), got {args}")
        if kw == "ROW" and len(args) < 2:
            raise SystemExit(f"{path}:{n}: ROW needs 2+ objects")
        if end <= start:
            raise SystemExit(f"{path}:{n}: end time must be after start")
        for a in args:
            objects.setdefault(a, "")
        setups.append(dict(line=n, start=start, end=end, kw=kw, args=args,
                           tags=tags.split()))
    if not objects:
        raise SystemExit("No objects found. Add an `objects:` line.")
    return objects, setups


# --------------------------------------------------------------------------- questions
def questions(kw: str, args: list[str], objects: list[str]) -> list[tuple[str, bool]]:
    """Return (predicate, expected) pairs for one setup, positives first,
    then negatives ordered hardest-first."""
    pos: list[str] = []
    neg: list[str] = []
    others = [o for o in objects if o not in args]

    if kw == "ON":
        a, b = args
        pos.append(f"ON_TOP_OF({a}, {b})")
        neg += [f"ON_TOP_OF({b}, {a})", f"HELD_UP({a})", f"COVERED({a})"]
        neg += [f"ON_TOP_OF({a}, {o})" for o in others]
    elif kw in ("NEAR", "ABOVE"):
        a, b = args
        neg += [f"ON_TOP_OF({a}, {b})", f"ON_TOP_OF({b}, {a})"]
        if kw == "NEAR":
            neg.append(f"HELD_UP({a})")
    elif kw == "HELD":
        (x,) = args
        pos.append(f"HELD_UP({x})")
        neg += [f"COVERED({x})"] + [f"HELD_UP({o})" for o in others]
        neg += [f"ON_TOP_OF({x}, {o})" for o in others[:1]]
    elif kw == "COVER":
        (x,) = args
        pos.append(f"COVERED({x})")
        neg += [f"HELD_UP({x})"] + [f"COVERED({o})" for o in others]
    elif kw == "HAND_NEAR":
        (x,) = args
        neg += [f"COVERED({x})", f"HELD_UP({x})"]
    elif kw == "ROW":
        seq = args
        pos.append(f"ORDER_LEFT_TO_RIGHT([{', '.join(seq)}])")
        pos.append(f"LEFT_OF({seq[0]}, {seq[-1]})")
        neg.append(f"ORDER_LEFT_TO_RIGHT([{', '.join(reversed(seq))}])")
        if len(seq) >= 3:  # one adjacent swap: the hardest order negative
            sw = seq[:]; sw[0], sw[1] = sw[1], sw[0]
            neg.append(f"ORDER_LEFT_TO_RIGHT([{', '.join(sw)}])")
        neg.append(f"LEFT_OF({seq[-1]}, {seq[0]})")
        if len(seq) >= 2:
            neg.append(f"ON_TOP_OF({seq[0]}, {seq[1]})")
    # dedupe, keep order
    seen: set[str] = set()
    out = []
    for p, e in [(p, True) for p in pos] + [(p, False) for p in neg]:
        if p not in seen:
            seen.add(p); out.append((p, e))
    return out


def objects_in(pred: str) -> list[str]:
    inner = pred[pred.index("(") + 1:-1].replace("[", "").replace("]", "")
    return [a.strip() for a in inner.split(",")]


# --------------------------------------------------------------------------- frames
def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # pip install imageio-ffmpeg (bundles ffmpeg)
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise SystemExit("Need ffmpeg: `brew install ffmpeg` or `pip install imageio-ffmpeg`.")


def grab(ffmpeg: str, video: Path, t: float, out: Path, max_side: int = 1280,
         crop: str | None = None) -> None:
    # -ss before -i = fast seek; optional crop first, then keep long side <= max_side
    vf = f"scale='if(gt(iw,ih),min({max_side},iw),-2)':'if(gt(iw,ih),-2,min({max_side},ih))'"
    if crop:
        vf = f"crop={crop}," + vf
    r = subprocess.run([ffmpeg, "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video),
                        "-frames:v", "1", "-vf", vf, "-q:v", "3", str(out)],
                       capture_output=True, text=True)
    if r.returncode or not out.exists():
        raise SystemExit(f"ffmpeg failed at {t:.2f}s: {r.stderr.strip()[:300]}")


def frame_times(start: float, end: float, k: int, margin: float) -> list[float]:
    s, e = start + margin, end - margin
    if e <= s:  # short clip: just use the middle
        return [(start + end) / 2]
    if k == 1:
        return [(s + e) / 2]
    return [s + (e - s) * i / (k - 1) for i in range(k)]


# --------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video", type=Path)
    ap.add_argument("timeline", type=Path)
    ap.add_argument("--data", type=Path, default=ROOT / "data")
    ap.add_argument("--labels", type=Path, default=ROOT / "labels.jsonl")
    ap.add_argument("--frames", type=int, default=2, help="frames per setup (default 2)")
    ap.add_argument("--margin", type=float, default=0.6,
                    help="seconds to skip at each end of a setup (default 0.6)")
    ap.add_argument("--max-negatives", type=int, default=3,
                    help="hardest N negatives kept per setup (default 3)")
    ap.add_argument("--append", action="store_true", help="append to labels instead of overwriting")
    ap.add_argument("--crop", default=None,
                    help="ffmpeg crop W:H:X:Y in source pixels, e.g. 2160:800:0:1900 to keep just "
                         "the desk when the camera was far away")
    ap.add_argument("--prefix", default=None, help="name prefix for frames (default: video name)")
    args = ap.parse_args()

    objects, setups = parse_timeline(args.timeline)
    names = list(objects)
    ffmpeg = ffmpeg_exe()
    prefix = args.prefix or re.sub(r"\W+", "_", args.video.stem).strip("_").lower()
    args.data.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    n_frames = 0
    for i, s in enumerate(setups, 1):
        if s["kw"] == "SKIP":
            continue
        qs = questions(s["kw"], s["args"], names)
        pos = [q for q in qs if q[1]]
        neg = [q for q in qs if not q[1]][: args.max_negatives]
        times = frame_times(s["start"], s["end"], args.frames, args.margin)
        setup_id = f"{prefix}_s{i:02d}_{s['kw'].lower()}"
        for j, t in enumerate(times):
            fname = f"{setup_id}_f{j}.jpg"
            grab(ffmpeg, args.video, t, args.data / fname, crop=args.crop)
            n_frames += 1
            for pred, expected in pos + neg:
                used = objects_in(pred)
                rows.append({
                    "id": f"{setup_id}_f{j}_{re.sub(r'[^a-z0-9]+', '_', pred.lower()).strip('_')}",
                    "group": setup_id,
                    "images": [fname],
                    "objects": [{"name": o, "description": objects.get(o, "")} for o in used],
                    "predicate": pred,
                    "expected": expected,
                    "tags": s["tags"] + ([] if expected else ["negative"]),
                    "source": f"{args.video.name}@{t:.1f}s",
                })
        print(f"  line {s['line']:>3}  {s['kw']:<9} {' '.join(s['args']):<24} "
              f"{len(times)} frames x {len(pos) + len(neg)} questions")

    mode = "a" if args.append else "w"
    with args.labels.open(mode) as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    n_pos = sum(r["expected"] for r in rows)
    print(f"\n{n_frames} frames -> {args.data}")
    print(f"{len(rows)} cases ({n_pos} positive, {len(rows) - n_pos} negative) "
          f"from {len({r['group'] for r in rows})} setups -> {args.labels}")
    print("Next: python -m eval.run_eval")


if __name__ == "__main__":
    main()
