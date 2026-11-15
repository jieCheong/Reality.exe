# Parts B + C: local playable vertical slice

## Actual sources and contracts

Shivam's source was found in `Downloads/Reality.exe-Shivam.zip/backend/`.
`vision-service/vendor/` contains the original app/perception modules and tests,
byte-for-byte unchanged. UPSTREAM.json records SHA-256 hashes for all nine files.
The perception folder has frames.py, model.py (GroqVision and an older unused
Gemini adapter), predicates.py, schemas.py, service.py, voting.py and __init__.py.
It had no HTTP server or deterministic mission engine. The original factory
selects Gemini by default; this integration NEVER invokes it. No Google SDK or
Gemini request is used. The new provider path is explicitly Groq.

PerceptionService.inventory(frames) returns objects with name, description,
normalized box_2d; verify(predicate, frames) returns status, satisfied,
confidence, votes_for, votes_total, predicate, correction_hint, frame_verdicts.
Frame verdicts retain per-image confidence, geometry overrides and API errors.
The original StabilityGate semantics (consecutive passing rounds, reset on
failure) are implemented in the Node mission engine and paired with disjoint
frame receipts; the Python original remains unchanged.

Part A's CallerFrame has owned RGBA bytes, sequence, generation, identity,
receipt time and rotation. CallerVideoAdapter provides frame/status events,
isCurrent(frame) and disconnect invalidation. Juan's independent renderer
already accepts hud.setState({gameState}); it is not modified by this slice.
The installed voice SDK supports session.say(...).waitForPlayout(),
voice.Agent.onUserTurnCompleted() and voice.StopResponse.

## Components

- vision-service/bridge.py: standard-library HTTP service bound to 127.0.0.1.
  GET /health reports mock/groq; POST /analyze handles inventory/verification.
  It wraps original scene checks, prompts, parallel judgments and votes.
- vision-client.mjs: loopback-only HTTP, no redirects, bounded request deadline;
  validates provider mode, request ID, revision and exact frame receipt IDs.
  Provider credentials never pass through the Node client or HTTP body.
- mission-engine.mjs: deterministic SCAN → POWER → SECURITY → PORTAL → escaped.
  Discovery needs two matching inventories; preferred flat support and small
  access-key nouns get deterministic roles, with stable fallback assignments.
  POWER requires ON_TOP_OF(reactor,panel); SECURITY HELD_UP(key); PORTAL
  ORDER_LEFT_TO_RIGHT(reactor,panel,key). Names are inventory nouns, not role IDs.
- game-runtime.mjs: per-call frame queue, one request at a time, immutable
  request/revision binding, HUD snapshots and scripted instructions/hints.
- game-contracts.ts: HTTP request/result/envelope interfaces for teammates.
- agent.mjs: an opt-in game runtime after the existing voice session starts;
  starts only on the existing Chert bridge-ready signal. No connection,
  camera publication, caller-capture or credentials are replaced.

## Fail-closed and latency behavior

Every verification request needs THREE distinct images at least 150 ms apart
(Node samples at least 200 ms apart), captured recently. The wrapper never
lets the upstream service lower its two-vote requirement to one frame. Three
judgments run concurrently; at least two must pass at confidence >=0.7 with no
error or geometry veto. Errors count as NO. A positive with missing exact
object geometry, invalid boxes or an invalid schema is vetoed, never promoted.
The original scene quality gate is applied once, before inventory or verification;
the inner service scene-check flag is off only to avoid repeating that same gate.

Two consecutive passing rounds with disjoint frame IDs are required per mission.
Repeated frames, missing frames, low confidence, rejected geometry, model errors,
invalid inputs and failed checks do not advance state. A failed check or camera
mute/unpublish/replacement/disconnect resets the current streak. Completed
missions stay completed; the evidence cache does not survive into a new call.

The queue holds at most 16 sampled frames, allows one HTTP operation at a time,
and waits at least 2.5 seconds between attempts. There are no automatic provider
retries, speculative checks, model-key probes or fallback providers. Groq SDK
retries are disabled; its timeout is 7 s, the server analysis deadline is 8 s,
and the Node deadline is 9.5 s. Results older than the frame freshness budget
are discarded even if the provider eventually says yes. No real latency
improvement or false-pass accuracy is claimed until actual camera/model evals.
The bounds improve worst-case waiting versus the original 30 s + retries/backoff.

Checks use only frames received AFTER ORBIT finishes the current spoken
instruction. New camera generations and phase/revision changes invalidate
in-flight work. The engine also refuses re-used evidence IDs. Left/right is
explicitly IMAGE coordinates, with no implicit mirroring; the instruction says
left edge of the camera picture. Calibrate this against the real saved feed.

