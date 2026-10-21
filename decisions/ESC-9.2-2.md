---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "b1896ee64b273b3954024d9b722b039a1cf75882d1e046a9da0555e17dfb221e"
---

# ESC-9.2-2: approved, the `@asyncRoot` rules reach the reviewers whenever framework source changes

Option 1, with a simpler trigger than the Escalation proposed. `tools/fidelity-review/fidelity-review.ts` now supplies evidence (d) (`decisions/DIV-1.md`, `decisions/ESC-6.4-1.md` and AD-6's Derivation and Enforcement bullets) whenever the change touches any `packages/<name>/src/` file, not only when an added line contains `@asyncRoot`. A tag-based trigger would miss the cases F-9 most needs the rules for: a tag the change keeps, and a new export that should be tagged but is not. F-9 in `conformance/review/fidelity.md` now says it covers kept tags and untagged new exports, and that the prompt carries the rules whenever framework source changes. Story 9.2 re-applies `_bmad-output/implementation-artifacts/9-2-blocked-attempt-2.patch` unchanged and re-runs the Fidelity Review.

So that the next gap of this kind does not stop the loop, the amendment of 2026-10-21 to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the orchestrator fix missing Fidelity Review evidence itself.
