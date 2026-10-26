---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "ff4c6d5aa30a4cc67d4ab4629db0afbb80467aa6b35af32a0c3c794deee9356c"
---

# ESC-14.1-6: approved, option 1, the runtime exports the PHP functions and the `(array)` cast Collections calls

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four of Story 14.1's second-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1-second.md`.

`@xaravel/runtime/php` exports `is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique`, `range`, `iterator_to_array`, `iterator_count`, `str_starts_with` and `substr` under their PHP names, as PORTING.md keeps a bare function name verbatim. It also exports PHP's `(array)` cast as `toPhpArray`, beside `toInt`, `toFloat`, `toPhpString` and `toBool`. For an object, `toPhpArray` gives its properties with PHP's mangled protected and private names, as `phpSerialize` reads them. Collections, Support and later packages then share one implementation. Private copies in `packages/collections` (option 2) would be a second implementation of PHP semantics, which PORTING.md and AD-19 forbid, and `(array)` would silently lose protected and private properties. This is action item `epic-14-item-2-runtime-generators-functions`.
