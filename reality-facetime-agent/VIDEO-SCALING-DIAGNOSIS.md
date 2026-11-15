# Portrait scaling diagnosis

## Conclusion and evidence

The exact Chert-versus-FaceTime root cause is not yet observable from this repo.
The observed small centered rectangle is consistent with downstream fit/padding,
but a forced landscape Mac canvas has NOT been proven. No resolution change or
landscape workaround was made.

Trace inspected in the installed code:

1. spaceship-face.mjs creates a 540×960 canvas and fills the entire background.
2. drawHud returns 2,073,600 owned RGBA bytes; no resizing or letterbox canvas.
3. hud-video.mjs passes those bytes to VideoFrame(540,960,RGBA), then captures into
   VideoSource(540,960) with VIDEO_ROTATION_0 at the existing 15 FPS.
4. rtc-node 0.13.35 creates a native source with that resolution and binds the
   LocalVideoTrack to its source handle. publishTrack forwards that track handle
   as SOURCE_CAMERA. No intermediate canvas, aspect-fit, rotation, or scale call
   exists in this path. Source configuration mismatch is rejected.
5. A REAL synthetic-only Cloud transport run used this same publishHud path
   (named facetime-remote-video solely to exercise our receiver filter). Received
   publication metadata: 540×960. Decoded video: 540×960, rotation 0. Ten frames
   received; five distinct JPEGs saved; both animation/status states received.
   This bypasses Chert, voice, the mission engine, and FaceTime.
6. The exact first SDK VideoFrame data was byte-compared to rendered pixels and
   saved as submitted-local.png. Remote JPEG retains white edge border, TL/TR/BL/BR
   markers, undistorted circle and width/height labels. Frames have different
   animation counters and lossy compression, so they are not byte-identical.

Evidence is ignored/local synthetic imagery, not caller images:
`.local/synthetic-video/reality-video-smoke-ee7f35e0-bd02-44de-8916-50dcc0527d8d/`
contains submitted-local.png, caller-01.jpg through caller-05.jpg, and manifest.json.
The local and first remote image each have zero near-black full rows/columns
(threshold: over 98% pixels have all RGB channels below 12). There is no embedded
landscape canvas at the tested LiveKit receiver boundary.

## Chert inspection

Inspected installed @trychert/facetime 0.1.0-beta.19: `chert guide video`,
`chert dev --help --all`, bundled docs/examples and dist/src forwarding/control
code. The documented rule is one camera track from the participant publishing
voice. No documented portrait, aspect ratio, letterbox, scaling or video-canvas
CLI option was found. The Mac media implementation is not included locally.
The public skills URL could not be retrieved through the web tool; conclusions
about available configuration are limited to the installed CLI and package.
Do not invent --portrait, fit or resolution flags or use --force/--takeover.

Ask the Chert organizer to inspect: dimensions/rotation of the subscribed agent
track, dimensions and content bounds immediately before Mac FaceTime/virtual
camera output, any fixed-size canvas, and aspect-fit versus aspect-fill behavior.
Request a supported preserve-portrait/rotation configuration if one exists. No
organizer message has been sent. No landscape workaround should be chosen until
this bridge evidence is available. If the Mac output itself is full-frame portrait
with no padding, investigate the iPhone's tile/display layout next.

## Diagnostic mode (off by default)

New `HUD_VIDEO_DIAGNOSTIC=yes` replaces ONLY outgoing synthetic HUD pixels with
an edge-to-edge colored pattern, white boundary, corner markers, labels, circle,
and moving counter/bar. No production theme or teammate renderer is edited.
Unset it or set no to return to the original HUD. No caller images, speech,
object names, credentials or game state are drawn in the diagnostic pattern.
The agent does not restart itself; currently running processes keep their code.

To repeat the isolated Cloud video comparison (no inference, no Chert call),
from the prepared WSL agent folder:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
HUD_VIDEO_DIAGNOSTIC=yes npm run test:video:room
```

This creates/deletes a temporary room on the existing project and uses transport
quota. Expect PASS, publishedWidth 540, publishedHeight 960, rotation 0, both
states and five saved frames. Inspect submitted-local.png and the remote JPEGs
in the printed directory. It does not prove Chert or FaceTime rendering.

## Next FaceTime verification — only after separate approval

No call was initiated and no existing agent/connector was restarted for this
investigation. Future calls still use voice/provider and Chert allowances.

1. Hang up any active call. Ctrl+C connector, wait for dev_stopped, then Ctrl+C
   agent. Do not run parallel agents or take over another holder.
2. In WSL, from reality-facetime-agent, restart the existing speech-only setup
   with diagnostic pixels (private credentials remain in .env.local):

```bash
ENABLE_GAME=no GAME_TEST_MODE=no HUD_VIDEO_DIAGNOSTIC=yes TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

