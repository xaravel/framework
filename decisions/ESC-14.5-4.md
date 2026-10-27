---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "d0c939c65052d56a697cd8b0ad8a16290fd70e35904233ef9e2a48bddc903453"
---

# ESC-14.5-4: approved, option 1, the runtime closes a generator it owns when enumeration stops early

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its 2026-10-26 amendment for PHP language constructs). It adds PHP builtins or construct helpers to `packages/runtime` only, with PHP 8.5.11 behaviour checked against the Oracle, and no DIV clause, expected value or grader file changes. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-5.md`.

**What PHP does.** It destroys an unreferenced temporary generator when a `foreach` stops early, which runs the generator's `finally`. A generator that is still referenced elsewhere stays resumable after `break`.

**What the runtime does.** The runtime's `Generator` gets an ownership seam:

- A `Generator` that the framework creates for its own enumeration is owned. `LazyCollection::makeIterator` wrapping a source generator function is the case here. When enumeration over an owned generator stops early (a `break`, `return false` from a callback, or an exception), the runtime closes the generator it wraps, so `finally` runs once.
- A `Generator` the user holds, or passed in, is not owned. Early exit leaves it resumable, as in PHP.

XT-runtime cases against the Oracle cover both lifetimes. Unwrapping or exhausting the generator in collections (option 2) would bypass the runtime and run source code the user never asked for. This is action item `epic-14-item-10-runtime-chunk-sort-arith-callables`.
