---
decision: approved
decided_by: Maintainer
date: 2026-10-24
scope: AD-5.8 child units at any depth under a test frame; Epic 11 retro item 1 (frame-chain read)
---

# Maintainer ruling: AD-5.8's child-of-test rule holds at any depth

The Maintainer gave this ruling on 2026-10-24 in the Maintainer's session.

## Why

AD-5.8 said what a unit frame holds when its parent is a `test` frame: the request, route and CSP nonce, and nothing else. Auth, session, config, instances and Context land in the test frame. It did not say what holds for a unit nested two or more deep, whose parent is a unit, not the test.

Epic 11 item 1 (#415) built `frameKinds()` and Macroable's frame-chain rule. That rule sends a macro written in a unit nested anywhere under a test frame to the test frame's overlay, as `decisions/ESC-11.1-5.md`'s second bullet says. The Fidelity Review's reviewer 2 read AD-5.8 literally, so the grandchild keeps its own write, and rejected it on F-7. Reviewer 1 passed it. The orchestrator rightly left the AD question to the Maintainer.

## The rule

AD-5.8 now reads: when a `test` frame encloses a unit frame **at any depth**, the unit holds only the request, route and CSP nonce. Auth, session, config, instances and Context land in the nearest enclosing test frame. So does a base-only write such as a macro, except where DIV-11.2 makes it throw inside a request, job or command frame.

- **Production is unchanged.** Production kernels always open root frames, so nested units exist only inside tests. The rule keeps per-test isolation however deep a test nests its kernels.
- **DIV-11.2 is unchanged.** A macro written under a request, job or command frame anywhere in the chain still throws `ScopeFrameException`.
- **Macroable's full rule (item 1).** A write passes when the chain reaches a `test` frame with no request, job or command frame between, and it lands in that test frame's overlay. It throws under a request, job or command frame, in a root non-test frame (`ESC-11.1-5.md`), and with no frame (`ESC-11.1-2.md`).

The spine's AD-5.8 text and its consequence row (`conformance/xaravel-consequences/runtime.jsonl`, AD-5.8, same id) are updated in this PR.

## The route

`epic-11-retro-item-1-frame-chain-read` leaves `waiting_on_maintainer` and stays `in-progress`. The orchestrator resumes it from `_bmad-output/implementation-artifacts/retro-11-frame-chain-read-attempt-1.patch` and re-runs its Fidelity Review against the amended AD-5.8.
