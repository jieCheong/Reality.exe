"""Quick manual check against the real model — use while iterating on prompts.

    python -m eval.check --inventory photo.jpg
    python -m eval.check --predicate "ON_TOP_OF(bottle, notebook)" a.jpg [b.jpg c.jpg]

With --predicate and no --objects, it runs an inventory first and uses those
names, so make sure the names in your predicate match what it prints.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from app.perception.model import make_model  # noqa: E402
from app.perception import (  # noqa: E402
    DetectedObject, Frame, PerceptionConfig, PerceptionService, Predicate, to_pil,
)


async def amain(a) -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT.parent / ".env")
    except ImportError:
        pass
    svc = PerceptionService(make_model(), PerceptionConfig(
        flip_left_right=a.flip, scene_check=False))
    frames = [Frame(image=to_pil(p)) for p in a.images]

    if a.objects:
        svc.set_catalog([DetectedObject(name=n.strip(), description="") for n in a.objects.split(",")])
    if a.inventory or (a.predicate and not a.objects):
        inv = await svc.inventory(frames)
        print("INVENTORY", json.dumps(inv.model_dump(), indent=2))
    if a.predicate:
        res = await svc.verify(Predicate.parse(a.predicate), frames)
        print("VERDICT", json.dumps(res.model_dump(), indent=2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--predicate")
    ap.add_argument("--objects", help="comma-separated names, skips inventory")
    ap.add_argument("--inventory", action="store_true")
    ap.add_argument("--flip", action="store_true", help="interpret left/right from the player's view")
    asyncio.run(amain(ap.parse_args()))


if __name__ == "__main__":
    main()
