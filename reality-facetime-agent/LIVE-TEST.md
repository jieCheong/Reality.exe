> Current status: CONNECTED / WAITING FOR REAL CALL (2026-11-14 23:54 UTC).
> Chert beta.21 doctor passed LiveKit credentials, available existing line and
> agent room join in 0.9 s. `chert dev` emitted dev_connected and agent_warm.
> Agent and connector are running; DEBUG_CALLER_FRAMES=yes. Existing line:
> +17025109706, Reality.exe project. No real local-agent call is verified yet.
> The historical blockers below have been resolved. Real speech, latency,
> FaceTime caller camera and second-call checks still await actual calls.

> Update: caller-video/HUD code and the synthetic LiveKit transport test are now
> implemented. See [VIDEO.md](VIDEO.md). Real FaceTime checks below remain blocked.

# Part A live verification: BLOCKED

Latest attempt: 2026-11-14. No real call to our local agent has run.

| Check | Result | Evidence |
|---|---|---|
| Linux, Node 24 | PASS | Linux, user cheon; Node 24.22.3 |
| LiveKit variables populated | PASS | Names checked privately; no placeholders or whitespace |
| Free Build and credits | User confirmed | User answered yes; numerical balance not provided; not independently verified |
| Free-plan local flag | Enabled | LIVEKIT_FREE_BUILD_CONFIRMED=yes after confirmation |
| Chert sign-in/project | PASS | Existing Reality.exe project; owner |
| LiveKit credentials accepted | PASS | Updated credentials accepted by chert doctor |
| Existing Chert line | BLOCKED | Noah Wilson +17025109706; Mac not accepting calls or receiving identity unconfirmed |
| Chert worker heartbeat | PASS | Worker checked in during doctor |
| Local agent registration | PASS | npm start registered reality-facetime-agent with LiveKit Cloud |
| Real agent dispatch | PASS | chert doctor --agent reality-facetime-agent: joined temporary room in 0.8 s |
| Chert connector | BLOCKED | chert dev --agent reality-facetime-agent exited 3: line_offline |
| Chert minutes | PASS | Doctor reported 49 trial minutes left |
| Speech recognition, model reply, synthesis | BLOCKED | No live inference started |
| Response latency | BLOCKED | No real utterance/reply measurements |
| Second call/cleanup/reconnection | BLOCKED | First local-agent call has not occurred |
| Five caller video frames | BLOCKED | Deferred until voice call succeeds, as requested |

The Chert doctor warning about missing OPENAI_API_KEY is for the original
Realtime starter. Our agent uses LiveKit Inference and does not need that key.
The unused YOUR_ OpenAI placeholder was removed; no real key was removed.

Next: LiveKit credentials and agent dispatch now pass. Ask the Chert organizer
to check the existing line's receiving identity and worker accepting state.
The connector refused to start with line_offline; no calls or inference ran. Do not force, take over, restart
onboarding, allocate a different line, enable billing, or upgrade dependencies.

Once credentials pass: npm start; chert doctor --agent reality-facetime-agent
--json; chert dev --agent reality-facetime-agent --json. Keep both processes
running, wait for agent_warm, then test a short FaceTime Video call. Use a known
question and verify the answer heard on the iPhone, hang up, observe cleanup,
then repeat with a fresh call. Only then implement caller-video subscription.

call-observer.mjs is installed before session.start. It logs numeric model/STT/
TTS metrics, final transcript character counts, state transitions and error types
to ignored .local/call-events.jsonl. It does not store transcript text or audio.
Final-transcript-to-speaking is an agent-side latency proxy, not iPhone playout
latency. End-of-speech timing is reported only if supplied by SDK EOU metrics.
No latency or model success is claimed from the offline tests.

Four existing offline composition tests and all edited-file syntax checks pass.
