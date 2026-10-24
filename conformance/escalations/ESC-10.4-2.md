---
test_ids:
  - XT-contracts-10
  - XT-contracts-11
  - XT-contracts-12
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) under the "What it may change" of the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md`, so the prompt also
  carries the Upstream sources a changed Xaravel Test reads through a
  directory walk of the snapshot that filters by file name (here every
  `*ServiceProvider.php` under `conformance/upstream/framework/src/Illuminate`),
  and the source of a class whose path the test builds with a helper
  (`upstreamPath('Illuminate\\Foundation\\Application')`, imported from a
  support file) even when the test reaches the snapshot directory through
  an imported constant (`REPO`). Each is shown whole or, past the cap, as
  its declaration lines plus the method bodies the test's regexes name
  (`registerCoreContainerAliases`). The Upstream message source an exact
  message assertion cites (`Container::alias`, "is aliased to itself") is
  carried the same way. Tests for each case in
  `conformance/tests/xaravel/fidelity-review.test.ts`, and the evidence
  notes of `conformance/review/fidelity.md` and `docs/ops/fidelity-review.md`
  updated. The orchestrator may rule it itself under that amendment.
evidence: >-
  Both reviewers of Story 10.4's Fidelity Review rejected at tree
  56738407bb01eca2c349e6d66167ad3a7225c137 (base
  a02d058c0463f814522c232ec31c0e4f5f8158d1) for evidence that is in the
  repository but not in the prompt. Reviewer 1 failed F-2 with a
  `missing-evidence` finding: "Supply the pinned
  Application::registerCoreContainerAliases, relevant service-provider
  sources, and Container::alias source so the expected alias data and
  self-alias exception message can be compared with Upstream". F-2 is a
  core item, so the 2026-10-24 evidence-gap ruling does not accept it.
  Reviewer 1 also failed F-7, and reviewer 2 failed F-7, on the same gap:
  "The prompt does not include Foundation/Application.php
  registerCoreContainerAliases or the provider sources". XT-contracts-10
  (`packages/contracts/tests/xaravel/aliases.test.ts`) reads
  `conformance/upstream/framework/src/Illuminate/Foundation/Application.php`
  through `upstreamPath` and every `*ServiceProvider.php` under
  `conformance/upstream/framework/src/Illuminate/` through `readdirSync`.
  The self-alias message is in
  `conformance/upstream/framework/src/Illuminate/Container/Container.php`
  (`alias()`).
---

# ESC-10.4-2: The Fidelity Review prompt lacks the Upstream sources XT-contracts-10 reads

XT-contracts-10 checks the alias table against `Application::registerCoreContainerAliases` and every service provider, parsed from the Upstream snapshot. The Fidelity Review prompt carries neither. Both reviewers rejected for that alone, and reviewer 1's reject is on F-2, which the 2026-10-24 evidence-gap ruling never accepts.

The fix changes only what the prompt shows the reviewers, so the orchestrator may rule on it itself under the 2026-10-21 amendment, and do it on `planning/esc-10.4-2`. This blocks the Fidelity Review of XT-contracts-10, -11 and -12. The Story is built. Its remaining rejects wait on ESC-10.4-1.
