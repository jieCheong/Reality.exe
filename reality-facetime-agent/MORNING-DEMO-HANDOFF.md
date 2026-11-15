# Reality.exe — morning demo handoff

**Run date:** 2026-11-15  
**Repository:** `Reality.exe/reality-facetime-agent`  
**Branch at start:** `Jie`, HEAD `4de1ddf`  
**Commit/push:** none

## Executive summary

The offline mission, vision bridge, routine HUD, and backup demo are validated.
The existing reliability fixes were present in the Jie worktree and passed their
regression tests; this sprint did not rewrite the functioning pipeline. I added a
presence-only, non-starting local preflight and generated a separate 16-state
judge demo under `.local/final-demo/qa-timed/`. A final artifact audit found
that Sharp requires an explicit delay per GIF frame; the final walkthroughs now
have verified per-frame timing and preserve the original preview package.

No Chert, LiveKit room, FaceTime call, Groq recognition request, or other paid
provider request was started by this sprint. A Groq bridge process was already
listening locally on `127.0.0.1:8765`; I left it untouched and used only its
read-only `/health` endpoint.

## Readiness labels

- **VERIFIED OFFLINE** — 150 Node tests, 96 Python tests, four mock HTTP E2E
  cases, syntax checks, TypeScript checks, and vision provenance verification
  pass. The local demo renders actual engine snapshots and reports simulated
  results honestly.
- **READY FOR LIVE TEST** — the routine configuration, runtime dependencies,
  portrait frame geometry, credential *presence*, and the already-running local
  bridge health passed preflight. This does not authorize or prove a provider
  request or call.
- **NOT YET VERIFIED** — real Groq accuracy/latency, real FaceTime audio/video,
  a complete live routine, and iPhone orientation/cropping/control overlap.
- **BLOCKED** — the previously reported Chert `line_offline` receiving-line
  issue is not resolved by local WSL code. The receiving Mac/line owner must
  confirm the Mac is online and the worker is accepting calls before a call test.

## Worktree preservation and exact sprint changes

The worktree already contained numerous user changes before this sprint,
including edits to the runtime, routine engine, HUD/video, and vendored vision
files, plus untracked teammate HUD files. I did not reset, discard, stage, or
overwrite those changes. The pre-existing `.local/frames` JPEG artifacts were
not opened, copied, uploaded, or modified.

Files added by this sprint:

- `demo-preflight.mjs`
- `demo-preflight.test.mjs`
- `final-demo-assets.mjs`
- `final-demo-assets.test.mjs`
- `HACKUTA-JUDGE-NARRATION.md`
- `MORNING-DEMO-HANDOFF.md`

Pre-existing files extended by this sprint:

- `package.json` — registered the preflight/demo commands and preflight/GIF
  regression tests.
- `routine-ui-demo.mjs` — returns the actual engine-generated report to the
  offline asset generator.
- `routine-hud-preview.mjs` — sets a delay for every frame in each walkthrough.
- `FINAL-DEMO-RUNBOOK.md` — added the non-starting preflight and new backup path.
- `FINAL-SPRINT-STATUS.md` — added current validation and readiness status.

Generated files are ignored under `.local/final-demo/`; source photos and
credentials were not added to the repository.

## Final validation

| Check | Result | What it exercised |
|---|---:|---|
| `npm test` | **150 passed, 0 failed** | Node unit/regression suites, native canvas rendering, local publisher geometry, engine/runtime logic, preflight, GIF timing, Juan-profile all-screen rendering |
| Python vision suite | **96 passed, 0 failed** | Local schemas, service, mock/perception tests, geometry and provenance fixtures |
| Game HTTP E2E | **1 passed** | Synthetic frames → JPEG → actual local Python mock bridge → SCAN/POWER/SECURITY/PORTAL → HUD/scripted speech |
| Routine HTTP E2E | **1 passed** | On-disk `mock-desk.json` → actual local Python mock bridge → three engine steps and local mock report |
| Controlled sequence E2E | **2 passed** | Mock HTTP success and 6.2-second delayed stale-response rejection |
| Syntax / TypeScript | **passed** | `npm run check`, `npm run check:types` |
| Vision provenance | **passed** | `vision-service/verify_provenance.py` |
| Demo preflight | **passed** | Node 24/Linux, routine JSON, 540×960/15 FPS RGBA output, dependencies, presence-only config, local bridge health |

