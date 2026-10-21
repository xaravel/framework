---
decision: rejected
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "c1288f76cc70a309ed81697c3ce9255937f6bd83530cff50e89105487f342ead"
---

# ESC-8.8-1: rejected; fix the review's evidence, then re-run it on the head tree

Story 8.8 is not accepted on the iteration-3 verdicts. It is the Phase 1 gate, so it passes the Fidelity Review on its final tree.

The codex reviewer's evidence requests were legitimate: when a diff changes an existing Xaravel Test, or a fixture other tests share, the reviewer needs those tests' full bodies and consequences, and `tools/fidelity-review` does not send them. The reviewer also caught two real gaps along the way (XT-conformance-169's event filters and the `paths` guard), so the cross-model check is earning its place.

Epic 8 action item 2 (owner: orchestrator) changes `tools/fidelity-review` so that:
1. the prompt carries the full body and consequence of every Xaravel Test whose lines the diff changes, and of every test that uses a fixture or helper the diff changes;
2. a verdict is bound to the reviewed code, ignoring bookkeeping paths (`stories/`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, and the spec's own `fidelity-verdict` records), so a status edit no longer makes approvals stale;
3. a `reject` on an unchanged reviewed tree stands until its findings are fixed or the evidence it asks for is supplied; re-running the same review on the same tree to get a different verdict is not allowed.

After that item merges, Story 8.8 resumes on `story/8.8`, re-runs the review on its head tree, and merges if both reviewers pass.
