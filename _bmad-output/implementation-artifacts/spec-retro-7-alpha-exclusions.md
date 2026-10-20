---
title: 'Count the alpha exclusions and correct the "one definition per number" docs (Epic 7 retro item 4)'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: '9d37cb7de8ea64d06dd4661082102fb7ff63e0ef'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Phase 1-8 not-ported-yet or blocked-by lines on non-alpha variants are neither in alpha.remaining nor block met; whether SM-1 none-remaining covers them is unruled.
    evidence: |-
      report.ts skips remaining counting for non-alpha lines (pre-existing since Story 7.1). This is the open question of epic-7-retro-item-7-sm1-none-remaining-ruling (owner Maintainer); noAlphaLine now makes the IDs visible but does not split them by kind.
    location: >-
      tools/conformance-report/report.ts:280
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The alpha gate silently drops Phase 1–8 Test IDs whose Expectations lines are all on non-alpha Variants (MySQL-, MariaDB-, SQL Server-, Beanstalkd-only; 294 IDs at the retro): they are in neither `alpha.applicable` nor `alpha.remaining`, and neither the docs nor `report.json` say so (retro S2). Separately, `report.ts:10-12`, `docs/ops/conformance-report.md:3`, `:96` and `site.ts:14` claim the dashboard and Boost never derive a number, but Boost's `conformance.rate` mirrors the bucket code, the site divides history records for the chart and sums `failKnown` across an Epic's Components (retro S4).

**Approach:** Add one field `alpha.noAlphaLine` to `report.json` counting those Test IDs, document it as outside the alpha denominator, and rewrite the four claims to say exactly what is computed where.

## Boundaries & Constraints

**Always:** `noAlphaLine` counts distinct Test IDs of a Component with package-table phase 1–8 that have at least one Expectations line and no line on any `ALPHA_VARIANTS` variant. It does not change `applicable`, `passing`, `rate`, `perVariant`, `remaining` or `met`. Key order in `alpha` is `applicable, passing, rate, target, variants, components, perVariant, remaining, noAlphaLine, met`. `schema` stays `1` (additive field). Keep Laravel/Xaravel naming conventions; `null` never `undefined`.

**Never:** Do not touch `packages/**`, `conformance/expectations/**`, `AGENTS.md`. Do not remove or weaken any existing assertion in XT-conformance-144; only extend it. Do not change Boost's mirror (it mirrors only buckets, not `alpha`) or the history record shape.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MIXED fixture | database `testC` only on `mysql` | `alpha.noAlphaLine` = 1 | No error |
| Non-alpha only, phase 1–8 | one line `D(testA)` on `mysql` | `noAlphaLine` 1, `applicable` 0 | No error |
| Alpha line that is not applicable | `S(testA)` `none` `php-only` | `noAlphaLine` 0 (it has an alpha line) | No error |
| Phase 9 Component | `L(testA)` on `mysql` only | `noAlphaLine` 0 | No error |
| ID on both alpha and non-alpha | `D(testA)` on `mysql` and `sqlite` | `noAlphaLine` 0 | No error |

</intent-contract>

## Code Map

