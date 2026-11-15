# Voice and theme integration

The existing single Chert/LiveKit agent is preserved. STT is LiveKit Inference
`deepgram/flux-general-en`; LLM is `openai/gpt-4.1-mini` through LiveKit Inference;
default TTS is `cartesia/sonic-3`. No direct OpenAI API billing is added.
Game mode stays opt-in with `ENABLE_GAME=yes`; this change does not enable it.
The deterministic mission engine, rather than the LLM or theme text, controls
SCAN, POWER, SECURITY, PORTAL, and escape. Existing vision verification remains required.

## Optional ElevenLabs

`@livekit/agents-plugin-elevenlabs` is pinned to 1.8.0, matching Agents 1.8.0.
It replaces only the session's TTS. STT, LLM, room connection, caller capture,
and HUD publisher stay in place. The default `TTS_PROVIDER=livekit` path is unchanged.

Do not select ElevenLabs until approved. Selecting `TTS_PROVIDER=elevenlabs`
requires `ELEVENLABS_REQUESTS_APPROVED=yes`, a private `ELEVEN_API_KEY`, and an
explicit `ELEVEN_VOICE_ID`. The default model is `eleven_flash_v2_5`.
This is a direct ElevenLabs account integration, not LiveKit included inference;
no free balance or unlimited trial is assumed. No requests were made during implementation.
Official plugin documentation: https://docs.livekit.io/agents/models/tts/elevenlabs/

`TTS_FALLBACK_PROVIDER=livekit` preserves Cartesia as fallback; `none` disables it.
The ElevenLabs-only buffering adapter converts mono 22.05 kHz PCM to the session's
24 kHz format. It buffers a complete synthesis segment before exposing audio, so
partial failed synthesis is discarded before fallback. Primary synthesis is bounded
at 2.5 seconds, backup at 5 seconds, text at 1500 characters, and audio at 60 seconds.
After a primary failure, that call uses backup without background recovery probes.
Full-segment buffering adds latency; live latency and provider behavior remain unverified.
A failed utterance pauses progression rather than silently advancing.

## Teammate theme contract

Populate `themes.mjs` with exactly three final `ThemeDefinition` entries from
`theme-types.ts`. Production currently exports an empty array deliberately:
ORBIT reports missing configuration and cannot start a game.

Each entry needs a unique lowercase `id` and a spoken `name`; optional `aliases`
add exact spoken matches. Numbers one/two/three are supported automatically.
Optional `intro` supplies the selection confirmation narration. Optional
`missionIntros` maps SCAN/POWER/SECURITY/PORTAL to short cosmetic introductions.
These introductions are prefixed to the engine's actual action instructions and
cannot change verification predicates or progression. Final themes may customize
narration; this slice does not introduce new mission rules or HUD artwork.

ORBIT greets, speaks the menu, waits for an exact name/number, asks for yes/no,
and finishes confirmation audio before calling `GameRuntime.start()`.
The chosen immutable theme reaches `GameRuntime.setTheme()` once, before start.
Mission/HUD state continues through the existing runtime and `hud.setState()`.
Do not update the mission engine from conversational model output.

All game speech uses one per-call `SpeechCoordinator`: serialized output,
in-flight coalescing, and short duplicate suppression. Selection is half-duplex;
ordinary transcripts received during output are ignored. Exact `stop`, `wait`, or
`pause` interrupts output and invalidates verification evidence. `resume`, `repeat`,
`help`, or `hint` resumes a paused menu/confirmation or replays the authoritative
mission instruction. Voice failure requires an explicit retry. SpeechHandle
interruption and exceptions are checked even if playout resolves normally.
Automatic acoustic barge-in/echo behavior has not been verified on FaceTime.

## Offline validation

Run `npm run check`, `npm run check:types`, and `npm test`.
`theme-voice.test.mjs` contains test-only invented themes and covers confirmation,
interruptions, failures, serialized speech, and a complete mocked mission run.
`tts-selection.test.mjs` uses synthetic PCM and blocked fetch; it verifies plugin
construction, permission gates, resampling, partial-output rejection, and fallback.
These tests do not demonstrate real recognition, ElevenLabs synthesis, or FaceTime.
The existing Python and HTTP mock regression commands remain in GAME-INTEGRATION.md.

Controlled live-test commands and the separate opt-in test catalog are documented
in [CONTROLLED-TESTING.md](CONTROLLED-TESTING.md). The test catalog does not fill
or modify the production theme registry.
