# Intentional local Part B patches

## Current: support-contact-v2

Authoritative source: `jieCheong/Reality.exe`, branch `Shivam`, directory `backend/`,
pinned commit `e62ed3db09f406bfd6854b9db97e2273bcc24e1d`.
Only integrated vendored copies were changed. Upstream and teammate files were not edited.

`UPSTREAM.json.files` records SHA-256 hashes of those exact upstream Git blobs.
`local_patches` records each installed difference, its upstream and integrated
hashes, and the review-patch hash. A new local test has null upstream hash.
Schemas/service now include upstream `model_satisfied` and `boxes` diagnostics;
model.py, frame handling, voting and initialization files match the pinned source.

Compatible upstream behavior retained:
- Explicit top/bottom prompt, minimum 30% top-object horizontal overlap, reversed-stack veto.
- LEFT_OF requires center separation of 30 and vetoes >60% horizontal overlap
  of the narrower box, preventing stacked objects from passing as side by side.
- Original confidence >=0.7, two-of-three voting and model-NO behavior.

Local conservative ON_TOP_OF policy is an ADDITIONAL veto after upstream geometry.
Both boxes must be visible, present, normalized [ymin,xmin,ymax,xmax], four integer
coordinates (not booleans), with positive extent and coordinates in 0–1000.
The upper center must be above the lower center, horizontal overlap positive, and:

```
abs(upper.ymax - lower.ymin) <= min(20, 0.10 * min(upper.height, lower.height))
```

This preserves support-contact-v1 safety. Upstream `stacking_veto()` remains
unchanged, including its top-down acceptance, but installed `geometry_veto()` adds
this strict contact policy. Flat objects fully inside the support's projected box
can therefore be rejected. No geometric rule proves physical support or excludes
an unseen hand. Perspective and detection noise can cause false negatives.

Two upstream integration fixtures are deliberately adjusted from 50-unit vertical
penetration to edge contact. Upstream helper tests remain intact. The existing
42 local support regressions are retained; extra integration tests live outside
vendor in `test_selective_integration.py`.

HIDDEN/SHOW enum/prompt code arrives with the upstream files, but remains disabled
by the existing routine contract/capability gate. The bridge was NOT expanded to
support these tasks. No claim of end-to-end support is made.

`patches/support-contact-v2.patch` is the current reviewable diff against the pinned
backend. From a clean copy of that upstream commit, Shivam can review with:

```bash
git apply --check /path/to/support-contact-v2.patch
```

`support-contact-v1.patch` is retained only as a historical artifact against the
previous ZIP baseline; do not apply it to the current baseline. Current provenance
tests check v2. Do not replace baseline hashes with installed hashes to hide drift.

Offline verification:

```bash
python3 vision-service/verify_provenance.py
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service
```

Timing limits, provider opt-in, no-retry GroqOnlyVision transport, credential
handling and response sanitization are preserved. See LOCAL-GROQ-GAMEPLAY.md for
latency findings and controlled-image replay restrictions.
