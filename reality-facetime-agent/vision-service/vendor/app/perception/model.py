"""Vision model clients.

`VisionModel` is the only thing the rest of perception depends on, so tests
and the mock pipeline use `FakeVision` and never touch the network.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Callable, Optional, Protocol, Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "gemini-3.5-flash"   # override with GEMINI_MODEL


class VisionModel(Protocol):
    async def ask(self, images: list[bytes], prompt: str, schema: Type[T]) -> T: ...


class GeminiVision:
    """Gemini via the `google-genai` SDK with structured JSON output."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None,
                 timeout_s: float = 8.0, retries: int = 3):
        from google import genai  # imported lazily so tests don't need it

        self.client = genai.Client(api_key=api_key or os.environ["GEMINI_API_KEY"])
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
        self.timeout_s = timeout_s
        self.retries = retries
        # Optional: lower thinking for latency on Gemini 3.x ("low"/"minimal").
        self.thinking_level = os.getenv("GEMINI_THINKING_LEVEL")

    def _config(self, schema: Type[BaseModel]):
        from google.genai import types

        kw = dict(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
        )
        if self.thinking_level:
            kw["thinking_config"] = types.ThinkingConfig(thinking_level=self.thinking_level)
        return types.GenerateContentConfig(**kw)

    async def ask(self, images: list[bytes], prompt: str, schema: Type[T]) -> T:
        from google.genai import types

        parts = [types.Part.from_bytes(data=img, mime_type="image/jpeg") for img in images]
        contents = [*parts, prompt]
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                resp = await asyncio.wait_for(
                    self.client.aio.models.generate_content(
                        model=self.model, contents=contents, config=self._config(schema)),
                    timeout=self.timeout_s,
                )
                if isinstance(resp.parsed, schema):
                    return resp.parsed
                return schema.model_validate(json.loads(resp.text))
            except Exception as e:  # timeout, 429/5xx, bad JSON...
                last = e
                msg = repr(e)
                # Permanent problems (bad key, no credits, bad model name): don't retry.
                if any(c in msg for c in ("400", "401", "402", "403", "404")):
                    break
                if attempt < self.retries:
                    # Rate limit / overload: back off 2s, 4s, 8s ...
                    await asyncio.sleep(2 ** (attempt + 1))
        raise RuntimeError(f"Gemini call failed: {last!r}")


class FakeVision:
    """Deterministic stand-in. `responder(images, prompt, schema)` returns a
    schema instance (or dict). Optionally sleeps to simulate latency."""

    def __init__(self, responder: Callable[[list[bytes], str, Type[BaseModel]], object],
                 delay_s: float = 0.0):
        self.responder = responder
        self.delay_s = delay_s
        self.calls: list[str] = []

    async def ask(self, images: list[bytes], prompt: str, schema: Type[T]) -> T:
        self.calls.append(prompt)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        out = self.responder(images, prompt, schema)
        if isinstance(out, Exception):
            raise out
        return out if isinstance(out, schema) else schema.model_validate(out)


# --------------------------------------------------------------------------- Groq
GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b"   # override with GROQ_MODEL


def _strip_fences(text: str) -> str:
    """Pull the JSON object out of a reply that may have ```json fences or
    <think> reasoning around it."""
    t = text.strip()
    if "</think>" in t:
        t = t.split("</think>", 1)[1].strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    start, end = t.find("{"), t.rfind("}")
    return t[start:end + 1] if start != -1 and end != -1 else t


class GroqVision:
    """Groq vision model via the `groq` SDK (pip install groq).
    Asks for a JSON object matching the schema and validates it with pydantic."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None,
                 timeout_s: float = 30.0, retries: int = 5):
        from groq import AsyncGroq

        self.client = AsyncGroq(api_key=api_key or os.environ["GROQ_API_KEY"])
        self.model = model or os.getenv("GROQ_MODEL", GROQ_DEFAULT_MODEL)
        self.timeout_s = timeout_s
        self.retries = retries
        # Qwen3-style models think before answering; "none" skips that for speed.
        # Set GROQ_REASONING_EFFORT= (empty) to not send the parameter at all.
        self.reasoning_effort = os.getenv("GROQ_REASONING_EFFORT", "none") or None

    async def ask(self, images: list[bytes], prompt: str, schema: Type[T]) -> T:
        import base64

        content = [{"type": "text", "text": (
            prompt + "\n\nReply with ONLY a JSON object (no prose, no code fences) "
            "matching this JSON schema:\n" + json.dumps(schema.model_json_schema()))}]
        for img in images[:5]:  # Groq allows at most 5 images per request
            b64 = base64.b64encode(img).decode()
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        kw = dict(model=self.model, temperature=0,
                  messages=[{"role": "user", "content": content}],
                  response_format={"type": "json_object"})
        if self.reasoning_effort:
            kw["reasoning_effort"] = self.reasoning_effort

        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                resp = await asyncio.wait_for(
                    self.client.chat.completions.create(**kw), timeout=self.timeout_s)
                text = resp.choices[0].message.content or ""
                return schema.model_validate(json.loads(_strip_fences(text)))
            except Exception as e:
                last = e
                msg = repr(e)
                # Model doesn't accept reasoning_effort: drop it and try again.
                if "reasoning" in msg and "reasoning_effort" in kw:
                    kw.pop("reasoning_effort")
                    continue
                if any(c in msg for c in ("400", "401", "402", "403", "404")):
                    break
                if attempt < self.retries:
                    # Free tier is limited by tokens/minute: wait 2,4,8,16,30s (~1 min total)
                    await asyncio.sleep(min(2 ** (attempt + 1), 30))
        raise RuntimeError(f"Groq call failed: {last!r}")


def make_model() -> "VisionModel":
    """Pick the provider from VISION_PROVIDER in .env: 'gemini' (default) or 'groq'."""
    provider = os.getenv("VISION_PROVIDER", "gemini").strip().lower()
    if provider == "groq":
        return GroqVision()
    if provider == "gemini":
        return GeminiVision()
    raise ValueError(f"Unknown VISION_PROVIDER={provider!r}; use 'gemini' or 'groq'")
