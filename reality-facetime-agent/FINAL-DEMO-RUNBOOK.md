# Reality.exe routine-coach demo — operator runbook

No provider request, connector or FaceTime call was started by this preparation.
This is a visible-action routine coach, not evidence that brushing teeth or another
unobserved activity occurred. The engine alone decides progress.

## Offline readiness

```bash
cd reality-facetime-agent
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
npm run check
npm run check:types
npm test
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service
python3 vision-service/verify_provenance.py
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:routine:e2e
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:routine:sequence:e2e
npm run demo:routine
npm run demo:routine:ui
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run demo:routine:sequence
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq node --env-file=.env.local test-readiness.mjs
```

Expected: local checks pass; routineReady/gameSessionReady true for morning.json.
The explicit ROUTINE_FILE matters: the inspected .env.local enables game mode but
has no routine selected. Do not start plain npm start for this demo without the
process overrides below. No themes or free-form LLM mission selection are needed.
Current scripted voice adapter prevents automatic barge-in; explicit stop/pause
still forces interruption. Do not change provider or credential configuration.

The routine-game canvas renderer now retains and renders the contract, while legacy
spaceship modes remain intact. Use HUD_VIDEO_PROFILE=routine-game explicitly for
native 540×960 portrait at 15 FPS. The .env.local landscape selection is unchanged.
No rotation/cropping/scaling is applied to the source. iPhone orientation and
FaceTime sizing remain unverified until a real-device call; portrait alone is not
a downstream fix. Existing profiles remain available for controlled fallback.

```bash
npm run test:hud:routine
npm run demo:hud:routine
npm run bench:routine
```

Open .local/routine-game-preview/index.html locally. It displays actual rendered
frames at phone size. routine-walkthrough.gif covers retry/uncertainty and a missed
step; all-done-walkthrough.gif shows three verified mock steps. Both are labeled
scripted mock. See FINAL-SPRINT-STATUS.md for current artifacts and remaining gates.

## Live run, only after explicit approval and free allowance confirmation

1. Have an adult/operator present. Put toothbrush, backpack and shoes in good light;
   use the image's left/right and a side view that shows physical support.
2. Confirm the current account has available free Groq and LiveKit allowance; do not
   enable billing. A successful routine needs at least 20 Groq requests; retries or
   repeated negative checks consume more. SDK retries remain disabled, but the live
   runtime will check NEW frames on subsequent rounds. Stop if rate-limited or slow.
3. Stop an old connector with Ctrl+C and wait for dev_stopped. Stop an old agent and
   bridge gracefully. Do not run duplicate agents/bridges or force another team off
   the shared line. Chert connectivity was previously intermittent; re-check now.
