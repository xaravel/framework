---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "c56163fbfa51f7c41b447f0e0c9e043130a9bcb30935f31df92febaa8c5e19c9"
---

# ESC-10.2-8: approved, options 1 and 3 (a 1,000,000-character prompt cap, and CI runs against the Upstream snapshot)

Options 1 and 3 are approved. Option 2, a committed extract of the 90 Upstream contract files, is not taken: it would add to a prompt already at the cap, and it would leave out the `contracts.jsonl` rows and `tsconfig.base.json`.

## Option 1: the prompt cap is 1,000,000 characters

- **The change.** `PROMPT_CAP` in `tools/fidelity-review/fidelity-review.ts` goes from 600,000 to 1,000,000 characters. `WHOLE_FILE_CAP` (60,000) does not change.
- **Why that number.** Story 10.2's prompt was measured on `main` after #358, with the cap lifted and fake reviewer CLIs that only captured their input.
  - The whole prompt is 943,702 characters, system prompt included.
  - Section (h) then shows each of the 90 Upstream contract sources the tests read, the 251-line excerpt of `conformance/api-surface/contracts.jsonl`, and `tsconfig.base.json`.
  - It omits no file for size.
- **It fits both reviewers.** At 3 to 4 characters per token, 1,000,000 characters is about 250,000 to 330,000 tokens.
  - Codex (`gpt-6.1-sol`) has a 475,000-token window.
  - Claude (`claude-opus-5-5`) has a 1,000,000-token window.
- **(h)'s order does not change.** The files a changed test reads already come before the changed files whose diff is above (`wholeFileEvidence`, tier 1). So the new room goes first to the inputs the reviewers asked for.
- **The rule for later gaps stays the same.** Raising `PROMPT_CAP` or `WHOLE_FILE_CAP` again is still the Maintainer's call (`decisions/MAINT-2026-10-22-fidelity-whole-files.md`, "Future evidence gaps").

## Option 3: CI runs the Xaravel Tests against the Upstream snapshot

- **The change.** CI's `check` job (`.github/workflows/ci.yml`) runs `bun run upstream:sync` after the install and before `bun run harness --xaravel`. The sync takes about 5 seconds.
- **A missing snapshot fails.** The harness step sets `XARAVEL_UPSTREAM=require`.
  - Under it, a Xaravel Test whose expectations come from `conformance/upstream/` fails, rather than warning and skipping, when the snapshot is missing.
  - This is the same pattern as `XARAVEL_PHP_FIXTURES=require`.
  - Without the variable, a local run keeps today's warn-and-skip.
- **Checked.** `bun run harness --xaravel` passes with the snapshot synced: 341 passed, 0 failed, 11 skipped. XT-conformance-33 pins the new step and its `env`.

## The route

- **This PR** makes the tool change, the CI change, their tests and the docs.
- **Story 10.2** resumes. It has three steps:
  1. XT-contracts-5 and XT-contracts-6 honour `XARAVEL_UPSTREAM=require`: when it is set and the snapshot is missing, they fail rather than skip their Upstream-derived checks. This answers reviewer 1's "require the source inputs" finding.
  2. It runs the Fidelity Review again. The changed test makes a new tree, so the standing rejects do not block the re-run.
  3. It clears its block.
- **Other tests** that read the snapshot, such as XT-conformance-248, may adopt `XARAVEL_UPSTREAM=require` later. This ruling does not require that.
