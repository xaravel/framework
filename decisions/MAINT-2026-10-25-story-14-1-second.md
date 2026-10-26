---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Story 14.1 (Enumerable core), ESC-14.1-5 to ESC-14.1-8
---

# Maintainer ruling: Story 14.1, second round

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. It approves the orchestrator's recommended option on each of Story 14.1's four second-round Escalations (#457), with the monitor's agreement. The first round is `decisions/MAINT-2026-10-25-story-14-1.md`.

| Escalation | Option | What it adds |
|---|---|---|
| ESC-14.1-5 | 1 | DIV-12.18: `yield $k => $v` is `yield keyed(k, v)`, `yield from` is `yield* yieldFrom(...)`; the runtime adds PHP's `Generator` |
| ESC-14.1-6 | 1 | `@xaravel/runtime/php` exports the PHP functions Collections calls and the `(array)` cast (`toPhpArray`) |
| ESC-14.1-7 | 1 | DIV-12.19: a class-name dataset value used as a value is written `fqcn(c)` |
| ESC-14.1-8 | 1 | DIV-12.17 covers every `ArrayAccess` object; a test with index reads and writes records DIV-12.17 |

## The route

1. **Infrastructure first.** Action item `epic-14-item-2-runtime-generators-functions` builds the runtime half of ESC-14.1-5 and ESC-14.1-6, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime` and `packages/contracts`, as for `epic-14-item-1-runtime-php-types`.
   - **What it builds:**
     - `keyed`, `yieldFrom` and PHP's `Generator` (`current`, `key`, `next`, `valid`, `send`, `rewind`, `getReturn`). `Generator` wraps a JS generator object and is registered as an `Iterator` and a `Traversable`. Its `[Symbol.iterator]` yields values and `entries()` yields `[key, value]` pairs. `rewind` throws once the generator has advanced past its first yield, as PHP's does.
     - PHP's functions, under their PHP names: `is_scalar`; `in_array` (loose and strict); `array_combine`; `array_filter` (with `ARRAY_FILTER_USE_KEY` and `ARRAY_FILTER_USE_BOTH`); `array_unique` (`SORT_STRING`, `SORT_REGULAR`, `SORT_NUMERIC`, keeping PHP's keys); `range` (ints, floats, numeric strings and characters, with PHP 8.3's rules and errors); `iterator_to_array` (with `preserve_keys`); `iterator_count`; `str_starts_with`; `substr`.
     - PHP's `(array)` cast as `toPhpArray`, which returns a `PhpArray`. An object gives its properties with PHP's mangled protected and private names, as `phpSerialize` reads them.
   - **Tests:** XT-runtime cases for each export, against PHP's documented results.
   - **Limits:** no other runtime behaviour changes, and the runtime does not import contracts (AD-2).
   - The loop takes action items before Stories, so this lands first.
2. **Then Story 14.1.** It resumes and ports its Test IDs under these rulings, DIV-12.18, DIV-12.19 and the amended DIV-12.17. testEnsureForObjects `#0` / `#1` stay `blocked-by:support` (`class_basename`), and testDump stays `blocked-by:support` (VarDumper). No assertion is removed or weakened.

PORTING.md's construct table gains a row for generators, its idiom table a row for `(array)`, and its data-provider rule cites DIV-12.19.
