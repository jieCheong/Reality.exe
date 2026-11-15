Reality.exe 🛸

FaceTime a coach that turns your kid's morning and bedtime routine into a game. Their room is the level. The camera is the controller.

Reality.exe is a FaceTime routine coach for kids who struggle to get through their routines, including many kids with ADHD. Your child FaceTimes ORBIT, says "good morning" or "good night", and picks a world to play in. ORBIT then walks them through each step: brush your teeth, pack your lunch, put on your pajamas. It watches through the camera and only counts a step once it actually sees it done. If the clock runs low, a monster shows up and gets closer.

No app. No signup. Just a FaceTime call.

Built for HackUTA 2026 (UT Arlington, Nov 14-15) for the Chert sponsor challenge: Best Use of FaceTime.

✨ Why Reality.exe?

Morning and bedtime routines are a daily fight in a lot of homes. Kids lose track of what comes next, drift off mid-task, or say "done" when they aren't. Parents end up repeating the same reminders every day. Checklists and sticker charts help, but nothing checks whether a step really happened.

Reality.exe closes that loop:

The AI gives one clear step at a time
Your child does it in the real world
The AI verifies it through live video
The game reacts: a step clock, a monster that closes in, three lives, and a celebration at the end

A voice assistant or a checklist app can't do this. The camera is the input device, and FaceTime is what carries it.

Reality.exe is:

Zero-install: any iPhone with FaceTime can play
Parent-built: parents choose the steps, time limits, lives and the monster timer
Verified: every checked step is backed by an evidence frame and a reason
Honest: a deterministic engine decides progress, not a language model guessing, and saying "done" never counts by itself
🎮 How a Run Works
Call: your child FaceTimes the ORBIT line.
Greet: "Good morning" starts the morning routine; "good night" starts the bedtime routine.
Pick a world: "One" for Space, "two" for Odyssey, "three" for Backrooms. Saying "Good morning, space!" answers both at once.
Missions: ORBIT gives one step at a time, each with its own time limit (45-90 s).
Verify: the camera checks the step. It counts only after two passing rounds in a row, with 2 of 3 frames agreeing in each.
The monster: with 25 seconds left, the monster appears on screen and ORBIT warns "Hurry!" It grows as time runs out. Running out of time costs one of three lives.
Finish: complete the routine for a celebration, or lose all three lives and get a gentle "try again next time". Parents get a report with the evidence frame for each checked step.

Say "done" without doing it, and ORBIT will say it doesn't see it yet, and take 5 seconds off the clock.

🧩 Features
1️⃣ FaceTime Coach (ORBIT)
An AI coach on a FaceTime line with a friendly, consistent persona
Short spoken instructions with the current step always stated
Voice controls: "repeat", "help", "pause", "resume", "done"
2️⃣ Morning and Night Routines
Morning (8 steps): fold your bedsheets, brush your teeth, wash your face, brush your hair, drink water, eat breakfast, pack your lunch, put on your shoes
Night (7 steps): put your toys away, put on pajamas, wash your face and skin care, brush your teeth, pack your bag, lay out tomorrow's clothes, read a book
The greeting picks the routine; no menus to navigate
3️⃣ Vision Verification Loop
Samples frames from the call and asks a multimodal model one narrow question per check
Returns structured results: satisfied, confidence, evidence, correction_hint
Requires agreement across frames and across two rounds before a step counts
Geometry checks can veto a model "yes"; they never turn a "no" into a pass

Supported checks:

