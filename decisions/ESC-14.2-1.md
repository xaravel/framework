---
decision: approved
decided_by: monitor
date: 2026-10-26
escalation_sha256: "748c21333f1bbb38739ba1a5884298b50f08e08cecd426d91be6dac658b7aeda"
---

# ESC-14.2-1: approved, option 1, the runtime exports the PHP array functions and builtins Story 14.2 calls

The monitor approved the orchestrator's recommended option on 2026-10-26 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`. The Escalation is a `contract` Escalation that only adds PHP builtins to `packages/runtime`, under their PHP names, with no divergence. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-26-story-14-2.md`.

The runtime adds the following, each under its PHP name and with PHP's behaviour, with XT-runtime cases against PHP's results:

- **Array functions** over AD-9's three array forms, keys kept as PHP keeps them: `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search` (loose and strict), `array_flip`, `array_slice` (with `preserve_keys`), `array_reverse` (with `preserve_keys`), `array_intersect_key` and `array_intersect_assoc`.
- **By-reference array functions** over a `Ref<T>` (AD-9, DIV-9.2), renumbering integer keys as PHP does: `array_shift`, `array_pop`, `array_unshift` and `array_splice`.
- **Other functions:** `min`, `max`, `str_contains`, `strlen`, `lcfirst`, `property_exists`, `method_exists`, and `asort` / `arsort` with PHP's sort flags over the existing zend sort.
- **PHP's identity operator** for arrays and objects, as the exported `identical(a, b)`, which today is internal. PORTING.md's idiom table names it for a `===` whose operand can be a PHP array, as it names `looseEquals` for `==`.
- **PHP names** beside the existing camelCase exports: `is_numeric` beside `isNumeric`, and `is_float` beside `isFloat`.
- **Builtin classes:** `Random\Randomizer` with `pickArrayKeys`, and PHP 8.6's `SortDirection` enum (from symfony/polyfill-php86) as an AD-26 enum.

Private copies in `packages/collections` (option 2) would be the second implementation that PORTING.md and AD-19 forbid. This is action item `epic-14-item-5-runtime-array-functions`.