3. In another prepared WSL terminal, same folder:

```bash
chert dev --env-file .env.local --minutes 3 --json
```

4. Wait for agent_warm; place FaceTime Video call to the existing line. Keep
   iPhone upright and observe the REMOTE main video tile, not your local preview.
   Record whether the complete white border and all four markers are visible,
   whether the circle stays circular, and whether black areas lie OUTSIDE the
   white border. Compare with submitted-local.png and caller-01.jpg.
5. Ask organizer to capture the same pattern at Mac input and output boundaries:
   - Black padding already in Mac output: bridge composition/virtual-camera fit.
   - Mac output portrait and clean, iPhone still surrounded: FaceTime display fit.
   - Mac input differs from our remote portrait capture: bridge subscription or
     decoding path; inspect selected track and rotation/size at that boundary.
   - Missing corner markers: crop; ellipse: nonuniform stretch; full white border
     inside black surroundings: padding or a display container after rendering.
6. Hang up promptly, stop connector gracefully, then agent. Restore ordinary HUD
   by omitting HUD_VIDEO_DIAGNOSTIC on the next authorized restart. Do not change
   resolution to compensate for an unidentified downstream container.

Apple's FaceTime “Portrait” effect is background blur, not a portrait-forwarding
or aspect-fill switch:
https://support.apple.com/en-ca/guide/iphone/iphfb3d2a12b/ios

## Validation scope

All prior 63 tests preserved, plus two diagnostic tests (65 regression tests).
Syntax/type checks pass. Separate real Cloud synthetic-video transport test PASS.
No provider inference, Chert trial minutes, FaceTime call, commit or push was used.
A definitive fix is BLOCKED pending Chert Mac/FaceTime boundary evidence; local
geometry does not justify a resolution change or UI redesign.

## Completed iPhone diagnostic and restoration

User-reported real call: the white boundary and all four corner markers were
visible on a small centered portrait rectangle with black surroundings. This
confirms the visible borders are outside our rendered frame. It does not locate
whether those black pixels are encoded by the managed Mac or supplied by the
FaceTime UI. No assumption of aspect-fit or fixed landscape output is warranted
without inspecting Mac output dimensions/content bounds.

Diagnostic mode is now disabled in private .env.local (`HUD_VIDEO_DIAGNOSTIC=no`).
The normal preview has been regenerated through the normal HUD path; no teammates'
files, theme content, dimensions, provider settings or mission rules changed.
No connector or FaceTime call was started as part of restoration.

Additional official-source finding:
https://github.com/cherthq/chert-facetime-opensource/blob/main/src/media.mjs
has canvas.width=640, canvas.height=360 in ensureVideo and draws room video to
that canvas with drawImage(roomVideo,0,0,640,360). This is a fixed landscape
browser connector with nonuniform stretching, NOT evidence of the managed Mac
implementation used by our line. Its installMedia options expose no size/fit
configuration. Do not adopt its stretch behavior or replace our working connection.
The public repo's README distinguishes the browser connector from the managed
service: https://github.com/cherthq/chert-facetime-opensource#how-this-works

No supported managed portrait fix has been identified in installed beta.19 docs,
CLI help or inspected source. This means unknown/unexposed, not proven unsupported.
Ask the organizer for the managed Mac's actual source size, output size, rotation,
active-image rectangle, and whether output canvas/fit can be configured to retain
portrait. Ask them to compare input and FaceTime output captures while receiving
the unchanged 540×960 stream. If Mac output contains the black surroundings, fix
that composition at the bridge. If Mac output is clean portrait, investigate the
receiving FaceTime display container. No message has been sent automatically.

### Safe fallback proposal (not implemented)

If Chert confirms a fixed landscape-only output, keep portrait source unchanged
until the team chooses an explicitly separate landscape presentation. A native
landscape reflow using the existing font/palette and complete mission information,
viewed with the phone landscape, would avoid stretching and avoid cropping away
HUD controls. It would not guarantee portrait full-screen display. Simply fitting
our portrait frame inside another landscape canvas would preserve the same problem;
aspect-fill cropping would remove HUD content. Neither is an acceptable automatic
fix. A Chert-side preserve-portrait fix is preferred.

### Exact next test after Chert feedback / explicit live approval

Do not spend another call repeating unchanged geometry before getting bridge
feedback. After Chert adjusts a supported setting (or wants an observed baseline),
end existing calls and stop connector then agent with Ctrl+C. In WSL terminal A:

