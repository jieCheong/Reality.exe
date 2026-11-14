# Reality.exe 🛸

**FaceTime an AI game master. Your room is the game. Your camera is the controller.**

Reality.exe is a real-time, vision-verified escape game that runs over FaceTime. Call a number, show the AI a few objects from your desk, and it turns them into parts of a spaceship. Then it gives you physical missions, watches through your camera, and tells you whether you actually pulled them off.

No app. No signup. Just a FaceTime call.

> Built for **HackUTA 2026** (UT Arlington, Nov 14-15) for the Chert sponsor challenge: **Best Use of FaceTime**.

---

## ✨ Why Reality.exe?

Most "AI that can see" demos stop at describing an image. You show something, the AI talks about it. Reality.exe closes the loop:

- The AI **issues physical commands**
- You **carry them out** in the real world
- The AI **verifies the result** through live video
- The game **reacts**, coaching near-misses and refusing fake "done" claims

A voice call or a text chat cannot do this. The camera is the input device, and FaceTime is what carries it.

Reality.exe is:

- **Zero-install:** any iPhone with FaceTime can play
- **Improvised:** it works with *your* objects, not a scripted set
- **Verified:** every success is backed by an evidence frame and a reason
- **Honest:** a deterministic game engine decides state, not a language model guessing

The game is the stress test for something bigger: an AI that can check whether a physical task was actually done.

---

## 🎮 How a Run Works

1. **Call:** FaceTime the Reality.exe agent.
2. **Scan:** Show 3 objects. The AI names what it sees and assigns roles (bottle → reactor, notebook → control panel, pen → access key).
3. **Mission 1, Restore Power:** Put the reactor on top of the control panel. The AI checks, then lights up the ship.
4. **Mission 2, Unlock Security:** Hold the access key up to the camera.
5. **Mission 3, Open the Portal:** Arrange all three objects left to right in the order the AI names.
6. **Escape:** The portal opens, and you get a mission report with evidence frames.

Say "done" without doing it, and the AI will tell you it doesn't see it.

---

## 🧩 MVP Features

### 1️⃣ FaceTime Game Master
- An AI agent on a FaceTime line with a consistent game-master persona
- Short, spoken instructions with the current mission always stated
- Natural coaching: encouragement, hints, and playful rejection

### 2️⃣ Live Object Scan and Role Assignment
- Identifies the objects the player shows
- Assigns fictional ship roles based on what is actually present
- Never requires a fixed set of objects

### 3️⃣ Vision Verification Loop
- Samples frames from the call and asks a multimodal model to check a mission predicate
- Returns structured results: `satisfied`, `confidence`, `evidence`, `correction_hint`
- Requires agreement across multiple frames before declaring success

Supported predicates (v1):

| Predicate | Example |
|---|---|
| `ON_TOP_OF(A, B)` | Reactor on the control panel |
| `HELD_UP(X)` | Show the access key to the camera |
| `LEFT_OF(A, B)` | Place the key left of the panel |
| `ORDER_LEFT_TO_RIGHT([A, B, C])` | Line up all three in a named order |
| `COVERED(X)` | Cover the sensor with your hand |

### 4️⃣ Deterministic Game Engine
- State machine: `SCAN → ASSIGN_ROLES → MISSION[PENDING → COACHING → VERIFIED] → ESCAPE`
- The engine decides when a mission is complete
- Timers and hint escalation: nudge, specific correction, easier variant
- Unit-tested independently of any AI call

### 5️⃣ Live Dashboard
- The latest evidence frame with labeled objects
- Confidence meter and the model's one-line reason
- Animated ship systems (reactor, security, portal)
- Mission log with attempts, verdicts, and hints

### 6️⃣ Mission Report
- End-of-run summary with verified evidence frames and timings

---

## 🌱 Stretch Goals

- **iMessage Mission Report:** send the evidence report to the player after the call
- **Agent-Initiated Calls:** the agent calls the player back to start the next mission
- **Body Mission:** a "human key" finale (hold a pose for three seconds)
- **Difficulty Modes:** harder predicates and tighter timers
- **Replay View:** step through a finished run frame by frame

---

## 🏗️ Architecture

```
Player iPhone ⇄ FaceTime ⇄ Chert line (game-master agent)
                              │ frames            ▲ speech / instructions
                              ▼                   │
                      FastAPI backend ──→ Multimodal model (inventory, verify)
                              │
                      Game engine (state machine, timers, hints)
                              │ WebSocket
                              ▼
                      Next.js dashboard (evidence, ship systems, log)
```

### Backend Modules

