# Reality.exe Part A: voice and animated video

The Chert video starter now uses LiveKit Inference: Deepgram Flux STT,
GPT-4.1 mini, and Cartesia Sonic 3 TTS. No OpenAI API key is required.
See [the researched cost and compatibility report](COSTS.md).

## Offline verification

```bash
nvm use
npm run check
npm test
```

Tests use dummy credentials, construct the installed SDK adapters and session,
and verify the free-plan gate and Chert greeting readiness/cancellation. Network
inference entry points are blocked and LLM prewarming is suppressed in tests.
These are composition tests, not offline speech recognition or synthesis.
Cloud speech quality and actual latency still require an authenticated call.

## Live run, after free-plan confirmation

1. Check the EXISTING LiveKit project's billing/usage dashboard: free **Build**
   plan, inference credits remaining, no paid upgrade. Do not add a card or enable
   paid billing. The code cannot independently verify the plan or balance.
2. Fill the existing `.env.local` privately with the three LiveKit credentials
   from that project; preserve `AGENT_NAME=reality-facetime-agent`. Old
   `OPENAI_API_KEY` values are unused; do not add a new one.
3. Only after the dashboard check, add `LIVEKIT_FREE_BUILD_CONFIRMED=yes` to
   `.env.local`. Without it, the agent refuses to create inference providers.
4. Run `npm start` in terminal A. In terminal B, from this folder with Node 24,
   run your installed Chert CLI: `chert dev --agent reality-facetime-agent`.
   Keep the current sign-in/project/line; do not rerun onboarding or setup.
5. Wait for a ready waiting room, then FaceTime Video the assigned Chert line.
   Confirm the greeting, two-way conversation and changing face. Wait until the
   agent finishes speaking before replying: this minimal prototype disables
   barge-in and speculative generation.
6. Hang up; wait for cleanup. Stop Chert with Ctrl+C and wait for line release,
   then stop the agent. Test a fresh second call before calling Part A working.

The original room connection, named agent registration, same-participant avatar,
and bridge-ready greeting trigger remain. The greeting now uses TTS directly,
without an LLM round trip. Replies are limited to 120 output tokens.
The caller-video adapter and debug JPEG sampler are now available; see [VIDEO.md](VIDEO.md).
No Gemini or game logic is implemented.

Dependencies stay at the starter's pinned versions. No provider account, key, paid plan or deployment was added. Video work includes
a generated-media LiveKit transport test; no inference or Chert call was used.
The legacy OpenAI plugin remains installed but is not imported by the agent.
Native dependencies remain linked to the existing Linux cache.

For caller-camera debug capture, minimal HUD, teammate TypeScript interfaces and
current video test results, see [VIDEO.md](VIDEO.md).
