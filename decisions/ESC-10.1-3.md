---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "eda791df2555cfe4f9c3c3b17e701cfc42a0d8c782da21d4d353f00d1f2e2c45"
---

# ESC-10.1-3: approved, option 1 (`fqcn()` reads a frozen token's own FQCN key), built by new Story 9.14

Option 1 is approved. Options 2 and 3 are not taken:
- **Option 2 (function tokens):** both test doubles take every function as a class, and `registerClass` cannot run inside `contract()`.
- **Option 3 (reword the criterion):** Story 10.4's `canonicalToken` and the container need a token's FQCN from `fqcn()`, as AD-10 makes `fqcn()` the one identity lookup.

## The change

`fqcn(value)` in `@xaravel/runtime/registry` returns the value's own `Symbol.for('xaravel.class.fqcn')` string when the value meets all of these:
- it is a non-function object;
- it is frozen;
- it carries that key as an own, non-writable data property whose value is a string.

`contract<T>()` already sets that key on every token, for PHPUnit's `Generator` and Mockery's `DoubleTarget` (ESC-4.3-1 item 1). Any other value behaves exactly as today:
- **A class or an instance** is looked up in the Registry, test frames first.
- **An unregistered class, or an object that is not such a token,** throws as now.
- **`resolveClass`** is unchanged: a token's name never resolves as a class.

## The route

A `contracts` Story does not edit `@xaravel/runtime`, so the change is new **Story 9.14** (component `runtime`), on `story/9.14`:
- XT-runtime-40, a new Xaravel Test, checks the token branch and that every other case is unchanged.
- Epic 9 is `in-progress` until 9.14 is `done`. Its retrospective stays `done`.
- XT-contracts-3 resumes in Story 10.1 once 9.14 lands.

## Changes in this ruling's PR

- **`epics.md`:** adds Story 9.14.
- **Manifest:** `stories/9.14.md` is created, `backlog`, with XT-runtime-40.
- **Sprint status:** Story 9.14 is `backlog`, and Epic 9 is `in-progress`. With ESC-10.1-4, Story 10.1 is `in-progress`.

This ruling clears ESC-10.1-3 for XT-contracts-3, after Story 9.14.
