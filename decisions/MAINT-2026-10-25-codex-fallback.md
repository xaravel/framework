---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: The unattended orchestrator can run its iterations on the Codex CLI
---

# Maintainer ruling: a Codex fallback for the orchestrator

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. The weekly Claude compute was expected to run out before its reset on 2026-10-29, and the Maintainer asked for the loop to be able to continue on Codex.

## The rule

- **Claude stays the default.** `run.sh` runs `claude -p` unless `XARAVEL_ORCH_CLI=codex` is set, normally in the host's `~/.xaravel-orchestrator/env`. With it set, each iteration runs `codex exec` instead.
- **Subscription compute only.** Codex runs on the Maintainer's ChatGPT subscription, signed in on the host, and never on a metered API key.
- **The same iteration.** A Codex iteration follows the same `iteration.md`, with every standing rule, ruling and grader protection unchanged. `tools/orchestrator/codex.md` is placed in front of it and only maps Claude Code's tools and sandbox to Codex's.
- **The Fidelity Review** runs with `--loop-cli codex`. Reviewer 1 is then Claude, or Codex when Claude is unavailable, with the reason recorded, as `docs/ops/fidelity-review.md` already defines.
- **Switching** is the Maintainer's call, made through the env line. The monitor may make the switch only on the Maintainer's word.

## Evidence: the 2026-10-25 trial

Six isolated trial runs (`tools/orchestrator/codex-trial.sh` on branch `planning/codex-loop-trial`) ran one iteration each. Each used its own clone, had push disabled and `gh` signed out, and ran at `nice 19`.

**What worked:**
- Codex loaded the BMAD skills and picked the right unit.
- Its subagents worked for context compilation, investigation, implementation and review.
- It implemented Story 13.1 and passed the same local gates as the Claude loop: `harness --story 13.1` `checked=24 differ=0`, typecheck, lint, the API gate, and the Expectations, registration and async-surface checks.
- It stopped cleanly at every denial.

**The problems, and the preamble's answer to each:**
- Provider capacity errors. `run.sh` backs off 5 minutes.
- `apply_patch` stalls. Large edits go through the shell.
- Sandbox refusals of diagnostic calls such as `ps` and `nice`. They are skipped and do not block the unit.
- Asynchronous subagents with 4 slots. Reviews run in batches.
- A read-only `.git` and temporary files outside the writable roots. `.git` is named as writable, and `TMPDIR` is the state dir.

**Two workflow gaps that also affect Claude**, which the preamble settles for Codex:
- the context refresh dirties the tree before the clean-tree check;
- a resumed Story could get a second spec, which `story:check` rejects.

**Not yet shown:** a Codex iteration pushing, opening and merging a PR. GitHub was disabled in the trial, so the first Codex iterations should be watched.
