# Controlled real FaceTime gameplay testing

Status: prepared, NOT live-verified. No call, model request, or billing change was
made while preparing this guide. Run the live steps only after explicit approval,
checking actual remaining allowances in LiveKit, ElevenLabs, Groq, and Chert.
Opt-in flags authorize requests; they do not impose a dollar cap. Stop if free
allowance/model access cannot be confirmed. Do not enable paid billing.

The existing Chert account, line, project, agent, and HUD renderer are preserved.
`VOICE-THEMES.md` and `GAME-INTEGRATION.md` describe the underlying contracts.
This guide adds a separate controlled-test catalog; production `themes.mjs` and
teammates' visuals are untouched. The test catalog is narration-only, uses the
same deterministic missions, and does NOT mock real Groq verification.

## Configuration inventory

| Component | Existing configuration | Requirement |
|---|---|---|
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same existing Cloud project, private `.env.local` |
| LiveKit safety | `LIVEKIT_FREE_BUILD_CONFIRMED=yes` | Reconfirm Build, remaining inference credits, no paid billing; flag is only an attestation |
| Agent registration | `AGENT_NAME` | Preserve current value; Chert and Node must agree |
| ElevenLabs | `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_REQUESTS_APPROVED=yes`, `ELEVEN_API_KEY`, `ELEVEN_VOICE_ID` | Explicit approval, private valid account key and voice ID |
| ElevenLabs model | `ELEVEN_MODEL` | Existing default `eleven_flash_v2_5`; verify account access |
| Fallback | `TTS_FALLBACK_PROVIDER=livekit` | Existing Cartesia Sonic-3 through LiveKit Inference; `none` disables fallback |
| Game | `ENABLE_GAME=yes` | Explicit process-local test activation |
| Test catalog (new) | `GAME_TEST_MODE=yes` | Also requires game enabled; three labeled Test 1/2/3 choices; production catalog unchanged |
| Vision client | `VISION_MODE=groq`, `VISION_SERVICE_URL=http://127.0.0.1:8765` | Rejects mock responses; no Groq key sent by Node |
| Python Groq | `GROQ_API_KEY`, optional `GROQ_MODEL` | Private Python process environment; explicit `--provider groq --allow-provider-calls` required |
| Chert | Existing login under `~/.chert` (optional `CHERT_HOME` override) | No new Chert API-key variable; reuse current session/project/line |
| Camera debug | `DEBUG_CALLER_FRAMES=no` | Keep off for controlled testing; no saved private camera images |

Current STT is Deepgram Flux and default TTS Cartesia through LiveKit Inference.
The configured LLM is GPT-4.1 mini through LiveKit Inference, with no direct OpenAI
key. In game mode, free-form LLM responses are suppressed; ORBIT uses scripted TTS.
ElevenLabs is a direct-account integration, not LiveKit included inference.
If ElevenLabs fails, the buffered adapter switches that call to Cartesia without
publishing failed partial synthesis or background recovery probes. Primary's
2.5-second synthesis deadline can cause fallback on long lines. Hearing speech
alone does not prove ElevenLabs worked: inspect `tts_synthesis` provider events.

The Groq bridge currently defaults to `qwen/qwen3.8-27b`. Its availability,
account allowance, vision support, and request-parameter compatibility have NOT
been live-verified. Set `GROQ_MODEL` only to a model verified for this existing
request format; a 503/provider error is a blocked test, not a physical failure or
permission to replace providers. Never lower confidence/consensus guards to pass.
No `GROQ_REASONING_EFFORT` setting is read by this wrapper; it sends `none`.

## 1. WSL preparation and offline checks

In each terminal:

```bash
cd /mnt/c/Users/cheon/OneDrive/Desktop/Hackathon/HackUTA/Reality.exe/reality-facetime-agent
uname -s
whoami
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
node --version
```

