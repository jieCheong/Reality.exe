"""Measure perception accuracy on a labeled photo set.

    cd backend
    python -m eval.run_eval                       # real Gemini calls, writes eval/results/
    python -m eval.run_eval --from-cache eval/results/run_<ts>.json   # re-score, no API
    python -m eval.run_eval --dry-run             # plumbing check, no API key needed

Labels live in eval/labels.jsonl (one JSON object per line):

    {"id": "ontop_01",
     "images": ["ontop_01.jpg"],               # 1 photo, or 3 for a burst (voting path)
     "objects": [{"name": "bottle", "description": "clear plastic water bottle"},
                 {"name": "notebook", "description": "black spiral notebook"}],
     "predicate": "ON_TOP_OF(bottle, notebook)",
     "expected": true,
     "tags": ["good_light", "hard_negative"]}

LEFT/RIGHT labels are in IMAGE coordinates (as the photo looks on screen).
Eval runs with flip_left_right=False so labels and checks agree.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from app.perception import (  # noqa: E402
    DetectedObject, FakeVision, Frame, FrameJudgment, FrameVerdict, PerceptionConfig,
    PerceptionService, Predicate, to_pil, vote,
)

THRESHOLDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]


# --------------------------------------------------------------------------- #
def load_labels(path: Path) -> list[dict]:
    rows = []
    for i, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("#"):
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            raise SystemExit(f"{path}:{i}: bad JSON: {e}")
    return rows


async def run_cases(rows: list[dict], data_dir: Path, svc_factory, concurrency: int) -> list[dict]:
    sem = asyncio.Semaphore(concurrency)
    out: list[dict] = []

    async def one(row: dict) -> None:
        async with sem:
            svc: PerceptionService = svc_factory()
            svc.set_catalog([DetectedObject(name=o["name"], description=o.get("description", ""))
                             for o in row["objects"]])
            frames = [Frame(image=to_pil(str(data_dir / p))) for p in row["images"]]
            pred = Predicate.parse(row["predicate"])
            t0 = time.perf_counter()
            res = await svc.verify(pred, frames)
            errs = [v.error for v in res.frame_verdicts if v.error]
            out.append({
                "error": errs[0] if errs else None,
                "id": row["id"], "predicate": row["predicate"], "type": pred.type.value,
                "expected": bool(row["expected"]), "tags": row.get("tags", []),
                "n_images": len(frames), "status": res.status,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "frame_verdicts": [v.model_dump() for v in res.frame_verdicts],
                "evidence": res.evidence, "correction_hint": res.correction_hint,
            })
            verdict = "ERROR" if errs else ("PASS" if res.satisfied else "fail")
            print(f"  {row['id']:<24} expected={row['expected']!s:<5} -> "
                  f"{verdict} ({res.votes_for}/{res.votes_total}, {res.latency_ms:.0f} ms)"
                  + (f"  {errs[0][:120]}" if errs else ""), flush=True)

    await asyncio.gather(*(one(r) for r in rows))
    return sorted(out, key=lambda r: r["id"])


# --------------------------------------------------------------------------- #
def decide(case: dict, threshold: float, votes_needed: int) -> bool:
    """Re-run the (pure) vote on cached per-frame verdicts at a given threshold."""
    if case["status"] != "checked" and not case["frame_verdicts"]:
        return False
    vs = [FrameVerdict(**v) for v in case["frame_verdicts"]]
    k = min(votes_needed, len(vs)) if vs else 1
    return vote(vs, votes_needed=k, min_confidence=threshold).satisfied


def scored(cases: list[dict]) -> list[dict]:
    """Cases where any frame hit an API error are excluded: an error is not a 'no'."""
    return [c for c in cases if not c.get("error")
            and not any(v.get("error") for v in c["frame_verdicts"])]


def metrics(cases: list[dict], threshold: float, votes_needed: int) -> dict:
    tp = fp = tn = fn = 0
    for c in scored(cases):
        pred = decide(c, threshold, votes_needed)
        if c["expected"] and pred: tp += 1
        elif c["expected"] and not pred: fn += 1
        elif not c["expected"] and pred: fp += 1
        else: tn += 1
    n = tp + fp + tn + fn
    div = lambda a, b: (a / b) if b else float("nan")
    return dict(n=n, tp=tp, fp=fp, tn=tn, fn=fn,
                accuracy=div(tp + tn, n), precision=div(tp, tp + fp),
                recall=div(tp, tp + fn), fpr=div(fp, fp + tn))


def pct(x: float) -> str:
    return "n/a" if x != x else f"{100 * x:.1f}%"


def report(cases: list[dict], threshold: float, votes_needed: int, model_name: str) -> str:
    n_err = len(cases) - len(scored(cases))
    m = metrics(cases, threshold, votes_needed)
    lat = [c["latency_ms"] for c in cases if c["status"] == "checked"]
    frame_lat = [v["latency_ms"] for c in cases for v in c["frame_verdicts"] if not v.get("error")]
    errors = sum(1 for c in cases for v in c["frame_verdicts"] if v.get("error"))
    q = lambda xs, p: (statistics.quantiles(xs, n=100)[p - 1] if len(xs) >= 2 else (xs[0] if xs else 0))

    L = [f"# Perception eval results", "",
         f"- Date: {time.strftime('%Y-%m-%d %H:%M')}",
         f"- Model: `{model_name}`",
         f"- Decision rule: {votes_needed}-of-n frames, min confidence {threshold}",
         f"- Cases scored: {m['n']} of {len(cases)} "
         f"({sum(c['expected'] for c in scored(cases))} positive, "
         f"{sum(not c['expected'] for c in scored(cases))} negative)",
         f"- **Errored and excluded from scores: {n_err}**"
         + (" (re-run these; usually a rate limit)" if n_err else ""), "",
         "## Headline", "",
         "| Accuracy | Precision | Recall | False-pass rate | Case latency p50 / p95 | Per-call p50 | API errors |",
         "|---|---|---|---|---|---|---|",
         f"| **{pct(m['accuracy'])}** | {pct(m['precision'])} | {pct(m['recall'])} | {pct(m['fpr'])} "
         f"| {q(lat,50):.0f} / {q(lat,95):.0f} ms | {q(frame_lat,50):.0f} ms | {errors} |", "",
         "False-pass rate = negatives we wrongly verified (the 'said done but didn't do it' case). "
         "Keep this near 0; a false fail just means the player tries again.", "",
         f"Confusion: TP {m['tp']} · FN {m['fn']} · FP {m['fp']} · TN {m['tn']}", ""]

    L += ["## By predicate", "", "| Predicate | n | Accuracy | Recall | False-pass |", "|---|---|---|---|---|"]
    by = defaultdict(list)
    for c in cases: by[c["type"]].append(c)
    for k in sorted(by):
        mm = metrics(by[k], threshold, votes_needed)
        L.append(f"| {k} | {mm['n']} | {pct(mm['accuracy'])} | {pct(mm['recall'])} | {pct(mm['fpr'])} |")

    tags = sorted({t for c in cases for t in c["tags"]})
    if tags:
        L += ["", "## By condition tag", "", "| Tag | n | Accuracy | False-pass |", "|---|---|---|---|"]
        for t in tags:
            sub = [c for c in cases if t in c["tags"]]
            mm = metrics(sub, threshold, votes_needed)
            L.append(f"| {t} | {mm['n']} | {pct(mm['accuracy'])} | {pct(mm['fpr'])} |")

    L += ["", "## Threshold sweep", "", "| min confidence | Accuracy | Recall | False-pass |", "|---|---|---|---|"]
    for t in THRESHOLDS:
        mm = metrics(cases, t, votes_needed)
        mark = " ←" if abs(t - threshold) < 1e-9 else ""
        L.append(f"| {t}{mark} | {pct(mm['accuracy'])} | {pct(mm['recall'])} | {pct(mm['fpr'])} |")

    wrong = [c for c in scored(cases) if decide(c, threshold, votes_needed) != c["expected"]]
    if wrong:
        L += ["", "## Misses", "", "| Case | Predicate | Expected | Model evidence | Geometry override |",
              "|---|---|---|---|---|"]
        for c in wrong:
            ov = "; ".join(v["geometry_override"] for v in c["frame_verdicts"] if v.get("geometry_override")) or ""
            ev = c["evidence"].replace("|", "/")
            L.append(f"| {c['id']} | `{c['predicate']}` | {c['expected']} | {ev} | {ov} |")
    return "\n".join(L) + "\n"


# --------------------------------------------------------------------------- #
def dry_run_model() -> FakeVision:
    """Always says YES with fake side-by-side boxes. Plumbing check only;
    the numbers it produces mean nothing."""
    import re
    from app.perception.schemas import ObjectLocation

    def respond(images, prompt, schema):
        names = re.findall(r'^- "([^"]+)"', prompt, flags=re.M)
        objs = [ObjectLocation(name=n, visible=True, box_2d=[100, 100 + 250 * i, 300, 200 + 250 * i])
                for i, n in enumerate(names)]
        return FrameJudgment(satisfied=True, confidence=0.9, objects=objs, evidence="dry run")
    return FakeVision(respond)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", type=Path, default=ROOT / "labels.jsonl")
    ap.add_argument("--data", type=Path, default=ROOT / "data")
    ap.add_argument("--out", type=Path, default=ROOT / "results")
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--votes", type=int, default=2)
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--scene-check", action="store_true",
                    help="apply motion/blur/dark gating (off by default: handheld bursts move)")
    ap.add_argument("--from-cache", type=Path, help="re-score a previous run JSON, no API calls")
    ap.add_argument("--dry-run", action="store_true", help="fake model; tests the plumbing only")
    ap.add_argument("--only", help="substring filter on case id")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    if args.from_cache:
        blob = json.loads(args.from_cache.read_text())
        cases, model_name = blob["cases"], blob.get("model", "?")
    else:
        rows = load_labels(args.labels)
        if args.only:
            rows = [r for r in rows if args.only in r["id"]]
        if not rows:
            raise SystemExit(f"No cases in {args.labels}. See eval/SHOT_LIST.md.")
        if args.dry_run:
            model, model_name = dry_run_model(), "dry-run"
        else:
            try:
                from dotenv import load_dotenv
                load_dotenv(ROOT.parent / ".env")
            except ImportError:
                pass  # fine if GEMINI_API_KEY is already exported
            from app.perception.model import make_model
            model = make_model()
            model_name = model.model
        cfg = PerceptionConfig(flip_left_right=False, scene_check=args.scene_check,
                               min_confidence=args.threshold, votes_needed=args.votes)
        print(f"Running {len(rows)} cases on {model_name} ...")
        cases = asyncio.run(run_cases(rows, args.data, lambda: PerceptionService(model, cfg),
                                      args.concurrency))
        stamp = time.strftime("%Y%m%d_%H%M%S")
        raw = args.out / f"run_{stamp}.json"
        raw.write_text(json.dumps({"model": model_name, "cases": cases}, indent=2))
        print(f"raw results -> {raw}")

    md = report(cases, args.threshold, args.votes, model_name)
    (args.out / "RESULTS.md").write_text(md)
    print("\n" + md.split("## By predicate")[0])
    print(f"full report -> {args.out / 'RESULTS.md'}")


if __name__ == "__main__":
    main()
