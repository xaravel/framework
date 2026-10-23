---
decision: approved
decided_by: Maintainer
date: 2026-10-23
scope: Epic 9 retro action items 5 (finding L11, a throwable as a message) and 6(b) (finding L12, throwable equality); new clause DIV-9.12
---

# Maintainer ruling: throwables get PHP's file, line, trace and string form

The Maintainer gave this ruling on 2026-10-23, in the Maintainer's session.

## Why

Two findings of the Epic 9 retrospective share one cause: the runtime's throwables port none of PHP's `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` or `__toString()` (`packages/runtime/docs/exceptions.md`, "Not ported").

- **L11 (item 5, #329).** PHP accepts a throwable as an exception's message: coercive mode converts it through `__toString`. The runtime rejects it, and so do the grader's exception copies. Both Fidelity reviewers rejected item 5 on F-7 for it.
- **L12 (item 6(b)).** PHPUnit's `ObjectComparator` compares an object's `(array)` cast. For a throwable that includes `file`, `line` and `trace`, so two `\Error`s made on different lines are unequal in PHP. The grader compares only message, code and previous, so `assertEquals(new Error("a"), new Error("a"))` passes where PHP fails it.
- **DIV-9.9** calls the missing `file`, `line` and `trace` a message-only difference. L12 shows it changes an outcome.

## The ruling

- **The runtime ports the five methods.** Every runtime throwable, and every JS `Error` the runtime accepts as a `Throwable` (`previousArgument`), has PHP's `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` and `__toString()`. The values name the JavaScript call site, recorded as **DIV-9.12**:
  - **File and line:** the source path and line of the frame that constructed the throwable, as the JS stack gives them.
  - **Trace:** the frames above it, in PHP's array shape (`file`, `line`, `function`, and `class` and `type` where the frame has them), without `args`.
  - **String forms:** `getTraceAsString()` and `__toString()` use PHP's format (`<FQCN>: <message> in <file>:<line>`, `Stack trace:`, `#<n> …`, `{main}`, and the `Next …` chain for a previous throwable).
  - **Cost:** the stack is parsed on first read, never at construction, so building a throwable costs what it does today.
- **Outcomes follow PHP.**
  - A throwable is a valid string argument: the runtime and the grader's copies convert it through `__toString`, as coercive mode does.
  - `ObjectComparator` compares a throwable's `file`, `line` and `trace` with its other properties, as PHP's `(array)` cast does. Two throwables made at different call sites are then unequal, as in PHP.
- **The work is item 5's.** Item 5's `action` now names `packages/runtime` beside `packages/assert` and `packages/mockery`, and takes finding L12 from item 6. It leaves `waiting_on_maintainer`, and the loop resumes it from its saved branch.
- **Item 6 keeps only (a)**, the grader's float constructor (finding S3), which still waits on me.
- **Not taken:** a clause recording that Xaravel rejects a throwable as a message and ignores file, line and trace in equality. Both would keep outcomes PHP does not have.

## DIV-9.12

The clause, added to `decisions/DIV-9.md`, says only where the values come from. Their shape and the outcomes that depend on them follow PHP.

- No Ported Test is adapted under it.
- An Upstream assertion on a specific file, line or trace text raises an Escalation (FR-114).
- DIV-9.9 stays: the grader's export of an exception may keep its message-only difference.
- No Oracle row is required. The rule follows PHPUnit's source and PHP's documented `Throwable` format, and the item route cannot sign fixtures (MAINT-2026-10-22-epic-9-item-3-split). A row can come with a later Story.

## Changes in this ruling's PR

- **`decisions/DIV-9.md`:**
  - clause DIV-9.12;
  - a Behaviour bullet;
  - this file added to `sources`.
- **Sprint status:**
  - item 5's `action` is widened;
  - item 6's `action` is narrowed to (a).
- **`retro-gates.yaml`:** item 5 leaves Epic 9's `waiting_on_maintainer`.
- **Retrospective:** findings L11 and L12 record the ruling.