| Module | Responsibility |
|---|---|
| **Chert adapter** | Receives call frames and events, sends instructions to the agent. Isolated behind an interface so the integration strategy can change. |
| **Perception service** | Frame sampling, model calls, multi-frame voting, stability checks |
| **Game engine** | Session state, missions, timers, hint escalation |
| **Realtime gateway** | Pushes events to the dashboard over WebSocket |

### Event Stream (backend → dashboard)

`scan_result` · `roles_assigned` · `mission_started` · `verification_attempt` · `mission_verified` · `hint_issued` · `game_won`

### Verification Contract

```json
{
  "satisfied": true,
  "confidence": 0.86,
  "objects_seen": ["bottle", "notebook", "pen"],
  "evidence": "bottle base resting on notebook cover, no table contact",
  "correction_hint": null
}
```

---

## 🛠️ Tech Stack

**Frontend**
- Next.js
- React
- TypeScript
- Tailwind CSS
- WebSocket client

**Backend**
- Python
- FastAPI
- WebSockets
- In-memory session state with JSON export

**AI and Integrations**
- Chert (FaceTime agent line)
- Gemini multimodal API (object inventory and predicate verification)

**Tools**
- GitHub
- VS Code
- pytest

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Chert access for the FaceTime agent (hackathon credentials)
- A Gemini API key

### Environment

Create `backend/.env`:

```
GEMINI_API_KEY=your_key
CHERT_API_KEY=your_key
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

### Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Run the dashboard

```bash
cd frontend
npm install
npm run dev
```

### Run the tests

```bash
cd backend
pytest
```

---

## 📁 Project Structure

```
reality-exe/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, routes, WebSocket
│   │   ├── chert_adapter/   # Chert integration behind an interface
│   │   ├── perception/      # Sampling, model calls, voting
│   │   ├── engine/          # State machine, missions, hints
│   │   └── models.py        # Session, Mission, Attempt
│   ├── eval/                # Labeled test images and accuracy script
│   └── tests/
└── frontend/
    └── src/                 # Dashboard, evidence panel, ship systems
```

---

## 🗺️ Development Timeline (24 Hours)

| Phase | Hours | Goal |
|---|---|---|
| **Spike** | 0-1.5 | Confirm what Chert exposes (frames, instruction injection, latency). Repo and interfaces. |
| **Vertical Slice** | 1.5-6 | One mission end to end: call → frame → verify → speech → dashboard |
| **Build Out** | 6-12 | Object scan and role assignment, missions 2 and 3, hint escalation, anti-cheat |
| **Reliability** | 12-16 | Labeled test set, accuracy measurement, threshold tuning, lighting and clutter tests |
| **Polish** | 14-20 | Ship-system animations, mission report, rehearsals, backup demo video |
| **Freeze** | Last 2 hrs | Code freeze, final rehearsal |

---

## 🚧 Roadblocks & Possible Solutions

### 1️⃣ Chert Integration Surface
What the FaceTime integration exposes (incoming frames, instruction injection, outgoing video) determines the architecture.

**Solution:**
Verify first. The Chert adapter sits behind an interface with interchangeable strategies:
- **Frames out, instructions in:** full backend verification pipeline
- **Agent-as-judge:** the agent emits structured markers that the engine consumes
- **Degraded mode:** voice-led game with a simpler dashboard

### 2️⃣ Vision Reliability
Spatial judgments from a few frames can be wrong, and flickering results ruin a demo.

**Solution:**
- Restrict missions to a small predicate vocabulary that vision handles well
- Require agreement across multiple frames and a stable verdict
- Fail closed: low confidence means not verified
- Measure accuracy on a labeled test set and report the real number

### 3️⃣ Latency
A slow loop makes the game feel broken.

**Solution:**
- Downscale frames and sample sparingly
- Cache the object inventory so checks only evaluate the predicate
- Have the agent give a short stalling line while verification runs
- Track per-step timing in a debug panel

### 4️⃣ LLM Over-Trust
A model deciding game state by itself is unpredictable.

**Solution:**
The LLM proposes flavor and answers one narrow question per check. The deterministic engine owns state, timers, and win conditions.

### 5️⃣ Privacy
The product processes live video of a person's surroundings.

**Solution:**
- Announce at the start of the call that video is analyzed during the game
- Do not retain frames beyond the session
- Keep only the evidence frames needed for the mission report, in memory

---

## 🔮 Beyond the Game

Reality.exe's core is a loop that asks whether a physical task was actually done. The same engine could power guided assembly, training and onboarding, chore verification, or step-by-step support. The game is the fastest way to stress-test it.

---

