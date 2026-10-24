---
title: 'Retro item epic-9-item-1: consequence row for the contracts Component'
type: 'chore'
created: '2026-10-21'
status: 'done'
baseline_revision: 'f107215fb835c0a0943033aa7fc374c8025cf967'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Action item `epic-9-item-1-consequence-rows` (ruling `decisions/ESC-9.1-3.md`) requires a `CONSEQUENCE_SOURCES` row and a generated `conformance/xaravel-consequences/<component>.jsonl` for every Phase 1 Component without one, before its first Story with Xaravel Tests. Phase 1 is `runtime` then `contracts` (spine AD-27, line 544). `runtime` has its Maintainer-set row; `contracts` (Epic 10) has none, so Story 10.x's XT tests would hit the same gap ESC-9.1-3 raised.

**Approach:** Apply the ruling's rule to `contracts`: the FRs and ADs of every Capability Map row whose "Lives in" names `contracts` (none: no row names it; the `packages/*` wildcard of the Packages row is not a naming, the same reading that gave `runtime` no FR-10..14), plus every AD whose Rule names the package (`@xaravel/contracts` or `packages/contracts`), keeping only ADs with a Rule bullet list. Result: `contracts: { frs: [], ads: [1, 2, 6, 11, 16, 25, 27] }` (AD-22 also names it but its Rule is a table, like AD-26 for runtime; AD-21's "Contracts." bullet names contracts in general, not the package). Generate the file and test the row against a derivation from the spine text.

## Boundaries & Constraints

**Always:** Change only `tools/xt-coverage/consequences.ts` (the row and its doc comment), the generated `conformance/xaravel-consequences/contracts.jsonl` (via `bun run xt:consequences`, never by hand), and `conformance/tests/xaravel/done-check.test.ts`. The test derives the contracts AD set and the empty FR set from the spine (Capability Map table and AD Rule regions), not from a copy of the expected list (lessons, epic 8).

**Never:** Change the `runtime` or `conformance` rows (Maintainer-set), the spine, PRD, `AGENTS.md`, `packages/**`, `conformance/expectations/**`, or the generator's parsing rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate | `bun run xt:consequences` | writes `contracts.jsonl` with AD-1.k, AD-2.k, AD-6.k, AD-11.k, AD-16.k, AD-25.k, AD-27.k lines in order | none |
| Drift | `bun tools/xt-coverage/consequences.ts --check` | exit 0, empty stderr | non-zero naming the file if it differs |
| Derivation | spine text | ADs whose Rule region names `@xaravel/contracts` or `packages/contracts` and that `spineRules` lists = row's `ads`; no Capability Map "Lives in" cell names `contracts` = row's empty `frs` | test fails naming the mismatch |

</intent-contract>

## Code Map

- `tools/xt-coverage/consequences.ts:43-52` -- `CONSEQUENCE_SOURCES` and its doc comment; add the `contracts` row after `runtime`.
- `tools/xt-coverage/consequences.ts` `spineRules`, `expectedFiles` -- reuse `spineRules` for "has a Rule bullet list"; `expectedFiles` keys follow row order.
- `conformance/tests/xaravel/done-check.test.ts:64-80` -- XT-conformance-126 asserts `expectedFiles` keys and each row; extend for `contracts`.
- `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md:647-668` -- Capability Map table (read-only); AD sections `### AD-<n> ` with `- **Rule:**` blocks ending at the next column-0 `- **<Field>:**` line or heading.
- `decisions/ESC-9.1-3.md` -- the rule; `runtime` row there is a Maintainer choice and is not re-derived.

## Tasks & Acceptance

**Execution:**
- `tools/xt-coverage/consequences.ts` -- add `contracts: { frs: [], ads: [1, 2, 6, 11, 16, 25, 27] }` and extend the doc comment with how it was derived (ESC-9.1-3) -- the action item.
- `conformance/xaravel-consequences/contracts.jsonl` -- generate with `bun run xt:consequences` -- generated data.
- `conformance/tests/xaravel/done-check.test.ts` -- in XT-conformance-126: expect the three files; add a spine-derived check of the contracts row (AD Rule regions naming the package, filtered by `spineRules`; Capability Map "Lives in" cells naming `contracts`), and assert `contracts.jsonl` begins with `AD-1.1` and holds every listed AD's `.1` -- test for the row.