The HTTP E2Es use synthetic or scripted frames and mock perception. Python tests
exercise the actual local parsing/validation/geometry code, but not a live model.
Node publisher tests use the installed LiveKit native source locally with a fake
participant; they do not connect to a room. No test establishes real-world
recognition or FaceTime media behavior.

The first test attempt picked Windows Node from PATH and failed dependency
resolution. Using the installed nvm Linux Node `v24.22.3` fixed the environment;
the full suites then passed. Mock HTTP E2Es require
`VISION_PYTHON=/tmp/reality-vision-venv/bin/python`; with it set, all four cases
passed. No dependency manifest or environment file was changed.

## Backup demo and HUD previews

The live startup profile now defaults to Juan's original visual design for routine
screens. Its separate 13-state preview is at
`.local/final-demo/juan-original-CWSPpS/index.html`; it is simulated and offline.

Open [`.local/final-demo/qa-timed/index.html`](.local/final-demo/qa-timed/index.html)
locally. To generate another package without replacing existing assets, run
`node final-demo-assets.mjs --out .local/final-demo/qa-next`; the generator
refuses to overwrite an existing output directory.

The fresh QA package includes:

- 16 actual 540×960 renderer frames and matching 360×640 phone-size renders:
  welcome, scanning, listening, speaking, missions 1–3, verifying,
  confirmation, success, retry, uncertain, pause, timeout, partial completion,
  and full completion.
- `contact-sheet.png`, `partial-walkthrough.gif`, `full-walkthrough.gif`,
  `checking-15fps.gif`, and an interactive HTML fallback.
- All GIFs were decoded and checked for 540×960 frames and nonzero per-frame
  delays; the 30-frame checking animation is exactly 2 seconds.
- `mock-completion-report.json`, derived from the engine’s separate simulated
  3-of-3 run and stripped of synthetic evidence-image payloads.

Useful direct previews: [contact sheet](.local/final-demo/qa-timed/contact-sheet.png),
[partial walkthrough](.local/final-demo/qa-timed/partial-walkthrough.gif), and
[full walkthrough](.local/final-demo/qa-timed/full-walkthrough.gif).

The HTML was served only on a temporary loopback static server for browser QA;
the page and full-completion state were checked, then that server was stopped.
The screenshots show the expected portrait layout at local phone size. This is
not a measurement of FaceTime safe areas or proof of iPhone orientation.
The older `npm run demo:routine` target was not rerun because it writes into the
pre-existing `.local/routine-preview/`. The fresh package was generated with
`node final-demo-assets.mjs --out .local/final-demo/qa-timed` without
overwriting those files.

## Preflight and offline commands

From the agent folder, activate the Linux runtime:

```bash
. "$HOME/.nvm/nvm.sh"
nvm use 24
```

Before starting the bridge, verify that its intended port is free:

```bash
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json \
HUD_VIDEO_PROFILE=routine-game VISION_MODE=groq \
VISION_SERVICE_URL=http://127.0.0.1:8765 \
VISION_PYTHON=/tmp/reality-vision-venv/bin/python \
npm run preflight:demo -- --routine=examples/routines/morning.json --profile=routine-game
```

If a bridge is already running, use the health-only mode instead. This sends
only `GET http://127.0.0.1:8765/health`; it does not submit images or call Groq:

```bash
ENABLE_GAME=yes ROUTINE_FILE=examples/routines/morning.json \
HUD_VIDEO_PROFILE=routine-game VISION_MODE=groq \
VISION_SERVICE_URL=http://127.0.0.1:8765 \
VISION_PYTHON=/tmp/reality-vision-venv/bin/python \
node --env-file=.env.local demo-preflight.mjs \
  --routine=examples/routines/morning.json --profile=routine-game --live --check-bridge
```

The live preflight reports only whether credentials are present in the current
process. It does not validate them with a provider. The Groq key belongs in the
bridge process, not in this report.

## Real Groq test preparation — not executed

The existing smoke runner uses `GroqOnlyVision`, `InventoryResult` schema
validation, model `qwen/qwen3.8-27b`, SDK `max_retries=0`, a seven-second SDK
timeout, JSON response mode, and a single inventory request. It prompts for the
API key with hidden terminal input and prints object names, normalized boxes,
latency, or sanitized errors. The model request accepts up to three images, but
the one-image smoke sends exactly one.

