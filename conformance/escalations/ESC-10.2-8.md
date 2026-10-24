---
test_ids:
  - XT-contracts-5
  - XT-contracts-6
trigger: protected-path
proposed: >-
  Option 1 (recommended): the Maintainer raises the Fidelity Review's room
  for a Story's evidence in `tools/fidelity-review/fidelity-review.ts`
  (Protected): either `PROMPT_CAP` (600,000 characters), or a reserved
  share of it for the files a changed Xaravel Test reads as data
  (`conformance/upstream/…` sources, their declaration lines, the
  `conformance/api-surface/<c>.jsonl` rows of the Story's FQCNs, and
  `tsconfig.base.json`), placed ahead of the changed source files the
  diff already shows. Raising either cap is the Maintainer's call
  (`decisions/MAINT-2026-10-22-fidelity-whole-files.md`, "Future evidence
  gaps"). Option 2: Story 10.2 commits an extracted fixture under
  `packages/contracts/tests/fixtures/` (each of the 90 Upstream contract
  files' declaration, `use` and `const` lines and the concrete classes it
  names), the tests read their Upstream expectations from it on every run
  (CI included), and a local-only check proves it equals the synced
  snapshot. That puts the inputs in the diff, but adds about 40,000
  characters to a prompt that is already at the cap, so the review may
  stop as too large, and it still leaves the `contracts.jsonl` rows and
  `tsconfig.base.json` out. Option 3: CI's `check` job runs
  `upstream:sync` before the Xaravel Tests (`.github/workflows/ci.yml`,
  Protected), so the Upstream-derived parts of XT-contracts-5 and -6 run
  in CI; this answers the second finding only.
evidence: >-
  Story 10.2's third Fidelity Review (tree
  8eb62fb3cbb1b3beb65fdc04d19c98fbed18956d, base
  1c2f48aab75c7badad6de7729bba4471ae1dff16) rejected on F-7 alone, both
  reviewers; F-9 now passes. The findings: "The Upstream contract PHP
  files and conformance/api-surface/contracts.jsonl that XT-contracts-5
  reads (extends/implements, use lines, constants, rows) are omitted for
  size" and "The 90 Upstream PHP inputs and tsconfig.base.json that
  XT-contracts-6 reads are omitted for size" (reviewer 2); and
  "XT-contracts-5 claims verification of Upstream parents, built-ins,
  exception bases and constant values, but skips those checks when
  UPSTREAM_SYNCED is false and still passes. Require the source inputs for
  this test or provide committed equivalents" (reviewer 1, the same for
  XT-contracts-6). ESC-10.2-7 (#348) already added these files and, past
  the cap, their declaration lines, but the Story's diff since its base is
  270,787 characters (81 contracts, 38 structural types and four tests),
  so section (h) has no room left: even the 236-character
  `tsconfig.base.json` is named as omitted for size. CI's `check` job does
  not sync `conformance/upstream/` (it is gitignored), so the
  Upstream-derived checks warn and skip there, as XT-conformance-248 and
  XT-contracts-6 already do.
---

# ESC-10.2-8: Story 10.2's Fidelity Review has no room for the Upstream inputs its tests read

Story 10.2's tests take their expectations from the Upstream PHP sources, the committed API-surface rows and `tsconfig.base.json`. The Story's diff fills the Fidelity Review prompt up to its 600,000-character cap, so none of those inputs reach the reviewers. That includes the declaration-line fallback ESC-10.2-7 added. Both reviewers reject F-7 for that. One reviewer also rejects the tests' Upstream-derived checks, because they skip in CI, where the snapshot is not synced.

The recommended fix, Option 1, gives the review the room it needs. Raising the cap is the Maintainer's call under the whole-files ruling, so the orchestrator cannot rule this itself. Every other part of Story 10.2 is built and merged: the second pass (statics, builtins, the Pipeline overload, XT-contracts-5 and XT-contracts-7) passes `bun run harness` with no differences. This Escalation stops XT-contracts-5 and XT-contracts-6 until the Fidelity Review passes on a tree whose inputs it can see.