**Acceptance Criteria:**
- Given the branch, when `bun tools/xt-coverage/consequences.ts --check` runs, then it exits 0.
- Given the spine, when XT-conformance-126 runs, then the contracts row equals the derivation and the test passes.
- Given `bun run xt:coverage contracts`, when no contracts XT tests exist, then it lists every contracts consequence as uncovered (proves the file is readable by the coverage tool).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 19 findings — high 1, medium 4, low 6, false 3, maybe-false 0 (5 grouped into the intent_gap entry; the rest moot under it)
- findings:
  - `high` `intent_gap` (blind-hunter, intent-alignment R4) The test's "Rule names its package" reading, run on `runtime`, gives AD [1, 2, 4, 5, 9, 10, 23, 27], not the Maintainer's [2, 5, 6, 9, 10, 23]; the ruling says every Component gets a row "the same way", and no mechanical rule reproduces that precedent — verified with the test's own Rule-region scan (`@xaravel/runtime|packages/runtime`).
  - `medium` `intent_gap` (blind-hunter) Empty FRs were justified as "the reading that gave runtime no FR-10..14", but the Foundation and Support rows name `runtime` in "Lives in" and runtime still has no FR-18..26, so the precedent does not support the wildcard reading — verified in the Capability Map (spine lines 654-655).
  - `medium` `intent_gap` (intent-alignment R2/R5) Whether `packages/*` names `contracts` (adds FR-10..14, AD-3, AD-18) and whether Epic 10's own "Covers: AD-1, AD-27; supports FR-10, FR-19, FR-21" should decide the row are unsettled readings with different rows.
  - `medium` `intent_gap` (blind-hunter, edge-case) Incidental mentions pull all of AD-16, AD-2.10, most of AD-6, AD-11.2-11.6, AD-25.5/25.7 and AD-27.1/27.3 into `contracts`; AD-16.1..9 already count as covered by conformance XT tests (`xt:coverage contracts`: covered=9 uncovered=45), and the rest no contracts test can cover — whether "names" means "mentions" or "governs" is the Maintainer's reading.
  - `medium` `intent_gap` (blind-hunter) AD-22's `@xaravel/contracts/psr` row is real Phase 1 work but gets no consequence ID because its Rule is a table (as AD-26 for runtime); how table Rules are covered is not settled by the ruling.
  - `low` moot (blind-hunter) Test derivation is circular: checked only against the row it was written to produce — moot under re-derivation.
  - `low` moot (blind-hunter) Test drops the "ADs of every Capability Map row" half of the clause — moot.
  - `low` moot (blind-hunter, edge-case) FR extraction handles only `a..b` ranges — moot.
  - `low` moot (blind-hunter) File assertions weak; could compare to `consequencesFor` — moot.
  - `low` moot (blind-hunter) Test re-parses the spine instead of a shared helper — moot.
  - `low` moot (edge-case) `contracts[0]` on an empty file throws a TypeError rather than failing an assertion — moot.
  - `false` (blind-hunter) Capability Map filter is O(n²) and fragile — 20-line table; no harm named.
  - `false` (blind-hunter) The change edits `done-check.test.ts`, outside "consequences.ts and the generated files only" — the ruling's "tests for each row" in the item requires a test; the scope is the action item's, not exceeded.
  - `false` (blind-hunter) Spec missing from the reviewed diff — the spec is the claims file by design.
  - `low` moot (edge-case) Rule region could run past the list into trailing prose — moot.
  - `medium` moot (edge-case claim) Spec AC3 "lists every consequence as uncovered" is false (covered=9) — folded into the AD-16 reading question above.
  - `low` defer-noted (verification-gap other) `docs/ops/done-check.md:18` says the generator has one row; stale since the runtime row — pre-existing, for the PR that lands the contracts row.
  - `low` moot (blind-hunter) Spec says "reuse spineRules" but test copies parsing — moot.
  - `low` moot (intent-alignment) AD-19-style inline Rule lists count as "no Rule list" — no contracts AD affected today.
- Attempt saved: `_bmad-output/implementation-artifacts/retro-9-consequence-rows-attempt.patch` (removed by epic 10 item 8; recover it with `git show 8a25e3ba:<that path>`) (row `contracts: { frs: [], ads: [1, 2, 6, 11, 16, 25, 27] }`, generated file, test); code changes reverted.

## Verification

**Commands:**
- `bun tools/xt-coverage/consequences.ts --check` -- expected: exit 0
- `bun test conformance/tests/xaravel/done-check.test.ts` -- expected: all pass
- `bunx tsc --noEmit -p .` and `bunx oxlint` (repo scripts if defined) -- expected: clean

## Auto Run Result

Status: blocked
Blocking condition: intent gap. ESC-9.1-3's general rule ("the FRs and ADs of every Capability Map row whose Lives in names it, plus any AD whose Rule names its package, keeping only ADs with a Rule bullet list") does not reproduce the Maintainer's own `runtime` row, so the `contracts` row cannot be derived "the same way" without choosing a reading. Questions for the Maintainer:

1. Does an AD "name the package" when its Rule merely mentions `@xaravel/contracts` (literal: AD-1, 2, 6, 11, 16, 25, 27), or only when it governs the package (e.g. AD-1, 11, 25, 27, dropping AD-16 and AD-2/AD-6 mentions)? The literal reading gives `runtime` [1, 2, 4, 5, 9, 10, 23, 27], not the approved [2, 5, 6, 9, 10, 23].
2. Does the Packages row's `packages/*` name `contracts` (adding FR-10..14, AD-3, AD-18)? Runtime has no FRs although the Foundation and Support rows name it.
3. Should Epic 10's stated coverage (AD-1, AD-27; FR-10, FR-19, FR-21) set the row instead?
4. AD-16.1..9 are shared with `conformance` and already count as covered for `contracts` by `xt:coverage`; is that acceptable?
5. AD-22 (`@xaravel/contracts/psr`) and AD-26 have table Rules and get no IDs; how should their obligations be covered?

Saved attempt: `retro-9-consequence-rows-attempt.patch` (R1, the literal reading). Removed by epic 10 item 8; it is in commit 8a25e3ba. It applies cleanly to f107215 and passes `consequences.ts --check`, XT-conformance-126, typecheck and lint. Once the Maintainer picks a reading (or states the row), the orchestrator applies it. No Story 10.x is affected yet: Epic 10 is backlog.
