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

## Not adopted: support-contact-v2 (Jie's branch, 48ae0cf)

v2 added a stricter edge-contact veto on top of B1 for ON_TOP_OF. The team kept B1 alone (Shivam's call),
so the vendored copy stays an exact copy of `backend/` (which also adds DOING) and `local_patches` stays empty.
Kept from that commit: bridge inventory targets (`expectedObjects`), `scene_reason` diagnostics and their tests.
