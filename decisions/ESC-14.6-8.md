---
decision: approved
decided_by: monitor
date: 2026-10-28
escalation_sha256: "66063b2a0320f7f44069f413d091b0c8e1823417c0b3e113b805e3d72e1f9814"
---

# ESC-14.6-8: approved, the runtime's offset assignment `offsetAssign`

The monitor approved the orchestrator's recommended option on 2026-10-28 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` and its amendment for PHP language constructs. It adds a helper for a PHP language construct to `packages/runtime` only, with PHP 8.5.11 behaviour checked against PHP, and its PORTING.md idiom-table row. There is no expected-value or grader change. The indirect-modification notice is already omitted under DIV-9.17, and the Maintainer widened DIV-9.17 on 2026-10-28, in the Maintainer's session, to cover the false-to-array deprecation too. The Maintainer was told of the approval in the same session. The route is in `decisions/MAINT-2026-10-28-story-14-6-fourth.md`.

`@xaravel/runtime/php` exports `offsetAssign(ref, key, value)`, PHP's `$x[$k] = $v` (and `$x[] = $v` with `key` `null`) on whatever value the `Ref` holds, as PHP 8.5.11 assigns it:

- an array, in any of the runtime's array forms, takes the key or the next integer key;
- `null` and `false` become an array first; PHP's deprecation for `false` is not raised (DIV-9.17);
- any other scalar throws PHP's `Error` `Cannot use a scalar value as an array`, after the writes PHP makes before it;
- a string takes PHP's string-offset write rules, numeric and non-numeric offsets and their errors included;
- an `ArrayAccess` object gets `offsetSet`, keeping its handle;
- it composes with `offsetReference` for nested writes, so one helper owns PHP's implicit offset writes.

XT-runtime cases compare each with PHP, including the Escalation's pinned case. Collections makes no offset write of its own. The runtime's recursive `valueCopy` depth limit that the Escalation notes is out of scope. This is action item `epic-14-item-15-runtime-offset-assign`.
