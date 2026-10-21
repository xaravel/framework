---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "4fc772a2c1756d7c97fca1ee84a9aa72d5bc6a572da094f81d67e815ebc53c66"
---

# ESC-9.3-1: approved, option 1 (generic Scope Frame runners are AD-6.5 dual-shape runners and carry no `@asyncRoot` tag)

A generic Scope Frame runner is a public function that runs a body inside a frame and returns the body's own result type `T`, never a declared Promise or thenable type. `runInFrame`, `runInRootFrame` and `runInNarrowFrame` in `@xaravel/runtime/scope` are such runners. They have the shape AD-6's Dual helpers bullet describes: they return `T` for a sync body and `Promise<T>` for an async one, because `T` is the body's own type. They carry no `@asyncRoot` tag, and `async-surface.json` lists no line for them.

Story 9.3 re-applies `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch`, cites `decisions/ESC-9.3-1.md` in the three runners' docblocks, and re-runs the Fidelity Review on the changed tree, as the standing-reject rule (ESC-8.8-1) requires. The Review shows cited decision records as evidence (f).

Scope of the ruling:

- It covers only functions that return their body's own generic type `T` and never declare a Promise or thenable return. A runner that declares `Promise<…>` or a thenable return, or that awaits its body itself, is async and carries a tag as AD-6's Enforcement bullets say.
- It does not add to DIV-1's list of Upstream dual helpers. The frame runners are Xaravel-only (AD-5), so they port no Upstream method and diverge from none.
- `tools/async-surface/async-surface.ts` and every `async-surface.json` stay as they are.

Rationale:

- **The tag cannot be true.** AD-6's Enforcement bullet makes the tag mark a method that returns a Promise, and the async-surface tool rejects a tag on a method that returns neither a Promise nor a thenable. A runner returning `T` is async only when its body is, which is the dual-helper shape, not the callback clause's "async on all paths".
- **Option 2 changes the grader's tool.** Teaching the Protected async-surface tool to accept a tag on a generic-`T` method loosens the check for every package. Option 1 leaves the check as strict as it is.
- **Returning a Promise always is wrong.** It would make every sync body async, breaking XT-runtime-1..8 and the grader's `Symbol.for('xaravel.scope.run')` contract.
- **It matches the record.** The same untagged runners passed F-9 from both reviewers at Story 9.2's tree 02121f3a. The reviewers asked for a recorded ruling, not for a change in behaviour.
- **Within the orchestrator's authority.** No assertion, expected value, skip or `adapted:` marker changes; no divergence is added or changed; the runners keep their current cost, and no Upstream behaviour moves.

This ruling clears XT-runtime-9, XT-runtime-10 and XT-runtime-11. Story 9.3 is unblocked.