- `tools/conformance-report/report.ts` -- `AlphaGate` interface (:64-74), alpha loop (:252-296); header comment :10-26 holds the false claim.
- `tools/conformance-report/site.ts` -- header :13-14 "nothing is recomputed"; `historySeries` divides at :128-129; `renderEpic` sums `failKnown` at :587; alpha paragraph :521.
- `tools/boost-framework/src/tools.ts` -- :190 "conformance.rate (mirrors tools/conformance-report/report.ts)" bucket mirror; does not compute alpha (:566). Read-only here.
- `conformance/tests/xaravel/boost-framework.test.ts:347-352` -- XT-boost-1 byte-equality of mirrored buckets vs `computeReport`. Read-only.
- `conformance/tests/xaravel/conformance-report.test.ts:245-305` -- XT-conformance-144; `Object.keys(alpha)` list at :247 and the full `toEqual` at :251.
- `tools/conformance-report/history.ts:246` -- `readReport` shape check; tolerant of extra keys.
- `docs/ops/conformance-report.md` -- :3, :35-41 schema, :67-72 alpha definitions, :96 site claim.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/report.ts` -- add `noAlphaLine: number` to `AlphaGate` after `remaining`; compute it from the lines (phase 1–8 Components, Test IDs with no alpha-variant line); correct header :10-12 and document the field in the alpha bullet -- S2, S4.
- `tools/conformance-report/site.ts` -- correct header :14 to name the two derivations (history chart ratio, Epic `failKnown` sum); show `noAlphaLine` in the alpha paragraph as Test IDs outside the alpha denominator -- S4, S2 visibility.
- `docs/ops/conformance-report.md` -- rewrite :3 and :96 (Boost mirrors the buckets under XT-boost-1's equivalence test; the site divides history records for the chart and sums fail-known across an Epic's Components); add `noAlphaLine` to the schema and an alpha-definition bullet saying those IDs are outside the alpha denominator and why; mention the site figure.
- `conformance/tests/xaravel/conformance-report.test.ts` -- extend XT-conformance-144 with the key list, `noAlphaLine: 1` in the MIXED `toEqual`, and the matrix cases; assert `real.noAlphaLine` is a non-negative integer.
- `conformance/tests/xaravel/dashboard.test.ts` -- if it asserts the alpha paragraph text exactly, extend it for the new figure.

**Acceptance Criteria:**
- Given the real repository, when `bun run conformance:report` runs, then `report.json` has `alpha.noAlphaLine` equal to the number of phase 1–8 Test IDs with lines but none on an alpha variant, and all other alpha fields are unchanged.
- Given the docs and header comments, when read, then none claims Boost reads `report.json` or that the site never derives a number; each names the mirror and XT-boost-1, and the two site derivations.
- Given the dashboard index, when rendered, then the alpha paragraph shows the `noAlphaLine` count.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 16 findings — high 0, medium 2, low 12, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) No test proves noAlphaLine counts distinct IDs, not lines — added a mysql+mariadb single-ID case expecting 1.
  - `[low]` `[patch]` (verification-gap) Dashboard assertion used a 0 value indistinguishable from other alpha zeros — XT-conformance-146 now renders a report with noAlphaLine 7 and asserts the literal.
  - `[low]` `[reject]` (edge-case) A stale pre-change report.json renders "undefined" — the dashboard workflow regenerates report.json in the same run; fixing it means a new shape guard for a case not met in practice.
  - `[low]` `[patch]` (blind) Real-repo assertion `>= 0` passes when always 0 — now asserts an integer > 0 (294 today).
  - `[medium]` `[defer]` (blind) Non-alpha not-ported-yet/blocked-by lines neither count in remaining nor block met — pre-existing Story 7.1 behaviour and the subject of Maintainer item epic-7-retro-item-7; deferred.
  - `[low]` `[reject]` (blind) Stale report.json renders "undefined" — duplicate of the edge-case finding; same reason.
  - `[low]` `[patch]` (blind) report.ts header names only the overall chart ratio — now names overall passing/pairs and alpha passing/applicable.
  - `[false]` `[reject]` (blind) Hardcoded variant list in prose will drift — the prose defines the set by ALPHA_VARIANTS and names mysql/mariadb/sqlsrv/beanstalkd only as the current examples, which are accurate.
  - `[low]` `[reject]` (blind) Count not in the CLI summary line or history records — the intent asks for report.json only; no consumer reads either for it.
  - `[low]` `[reject]` (blind) No per-Component breakdown — enhancement beyond the intent; the scalar meets S2.
  - `[false]` `[reject]` (blind) php-only alpha line plus non-alpha line is in neither figure — correct by definition: it has an alpha line (not noAlphaLine) and its alpha line is not applicable, which reasons.php-only already shows.
  - `[low]` `[reject]` (blind) Spec verification section imprecise — fix edits this build's spec.
  - `[low]` `[reject]` (blind) Matrix and tests not one-to-one — fix edits this build's spec.
  - `[low]` `[patch]` (intent) "Every figure on the index comes from report.json" is imprecise because the chart is on the index — docs and site.ts header now say every figure except the two named derivations.
  - `[low]` `[patch]` (intent) report.ts header omits the alpha chart ratio — same fix as the blind finding above.
  - `[low]` `[reject]` (intent) Code Map cites site.ts:587, the sum is at :590 — fix edits this build's spec.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/conformance-report.test.ts conformance/tests/xaravel/dashboard.test.ts conformance/tests/xaravel/boost-framework.test.ts` -- expected: all pass
- `bunx tsc --noEmit -p .` (or the repo's `typecheck` script) -- expected: no errors
- `bun run lint` -- expected: no errors
- `bun run conformance:report` -- expected: prints the summary; `jq .alpha.noAlphaLine` near 294

## Auto Run Result

Status: done

- **Change:** `report.json` gains `alpha.noAlphaLine` (294 on the real repository): phase 1–8 Test IDs with Expectations lines but none on an alpha Variant, outside the alpha denominator. The dashboard's alpha paragraph shows it. The "never derives a number" claims in `report.ts`, `site.ts` and `docs/ops/conformance-report.md` now name Boost's bucket mirror under XT-boost-1 and the site's two derivations (history chart ratios, Epic fail-known sum).
- **Files:** `tools/conformance-report/report.ts` (field, headers); `tools/conformance-report/site.ts` (header, alpha paragraph); `docs/ops/conformance-report.md` (intro, schema, definition, site); `conformance/tests/xaravel/conformance-report.test.ts` (XT-conformance-144 extended); `conformance/tests/xaravel/dashboard.test.ts` (XT-conformance-146 extended).
- **Review:** 6 patched rows (1 medium, 5 low), 1 deferred (SM-1 remaining on non-alpha lines, Maintainer item 7), 9 rejected with reasons in the triage log.
- **Follow-up review:** false (no high patched; one medium patched).
- **Verification:** `bun test` on the three spec test files: 12 pass, 0 fail. `bun run typecheck` and `bun run lint` clean. `bun run conformance:report`: alpha 0/18395, `noAlphaLine` 294; other report fields byte-identical to baseline.
- **Residual risk:** a report.json produced before this change renders `undefined` in the alpha paragraph; CI always regenerates it.
