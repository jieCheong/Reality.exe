# Reality.exe — judge-facing presentation

## 20-second opening pitch

Reality.exe turns a familiar FaceTime check-in into a calm, visual morning-routine
coach. A child sees one clear next step, while a deterministic game engine waits
for fresh visual evidence before showing progress. The system can confirm visible
objects and arrangements; it does not claim to know whether an unseen activity,
such as brushing teeth, was completed.

## 60-second product explanation

Many morning routines require several small actions to be remembered and started.
Reality.exe is designed to make those actions visible and sequential: show a
toothbrush, put shoes on a backpack, then place the backpack to the left of the
shoes. An adult selects the routine, and the child receives concise spoken
instructions, a countdown, and a portrait mission HUD over the intended FaceTime
experience.

The camera evidence travels through a bounded local vision bridge. The model
judges one visible condition at a time; code validates its structured response
and applies conservative geometry checks. The routine engine—not the model or a
spoken "done"—owns progression. It requires fresh independent observations,
rejects stale or malformed results, and reports missed steps honestly.

The offline backup demo runs those same engine transitions with explicitly
simulated perception. It is not a live recognition or FaceTime demonstration.

## Two-minute demo narration

**0:00–0:20 — Frame the problem**

“A multi-step routine can be hard to start and keep track of. We designed
Reality.exe to turn it into one visible next action at a time, with an adult
present and a familiar video-call workflow.”

**0:20–0:40 — Set expectations**

“This screen is our offline simulation. Its images are rendered from the actual
routine engine, but the camera and perception answers are scripted. No child
footage, live Groq result, or FaceTime call is part of this backup demo.”

**0:40–1:10 — Show the steps**

“The routine begins by identifying the objects. Then it asks the child to show a
toothbrush, place shoes on a backpack, and put the backpack to the left of the
shoes in the camera image. Each card shows the current instruction and timer.
The visible progress indicator reflects resolved steps, not an assumed overall
win.”

**1:10–1:35 — Explain evidence and safety**

“The engine only progresses after independent fresh observations meet its
thresholds. A model response is treated as untrusted input. For example, an
‘on top’ answer can be vetoed when the boxes show a clear air gap. Stale,
uncertain, malformed, or timed-out evidence does not become success. The
system can confirm a toothbrush was shown; it cannot verify that teeth were
thoroughly brushed.”

**1:35–1:50 — Show retry and honest completion**

“Here the simulation demonstrates retry and uncertainty, then a missed step.
The final partial result remains two of three. A separate happy-path simulation
shows three of three, with a matching engine-generated report. These are two
different mock runs, not one edited success.”

**1:50–2:00 — Close**

“The next validation gate is a controlled, adult-supervised live test: confirm
the receiving Mac and Chert line are available, obtain consent for any image
sent to Groq, then verify the phone’s orientation and the three object
relationships. Those real-world checks remain outstanding.”

## Problem and solution

- **Problem:** A sequence of small actions can be difficult to initiate, order,
  and track during a busy morning.
- **Solution:** A parent-selected routine presents one concise action at a time,
  gives spoken feedback, and records verified, missed, or unresolved steps.
- **Boundary:** This is a routine-coaching prototype, not a medical product. It
  does not diagnose or treat ADHD and does not infer invisible actions.

## Why FaceTime

FaceTime is the intended familiar remote check-in channel: the child can use a
phone already available at home while an adult remains present. Chert is intended
to bridge the incoming caller camera to the agent. The integration is designed
around that workflow, but a successful live call and actual iPhone presentation
have **not** been verified in this sprint.

## High-level architecture

1. Chert-managed FaceTime camera track enters the LiveKit agent.
2. `CallerVideoAdapter` keeps only the selected remote video track and stamps
   copied frames with a local receipt time and track generation.
3. `GameRuntime` selects fresh frames, encodes JPEG, and sends a bounded request
   to the IPv4-loopback Python vision bridge.
4. The bridge validates the request, checks frame integrity/independence, and
   invokes the selected perception implementation. In live mode, selected frames
   are sent to Groq; in offline tests, the explicit mock model returns fixtures.
5. `RoutineMissionEngine` validates evidence and owns scan, timer, pause, retry,
   miss, and completion transitions.
6. Serialized speech and the portrait HUD render the same authoritative state.
   The outgoing HUD uses the existing LiveKit video publication path.
7. A local atomic report records resolved steps and accepted evidence. It is not
   uploaded as a report by the application.

## Why deterministic routine state matters

The language/vision model is not authorized to change the mission or declare a
win. A state machine makes timers, pause reasons, stale-frame rejection,
independent confirmation rounds, retries, and final counts reproducible. It also
prevents delayed results from an earlier mission from advancing a later one.

## Technical challenges and current solutions

- **Stale/delayed evidence:** frame age, generation, epoch, revision, and deadline
  are checked before accepting a result; tests include a delayed stale response.
- **False positives for physical relationships:** model judgments are combined
  with conservative box-geometry vetoes; geometry can reject a pass, never create
  one.
- **Camera and narration pauses:** pause reasons compose, so camera recovery or
  narration completion cannot release a manual or voice-failure pause.
- **Malformed model output:** strict verdict shape checks fail closed without
  progression or a child penalty.
- **Save/cleanup failures:** report retries are bounded and atomic; session
  cleanup continues if speech shutdown fails.
- **Visual clarity:** the opt-in routine HUD is rendered at 540×960 RGBA/15 FPS;
  layout bounds and native publisher geometry are covered by offline tests.

## Implemented versus simulated

**Implemented and verified offline**

- Routine contract validation, deterministic mission progression, pause/timer
  semantics, speech sequencing, local report writing, the portrait renderer, and
  loopback vision request/response validation.
- Offline image/schema/geometry tests and mock HTTP end-to-end paths.
- A new judge-facing backup with 16 real renderer snapshots and actual engine
  transitions, visibly labeled as mock.

**Simulated or not yet verified**

- The final demo’s camera, perception verdicts, and speech are scripted.
- Real Groq object recognition and timing have not been tested.
- Chert line availability, incoming FaceTime video, real audio, and full live
  routine progression have not been verified.
- iPhone orientation, crop, safe areas, and FaceTime control overlap have not
  been measured.

## Limitations and future improvements

- Test the exact three morning predicates with independent, controlled photos
  before relying on live recognition.
- Measure current provider latency before any live routine; do not widen freshness
  windows or request timeouts to mask slow results.
- Verify portrait delivery and control overlap on the actual iPhone/FaceTime path.
- Add parent-facing routine setup and consent flows before treating the prototype
  as a household-ready product.
- Continue evaluating false-pass behavior on independent negative examples.

## Likely judge questions

**1. Does this diagnose or treat ADHD?**  
No. It is a routine-coaching prototype and makes no diagnostic or treatment claim.

**2. What does the vision system actually verify?**  
Only the visible condition in a frame, such as a named object being held up or
one object appearing on top of another. Showing a toothbrush is not proof that
teeth were brushed.

**3. Is the demo using real FaceTime and Groq?**  
The backup demo is explicitly simulated. Real Groq recognition, a successful
Chert/FaceTime call, and iPhone orientation have not been verified.

**4. What happens when evidence is uncertain or slow?**  
It does not advance the routine. Freshness and request deadlines remain bounded;
the timer can expire naturally, and the report records a miss rather than
fabricating success.

**5. What happens to camera data?**  
Live vision sends selected camera frames to the configured provider and requires
separate operator approval. Routine reports are written locally; accepted
evidence images may be included in that local report. This prototype does not
claim a complete production privacy/consent workflow.
