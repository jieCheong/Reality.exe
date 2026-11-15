> HUD update: the outgoing renderer now uses Juan's Orbitron spaceship design.
> See [PART-C-HUD.md](PART-C-HUD.md) for the state contract and local preview.
> Historical transport results below remain unchanged.

# Part A video adapter and minimal HUD

## Results from this session (2026-11-14)

| Scope | Result | Evidence |
|---|---|---|
| Source syntax | PASS | npm run check |
| TypeScript contracts | PASS | npm run check:types; assignments checked against actual adapter/HUD implementations |
| Isolated tests, no network | PASS | 4 voice composition tests + 8 video tests |
| Generated-video LiveKit transport | PASS | 10 remote frames received; both HUD states observed; 5 distinct JPEGs saved; temporary room deleted |
| Actual FaceTime caller video | BLOCKED / NOT VERIFIED | Existing Chert line_offline; no FaceTime calls attempted |
| FaceTime speech / latency / second call | NOT VERIFIED | Previous hosted demo does not validate this local agent |

The network smoke test uses two ordinary RTC participants in a unique temporary
room. It never starts an AgentSession, dispatches an agent, connects Chert, or
calls an inference API. It consumes a small amount of the existing free Build
WebRTC minutes/bandwidth allowance, not inference credits or Chert trial minutes.
Do not describe that test as fully offline. The isolated tests need no network.

Synthetic artifacts (NOT real caller images):
`.local/synthetic-video/reality-video-smoke-cfc14886-5afd-4483-810a-5070995a7701/`
contains caller-01.jpg through caller-05.jpg and manifest.json. All five JPEG
hashes differ. Samples 1 and 5 show OFFLINE; samples 2–4 show ONLINE.
The room was deleted successfully after the test. No Chert state was changed.

## Installed API evidence

Pinned runtime packages remain LiveKit Agents 1.8.0 and rtc-node 0.13.35.
Implementation was checked against installed video_stream.d.ts, video_frame.d.ts,
track_publication.d.ts, room.d.ts, participant.d.ts, video_source.d.ts, and job.d.ts.

- RemoteTrackPublication.setSubscribed(boolean), TrackSubscribed(track,pub,p).
- new VideoStream(track), getReader(), reader.read()/cancel()/releaseLock().
- VideoFrame.convert(VideoBufferType.RGBA), data/width/height/type.
- RoomEvent track mute/unmute/unpublish/unsubscribe, participant disconnect,
  room reconnect/disconnect, and existing trackPublications maps.
- VideoRotation is 0/1/2/3 for 0/90/180/270 degrees. JPEG output applies it.
- RGBA-to-RGBA conversion is rejected by this SDK: already-RGBA frames are copied.
- The starter's VideoSource.captureFrame, LocalVideoTrack.createVideoTrack,
  localParticipant.publishTrack(...SOURCE_CAMERA), unpublishTrack and close.

Official references:
- https://docs.trychert.com/facetime-cli/video
- https://docs.livekit.io/reference/client-sdk-node/classes/VideoStream.html
- https://docs.livekit.io/robotics/media/video/video-tracks/

## Caller-camera adapter

caller-video.mjs registers handlers BEFORE the existing ctx.connect(AUDIO_ONLY).
That audio behavior remains; camera subscription is manual. It accepts only
`facetime-remote-video` from a `chert-bridge-<call ID>` participant, pins one bridge
at a time, scans existing publications, and handles tracks arriving later.
It never subscribes to its own agent-video track or another avatar participant.

Frames are sampled at most five times a second and copied into owned RGBA buffers.
Each snapshot includes participant/track identity, a generation number, sequence,
source timestamp, local receipt time and rotation. The current cache is cleared
on mute, unpublish, unsubscribe, replacement, reconnect and disconnect. Delayed
old-track events cannot replace/cancel the new track. getLatestFrame defaults to
a 1.5-second freshness limit; isCurrent invalidates in-flight work across track
changes. Full room disconnect detaches handlers, unsubscribes and cancels readers.

