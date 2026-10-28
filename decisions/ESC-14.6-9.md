---
decision: approved
decided_by: monitor
date: 2026-10-28
escalation_sha256: "aed41faae16c0fb0775ec6868193a8e92123ce9fe4395d6847d5c1780536dfe1"
---

# ESC-14.6-9: approved, the runtime's offset reference `referenceAt` on any receiver

The monitor approved the orchestrator's recommended option on 2026-10-28 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` and its amendment for PHP language constructs. It adds a helper for a PHP language construct to `packages/runtime` only, with PHP 8.5.11 behaviour checked against PHP, and its PORTING.md idiom-table row. There is no DIV clause, expected-value or grader change; notices stay omitted under DIV-9.17. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-28-story-14-6-fifth.md`.

This is the fourth `contract` Escalation for `Arr::push` (ESC-14.6-5, -7, -8, -9), each for one more receiver kind. So the monitor scoped it to PHP's whole reference-acquisition matrix, not only the string case the Escalation found. `@xaravel/runtime/php` exports `referenceAt(ref, key)`, PHP's `$r = &$x[$k]` (and `&$x[]` with `key` `null`) on whatever value the `Ref` holds, as PHP 8.5.11 does it:

- an array, in any of the runtime's array forms: a reference to the slot, created as `null` if missing;
- `null` and `false`: made an array first, as `offsetAssign` does;
- `true`, an int or a float: PHP's `Error` `Cannot use a scalar value as an array`;
- a string: PHP's errors, `Cannot create references to/from string offsets` and the offset-type `TypeError`s, after the writes PHP makes before them;
- an `ArrayAccess` object: `offsetReference(object, key)`, builtin and userland `offsetGet` as ESC-14.6-7 ruled.

Chained with `offsetAssign`, it gives `Arr::set` and `Arr::push` PHP's full traversal. XT-runtime cases compare every receiver kind above with PHP, including the Escalation's four pinned keys. Collections takes no reference of its own. This is action item `epic-14-item-16-runtime-reference-at`.
