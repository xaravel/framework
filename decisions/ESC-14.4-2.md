---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "74860d82fb23b5ef5a4a7a69a5e564533ed1f7c2d5668777f83547fba9545b82"
---

# ESC-14.4-2: approved, option 1, PHP callable strings that name a global function resolve to the runtime's export

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement.

The runtime gains a shared resolver from a PHP global-function name to the `@xaravel/runtime/php` export of that name. The runtime's callable handling reads it (`callbackParameter`, and through it every runtime function that takes a callback), and so does `is_callable`. A callable string such as `'strcasecmp'` is then called as the runtime's `strcasecmp`, where Upstream passes it. A name with no export keeps PHP's `TypeError` for an invalid callback.

`decisions/DIV-9.md` is amended in place:

- **DIV-9.13** keeps its rule for `'Class::method'` strings and callable arrays to `when` / `unless`, but a global function name now resolves through the runtime.
- **DIV-9.14** now counts as callable a function name the resolver finds.

PORTING.md's rule that a PHP callable string stays a string literal then holds for these tests with no adaptation. Option 2 would have adapted every such test in this and later Stories.

This goes in action item `epic-14-item-9-runtime-set-functions-callable-names`, with ESC-14.4-1's builtins. Both are needed for the 16 Test IDs.
