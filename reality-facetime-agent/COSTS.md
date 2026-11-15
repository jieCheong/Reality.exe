# Part A: $0 out-of-pocket decision

Researched 2026-11-14 using official documentation and the installed SDK.
Public eligibility is verified; this account's private plan, remaining credits,
and real-call inference access have NOT been verified. Live inference stays gated.

## Recommendation and exact limits

Use the EXISTING LiveKit Cloud project on free Build, with its included inference
credits. Run the agent locally and retain the current Chert account, project,
line and LiveKit credentials. No separate model-provider accounts are needed.

| Component | Selection | Published Build allowance or rate |
|---|---|---|
| LiveKit Cloud | Build | $0/month, no credit card; $2.50 inference credits; 5,000 WebRTC participant minutes; 50 GB downstream transfer; 100 concurrent connections |
| Hosted agents, if used later | Build | 1,000 agent-session minutes, 1 deployment, 5 concurrent agent sessions; no deployment is needed now |
| Speech-to-text | deepgram/flux-general-en via LiveKit | $0.0065 per minute; STT is metered by connection time, not just time speaking |
| Language model | openai/gpt-4.1-mini via LiveKit | $0.40 input / $1.60 output per million tokens; cached input $0.10/million |
| Text-to-speech | cartesia/sonic-3 via LiveKit | $50 per million characters |
| Inference concurrency | Build | 5 concurrent inference sessions |

The rates consume ONE finite $2.50 credit pool, not a separate free allowance
per model. LiveKit estimates about 50 minutes, depending on model usage; this is
not a guaranteed call-duration allotment. Included allowances are monthly and
shared across a user's free projects. Check the actual balance before live work.
On free Build, exhaustion causes requests to fail instead of charging overages.
A paid project has different billing behavior. A local confirmation flag cannot
prevent billing if the project is subsequently upgraded: keep it on Build.

Sources:
- [Cloud pricing and included allowances](https://livekit.com/pricing)
- [Exact model rates](https://livekit.com/pricing/inference)
- [Free-plan hard caps and quota sharing](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- [Metering and minimum increments](https://docs.livekit.io/deploy/admin/billing/)

## Compatibility and adaptation

Installed: @livekit/agents 1.8.0, @livekit/agents-plugin-openai 1.8.0,
@livekit/rtc-node 0.13.35, Node 24.22.3 on Ubuntu. The original session used
OpenAI's gpt-realtime directly, which needs separate funded OpenAI credentials.
That provider path is replaced with the installed core inference.STT, inference.LLM
and inference.TTS adapters. Their declarations include all chosen model IDs and
accept LiveKit key/secret authentication. No SDK upgrade or new plugin is needed.
The OpenAI plugin dependency is retained, unused, to avoid lockfile churn.

Flux supplies server-side endpointing. Explicit STT turn detection disables the
SDK's default extra inference turn detector. Interruption and preemptive
LLM/TTS generation are disabled for this first, half-duplex prototype. The LLM
output cap is 120 tokens. The greeting calls session.say directly after the same
Chert bridge-ready signal, reducing first-greeting latency and token usage.
Room join, participant binding, dispatch name, avatar track and registration stay
in the Chert starter. No connector replacement, webhook or new line is needed.

Implementation complexity: small session configuration change plus a free-plan
gate and offline tests. Expected response latency: roughly 1–3 seconds after end
of speech, a planning estimate rather than a measured result or SLA. Model,
network, endpointing and FaceTime bridge latency all matter. Chert's first-audio
deadline is still 10 seconds after bridge_ready; a real call must verify this.

- [Inference authentication and model support](https://docs.livekit.io/agents/models/inference/)
- [Flux speech support](https://docs.livekit.io/agents/models/stt/deepgram/)
- [Sonic 3 inference and example voice ID](https://docs.livekit.io/agents/models/tts/cartesia/)
- [Chert video contract](https://docs.trychert.com/facetime-cli/video)

## Gemini image verification, later

Gemini 2.5 Flash-Lite currently lists free text/image/video input and free text
output. Paid reference rates are $0.10/million input tokens and $0.40/million
output tokens (not a proposal to enable billing). Its standard model can inspect
images and return verification text; an image-generation model is unnecessary.

Free-tier access does not require a paid billing account. Some free projects or
accounts need mobile device verification; this can be done without enabling
billing. Exact active RPM, TPM and RPD depend on the project and must be read from
AI Studio's rate-limit dashboard. The public page does not guarantee one numeric
free quota for this model, so none is invented here. Exhaustion must stop/defer
verification; never upgrade billing automatically. Free-tier content may be used
to improve Google's products. No image calls or Gemini implementation were added.

- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Project-specific active quotas](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Free-tier device verification](https://ai.google.dev/gemini-api/docs/verification)
- [Free versus paid billing](https://ai.google.dev/gemini-api/docs/billing)

## Local alternative if included inference cannot be used

Whisper.cpp STT + a small Qwen3 model served by Ollama + Piper TTS can avoid
API spending without adding another cloud provider. Software/model downloads and
compute/storage are required; model licenses must be reviewed for chosen assets.
No subscription or payment details are needed for local inference. None of these
runtimes is currently installed here. Chert/LiveKit transport would still be used.

This path requires adapters for audio chunking, endpointing, transcription,
streamed generation and PCM synthesis, plus shutdown/interruption handling. It is
materially more work than the installed inference adapters. CPU latency could be
several seconds or longer per turn; hardware benchmarking is necessary before
promising a FaceTime conversation. Use included credits first if available.

- [Whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Qwen3 4B on Ollama](https://ollama.com/library/qwen3:4b)
- [Piper local TTS](https://github.com/OHF-Voice/piper1-gpl)

## What has actually been tested

Offline provider/session construction with dummy credentials, free-plan gating,
streaming capability flags, Flux endpointing compatibility, and Chert greeting
readiness, exactly-once firing and cancellation. No network inference, real
transcription, synthesized speech, private credit balance or real call has been
validated. These tests verify the integration plumbing, not speech quality.

No credits bought, billing enabled, credentials replaced, line reallocated,
Gemini/game logic implemented, or ElevenLabs/Groq service added.