```bash
cd /mnt/c/Users/cheon/OneDrive/Desktop/Hackathon/HackUTA/Reality.exe/reality-facetime-agent
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
ENABLE_GAME=no GAME_TEST_MODE=no HUD_VIDEO_DIAGNOSTIC=no TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Terminal B, same directory/nvm preparation:

```bash
chert dev --env-file .env.local --minutes 3 --json
```

Wait for agent_warm. Call existing +1 702-510-9706 with FaceTime Video, phone
upright. Confirm the actual HUD, readable objective, full checkpoints and no
missing top/bottom edges. Observe remote main tile, then briefly rotate phone
landscape to distinguish display-container fitting. Take screenshots without
private surroundings/account information; hang up after 20–30 seconds. Compare
with .local/hud-juan-preview/1-scan.png and the organizer's Mac output capture.
Report portrait occupied-area ratio, cropping, and Mac output dimensions; do not
call it fixed based only on a larger image. Hang up, stop connector gracefully
and wait for dev_stopped, then stop agent. Gameplay/Groq remain off for this
focused display check; no new theme or video resolution is required.

## Actual 540×1170 HUD trace after unsuccessful aspect-ratio A/B

The user reports the 1170 profile still displays small. Changing geometry did
not resolve the symptom; no further source-size changes have been applied.

Added `video-geometry.mjs`: counts opaque/near-black pixels and computes the
bounding box of visible nonblack content from the actual submitted RGBA buffer.
The publisher logs this once as hud-source-geometry, then logs source/publication
sizes and renderer layout size. Unknown receiving viewport dimensions are
explicitly null, not guessed. No images, object names or player data are logged.
The publisher now also rejects a mismatched VideoFrame before capture/publication.

A fresh actual-HUD Cloud-only run (not just the diagnostic pattern) measured:

| Stage | Size | Content bounds / behavior |
| --- | --- | --- |
| Native renderer and RGBA buffer | 540×1170 / 2,527,200 bytes | x0 y0 width540 height1170; zero near-black pixels; all 631,800 pixels opaque |
| VideoSource / VideoFrame | 540×1170 | Same geometry, no scaling, explicit rotation zero |
| Remote publication metadata | 540×1170 | SOURCE_CAMERA, original publisher path |
| Remote decoded RGBA | 540×1168 | x0 y0 width540 height1168; all pixels opaque; 5 isolated near-black pixels, no black margin |
| Managed Chert Mac FaceTime output | UNKNOWN | No access to its source/framebuffer or configuration |
| iPhone rendered video viewport | UNKNOWN | User reports intact image with surrounding black space |

Evidence directory:
`.local/synthetic-video/reality-video-smoke-c494e14f-5e37-4c44-94b0-410d331a9969/`.
Contains submitted-local.png and five remotely decoded actual-HUD JPEGs.
The first transport run failed the old exact decoded-size assertion because
1170 decoded as 1168. The rerun PASSes with a maximum four-pixel codec-alignment
allowance and separate logs for advertised versus decoded dimensions. The HUD
stripe sample uses received geometry and stripe center. This measurement does
not change production source size or crop/reformat any application pixels.
Two-pixel encoded alignment is consistent with codec constraints and cannot
explain the observed large surround; the exact native encoder internal decision
was not instrumented.

Correct routing order: renderer → Node native VideoSource/VideoFrame → LiveKit
publication → managed Chert Mac subscription/forwarding → FaceTime → iPhone view.
The installed Chert CLI's assessMedia chooses the participant and camera/audio
tracks and dispatches a room; it has no local drawImage/render pass. The separate
untracked chert-facetime/src/media.mjs fixed landscape canvas is NOT imported by
agent.mjs or the installed managed CLI's dispatch path. Altering that unrelated
browser connector would not fix the existing managed-line calls.

Juan's source/publication comparison remains unchanged: identical native camera
API, RGBA, SDK versions, FPS, zero rotation, with a conditional alternative room
routing wrapper. Its actual use on his successful call remains unknown. His
success does not prove the same line, worker or Mac output settings were used.

Status: renderer/LiveKit path PASS; downstream root cause and display FIX BLOCKED
on managed Mac/receiver evidence. No honest local code change can guarantee the
requested fill while that boundary is inaccessible. Do not call added logging
a display fix or reinterpret remote content bounds as an iPhone viewport size.

Needed from the bridge owner before another unchanged call: incoming decoded
size/rotation, outgoing encoded/canvas size, nonblack image bounds inside that
output, and whether source is rendered 1:1, aspect-fit, or aspect-fill. Also check
outgoing track settings and actual FaceTime viewport/container size. If padding
is baked into Mac output, the correction belongs in its canvas/virtual-camera
composition: native portrait output and uniform scaling to the intended display
area, preserving all HUD edges. If Mac output is clean, inspect the iPhone's
remote tile and layout. These are conditional fixes, not implemented claims.

All prior regressions plus two geometry tests pass (69 total); JS syntax and
TypeScript checks pass. The separate Cloud-only actual-HUD transport run passes.
No provider inference, Chert connector restart, or real FaceTime call was made
for this investigation. Existing live processes were not reconfigured.
