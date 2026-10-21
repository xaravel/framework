---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "0dd696f67143db208ff298321a7e66a8a60ecda8c223d35fb668e4419d0e0a07"
---

# ESC-9.4-1: approved, options 1a and 2a; part 3 by a route that needs no new scope

None of the three parts weakens the grader, adds a divergence outside DIV-1..12, or moves Xaravel away from AD-10 as written, so the orchestrator rules on them (MAINT-2026-10-16).

## 1. The async-path miss: option 1a

AD-10.4 names the async miss path and its `await import()`, so the spine itself decides that module loading on that path is async. This ruling is the Escalation AD-6 asks for to add it as a root:

- `@xaravel/runtime/registry` gains one public function, `resolveClassAsync(fqcn)`, returning `Promise<class>`. On a miss it `await import()`s the file the classmap or the PSR-4 map gives, then resolves as `resolveClass` does, with the same `Class "<FQCN>" not found` message when the file does not register the class.
- Its doc comment carries `@asyncRoot Registry.resolveClassAsync`. F-9 judges that tag true by this ruling. Every public method that awaits it is async because it reaches this root, as AD-6's Derivation says, and tags it the same way.
- `resolveClass` stays sync and never imports. No other module-loading root is added.

Option 1b (a sync `require()`) departs from AD-10.4's text and is not taken.

## 2. The classmap's encoder: option 2a

Story 9.4 lands the default-flags core of `jsonEncode(value)` in `packages/runtime/src/php/`, exported from the `./php` subpath (ESC-9.1-1), as ESC-9.1-2 landed the Registry core early. It encodes `null`, booleans, integers, strings, lists and plain objects with string keys, with PHP's default escaping (`\/`, `\uXXXX` for non-ASCII, surrogate pairs, control characters), and throws a `TypeError` for any other value. `writeClassmap` encodes with it; `loadClassmap` reads with `JSON.parse`.

Story 9.8 keeps every acceptance criterion and removes nothing from this core: it adds the flags, floats, hooks, `bigint` and the Oracle Differential tests. `epics.md` does not change.

## 3. The scan's tests: neither 3a nor 3b

Option 3a would read the Maintainer's Epic 6 item 9 ruling ("only for those paths") as covering a path it does not name, and the 2026-10-17 ownership amendment keeps such a path blocking for an Epic 9 Story. That reading is the Maintainer's, so it is not taken. Option 3b needs a Maintainer-approved PR, so it is not taken either.

Instead, the same-file rule and its tests leave Story 9.4 and land with this ruling, on its `planning/esc-9.4-1` branch. A `planning/*` branch may change `tools/**` and `conformance/tests/**` (item 15 of `decisions/MAINT-2026-10-17-epic-1-items.md` bars only `packages/**` and `conformance/expectations/**`), and its expected `protected-paths` failure merges under the first amendment of MAINT-2026-10-16. The rule is the one Epic 6 retro item 9 (R3) assigns and the Maintainer approved; only its route changes:

- `tools/registration/registration.ts`: in every package, graders included, the class a conforming `registerClass('<FQCN>', X)` names must be a top-level non-`declare` class or class-expression binding declared in that file. Otherwise the scan fails at the call with `registers <X>, which is not a class declared in this file; a class is registered only in the file that declares it` (`sameFileMessage`).
- `conformance/tests/xaravel/registration.test.ts`: XT-conformance-141 gains the same-file cases (an imported class, a default or namespace import, a non-class binding, a `declare` class, an undeclared name, a grader package, and every declaring form that passes). No assertion is removed or changed.
- `docs/ops/registration.md` documents the rule.
- The real repository passes: `registration: ok (294 files, 1 registrations)` on this branch.

Story 9.4 then edits only `packages/runtime/**`, its spec, its status lines and its Escalations. It still re-checks the scan against its own new registrations by running `bun run registration:check` (Epic 6 retro V1), and a mismatch raises an Escalation.

Story 9.4 is unblocked and resumes at `ready-for-dev` from its spec.