Expect Linux and Node 24. Preserve the existing dependency symlink; do not run
`npm install` on the Windows-mounted project. Privately edit `.env.local` in VS
Code for existing LiveKit values and approved ElevenLabs credentials. Do not
paste them into commands, logs, screenshots, Git, or chat. Leave its game and
provider approval toggles disabled; the commands below override only one process.

```bash
npm run check
npm run check:types
npm test
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service/test_bridge.py vision-service/vendor/tests
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
node --env-file=.env.local test-readiness.mjs
```

The temporary Python venv must still exist; otherwise recreate a venv and install
`vision-service/requirements.txt` as documented in GAME-INTEGRATION.md, then use
that interpreter path. Readiness prints booleans only; it does not verify accounts
or balances. With defaults, disabled game/ElevenLabs and an empty catalog are
expected. For local validation of the intended live configuration, without
constructing providers or sending requests:

```bash
ENABLE_GAME=yes GAME_TEST_MODE=yes VISION_MODE=groq TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit node --env-file=.env.local test-readiness.mjs
```

Expect required LiveKit/ElevenLabs checks, themeCatalogReady, realVisionSelected,
and livekitFallback true. This still cannot check the Python key or Chert login.

## 2. Start the real vision service — AFTER approval

Terminal A, from the prepared agent folder. Read the key silently, without shell
history; do not source `.env.local` as shell code:

```bash
read -rsp 'Groq API key: ' GROQ_API_KEY
printf '\n'
export GROQ_API_KEY
/tmp/reality-vision-venv/bin/python vision-service/bridge.py --provider groq --allow-provider-calls
```

If an account-verified alternative model is required, set `GROQ_MODEL` in this
terminal before launch. Startup does not call Groq; requests start after frames
and instructions arrive. Expect `{"port":8765,"provider":"groq"}`.
In another terminal, the local health endpoint is safe to read:

```bash
curl --fail --silent http://127.0.0.1:8765/health
```

Expect provider groq; `real_world_verified:false` is deliberately not a live-test
claim. Never use the mock server when reporting a real verification result.

## 3. Start the existing agent and connector — AFTER approval

End any old call and stop old agent/connector processes gracefully first, so a
warm room cannot run old code. Do not start a second agent or take over a line.

Terminal B:

```bash
ENABLE_GAME=yes GAME_TEST_MODE=yes VISION_MODE=groq VISION_SERVICE_URL=http://127.0.0.1:8765 TTS_PROVIDER=elevenlabs ELEVENLABS_REQUESTS_APPROVED=yes TTS_FALLBACK_PROVIDER=livekit DEBUG_CALLER_FRAMES=no npm start
```

Terminal C:

```bash
chert doctor --env-file .env.local --json
chert dev --env-file .env.local --minutes 10 --json
```

These commands use the existing AGENT_NAME from `.env.local`. Doctor without
`--agent` checks readiness without a test job; `chert doctor --agent NAME` would
run a real agent job, so it is intentionally omitted. Expect doctor ready/exit 0
and connector `agent_warm`. If line_offline/line_in_use/line_in_call occurs, stop
and resolve the external condition. Do not use --force, --takeover, or onboarding.

## 4. ElevenLabs audio, selection, and one physical mission

1. On the approved iPhone, place a FaceTime **Video** call to the EXISTING line
   shown by Chert. Expect `call_accepted`, `call_bridge_ready`, then ORBIT's menu
   within 10 seconds, with the existing HUD visible.
2. Check agent diagnostics: `tts_selection` provider elevenlabs, fallback livekit;
   `tts_synthesis` provider elevenlabs/state complete. If it says failed followed
   by livekit/complete, fallback worked but ElevenLabs test FAILS.
3. Wait for the menu to finish; say “one”, then after ORBIT's question say “yes”.
   Expect the confirmation audio to finish before the SCAN instruction. No
   mission should start on an ambiguous choice, “no”, or unconfirmed selection.
