---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "4e85af04147d7519db66b231ff2396848e946b15b65aa38edb02c774bb526477"
---

# ESC-14.5-1: approved, option 1, the runtime exports the PHP builtins Story 14.5 calls, with a bounded locale scope

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its 2026-10-26 amendment for PHP language constructs). It adds PHP builtins or construct helpers to `packages/runtime` only, with PHP 8.5.11 behaviour checked against the Oracle, and no DIV clause, expected value or grader file changes. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-5.md`.

`@xaravel/runtime/php` exports the following under their PHP names:

- `array_chunk`, with `preserve_keys`;
- `key`;
- `ksort`, `krsort` and `uksort` over `Ref<array>`;
- `sort` and `rsort` with PHP's sort flags;
- `intdiv`, `floor` and `ceil`;
- `is_subclass_of`, which reads the Class Registry and enum inheritance;
- `call_user_func_array`, through the shared callable resolver;
- `strrev` and `strtolower`;
- `setlocale` and `LC_ALL`;
- `PHP_INT_MIN` and `PHP_INT_MAX`, with PHP's 64-bit values.

**Locale scope, as the Escalation asked the monitor to decide:**

- `setlocale` keeps the locale in a Scope Frame slot (AD-5), not in process state. It returns the current locale when asked with `"0"` or `null`, and it can be restored.
- `strcoll` and `SORT_LOCALE_STRING` read that slot.
- `C` and `POSIX` are always available.
- Any other locale is available only when the runtime reproduces the Oracle's collation for it, checked by XT-runtime cases against the Oracle. For any locale it cannot reproduce, `setlocale` returns `false`, as PHP does on a host that lacks the locale.
- So the runtime never claims a locale whose collation it does not match.

Private copies in `packages/collections` (option 2) would put PHP semantics outside the runtime. This is action item `epic-14-item-10-runtime-chunk-sort-arith-callables`.
