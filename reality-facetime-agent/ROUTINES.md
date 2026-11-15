# Kids' routines: morning, night, lives and the time monster

## Run it

```bash
# .env.local
ENABLE_GAME=yes
ROUTINE_MORNING_FILE=examples/routines/kids-morning.json
ROUTINE_NIGHT_FILE=examples/routines/kids-night.json
HUD_VIDEO_PROFILE=juan-themes-rotated-ccw   # Juan's 3 worlds, upright full-screen; try -cw if upside down
```

On the call ORBIT says *"Say good morning … or good night …"*. The child's greeting picks the routine.
With only one routine file set (or `ROUTINE_FILE`), it starts right away.

With a `juan-themes*` profile, ORBIT then asks *"Pick your world! Say one for Space, two for Odyssey, or three
for Backrooms."* The child can also answer both at once: *"Good morning, space!"*. Profiles without
`juan-themes` keep the original single HUD and skip the world question.

## Parent editor

```bash
npm run editor        # http://127.0.0.1:8787  (local only)
```

Edit steps, times, lives and the monster timer, or use the quick-add templates. Saves are checked by the
same validator the agent uses (`routine-contract.mjs`). Restart the agent to pick up changes.

## Rules

- Each step has its own time (`seconds`, 10–900). With `monsterSeconds` (default 25) left, the monster
  appears on the HUD, ORBIT warns once, and the monster grows as time runs out.
- A step that times out costs a life (`lives`, default 3). At 0 lives the mission ends as **unsuccessful**;
  the parent report records `outcome: "failed"` and `livesLeft`.
- A conclusive "not done" check still takes 5 s off the clock (`fakeDonePenaltySeconds`).
- At most 12 steps per routine (what the HUD can draw).

## Checks a step can use

| check | argument | passes when |
|---|---|---|
| `DOING` | an action, e.g. `brushing their teeth` | the child is visible and doing it |
| `SHOW` | an item, e.g. `lunchbox` | that kind of item is clearly shown |
| `HELD_UP` | an item | it is held up off any surface |
| `ON_TOP_OF` | two items | the first rests on the second (B1 geometry) |

Arguments for `DOING`/`SHOW` are lowercase letters, spaces and hyphens, up to 31 characters.
Every check still needs 2 of 3 frames to agree, and 2 passing rounds in a row, before a step is done.

## HUD profiles (`HUD_VIDEO_PROFILE`)

| profile | what it shows |
|---|---|
| `juan-themes-rotated-ccw` / `-cw` | Juan's 3 worlds, quarter-turned for upright full-screen FaceTime (recommended) |
| `juan-themes` | Juan's 3 worlds, portrait 540x1170 |
| `rotated-ccw` / `rotated-cw` | step-rail HUD with hearts and monster, quarter-turned |
| `default` | step-rail HUD, portrait 540x960 |
| `routine-game` | Jie's routine game HUD, portrait 540x960 |
| `juan-original` | Juan's Space art for routines, portrait 540x1170 |
| `landscape-test` | step-rail HUD, 640x360 |
