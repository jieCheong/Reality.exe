# Local routine integration and controlled-image replay

This selectively integrates perception from Shivam commit e62ed3d while retaining
Jie's existing three-step parent routine. No upstream engine, nine-step routine,
HUD, video, voice provider, credentials, or Chert configuration was imported.
Real Groq requests have NOT been run during this implementation.

## What changed

Vendored predicates/schemas/service and associated upstream tests are refreshed.
The conservative contact patch remains an explicit local override, documented in
vision-service/LOCAL-PATCHES.md with a reviewable v2 diff and pinned provenance.
New model_satisfied and boxes diagnostics are additive. Consumers retain the same
status/predicate/votes/frame_verdicts result contract and bound HTTP envelope.
HIDDEN and SHOW are NOT enabled by our routine contracts or bridge integration.

examples/routines/morning.json is unchanged: toothbrush/backpack/shoes, then
HELD_UP(toothbrush), ON_TOP_OF(shoes, backpack), LEFT_OF(backpack, shoes).
It is structurally compatible, not yet physically verified. Inventory names must
match exactly; singular shoe, bag or other synonyms do not auto-pass. The inventory
prompt asks for handheld objects; reliably naming shoes/backpack still needs a real
controlled test. No showing-a-toothbrush result proves teeth were brushed.

## Latency findings and safety

The pinned eval cache run_20261114_182929.json contains 37 cases, EACH with one
image. Median case time is 25359.2 ms; median FrameVerdict time is 25358.8 ms.
run_eval times service.verify(); the frame judgment timer wraps the model client.
It therefore includes request/network/model time and any wrapper/SDK retries or
backoff, but excludes image-file loading. No recorded stage timestamps distinguish
queueing, network, retries, reasoning or token generation. We cannot identify a
single cause or promise current latency without an approved real measurement.

GroqVision in that evaluation defaults to 30-second calls and five wrapper retries,
with SDK retry defaults also active. Our bridge instead uses GroqOnlyVision:
max_retries=0, SDK timeout 7 seconds, max_completion_tokens=700, JSON mode,
reasoning_effort=none. The bridge has an outer eight-second deadline, and Node HTTP
has a 9.5-second timeout. All are unchanged. HTTPX/SDK timeout is not a substitute
for the bridge's total wall deadline. Verification launches three model asks
concurrently, not sequentially. Two consecutive two-of-three rounds are required.

A 25-second response is incompatible with our current runtime. Increasing only
HTTP timeouts cannot fix that: frames older than six seconds are rejected at apply.
No timeout or freshness limit was increased. If current approved smoke tests still
show this latency, gameplay remains blocked pending measured optimization with
Shivam. Do not silently accept 25-second-old observations.

capturedAtMs in FaceTime is local receipt time when CallerVideoAdapter decodes an
incoming frame (not the iPhone sensor timestamp). It is retained through JPEG,
HTTP, and evidence reports. It is never replaced by request/response time.
Selection requires age <5 seconds; bridge admission permits <=6 seconds;
post-response acceptance requires age <6 seconds, current track generation,
unchanged epoch/revision, and an active step before its deadline. Encoding is now
revalidated BEFORE upload as well, preventing a slow encode from sending stale
images. The deadline still wins over a late YES. Camera changes, pause, narration,
close and phase transitions invalidate/abort pending work. Client abort cannot
recall a request Groq already received; bridge deadline remains bounded.

Numeric-only diagnostics now include encodeMs and captureAgeMs alongside existing
HTTP round latencyMs. No object names, boxes, images, model text or keys are logged.
Provider exceptions, uncertain and malformed responses do not incur failure penalties.
The routine's independently running timer can still expire naturally during a slow
request; that is a missed timed step, not a penalty for an invalid verdict.

## Offline commands in WSL

```bash
cd reality-facetime-agent
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
npm test
npm run check
npm run check:types
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service
python3 vision-service/verify_provenance.py
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:routine:e2e
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:routine:sequence:e2e
npm run demo:routine
npm run demo:routine:sequence -- --dry-run
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run demo:routine:sequence
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run demo:routine:sequence -- --delay-ms 6200
```