The earlier coffee image remains present at the path below; it was not opened or
uploaded in this sprint. It is suitable only as an inventory/connectivity smoke,
not as evidence for any of the three morning actions.

**Only after explicit approval**, run:

```bash
GROQ_MODEL=qwen/qwen3.8-27b \
/tmp/reality-vision-venv/bin/python vision-service/groq_image_smoke.py \
"/path/to/coffee.jpg"
```

The runner prompts privately for the key. It has not been run here. Check current
account allowance and model rate limits directly before approval; this handoff
does not assume current pricing or remaining quota.

No suitable controlled morning-image manifest or source photos were found in
the project outside local artifacts. Needed independent positive photos:

1. Four scan images showing toothbrush, backpack, and shoes together (two
   independent inventory rounds).
2. Six toothbrush-held images (two three-frame rounds).
3. Six side-view shoes-supported-by-backpack images (two three-frame rounds).
4. Six backpack-left-of-shoes images in camera-image coordinates (two
   three-frame rounds).

That is 22 positive images for the minimum complete scripted sequence. Also
prepare distinct negative examples: toothbrush resting on a surface; shoes held
above the backpack with a visible gap; backpack to the image-right of shoes.
Blur, occlusion, low light, duplicate images, and stale-frame cases must remain
uncertain/rejected rather than be used to claim success. Current automated
negative, timeout, duplicate, malformed, and stale cases are mocks, not real
photo evaluations.

Dry-run a controlled manifest before any real requests:

```bash
npm run demo:routine:sequence -- --provider groq \
  --manifest .local/morning-sequence/manifest.json --dry-run
```

After separate explicit approval, the real complete sequence requires at least
20 provider requests (two inventories plus two rounds × three frames for each
of three missions):

```bash
npm run demo:routine:sequence -- --provider groq \
  --manifest .local/morning-sequence/manifest.json --allow-provider-calls
```

Do not run the real command until the controlled photos, account allowance,
adult consent, and bridge/provider approval are confirmed.

## FaceTime launch and iPhone verification — not executed

The bridge on port 8765 was already running as a Groq-capable process at the
start of this sprint. It was not started, restarted, or stopped here. Do not
start a duplicate. Once the existing owner stops it and live use is explicitly
approved, use these separate terminals:

**Terminal A — private key input, then local bridge**

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py \
  --provider groq --allow-provider-calls
```

**Terminal B — agent**

```bash
HUD_VIDEO_PROFILE=routine-game ENABLE_GAME=yes \
ROUTINE_FILE=examples/routines/morning.json VISION_MODE=groq \
VISION_SERVICE_URL=http://127.0.0.1:8765 npm start
```

**Terminal C — only after the receiving line is confirmed online**

```bash
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 5 --json
```

Wait for `agent_warm` before the adult/operator places a FaceTime **video** call
to the existing receiving identity. Do not create a replacement line or displace
another worker.

On the iPhone, verify in order:

1. The source is upright and readable; record published 540×960/rotation 0.
2. Mission title, instruction, countdown, progress, and verification state are
   visible without overlap with the call header, controls, or self-view.
3. Audio is audible and each instruction matches the current engine state.
4. Pause, camera loss/recovery, resume, uncertain evidence, timeout, and final
   count behave honestly.
5. Compare the final local report and accepted evidence to the visible action;
   never treat showing a toothbrush as proof of brushing.

Capture only a consented, adult-supervised test. Stop the call and services
gracefully; keep reports and photos private and out of Git.

## Five highest-priority actions after waking

1. Ask the receiving Mac/line owner to confirm the Chert worker is online and
   accepting calls; resolve `line_offline` there before testing.
2. Confirm adult/guardian presence, consent for any camera image sent to Groq,
   and current free usage/rate-limit allowance.
3. Run the one-image coffee inventory smoke once, only after approving that
   single image/request; review the reported latency and object schema.
4. Capture the 22 independent mission photos plus the negative cases; run the
   manifest dry-run and review its request count before approving live testing.
5. Run one controlled FaceTime test and measure real iPhone orientation, crop,
   controls, audio, provider latency, and saved evidence before calling the
   mission live-demo-ready.

## Honest readiness assessment

The **offline fallback is ready to show**. The project is **not yet ready to
claim a complete live FaceTime/Groq routine**: Chert receiving-line availability,
real perception accuracy/latency, real iPhone presentation, and a supervised
full run remain outstanding. No ADHD diagnosis/treatment claim or invisible
action-verification claim is supported.
