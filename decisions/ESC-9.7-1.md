---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "69389da7322b92fb80caa3bbc9a96316236e7aadcdabbe701423c6ada971d1f2"
---

# ESC-9.7-1: approved, options 1a, 2a, 3a and 4a

None of the four parts weakens the grader, adds a divergence outside DIV-1..12, or moves Xaravel away from a faithful port of Laravel on Bun, so the orchestrator rules on them (MAINT-2026-10-16). Each takes the Escalation's recommended option.

## 1. The PHP property table: option 1a

- A ported class may declare its PHP property table as a static `[Symbol.for('xaravel.php.properties')]` list of `{ name, visibility: 'public' | 'protected' | 'private', default }`, in PHP declaration order. Generators emit it from Upstream, as they emit brand getters (AD-9).
- With no hook, `phpSerialize` writes each listed property under PHP's name: `name` for public, `\0*\0name` for protected and `\0<declaring FQCN>\0name` for private. The declaring FQCN is the FQCN of the class whose table lists the property, so a parent's private property keeps the parent's name.
- `phpUnserialize` starts the rebuilt object from the declared defaults of the class and its parents, as PHP's `object_init_ex` does, and then applies the payload. A property that `__sleep` dropped therefore reads its default and never `undefined` (AD-9.1).
- A class without the list keeps today's public-only behaviour. `__serialize`, `__sleep` and the props protocol (ESC-4.1-1) are unchanged.
- Story 9.7 lands this as a follow-up on `story/9.7`, within `packages/runtime/**`, with an Oracle request in `conformance/oracle-requests/9.7.jsonl` for a fixture class that has protected and private properties with defaults, including a parent's private property. The request covers both directions and a `__sleep` that drops a defaulted property.

Option 1b would add `__serialize` / `__unserialize` methods that Laravel's classes do not have, which moves the port away from Upstream, so it is not taken.

## 2. Strings: option 2a

A PHP string stays a JS string, as AD-9 models it. A `s:` value that is not valid UTF-8, or a JS string with a lone surrogate, throws a `TypeError` that names the limit. This adds no divergence. Under AD-9, which DIV-9 records, such a value has no representation, so the codec rejects it instead of inventing one. No Upstream test is adapted and no Ported Test changes. The codec already behaves this way on `main`.

A consumer that must carry bytes (Encryption, Cache) raises its own Escalation with the first Upstream test that needs them. Option 2b, a byte-string type in AD-9, changes the spine and stays the Maintainer's.

## 3. Enum and `Serializable` payloads: option 3a

No AD defines a ported enum model yet, so an `E:` payload names a case that cannot be loaded. `phpUnserialize` returns `false` for it, as PHP does for an enum it cannot load. A `C:` payload is read as PHP 8.5 reads one for a class with no `unserialize()`: an incomplete object, or an empty one for `stdClass`, with its data dropped. XT-runtime-25's signed Oracle rows already show this. No JS `unserialize` method is called. The Story that first ports a backed enum or a `Serializable` class adds the `E:` / `C:` hooks to both functions, in `packages/runtime/**`, with Oracle rows.

## 4. The Closure error: option 4a

`phpSerialize` throws a JS `Error` with PHP's message, `Serialization of 'Closure' is not allowed`. DIV-9.8 already covers an `Error` standing in for PHP's `Exception` until Story 9.10 publishes the `\Error` / `\Exception` split. When Story 9.10 ports `Exception`, it switches this throw to `Exception`, in the same package, and asserts the class in XT-runtime-24. Its line in sprint status points to this part.

## Rationale

- **The grader is unchanged.** No assertion, expected value, skip or `adapted:` marker changes. Part 1 adds Oracle rows; it removes none.
- **Each option moves toward PHP.** Part 1 makes the bytes of non-public properties and the defaults match PHP. Parts 3 and 4 match what PHP does today for the payloads and errors that Xaravel can represent. Part 2 is AD-9 as written.
- **No measurable cost.** The table is read once per object, only when present, and only on the default path.

This ruling clears XT-runtime-24 and XT-runtime-25. Story 9.7 is unblocked and resumes at `in-progress` to land part 1.
