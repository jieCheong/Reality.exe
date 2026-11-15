# Juan video implementation comparison and controlled A/B

Source inspected read-only: `/mnt/c/Users/cheon/Downloads/Reality.exe-Juan.zip`,
`Reality.exe-Juan/agent/{face.mjs,agent.mjs,chert-rooms.mjs,package.json,package-lock.json,AGENTS.md}`.
No original files were edited or credentials inspected.

| Item | Juan archived implementation | Part A default |
| --- | --- | --- |
| Canvas/source/frame | 540×1170, 9:19.5 | 540×960, 9:16 |
| RGBA bytes | 2,527,200 | 2,073,600 |
| Renderer | Native canvas, Orbitron, static objective/checkpoints | Native canvas, same styling, dynamic objective/checkpoints/progress |
| SDK | Agents 1.8.0, rtc-node 0.13.35 | Same versions |
| Camera source | new VideoSource(WIDTH,HEIGHT) | Same |
| Track | LocalVideoTrack.createVideoTrack('agent-video',source) | Same |
| Frame | new VideoFrame(pixels,WIDTH,HEIGHT,RGBA) | Same |
| Rotation | Omitted; installed SDK defaults to VIDEO_ROTATION_0 | Explicit VIDEO_ROTATION_0 (equivalent) |
| Timestamp | Omitted; SDK defaults to zero | undefined; same default |
| Publication | publishTrack(track,{source:SOURCE_CAMERA}) | Same; no explicit codec, bitrate, simulcast, crop or fit overrides |
| Timing | Initial frame, publish, interval at 15 FPS | Same ordering and default FPS |
| Voice/video participant | Same speaking participant | Same |
| Chert | Archive AGENTS.md says beta.20 | Installed beta.19 |
| Room dispatch | runAgent: own LiveKit when three keys exist; otherwise Chert rooms/token dispatch | Existing own-LiveKit worker |
| Voice | OpenAI Realtime in archived code | Existing LiveKit STT/LLM + configured TTS/fallback |

Juan uses no aspect-fit, crop, scaling canvas, padding, orientation transform or
special video publication strategy in the inspected agent. He renders directly
at the target size. His runAgent uses the same cli.runApp/ServerOptions path as
ours when own-LiveKit keys exist. The archive does not prove which room route,
bridge worker/build, line, device orientation, or FaceTime tile state he used in
the reported successful call. Archive CLI context version is not a runtime trace.
Do not copy his voice provider or change our connection to imitate geometry.

## What can explain the difference?

The confirmed source difference is aspect ratio, not the publication API.
540×1170 matches a 9:19.5 container; 540×960 does not. If a hypothetical 540×1170
viewport simply fits a 540×960 image, the image occupies 960/1170 ≈82.1% of the
height, leaving 210 pixels total vertical space. This alone would not explain a
very small rectangle with large borders on all sides. A fixed landscape fit
canvas could even make a taller source narrower rather than larger. These are
geometric predictions, not knowledge of the managed bridge's implementation.

Likely contributors to test, not established root causes: aspect-ratio-dependent
bridge/FaceTime fitting; different room/bridge paths or builds; receiving tile
layout. No novel publisher setting was found that can be copied as a proven fix.
The prior LiveKit-only transport evidence still rules out padding before that
receiver boundary; Juan's success means broader portrait support should not be
ruled out without this controlled comparison.

## Smallest safe reproduction

`HUD_VIDEO_PROFILE=juan-original` now selects 540×1170 for canvas, RGBA extraction,
VideoFrame, VideoSource and capture validation, keeping the identical publisher
settings. `default` remains 540×960. Invalid profile names fail startup.
The additional vertical space is distributed between existing panels using
native coordinates; glyph sizes, widths and shapes are unchanged. No bitmap
stretching/cropping, letterbox padding or alternate track is added. Background
fills the entire frame. Current dynamic state APIs and every mission rule remain.
This reproduces Juan's source geometry/publication behavior, not his static
pixel-exact composition, room route, voice, or a guaranteed FaceTime result.

A fixed-label `[hud-video-format]` record reports selected geometry, FPS, rotation,
RGBA and publication dimensions when available, without credentials or game text.
The profile has isolated native source/capture tests and dynamic-state tests.
The beta.20 CLI and Chert-room path were not installed or enabled.

Offline preview:

```bash
cd /mnt/c/Users/cheon/OneDrive/Desktop/Hackathon/HackUTA/Reality.exe/reality-facetime-agent
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
HUD_VIDEO_PROFILE=juan-original npm run demo:hud
```

Preview: `.local/hud-juan-original-preview/mission-sequence.gif` and four PNGs.
Normal preview remains `.local/hud-juan-preview/`. Preview generation sends no
requests. The profile is process-local; .env.local was not changed for this test.

## One controlled A/B comparison — two short calls, after approval

Use the SAME iPhone, same orientation, same main remote tile, same line, same
LiveKit project and unchanged CLI throughout. Have Juan compare in person if
possible; confirm whether his reported working run actually used this archive.
Check free balances before the two calls. Each uses voice and Chert allowances.
No calls, provider requests, or connector restarts were made to implement this.

For A, stop connector with Ctrl+C and wait for dev_stopped, then stop agent.
In prepared WSL terminal A, from the folder above:

```bash
HUD_VIDEO_PROFILE=default HUD_VIDEO_DIAGNOSTIC=no ENABLE_GAME=no GAME_TEST_MODE=no TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Terminal B, same directory/nvm setup:

```bash
chert dev --env-file .env.local --minutes 3 --json
```

Wait for agent_warm. FaceTime Video the existing +1 702-510-9706 line, keep phone
upright, confirm actual HUD and 540×960 format record. Screenshot main remote tile,
record displayed bounds/readability, hang up within 20–30 seconds.

Stop both processes gracefully again to remove warm rooms. For B, change ONLY
the video profile in terminal A:

```bash
HUD_VIDEO_PROFILE=juan-original HUD_VIDEO_DIAGNOSTIC=no ENABLE_GAME=no GAME_TEST_MODE=no TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Run the identical connector command in terminal B. Wait for agent_warm, confirm
540×1170 format record on the next short call, and take a screenshot under the
same conditions. Hang up and stop connector then agent gracefully.

- B fills materially more of the same tile, with all panels visible: source ratio
  affects this path. Keep the profile opt-in until screenshot/cropping review.
- B remains tiny or becomes narrower: geometry alone is insufficient; compare
  Juan's actual CLI version, room route, line/worker and iPhone layout next.
- Both change unpredictably: verify fresh process/profile records and stable tile
  layout; do not attribute the difference to resolution without reproducibility.

Omit HUD_VIDEO_PROFILE or set default to revert. No persistent defaults changed.
Do not upgrade CLI, switch rooms or change voice during this A/B; those would
introduce confounding variables and alter the existing working integration.
