---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-18
escalation_sha256: "fe7ecb8106663997661a3a756351a38277bf99681a401db516cf5d1534a35c2c"
---

# ESC-4.1-1: approved, option 1 (adopt the grader-side protocols; close the int/float `===` gap later)

The three items are approved exactly as the Escalation's `proposed` text states:

- **PhpArray read protocol.** A PHP array that is neither a list nor an all-string-key plain object carries `Symbol.for('xaravel.php.array')` and yields normalised `[key, value]` pairs in insertion order from `[Symbol.iterator]()`. The grader reads it only through that iterator and throws `TypeError` on a bad key, a non-pair item or a repeated key. Story 9.5 builds `PhpArray` to this protocol.
- **Object props protocol.** A PHP object exposes its properties through `[Symbol.for('xaravel.php.props')]()`, which returns a PHP array in one of its three forms. Without it, an ordinary instance's own enumerable string keys are its properties. A JS built-in (a native-constructor prototype below `Object.prototype`) is `==` only to itself, and an object compared `==` with a number is cast to 1.
- **Float marker.** Story 9.5 defines how an integral float is marked. A follow-up `assert` Story, or a Maintainer-approved Infrastructure Story, then amends `phpStrictEquals` so `1 === 1.0` is false and `1.0 === 1.0` is true, and adds a `===` matrix for integral floats to `conformance/oracle-requests/4.1.jsonl`. Until then the grader treats int and float as one type for `===`, as it does today.

Rationale:

- **It follows DIV-9 as written.** DIV-9 already makes a non-list, non-plain-object PHP array an ordered `PhpArray`, routes `==` on objects through `[Symbol.for('xaravel.php.props')]()`, and keeps the int/float distinction where Laravel depends on it. This ruling fixes the shape both sides build to, so Story 9.5 cannot silently diverge from what `assertSame` and `assertEquals` read.
- **The grader is not weakened.** No assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. The int/float `===` gap already exists on `main`; this ruling gives it an owner and commits to closing it with a new Oracle matrix, which strengthens the grader. Option 3 would make that gap a permanent new divergence and is rejected.
- **Grader isolation holds.** The grader keeps reading the runtime's values by brand and protocol and never imports `@xaravel/runtime` (AD-2). Option 2 would break that and is rejected.
- **No planning document changes and no run-time cost.** The spine, the SPEC and `epics.md` stay as they are; Story 9.5 builds to the protocol named here. An iterator and a symbol lookup add no measurable cost, and no divergence outside DIV-1..12 is added.

No Story is blocked on this Escalation: Story 4.1 is done.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun.
