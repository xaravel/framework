---
test_ids:
  - XT-runtime-1
  - XT-runtime-2
  - XT-runtime-3
  - XT-runtime-4
trigger: contract
proposed: >-
  Option 1 (recommended): an Infrastructure change adds a `runtime` row to
  `CONSEQUENCE_SOURCES` in tools/xt-coverage/consequences.ts and generates
  conformance/xaravel-consequences/runtime.jsonl with `bun run
  xt:consequences`. The row takes the AD bullets the spine gives
  `packages/runtime`: AD-5 (Scope Frames), AD-6 (async surface), AD-9 (PHP
  values), AD-10 (Class Registry), AD-23 (codecs) and AD-26 (traits), and no FR
  bullets, since the FRs that name runtime are Foundation's and Support's
  (spine Capability Map rows "Foundation and Container (FR-18..22)" and
  "Support and Collections (FR-23..26)"). Story 9.1 then cites the exact
  bullets each XT-runtime test verifies, for example AD-5.1 for the primitive
  and AD-2's dependency bullet for XT-runtime-4, which needs AD-2 in the row
  too. Option 2: the Fidelity Review accepts a Xaravel Test that cites no
  consequence token when its Component has no consequence file, judging F-7
  against the consequence string alone (a change to conformance/review/fidelity.md).
evidence: >-
  Both Fidelity Review reviewers rejected Story 9.1 twice on F-7 (spec
  _bmad-output/implementation-artifacts/spec-9-1-scope-frame-primitive-and-interleave.md,
  trees d29879ca and 9809d91d). With `(AD-5)` / `(AD-2)` in the consequence
  strings they report "unknown consequence id", because
  conformance/xaravel-consequences/ holds only conformance.jsonl
  (CONSEQUENCE_SOURCES has one row, tools/xt-coverage/consequences.ts:48-50).
  With the tokens removed they still reject: "Removing decision citations from
  consequence strings does not supply the previously requested evidence."
  decisions/ESC-5.9-1.md item (1) says each Component's row comes "through a
  Maintainer-approved Infrastructure change". The tool, the consequence files
  and the reviewer checklist are Protected, and the ownership check lets a
  Story from Epic 9 on change only packages/runtime/**.
---

# ESC-9.1-3: `@xaravel/runtime` has no consequence file, so its Xaravel Tests cannot pass F-7

Every Xaravel Test declares the consequence it verifies, and the Fidelity Review's F-7 checks that declaration against `conformance/xaravel-consequences/<component>.jsonl`. Only the Conformance System has such a file. Story 9.1 is the first Phase 1 Story with Xaravel Tests, and both reviewers reject XT-runtime-1..4 whether the tests cite AD tokens (unknown ids) or none (no evidence).

The fix is a Protected change: a generator row plus a generated file, or a change to the reviewer checklist. A Story may not make either, so work on these Test IDs stops here. The implementation and its passing tests are saved in `_bmad-output/implementation-artifacts/9-1-blocked-attempt.patch`.

Every later runtime Story (9.2 to 9.10) and every Phase 1 Component with Xaravel Tests will hit the same wall, so the ruling should cover the row for each of them, or the rule for adding one.
