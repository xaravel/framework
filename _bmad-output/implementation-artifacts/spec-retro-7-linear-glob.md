---
title: 'Retro 7 item 2: make glob matching linear'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'f58c4f86f4b847d984fabbd655ccdf95c8e0577b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-retro-2026-10-19.md'
warnings: []
deferred:
  - summary: >-
      The Xaravel `-t` name pattern is not anchored at the ID's end, so a glob can match past `": "` into the test description.
    evidence: |-
      Pre-existing: `^(?:<glob>): ` lets `[\s\S]*` cross the first `: `, so `--id '*x*b'` matches `XT-a: foo xb: y`. judgeXaravel re-filters by ID, so results stay correct, but bun test may run extra tests.
    location: >-
      conformance/harness/xaravel.ts xaravelNamePattern
    severity: low
---

<intent-contract>

## Intent

**Problem:** `globToRegExp` (Boost `inventory.get` and the harness `--id`) turns each `*` into `[\s\S]*`, so a glob like `"*t".repeat(14) + "!"` backtracks exponentially and blocks the stdio server for minutes (epic 7 retro finding L2, action item `epic-7-retro-item-2-linear-glob-matching`).

**Approach:** Keep the glob grammar (`*` any run, `?` one character, everything else literal, whole-string match) and the `RegExp` return type, but compile every segment between two `*`s as an atomic lazy search, `(?=([\s\S]*?<seg>))\<n>`. That takes the segment's earliest occurrence and never backtracks into it. Earliest-occurrence matching of the middle segments is exact for globs, and the last segment is anchored at `$`, so a match costs O(|glob| × |candidate|). Apply the same construction to the harness's `bun test -t` name pattern, with its group numbers offset per alternative.

## Boundaries & Constraints

**Always:** Same accepted and rejected strings as before for every glob. Boost's copy stays a mirror of `conformance/harness/select.ts`, checked by XT-boost-1's equivalence loop. Tests in Xaravel Test files only.

**Never:** Changing the glob grammar, capping glob length (unneeded once matching is linear), touching `conformance/expectations/**`, the spine, SPEC, PRD, `epics.md` or `AGENTS.md`, or removing or weakening any existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing grammar | globs and candidates in XT-conformance-108 and XT-boost-1 | same booleans as today | none |
| Pathological | `"*t".repeat(14) + "!"` vs a 90-char ID full of `t`; `"*a".repeat(200) + "b"` vs `"a".repeat(2000)` | `false`, well under one second | none |
| Equivalence | random globs over `{a,b,*,?}` vs random strings | the same as a reference DP matcher | none |
| `-t` pattern | `--id` with two globs that contain `*` | one valid regex whose backreferences point to each alternative's own groups | none |

</intent-contract>

## Code Map

- `conformance/harness/select.ts:37-52` -- `SYNTAX` and `globToRegExp`, the source of truth. Callers: `selectIds` (`:67`), `xaravel.ts:97` and `:114`.
- `conformance/harness/xaravel.ts:92-98` -- `xaravelNamePattern` joins each glob's `source.slice(1, -1)` into `^(?:…|…): `. Numbered backreferences must be renumbered per alternative.
- `tools/boost-framework/src/tools.ts:67-83` -- Boost's mirror (`GLOB_SYNTAX`, `globToRegExp`). The workspace cannot import from `conformance/`. Used at `:114`.
- `conformance/tests/xaravel/harness-select.test.ts:287-294` -- glob grammar assertions inside XT-conformance-108.
- `conformance/tests/xaravel/boost-framework.test.ts:470-476` -- XT-boost-1's mirror equivalence loop.

## Tasks & Acceptance

**Execution:**
- `conformance/harness/select.ts` -- add an exported `globSource(glob, firstGroup)` that returns `{ source, groups }`, using the atomic-segment construction, and rebuild `globToRegExp` on it. Update the header grammar note to say that matching is linear.
- `conformance/harness/xaravel.ts` -- build `xaravelNamePattern` from `globSource`, with a running group offset.
- `tools/boost-framework/src/tools.ts` -- mirror the same construction in `globToRegExp`.
- `conformance/tests/xaravel/harness-select.test.ts` -- in XT-conformance-108, add the pathological globs with a time bound, a seeded random equivalence check against a reference DP matcher, and a `xaravelNamePattern` check over two starred globs.
- `conformance/tests/xaravel/boost-framework.test.ts` -- in XT-boost-1, add the pathological glob to the equivalence loop, plus a time-bounded `inventoryGet` call with it.

