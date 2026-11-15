# Routine coach HUD handoff — Jie → Juan

Sprint update: the user authorized HUD edits on Jie while Juan was unavailable.
Routine normalization/rendering is now implemented in separate routine-hud-state.mjs
and routine-game-hud.mjs modules, dispatched only for mode='routine'. Juan's legacy
spaceship drawing paths remain intact. No original teammate branch was modified.
No FaceTime call was made for this sprint.

## Confirmed pipeline and orientation

The existing .env.local selects HUD_VIDEO_PROFILE=landscape-test, diagnostic off.
It remains unchanged. `npm start` now defaults to juan-original unless the caller
explicitly overrides HUD_VIDEO_PROFILE.
spaceship-face.mjs → drawLandscape() → hud-video.mjs → VideoFrame(RGBA,640,360)
→ VideoSource(640,360).captureFrame(...,VIDEO_ROTATION_0) → SOURCE_CAMERA track
on the same participant as audio → Chert's managed Mac → FaceTime.
The local canvas contains upright text: no CSS, no 90° ctx rotation, no portrait
bitmap stretched into it. Earlier call logs agree on 640×360, rotation 0, full-frame
content and published dimensions. Chert reported video/audio from the agent.

This confirms LANDSCAPE source, not the exact cause of a literal 90° rotation on
an iPhone. The Mac conversion/presentation pipeline and receiver viewport are not
exposed by our publisher or accessible locally. The installed CLI doesn't contain
the managed Mac's capture/scaling implementation. Do not claim fixed landscape
canvas or a supported portrait-forwarding option without Chert evidence.
No screenshot was attached to this request; the reported SHIELDS label is absent
from this adapted renderer. Compare current source preview/publisher identity with
the actual phone before concluding it is the same UI/version.

A 16:9 source fitted by width into a 9:16 viewport would occupy only ~31.6% of its
height before controls; actual FaceTime layout is unknown. Cropping and control
safe areas cannot be measured from local source dimensions. Prior portrait tests
also appeared small downstream, so switching resolution alone is not a proven fix.
Keep the source image native and upright. If a local saved frame is upright but
the phone is sideways, investigate Chert/FaceTime orientation rather than rotating
text blindly. The startup default now selects Juan's design; an explicit
HUD_VIDEO_PROFILE remains available for an operator-controlled A/B test.
Existing profiles: default=540×960, juan-original=540×1170, landscape-test=640×360,
all at 15 FPS; routine-game=540×960 selects the newer portrait renderer. Any chosen native layout, source/frame sizes and rotation metadata
must remain consistent. Do not stretch or crop the portrait artwork to compensate.

## Mapping status — implemented

hud-video.mjs calls spaceship-face.mjs normalizeGameState() at setState AND draw.
Both passes now preserve/copy routine fields via normalizeRoutineHud(). Routine
states use Juan's native artwork and SPACE visual design when
`HUD_VIDEO_PROFILE=juan-original`; the 540×1170 geometry and all routine states
share the Juan renderer. `npm start` selects that profile unless explicitly
overridden; `.env.local` is not edited. Set `HUD_VIDEO_PROFILE=routine-game` to
opt back into the newer HUD.
Legacy non-routine states still use Juan's original spaceship renderer.
timeLeftSeconds, actual three-step statuses, pending,
retry, missed and accurate done counts are now visible. No percentage implies a win.
The opt-in routine-game profile remains 540×960 at 15 FPS.
The first published frame uses a welcome state, and agent.mjs seeds the parent
routine before bridge_ready without starting the timer or speech prematurely.

## Agent → existing hud.setState({gameState}) contract

Source of truth: routine-contracts.ts; implemented by routine-presentation.mjs and
GameRuntime. The adapter reads the unchanged deterministic engine, never advances it.

| Field | Meaning / rendering |
|---|---|
| mode | 'routine' switches to routine-coach view |
| verificationMode | mock/groq provenance; mock stays visibly labeled, never an accuracy claim |
| routineName, theme | Parent-defined context, render as plain text |
| missionName | Current mission card title, exact parent step label |
| missionInstruction | Current authoritative instruction; never provider evidence |
| currentStep, totalSteps | One-based 1–3; null in scan/completion; total=3 |
| stepIndex | Engine index -1 in scan, 0–2 active, 3 complete |
| timeLeftSeconds, budgetSeconds | Countdown and step budget; null in scan/completion |
| paused, pauseReasons | Countdown frozen; fixed reasons camera/manual/narration/voice_failure/not_started/closed |
| narrationStatus | idle / speaking / failed / paused |
| uiState | scanning / mission_starting / in_progress / verification_pending / mission_verified / retry / uncertain / mission_missed / routine_completed / paused |
| verificationStatus | idle / pending / observed / verified / retry / uncertain |
| confirmationRounds, requiredConfirmationRounds | First accepted round is observed, NOT verified; required=2 |
| routineSteps | Exactly 3 label/status entries: pending / active / done / missed |
| completedSteps | Verified done count |
| resolvedSteps | Done plus missed count |
| missionProgress | resolvedSteps/totalSteps; 100% does NOT mean all done |
| routineEvent | {sequence,name,revision,stepIndex}; monotonic per-call ID, stable on countdown-only updates |
| lastOutcome | {stepIndex,label,status:'done'|'missed'} or null; retained across next mission |

No photos, raw model evidence, boxes, frame metadata or caller identifiers belong in
HUD state. Render strings as text; do not insert model/parent content as HTML.

Event names (routineEvent.name):
scan_started, mission_starting, mission_in_progress, verification_pending,
observation_accepted, verification_cancelled, mission_verified, evidence_retry,
evidence_uncertain, mission_missed, routine_completed, routine_paused, narration_failed.

Step outcome events may be immediately followed by next-step state in the same JS
turn. Animate a newly changed lastOutcome.stepIndex/status, or queue event IDs on
setState, rather than waiting for a single transient frame. Do not delay the mission
engine for an animation. Snapshot labels/currentStep always refer to the CURRENT
mission; lastOutcome refers to the previous result after progression.

Suggested presentation: portrait-first, friendly ORBIT mascot, large mission card,
3 named checkpoints, clear countdown, camera scanning/confirmation animation,
gentle retry/uncertain feedback, clear verified/missed and honest final done count.
Use readable blue/purple/teal styling and responsive typography; preserve Juan's
visual design. Keep essential controls/text away from the top call header, bottom
FaceTime controls and self-view overlay, then measure margins on the actual phone.
Do not hardcode guessed receiver safe-area dimensions as verified facts.

## Local contract replay, no FaceTime or provider

```bash
npm run test:routine:ui
npm run demo:routine:ui
```

Read .local/routine-ui-preview/states.json. It contains states, distinct event IDs,
spoken announcement/state pairs and MOCK outcomes done/missed/done for the ACTUAL
morning.json names. It deliberately exercises scan, start, active, pending, first
observation, retry, uncertain, verified, pause, timeout/missed, next step and completion.
The contract replay is JSON; the new `npm run demo:hud:routine` renders those actual
states into PNGs, phone-size PNGs, a local HTML player and GIF walkthroughs. No caller
photos or evidence images are used. See .local/routine-game-preview/index.html.
The new renderer uses reserved top/bottom control margins, but actual FaceTime
cropping/safe areas and iPhone orientation still require a real-device check.

## Juan original design preview

The current Juan-profile renderer was exercised with 13 actual routine snapshots.
Open `.local/final-demo/juan-original-CWSPpS/index.html` or inspect its contact
sheet. These are local mock states at 540×1170 with 360×780 phone previews; no
provider or FaceTime calls were made.
