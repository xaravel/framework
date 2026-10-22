---
test_ids:
  - XT-runtime-27
  - XT-runtime-28
  - XT-runtime-29
  - XT-runtime-30
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) under the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md`, supplying two
  existing items in more cases. (a) Evidence (c): list every assigned
  request's fixture, not only those whose `output.error` is not null. A
  present fixture that verifies against `oracle.pub` and is not an error
  gets an entry that says so, naming its request id and path, so a
  reviewer can tell "present and not an error" from "missing". (b)
  Evidence (a): also supply `decisions/DIV-<n>.md` when an added line
  cites a clause `DIV-<n>.<k>` outside an `adapted:` marker, as a comment
  or test that relies on that clause does. Add tests for each new case in
  `conformance/tests/xaravel/fidelity-review.test.ts`, and update the
  matching wording in `conformance/review/fidelity.md` and
  `docs/ops/fidelity-review.md`. Story 9.8 then re-runs its Fidelity
  Review on the changed tree. Option 2: the Maintainer rules on the
  evidence some other way.
evidence: >-
  At tree a570d685 both reviewers reject. Reviewer 1 F-2 asks to "Supply
  the cited DIV-9.8 clause supporting assertJsonError's Error
  substitution ... whose text remains unavailable". F-6 and F-7 (both
  reviewers) ask for the signed fixtures of requests 1d7bdd9c…,
  8602cd5c…, 955c94aa…, 0141ced1…, 6338a827… and c30392c5…, which "are
  not in the diff or the evidence". All six exist on `main`, committed by
  `xaravel-oracle[bot]` in 0eaf44f (#284), and `bun run
  oracle:verify-fixtures` verifies them (1950 fixtures OK). They are not
  in the diff because #284 already merged them, and `errorFixtures`
  supplies only fixtures whose `output.error` is not null, so the
  non-error ones never appear and the section reads as if they were
  missing. `decisions/DIV-9.md` line 39 holds DIV-9.8, but `gatherEvidence`
  reads a DIV record only for an `adapted:DIV-<n>` marker, an Expectations
  `adapted` field or an `intentional-divergence` Skip Reason. The source
  and tests cite `ESC-9.8-1 part 1, DIV-9.8` in comments, which the tool
  does not follow. The remaining findings at that tree, the AD-9.3 and
  AD-5 citations of XT-runtime-27 and XT-runtime-30, are patched in this
  Story. `bun test packages/runtime` passes 30/30 against the signed
  fixtures.
---

# ESC-9.8-2: the Fidelity Review hides present non-error fixtures and the DIV clause the code cites

Story 9.8's follow-up (ESC-9.8-1 part 2) adds `jsonLastError()` / `jsonLastErrorMsg()`. Both reviewers rejected tree `a570d685…` for evidence that is in the repository but that `tools/fidelity-review/fidelity-review.ts` does not put in their prompt:

- **The six fixtures.** The Story's XT-runtime-27..30 fixtures were signed and merged in #284 (0eaf44f), so they are in the base tree and not in this diff. Evidence (c) lists a fixture only when its `output.error` is not null. The reviewers therefore see neither the fixtures nor any statement that they exist, and they carry their earlier "missing fixture" findings forward.
- **DIV-9.8.** `assertJsonError` asserts an `Error` with PHP's message and code, as `decisions/ESC-9.8-1.md` part 1 (option 1a) rules under DIV-9.8. The ruling is supplied, but DIV-9.8's text is not, because no added line carries an `adapted:` marker. These are Xaravel Tests, so an `adapted:` marker would be wrong.

The fix is a change to a Protected Path. The 2026-10-21 amendment to the MAINT ruling lets the orchestrator rule on it, since it only supplies existing evidence items in more cases and removes or narrows nothing. Work on XT-runtime-27..30 stops here until it is ruled and the tool change merges, and with them the Story, because all four tests sit in one reviewed tree.