**Acceptance Criteria:**
- Given the Boost server or the harness, when `inventory.get` or `--id` gets `"*t".repeat(14) + "!"`, then it returns within a second and matches nothing it did not match before.
- Given the full Xaravel suite, when `bun run harness --xaravel` and `bun test` run, then everything passes as before.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 11, false 1, maybe-false 0 (7 low rejected)
- findings:
  - `[low]` `[patch]` (blind) Random equivalence alphabet omits escapes and digits — widened globs to `ab1.\*?` and candidates to `ab1.\`.
  - `[low]` `[patch]` (blind) Boost mirror checked only on fixed pairs — XT-boost-1 now asserts identical `.source` over the list plus 300 seeded random globs.
  - `[medium]` `[patch]` (blind) `-t` renumbering test too small (two-digit backrefs, zero-group alternative) — grouped with the verification-gap offset finding; added `X*1*1` and a three-alternative case reaching `\13`.
  - `[low]` `[patch]` (blind) Wall-clock bounds include IO, compilation and selectIds — timers now cover only `.test` calls; Boost times the compiled glob over every real Inventory ID.
  - `[low]` `[patch]` (blind) Pathological `-t` pattern untimed — now timed under 1000 ms.
  - `[low]` `[patch]` (blind) "Linear" overstates an O(|glob|×|candidate|) bound — comments reworded.
  - `[low]` `[defer]` (blind) Unanchored `-t` pattern can match past `": "` into the description — pre-existing; judgeXaravel re-filters; recorded in `deferred`.
  - `[low]` `[reject]` (blind) Code Map line numbers stale — fix edits this build's spec.
  - `[low]` `[patch]` (blind) Construction exists twice with no shared contract — same root as the mirror finding; covered by the source-equality loop.
  - `[low]` `[patch]` (edge) Boost timer includes reading the 8 MB Inventory — same patch as the timer finding.
  - `[low]` `[patch]` (edge) XT-conformance-108 timer includes compilation and selectIds — same patch.
  - `[low]` `[reject]` (edge) `globSource(…, 0)` would emit `\0` — only callers pass 1 or a running count from 1; a guard adds a branch for an unreachable case.
  - `[medium]` `[patch]` (verification-gap) Dropping the per-alternative group offset passes every test — `X*1*1` rejects `X1: c`, and the three-alternative case; the implementer confirmed both negatives fail with the offset dropped.
  - `[low]` `[reject]` (verification-gap other) No automated `bun test -t` run with backreferences — ran `bun run harness --xaravel --id 'XT-*boost*-1'` (1 test selected, passed); an automated spawned run adds a fixture for an unlikely regression.
  - `[low]` `[reject]` (intent) No test through the stdio server — the server dispatches straight to `inventoryGet`, which is tested over the real Inventory.
  - `[low]` `[reject]` (intent) No CLI `--id` test with the pathological glob — XT-conformance-108 already runs the harness end to end with starred `--id` globs; `selectIds` is the CLI's only matcher.
  - `[low]` `[reject]` (intent) `-t` not exercised through Bun — duplicate of the verification-gap other finding; checked manually.
  - `[low]` `[patch]` (intent) Random alphabet limited — duplicate of the first row.
  - `[low]` `[reject]` (intent) Timing bound does not show scaling — the old code takes minutes on these inputs, so the bound catches any regression to backtracking.
  - `[false]` `[reject]` (intent) Spec file outside the allowed paths — `_bmad-output/implementation-artifacts/` is allowed by the MAINT ruling's second amendment.

## Auto Run Result

- **Summary:** `globToRegExp` in the harness and in Boost's mirror compiles every middle glob segment as an atomic lazy search, `(?=([\s\S]*?<seg>))(?:\n)`, so matching costs O(|glob|×|candidate|) with no exponential backtracking. The grammar is unchanged. `xaravelNamePattern` renumbers groups for each alternative of the `bun test -t` pattern.
- **Files:**
  - `conformance/harness/select.ts`: new `globSource`; `globToRegExp` is built on it.
  - `conformance/harness/xaravel.ts`: the `-t` pattern uses `globSource` with a running group offset.
  - `tools/boost-framework/src/tools.ts`: the mirror uses the same construction.
  - `conformance/tests/xaravel/harness-select.test.ts` (XT-conformance-108): pathological timings, a DP-reference random check and `-t` offset cases.
  - `conformance/tests/xaravel/boost-framework.test.ts` (XT-boost-1): mirror source equality, the pathological glob over the real Inventory.
- **Review:** 9 rows patched (2 medium, 7 low), 1 deferred (low, pre-existing), 9 low rejected and 1 false rejected, with reasons in the triage log.
- **Follow-up review recommended:** true. Two medium entries were patched, and the `-t` pattern with backreferences is checked through Bun only manually.
- **Verification:**
  - `bun run typecheck` and `bun run lint` are clean.
  - The two covering files pass with `bun test`.
  - `bun run harness --xaravel --id 'XT-boost-*'` runs 6 tests and `--id 'XT-*boost*-1'` runs 1; all pass.
  - `bun run harness --xaravel` passes 265 of 265.
- **Residual risks:**
  - The 1000 ms wall-clock bounds now time matching only; measured matching takes about 1 ms.
  - The speed depends on ECMAScript's rule that lookahead is never backtracked into, which was confirmed on Bun 1.4.3 only.

## Verification

**Commands:**
- `bun run typecheck` -- expected: clean
- `bun run lint` -- expected: clean
- `bun test conformance/tests/xaravel/harness-select.test.ts conformance/tests/xaravel/boost-framework.test.ts` -- expected: pass
- `bun run harness --xaravel --id 'XT-boost-*'` -- expected: the `-t` pattern is accepted and only XT-boost tests run
