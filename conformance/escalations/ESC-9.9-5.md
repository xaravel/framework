---
test_ids:
  - XT-runtime-31
  - XT-runtime-32
  - XT-runtime-33
  - XT-runtime-34
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so that, when an Xaravel Test cites a bare `AD-<n>` that has
  no line in `conformance/xaravel-consequences/*.jsonl`, its consequence
  evidence carries that AD's Rule from the architecture spine instead of
  `unknown consequence id AD-<n>`: the Rule's bullets, read with the
  tool's existing `spineRules` (as it already does for AD-6), or the
  Rule's table when the Rule is a table (AD-26), with tests in
  `conformance/tests/xaravel/fidelity-review.test.ts` for each new case
  (a bullet Rule, a table Rule, an AD the spine lacks, which stays
  unavailable) and the matching wording in `conformance/review/fidelity.md`
  and `docs/ops/fidelity-review.md`. This only supplies existing
  repository evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on. It adds no consequence row and changes neither
  `xt:coverage` nor `CONSEQUENCE_SOURCES`, so `epic-9-item-1-consequence-rows`
  stays the Maintainer's. Story 9.9 then re-runs its Fidelity Review on
  the changed tree with `--base a5ecf3905763930a6d18c518924c7e12afa3e303`,
  as decisions/ESC-9.9-4.md set. Option 2: add AD-4 to `runtime`'s
  `CONSEQUENCE_SOURCES` row and give AD-26's table Rule consequence ids;
  that is `epic-9-item-1-consequence-rows` (questions 1 and 5), which waits
  on the Maintainer.
evidence: >-
  At tree fc6cb97928c8441c840f969d6e66665c218e9ba6 (base a5ecf39) reviewer
  1 (codex, gpt-6.1-sol) rejects F-7 and marks the ESC-9.9-4 finding fixed:
  "Supply the relevant AD-4 architecture bullets for XT-runtime-33 and
  XT-runtime-34. Evidence currently reports AD-4 as unknown, so the cited
  requirement cannot be compared with the tests." and "Supply the relevant
  AD-26 Traits architecture bullet for XT-runtime-31 and XT-runtime-32.
  Evidence currently reports AD-26 as unknown, so the cited requirement
  cannot be verified." Reviewer 2 (claude, claude-opus-5-5) passes every
  item. The tests cite `(AD-4)` and `(AD-26)`; `consequenceEntries` finds
  no `AD-4.*` or `AD-26.*` line in `conformance/xaravel-consequences/runtime.jsonl`
  (its row is ADs 2, 5, 6, 9, 10, 23 by ESC-9.1-3; AD-26's Rule is a
  table) and prints `unknown consequence id`. Both Rules are in
  `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md`
  (AD-4 at line 119, AD-26 at line 512). The Story's spec forbids editing
  `conformance/xaravel-consequences/**` and `tools/**`. `bun test
  packages/runtime` 34/34, `harness --xaravel --id 'XT-runtime-*'` 34/34,
  `tsc -b`, lint, `graph:check`, `registration:check`, `async-surface
  --all --check` and `oracle:story check 9.9` are clean.
---

# ESC-9.9-5: the Fidelity Review shows "unknown" for an AD the consequence files do not list

Story 9.9's Xaravel Tests cite AD-4 (XT-runtime-33, 34) and AD-26 (XT-runtime-31, 32). The Fidelity Review looks up a cited AD only in `conformance/xaravel-consequences/*.jsonl`. `runtime`'s row does not include AD-4, and AD-26 has no consequence ids because its Rule is a table. So the prompt prints `unknown consequence id` for both. Reviewer 1 cannot compare the tests with those Rules, and rejects F-7. The ESC-9.9-4 finding it raised before is now fixed.

The Rules are in the spine, and the tool already reads spine Rules for AD-6. Option 1 has the tool show a cited AD's spine Rule when no consequence line exists. Option 2 adds the consequence rows, which is `epic-9-item-1-consequence-rows` and waits on the Maintainer. Work on the four Test IDs stops here, and with them the Story, because every XT-runtime test sits in one reviewed tree.
