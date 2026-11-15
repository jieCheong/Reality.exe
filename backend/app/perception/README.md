# Perception & Eval (Part B)

Turns call frames into trustworthy yes/no verdicts. No game state lives here:
the engine (C) decides what a verdict *means*.

## Setup
```bash
pip install google-genai pillow numpy pydantic python-dotenv pytest
# backend/.env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash      # optional; any vision Gemini model id
GEMINI_THINKING_LEVEL=low          # optional; lowers latency on Gemini 3.x
FLIP_LEFT_RIGHT=1                  # 1 = left/right from the player's view (see below)
```

## Pipeline per check (~1 model round trip)
1. **Sample** 3 frames spread over the last 1.5 s (sharpest near each slot), downscale to 768 px JPEG.
2. **Scene gate** (no model call): too dark / moving / blurry → `status="unstable_scene"` + spoken hint ("Hold still for a second").
3. **Judge** each frame in parallel: Gemini answers one narrow question + returns object boxes (structured JSON).
4. **Geometry veto** (code): named objects must be visible; LEFT_OF/ORDER are checked from box centers; ON_TOP_OF needs horizontal overlap. Code can only turn a YES into a NO.
5. **Vote**: ≥2 of 3 frames must say YES with confidence ≥ 0.7. Errors and timeouts count as NO (fail closed).
6. Optional `StabilityGate(required_streak=2)` if you want two passing rounds in a row.

## For Part A (integration)
```python
from app.perception import FrameBuffer
buffer = FrameBuffer()                 # one per call
# in the facetime-remote-video track loop:
buffer.add(frame)                      # LiveKit VideoFrame, numpy array, PIL image, or JPEG bytes
```
Sending every 3rd–5th frame is plenty (the buffer drops anything closer than 100 ms anyway).

**Left/right check on your first real call:** hold the pen in your LEFT hand and look at a saved
frame. If the pen is on the image's RIGHT, keep `FLIP_LEFT_RIGHT=1`, otherwise set it to 0.

## For Part C (engine)
```python
from app.perception import PerceptionService, GeminiVision, Predicate, StabilityGate
svc = PerceptionService(GeminiVision())

inv = await svc.inventory(buffer.sample(2))      # SCAN -> inv.objects[i].name / description / box_2d
# you map names to roles: {"reactor": "bottle", ...}

res = await svc.verify_buffer(Predicate.parse("ON_TOP_OF(bottle, notebook)"), buffer)
res.satisfied        # bool, fail-closed
res.confidence       # 0-1 "probability it's satisfied" (good for the meter)
res.evidence         # one-line reason for the dashboard
res.correction_hint  # spoken hint on a near miss (may be None -> use your scripted hint)
res.status           # checked | unstable_scene | no_frames | model_error
res.evidence_frame_index  # which of the sampled frames to show / save in the report
```
Always pass **object names** (from the inventory) into predicates, never role names.
To keep the evidence image: `frames = buffer.sample(3); res = await svc.verify(pred, frames); frames[res.evidence_frame_index].jpeg()`.

Mock until real: `FakeVision(lambda images, prompt, schema: {...})` returns whatever you script.

## Eval
See `eval/SHOT_LIST.md`, then `python -m eval.run_eval`. Output: `eval/results/RESULTS.md`.
Quick prompt iteration: `python -m eval.check --predicate "HELD_UP(pen)" photo.jpg`.
