---
decision: approved
decided_by: Maintainer
date: 2026-10-18
escalation_sha256: "eb21dc3ab3a235f0b680e242ff7b5ae110fdd1bb0877aca81ed19a25bbade592"
---

# ESC-4.4-2: approved, option 1, with these owners

The Maintainer approved this in the Maintainer's session on 2026-10-18.

- **(1)** Story 5.3's harness reads the `skipped` report key and reports the test as skipped. It also decides whether a report carries the risky flag.
- **(2)** The Story that ports `echo` and output buffering writes through `process.stdout.write`.
- **(3)** The wrong-class message ending in JS stack frames is a message-only difference. It is recorded as a clause in Story 8.1's DIV records.
- **(4)** CI's `check` job, which runs the coverage reports, becomes a required check on `main`. That is a separate Infrastructure PR, and the Maintainer applies the live ruleset. It narrows the Epic 1 item 2 ruling (`decisions/MAINT-2026-10-17-epic-1-items.md`).
- **(5)** Epic 57's Stories port the `testing` traits under `packages/foundation/src/Testing/Concerns/`.
- **(6)** PHPUnit's own test doubles are owned by the new Story 4.7. It covers `createMock` returning a PHPUnit `MockObject`, `getMockBuilder`, `createStub`, `addToAssertionCount` and `stringContains`. This also reconciles `epics.md:114` and supersedes the `createMock` delegation that `decisions/ESC-4.4-1.md` approved. Mockery stays reachable through `Mockery.mock()`.
- **(7)** PHP's `\RuntimeException` and the other SPL classes are owned by Story 9.10, behind a `Symbol.for` protocol. The grader reads them in Story 9.11. This joins ESC-4.3-1 item 14 and ESC-4.5-1 item 2.

Rationale: option 2 would let Story 4.4 decide what belongs to Story 5.3, PHP's output owner and the Maintainer. Option 3 would fail every skipped Ported Test and capture no output. Item 6 corrects a real fidelity gap: PHPUnit does not delegate `createMock` to Mockery, and Laravel's tests drive PHPUnit's MockObject API.