This does not add vision or game logic. Actual caller-video delivery still
requires the organizer to enable caller capture on the existing Chert worker.

## Five-frame debug capture

Set `DEBUG_CALLER_FRAMES=yes` in the existing private .env.local before starting
the agent. It defaults off. Each job gets a unique ignored `.local/frames/` folder.
Move your phone between views; it saves at most five JPEGs with distinct raw and
encoded-image hashes, at least 500 ms apart. Identical images do not count.

The encoder drops incoming samples while busy instead of queuing work; it checks
track generation before writing an asynchronously encoded image. Old/muted camera
frames are never returned as the current view. Files already saved are historical
debug samples and remain until you delete them. No audio or video is uploaded for
inference. `.local/` and credentials remain Git-ignored.

manifest.json records filenames, JPEG/pixel hashes, identity, timestamp and source
size/rotation. A 90/270-degree JPEG swaps the recorded source width and height.

## Minimal outgoing HUD

hud-video.mjs draws a reactor label/status stripe over the starter's animated
face. Its default is REACTOR OFFLINE. setState({reactor: 'online'}) changes only
display data; there is no mission predicate or reactor state machine.
The output remains one agent-video camera track from the SAME participant as the
voice session. The speaking animation still follows AgentStateChanged.
The synthetic test alternates the status; production does not toggle on a timer.

## Teammate interfaces

part-a-types.ts defines CallerFrame, CallerVideoStatus, CallerVideoPort,
SavedCallerFrame, HudState and HudVideoPort.

Teammate B's input is callerVideo.on('frame', callback), getLatestFrame() and
isCurrent(frame). Do not mutate snapshot.data. Bound asynchronous work yourself;
the emitter does not await consumers. On status unavailable/error, discard the
current visual evidence. A timestamp is not a verification verdict.

Teammate C's output is hud.setState({reactor: 'online'|'offline', speaking?: bool}).
The hud and callerVideo handles live inside the existing agent entry function.
These interfaces deliberately include no Gemini calls, game rules or full HUD.

## Reproduce tests

```bash
nvm use
npm run check
npm run check:types
npm test                    # isolated; no network or inference
npm run test:video:room      # LiveKit transport only; requires existing free Build credentials
```

Sharp 0.35.3, livekit-server-sdk 2.19.3 and TypeScript 7.0.2 were already installed;
they are now explicit dependencies where used. No runtime version was upgraded.
Only Node type declarations (and their type dependency) were added for compilation.
The Linux node_modules symlink was restored after npm stalled on the Windows mount.
Avoid npm installs through that symlink: npm may replace it. Existing credentials,
voice configuration, Chert project and assigned line are unchanged.

## Short real-call procedure once the organizer restores the existing line

First ensure the same project remains free Build with inference credit available.
In the existing agent folder, use Node 24 in both terminals:

1. Set DEBUG_CALLER_FRAMES=yes privately. Terminal A: `npm start`.
2. Terminal B: `chert doctor --agent reality-facetime-agent`, then
   `chert dev --agent reality-facetime-agent --json`. Wait for agent_warm.
3. On the verified iPhone, FaceTime VIDEO the existing +17025109706 line. Say
   “What is seven plus five?”; verify the reply is twelve, hear its voice, see
   the animated REACTOR OFFLINE HUD, and move the camera across five views.
4. Confirm five files in the job's .local/frames folder. Hang up; verify room
   cleanup. Call once more, ask a different question, verify fresh frames and
   conversation. If caller frames are absent, ask the organizer to check worker
   camera capture; do not substitute synthetic images as caller evidence.
5. Hang up, stop terminal B with Ctrl+C and wait for release, then stop A.

call-observer.mjs records actual model/STT/TTS metrics and agent-side timing in
.local/call-events.jsonl. Its final-transcript-to-speaking interval excludes some
endpointing and phone transport; do not label it end-to-end iPhone latency.
No voice/FaceTime quality or latency PASS can be claimed until those calls run.