Check	Example
DOING(action)	Brushing their teeth, reading a book (the child must be visible)
SHOW(item)	Show the packed lunchbox or the folded blanket
HELD_UP(X)	Hold your shoes up to the camera
ON_TOP_OF(A, B)	Put the lunchbox on top of the backpack
LEFT_OF(A, B)	Place one item left of another
ORDER_LEFT_TO_RIGHT([A, B, C])	Line up three items in order
COVERED(X)	Cover an item with your hand
4️⃣ Deterministic Game Engine
Per-step time limits, a 5-second penalty for a "done" claim that doesn't check out, and three lives
The time monster appears in the last 25 seconds of a step and grows as time runs out
The engine alone decides when a step is complete, missed or the mission is over
Unit-tested independently of any AI call
5️⃣ Three Themed Worlds
Space, Odyssey and Backrooms, drawn by Juan with original art
Each world shows the current mission, time left, hearts, the monster and a mission tracker
On-screen status while checking: "Checking your mission…", "One check done. Hold still.", "Let me take another look."
Sent as a full-screen video track, pre-rotated so it shows upright on a portrait iPhone
6️⃣ Parent Routine Editor
A local page (npm run editor) to edit the morning and night routines
Add, remove and reorder steps; set times, lives and the monster timer; quick-add common tasks
Every save is checked by the same validator the agent uses, so a broken routine never reaches a call
7️⃣ Parent Report
End-of-routine summary: which steps were checked or missed, time per step, lives left and the outcome
An evidence frame for each verified step
🌱 Stretch Goals
Minimum time per task: require brushing to be seen across a full two minutes, not just two checks
iMessage Report: send the parent report after the call
Weekly Progress: streaks and a weekly summary for parents
Agent-Initiated Calls: ORBIT calls at the scheduled routine time
More Worlds and Monsters: new themes kids can unlock by finishing routines
🏗️ Architecture
Child's iPhone ⇄ FaceTime ⇄ Chert line ⇄ LiveKit room
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     │ ORBIT agent (Node)                           │
                     │  • voice: speech-to-text + scripted speech   │
                     │  • routine engine (steps, clock, lives)      │
                     │  • HUD renderer → outgoing video track       │
                     └──────────────────────┬───────────────────────┘
                                frames      │ verdicts
                                            ▼
                     Vision bridge (Python, local only, port 8765)
                       perception: voting, geometry vetoes
                                            │
                                            ▼
                          Groq multimodal model (qwen/qwen3.8-27b)
Modules
Module	Responsibility
Agent (reality-facetime-agent/agent.mjs)	Joins the call, handles speech, wires everything together
Routine session	Greeting and world selection, voice commands; spoken claims never advance a step
Routine engine	Steps, per-step clock, penalties, lives, monster, outcome and report
Game runtime	Samples fresh camera frames, calls the vision bridge, applies verdicts to the engine
HUD	Draws the themed worlds or the step-rail HUD and publishes it as video
Vision bridge (vision-service/)	Validates requests, runs perception on frames, fails closed
Perception (backend/app/perception/)	Prompts, multi-frame voting, geometry vetoes; vendored into the bridge with hash-checked provenance
Eval (backend/eval/)	Labeled cases from video, accuracy and false-positive measurement
Parent editor	Local page and server for editing routine files
Verification Contract
json
{
  "satisfied": true,
  "confidence": 0.91,
  "objects_seen": ["child"],
  "evidence": "child is holding a toothbrush in their mouth and brushing",
  "correction_hint": null,
  "predicate": "DOING(brushing their teeth)",
  "votes_for": 3,
  "votes_total": 3
}
🛠️ Tech Stack

Agent and HUD

Node.js
LiveKit Agents (voice, video tracks)
@napi-rs/canvas (HUD rendering)
TypeScript type contracts

Vision

Python
Pydantic
Groq (qwen/qwen3.8-27b); a Gemini adapter is also available

Integrations

Chert (FaceTime line)
LiveKit (room, speech-to-text, text-to-speech)

Tools

GitHub
VS Code
node:test and pytest
🚀 Getting Started
Prerequisites
Node.js 22+
Python 3.10+
Chert CLI with a FaceTime line
A LiveKit project (free Build plan)
A Groq API key
Environment

Create reality-facetime-agent/.env.local (never commit it):

LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_FREE_BUILD_CONFIRMED=yes
AGENT_NAME=reality-facetime-agent
ENABLE_GAME=yes
VISION_MODE=groq
VISION_SERVICE_URL=http://127.0.0.1:8765
ROUTINE_MORNING_FILE=examples/routines/kids-morning.json
ROUTINE_NIGHT_FILE=examples/routines/kids-night.json
HUD_VIDEO_PROFILE=juan-themes-rotated-ccw

If the HUD shows upside down on the phone, switch to juan-themes-rotated-cw. Other layouts are listed in reality-facetime-agent/ROUTINES.md.

