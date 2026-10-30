---
test_ids:
  - Illuminate\Tests\Config\RepositoryTest::testItIsMacroable
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so that evidence (i), which already reads the Escalation an
  added `skip` Expectations line cites (`escalationText` in
  `skipEligibilityEvidence`) only to find the Components it names, also
  carries that Escalation's full text, and its decision record
  `decisions/<id>.md` when one exists, in the group's entry; an id that has
  no file stays unavailable and says why. Add tests in
  `conformance/tests/xaravel/fidelity-review.test.ts` for each case (an
  Escalation with no decision, one with a decision, a missing id), and the
  matching evidence-note wording in `conformance/review/fidelity.md` and
  `docs/ops/fidelity-review.md`. This only supplies existing repository
  evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on; no checklist item, verdict rule or schema changes.
  Story 15.1 then re-runs its Fidelity Review on the changed tree.
  Option 2: cite the Escalation in a comment in the Ported Test file; that
  puts it in evidence (f) only as a decision citation, which the tool
  resolves to `decisions/<id>.md`, absent while the Escalation is open, so
  it cannot answer the finding.
evidence: >-
  At trees adb46be542fb95e41482d84c7b9c272a80551d44 and
  08adfed2e400e233963be7ae78a25ecbe0a463c8 (base eb40be35) both reviewers
  fail F-4 on
  conformance/expectations/config/framework/tests/Config/RepositoryTest.jsonl:
  "Supply conformance/escalations/ESC-15.1-1.md and any applicable ruling
  explaining why testItIsMacroable remains unported despite Macroable
  already existing" (reviewer 1, codex gpt-6.1-sol, missing-evidence) and
  "neither conformance/escalations/ESC-15.1-1.md nor a ruling is in the
  prompt" (reviewer 2, claude-opus-5-5, recorded as a defect). The evidence
  exists: conformance/escalations/ESC-15.1-1.md explains that
  `illuminate/config` reaches Macroable only through
  `illuminate/collections`, so listing `@xaravel/macroable` needs a
  Protected change to `tools/scaffold` and `bun.lock`; it waits on the
  Maintainer. tools/fidelity-review/fidelity-review.ts reads that file in
  `skipEligibilityEvidence` (`escalationText`) but uses its text only to
  match Component names, and evidence (f) resolves an `ESC-…` citation only
  to a decision record, which an open Escalation does not have.
---

# ESC-15.1-5: the Fidelity Review does not show the Escalation an added skip line cites

testItIsMacroable stays `not-ported-yet` with `"escalation":"ESC-15.1-1"`, and both Fidelity reviewers failed F-4 because the prompt never shows ESC-15.1-1. The tool already reads that file for evidence (i), but only to find the Components it names. Option 1 adds the Escalation's text, and its decision when there is one, to evidence (i). This only supplies existing evidence, so the 2026-10-21 amendment lets the orchestrator rule on it. Only testItIsMacroable waits on this, and it also waits on ESC-15.1-1 itself.
