# Jie: Routine mode (A1 / A2 / A3)

A1 and A2 are implemented and validated offline. A3 (a recorded real phone run,
image-left/right calibration and display-size confirmation) is NOT completed.
No new call or model request was started for this implementation. Guardian presence
is an operator/C1 workflow requirement, not an identity claim inferred by vision.
Use an adult-operated rehearsal until the parent setup/start flow is connected. Parent routine
mode is opt-in; the existing fixed missions remain the default.

## Entry point and compatibility

The shared routine example is `examples/routines/morning.json`, copied from the
team's Nov 15 task split. `routine-contract.mjs` validates parent JSON and makes an
immutable snapshot. `mission-engine.mjs` exports RoutineMissionEngine alongside
the unchanged fixed MissionEngine; `game-runtime.mjs` chooses it only when supplied
an explicit routine. The agent loads `ROUTINE_FILE` only with `ENABLE_GAME=yes`.
Both processes must restart to load a changed parent file.

No three-theme placeholder catalog is needed in routine mode: the parent file
already supplies the theme. Existing theme selection stays in the fixed-game path.
Routine mode uses the existing ORBIT scripted-speech lane, STT/TTS, Chert connection,
caller-video adapter, JPEG encoder, LiveKit publisher and configured video profile.
No HUD renderer, video setting, provider implementation or teammate source changed.

Two current Part B limits are detected BEFORE worker registration:

- HIDDEN is allowed by the shared file contract but not by the installed verifier.
  Such a file is rejected explicitly, rather than inventing a hidden-object pass.
- The installed HTTP request schema/inventory supports at most three objects.
  Larger shared-contract routines require a coordinated B change first.

Other contract validation: unique lowercase object nouns; every step references
listed objects; correct predicate arity; distinct predicate arguments; nonnegative
integer timer values; minSeconds >=1 and startSeconds >=minSeconds. IDs/names,
labels, file size and collection lengths are bounded. Unknown JSON fields and
malformed JSON fail before startup without dumping parent file contents.

SCAN asks for missing required nouns and needs two matching fresh inventories.
The engine uses only scanned objects. Names must match exactly: the current Groq
inventory prompt can choose synonyms (e.g. bag/backpack), so real routine-object
recognition and naming still need Shivam's B2 evaluation. No alias guessing is used
to promote evidence. COVERED remains subject to the bridge's strict visibility/
geometry guard; fully occluded objects may be rejected until B evaluates them.

## Timer and verification semantics

For zero-based stepIndex i and the number of earlier missed steps m:

```
budgetSeconds = max(minSeconds,
  startSeconds - i * stepDecreaseSeconds - m * missPenaltySeconds)
```

minSeconds is a HARD floor after carried misses. Example 90/10/30 with 15-second
carry: a missed first step gives later budgets 65 then 55 if no further miss;
a second miss makes the third budget 40. Each new step clears its own failed-
check penalties. A conclusive rejected check subtracts fakeDonePenaltySeconds
from the current remaining time and may immediately expire the step.

Uncertain/low-confidence, malformed, stale, dark/blurry or provider-error results
never advance a step and do not penalize the child. The penalty is for an actual
checked negative round: at least two confident NOs or deterministic geometry
vetoes, with no provider errors. Automatic camera checks still run on the existing
2.5-second cadence, so a conclusive negative round can penalize without a spoken
'done'. 'Done' merely asks the runtime to check; it never bypasses visual evidence.

Two consecutive independent passing rounds still complete a step. Each round
needs three fresh frame receipts and >=2 positive votes at confidence >=0.7;
errors/geometry vetoes cannot count YES. Existing stale-evidence resets apply.
The step deadline wins over a late positive result. Countdown ticks while an HTTP
request is pending; an expired step invalidates that in-flight evidence.

Countdown starts after ORBIT successfully finishes the instruction. It pauses for
ORBIT narration, explicit stop/wait/pause, camera unavailability, and voice failure.
Resume/repeat/help/hint replays the authoritative instruction. Speech is serialized
and duplicate hints remain throttled. A step's reported `seconds` is active elapsed
time, excluding paused speech/camera intervals; penalty seconds are not fake elapsed
time. Timer expiration records missed, moves forward once, and carries the penalty.
Completion means all steps were processed; it does NOT imply every step was done.
ORBIT announces the actual done count, including zero if all steps were missed.

## Handoff to Juan (C1 / C2 / C3)

Types: `routine-contracts.ts`. C1 should use the exact shared JSON shape and can
call validateRoutine for parent-file validation; assertRoutineCapabilities exposes
current B limits separately. Do not duplicate the engine in the setup page.

Runtime already calls the existing `hud.setState({gameState})` API with:

```ts
{
  mode: 'routine', routineId, routineName, theme,
  stepIndex,                 // -1 in scan, steps.length at completion
  timeLeftSeconds,           // integer countdown; null during scan/completion
  budgetSeconds,             // null before step 1
  objective, missionProgress,
  routineSteps: [{ label, status: 'pending' | 'active' | 'done' | 'missed' }]
}
```