4. Terminal A: start the approved existing Groq bridge, key entered privately:

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider groq --allow-provider-calls
```

5. Terminal B: start the morning routine (voice and HUD configuration unchanged):

```bash
HUD_VIDEO_PROFILE=routine-game ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq VISION_SERVICE_URL=http://127.0.0.1:8765 npm start
```

6. Terminal C: connector, then WAIT for agent_warm before calling:

```bash
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 5 --json
```

7. Place a FaceTime video call to the configured receiving line. ORBIT greets only on
   bridge_ready. Confirm audible complete greeting and correct video. Check
   camera_delivery, published source dimensions, and the intended HUD profile in logs.
8. Show all 3 objects until two inventories agree. Mission 1 is Show me your toothbrush.
   Hold it up; one accepted round is confirmation-in-progress, NOT success.
9. After verified, mission 2 is Shoes on the backpack. Remove supporting hands and
   hold still. A clear air gap despite horizontal overlap must not pass. Conservative
   contact geometry may reject top-down or angled views; reposition rather than relax it.
10. After verified, mission 3 is Backpack left of shoes (saved camera image coordinates).
    Separate the props side by side; overlapping/stacked objects should be rejected.
11. Say pause; countdown freezes. Help may replay instructions but must not clear a
    manual or camera pause. Say resume; narration must finish before counting resumes.
12. Verify each spoken instruction matches missionName/currentStep; UI pending,
    retry/uncertain and success should match deterministic events. A missed step
    remains missed. Final count is done out of 3, not a blanket success.
13. Hang up. Check .local/routine-reports/<job-id>/report.json for statuses, active
    seconds and accepted positive-frame photos. Keep private reports/photos out of Git.
14. Stop connector (wait dev_stopped), agent and bridge; unset GROQ_API_KEY in A.
    Test a second call only if separately planned/approved to check cleanup/reconnection.

## Latency/error boundaries

SDK=7s, Python outer deadline=8s, Node HTTP=9.5s; evidence age <6s at application.
No limits were widened. encodeMs, captureAgeMs, latencyMs are numeric diagnostics.
A 25-second response cannot be accepted. Late responses after a deadline, revision
change, pause/camera change, or cleanup cannot advance the engine. Unknown or
uncertain evidence does not incur fake-done penalties. The active countdown can
still expire naturally during a slow check. Diagnose before repeatedly spending
free requests. If narration fails, keep the timer paused and fix/retry narration;
do not silently proceed with a mission the child has not heard.

## Honest fallback if real perception or Chert is unavailable

Provider-free, Chert-free fallback (recommended):

```bash
npm run demo:routine:ui
npm run demo:hud:routine
npm run demo:routine
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run demo:routine:sequence
```

Open .local/routine-game-preview/index.html or all-done-walkthrough.gif;
show the mock HTTP sequence's 3 done steps and report. State clearly that images,
verification and speech are mocked/scripted; no real-world verification occurred.
The UI replay intentionally includes a missed step and an honest 2-of-3 completion.

If FaceTime and voice are working but Groq is not, a separately approved mock call
can use the existing compatible mock desk routine. It is NOT morning recognition:

```bash
# A
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider mock
# B
HUD_VIDEO_PROFILE=routine-game ENABLE_GAME=yes ROUTINE_FILE=examples/routines/mock-desk.json VISION_MODE=mock VISION_SERVICE_URL=http://127.0.0.1:8765 npm start
# C, only when ready and approved
chert dev --env-file .env.local --minutes 3 --json
```

This uses bottle/notebook/pen scripted verdicts, explicitly labeled Mock vision.
LiveKit voice/FaceTime still use their allowances. Do not run morning.json against
the desk mock and claim it recognized toothbrush/backpack/shoes. No provider-free
fallback can prove live vision or iPhone media behavior.

## Final all-state backup and non-starting preflight

Generate a fresh judge package without replacing the earlier preview:

```bash
. "$HOME/.nvm/nvm.sh"
nvm use 24
node final-demo-assets.mjs --out .local/final-demo/qa-next
```

The generator refuses to overwrite an existing output directory. Open
`.local/final-demo/qa-timed/index.html` or use the contact sheet and partial/full
GIFs. Each GIF has per-frame timing, and the checking animation runs for two
seconds. The page labels the run **OFFLINE MOCK**. It uses actual
routine-engine transitions with scripted perception, not caller footage,
FaceTime, or a provider result.

Before starting any bridge, run the preflight. It validates the routine, the
selected HUD profile and RGBA dimensions, Node/Python dependencies, and whether
the local bridge port is free. It never starts a service or calls a provider:

```bash
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json \
HUD_VIDEO_PROFILE=routine-game VISION_MODE=groq \
VISION_SERVICE_URL=http://127.0.0.1:8765 \
VISION_PYTHON=/tmp/reality-vision-venv/bin/python \
npm run preflight:demo -- --routine=examples/routines/morning.json --profile=routine-game
```

When the bridge is already running, add `--check-bridge` and run the script
directly with `--env-file=.env.local --live`; this performs only a loopback
`GET /health`. Credential checks report presence booleans only and do not test
credential validity. See [MORNING-DEMO-HANDOFF.md](MORNING-DEMO-HANDOFF.md) for
the exact current results, controlled-image plan, and live-test gates.
