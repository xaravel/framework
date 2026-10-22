---
test_ids:
  - XT-assert-18
trigger: protected-path
proposed: >-
  Option 1 (recommended): split by component. Story 9.11 (component
  `assert`) keeps everything inside `packages/assert/**`: AC1, AC3, the
  grader half of AC2 (PHPUnit's exceptions on the runtime's SPL classes,
  `expectException(\RuntimeException::class)` matching a PHPUnit failure,
  `ExceptionComparator` taking only `\Exception`s), AC4 and AC5. A planning
  change adds `XT-assert-20` (AC4) and `XT-assert-21` (AC5) to
  `stories/9.11.md`, and a new Story in `epics.md` (component `mockery`,
  after 9.11) takes the Mockery half of AC2 (ESC-4.5-1 item 2: Mockery's
  exceptions on the runtime's SPL classes). DIV-9.8's closing sentence in
  `decisions/DIV-9.md`, and the `PORTING.md` line that cites it, are
  written by that planning change once both halves have landed. Option 2:
  amend the MAINT ruling so `story/9.11` may also edit
  `packages/mockery/**`, and add the two XT ids to the manifest; the
  Story then does all five ACs as written. Option 3: keep the manifest as
  it is and drop AC4, AC5 and the Mockery half from Story 9.11 into a
  later Epic; that leaves ESC-4.7-1 item 2, ESC-5.3-3 and ESC-4.5-1 item 2
  without an owning Story.
evidence: >-
  `stories/9.11.md` is `component: assert` with `xaravel_test_ids`
  XT-assert-17..19, mapped to "Story 9.5's float marker", "Story 9.10's SPL
  and \Error/\Exception protocol" and "a caught assertion failure"; it
  cites `epics.md` line 3172. `epics.md` (lines 3231-3257) now gives the
  Story five ACs: AC4 (ESC-4.7-1 item 2, PHPUnit double return types and
  defaults) and AC5 (ESC-5.3-3, late assertions) have no Xaravel Test in
  the manifest, and a Story may change only its manifest's `status:` line
  (`tools/ownership/ownership.ts`, `statusOnlyChange`). AC2 says "the grader
  and Mockery throw or compare exceptions ... their exceptions extend the
  runtime's SPL classes"; Mockery's SPL copies are in
  `packages/mockery/src/php/` (Exception, RuntimeException, LogicException,
  BadFunctionCallException, BadMethodCallException,
  InvalidArgumentException, OutOfBoundsException,
  UnexpectedValueException), and `allowedPath` lets `story/9.11` edit only
  `packages/assert/**`. The MAINT ruling's second amendment says an
  out-of-scope path in a Story from Epic 9 on still blocks. DIV-9.8's text
  says the Story that closes it records that in the clause; `decisions/`
  and `PORTING.md` are Protected. Design note for whichever Story does AC2:
  the runtime publishes `Symbol.for('xaravel.php.classes')` only once one
  of its package indexes loads, the harness preload loads nothing graded,
  and the grader freezes its exported classes and prototypes (XT-assert-3),
  so the grader cannot extend the runtime's classes statically at module
  load; it must resolve them lazily and keep today's chain when the map is
  absent.
---

# ESC-9.11-1: Story 9.11's manifest and component cover only part of its acceptance criteria

`epics.md` gives Story 9.11 five ACs. Its manifest maps Xaravel Tests to the first three only, and its component (`assert`) lets the Story edit `packages/assert/**` only, while AC2 also asks for a change to `@xaravel/mockery`. Closing DIV-9.8 also needs a line in `decisions/DIV-9.md`. All three are Protected Paths or outside the Story's allowed paths, so the route is the Maintainer's.

This stops XT-assert-18 (AC2), and AC4 and AC5, which have no Test ID yet. The Story carries on with XT-assert-17 (AC1) and XT-assert-19 (AC3), which need nothing outside `packages/assert/**` and `conformance/oracle-requests/9.11.jsonl`.

One more point, recorded here for the Maintainer and not blocking: ESC-4.1-1 puts the integral-float `===` matrix in `conformance/oracle-requests/4.1.jsonl`, but `story/9.11` may write only `conformance/oracle-requests/9.11.jsonl`. The Story writes the matrix there, under XT-assert-17, and leaves `4.1.jsonl` and XT-assert-1 unchanged.
