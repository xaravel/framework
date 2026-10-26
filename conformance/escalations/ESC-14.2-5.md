---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testSome#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testSome#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#1"
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so that the F-4 evidence also carries the `## Skip Reasons`
  table of `conformance/README.md`, beside the `## Precedence` section it
  already carries (fidelity-review.ts:401-403, :525), and, for each changed
  Expectations line whose reason is `not-ported-yet` or `blocked-by:<c>`,
  the `phase` of the test's Component and of every Component the change's
  Escalations or skip lines name, read from `tools/scaffold/packages.jsonl`,
  with the first Epic of each from sprint status, as
  `tools/expectations/reasons.ts:270-282` reads them. Add tests in
  `conformance/tests/xaravel/fidelity-review.test.ts` for each new case,
  and the matching wording in the evidence notes of
  `conformance/review/fidelity.md` (never an item's **Check.**) and in
  `docs/ops/fidelity-review.md`. This only supplies existing repository
  evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on. Story 14.2 then re-runs its Fidelity Review on the
  changed tree. Option 2: change the twelve lines to `blocked-by:runtime`;
  `expectations:check` rejects that (below), so it is not available.
evidence: >-
  At tree 1d028ca58e3c65eacd3c022e2578aff607425a4a (base b5938e16) both
  reviewers (codex gpt-6.1-sol, claude claude-opus-5-5) reject F-4 on the
  twelve ESC-14.2-4 lines, and on nothing else. Reviewer 1: "For the twelve
  ESC-14.2-4 lines, supply the actual tools/expectations/reasons.ts
  eligibility rule and applicable component ordering as review evidence or
  a decision record, or change their reason to blocked-by:runtime".
  Reviewer 2: "The precedence exception relies on the blocked-by
  eligibility rule at lines 270-282 and on its Phase/Epic ordering of
  components. Neither is in the prompt and no decision record carries
  them, so the exception cannot be verified". The rule is in the
  repository: conformance/README.md's Skip Reasons table says
  `blocked-by:<c>` is valid only when `<c>` is "in a later `phase` than
  the test's Inventory `component`", and tools/expectations/reasons.ts:270-282
  also accepts the same Phase with a later first Epic. In
  tools/scaffold/packages.jsonl, `runtime` and `collections` are both phase
  1, and the runtime's first Epic (9) is before collections' (14), so
  `blocked-by:runtime` fails `bun run expectations:check`. The prompt
  carries only README's `## Precedence` section (fidelity-review.ts:40-41,
  :401-403), not the Skip Reasons table or the Components' phases. At the
  earlier tree 55d53d93 the tool noted the same F-4 findings as evidence
  gaps; at 1d028ca5 it did not, so the reject stands (ESC-8.8-1).
---

# ESC-14.2-5: the Fidelity Review's F-4 evidence lacks the `blocked-by` eligibility rule

Story 14.2's twelve ESC-14.2-4 lines are `not-ported-yet`, because their blocker, the runtime, is not a later Phase or Epic than collections, so `blocked-by:runtime` fails `expectations:check`. Both Fidelity reviewers reject F-4 because the prompt shows them the Skip Reason precedence but not the eligibility rule or the Components' phases, so they cannot verify the exception. Option 1 adds that existing evidence to the review tool's prompt under the 2026-10-21 amendment. Story 14.2 then re-runs its review.