IMPORTANT: the existing spaceship normalizeGameState renderer currently drops
unknown fields. C2 must retain/read these routine fields and draw its countdown/
step list. Jie did NOT modify that teammate-owned renderer. Until Juan's change
lands, the legacy shell displays the objective/progress, while the routine engine
and outgoing state snapshots contain the full countdown. Legacy `phase` values
SCAN/POWER/PORTAL are compatibility shell values, not routine checkpoint names.
Use routineSteps and stepIndex for the new UI, not the old four fixed checkpoints.

Report record per completed or timed-out step:

```ts
{ label, status: 'done' | 'missed', seconds, evidence,
  evidenceFrame: null | { id, capturedAtMs, dataUrl } }
```

`dataUrl` is an owned JPEG from a positive verdict's frame_index in the SECOND
accepted round. Missing/failed/scan images are not retained as report photos.
No full camera video is stored. The camera debug sampler is disabled in routine
mode even if its legacy env toggle was set. The first ORBIT scan instruction
explicitly discloses camera checks and the parent evidence photo.

At finish (or interruption/close for a partial run), agent writes one local file:
`.local/routine-reports/<job-id>/report.json`. It contains routineId/routineName,
`complete`, `verification: 'mock' | 'groq'`, and the steps array. A partial report
has complete=false and only resolved steps; it does not mark untouched steps done.
Evidence images appear only there/in-memory, never in ordinary HUD state/logs.
The folder is ignored by Git; no report is uploaded or messaged automatically.
Render parent/model strings as text, not HTML. `verification` identifies configured
backend provenance, not measured accuracy or a medical claim.

Saved MOCK handoff (includes done/missed/done and countdown snapshots):

```bash
npm run demo:routine
```

Produces ignored local artifacts:

- `.local/routine-preview/hud-states.json`
- `.local/routine-preview/report.json` (blue synthetic photo, not recognition)
- `.local/routine-preview/announcements.json`

These can drive C2/C3 while their UI work continues. They are explicitly labeled
mock. No final theme content or visuals were invented or changed for this sample.

## Offline checks and routine preflight

In WSL, from the agent folder, with existing Node 24/nvm:

```bash
npm run check
npm run check:types
npm test
npm run demo:routine
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service/test_bridge.py vision-service/test_provenance.py vision-service/vendor/tests
python3 vision-service/verify_provenance.py
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:routine:e2e
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json node --env-file=.env.local test-readiness.mjs
```

Preflight only reads local config; routineSelected, routineReady, gameSessionReady
should be true. An empty theme catalog is expected and no longer blocks this path.
None of these commands creates a real room, calls an external provider or starts
FaceTime. The two E2E tests use ephemeral loopback Python MOCK servers and synthetic
JPEGs. The routine test performs nine mock vision rounds including one deliberate
failure, completes three parent-authored steps, and produces three mock evidence
photos through the actual Node → HTTP → Python → engine pipeline.

## A3: controlled real run still required

Prerequisites: parent operates the call; obtain explicit approval for live image
uploads/voice usage and any demo recording; confirm actual free allowances; finish
the single-image Groq recognition test using the existing prepared smoke runner;
review Shivam's B1 patch/eval status. The local contact patch passes regression,
but its real false-pass performance and routine-object eval remain unverified.
No ADHD treatment or teeth-brushing completion claim is made.

Only after those prerequisites, terminal A (private key typed silently):

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider groq --allow-provider-calls
```

Terminal B uses the parent routine without changing the current voice/video env:

```bash
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq VISION_SERVICE_URL=http://127.0.0.1:8765 npm start
```

If preserving an already approved process-local ElevenLabs selection, prefix the
same command with its existing TTS_PROVIDER=elevenlabs,
ELEVENLABS_REQUESTS_APPROVED=yes and TTS_FALLBACK_PROVIDER=livekit overrides. No
provider activation or private .env change was made by this implementation.

Terminal C, same folder, after stopping any old agent/connector gracefully:

```bash
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 3 --json
```

Wait for agent_warm. Parent places FaceTime Video call to the existing line. Verify
camera/privacy greeting, all three objects scanned, step 1 held up, step 2 actual
support (test a clear non-contact near miss first), then image-left/right step.
Compare the saved accepted evidence JPEG against the arrangement, not the mirrored
local selfie tile. Record timing/false-pass observations, parent report and misses.
Juan's renderer must be ready to demonstrate the big countdown. Keep the existing
video profile; the HUD framing owner handles display changes. A larger-looking
video alone is not verification of incoming camera orientation.

For A3 backup video, an adult/operator can manually screen-record the consented
phone rehearsal, keep the recording local and avoid unrelated people/documents.
There is no automatic recorder and no recording has been made here. Finish by
hanging up, Ctrl+C connector (wait for dev_stopped), then agent and Python; unset
GROQ_API_KEY in terminal A. Do not keep real reports in Git or claim the MOCK run
is a completed real-phone demo.
