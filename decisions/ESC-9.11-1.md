---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "05ae73221e36ea9a5fe92389b7774cdb197c2c3dd98ade50932c223baaece403"
---

# ESC-9.11-1: approved, option 1 (split Story 9.11 by component)

Story 9.11 (component `assert`) keeps every acceptance criterion that lies inside `packages/assert/**`. Mockery's part becomes its own Story. Options 2 (let `story/9.11` edit `packages/mockery/**`) and 3 (defer AC4, AC5 and the Mockery half) are not taken.

## The split

- **Story 9.11** (`assert`):
  - AC1: the float marker in `phpStrictEquals` and `assertSame`, XT-assert-17.
  - The grader half of AC2, XT-assert-18:
    - the grader's exceptions extend the runtime's SPL classes;
    - `expectException(\RuntimeException::class)` matches a PHPUnit failure;
    - `ExceptionComparator` takes only `\Exception`s.
  - AC3: the message rewrite, XT-assert-19.
  - AC4: the PHPUnit test-double return types and defaults (ESC-4.7-1 item 2), as the new XT-assert-20.
  - AC5: late assertions (ESC-5.3-3), as the new XT-assert-21.
- **Story 9.12** (`mockery`, new, after 9.11):
  - Mockery's exceptions, the copies in `packages/mockery/src/php/`, extend the runtime's SPL classes when its class map is published, and keep today's chain when it is not (ESC-4.5-1 item 2), as XT-mockery-12.
- **A planning change, after both Stories land:**
  - It records in `decisions/DIV-9.md` that DIV-9.8 is closed, naming both Stories.
  - It updates the `PORTING.md` line that cites DIV-9.8.
  - `decisions/` and `PORTING.md` are Protected, so neither Story writes them.

## Changes in this ruling's PR

- **`_bmad-output/planning-artifacts/epics.md`:**
  - Story 9.11's "I want" line and second criterion now name the grader only.
  - Story 9.12 is added with its two criteria.
- **Manifests:**
  - `stories/9.11.md` gains XT-assert-20 and XT-assert-21.
  - `stories/9.12.md` is created, `backlog`, with XT-mockery-12.
- **Sprint status:** Story 9.11 is `in-progress`; Story 9.12 is added as `backlog`.
- **Story 9.11's spec:** `in-progress`, with the follow-up in its change log.

## Design note for both Stories

The Escalation records this. The runtime publishes `Symbol.for('xaravel.php.classes')` only once one of its package indexes loads, and the harness preload loads nothing graded. The grader also freezes its exported classes and prototypes (XT-assert-3). So neither package can extend the runtime's classes statically at module load. Each resolves them lazily and keeps today's chain when the map is absent.

## Not blocking

The Escalation also recorded this. ESC-4.1-1 placed the integral-float `===` matrix in `conformance/oracle-requests/4.1.jsonl`, but `story/9.11` may write only `9.11.jsonl`. The matrix lands there under XT-assert-17, and `4.1.jsonl` and XT-assert-1 stay unchanged.

## Rationale

- **Each Story stays within its own Component**, so the ownership rule and the Fidelity Review's Story scope (ESC-9.10-3, ESC-9.10-4) apply as they are.
- **Every open item keeps an owner:** ESC-4.7-1 item 2, ESC-5.3-3 and ESC-4.5-1 item 2.
- **No assertion, expected value or skip is weakened.** Two Xaravel Tests are added to Story 9.11, and one to Story 9.12.

This ruling clears ESC-9.11-1 for XT-assert-18. Story 9.11 resumes at `in-progress`, re-applies `spec-9-11-attempt-1.patch` under ESC-9.11-2's rule, and builds XT-assert-18 (the grader's half), XT-assert-20 and XT-assert-21.