4. Put a closed bottle, flat notebook, and pen clearly in view under good light.
   Keep faces, documents, screens, and private objects out of view. Images are
   sent to Groq for this test. Hold a stable view with natural live movement;
   byte-identical frozen frames are intentionally rejected.
5. Expect `camera_delivery` first frame and every 25 sampled frames. SCAN needs
   two matching fresh inventories. Expect `verification_started`,
   `verification_finished` provider groq with latencyMs, then
   `mission_transition` phase POWER and `hud_update` progress 0.25.
6. Listen to the actual object-role assignment; use those objects rather than
   assuming role names. First leave the reactor beside the panel and say “done”.
   There must be no advancement. Then safely place the assigned reactor on the
   panel as instructed and keep both visible. POWER requires two consecutive
   passing rounds of three fresh frames each, not a spoken completion claim.
7. Expect POWER verified audio, SECURITY instruction, mission_transition SECURITY,
   and hud_update progress 0.5. Visually confirm the POWER checkpoint changed.
   This completes one real physical-action mission. Record whether recognition,
   verification, speech, and HUD each passed; do not infer one from another.
8. Optional within the approved allowance: hold up the access key for SECURITY,
   then arrange objects in the exact image-left-to-right order for PORTAL.
   Expect final progress 1 and escape audio only after verified consensus.

Use verification latencyMs for HTTP/provider round-trip timing. Existing
`[call-evidence]` timing/metrics describe agent-side speech timing, not iPhone
end-to-end latency. A completed request is not necessarily a positive verdict;
`verification_applied accepted:false` may mean a failed check or the first
passing consensus round. Slow results can be rejected as stale without advancing.
Provider errors can also be represented as verdict errors (errors count >0).
A 2xx HTTP response alone does not prove successful model verification.

## 5. Recovery, interruption, and cleanup

- While speaking, say exactly “stop”, “wait”, or “pause”. Expect output to stop,
  progression to pause, and evidence to be invalidated. Say “resume” after output
  stops: ORBIT replays the current authoritative instruction. During selection,
  resume asks for confirmation again. Ordinary choices during speech are ignored.
  Actual FaceTime/STT interruption reliability remains an explicit test outcome.
- Say “help” or “repeat”: expect one instruction, without overlapping speech.
  If all speech options fail, no new verification should run until explicit retry.
- Mute the iPhone camera if available: camera_status becomes unavailable and no
  mission may advance. Restore video: fresh frames and consensus are required.
- Stop Python with Ctrl+C: expect verification failure/correction, no progression.
  Restart with the same approved command; fresh evidence should permit recovery.
  Do not deliberately provoke provider billing/authentication failures. Primary
  failure, all-provider failure, and partial-audio fallback already have mocks.
- Hang up on iPhone. Expect call_ended, session_closed, camera unavailable, and
  no continuing verification requests. Make one second approved call to confirm
  a fresh menu, SCAN, and no retained checkpoints. Watch allowances between calls.
- Hang up, Ctrl+C connector and wait for dev_stopped; never SIGKILL. Then Ctrl+C
  agent and Python. In Terminal A: `unset GROQ_API_KEY GROQ_MODEL`.
  Process-local test/approval overrides disappear when the agent exits.

## Logs and result reporting

Application diagnostics emit only fixed labels, counters, booleans and timings:
no transcripts, objective text, detected names, frame bytes, keys, phone numbers,
or provider exception bodies. Camera delivery is sampled to avoid log floods.
Existing `.local/call-events.jsonl` is ignored by Git; leave debug frame saving off.
SDK/Chert tools have their own logs, which can contain connection/account metadata;
keep raw output local, review before sharing, and never publish full logs blindly.

Mark each live requirement PASS, FAIL, or BLOCKED with observed evidence and
latencies. Current result is OFFLINE PASS / LIVE NOT RUN. No inference accuracy,
ElevenLabs speech, iPhone latency, interruption, or reconnection claim is made.
