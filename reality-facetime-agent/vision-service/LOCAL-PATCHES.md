# Intentional local Part B patches

None. The vendored `vendor/` copy is byte-identical to upstream `backend/` on branch `Shivam`
(checked by `verify_provenance.py` against `UPSTREAM.json`).

## Retired: support-contact-v1 (Jie, Nov 15)

Jie's local ON_TOP_OF contact patch was superseded by upstream Part B geometry (B1, Shivam),
which covers both tall-on-flat stacks seen from the side and flat-on-flat stacks seen from above:
real overlap, contact, in-front-of, held-above, reverse stacks and side-by-side for LEFT_OF.
Two of its guards were folded into upstream and keep their tests in `tests/test_perception.py`:
missing, malformed or non-integer boxes fail closed, and two objects reported in the same
region are not accepted as a stack.

To vendor a new upstream version: copy the nine files listed in `UPSTREAM.json` from
`backend/`, update their hashes, and run `python verify_provenance.py`.
