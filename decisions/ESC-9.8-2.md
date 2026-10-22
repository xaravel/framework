---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-21
escalation_sha256: "1437f0932fca7af0cf1b73747738bdd7d409d95700cc7da4d0fdcf221684cd47"
---

# ESC-9.8-2: approved, option 1 (evidence (c) names present non-error fixtures, evidence (a) follows DIV clause citations)

`tools/fidelity-review/fidelity-review.ts` supplies two existing evidence items in more cases:

- **Evidence (c).** For every assigned committed Oracle request, a fixture that is present, verifies against `oracle.pub` and whose `output.error` is null now gets an entry too, in its own section `### (c) Oracle fixtures that are present, verify against oracle.pub and are not errors (F-6)`, naming its request id, `sha256` and path (`presentFixtures`). Error fixtures stay in the error section unchanged, and a missing or unverified fixture is still reported as `unavailable`.
- **Evidence (a).** An added line that cites a clause `DIV-<n>.<k>` outside an `adapted:` marker, as a comment or a Xaravel Test relying on that clause does, now brings `decisions/DIV-<n>.md` in full, as an `adapted:DIV-<n>.<k>` marker already did. A `decisions/DIV-<n>.md` path, a bare `DIV-<n>` and a longer token such as `xDIV-9.8` are not clause citations.

`conformance/tests/xaravel/fidelity-review.test.ts` tests both new cases against the real XT-runtime-29 fixture and DIV-9, and the error fixture stays an error entry only. `conformance/review/fidelity.md` (F-6) and `docs/ops/fidelity-review.md` say what the prompt now carries.

The reject this answers is both reviewers' reject at tree `a570d685…` of Story 9.8 (ESC-9.8-1 part 2): reviewer 1's F-2 finding asking for "the cited DIV-9.8 clause supporting assertJsonError's Error substitution", and both reviewers' F-6 and F-7 findings asking for the signed fixtures of requests `1d7bdd9c…`, `8602cd5c…`, `955c94aa…`, `0141ced1…`, `6338a827…` and `c30392c5…`. All six fixtures are on `main` from #284 and verify; DIV-9.8 is in `decisions/DIV-9.md`. With this change the prompt shows each of them.

Story 9.8 re-runs its Fidelity Review. The tree changes with this ruling, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** The fixtures were merged with the Story's first PR, so they are in the base, not the diff, and evidence (c) named only error fixtures; DIV-9.8 is cited in comments, which evidence (a) did not follow. That is the gap the 2026-10-21 amendment lets the orchestrator close.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added. Xaravel Tests keep citing DIV clauses in comments, not with `adapted:` markers, which belong to Ported Tests (AD-15).
- **Option 1 over option 2.** Option 2 leaves the gap for the next Story whose fixtures merged before its review, and needs the Maintainer for a change the amendment already covers.

This ruling clears XT-runtime-27, XT-runtime-28, XT-runtime-29 and XT-runtime-30. Story 9.8 is unblocked.
