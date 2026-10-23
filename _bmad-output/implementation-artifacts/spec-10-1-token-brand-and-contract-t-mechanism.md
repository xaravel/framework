---
status: in-progress
---

# Story 10.1: Token, brand and `contract<T>()` mechanism

## Auto Run Result

Status: blocked
Blocking condition: prerequisite not landed. `decisions/ESC-9.1-3.md` (Maintainer, 2026-10-21) requires a `CONSEQUENCE_SOURCES` row and a generated `conformance/xaravel-consequences/contracts.jsonl` "before that Component's first Story with Xaravel Tests" (action item `epic-9-item-1-consequence-rows`). Story 10.1 is the first `contracts` Story and its manifest lists XT-contracts-1..4, so it cannot start until that row lands. The row itself waits on the Maintainer's reading of the ESC-9.1-3 rule: see the five questions in `spec-retro-9-consequence-rows.md` (the saved literal-reading attempt is `retro-9-consequence-rows-attempt.patch`).

Stopped at step 1, before planning: no spec, code or tests were written. The compiled `epic-10-context.md` is kept for the resumed run.

Also noted for the resumed run: `epics.md` lists five acceptance criteria for Story 10.1, including "a test double reads a contract token's method names at `Symbol.for('xaravel.contract.methods')`" (ESC-4.5-1 item 3, ESC-4.7-1 item 5). The manifest `stories/10.1.md` maps only four (XT-contracts-1..4) and has no row for that criterion. Every new contracts subpath also needs an approved `SUBPATH_EXPORTS` entry in `conformance/tests/xaravel/scaffold.test.ts` (ESC-9.1-1).
