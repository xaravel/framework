---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "790bf2728b1df6ec36c0213ca1646bc66dc6125e8488067df455e8c4c2dc1f9f"
---

# ESC-9.1-4: approved, F-9 checks both `@asyncRoot` tags the spine defines

Option 1. F-9 in `conformance/review/fidelity.md` now matches AD-6. A tag is true when it is `@asyncRoot <Contract.method>` on a method that really performs IO behind that async-root Driver contract method, or `@asyncRoot callback` on a method that is async only because it accepts a callback DIV-1 allows to be async (AD-6 Derivation, second clause), as `runCounted` and `runWithMockery` are (`decisions/ESC-6.4-1.md`). The Fidelity Review's evidence item (d) (`tools/fidelity-review/fidelity-review.ts`) now gives the reviewers, beside `decisions/DIV-1.md`, `decisions/ESC-6.4-1.md` and the spine's AD-6 Derivation and Enforcement bullets, so they can check a `callback` tag against the rule that defines it. `interleave` in Story 9.1 keeps its `@asyncRoot callback` tag. The async-surface contract is unchanged: a dev-only helper is not exempt from it.
