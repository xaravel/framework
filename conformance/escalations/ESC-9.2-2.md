---
test_ids:
  - XT-runtime-7
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so evidence (d), the `@asyncRoot` rules (`decisions/DIV-1.md`,
  `decisions/ESC-6.4-1.md` and AD-6's Derivation and Enforcement bullets),
  is supplied whenever the diff touches a `packages/*/src/**` file that has
  or had an `@asyncRoot` tag, or adds or changes an exported function, not
  only when an added line contains `@asyncRoot`. Update
  `conformance/review/fidelity.md` F-9 to match (lessons, epic 8: a ruling
  that redefines a tool updates every file the tool reads). Story 9.2 then
  re-applies `_bmad-output/implementation-artifacts/9-2-blocked-attempt-2.patch`
  unchanged and re-runs the Fidelity Review. Option 2: rule that F-9 covers
  only tags on added lines, so a retained tag or an untagged new export
  with no added `@asyncRoot` line is `n/a`, and record that in
  `conformance/review/fidelity.md`.
evidence: >-
  ESC-9.2-1 (Maintainer, Option 1) ruled that the private `drain` helper
  carries no `@asyncRoot` tag. Removing it left the Story's diff with no
  added line containing `@asyncRoot`, so `fidelity-review.ts`
  (`asyncRoot ||= line.includes("@asyncRoot")`, evidence (d)) supplies
  "No added line contains `@asyncRoot`." Both reviewers then reject F-9:
  at tree f0982850 reviewer 1 ("Evidence section (d) reports only that no
  tag was added, while F-9 also covers retained tags and missing required
  tags"), and at tree e61cecac both reviewers ("Add decisions/DIV-1.md and
  AD-6's Derivation consequence text in full to the review evidence
  (section (d)), so the kept @asyncRoot callback tag on interleave can be
  checked. With the same evidence, confirm that the new public functions
  in scope.ts and propagate.ts need no tag."). Quoting AD-6's Derivation
  and Enforcement text and citing `decisions/DIV-1.md` and
  `decisions/ESC-6.4-1.md` in `interleave.ts`'s docblock did not satisfy
  them. The only in-Story way to trigger (d) is an added `@asyncRoot` line
  the code does not need, which the ruling forbids for `drain` and which
  would be untrue anywhere else. `async-surface --all --check` is clean and
  `async-surface.json` is unchanged. Every other Fidelity item passes:
  at tree ca606fb6 (before the review patches) both reviewers passed.
---

# ESC-9.2-2: the Fidelity Review gives F-9 no evidence when no added line has `@asyncRoot`

Following ESC-9.2-1, Story 9.2 removed the `@asyncRoot` tag from the private `drain` helper. That leaves its diff with no added `@asyncRoot` line, and the Fidelity Review then gives its reviewers none of the `@asyncRoot` rules (evidence (d)). F-9 asks them to confirm that the retained tag on `interleave`, and the absence of tags on the new exports in `scope.ts` and `propagate.ts`, are right. They cannot do that without the rules, so both reject.

Supplying the rules is a change to `tools/fidelity-review/` (Protected), which a Story may not edit. Option 1 widens when evidence (d) is supplied. Option 2 narrows F-9 to added tags. Work on XT-runtime-7 stops here, and with it the Story, because every XT-runtime test sits in one reviewed tree. The full implementation passes `harness --xaravel` 298/298, `tsc -b`, lint, `graph:check`, `registration:check` and `async-surface --all --check`, and is saved in `_bmad-output/implementation-artifacts/9-2-blocked-attempt-2.patch`.
