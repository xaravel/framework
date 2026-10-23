---
test_ids:
  - XT-contracts-4
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so evidence (h), the whole files, also includes every
  repository file a touched Xaravel Test reads as data: a `readFileSync`
  (or `Bun.file`) call whose path argument `pathExpression` resolves to an
  existing repository file (`join(import.meta.dir, "..", …,
  "conformance", "api-surface", "contracts.jsonl")`), placed after the
  files the change adds or modifies and before the imported modules, and
  named as omitted for size when it does not fit, like every other (h)
  file. Add tests for the new case in
  `conformance/tests/xaravel/fidelity-review.test.ts`, and say in the
  evidence notes of `conformance/review/fidelity.md` (above the checklist
  items, never in a **Check.** paragraph) and in
  `docs/ops/fidelity-review.md` that the prompt now carries them. This is
  the "What it may change" of the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md`: it adds evidence
  and narrows none. Story 10.1 then re-runs its Fidelity Review on the
  changed tree. Option 2: rewrite XT-contracts-4 to hard-code the PSR
  FQCNs, method and parameter lists instead of reading the committed rows,
  which the epic 8 lesson (derive expectations from the source contract)
  and ESC-10.1-4 (the PSR tokens take their metadata from those rows)
  argue against.
evidence: >-
  The Fidelity Review of Story 10.1's second pass, at tree
  94fc9c53db0314d0ebe953c9a2d8f5341020a094, rejected from both reviewers
  with F-7 `conformance/api-surface/contracts.jsonl`: "Supply the PSR rows
  consumed by psrRows(), including interface, method and parameter
  records. XT-contracts-4 derives its expected exports and metadata from
  these rows; without them, the declared Upstream coverage and expected
  values cannot be verified." The rows exist in the repository
  (`conformance/api-surface/contracts.jsonl`, the 28 `Psr\` rows that
  action item `epic-10-item-1-psr-api-surface` committed under
  ESC-10.1-4). `psr.test.ts` reads them with
  `readFileSync(join(import.meta.dir, "..", "..", "..", "..",
  "conformance", "api-surface", "contracts.jsonl"), "utf8")`. Evidence (h)
  of `fidelity-review.ts` shows the files the change adds or modifies, the
  decision and DIV records they cite and the repository modules they
  import, but never a data file a test reads, so the reviewers could not
  see the rows the test compares against.
---

# ESC-10.1-5: the Fidelity Review does not show the data files an Xaravel Test reads

XT-contracts-4 checks the `@xaravel/contracts/psr` tokens against the committed API-surface rows, as ESC-10.1-4 rules. It reads them from `conformance/api-surface/contracts.jsonl` at test time. The Fidelity Review prompt shows a test's imported modules in full, but no file the test reads as data. Both reviewers therefore rejected F-7 for evidence that is in the repository.

The recommended fix, Option 1, adds the data files a touched Xaravel Test reads to evidence (h). It is the kind of evidence gap the 2026-10-21 amendment to the MAINT ruling lets the orchestrator fix itself. This stops XT-contracts-4 only. The same reject also carried F-9 (`CacheInterface` must be async under AD-6), which the Story fixes in its own code.