The default sequence command generates 22 distinct synthetic JPEG files plus a
manifest under a unique ignored .local/routine-sequence-* directory, starts an
explicit mock loopback Python bridge, and runs scan + all three desk steps through
GameRuntime/VisionClient. It writes an atomic report.json there and stops its mock
bridge. Speech uses serialized scripted EVENTS ONLY: no TTS/STT/model/room.
No HUD renderer is launched. A 6200-ms delayed replay is EXPECTED to exit 1 with
complete=false and no accepted steps: responses became stale. This is a safety pass,
not a recognition pass. Tests also inject step timeout, cancellation, disconnect,
completion and shutdown while an uncooperative request is pending.

## Prepare real controlled photographs (NO request yet)

Create an ignored local manifest, e.g. .local/morning-sequence/manifest.json.
Paths are relative to the manifest. File format:

```json
{
  "routine": "../../examples/routines/morning.json",
  "rounds": [
    {"stepIndex": -1, "images": ["scan-1a.jpg", "scan-1b.jpg"]},
    {"stepIndex": -1, "images": ["scan-2a.jpg", "scan-2b.jpg"]},
    {"stepIndex": 0, "images": ["held-1a.jpg", "held-1b.jpg", "held-1c.jpg"]},
    {"stepIndex": 0, "images": ["held-2a.jpg", "held-2b.jpg", "held-2c.jpg"]},
    {"stepIndex": 1, "images": ["stack-1a.jpg", "stack-1b.jpg", "stack-1c.jpg"]},
    {"stepIndex": 1, "images": ["stack-2a.jpg", "stack-2b.jpg", "stack-2c.jpg"]},
    {"stepIndex": 2, "images": ["left-1a.jpg", "left-1b.jpg", "left-1c.jpg"]},
    {"stepIndex": 2, "images": ["left-2a.jpg", "left-2b.jpg", "left-2c.jpg"]}
  ]
}
```

Use 22 independent photographs, good light and a still, unobstructed scene. A repeated
decoded image fails preflight before requests. The dry-run validates ALL images,
limits, routine and round ordering without starting a service:

```bash
npm run demo:routine:sequence -- --provider groq --manifest .local/morning-sequence/manifest.json --dry-run
```

REPLAY LIMITATION: disk images are injected with replay-ingestion timestamps spaced
220 ms apart to exercise existing transport freshness checks. These timestamps do
not attest when the photographs were taken or prove live physical actions. Output
always says CONTROLLED_IMAGE_REPLAY and realWorldVerification=false. Report photo
receipts refer to replay ingestion. The runner stops rather than inventing a pass
when a round does not reach the expected next step. No automatic request retry.

## Real provider execution: ONLY after separate explicit approval

Confirm account allowance first. A successful full sequence makes at least 20
provider requests: two inventories plus 3 steps × 2 rounds × 3 frame requests.
The runner has no provider credential and does not enable billing.

Terminal A, only after approval, privately enter the key; do not paste it into chat:

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider groq --allow-provider-calls
```

Terminal B, only after approval:

```bash
npm run demo:routine:sequence -- --provider groq --manifest .local/morning-sequence/manifest.json --allow-provider-calls
```

Expected success: complete=true, three done statuses and three positive evidence
photos in the private local report. Failures/latency/false passes require review;
a scripted mock pass is not evidence of real Groq accuracy. Stop Python with Ctrl+C
and unset GROQ_API_KEY in terminal A when finished. Inspect the private report
locally; do not commit photos or reports.

## Later FaceTime launch (not executed here)

Once Chert is accepting calls AND live provider use is separately approved, use
Terminal A above for the bridge. Stop an older agent gracefully before Terminal B:

```bash
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq VISION_SERVICE_URL=http://127.0.0.1:8765 npm start
```

Terminal C:

```bash
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 3 --json
```

Wait for agent_warm, then call the existing FaceTime line. Chert line_offline and
real iPhone camera delivery remain external transport tests. Voice-provider usage
and HUD timer rendering are separate real-call checks; neither is verified by this
local runner. Existing voice settings and Juan's HUD are unchanged.