Run the vision bridge (terminal A)
bash
cd reality-facetime-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r vision-service/requirements.txt
export GROQ_API_KEY=your_key
python vision-service/bridge.py --provider groq --allow-provider-calls
Run the agent (terminal B)
bash
cd reality-facetime-agent
npm install
npm start
Connect the FaceTime line (terminal C)
bash
cd reality-facetime-agent
chert dev --agent reality-facetime-agent

Wait for the waiting room, then FaceTime the Chert line and say "good morning".

Edit routines
bash
cd reality-facetime-agent
npm run editor        # http://127.0.0.1:8787

Restart the agent after saving to pick up the changes.

Run the tests
bash
cd reality-facetime-agent
npm run check && npm run check:types && npm test
npm run test:routine:e2e
python3 vision-service/verify_provenance.py
python3 -m pytest -q vision-service

cd ../backend
pytest
📁 Project Structure
Reality.exe/
├── backend/
│   ├── app/perception/        # Prompts, voting, geometry vetoes, model adapters
│   ├── eval/                  # Dataset builder, labeled cases, accuracy script
│   └── tests/
└── reality-facetime-agent/
    ├── agent.mjs              # Call entry point
    ├── routine-*.mjs          # Contract, engine, session, report, presentation
    ├── game-runtime.mjs       # Frames → vision bridge → engine
    ├── spaceship-face.mjs     # HUD router and step-rail HUD
    ├── juan-hud/              # Juan's themed worlds (art pinned by hash)
    ├── juan-theme-hud.mjs     # Routine overlay on the themed worlds
    ├── monster.mjs            # Time monster and hearts
    ├── parent-editor/         # Parent routine editor page
    ├── examples/routines/     # kids-morning.json, kids-night.json
    └── vision-service/        # Python bridge + vendored perception
🗺️ Development Timeline (24 Hours)
Phase	Hours	Goal
Spike	0-2	Chert line, LiveKit room, voice and outgoing video working
Vertical Slice	2-6	One check end to end: call → frames → verify → speech → HUD
Perception	6-12	Predicates, voting, geometry vetoes, eval harness on real video
Pivot	12-16	From escape game to kids' routine coach: routines, timer, lives, monster
Polish	16-22	Themed worlds, greeting and world selection, parent editor, full-screen video
Freeze	Last 2 hrs	Merge, full test run, rehearsal
🚧 Roadblocks & Solutions
1️⃣ Vision Reliability

Judging an action from a few frames can be wrong, and a flickering verdict ruins the game.

Solution:

Ask one narrow question per check, from a small set of checks
Require 2 of 3 frames to agree, at confidence 0.7 or higher, in two rounds in a row
Fail closed: no clear answer means not verified
Measured on a labeled set from real video: 81.1% accuracy with a 7.7% false-positive rate (37 desk-object cases). Routine actions are next to be measured.
2️⃣ Free-Tier Limits

Groq's free tier allows about 30 requests a minute and 1,000 a day, and a full routine uses roughly 50.

Solution:

Check only fresh frames, and only while a step is active
Pause checks while ORBIT is speaking
Retry on the next check after an error, and never count an error as a pass
3️⃣ FaceTime Video Sizing

FaceTime showed the portrait HUD sideways and small on a portrait phone.

Solution:

Draw the HUD in portrait and send it pre-rotated a quarter turn, so the phone's own rotation shows it upright and full-screen
4️⃣ LLM Over-Trust

A model deciding progress on its own is unpredictable, and kids will claim "done".

Solution: The model answers one question per check. The deterministic engine owns steps, timers, lives and the outcome. Spoken "done" only triggers a check, and a failed check costs time.

5️⃣ Privacy

The product processes live video of a child at home.

Solution:

ORBIT says at the start of the call that the camera is used to check steps, and a parent should be present
Frames are not retained beyond the session
Only the evidence frame for each verified step is kept, for the parent report
The parent editor runs locally only
🔮 Beyond Routines

Reality.exe's core is a loop that checks whether a physical task was actually done. The same engine could support therapy homework, chore charts, medication reminders for older kids, guided assembly, or step-by-step training. Routines for kids are where it helps most right away.
