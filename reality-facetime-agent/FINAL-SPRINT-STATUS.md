# Final gameplay sprint: Tasks 1, 3, 4

Work is on Jie. Existing uncommitted integration/reliability work is preserved.
No upstream branch, credentials, voice provider, geometry policy, timeout or
freshness window was modified. No provider request, Chert connector or FaceTime
call was started. No commit/merge/push was made.

## Completion and remaining gates

- Task 1: COMPLETE OFFLINE. The default start profile is now Juan's 540×1170 HUD;
  the routine-game alternative remains an opt-in 540×960 RGBA profile,
  2073600 bytes, 15 FPS, rotation 0, same LiveKit camera publication pipeline.
  Portrait source frames are upright/readable; landscape-test and both old portrait
  profiles remain available. iPhone rotation, downstream scaling and actual control
  overlap are NOT verified. The private .env.local is unchanged; npm start defaults
  to Juan unless an explicit profile is supplied. No CSS rotation, crop or bitmap stretching.
- Task 3: COMPLETE OFFLINE. Normalization retains the routine contract. Juan's native
  art and SPACE styling now render every routine screen by default; the alternative
  dedicated game renderer displays a friendly ORBIT, actual mission titles, current/total
  steps, countdown, gentle pending/retry/uncertain states, success/missed cues and
  honest completion counts. Legacy spaceship rendering is retained for non-routine
  mode. Short outcome toasts and eased resolved-progress do not block the engine.
  Explicit mock provenance stays visible. Font assets were copied with license
  from Juan's existing branch; that branch was not edited.
- Task 4: OFFLINE VALIDATION COMPLETE; REAL GROQ PENDING. Mock HTTP sequence finishes
  all three steps and saves accepted evidence. Delayed, cancelled, stale and
  mismatched responses remain rejected. The selected model remains qwen/qwen3.8-27b,
  SDK max_retries=0/timeout 7s, bridge outer deadline 8s, Node HTTP 9.5s, post-response
  evidence age <6s. No real recognition of toothbrush/backpack/shoes is claimed.

## Validation

250 passing automated checks: 150 Node, 96 Python, and four mock HTTP E2Es.
The current Node suite includes profile-specific all-screen rendering coverage.
Syntax, TypeScript and provenance pass. Both default and landscape native video
publishers are exercised locally without a room/provider, preserving one camera
track, matching frame/source dimensions and rotation 0. The three-step morning
readiness check passes when explicit routine/process overrides are supplied.

CPU measurements are saved in .local/routine-game-preview/performance.json.
Representative run: frame render median 5.13 ms/p95 7.90 ms, inventory engine apply
median <0.01 ms/p95 0.02 ms, JPEG encode median 6.46 ms/p95 11.48 ms. Rendering budget
is 66.67 ms at 15 FPS. This measures local allocation/readback/render and synthetic
JPEG CPU time, NOT pure Groq inference, network latency, LiveKit codec cost, or
phone latency. The historical Groq cache's ~25.4s median single-image judgment is
still incompatible with the protected live path; do not widen windows to hide it.
Exact current model/network/queue latency needs an approved bounded request.

## Actual preview artifacts

```bash
npm run test:hud:routine
npm run demo:hud:routine
npm run bench:routine
```

.local/routine-game-preview/ contains:
- index.html — local phone-sized player; no server/network required.
- 01-welcome.png through 13-complete.png — 13 actual rendered engine snapshots.
- phone-*.png — 360×640 versions inspected for readability.
- contact-sheet.png — overview of every state.
- routine-walkthrough.gif — retry/uncertainty, missed step, honest 2-of-3 ending.
- all-done-walkthrough.gif — SEPARATE mocked run, all three verified steps, 3-of-3.
- complete-all-done.png — happy-path completion screenshot.
- orbit-checking-15fps.gif — two seconds of native mascot/verification animation.
- manifest.json, all-done-states.json — state/text/layout evidence, explicitly mock.
- performance.json — local CPU results.

The current Juan-default routine HUD was also rendered across 13 actual
simulated states in `.local/final-demo/juan-original-CWSPpS/`; its contact sheet
and interactive preview use the 540×1170 Juan design.

Both walkthroughs use actual unchanged engine/runtime states with fake verification
and scripted speech events. The missed mission is never relabeled as done; these
are separate runs. No real caller photos are embedded. Essential portrait content
is inside x=24..516 and y=96..820, leaving reserved top/bottom margins. These are
local design/test bounds, not measured FaceTime safe areas.

## Real recognition readiness and photo checklist

The private GROQ_API_KEY is configured; key/account ownership and CURRENT free
allowance still need operator confirmation. No key was printed or changed.
No suitable morning photo manifest was found in the checked project/known sample
locations. The existing coffee.jpg is valid (800×583) but is only an inventory
connectivity smoke, NOT a morning mission image. No fake real manifest was created.

