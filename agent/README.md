# Reality.exe FaceTime video agent

This Chert video agent publishes the Reality.exe player HUD from `face.mjs` as
its FaceTime video. The HUD is a visual prototype and does not connect to game
state or inspect the caller's camera. Use Node 24 on Windows; Node 22.23.2 or
Node 26 is also supported.

## Preview the player HUD without credentials

Start the local visual preview:

```sh
npm run preview
```

Open `http://localhost:4173`. To view it on an iPhone on the same Wi-Fi, set
`$env:HUD_PREVIEW_HOST="0.0.0.0"` in PowerShell before starting the preview,
then open `http://<your-computer-ip>:4173` on the phone. The preview fills the
browser viewport with the portrait HUD and animates the voice indicator. It
does not connect FaceTime, the game engine, or the camera. Press Ctrl+C to stop.

The default page shows the voice-first theme chooser. Preview a selected theme
by adding `?theme=space`, `?theme=odyssey`, or `?theme=backrooms` to the URL.
Each chooser card uses a blurred crop from its theme's background image.
Preview a completion screen and its stats with, for example,
`?theme=backrooms&complete=1&tasks=3&seconds=245`.
To preview a loss after four timeouts, add `&timeouts=4`.

## Run it

1. Install it:
   ```sh
   npm install
   ```
2. Create your private env file, then replace each `YOUR_` placeholder in it:
   ```sh
   cp .env.example .env.local && chmod 600 .env.local
   ```
   The three LiveKit values come from one LiveKit Cloud project (Settings, API
   keys). The OpenAI key needs Realtime access and credits. Set `AGENT_NAME` to a
   name no other team uses.
3. Terminal 1, your agent:
   ```sh
   npm start
   ```
4. Terminal 2, in this same folder:
   ```sh
   chert login     # once per computer
   chert dev
   ```
5. When `chert dev` says your agent is in a waiting room, make a **FaceTime Video**
   call to the line it shows. The agent greets you as soon as FaceTime is ready. A
   FaceTime Audio call works too, but the caller then only hears the agent.

A few seconds into each call `chert dev` says what the Mac is taking from your
agent: video and audio, audio only, or what is wrong.

## The greeting

The Mac ends a call that hears nothing from the agent within 10 seconds of
FaceTime being ready (`remote_audio_timeout`). When the Mac reports `bridge_ready`,
`chert dev` writes `"chert_bridge_ready": true` into the room metadata, and the
agent greets once (`greet.mjs`, the `greeting` line in `agent.mjs`). It never
greets just because the caller joined. Without the signal it does not greet,
and the caller speaks first.

## The one rule for video

The Mac that answers FaceTime takes audio from the **one** participant that
publishes an audio track, and shows video **only from that same participant**.

- This starter follows the rule: the agent publishes its own voice and its own camera track.
- Two participants publishing audio ends the call.
- Video from a participant that does not speak is not shown.

## Change the picture

Edit `drawFace` in `face.mjs`. It returns one RGBA frame, 540 by 1170 (9:19.5),
15 times a second. Space uses Michroma, Backrooms uses IBM Plex Sans Condensed,
and Odyssey uses GFS Didot, a Greek typeface with a matching Latin design. The
Space theme uses the bundled lunar photo, blurred by 2px, behind opaque HUD
panels. Odyssey uses the bundled sea illustration as an unblurred background
behind its parchment HUD panels. Backrooms uses the bundled, slightly blurred
wall photo behind opaque HUD panels. All bundled fonts are licensed under the SIL Open Font License; see
`assets/OFL-Michroma.txt`, `assets/OFL-IBM-Plex-Sans-Condensed.txt`,
`assets/OFL-Orbitron.txt`, and `assets/OFL-GFS-Didot.txt`.
The renderer accepts `null` for the theme chooser or one of `space`, `odyssey`,
and `backrooms` to display the corresponding theme. Theme changes affect labels
and presentation only; game state remains outside this HUD. To render an end
screen, pass `{ tasksCompleted, elapsedSeconds, timedOutTasks }` as the fourth
`drawFace` argument. More than three timeouts selects the loss screen. The
gameplay engine does not yet supply these events; preview URLs can be used to
review the screens with sample values.

## Use a realtime avatar instead

LiveKit has plugins for avatar services (Tavus, Beyond Presence, Anam and others).
The avatar joins the room as a third participant and publishes the voice and the
face together, which fits the rule above. LiveKit admits it to a Chert room.

```js
import * as bey from '@livekit/agents-plugin-bey';   // Beyond Presence; needs BEY_API_KEY

const avatar = new bey.AvatarSession({ avatarId: '...' });
await avatar.start(session, ctx.room);   // before session.start
```

The plugins and their options are listed at https://docs.livekit.io/agents/models/avatar/.

Remove the `VideoSource` code when you do this, and keep the agent's own audio
output off the room (the plugin does that), so that only the avatar speaks. Each
service needs its own account and API key. This path has not been tested on a
FaceTime call by Chert yet: watch the media line in `chert dev` on your first call.

## What it does not do

- It does not look at the caller's camera.
- The waiting room shows that the agent joined LiveKit. It does not verify the
  model key or the media path. The first call does.
- Never commit or share `.env.local`. LiveKit and model usage may cost money.
