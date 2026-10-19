---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "5c4c65df15c773cedb25e170c02f0cf559163717e9be46788a20680116967b1c"
---

# ESC-5.9-2: approved, both parts as proposed

The Maintainer approved this in the Maintainer's session on 2026-10-19.

- **(1) Which run counts as full.** On a PR, the `full-run` clause reads the `ratchet story` step's SUMMARY: the Story's `test_ids` on every Variant, not in fast mode, as the spine's per-PR CI row asks. The merge queue's unfiltered Ratchet stays the gate for the whole suite.
- **(2) Which verdict counts.** The clause passes on the Ratchet's own verdict (job `success`, `failures=0`, and no unwarned unexpected pass) instead of SUMMARY's `differ=0`.

Epic 5 action item 15 (orchestrator) changes `story:check` to match.

Rationale: a Story may not edit Expectations lines owned by no Story or by another open Story, so a `differ=0` rule could fail it over a difference it can never clear. The Ratchet already classifies those as warnings.
