---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "fb1f4d2b51f4210e3276d0b110985f5491c3c5c0c3b31ddf15c5351aea5624ba"
fidelity_waiver:
  subject: "10.2"
  items: [F-7]
---

# ESC-10.2-9: approved, option 3 (the Maintainer waives F-7 for Story 10.2)

Option 3 is approved, as a Maintainer waiver under `decisions/MAINT-2026-10-23-fidelity-waivers.md`, which this ruling sets up. Options 1 and 2, raising `WHOLE_FILE_CAP` or widening `dataFileExcerpt`, are not taken.

## Why

Story 10.2's fourth Fidelity Review has one `pass` and one `reject`:
- Reviewer 2 (Claude) passes every item.
- Reviewer 1 (Codex) passes every item but F-7, on two findings:
  - It cannot see every `contracts.jsonl` row XT-contracts-5 reads. The prompt shows a 251-line excerpt of the 411 rows. That is a gap in the evidence, not a defect found in the code.
  - It names two names that are the same byte for byte. That finding names no difference.

`bun run harness` shows no differences, and XT-contracts-1..7 and -18 pass. Under `XARAVEL_UPSTREAM=require`, CI now runs XT-contracts-5's Upstream-derived checks against the synced snapshot (ESC-10.2-8). The Maintainer accepts F-7 for this Story rather than enlarge the prompt again.

## The waiver

- **Subject:** Story `10.2`.
- **Items:** `F-7`.
- **Effect:** a reviewer's reject that fails only F-7 counts beside the other reviewer's `pass` for Story 10.2. A fail on any other item still blocks, and both reviewers still run.

## The route

Story 10.2 resumes and runs its Fidelity Review on its current tree. When the result counts under the waiver, `review` exits 0 and `story:check`'s `approvals` clause passes, naming this decision. The Story then clears its block and continues to its remaining test IDs and its done check.