For a full controlled morning sequence: 4 distinct scan photos (two groups of two,
all toothbrush/backpack/shoes visible), 6 toothbrush-held photos, 6 shoes-supported-
by-backpack side-view photos, and 6 backpack-image-left-of-shoes photos. Use new,
independent exposures, good light and no duplicate/cropped/edited substitutes.
Optional separate negative sets: toothbrush on desk; shoes held above backpack
with a clear air gap despite horizontal overlap; backpack on image-right of shoes.
Our contact guard can conservatively reject top-down projected containment.

Minimum requests: one-image inventory smoke = 1; one three-frame verify round = 3;
scan plus one fully verified mission = 8; full three-step routine = 20. A live loop
can make additional requests on new frames. Confirm allowance and maximum count
before a provider test. The controlled runner stops if expected progression fails.

FIRST real request, ONLY after explicit approval of the intended account/free
allowance, coffee.jpg upload and maximum ONE request:

```bash
GROQ_MODEL=qwen/qwen3.8-27b /tmp/reality-vision-venv/bin/python vision-service/groq_image_smoke.py "/path/to/coffee.jpg"
```

This prompts privately for the key, disables SDK retries, and reports objects,
normalized boxes, latency or sanitized errors. It has not been executed here.
Full controlled morning photo instructions are in LOCAL-GROQ-GAMEPLAY.md.

## Exact live startup — manual and separately approved

See FINAL-DEMO-RUNBOOK.md for preparation, negative checks, pause/resume, error
recovery and cleanup. Stop older processes gracefully before restarting both the
agent and connector, so the waiting room cannot hold old code.

```bash
# A: ONLY after approval, enter key privately and start the existing real bridge
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider groq --allow-provider-calls

# B: existing agent, explicit native portrait game profile + actual morning routine
HUD_VIDEO_PROFILE=routine-game ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq VISION_SERVICE_URL=http://127.0.0.1:8765 npm start

# C: check shared line, connect normally, then wait for agent_warm
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 5 --json
```

Then an operator places a FaceTime video call to the configured receiving line. Verify
upright readable source, audible complete greeting, scan, each verified mission,
countdown/pause, final count and private report. If the local preview is upright
but phone output is sideways/small, preserve source screenshots and published
geometry and investigate the managed Mac/FaceTime transform. Do not infer a fix
from resolution or CSS alone. Do not force another team off a shared line.

Provider-free fallback: open index.html or all-done-walkthrough.gif and clearly
label the walkthrough MOCK. npm run demo:routine:sequence also demonstrates the
actual local HTTP/JPEG pipeline with scripted desk objects. No fallback proves
live vision. Any mock FaceTime call still needs voice/Chert allowance and approval.

## Exact files changed by this sprint

Modified (previous changes preserved):
agent.mjs, spaceship-face.mjs, hud-video.mjs, hud-video-profile.mjs,
game-runtime.mjs (display provenance only), routine-contracts.ts,
routine-ui-demo.mjs (prestart snapshot and optional all-done mock path), package.json,
JUAN-ROUTINE-HUD-HANDOFF.md, FINAL-DEMO-RUNBOOK.md, ROUTINE-MODE.md.

New:
routine-hud-state.mjs, routine-game-hud.mjs, routine-game-hud.test.mjs,
routine-hud-preview.mjs, routine-local-benchmark.mjs, FINAL-SPRINT-STATUS.md,
assets/IBMPlexSansCondensed-Regular.ttf, assets/IBMPlexSansCondensed-SemiBold.ttf,
assets/OFL-IBM-Plex-Sans-Condensed.txt, assets/ROUTINE-FONTS.md.

Generated previews/reports are ignored under .local/. Existing node_modules,
debug.log and unrelated/untracked files remain untouched. Perception files were
already modified by the earlier selective integration; this sprint does not edit them.

## Final sprint revalidation — 2026-11-15

- 150 Node tests, 96 Python tests, and all four mock HTTP E2E cases pass.
- `npm run check`, `npm run check:types`, and `vision-service/verify_provenance.py`
  pass.
- The new non-starting preflight validates Linux Node 24, the three-step morning
  JSON, `routine-game` 540×960 RGBA output at 15 FPS, dependency presence, and
  secret presence without serializing values.
- A health-only loopback check passed for the already-running Groq bridge on
  port 8765. No Groq request was made and the process was left untouched.
- Fresh 16-state screenshots, phone-size PNGs, a contact sheet, partial/full
  walkthrough GIFs, an interactive HTML fallback, and a sanitized simulated
  completion report are under `.local/final-demo/qa-timed/`. The GIFs were
  decoded to verify their 540×960 frame geometry and per-frame delays; the
  checking animation is 30 frames/2 seconds. Earlier preview directories were
  not overwritten.
- The existing demo is ready as an offline fallback. Groq recognition, Chert
  receiving-line availability, live FaceTime media, and real iPhone orientation
  remain unverified; the previously reported `line_offline` issue remains a
  receiving-Mac/line-owner gate.
