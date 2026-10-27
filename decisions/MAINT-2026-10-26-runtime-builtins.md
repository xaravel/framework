---
decision: approved
decided_by: Maintainer
date: 2026-10-26
scope: contract Escalations that add a PHP builtin to packages/runtime
---

# Maintainer standing rule: runtime PHP builtins

The Maintainer made this standing rule on 2026-10-26 in the Maintainer's session. Story 14.1 had hit the same blocker three times (ESC-14.1-1, ESC-14.1-6 and ESC-14.1-9): a PHP builtin that the Upstream code calls, and that `@xaravel/runtime` does not export.

## The rule

An Escalation qualifies when all of these hold:

- its trigger is `contract`;
- its recommended option adds PHP builtins (functions, classes, interfaces or their methods) to `packages/runtime`, and `packages/contracts` only for a token;
- each builtin keeps its PHP name and PHP's behaviour, with XT-runtime cases against PHP's results;
- it adds or changes no DIV clause, changes no expected value, and touches no grader file.

For a qualifying Escalation, the monitor acts as the second key. It reviews the recommendation, and if it agrees, approves it without waiting for the Maintainer. It writes the decision files and the action item as for any ruling, and tells the Maintainer afterwards. Each decision file records `decided_by: monitor` and cites this rule.

## What still goes to the Maintainer

- Any divergence, new or changed DIV clause, or `php-only` Skip Reason.
- Any change to the grader or to an expected value.
- An Escalation where the monitor disagrees with the loop's recommendation.
- An Escalation that would put PHP semantics outside `packages/runtime`.

Every Escalation approved under this rule is listed in the epic's retrospective input, so the Maintainer can review them together.

## Amendment 2026-10-26: helpers for PHP language constructs

The Maintainer widened this rule on 2026-10-26 in the Maintainer's session, when ruling on ESC-14.2-7. An Escalation also qualifies when all of these hold:

- its recommended option adds to `packages/runtime` a helper for a PHP language construct, such as an operator or a dynamic call, that has no PHP function name;
- the helper reproduces PHP's behaviour, with XT-runtime cases against PHP's results;
- the only other change is a row in PORTING.md's idiom table that names the helper for that construct.

Two helpers already take this form: `identical(a, b)` for `===` on arrays (ESC-14.2-1, approved by the monitor before this amendment) and `callMethod(object, name, ...args)` for `$o->$name(...)` (ESC-14.2-7).

These still go to the Maintainer, beside the list above:

- any DIV clause;
- any change to an expected value or to the grader;
- any change to PORTING.md other than an idiom-table row, a construct-mapping (AD-26) row included.

