# Perception eval results

- Date: 2026-11-14 18:29
- Model: `qwen/qwen3.8-27b`
- Decision rule: 2-of-n frames, min confidence 0.7
- Cases scored: 37 of 37 (11 positive, 26 negative)
- **Errored and excluded from scores: 0**

## Headline

| Accuracy | Precision | Recall | False-pass rate | Case latency p50 / p95 | Per-call p50 | API errors |
|---|---|---|---|---|---|---|
| **81.1%** | 75.0% | 54.5% | 7.7% | 25359 / 39646 ms | 25359 ms | 0 |

False-pass rate = negatives we wrongly verified (the 'said done but didn't do it' case). Keep this near 0; a false fail just means the player tries again.

Confusion: TP 6 · FN 5 · FP 2 · TN 24

## By predicate

| Predicate | n | Accuracy | Recall | False-pass |
|---|---|---|---|---|
| COVERED | 6 | 100.0% | n/a | 0.0% |
| HELD_UP | 6 | 100.0% | n/a | 0.0% |
| LEFT_OF | 4 | 100.0% | 100.0% | 0.0% |
| ON_TOP_OF | 15 | 66.7% | 57.1% | 25.0% |
| ORDER_LEFT_TO_RIGHT | 6 | 66.7% | 0.0% | 0.0% |

## By condition tag

| Tag | n | Accuracy | False-pass |
|---|---|---|---|
| cluttered | 34 | 79.4% | 8.3% |
| far_camera | 34 | 79.4% | 8.3% |
| good_light | 3 | 100.0% | 0.0% |
| hard_negative | 1 | 100.0% | 0.0% |
| negative | 24 | 91.7% | 8.3% |

## Threshold sweep

| min confidence | Accuracy | Recall | False-pass |
|---|---|---|---|
| 0.5 | 81.1% | 54.5% | 7.7% |
| 0.6 | 81.1% | 54.5% | 7.7% |
| 0.7 ← | 81.1% | 54.5% | 7.7% |
| 0.75 | 81.1% | 54.5% | 7.7% |
| 0.8 | 81.1% | 54.5% | 7.7% |
| 0.85 | 81.1% | 54.5% | 7.7% |
| 0.9 | 81.1% | 54.5% | 7.7% |

## Misses

| Case | Predicate | Expected | Model evidence | Geometry override |
|---|---|---|---|---|
| img_0963_1_1_s01_on_f1_on_top_of_wallet_charger | `ON_TOP_OF(wallet, charger)` | False | The white square charger is clearly resting on top of the black wallet, with the wallet's base supporting the charger. |  |
| img_0963_1_1_s02_on_f0_on_top_of_wallet_phone | `ON_TOP_OF(wallet, phone)` | False | The black wallet is clearly stacked directly on top of the smartphone, with its base resting on the phone's top surface. |  |
| img_0963_1_1_s02_on_f1_on_top_of_phone_wallet | `ON_TOP_OF(phone, wallet)` | True | Neither the phone nor the wallet is visible in the frame; the table contains a laptop, a cup, and other small items. |  |
| img_0963_1_1_s03_on_f0_on_top_of_bracelet_phone | `ON_TOP_OF(bracelet, phone)` | True | The bracelet is lying flat on the table surface next to the phone, not resting on top of it. |  |
| img_0963_1_1_s03_on_f1_on_top_of_bracelet_phone | `ON_TOP_OF(bracelet, phone)` | True | The bracelet is lying flat on the table surface to the left of the phone, not resting on top of it. |  |
| img_0963_1_1_s04_row_f0_order_left_to_right_phone_wallet_keys_watch | `ORDER_LEFT_TO_RIGHT([phone, wallet, keys, watch])` | True | The watch is not visible in the frame, so the required sequence of four objects cannot be established. |  |
| img_0963_1_1_s04_row_f1_order_left_to_right_phone_wallet_keys_watch | `ORDER_LEFT_TO_RIGHT([phone, wallet, keys, watch])` | True | The watch is not visible on the table, so the required sequence of four objects cannot be established. |  |
