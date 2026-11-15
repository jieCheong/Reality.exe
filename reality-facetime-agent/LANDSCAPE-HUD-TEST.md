# Optional native landscape HUD experiment

`HUD_VIDEO_PROFILE=landscape-test` selects 640×360 at 15 FPS. It reflows the actual
adapted Reality.exe HUD: objective panel, progress, checkpoints and phase/voice
indicator. Orbitron and the existing palette remain. This draws native canvas
primitives/text; there is no portrait bitmap stretch, crop, rotation or black
padding. Long objective text wraps to two lines with ellipsis; the full game
state is retained and mission narration is unchanged.

The existing VideoSource → RGBA VideoFrame → agent-video camera publication
pipeline is unchanged. Width/height come from the selected profile throughout;
landscape buffers contain 640*360*4 = 921,600 bytes. Rotation remains zero.
`hud.setState()` and dynamic phase/objective/progress/checkpoint updates work as
before. No voice, Groq, mission engine, caller capture or connection logic changed.

Default remains `default` (540×960); `juan-original` remains 540×1170. The original
Juan source is untouched. Selection is process-local at startup, so both agent
and connector must restart between profiles. .env.local was not edited.

## Offline preview and checks

```bash
cd /mnt/c/Users/cheon/OneDrive/Desktop/Hackathon/HackUTA/Reality.exe/reality-facetime-agent
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
HUD_VIDEO_PROFILE=landscape-test npm run demo:hud
npm run check
npm run check:types
npm test
```

Open `.local/hud-landscape-preview/mission-sequence.gif` or its four phase PNGs.
The preview calls the exact live drawHud path and requires no keys or requests.
Existing portrait preview paths are preserved and not overwritten.

Offline tests cover explicit profile selection, native 640×360 source/frame,
RGBA byte size, opaque full-frame content, safe element bounds, objective wrap,
independent objective/progress/checkpoint changes, animation, phase transitions,
single-camera publication and shutdown. No remote landscape or FaceTime display
result is claimed. A landscape source may still be letterboxed on an upright
phone; the purpose is to compare the downstream handling, not promise screen fill.

## Controlled FaceTime A/B — run only after approval

Check the existing Chert and voice accounts' free balances first. These commands
will allow ordinary approved voice synthesis/recognition and use Chert minutes
when called. They do not enable Groq/gameplay. Keep the SAME phone, line, tile
layout, project and CLI for both calls. Compare both in the same phone orientation,
then optionally repeat the observation with both in landscape. Do not compare one
profile upright against the other sideways and attribute the difference to code.

A: hang up old calls; Ctrl+C connector and wait for dev_stopped; Ctrl+C agent.
In WSL terminal A, prepared as above:

```bash
HUD_VIDEO_PROFILE=default HUD_VIDEO_DIAGNOSTIC=no ENABLE_GAME=no GAME_TEST_MODE=no TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Terminal B, same directory and nvm setup:

```bash
chert dev --env-file .env.local --minutes 3 --json
```

Wait for agent_warm. FaceTime Video the existing +1 702-510-9706 line. Check
`[hud-source-geometry]` and `[hud-video-format]` for 540×960 and full-frame
content. Take a screenshot of the remote main tile, note displayed bounds and
text readability, then hang up within 20–30 seconds.

B: stop connector then agent gracefully again. In terminal A change ONLY profile:

```bash
HUD_VIDEO_PROFILE=landscape-test HUD_VIDEO_DIAGNOSTIC=no ENABLE_GAME=no GAME_TEST_MODE=no TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Run the identical connector command in terminal B. Wait for agent_warm, then
place the second short call. Expect the real horizontal HUD, not a squashed
portrait image. Verify 640×360 source/publication sizes, 921,600 RGBA bytes,
rotation zero, and visible objective/progress/all four checkpoints. Compare
screenshots at the SAME orientation; check whether surrounding black area
shrinks and whether text is useful. Report the observation, not a guaranteed fix.

Hang up and stop connector then agent. Omit HUD_VIDEO_PROFILE or use default to
restore 540×960. To compare with Juan's taller profile instead, use
`HUD_VIDEO_PROFILE=juan-original` in A; all other commands stay identical.
No --force, --takeover, dependency upgrade, room migration or billing change.

## Files changed for this experiment

- `hud-video-profile.mjs`: opt-in landscape-test geometry.
- `spaceship-landscape.mjs` (new): independent native landscape layout/drawing.
- `spaceship-face.mjs`: routes only landscape-test to that layout; portrait path retained.
- `hud-demo.mjs`: separate landscape preview directory.
- `hud-diagnostic.mjs`: labels adapt to the optional landscape geometry.
- `hud-video.mjs`: profile-neutral source-size error wording; publication unchanged.
- `video-room-smoke.mjs`: optional transport check accepts selected orientation.
- `landscape-hud.test.mjs` (new): isolated native render/publication regression.
- `package.json`: register syntax check and new test.
- `.env.example`: documents three supported profiles; default unchanged.
- `LANDSCAPE-HUD-TEST.md` (new): preview and controlled A/B instructions.
