# Juan HUD integration into Part A

Juan source: [agent/face.mjs on Juan](https://github.com/jieCheong/Reality.exe/blob/0e1b95ff698256ec832edbfef4bf316680ee1fe3/agent/face.mjs).
The source matches Downloads/Reality.exe-Juan.zip. No Juan file or branch was edited.
Orbitron.ttf and OFL-Orbitron.txt were copied unchanged from his assets folder.

## Adaptation

spaceship-face.mjs exports drawFace(tick, speaking, gameState?). The optional
third argument supplies display data; two-argument calls still work.
The design retains Juan's Orbitron font, palette, gridded background, raised
panels, voice indicator, checkpoint rail and active/completed status treatment.
His original 540×1170 layout is adapted natively to a 540×960 portrait RGBA,
15 FPS contract. No extra video track, participant or media conversion is added.

hud-video.mjs still owns the same VideoSource, agent-video camera track, timer,
publish/unpublish and close operations. Only its renderer and state snapshot
acceptance changed. The legacy reactor offline/online input maps to SCAN/POWER
when no explicit gameState is provided. An explicit gameState takes precedence.
Voice-driven setState({speaking: ...}) calls retain the latest game snapshot.

agent.mjs, voice-stack.mjs, call-observer.mjs, caller-video.mjs, frame-sampler.mjs,
Chert connection/lifecycle code and .env.local were not edited for this change.
The original Part A face.mjs is retained as an unused legacy landscape renderer;
the live HUD defines its own portrait dimensions in spaceship-face.mjs.
Only @napi-rs/canvas@1.1.1 (Juan's exact pinned version) and its native bindings
were added. Existing LiveKit and other dependency versions were not upgraded.
Font registration is local and fails clearly if its bundled font is absent;
no browser, font CDN, cloud inference or provider credentials are required.

## Connect the final Part C game updates

Inside the existing agent entry function, `hud` is the handle already returned
by `await publishHud(ctx.room.localParticipant, ...)`. Forward game snapshots:

```js
hud.setState({
  gameState: {
    phase: 'SECURITY',
    objective: 'HOLD THE ACCESS KEY UP TO THE CAMERA',
    checkpoints: {
      SCAN: 'complete', POWER: 'complete', SECURITY: 'active', PORTAL: 'pending',
    },
    missionProgress: 0.65,
  },
});
```

Use a GameHudState from part-a-types.ts. Each gameState is a replacement display
snapshot, not a partial merge with the previous game's snapshot. Omitted fields
get phase defaults; checkpoints may be omitted or partially specified. Progress
is a finite fraction clamped to 0..1. States validate and are copied before use,
so changes to the caller's object do not alter an in-flight frame. Objective
text wraps to two lines, then truncates with an ellipsis inside its panel.

The final game engine owns when these updates happen. This renderer does not
verify missions, run Gemini or advance phase based on speech/camera input. Keep
voice's existing speaking state updates. Unsubscribe any future game-state event
listener in the job's existing shutdown callbacks.

## Mock preview

```bash
nvm use
npm run demo:hud
```

This writes a four-frame animated GIF and four PNGs in the ignored
.local/hud-juan-preview/ folder: SCAN → POWER → SECURITY → PORTAL. It reads no env
file and makes no network/room/inference/FaceTime request.

hud-mock.mjs exports MOCK_HUD_SEQUENCE and optional playHudMock(hud, intervalMs).
The helper returns a stop function; register it in the existing shutdown callback
if explicitly enabling a live mock later. It is NOT automatically enabled in the
real agent, so it cannot overwrite actual game-state updates.

## Verification

- npm run check: PASS.
- npm run check:types: PASS, including a typed Part C state-update example.
- npm test: PASS, all 12 existing Part A tests plus 4 new HUD tests.
- npm run test:hud: isolated local video test; included in npm test.
- npm run demo:hud: PASS, valid four-page 540×960 GIF and four PNGs generated.

The isolated test exercises actual native VideoSource.captureFrame and RGBA
VideoFrame handling behind a fake room-publication boundary. It verifies exactly
one agent-video camera track, phase transitions, objective/checkpoint/progress
changes, speaking animation, snapshot copying, font registration and cleanup.
It makes no network request and does not claim LiveKit-room or FaceTime delivery
of this new renderer. Visual preview was inspected locally. No paid API requests,
new calls, Git commits or pushes were made.

When ready for a real test, stop/restart both the existing agent and Chert
connector after ending any active call; warm rooms can retain the old renderer.


## Portrait transport correction

The former landscape dependencies were face.mjs (640×360 constants),
spaceship-face.mjs (inherited constants plus landscape panel coordinates),
spaceship-hud.test.mjs (dimension assertions), and video.test.mjs (legacy import).
The source and VideoFrame already used imported constants; they now both receive
540×960. face.mjs remains untouched and is no longer imported by the live HUD.
The smoke test's stripe sample now uses STATUS_STRIPE_Y rather than row 52.

Panels are reflowed vertically, not scaled or rotated from landscape. Orbitron,
palette, objective, speaking animation, checkpoints and progress are retained.
The buffer is 540 * 960 * 4 = 2,073,600 bytes. captureFrame explicitly submits
VIDEO_ROTATION_0; LocalVideoTrack is created from that same portrait VideoSource
and published as the existing single camera track, agent-video. The SDK derives
track dimensions from that source; there are no separate landscape publish options.
The default capture timer stays 15 FPS. hud-demo.mjs calls the exact live drawHud
path and writes portrait PNG/GIF previews in .local/hud-juan-preview/.

Offline tests verify native source/frame dimensions, rotation, RGBA size, safe
panel bounds, text wrapping/ellipsis and dynamic state publication. No remote
publication metadata, Chert forwarding, FaceTime fit or cropping is claimed from
an offline test. The optional test:video:room script now checks actual remote
publication portrait metadata, received frame dimensions and zero rotation;
it was NOT run for this change. It requires a separate approved cloud transport
run, even though it uses no inference and no FaceTime calls.

FaceTime's display container and the Chert Mac bridge may still apply scaling,
cropping or letterboxing. A 9:16 stream does not guarantee edge-to-edge display
on every iPhone aspect ratio or FaceTime layout. After a separately approved
restart of both agent and connector, test a fresh FaceTime Video call with the
phone upright. Compare the local preview, remote track dimensions/rotation and
the phone image. If remote video is portrait but the phone still shows a strip,
inspect the bridge/display layout rather than stretching pixels or reorienting
caller input. No voice, capture, mission, Groq or ElevenLabs settings were changed.

Follow-up scaling evidence and the opt-in corner-marker diagnostic are in
[VIDEO-SCALING-DIAGNOSIS.md](VIDEO-SCALING-DIAGNOSIS.md). The Cloud-only transport
comparison now confirms portrait remote metadata/decoded frames; Mac forwarding
and iPhone display fitting remain unverified.

Juan's archived renderer/publisher comparison and the optional 540×1170 geometry
profile are documented in [JUAN-VIDEO-AB.md](JUAN-VIDEO-AB.md). The default remains
540×960 and teammates' original files remain untouched.
