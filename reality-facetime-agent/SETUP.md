> Historical setup notes below. For the current $0 voice configuration, use
> [README.md](README.md) and [COSTS.md](COSTS.md); OpenAI credentials below are no longer required.

# Phase 1B: FaceTime setup

Verified on Ubuntu as cheon. Node 24.22.3 and npm 11.19.1 resolve under
`/home/cheon/.nvm/versions/node/v24.22.3/bin`. nvm default is 24.
Chert CLI: @trychert/facetime@0.1.0-beta.19.

Official guides:
- https://docs.trychert.com/facetime-cli/quickstart
- https://docs.trychert.com/facetime-cli/video

The official `chert new reality-facetime-agent --video` starter is unchanged.
Generation used /tmp because Node copyFileSync failed with EPERM across the
Linux/Windows mount. Dependencies are installed in
`/home/cheon/.cache/reality-exe/reality-facetime-agent/node_modules` and linked
here. Keep that directory. The lockfile records the installed versions.
Project .npmrc uses public npm; the existing user AWS registry config is preserved.

## Next: user authentication and credentials

In a WSL Ubuntu terminal in this folder:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use
chert login --device
chert whoami
```

Approve the displayed code for the assigned Chert project. You need owner/admin
access and a video-enabled line. For a new account, use Chert onboarding instead:
`chert onboard --plan trial --stack demo --no-browser` (phone verification and
a real demo call require your participation).

Fill `.env.local` privately with LIVEKIT_URL, LIVEKIT_API_KEY,
LIVEKIT_API_SECRET from one LiveKit project, and OPENAI_API_KEY with Realtime
access and credits. Keep AGENT_NAME=reality-facetime-agent. If Chert supplies
LiveKit for your project, `chert livekit --json` can populate the LiveKit values
after authentication; do not use --force to overwrite existing values.
Never paste credentials into chat or commit them.

Then run `chert doctor` from this folder. In terminal A, run `npm start`.
In terminal B, select the same Node version and run
`chert dev --agent reality-facetime-agent`. Wait for the waiting agent, then
call the assigned line using FaceTime Video. Confirm two-way speech, moving
agent video, hangup cleanup, and a fresh second call. End the call, stop Chert
with Ctrl+C and wait for line release, then stop the agent.

## Validation

- npm run check: passed (all three supplied source syntax checks).
- npm run help: passed (loads the starter and LiveKit CLI).
- Linux imports of LiveKit agents, OpenAI plugin, and native rtc-node: passed.
- npm audit: 6 advisories (3 moderate, 3 high) in the official starter dependency
  tree. No automatic dependency upgrades were applied because the starter pins
  its compatible LiveKit versions. Audit details can be reproduced with npm audit.
- No test script is supplied. No authenticated or real-call test has run yet.

No Gemini or game logic has been implemented. This starter publishes an animated
face and does not yet consume the caller camera.
