"""One-shot Groq inventory smoke for a local image; never logs secrets or images."""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from bridge import GroqOnlyVision
from app.perception import Frame, PerceptionConfig, PerceptionService


DEFAULT_MODEL = "qwen/qwen3.8-27b"


def _box_is_normalized(box: list[int]) -> bool:
    if len(box) != 4 or any(type(value) is not int or not 0 <= value <= 1000 for value in box):
        return False
    ymin, xmin, ymax, xmax = box
    return ymin < ymax and xmin < xmax


def _safe_error(error: Exception) -> dict[str, object]:
    status = getattr(error, "status_code", None)
    if status in (401, 403):
        category = "authentication_or_access_error"
    elif status == 429:
        category = "rate_limited"
    elif status in (400, 404):
        category = "request_or_model_rejected"
    elif isinstance(error, (TimeoutError, asyncio.TimeoutError)) or "timeout" in type(error).__name__.lower():
        category = "timeout"
    elif isinstance(error, (ValueError, json.JSONDecodeError)):
        category = "invalid_model_response"
    else:
        category = "provider_error"
    safe_status = status if type(status) is int and 400 <= status <= 599 else None
    return {"error": category, "exception_type": type(error).__name__, "status_code": safe_status}


def _load_image(path: Path) -> tuple[Image.Image, tuple[int, int]]:
    with Image.open(path) as source:
        original_size = source.size
        image = source.convert("RGB")
    return image, original_size


async def _recognize(image: Image.Image):
    service = PerceptionService(
        GroqOnlyVision(),
        PerceptionConfig(scene_check=False, max_objects=3),
    )
    return await service.inventory([Frame(image)], max_objects=3)


def main() -> int:
    parser = argparse.ArgumentParser(description="Send one local image in exactly one Groq inventory request.")
    parser.add_argument("image", type=Path, help="Local image path; image bytes are sent only to Groq after running this command.")
    parser.add_argument("--dry-run", action="store_true", help="Validate the image locally without prompting for a key or calling Groq.")
    args = parser.parse_args()

    if not args.image.is_file():
        print(json.dumps({"error": "image_not_found"}), file=sys.stderr)
        return 2
    try:
        image, original_size = _load_image(args.image)
    except (OSError, UnidentifiedImageError, ValueError) as error:
        print(json.dumps({"error": "invalid_image", "exception_type": type(error).__name__}), file=sys.stderr)
        return 2

    if args.dry_run:
        print(json.dumps({
            "status": "dry_run",
            "image_name": args.image.name,
            "width": original_size[0],
            "height": original_size[1],
            "provider_requests": 0,
        }))
        return 0

    if not sys.stdin.isatty():
        print(json.dumps({"error": "interactive_terminal_required"}), file=sys.stderr)
        return 2
    api_key = getpass.getpass("Groq API key (hidden; used only for this process): ").strip()
    if not api_key:
        print(json.dumps({"error": "missing_api_key"}), file=sys.stderr)
        return 2

    os.environ["GROQ_API_KEY"] = api_key
    del api_key
    try:
        started = time.perf_counter()
        result = asyncio.run(_recognize(image))
        wall_latency_ms = round((time.perf_counter() - started) * 1000, 1)
        objects = [
            {
                "name": obj.name,
                "description": obj.description,
                "box_2d": obj.box_2d,
                "box_2d_format": "[ymin, xmin, ymax, xmax], normalized 0-1000",
                "box_valid": _box_is_normalized(obj.box_2d),
            }
            for obj in result.objects
        ]
        valid_boxes = all(obj["box_valid"] for obj in objects)
        print(json.dumps({
            "status": "ok" if valid_boxes else "invalid_boxes",
            "model": os.getenv("GROQ_MODEL", DEFAULT_MODEL),
            "image_name": args.image.name,
            "provider_requests": 1,
            "latency_ms": result.latency_ms,
            "wall_latency_ms": wall_latency_ms,
            "objects": objects,
        }))
        return 0 if valid_boxes else 1
    except Exception as error:
        print(json.dumps(_safe_error(error)), file=sys.stderr)
        return 1
    finally:
        os.environ.pop("GROQ_API_KEY", None)


if __name__ == "__main__":
    raise SystemExit(main())
