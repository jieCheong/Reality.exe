# Intentional local Part B patches

## support-contact-v1

Authoritative upstream remains `jieCheong/Reality.exe`, branch `Shivam`, directory
`backend/`. The baseline in UPSTREAM.json was copied from Reality.exe-Shivam.zip
and matched all nine GitHub source/test blobs during the preceding read-only audit.
No upstream source, branch or teammate directory was edited for this patch.

`UPSTREAM.json.files` continues to record the ORIGINAL upstream SHA-256 values.
It does not claim patched files are identical to upstream. Schema version 2 adds
`local_patches`, with original and integrated SHA-256 values for every intentional
change, a null original hash for the new test file, and a hash of the review patch.

Only two existing vendored files differ:

- `app/perception/predicates.py`: adds support-contact guards to ON_TOP_OF only.
- `tests/test_perception.py`: adjusts two previously "valid" fixtures so the upper
  object's base actually touches the lower object's top. Their previous boxes had
  a 50-unit vertical penetration; the new conservative check correctly rejects it.

`tests/test_support_geometry.py` is a new, explicitly local vendored test file.
All other baseline vendor files remain byte-identical. Integrated bridge tests
are added outside vendor in `test_bridge.py`; bridge production code is unchanged.

### Rule and tolerance

`geometry_veto()` is called by PerceptionService._judge() only after a model says
satisfied. A reason string turns that frame's positive into a negative; None only
means geometry did not contradict the model. Geometry never promotes a model NO.

For ON_TOP_OF(A,B), boxes use `[ymin,xmin,ymax,xmax]` normalized to 0–1000, with Y
increasing downward. Both objects must be visible. Both boxes must be present,
contain four integer coordinates (not booleans), be in range, and have positive
width and height. Their horizontal overlap must be strictly positive, as before.
A's center must be above B's center. Finally:

```
abs(A.ymax - B.ymin) <= min(20, 0.10 * min(A.height, B.height))
```

This permits small detection gaps/penetrations, at most 2% of image height and
at most 10% of the smaller object's detected height. The limit is inclusive. For
200-unit boxes the tolerance is 20; for a 50-unit object it is 5. Clear separation,
deep overlap, reversed vertical order, missing boxes and malformed boxes fail.

These thresholds are conservative engineering bounds, not calibrated recognition
accuracy. Perspective, occlusion and angled surfaces may produce false negatives.
2D boxes cannot prove support or exclude an unseen hand; the existing physical-
support prompt/model judgment remains necessary. No physical accuracy claim is
made from synthetic tests. Live calibration remains separate work.

Confidence >=0.7, two-of-three voting, two consecutive rounds, timestamps,
receipts, freshness, API timeouts, schemas and game progression are unchanged.
No Groq, HUD, voice, theme, Chert or mission-engine implementation was modified.

### Offline verification

From `reality-facetime-agent/`:

```bash
python3 vision-service/verify_provenance.py
PYTHONDONTWRITEBYTECODE=1 /tmp/reality-vision-venv/bin/python -m pytest -q -p no:cacheprovider vision-service/test_bridge.py vision-service/test_provenance.py vision-service/vendor/tests
npm run check
npm run check:types
npm test
VISION_PYTHON=/tmp/reality-vision-venv/bin/python npm run test:game:e2e
```

The provenance verifier validates unchanged upstream hashes, patched installed
hashes and review-patch hash, and rejects undeclared vendored Python files. Its
tests deliberately alter baseline files, patched files, the patch artifact and
file inventory to ensure drift is detectable.

### Review patch for Shivam

`patches/support-contact-v1.patch` is a standard unified diff rooted at
`backend/`. It contains the predicate change, two fixture corrections and new
42-case geometry/service tests. It does not modify the local HTTP wrapper or
Part A integration. The patch was checked and replayed in an isolated copy of
the upstream baseline under /tmp; all 60 Part B tests passed there.

For Shivam to review and apply from his repository root (not executed upstream):

```bash
git apply --check /path/to/support-contact-v1.patch
git apply /path/to/support-contact-v1.patch
PYTHONPATH=backend python -m pytest backend/tests
```

If his source has moved since this baseline, review/rebase the diff against his
new changes rather than replacing his files. Once upstream incorporates it,
refresh local provenance from that reviewed upstream commit: retain a clear
record of the new baseline and remove this local override only when installed
files truly match. Do not simply replace upstream hashes with patched hashes.