## ORBIT and HUD

When ENABLE_GAME is not yes, the working Part A voice behavior remains unchanged.
In game mode, the existing STT/TTS transport stays in use; scripted ORBIT lines
announce instructions, verified success and correction hints. Free-form LLM
responses are suppressed by the SDK's StopResponse hook, so saying 'done' cannot
produce a fabricated success. 'Help', 'hint' or 'repeat' repeats the current
instruction. Repeated hints are throttled. Failed voice playout blocks further
checks rather than checking actions whose instructions may not have been heard.

HUD snapshots contain only phase, short actionable objective, explicit checkpoint
statuses and missionProgress. The renderer stays independent. Escaped is shown
as PORTAL, all checkpoints complete, progress 1, objective ESCAPE COMPLETE.

## Run local tests now (no provider or FaceTime calls)

Python dependencies were installed in `/tmp/reality-vision-venv` for this session.
That environment is temporary and not committed. For a durable environment,
create a local venv after installing Ubuntu's python3-venv support if needed,
then install vision-service/requirements.txt. Provider keys are unnecessary for tests.

From the agent folder:

```bash
npm run check
npm run check:types
npm test
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service/test_bridge.py vision-service/vendor/tests
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
```

The E2E script spawns a mock Python service on an ephemeral LOOPBACK port, sends
synthetic camera JPEGs across real HTTP, runs original perception/voting and
progresses through all missions. Voice and HUD outputs are spies; no real audio
is recognized/synthesized. A scripted failed verification tests the correction
path before successful rounds. HUD and voice are explicitly marked MOCK VISION.
This tests plumbing and false-pass guards, NOT real vision quality.

## Future live operation — requires approval; not started here

1. Keep the existing Chert/LiveKit project and confirmed free Build configuration.
2. Confirm the Groq account's actual free allowance and model access; no free or
   unlimited allowance is assumed. Supply GROQ_API_KEY privately in the Python
   service environment, never in chat or the Node request. Set GROQ_MODEL only
   to a Groq vision model you have verified. This slice uses qwen/qwen3.8-27b.
3. Only after approval, launch the Python process with explicit provider opt-in:
   `python vision-service/bridge.py --provider groq --allow-provider-calls`.
   Without that flag and key, real provider startup is refused. The default
   server is MOCK and never contacts Groq.
4. Set ENABLE_GAME=yes and VISION_MODE=groq in the existing private agent env.
   Leave VISION_SERVICE_URL=http://127.0.0.1:8765. Restart the existing agent and
   connector after ending active calls; old warm rooms can hold old code.
5. Use a bottle, notebook and pen for the first controlled test. Compare saved
   frames with model verdicts; exercise near misses, 'done' without moving,
   blur/darkness, camera mute/replacement and a fresh second call.

For a deliberate future mock call, VISION_MODE=mock is required. A real-mode
client refuses mock-server replies; explicit mock mode labels HUD/voice and
must never be reported as real verification. Calls still consume ordinary voice
and Chert allowances even if the vision backend is mocked.

Groq sources inspected (read-only):
- https://console.groq.com/docs/vision (model, image limits and JSON mode)
- https://console.groq.com/docs/structured-outputs (JSON mode requires validation)

## Remaining real-world risks

No real Groq account, rate limit, inference latency, image recognition accuracy,
physical-support judgment or left/right orientation was tested. Geometry and
multi-frame consistency reduce false passes; they cannot prove a model correct.
Some arbitrary object sets may not be suitable for stacking; noun-based role
assignment is a deterministic starting policy, not a size/weight safety check.
Hold still during a check; image-byte deduplication deliberately rejects a frozen
feed even if that creates false negatives. Real provider/FaceTime testing and
calibration need approval. No Gemini, Grok, new voice provider, billing change,
commit or push is involved in this slice.

Final local validation: PASS — 21 Node tests (including all 16 prior Part A/HUD
tests), 24 Python tests (including all 18 unchanged upstream tests), and one
mock local-HTTP E2E test: 46 total. JS/Python syntax and TypeScript checks pass.
The E2E completed nine scripted vision rounds, emitted five HUD states and six
scripted utterances; no provider or Chert calls occurred. This is not a real
Groq/voice/FaceTime or physical-verification accuracy result.

For the current controlled-test activation sequence, voice/theme gates, sanitized
diagnostics, and manual PASS/FAIL criteria, use
[CONTROLLED-TESTING.md](CONTROLLED-TESTING.md). It supersedes the earlier future
launch outline above and preserves the deterministic verification guards.
