# B2: routine-object clip (about 10 minutes)

Goal: one honest accuracy number on the objects the routine game will really use.

## Setup
- Objects: **toothbrush, backpack, shoes, lunchbox** (any lunchbox-sized box works).
- Prop your phone **upright, about 2 feet from the desk or floor**, front camera, the way it sits
  during a FaceTime call. Good, normal light.
- Record one video. **Say each setup out loud** as you make it ("lunchbox on backpack"), then
  **hold completely still for 4 seconds**, then move to the next one. Saying it makes the times easy
  to find afterwards.
- Left and right below mean **as the camera sees it** (left edge of the recorded video).

## Script (about 70 seconds)
| # | Say | Do | Why |
|---|---|---|---|
| 1 | "toothbrush held" | Hold the toothbrush up toward the camera | positive: HELD_UP |
| 2 | "toothbrush down" | Lay it on the desk next to the lunchbox | negative: not held |
| 3 | "lunchbox on backpack" | Lay the lunchbox on top of the backpack | positive: ON_TOP_OF |
| 4 | "lunchbox in front" | Put the lunchbox on the desk **in front of** the backpack, overlapping it in the picture | hard negative: in front, not on |
| 5 | "lunchbox above" | Hold the lunchbox a few inches **above** the backpack, not touching | hard negative: no contact |
| 6 | "toothbrush on lunchbox" | Lay the toothbrush flat on the lunchbox | positive: flat on flat |
| 7 | "row one" | Backpack, lunchbox, shoes in a row, left to right as the camera sees it | positive: order + left-of |
| 8 | "row two" | Shoes, backpack, lunchbox in a row | positive with a different order |
| 9 | "lunchbox held" | Hold the lunchbox up | positive: HELD_UP |
| 10 | "cover toothbrush" | Hand flat over the toothbrush | positive: COVERED |
| 11 | "hand near" | Hand next to the toothbrush, not on it | negative: not covered |
| 12 | "shoes by backpack" | Shoes on the floor or desk beside the backpack | negative: not on top |

Optional: repeat 3, 4 and 7 with the lights dimmed. Add `| dim` to those timeline lines.

## Then
1. AirDrop the video to your Mac.
2. Open `eval/routine_timeline.txt`, watch the video, and fix each line's start and end times to the
   still part of that setup (skip the moments you were moving things).
3. Run (from `backend/`, venv active):
   ```bash
   python -m eval.make_dataset "/path/to/video.mov" eval/routine_timeline.txt --labels eval/routine_labels.jsonl
   python -m eval.run_eval --labels eval/routine_labels.jsonl --concurrency 1 --out eval/results/routine
   ```
4. The numbers are in `eval/results/routine/RESULTS.md`. To tune geometry later without API calls:
   ```bash
   python -m eval.run_eval --from-cache eval/results/routine/run_<timestamp>.json --regeometry --out eval/results/routine
   ```
