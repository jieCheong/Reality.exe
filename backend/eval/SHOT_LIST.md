# Building the labeled test set (~45 min)

Target: **60–80 photos**, roughly half positive and half negative. Negatives matter
more than positives: the number judges care about is the *false-pass rate*
(we said "verified" when the player didn't do it).

## How to shoot
- Use the **same three objects you'll demo with** (e.g. bottle, notebook, pen), plus one
  spare set (mug, phone, marker) so you can show it isn't overfit.
- Prop the phone up the way it'll sit during the call (front camera, ~arm's length). Best of all,
  grab real frames from Part A's mock call once it records frames; until then, phone photos are fine.
- Drop files into `eval/data/`. Name them `<predicate>_<nn>_<pos|neg>.jpg`.
- For a few cases, take a **3-shot burst** and list all 3 in `images` to exercise 2-of-3 voting.
- **Left/right labels go by the photo as it looks on screen** (image coordinates).

## Shots per predicate (positive / negative)

| Predicate | Positives (~6 each) | Hard negatives (~6 each) |
|---|---|---|
| ON_TOP_OF(bottle, notebook) | bottle standing on notebook; lying on it; notebook at an angle | bottle **in front of** notebook (overlaps in image!); bottle **behind** it; held just above it; touching its edge on the table |
| HELD_UP(pen) | pen held up near the lens; at arm's length; in either hand | pen lying on desk; hand near pen but not lifting it; pen held below frame edge |
| LEFT_OF(pen, notebook) | clear gap; close together | reversed; stacked vertically (same x); one item missing |
| ORDER_LEFT_TO_RIGHT([pen, bottle, notebook]) | correct order, spaced; tight spacing | two swapped; reversed; one missing; all in a vertical stack |
| COVERED(pen) | palm flat over pen | hand next to pen; fingertip touching only; pen visible through gaps |

## Condition tags (add to `tags`)
`good_light`, `dim_light`, `backlit` (window behind), `cluttered` (other stuff on desk),
`hard_negative`, `spare_objects`, `burst`. The report breaks accuracy down by tag, so you can
say "94% in normal light, 78% when backlit" on stage instead of one vague number.

## Then
```bash
cd backend
python -m eval.run_eval              # writes eval/results/RESULTS.md + raw JSON
python -m eval.run_eval --from-cache eval/results/run_<ts>.json --threshold 0.8   # re-tune for free
```
Pick the threshold from the sweep table where false-pass is ~0 and recall is still OK,
then put that number in `PerceptionConfig.min_confidence`.
