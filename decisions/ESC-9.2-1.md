---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "505c7b345482be9185829bfb4c2ae0b97a205f2b211ac533ade4dfeba1647097"
---

# ESC-9.2-1: approved, the test frame's `run` settles after its defer list drains

Option 1. The grader's `run('test', inner)`, which is `runInFrame`, may return a promise other than `inner`'s own. That promise settles with `inner`'s value, or rejects with its error, only after the frame's `defer` list has drained (AD-5.9). This is what `decisions/ESC-4.2-1.md` item (2) already allows: `portedTest` calls `run('test', inner)` and awaits its result, and nothing requires the result to be `inner`'s promise object. Story 9.2 replaces Story 9.1's identity check in XT-runtime-1 with the settle-after-drain check in its saved patch. The private `drain` helper is not a public method, so it carries no `@asyncRoot` tag (AD-6.13 tags public methods only).

The ruling is recorded where the reviewers see it by fixing the Fidelity Review rather than the Story manifest. `tools/fidelity-review/fidelity-review.ts` now gives the reviewers, as evidence item (f), every decision record that an added line or a touched Xaravel Test cites, in full, and the checklist (`conformance/review/fidelity.md`, Decision records) says a ruling cited there is recorded evidence for any item. A Story cites a ruling in its code or tests and never edits its manifest's body for it, so later Stories that rest on a decision do not stop on the same gap.
